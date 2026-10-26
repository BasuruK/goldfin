// Package probe runs synchronous Probes. It is the only production path that decrypts stored Credentials (ADR 0013).
package probe

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"strings"
	"time"

	"github.com/BasuruK/goldfin/internal/azureocr"
	"github.com/BasuruK/goldfin/internal/secretbox"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	ocrPath              = "/api/v1/probes/ocr"
	OCRPattern           = "POST " + ocrPath
	maxDocumentBytes     = 30_000_000
	maxMultipartOverhead = 1 << 20
)

type ocrHandler struct {
	pool     *pgxpool.Pool
	box      *secretbox.Box
	executor *azureocr.Executor
}

// NewOCRHandler decrypts the saved Connector Credential and calls Azure Document Intelligence synchronously.
func NewOCRHandler(pool *pgxpool.Pool, box *secretbox.Box, transport http.RoundTripper) http.Handler {
	h := ocrHandler{pool: pool, box: box, executor: azureocr.New(transport)}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		routeBudget := azureocr.ProcessingBudget + 30*time.Second
		deadline := time.Now().Add(routeBudget)
		rc := http.NewResponseController(w)
		_ = rc.SetReadDeadline(deadline)
		_ = rc.SetWriteDeadline(deadline)
		h.serveOCR(w, r)
	})
}

func (h *ocrHandler) serveOCR(w http.ResponseWriter, r *http.Request) {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || !strings.HasPrefix(mediaType, "multipart/form-data") {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid OCR request."})
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxDocumentBytes+maxMultipartOverhead)
	reader, err := r.MultipartReader()
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid OCR request."})
		return
	}
	var connectorID string
	var document []byte
	var documentMIME string
	for {
		part, err := reader.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			rejectRequest(w, err)
			return
		}
		name := part.FormName()
		switch name {
		case "connectorId":
			if connectorID != "" {
				writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid OCR request."})
				return
			}
			var data []byte
			data, err = readBoundedBytes(part, 256)
			connectorID = string(data)
		case "document":
			if document != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid OCR request."})
				return
			}
			documentMIME = strings.TrimSpace(part.Header.Get("Content-Type"))
			document, err = readBoundedBytes(part, maxDocumentBytes)
		default:
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid OCR request."})
			return
		}
		if err != nil {
			rejectRequest(w, err)
			return
		}
	}
	connectorID = strings.TrimSpace(connectorID)
	if connectorID == "" || len(document) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid OCR request."})
		return
	}
	documentMIME = normalizeDocumentMIME(documentMIME, document)
	if documentMIME == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid OCR request."})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), azureocr.ProcessingBudget)
	defer cancel()
	_ = http.NewResponseController(w).SetWriteDeadline(time.Now().Add(azureocr.ProcessingBudget))
	config, err := h.loadAzureConnector(ctx, connectorID)
	if err != nil {
		if errors.Is(err, errWrongConnector) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid OCR request."})
			return
		}
		if isInvalidConnectorID(err) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid OCR request."})
			return
		}
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not run OCR."})
		return
	}
	extraction, err := h.executor.Extract(ctx, config, azureocr.Document{Bytes: document, MIMEType: documentMIME})
	if err != nil {
		if errors.Is(err, azureocr.ErrInvalidInput) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid OCR request."})
			return
		}
		status, message := ocrFailure(err)
		writeJSON(w, status, map[string]string{"message": message})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"content": extraction.Content, "pages": extraction.Pages})
}

var errWrongConnector = errors.New("wrong Connector provider")

func isInvalidConnectorID(err error) bool {
	if errors.Is(err, pgx.ErrNoRows) {
		return true
	}
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "22P02"
}

func normalizeDocumentMIME(header string, document []byte) string {
	declared, _, err := mime.ParseMediaType(strings.TrimSpace(header))
	if err != nil {
		declared = ""
	}
	declared = strings.ToLower(declared)
	sniffed := strings.ToLower(http.DetectContentType(document))
	if sniffed == "application/zip" {
		sniffed = azureocr.DOCXMIME // Sniffing cannot tell a DOCX from any other ZIP; Azure rejects a plain ZIP.
	}
	if azureocr.SupportedMIME(sniffed) && documentMatchesMIME(sniffed, document) {
		if declared == "" || declared == "application/octet-stream" || declared == sniffed {
			return sniffed
		}
		return ""
	}
	if azureocr.SupportedMIME(declared) && documentMatchesMIME(declared, document) {
		return declared
	}
	return ""
}

func documentMatchesMIME(mimeType string, document []byte) bool {
	switch mimeType {
	case azureocr.PDFMIME:
		scan := document
		if len(scan) > 1024 {
			scan = scan[:1024]
		}
		return bytes.Contains(scan, []byte("%PDF-"))
	case azureocr.JPEGMIME:
		return len(document) >= 3 && document[0] == 0xFF && document[1] == 0xD8 && document[2] == 0xFF
	case azureocr.PNGMIME:
		return len(document) >= 8 && bytes.Equal(document[:8], []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A})
	case azureocr.DOCXMIME:
		return len(document) >= 4 && document[0] == 'P' && document[1] == 'K' && document[2] == 3 && document[3] == 4
	default:
		return false
	}
}

func (h *ocrHandler) loadAzureConnector(ctx context.Context, id string) (azureocr.Config, error) {
	var providerType, baseURL, apiVersion string
	var ciphertext []byte
	err := h.pool.QueryRow(ctx, `
		SELECT provider_type, base_url, COALESCE(api_version, ''), credential_ciphertext
		FROM connectors WHERE id = $1`, id,
	).Scan(&providerType, &baseURL, &apiVersion, &ciphertext)
	if err != nil {
		return azureocr.Config{}, err
	}
	if providerType != "azure_document_intelligence" || len(ciphertext) == 0 || apiVersion == "" {
		return azureocr.Config{}, errWrongConnector
	}
	plain, err := h.box.Decrypt(ciphertext)
	if err != nil {
		return azureocr.Config{}, err
	}
	return azureocr.Config{BaseURL: baseURL, APIVersion: apiVersion, Credential: string(plain)}, nil
}

var errTooLarge = errors.New("field too large")

func rejectRequest(w http.ResponseWriter, err error) {
	var maxBytesErr *http.MaxBytesError
	if errors.Is(err, errTooLarge) || errors.As(err, &maxBytesErr) {
		writeJSON(w, http.StatusRequestEntityTooLarge, map[string]string{"message": "Request is too large."})
		return
	}
	writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid OCR request."})
}

func readBoundedBytes(part *multipart.Part, limit int64) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(part, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, errTooLarge
	}
	return data, nil
}

func ocrFailure(err error) (int, string) {
	switch {
	case errors.Is(err, context.DeadlineExceeded):
		return http.StatusGatewayTimeout, "OCR timed out."
	case errors.Is(err, context.Canceled):
		return http.StatusBadRequest, "OCR was canceled."
	default:
		return http.StatusBadGateway, "Could not extract the Document."
	}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
