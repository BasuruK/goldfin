// Package azureocr extracts one Document through Azure Document Intelligence, without persistence.
package azureocr

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode"
)

// Config contains resolved Connector settings and a transient Credential.
type Config struct {
	BaseURL    string
	APIVersion string
	Credential string
}

// Document carries the original bytes and MIME type, without storing them.
type Document struct {
	Bytes    []byte
	MIMEType string
}

// Extraction is ephemeral text and the provider's page count.
type Extraction struct {
	Content string
	Pages   int
}

// Executor owns an HTTP client and retains no per-execution settings or Documents.
type Executor struct{ client http.Client }

const (
	// ProcessingBudget bounds one whole OCR execution, polls included.
	ProcessingBudget = 5 * time.Minute
	maxResponseBytes = 8 << 20
)

// Document MIME types Azure prebuilt-read accepts.
const (
	PDFMIME  = "application/pdf"
	JPEGMIME = "image/jpeg"
	PNGMIME  = "image/png"
	DOCXMIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)

// SupportedMIME reports whether mime is a Document type prebuilt-read accepts.
func SupportedMIME(mime string) bool {
	return mime == PDFMIME || mime == JPEGMIME || mime == PNGMIME || mime == DOCXMIME
}

// New uses the supplied transport, or http.DefaultTransport when nil.
func New(transport http.RoundTripper) *Executor {
	return &Executor{client: http.Client{
		Transport: transport,
		Timeout:   30 * time.Second,
		// Azure's custom Credential header is not protected by Go's default redirect policy.
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}}
}

var errFailed = errors.New("could not extract the Document")

// ErrInvalidInput means the Connector settings or Document were rejected before any provider call.
var ErrInvalidInput = errors.New("invalid OCR settings or Document")
var errResponseTooLarge = errors.New("OCR response exceeded the size limit")

// Extract submits once and polls synchronously for at most five minutes, with 30-second requests
// and an 8 MiB cap per response. A cancelled Azure operation may continue remotely.
func (e *Executor) Extract(ctx context.Context, config Config, document Document) (Extraction, error) {
	ctx, cancel := context.WithTimeout(ctx, ProcessingBudget)
	defer cancel()
	if err := ctx.Err(); err != nil {
		return Extraction{}, err
	}
	endpoint, ok := safeURL(config.BaseURL, config.Credential)
	if !ok || strings.TrimSpace(config.Credential) == "" || strings.ContainsFunc(config.Credential, unicode.IsControl) ||
		strings.TrimSpace(config.APIVersion) == "" || strings.Contains(config.APIVersion, config.Credential) || !SupportedMIME(document.MIMEType) || len(document.Bytes) == 0 {
		return Extraction{}, ErrInvalidInput
	}
	origin := endpoint
	endpoint = endpoint.JoinPath("documentintelligence", "documentModels", "prebuilt-read:analyze")
	query := endpoint.Query()
	query.Set("api-version", config.APIVersion)
	endpoint.RawQuery = query.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint.String(), bytes.NewReader(document.Bytes))
	if err != nil {
		return Extraction{}, errFailed
	}
	req.Header.Set("Content-Type", document.MIMEType)
	req.Header.Set("Ocp-Apim-Subscription-Key", config.Credential)
	res, err := e.client.Do(req)
	if err != nil {
		return Extraction{}, requestFailure(ctx, err)
	}
	_, err = readBody(res.Body)
	_ = res.Body.Close()
	if err != nil {
		return Extraction{}, requestFailure(ctx, err)
	}
	if err := ctx.Err(); err != nil {
		return Extraction{}, err
	}
	if res.StatusCode != http.StatusAccepted {
		return Extraction{}, errFailed
	}
	location, ok := safeURL(res.Header.Get("Operation-Location"), config.Credential)
	if !ok || !strings.EqualFold(location.Hostname(), origin.Hostname()) || effectivePort(location) != effectivePort(origin) {
		return Extraction{}, errFailed
	}
	interval := 2 * time.Second
	for {
		timer := time.NewTimer(interval)
		select {
		case <-ctx.Done():
			timer.Stop()
			return Extraction{}, ctx.Err()
		case <-timer.C:
		}
		if err := ctx.Err(); err != nil {
			return Extraction{}, err
		}
		req, err = http.NewRequestWithContext(ctx, http.MethodGet, location.String(), nil)
		if err != nil {
			return Extraction{}, errFailed
		}
		req.Header.Set("Ocp-Apim-Subscription-Key", config.Credential)
		res, err = e.client.Do(req)
		if err != nil {
			return Extraction{}, requestFailure(ctx, err)
		}
		body, readErr := readBody(res.Body)
		_ = res.Body.Close()
		if err := ctx.Err(); err != nil {
			return Extraction{}, err
		}
		if readErr != nil {
			return Extraction{}, requestFailure(ctx, readErr)
		}
		if res.StatusCode != http.StatusOK {
			return Extraction{}, errFailed
		}
		var envelope struct {
			Status        string `json:"status"`
			AnalyzeResult *struct {
				Content *string           `json:"content"`
				Pages   []json.RawMessage `json:"pages"`
			} `json:"analyzeResult"`
		}
		if json.Unmarshal(body, &envelope) != nil {
			return Extraction{}, errFailed
		}
		interval = 2 * time.Second
		if seconds, err := strconv.ParseInt(res.Header.Get("Retry-After"), 10, 64); (err == nil || errors.Is(err, strconv.ErrRange)) && seconds > 2 {
			if seconds > int64(ProcessingBudget/time.Second) {
				interval = ProcessingBudget
			} else {
				interval = time.Duration(seconds) * time.Second
			}
		}
		switch envelope.Status {
		case "notStarted", "running":
			continue
		case "succeeded":
			extraction := envelope.AnalyzeResult
			if extraction == nil || extraction.Content == nil || extraction.Pages == nil || strings.Contains(*extraction.Content, config.Credential) {
				return Extraction{}, errFailed
			}
			if err := ctx.Err(); err != nil {
				return Extraction{}, err
			}
			return Extraction{Content: *extraction.Content, Pages: len(extraction.Pages)}, nil
		default:
			return Extraction{}, errFailed
		}
	}
}

func readBody(body io.Reader) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(body, maxResponseBytes+1))
	if len(data) > maxResponseBytes {
		return nil, errResponseTooLarge
	}
	return data, err
}

func requestFailure(ctx context.Context, err error) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if errors.Is(err, errResponseTooLarge) {
		return errResponseTooLarge
	}
	var timeout net.Error
	if errors.As(err, &timeout) && timeout.Timeout() {
		return context.DeadlineExceeded
	}
	return errFailed
}

func effectivePort(endpoint *url.URL) int {
	if port := endpoint.Port(); port != "" {
		n, _ := strconv.Atoi(port) // safeURL already validated the port.
		return n
	}
	return 443
}

func safeURL(raw, credential string) (*url.URL, bool) {
	endpoint, err := url.Parse(raw)
	if err != nil || endpoint.Scheme != "https" || endpoint.Hostname() == "" || endpoint.User != nil || endpoint.Fragment != "" {
		return nil, false
	}
	if port := endpoint.Port(); port != "" {
		n, err := strconv.Atoi(port)
		if err != nil || n < 1 || n > 65535 {
			return nil, false
		}
	}
	query, err := url.ParseQuery(endpoint.RawQuery)
	if err != nil || (credential != "" && (strings.Contains(endpoint.Path, credential) || strings.Contains(strings.ToLower(endpoint.Host), strings.ToLower(credential)))) {
		return nil, false
	}
	for key, values := range query {
		switch strings.ToLower(key) {
		case "api_key", "token", "access_token", "sig", "key", "subscription-key", "x-amz-signature":
			return nil, false
		}
		for _, value := range append(values, key) {
			if credential != "" && strings.Contains(value, credential) {
				return nil, false
			}
		}
	}
	return endpoint, true
}
