package probe_test

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"strings"
	"testing"
	"testing/synctest"
	"time"

	"github.com/BasuruK/goldfin/db/migrations"
	"github.com/BasuruK/goldfin/internal/azureocr"
	"github.com/BasuruK/goldfin/internal/handler"
	"github.com/BasuruK/goldfin/internal/secretbox"
	"github.com/BasuruK/goldfin/internal/testdb"
)

const testCredential = "synthetic-ocr-Credential" // #nosec G101 -- fixture Credential with no provider access.
const testBaseURL = "https://ocr.example.test"
const testOperationURL = testBaseURL + "/documentintelligence/documentModels/prebuilt-read/analyzeResults/fixture?api-version=2024-11-30"

func newHandler(t *testing.T, transport http.RoundTripper) http.Handler {
	t.Helper()
	pool, db := testdb.New(t)
	migrator, err := migrations.NewProvider(db)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := migrator.Up(t.Context()); err != nil {
		t.Fatal(err)
	}
	box, err := secretbox.New(bytes.Repeat([]byte{1}, 32))
	if err != nil {
		t.Fatal(err)
	}
	return handler.New(pool, box, transport)
}

func createAzureConnector(t *testing.T, h http.Handler) string {
	t.Helper()
	body := `{"name":"Fixture OCR","providerType":"azure_document_intelligence","baseUrl":"` + testBaseURL + `","credential":"` + testCredential + `","credentialLabel":"Fixture key"}`
	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/v1/connectors", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create Connector: %d %s", rec.Code, rec.Body.String())
	}
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil || created.ID == "" {
		t.Fatalf("created Connector: %s", rec.Body.String())
	}
	return created.ID
}

func ocrRequest(t *testing.T, connectorID string, document []byte, mime string) *http.Request {
	t.Helper()
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	if err := writer.WriteField("connectorId", connectorID); err != nil {
		t.Fatal(err)
	}
	header := textproto.MIMEHeader{}
	header.Set("Content-Disposition", `form-data; name="document"; filename="fixture.docx"`)
	header.Set("Content-Type", mime)
	part, err := writer.CreatePart(header)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(document); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/v1/probes/ocr", &buf)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.ContentLength = int64(buf.Len())
	return req
}

func TestOCRProbeReturnsRecordedExtraction(t *testing.T) {
	document := azureFixture(t, "invoice.docx")
	running := azureFixture(t, "running.json")
	succeeded := azureFixture(t, "succeeded.json")
	want := string(azureFixture(t, "content.txt"))
	calls := 0
	transport := roundTripFunc(func(r *http.Request) (*http.Response, error) {
		calls++
		if calls == 1 {
			res := response(http.StatusAccepted, nil)
			res.Header.Set("Operation-Location", testOperationURL)
			return res, nil
		}
		if calls == 2 {
			return response(http.StatusOK, running), nil
		}
		return response(http.StatusOK, succeeded), nil
	})
	h := newHandler(t, transport)
	connectorID := createAzureConnector(t, h)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, ocrRequest(t, connectorID, document, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))
	if rec.Code != http.StatusOK || rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("OCR: %d %s", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), testCredential) {
		t.Fatal("OCR response leaked the Credential")
	}
	var got struct {
		Content string `json:"content"`
		Pages   int    `json:"pages"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil || got.Content != want || got.Pages != 2 {
		t.Fatalf("OCR Extraction: %+v err=%v", got, err)
	}
}

func TestOCRProbeOutlivesConnectorDatabaseGuard(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		start := time.Now()
		calls := 0
		transport := roundTripFunc(func(r *http.Request) (*http.Response, error) {
			calls++
			if r.Method == http.MethodPost {
				res := response(http.StatusAccepted, nil)
				res.Header.Set("Operation-Location", testOperationURL)
				return res, nil
			}
			if calls == 2 {
				time.Sleep(6 * time.Second)
				return response(http.StatusOK, []byte(`{"status":"succeeded","analyzeResult":{"content":"late","pages":[]}}`)), nil
			}
			return response(http.StatusOK, []byte(`{"status":"running"}`)), nil
		})
		h := newHandler(t, transport)
		connectorID := createAzureConnector(t, h)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, ocrRequest(t, connectorID, syntheticPDFDocument(), "application/pdf"))
		if rec.Code != http.StatusOK || time.Since(start) < 6*time.Second {
			t.Fatalf("OCR was cut off by the short Connector guard: %d after %s", rec.Code, time.Since(start))
		}
	})
}

func TestOCRProbeRejectsInvalidRequests(t *testing.T) {
	h := newHandler(t, roundTripFunc(func(*http.Request) (*http.Response, error) {
		t.Fatal("invalid OCR request reached the provider")
		return nil, nil
	}))
	webID := createWebConnector(t, h)
	azureID := createAzureConnector(t, h)
	for _, tc := range []struct {
		name string
		req  *http.Request
	}{
		{"wrong_connector", ocrRequest(t, webID, []byte("x"), "application/pdf")},
		{"non_uuid_connector_id", ocrRequest(t, "not-a-valid-uuid", []byte("x"), "application/pdf")},
		{"missing_document", func() *http.Request {
			var buf bytes.Buffer
			writer := multipart.NewWriter(&buf)
			_ = writer.WriteField("connectorId", webID)
			_ = writer.Close()
			req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/v1/probes/ocr", &buf)
			req.Header.Set("Content-Type", writer.FormDataContentType())
			return req
		}()},
		{"unknown_field", func() *http.Request {
			var buf bytes.Buffer
			writer := multipart.NewWriter(&buf)
			_ = writer.WriteField("connectorId", webID)
			_ = writer.WriteField("credential", testCredential)
			_ = writer.Close()
			req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/v1/probes/ocr", &buf)
			req.Header.Set("Content-Type", writer.FormDataContentType())
			return req
		}()},
		{"duplicate_connector_id", func() *http.Request {
			var buf bytes.Buffer
			writer := multipart.NewWriter(&buf)
			_ = writer.WriteField("connectorId", azureID)
			_ = writer.WriteField("connectorId", azureID)
			_ = writer.WriteField("document", string(syntheticPDFDocument()))
			_ = writer.Close()
			req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/v1/probes/ocr", &buf)
			req.Header.Set("Content-Type", writer.FormDataContentType())
			return req
		}()},
		// An empty first part must still count as "seen"; a non-empty check would accept the second.
		{"empty_then_duplicate_connector_id", func() *http.Request {
			var buf bytes.Buffer
			writer := multipart.NewWriter(&buf)
			_ = writer.WriteField("connectorId", "")
			_ = writer.WriteField("connectorId", azureID)
			_ = writer.WriteField("document", string(syntheticPDFDocument()))
			_ = writer.Close()
			req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/v1/probes/ocr", &buf)
			req.Header.Set("Content-Type", writer.FormDataContentType())
			return req
		}()},
		{"duplicate_document", func() *http.Request {
			var buf bytes.Buffer
			writer := multipart.NewWriter(&buf)
			_ = writer.WriteField("connectorId", azureID)
			_ = writer.WriteField("document", string(syntheticPDFDocument()))
			_ = writer.WriteField("document", string(syntheticPDFDocument()))
			_ = writer.Close()
			req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/v1/probes/ocr", &buf)
			req.Header.Set("Content-Type", writer.FormDataContentType())
			return req
		}()},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, tc.req)
			if rec.Code != http.StatusBadRequest || strings.Contains(rec.Body.String(), testCredential) {
				t.Fatalf("unsafe or accepted invalid OCR request: %d %s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestOCRProbeAcceptsDOCXWithGenericPartType(t *testing.T) {
	document := azureFixture(t, "invoice.docx")
	running := azureFixture(t, "running.json")
	succeeded := azureFixture(t, "succeeded.json")
	calls := 0
	transport := roundTripFunc(func(r *http.Request) (*http.Response, error) {
		calls++
		if calls == 1 {
			res := response(http.StatusAccepted, nil)
			res.Header.Set("Operation-Location", testOperationURL)
			return res, nil
		}
		if calls == 2 {
			return response(http.StatusOK, running), nil
		}
		return response(http.StatusOK, succeeded), nil
	})
	h := newHandler(t, transport)
	connectorID := createAzureConnector(t, h)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, ocrRequest(t, connectorID, document, "application/octet-stream"))
	if rec.Code != http.StatusOK {
		t.Fatalf("DOCX with generic part type: %d %s", rec.Code, rec.Body.String())
	}
}

func TestOCRProbeRejectsMismatchedDocumentType(t *testing.T) {
	h := newHandler(t, roundTripFunc(func(*http.Request) (*http.Response, error) {
		t.Fatal("mismatched Document reached the provider")
		return nil, nil
	}))
	connectorID := createAzureConnector(t, h)
	rec := httptest.NewRecorder()
	jpeg := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10}
	h.ServeHTTP(rec, ocrRequest(t, connectorID, jpeg, "application/pdf"))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("JPEG labelled PDF: %d %s", rec.Code, rec.Body.String())
	}
}

func TestOCRProbeRejectsOversizeDocument(t *testing.T) {
	h := newHandler(t, roundTripFunc(func(*http.Request) (*http.Response, error) {
		t.Fatal("oversize Document reached the provider")
		return nil, nil
	}))
	connectorID := createAzureConnector(t, h)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, ocrRequest(t, connectorID, make([]byte, 30_000_001), "application/pdf"))
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversize Document: %d %s", rec.Code, rec.Body.String())
	}
}

func TestOCRProbeMapsProviderFailure(t *testing.T) {
	transport := roundTripFunc(func(*http.Request) (*http.Response, error) {
		return response(http.StatusInternalServerError, nil), nil
	})
	h := newHandler(t, transport)
	connectorID := createAzureConnector(t, h)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, ocrRequest(t, connectorID, syntheticPDFDocument(), "application/pdf"))
	if rec.Code != http.StatusBadGateway || !strings.Contains(rec.Body.String(), "Could not extract the Document.") {
		t.Fatalf("provider failure: %d %s", rec.Code, rec.Body.String())
	}
}

func TestOCRProbeTimesOut(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		transport := roundTripFunc(func(r *http.Request) (*http.Response, error) {
			if r.Method == http.MethodPost {
				res := response(http.StatusAccepted, nil)
				res.Header.Set("Operation-Location", testOperationURL)
				return res, nil
			}
			return response(http.StatusOK, []byte(`{"status":"running"}`)), nil
		})
		h := newHandler(t, transport)
		connectorID := createAzureConnector(t, h)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, ocrRequest(t, connectorID, syntheticPDFDocument(), "application/pdf"))
		if rec.Code != http.StatusGatewayTimeout || !strings.Contains(rec.Body.String(), "OCR timed out.") {
			t.Fatalf("stuck OCR: %d %s", rec.Code, rec.Body.String())
		}
	})
}

func createWebConnector(t *testing.T, h http.Handler) string {
	t.Helper()
	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/v1/connectors", strings.NewReader(
		`{"name":"Web","providerType":"web_request","baseUrl":"https://example.com"}`,
	))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create web Connector: %d %s", rec.Code, rec.Body.String())
	}
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	return created.ID
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func response(status int, body []byte) *http.Response {
	return &http.Response{StatusCode: status, Header: make(http.Header), Body: io.NopCloser(bytes.NewReader(body))}
}

func syntheticPDFDocument() []byte {
	return []byte("%PDF-1.4\n% synthetic fixture body\n")
}

func azureFixture(t *testing.T, name string) []byte {
	t.Helper()
	body, err := azureocr.OpenFixture(name)
	if err != nil {
		t.Fatal(err)
	}
	return body
}
