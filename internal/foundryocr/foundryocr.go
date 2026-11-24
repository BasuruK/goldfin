// Package foundryocr extracts one Document through Mistral OCR on Azure Foundry, without persistence.
package foundryocr

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/BasuruK/goldfin/internal/azureocr"
)

// Config contains resolved Connector settings and a transient Credential.
type Config struct {
	BaseURL    string
	Model      string
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
	// ProcessingBudget bounds one whole OCR execution.
	ProcessingBudget = 5 * time.Minute
	maxResponseBytes = 8 << 20
)

// New uses the supplied transport, or http.DefaultTransport when nil.
func New(transport http.RoundTripper) *Executor {
	if transport == nil {
		transport = http.DefaultTransport
	}
	return &Executor{client: http.Client{
		Transport: transport,
		Timeout:   ProcessingBudget,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 10 {
				return errFailed
			}
			origin := via[0].URL
			if req.URL.Scheme != "https" || !strings.EqualFold(req.URL.Host, origin.Host) {
				return http.ErrUseLastResponse
			}
			return nil
		},
	}}
}

var errFailed = errors.New("could not extract the Document")

// ErrInvalidInput means the Connector settings or Document were rejected before any provider call.
var ErrInvalidInput = errors.New("invalid OCR settings or Document")
var errResponseTooLarge = errors.New("OCR response exceeded the size limit")

// Extract posts once and returns joined page markdown or a fixed error.
func (e *Executor) Extract(ctx context.Context, config Config, document Document) (Extraction, error) {
	ctx, cancel := context.WithTimeout(ctx, ProcessingBudget)
	defer cancel()
	if err := ctx.Err(); err != nil {
		return Extraction{}, err
	}
	endpoint, ok := safeURL(config.BaseURL, config.Credential)
	if !ok || !validConfig(config) || !azureocr.SupportedMIME(document.MIMEType) || len(document.Bytes) == 0 {
		return Extraction{}, ErrInvalidInput
	}
	docType, ok := documentWireType(document.MIMEType)
	if !ok {
		return Extraction{}, ErrInvalidInput
	}
	dataURL := fmt.Sprintf("data:%s;base64,%s", document.MIMEType, base64.StdEncoding.EncodeToString(document.Bytes))
	body, err := json.Marshal(map[string]any{
		"model": config.Model,
		"document": map[string]string{
			"type":         docType,
			"document_url": dataURL,
		},
	})
	if err != nil {
		return Extraction{}, errFailed
	}
	endpoint = endpoint.JoinPath("providers", "mistral", "azure", "ocr")
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint.String(), bytes.NewReader(body))
	if err != nil {
		return Extraction{}, errFailed
	}
	req.Header.Set("Authorization", "Bearer "+config.Credential)
	req.Header.Set("Content-Type", "application/json")
	res, err := e.client.Do(req)
	if err != nil {
		return Extraction{}, requestFailure(ctx, err)
	}
	raw, readErr := readBody(res.Body)
	_ = res.Body.Close()
	if readErr != nil {
		return Extraction{}, requestFailure(ctx, readErr)
	}
	if err := ctx.Err(); err != nil {
		return Extraction{}, err
	}
	if res.StatusCode != http.StatusOK {
		return Extraction{}, errFailed
	}
	return parseResponse(raw, config.Credential)
}

func validConfig(config Config) bool {
	if strings.TrimSpace(config.Credential) == "" || strings.ContainsFunc(config.Credential, unicode.IsControl) {
		return false
	}
	return strings.TrimSpace(config.Model) != ""
}

func documentWireType(mime string) (string, bool) {
	switch mime {
	case azureocr.PDFMIME, azureocr.DOCXMIME:
		return "document_url", true
	case azureocr.JPEGMIME, azureocr.PNGMIME:
		return "image_url", true
	default:
		return "", false
	}
}

func parseResponse(raw []byte, credential string) (Extraction, error) {
	var envelope struct {
		Pages json.RawMessage `json:"pages"`
	}
	if json.Unmarshal(raw, &envelope) != nil {
		return Extraction{}, errFailed
	}
	if len(envelope.Pages) == 0 || string(envelope.Pages) == "null" {
		return Extraction{}, errFailed
	}
	var pages []json.RawMessage
	if json.Unmarshal(envelope.Pages, &pages) != nil {
		return Extraction{}, errFailed
	}
	var parts []string
	for _, page := range pages {
		var obj map[string]json.RawMessage
		if json.Unmarshal(page, &obj) != nil {
			return Extraction{}, errFailed
		}
		markdown, ok := obj["markdown"]
		if !ok || string(markdown) == "null" {
			return Extraction{}, errFailed
		}
		var text string
		if json.Unmarshal(markdown, &text) != nil {
			return Extraction{}, errFailed
		}
		parts = append(parts, text)
	}
	content := strings.Join(parts, "\n\n")
	if strings.Contains(content, credential) {
		return Extraction{}, errFailed
	}
	return Extraction{Content: content, Pages: len(pages)}, nil
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
