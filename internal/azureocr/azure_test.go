package azureocr_test

import (
	"bytes"
	"context"
	"embed"
	"errors"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"testing/synctest"
	"time"

	"github.com/BasuruK/goldfin/internal/azureocr"
)

const credential = "synthetic-ocr-Credential" // #nosec G101 -- Public synthetic test Credential, with no provider access.
const baseURL = "https://ocr.example.test"
const operationURL = baseURL + "/documentintelligence/documentModels/prebuilt-read/analyzeResults/fixture?api-version=2024-11-30"
const docxMIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

//go:embed testdata/*
var fixtures embed.FS

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func fixture(t *testing.T, name string) []byte {
	t.Helper()
	body, err := fixtures.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatal(err)
	}
	return body
}

func TestExtractProviderFailuresHaveNoExtraction(t *testing.T) {
	for _, body := range []string{
		`not JSON`, `{"status":"succeeded"} {}`, `null`, `[]`, `{}`, `{"status":null}`,
		`{"status":"failed","error":{"message":"` + credential + `"}}`, `{"status":"canceled"}`,
		`{"status":"unknown"}`, `{"status":"succeeded"}`, `{"status":"succeeded","analyzeResult":null}`,
		`{"status":"succeeded","analyzeResult":{"pages":[]}}`,
		`{"status":"succeeded","analyzeResult":{"content":null,"pages":[]}}`,
		`{"status":"succeeded","analyzeResult":{"content":3,"pages":[]}}`,
		`{"status":"succeeded","analyzeResult":{"content":"partial"}}`,
		`{"status":"succeeded","analyzeResult":{"content":"partial","pages":null}}`,
		`{"status":"succeeded","analyzeResult":{"content":"partial","pages":{}}}`,
		`{"status":"succeeded","analyzeResult":{"content":"reflected ` + credential + `","pages":[]}}`,
	} {
		t.Run(body, func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				executor := azureocr.New(roundTripFunc(func(r *http.Request) (*http.Response, error) {
					if r.Method == http.MethodPost {
						res := response(http.StatusAccepted, nil)
						res.Header.Set("Operation-Location", operationURL)
						return res, nil
					}
					return response(http.StatusOK, []byte(body)), nil
				}))
				ctx, cancel := context.WithTimeout(t.Context(), 3*time.Second)
				defer cancel()
				got, err := executor.Extract(ctx, config(), azureocr.Document{Bytes: []byte("document"), MIMEType: "application/pdf"})
				if err == nil || errors.Is(err, context.DeadlineExceeded) || got != (azureocr.Extraction{}) || strings.Contains(err.Error(), credential) {
					t.Fatalf("invalid provider response did not fail immediately and safely: %v", err)
				}
			})
		})
	}
}

func TestExtractHonorsRetryAfter(t *testing.T) {
	for _, tc := range []struct {
		value string
		wait  time.Duration
	}{{"7", 7 * time.Second}, {"0", 2 * time.Second}, {"-1", 2 * time.Second}, {"2seconds", 2 * time.Second},
		{"1.5", 2 * time.Second}, {"Wed, 21 Oct 2015 07:28:00 GMT", 2 * time.Second}, {"9223372036854775807", 5 * time.Minute},
		{"999999999999999999999999", 5 * time.Minute}} {
		t.Run(tc.value, func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				start := time.Now()
				calls := 0
				executor := azureocr.New(roundTripFunc(func(r *http.Request) (*http.Response, error) {
					calls++
					if r.Method == http.MethodPost {
						res := response(http.StatusAccepted, nil)
						res.Header.Set("Operation-Location", operationURL)
						return res, nil
					}
					if calls == 2 {
						res := response(http.StatusOK, []byte(`{"status":"notStarted"}`))
						res.Header.Set("Retry-After", tc.value)
						return res, nil
					}
					return response(http.StatusOK, []byte(`{"status":"succeeded","analyzeResult":{"content":"","pages":[]}}`)), nil
				}))
				ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
				defer cancel()
				got, err := executor.Extract(ctx, config(), azureocr.Document{Bytes: []byte("document"), MIMEType: "application/pdf"})
				if tc.wait > 10*time.Second {
					if !errors.Is(err, context.DeadlineExceeded) || time.Since(start) != 10*time.Second || calls != 2 {
						t.Fatal("large Retry-After did not wait until the caller's deadline")
					}
				} else if err != nil || got != (azureocr.Extraction{}) || time.Since(start) != 2*time.Second+tc.wait {
					t.Fatalf("unexpected Retry-After wait: %v, %v", time.Since(start), err)
				}
			})
		})
	}
}

func TestExtractBoundsProcessingBudget(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		start := time.Now()
		calls := 0
		executor := azureocr.New(roundTripFunc(func(r *http.Request) (*http.Response, error) {
			calls++
			if calls > 155 {
				return nil, errors.New("processing budget was not enforced")
			}
			if r.Method == http.MethodPost {
				res := response(http.StatusAccepted, nil)
				res.Header.Set("Operation-Location", operationURL)
				return res, nil
			}
			return response(http.StatusOK, []byte(`{"status":"running"}`)), nil
		}))
		got, err := executor.Extract(t.Context(), config(), azureocr.Document{Bytes: []byte("document"), MIMEType: "application/pdf"})
		if !errors.Is(err, context.DeadlineExceeded) || got != (azureocr.Extraction{}) || time.Since(start) != 5*time.Minute {
			t.Fatalf("processing did not stop at five minutes: %v, %v", time.Since(start), err)
		}
	})
}

func TestExtractCancellationAndTimeoutInterruptWork(t *testing.T) {
	for _, phase := range []string{"submit", "wait", "poll", "late submit", "late poll"} {
		for _, timeout := range []bool{false, true} {
			t.Run(phase+"/timeout="+strings.ToLower(strconv.FormatBool(timeout)), func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					defer cancel()
					if timeout {
						var stop context.CancelFunc
						budget := 3 * time.Second
						if phase == "wait" {
							budget = time.Second
						}
						ctx, stop = context.WithTimeout(ctx, budget)
						defer stop()
					}
					calls := 0
					executor := azureocr.New(roundTripFunc(func(r *http.Request) (*http.Response, error) {
						calls++
						if phase == "wait" && r.Method == http.MethodPost {
							go func() {
								time.Sleep(time.Second)
								if !timeout {
									cancel()
								}
							}()
						} else if (strings.Contains(phase, "submit") && r.Method == http.MethodPost) ||
							(strings.Contains(phase, "poll") && r.Method == http.MethodGet) {
							if !timeout {
								cancel()
							}
							<-r.Context().Done()
							if !strings.HasPrefix(phase, "late") {
								return nil, errors.New("transport reflected " + credential)
							}
						}
						if r.Method == http.MethodPost {
							res := response(http.StatusAccepted, nil)
							res.Header.Set("Operation-Location", operationURL)
							return res, nil
						}
						return response(http.StatusOK, []byte(`{"status":"succeeded","analyzeResult":{"content":"late","pages":[]}}`)), nil
					}))
					got, err := executor.Extract(ctx, config(), azureocr.Document{Bytes: []byte("document"), MIMEType: "application/pdf"})
					want := context.Canceled
					if timeout {
						want = context.DeadlineExceeded
					}
					if !errors.Is(err, want) || got != (azureocr.Extraction{}) || (phase == "wait" && !timeout && calls != 1) {
						t.Fatalf("cancelled operation produced an Extraction or the wrong safe failure: %v", err)
					}
				})
			})
		}
	}
}

func TestExtractBoundsAndClosesResponseBodies(t *testing.T) {
	const limit = 8 << 20
	for _, phase := range []string{"submit", "poll"} {
		for _, extra := range []int{0, 1} {
			t.Run(phase+"/extra="+strconv.Itoa(extra), func(t *testing.T) {
				body := []byte(`{"status":"succeeded","analyzeResult":{"content":"exact","pages":[]}}`)
				body = append(body, bytes.Repeat([]byte(" "), limit-len(body)+extra)...)
				synctest.Test(t, func(t *testing.T) {
					var bodies []*trackedBody
					executor := azureocr.New(roundTripFunc(func(r *http.Request) (*http.Response, error) {
						res := response(http.StatusOK, []byte(`{"status":"succeeded","analyzeResult":{"content":"exact","pages":[]}}`))
						if r.Method == http.MethodPost {
							res.StatusCode = http.StatusAccepted
							res.Header.Set("Operation-Location", operationURL)
						}
						if (phase == "submit" && r.Method == http.MethodPost) || (phase == "poll" && r.Method == http.MethodGet) {
							res.Body = io.NopCloser(bytes.NewReader(body))
						}
						tracked := &trackedBody{ReadCloser: res.Body}
						res.Body = tracked
						bodies = append(bodies, tracked)
						return res, nil
					}))
					got, err := executor.Extract(t.Context(), config(), azureocr.Document{Bytes: []byte("document"), MIMEType: "application/pdf"})
					if extra == 1 {
						if err == nil || err.Error() != "OCR response exceeded the size limit" || got != (azureocr.Extraction{}) {
							t.Fatal("oversized response did not return the fixed size failure without an Extraction")
						}
					} else if err != nil || got.Content != "exact" {
						t.Fatalf("response exactly at the limit was rejected: %v", err)
					}
					for _, body := range bodies {
						if !body.closed || body.read > limit+1 {
							t.Fatal("response body was not closed or read beyond its limit")
						}
					}
				})
			})
		}
	}
}

type trackedBody struct {
	io.ReadCloser
	closed bool
	read   int
}

func (b *trackedBody) Read(p []byte) (int, error) {
	n, err := b.ReadCloser.Read(p)
	b.read += n
	return n, err
}

func (b *trackedBody) Close() error {
	b.closed = true
	return b.ReadCloser.Close()
}

func TestExtractHTTPAndTransportFailuresAreSafe(t *testing.T) {
	for _, phase := range []string{"submit", "poll"} {
		for _, failure := range []string{"HTTP 200", "HTTP 202", "HTTP 302", "HTTP 307", "HTTP 401", "HTTP 429", "HTTP 500", "transport", "read", "timeout", "read timeout"} {
			if (phase == "submit" && failure == "HTTP 202") || (phase == "poll" && failure == "HTTP 200") {
				continue
			}
			t.Run(phase+"/"+failure, func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					start := time.Now()
					calls := 0
					var bodies []*trackedBody
					executor := azureocr.New(roundTripFunc(func(r *http.Request) (*http.Response, error) {
						calls++
						res := response(http.StatusAccepted, nil)
						res.Header.Set("Operation-Location", operationURL)
						if phase == "submit" || r.Method == http.MethodGet {
							switch failure {
							case "transport":
								return nil, errors.New("request to " + baseURL + "?key=" + credential)
							case "timeout":
								<-r.Context().Done()
								return nil, r.Context().Err()
							case "read", "read timeout":
								res.Body = io.NopCloser(readerFunc(func([]byte) (int, error) {
									if failure == "read timeout" {
										<-r.Context().Done()
										return 0, r.Context().Err()
									}
									return 0, errors.New("body reflected " + credential)
								}))
							default:
								status, err := strconv.Atoi(strings.TrimPrefix(failure, "HTTP "))
								if err != nil {
									t.Fatal(err)
								}
								res.StatusCode = status
								res.Header.Set("Location", "http://other.example.test/redirect")
								res.Body = io.NopCloser(strings.NewReader(credential))
							}
						}
						tracked := &trackedBody{ReadCloser: res.Body}
						res.Body = tracked
						bodies = append(bodies, tracked)
						return res, nil
					}))
					got, err := executor.Extract(t.Context(), config(), azureocr.Document{Bytes: []byte("document"), MIMEType: "application/pdf"})
					wantCalls := 1
					if phase == "poll" {
						wantCalls = 2
					}
					if err == nil || got != (azureocr.Extraction{}) || calls != wantCalls || strings.Contains(err.Error(), credential) || strings.Contains(err.Error(), baseURL) {
						t.Fatal("failure leaked detail, retried, followed a redirect or returned an Extraction")
					}
					if strings.Contains(failure, "timeout") {
						wantElapsed := 30 * time.Second
						if phase == "poll" {
							wantElapsed += 2 * time.Second
						}
						if !errors.Is(err, context.DeadlineExceeded) || time.Since(start) != wantElapsed {
							t.Fatalf("request timeout was not enforced: %v, %v", time.Since(start), err)
						}
					}
					for _, body := range bodies {
						if !body.closed {
							t.Error("response body was not closed")
						}
					}
				})
			})
		}
	}
}

type readerFunc func([]byte) (int, error)

func (f readerFunc) Read(p []byte) (int, error) { return f(p) }

func TestExtractSubmitsSupportedDocumentsUnchanged(t *testing.T) {
	var pngBytes, jpegBytes bytes.Buffer
	img := image.NewGray(image.Rect(0, 0, 2, 2))
	if err := png.Encode(&pngBytes, img); err != nil {
		t.Fatal(err)
	}
	if err := jpeg.Encode(&jpegBytes, img, nil); err != nil {
		t.Fatal(err)
	}
	for _, document := range []azureocr.Document{
		{Bytes: pngBytes.Bytes(), MIMEType: "image/png"},
		{Bytes: jpegBytes.Bytes(), MIMEType: "image/jpeg"},
		{Bytes: fixture(t, "blank.pdf"), MIMEType: "application/pdf"},
		{Bytes: fixture(t, "invoice.docx"), MIMEType: docxMIME},
	} {
		t.Run(document.MIMEType, func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				settings := config()
				settings.BaseURL += ":00443/resource/?region=test"
				settings.APIVersion = "configured-version"
				executor := azureocr.New(roundTripFunc(func(r *http.Request) (*http.Response, error) {
					if r.Method == http.MethodPost {
						body, err := io.ReadAll(r.Body)
						if err != nil {
							t.Fatal(err)
						}
						if !bytes.Equal(body, document.Bytes) || r.Header.Get("Content-Type") != document.MIMEType ||
							r.URL.Path != "/resource/documentintelligence/documentModels/prebuilt-read:analyze" ||
							r.URL.Query().Get("api-version") != "configured-version" || r.URL.Query().Get("region") != "test" {
							t.Error("request changed the Document, MIME type, resource path or configured version/query")
						}
						res := response(http.StatusAccepted, nil)
						res.Header.Set("Operation-Location", "https://OCR.example.test:443/operations/1")
						return res, nil
					}
					return response(http.StatusOK, []byte(`{"status":"succeeded","analyzeResult":{"content":"  unchanged\n","pages":[{}]}}`)), nil
				}))
				got, err := executor.Extract(t.Context(), settings, document)
				if err != nil || got.Content != "  unchanged\n" || got.Pages != 1 {
					t.Fatalf("supported Document was not extracted unchanged: %v", err)
				}
			})
		})
	}
}

func TestExtractInvocationsRemainIndependent(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		executor := azureocr.New(roundTripFunc(func(r *http.Request) (*http.Response, error) {
			id := strings.TrimPrefix(r.URL.Path, "/operations/")
			if r.Method == http.MethodPost {
				body, err := io.ReadAll(r.Body)
				if err != nil {
					return nil, err
				}
				id = string(body)
				res := response(http.StatusAccepted, nil)
				res.Header.Set("Operation-Location", baseURL+"/operations/"+id)
				if r.Header.Get("Ocp-Apim-Subscription-Key") != credential+id {
					t.Error("invocations mixed Credentials")
				}
				return res, nil
			}
			if r.Header.Get("Ocp-Apim-Subscription-Key") != credential+id {
				t.Error("poll used another invocation's Credential")
			}
			return response(http.StatusOK, []byte(`{"status":"succeeded","analyzeResult":{"content":"`+id+`","pages":[]}}`)), nil
		}))
		type completion struct {
			extraction azureocr.Extraction
			err        error
		}
		done := make(chan completion, 2)
		for _, id := range []string{"first", "second"} {
			go func() {
				settings := config()
				settings.Credential += id
				extraction, err := executor.Extract(t.Context(), settings, azureocr.Document{Bytes: []byte(id), MIMEType: "application/pdf"})
				done <- completion{extraction, err}
			}()
		}
		seen := make(map[string]bool)
		for range 2 {
			result := <-done
			if result.err != nil {
				t.Fatal(result.err)
			}
			seen[result.extraction.Content] = true
		}
		if !seen["first"] || !seen["second"] {
			t.Fatal("invocations mixed Extractions")
		}
	})
}

func TestExtractRejectsInvalidInputsBeforeSending(t *testing.T) {
	for _, value := range []string{
		"http://ocr.example.test", "https://user:pass@ocr.example.test", "https://ocr.example.test/#fragment",
		"/relative", "https://ocr.example.test:0", "https://ocr.example.test:65536", "https://ocr.example.test/?bad=%zz",
		"https://ocr.example.test/" + credential, "https://ocr.example.test/?other=" + credential,
		"https://" + credential + ".example.test", "https://ocr.example.test/%73ynthetic-ocr-Credential",
	} {
		t.Run(value, func(t *testing.T) {
			settings := config()
			settings.BaseURL = value
			assertRejectedInput(t, settings, azureocr.Document{Bytes: []byte("document"), MIMEType: "application/pdf"})
		})
	}
	for _, key := range []string{"api_key", "TOKEN", "access_token", "sig", "key", "subscription-key", "X-Amz-Signature"} {
		t.Run(key, func(t *testing.T) {
			settings := config()
			settings.BaseURL += "/?" + key + "=value"
			assertRejectedInput(t, settings, azureocr.Document{Bytes: []byte("document"), MIMEType: "application/pdf"})
		})
	}
	for _, settings := range []azureocr.Config{
		{BaseURL: baseURL, APIVersion: "2024-11-30"},
		{BaseURL: baseURL, APIVersion: "2024-11-30", Credential: "bad\r\nheader"},
		{BaseURL: baseURL, Credential: credential},
		{BaseURL: baseURL, APIVersion: credential, Credential: credential},
	} {
		assertRejectedInput(t, settings, azureocr.Document{Bytes: []byte("document"), MIMEType: "application/pdf"})
	}
	for _, document := range []azureocr.Document{
		{MIMEType: "application/pdf"},
		{Bytes: []byte("document"), MIMEType: "text/plain"},
	} {
		assertRejectedInput(t, config(), document)
	}
}

func assertRejectedInput(t *testing.T, settings azureocr.Config, document azureocr.Document) {
	t.Helper()
	executor := azureocr.New(roundTripFunc(func(*http.Request) (*http.Response, error) {
		t.Error("invalid input reached the provider")
		return nil, errors.New("invalid input")
	}))
	got, err := executor.Extract(t.Context(), settings, document)
	if err == nil || got != (azureocr.Extraction{}) || strings.Contains(err.Error(), credential) {
		t.Fatal("invalid input did not return a safe failure without an Extraction")
	}
}

func response(status int, body []byte) *http.Response {
	return &http.Response{StatusCode: status, Header: make(http.Header), Body: io.NopCloser(bytes.NewReader(body))}
}

func config() azureocr.Config {
	return azureocr.Config{BaseURL: baseURL, APIVersion: "2024-11-30", Credential: credential}
}

func TestExtractRecordedDocument(t *testing.T) {
	document := fixture(t, "invoice.docx")
	running := fixture(t, "running.json")
	succeeded := fixture(t, "succeeded.json")
	want := string(fixture(t, "content.txt"))
	synctest.Test(t, func(t *testing.T) {
		start := time.Now()
		calls := 0
		executor := azureocr.New(roundTripFunc(func(r *http.Request) (*http.Response, error) {
			calls++
			if r.Header.Get("Ocp-Apim-Subscription-Key") != credential || r.Header.Get("Authorization") != "" {
				t.Error("request did not use only the Azure Credential header")
			}
			if calls == 1 {
				body, err := io.ReadAll(r.Body)
				if err != nil {
					t.Fatal(err)
				}
				if r.Method != http.MethodPost || r.URL.String() != baseURL+"/documentintelligence/documentModels/prebuilt-read:analyze?api-version=2024-11-30" ||
					r.Header.Get("Content-Type") != docxMIME || !bytes.Equal(body, document) {
					t.Error("analyze request changed the method, URL, MIME type or Document bytes")
				}
				res := response(http.StatusAccepted, nil)
				res.Header.Set("Operation-Location", operationURL)
				return res, nil
			}
			if r.Method != http.MethodGet || r.URL.String() != operationURL {
				t.Error("poll did not GET the Operation-Location")
			}
			if calls == 2 {
				if time.Since(start) != 2*time.Second {
					t.Error("first poll did not wait two seconds")
				}
				res := response(http.StatusOK, running)
				res.Header.Set("Retry-After", "1")
				return res, nil
			}
			if calls != 3 || time.Since(start) != 4*time.Second {
				t.Error("subsequent poll did not respect the two-second minimum")
			}
			return response(http.StatusOK, succeeded), nil
		}))
		got, err := executor.Extract(t.Context(), config(), azureocr.Document{Bytes: document, MIMEType: docxMIME})
		if err != nil || got.Content != want || got.Pages != 2 || calls != 3 {
			t.Fatalf("recorded Document did not produce its exact two-page Extraction: %v", err)
		}
	})
}

func TestExtractRejectsUnsafeOperationLocations(t *testing.T) {
	locations := []string{"", "/relative", "http://ocr.example.test/operations/1", "https://other.example.test/operations/1",
		"https://ocr.example.test:444/operations/1", "https://user:pass@ocr.example.test/operations/1",
		operationURL + "#fragment", operationURL + "&other=" + credential,
		baseURL + "/operations/" + credential, baseURL + "/operations/1?bad=%zz"}
	for _, key := range []string{"api_key", "TOKEN", "access_token", "sig", "key", "subscription-key", "X-Amz-Signature"} {
		locations = append(locations, operationURL+"&"+key+"=value")
	}
	for _, location := range locations {
		t.Run(location, func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				calls := 0
				executor := azureocr.New(roundTripFunc(func(*http.Request) (*http.Response, error) {
					calls++
					if calls != 1 {
						t.Error("Credential was sent to an unsafe Operation-Location")
						return nil, errors.New("unsafe Operation-Location")
					}
					res := response(http.StatusAccepted, nil)
					res.Header.Set("Operation-Location", location)
					return res, nil
				}))
				got, err := executor.Extract(t.Context(), config(), azureocr.Document{Bytes: []byte("document"), MIMEType: "application/pdf"})
				if err == nil || got != (azureocr.Extraction{}) || calls != 1 || strings.Contains(err.Error(), credential) {
					t.Fatal("unsafe Operation-Location did not fail safely before polling")
				}
			})
		})
	}
}
