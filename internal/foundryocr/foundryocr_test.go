package foundryocr_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"testing"

	"github.com/BasuruK/goldfin/internal/azureocr"
	"github.com/BasuruK/goldfin/internal/foundryocr"
)

const credential = "synthetic-foundry-Credential" // #nosec G101 -- Public synthetic test Credential, with no provider access.
const baseURL = "https://foundry.example.test"
const model = "mistral-ocr-deployment"
const sentinelBody = "SENTINEL_PROVIDER_DETAIL_DO_NOT_LEAK"

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func response(status int, body []byte) *http.Response {
	return &http.Response{StatusCode: status, Header: make(http.Header), Body: io.NopCloser(bytes.NewReader(body))}
}

func config() foundryocr.Config {
	return foundryocr.Config{BaseURL: baseURL, Model: model, Credential: credential}
}

func TestExtractPostsToMistralOCRWithBearerAuthAndModel(t *testing.T) {
	document := []byte("pdf-bytes")
	executor := foundryocr.New(roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.Method != http.MethodPost {
			t.Errorf("method: %s", r.Method)
		}
		if r.URL.Path != "/providers/mistral/azure/ocr" {
			t.Errorf("path: %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer "+credential {
			t.Error("Authorization header")
		}
		if r.Header.Get("Content-Type") != "application/json" {
			t.Error("Content-Type")
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatal(err)
		}
		var payload struct {
			Model    string `json:"model"`
			Document struct {
				Type        string `json:"type"`
				DocumentURL string `json:"document_url"`
			} `json:"document"`
		}
		if json.Unmarshal(body, &payload) != nil {
			t.Fatal("request body JSON")
		}
		if payload.Model != model {
			t.Errorf("model: %q", payload.Model)
		}
		wantURL := "data:application/pdf;base64," + base64.StdEncoding.EncodeToString(document)
		if payload.Document.Type != "document_url" || payload.Document.DocumentURL != wantURL {
			t.Errorf("document: type=%q url=%q", payload.Document.Type, payload.Document.DocumentURL)
		}
		return response(http.StatusOK, []byte(`{"pages":[{"markdown":"page one"}]}`)), nil
	}))
	got, err := executor.Extract(t.Context(), config(), foundryocr.Document{Bytes: document, MIMEType: azureocr.PDFMIME})
	if err != nil || got.Content != "page one" || got.Pages != 1 {
		t.Fatalf("Extract: %v, %+v", err, got)
	}
}

func TestExtractSendsImageURLTypeForJPEGAndPNG(t *testing.T) {
	for _, tc := range []struct {
		mime string
		typ  string
	}{
		{azureocr.JPEGMIME, "image_url"},
		{azureocr.PNGMIME, "image_url"},
		{azureocr.PDFMIME, "document_url"},
		{azureocr.DOCXMIME, "document_url"},
	} {
		t.Run(tc.mime, func(t *testing.T) {
			document := []byte("bytes-for-" + tc.mime)
			executor := foundryocr.New(roundTripFunc(func(r *http.Request) (*http.Response, error) {
				body, err := io.ReadAll(r.Body)
				if err != nil {
					t.Fatal(err)
				}
				var payload struct {
					Document struct {
						Type        string `json:"type"`
						DocumentURL string `json:"document_url"`
					} `json:"document"`
				}
				if json.Unmarshal(body, &payload) != nil {
					t.Fatal(err)
				}
				if payload.Document.Type != tc.typ {
					t.Errorf("type: %q", payload.Document.Type)
				}
				want := "data:" + tc.mime + ";base64," + base64.StdEncoding.EncodeToString(document)
				if payload.Document.DocumentURL != want {
					t.Errorf("document_url: %q", payload.Document.DocumentURL)
				}
				return response(http.StatusOK, []byte(`{"pages":[]}`)), nil
			}))
			if _, err := executor.Extract(t.Context(), config(), foundryocr.Document{Bytes: document, MIMEType: tc.mime}); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestExtractJoinsMultiPageMarkdownWithBlankLine(t *testing.T) {
	body := `{"pages":[{"markdown":"first"},{"markdown":"second"},{"markdown":"third"}]}`
	executor := foundryocr.New(roundTripFunc(func(*http.Request) (*http.Response, error) {
		return response(http.StatusOK, []byte(body)), nil
	}))
	got, err := executor.Extract(t.Context(), config(), foundryocr.Document{Bytes: []byte("doc"), MIMEType: azureocr.PDFMIME})
	if err != nil || got.Content != "first\n\nsecond\n\nthird" || got.Pages != 3 {
		t.Fatalf("Extract: %v, %+v", err, got)
	}
}

func TestExtractAcceptsEmptyPagesAsSuccess(t *testing.T) {
	executor := foundryocr.New(roundTripFunc(func(*http.Request) (*http.Response, error) {
		return response(http.StatusOK, []byte(`{"pages":[]}`)), nil
	}))
	got, err := executor.Extract(t.Context(), config(), foundryocr.Document{Bytes: []byte("doc"), MIMEType: azureocr.PDFMIME})
	if err != nil || got != (foundryocr.Extraction{}) {
		t.Fatalf("Extract: %v, %+v", err, got)
	}
}

func TestExtractProviderMalformedResponsesFailWithoutExtraction(t *testing.T) {
	for _, body := range []string{
		`not JSON`, `null`, `[]`, `{}`, `{"pages":null}`, `{"pages":{}}`,
		`{"pages":[{"markdown":1}]}`, `{"pages":[{"markdown":null}]}`,
		`{"pages":[{"markdown":"ok"},null]}`, `{"pages":["string"]}`,
	} {
		t.Run(body, func(t *testing.T) {
			executor := foundryocr.New(roundTripFunc(func(*http.Request) (*http.Response, error) {
				return response(http.StatusOK, []byte(body)), nil
			}))
			got, err := executor.Extract(t.Context(), config(), foundryocr.Document{Bytes: []byte("doc"), MIMEType: azureocr.PDFMIME})
			if err == nil || got != (foundryocr.Extraction{}) || strings.Contains(err.Error(), credential) {
				t.Fatalf("malformed response did not fail safely: %v", err)
			}
		})
	}
}

func TestExtractRejectsContentContainingCredential(t *testing.T) {
	body := `{"pages":[{"markdown":"reflected ` + credential + `"}]}`
	executor := foundryocr.New(roundTripFunc(func(*http.Request) (*http.Response, error) {
		return response(http.StatusOK, []byte(body)), nil
	}))
	got, err := executor.Extract(t.Context(), config(), foundryocr.Document{Bytes: []byte("doc"), MIMEType: azureocr.PDFMIME})
	if err == nil || got != (foundryocr.Extraction{}) || strings.Contains(err.Error(), credential) {
		t.Fatalf("credential in content did not fail safely: %v", err)
	}
}

func TestExtractNon200ReturnsFixedErrorWithoutProviderBody(t *testing.T) {
	for _, status := range []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusInternalServerError} {
		t.Run(strconv.Itoa(status), func(t *testing.T) {
			executor := foundryocr.New(roundTripFunc(func(*http.Request) (*http.Response, error) {
				return response(status, []byte(`{"error":"`+sentinelBody+`"}`)), nil
			}))
			got, err := executor.Extract(t.Context(), config(), foundryocr.Document{Bytes: []byte("doc"), MIMEType: azureocr.PDFMIME})
			if err == nil || got != (foundryocr.Extraction{}) || strings.Contains(err.Error(), sentinelBody) || strings.Contains(err.Error(), credential) {
				t.Fatalf("non-200 did not fail safely: %v", err)
			}
		})
	}
}

func TestExtractInvalidConfigFailsBeforeAnyRequest(t *testing.T) {
	calls := 0
	executor := foundryocr.New(roundTripFunc(func(*http.Request) (*http.Response, error) {
		calls++
		return nil, errors.New("transport")
	}))
	for _, settings := range []foundryocr.Config{
		{BaseURL: "http://foundry.example.test", Model: model, Credential: credential},
		{BaseURL: baseURL, Model: "", Credential: credential},
		{BaseURL: baseURL, Model: model, Credential: ""},
		{BaseURL: baseURL, Model: model, Credential: "bad\r\nheader"},
	} {
		_, err := executor.Extract(t.Context(), settings, foundryocr.Document{Bytes: []byte("doc"), MIMEType: azureocr.PDFMIME})
		if !errors.Is(err, foundryocr.ErrInvalidInput) {
			t.Fatalf("settings %+v: %v", settings, err)
		}
	}
	for _, document := range []foundryocr.Document{
		{MIMEType: azureocr.PDFMIME},
		{Bytes: []byte("doc"), MIMEType: "text/plain"},
	} {
		_, err := executor.Extract(t.Context(), config(), document)
		if !errors.Is(err, foundryocr.ErrInvalidInput) {
			t.Fatalf("document %+v: %v", document, err)
		}
	}
	if calls != 0 {
		t.Fatalf("transport calls: %d", calls)
	}
}

func TestExtractRejectsUnsafeBaseURLsBeforeSending(t *testing.T) {
	for _, value := range []string{
		"http://foundry.example.test", "https://user:pass@foundry.example.test", "https://foundry.example.test/#fragment",
		"/relative", "https://foundry.example.test:0", "https://foundry.example.test:65536", "https://foundry.example.test/?bad=%zz",
		"https://foundry.example.test/" + credential, "https://foundry.example.test/?other=" + credential,
		"https://" + credential + ".example.test",
	} {
		t.Run(value, func(t *testing.T) {
			settings := config()
			settings.BaseURL = value
			executor := foundryocr.New(roundTripFunc(func(*http.Request) (*http.Response, error) {
				t.Error("unsafe base URL reached the provider")
				return nil, errors.New("transport")
			}))
			got, err := executor.Extract(t.Context(), settings, foundryocr.Document{Bytes: []byte("doc"), MIMEType: azureocr.PDFMIME})
			if !errors.Is(err, foundryocr.ErrInvalidInput) || got != (foundryocr.Extraction{}) {
				t.Fatalf("unsafe URL: %v", err)
			}
		})
	}
	for _, key := range []string{"api_key", "TOKEN", "access_token", "sig", "key", "subscription-key", "X-Amz-Signature"} {
		t.Run(key, func(t *testing.T) {
			settings := config()
			settings.BaseURL += "/?" + key + "=value"
			executor := foundryocr.New(roundTripFunc(func(*http.Request) (*http.Response, error) {
				t.Error("credential-shaped query reached the provider")
				return nil, errors.New("transport")
			}))
			_, err := executor.Extract(t.Context(), settings, foundryocr.Document{Bytes: []byte("doc"), MIMEType: azureocr.PDFMIME})
			if !errors.Is(err, foundryocr.ErrInvalidInput) {
				t.Fatalf("credential-shaped query: %v", err)
			}
		})
	}
}

func TestExtractPropagatesContextCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	executor := foundryocr.New(roundTripFunc(func(r *http.Request) (*http.Response, error) {
		<-r.Context().Done()
		return nil, r.Context().Err()
	}))
	_, err := executor.Extract(ctx, config(), foundryocr.Document{Bytes: []byte("doc"), MIMEType: azureocr.PDFMIME})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("got %v", err)
	}
}

func TestExtractBoundsResponseSize(t *testing.T) {
	const limit = 8 << 20
	for _, extra := range []int{0, 1} {
		t.Run("extra="+strconv.Itoa(extra), func(t *testing.T) {
			body := []byte(`{"pages":[{"markdown":"exact"}]}`)
			body = append(body, bytes.Repeat([]byte(" "), limit-len(body)+extra)...)
			executor := foundryocr.New(roundTripFunc(func(*http.Request) (*http.Response, error) {
				return response(http.StatusOK, body), nil
			}))
			got, err := executor.Extract(t.Context(), config(), foundryocr.Document{Bytes: []byte("doc"), MIMEType: azureocr.PDFMIME})
			if extra == 1 {
				if err == nil || err.Error() != "OCR response exceeded the size limit" || got != (foundryocr.Extraction{}) {
					t.Fatal("oversized response did not return the fixed size failure")
				}
			} else if err != nil || got.Content != "exact" {
				t.Fatalf("at-limit response rejected: %v", err)
			}
		})
	}
}

func TestExtractTransportFailuresCollapseWithoutLeakingDetail(t *testing.T) {
	for _, failure := range []string{"transport", "read"} {
		t.Run(failure, func(t *testing.T) {
			executor := foundryocr.New(roundTripFunc(func(r *http.Request) (*http.Response, error) {
				switch failure {
				case "transport":
					return nil, errors.New("request to " + baseURL + "?key=" + credential)
				case "read":
					return &http.Response{
						StatusCode: http.StatusOK,
						Body:       io.NopCloser(readerFunc(func([]byte) (int, error) { return 0, errors.New("body reflected " + credential) })),
					}, nil
				}
				return nil, errors.New("unreachable")
			}))
			got, err := executor.Extract(t.Context(), config(), foundryocr.Document{Bytes: []byte("doc"), MIMEType: azureocr.PDFMIME})
			if err == nil || got != (foundryocr.Extraction{}) || strings.Contains(err.Error(), credential) || strings.Contains(err.Error(), baseURL) {
				t.Fatalf("failure leaked detail: %v", err)
			}
		})
	}
}

type readerFunc func([]byte) (int, error)

func (f readerFunc) Read(p []byte) (int, error) { return f(p) }

func TestExtractFollowsSameHostRedirectAndKeepsAuthorization(t *testing.T) {
	calls := 0
	executor := foundryocr.New(roundTripFunc(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.Header.Get("Authorization") != "Bearer "+credential {
			t.Errorf("call %d: Authorization header", calls)
		}
		if calls == 1 {
			resp := response(http.StatusFound, nil)
			resp.Header.Set("Location", baseURL+"/providers/mistral/azure/ocr")
			return resp, nil
		}
		return response(http.StatusOK, []byte(`{"pages":[{"markdown":"ok"}]}`)), nil
	}))
	got, err := executor.Extract(t.Context(), config(), foundryocr.Document{Bytes: []byte("doc"), MIMEType: azureocr.PDFMIME})
	if err != nil || got.Content != "ok" || calls != 2 {
		t.Fatalf("Extract: %v, %+v, calls %d", err, got, calls)
	}
}

func TestExtractPreservesResourcePathAndQueryOnBaseURL(t *testing.T) {
	settings := config()
	settings.BaseURL += ":443/resource/?region=test"
	executor := foundryocr.New(roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/resource/providers/mistral/azure/ocr" || r.URL.Query().Get("region") != "test" {
			t.Errorf("URL: %s", r.URL.String())
		}
		return response(http.StatusOK, []byte(`{"pages":[]}`)), nil
	}))
	if _, err := executor.Extract(t.Context(), settings, foundryocr.Document{Bytes: []byte("doc"), MIMEType: azureocr.PDFMIME}); err != nil {
		t.Fatal(err)
	}
}