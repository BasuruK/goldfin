// Package llm completes one Probe against an LLM connector, without persistence.
package llm

import (
	"bytes"
	"context"
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
)

const (
	// CompletionBudget bounds one whole LLM completion request.
	CompletionBudget       = 5 * time.Minute
	APIModeResponses       = "responses"
	APIModeChat            = "chat_completions"
	maxResponseBytes       = 8 << 20
	errFailedMsg           = "could not complete the LLM request"
	errMalformedResponse   = "LLM returned an unparseable response"
	errProviderResponse    = "LLM returned an error response"
	errResponseTooLargeMsg = "LLM response exceeded the size limit"
)

// Config contains resolved Connector settings and a transient Credential.
type Config struct {
	BaseURL    string
	APIMode    string
	Model      string
	Credential string
	Prompt     string
}

// Usage holds provider token counts when present.
type Usage struct {
	InputTokens  *int64
	OutputTokens *int64
	TotalTokens  *int64
}

// Result is ephemeral extracted text and the raw provider body.
type Result struct {
	Content    string
	FullOutput string
	Stopped    string
	Usage      *Usage
}

// Executor owns an HTTP client and retains no per-execution settings.
type Executor struct{ client http.Client }

// HTTPStatusError means the provider returned a non-success HTTP status.
type HTTPStatusError struct{ Status int }

func (e HTTPStatusError) Error() string {
	return fmt.Sprintf("LLM request failed with status %d", e.Status)
}

var errFailed = errors.New(errFailedMsg)

// ErrInvalidInput means the Connector settings were rejected before any provider call.
var ErrInvalidInput = errors.New("invalid LLM settings")

var errResponseTooLarge = errors.New(errResponseTooLargeMsg)

// New uses the supplied transport, or http.DefaultTransport when nil.
func New(transport http.RoundTripper) *Executor {
	if transport == nil {
		transport = http.DefaultTransport
	}
	return &Executor{client: http.Client{
		Transport: transport,
		Timeout:   CompletionBudget,
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

// Complete sends one completion request and returns extracted text or an error.
func (e *Executor) Complete(ctx context.Context, cfg Config, input string) (Result, error) {
	ctx, cancel := context.WithTimeout(ctx, CompletionBudget)
	defer cancel()
	if err := ctx.Err(); err != nil {
		return Result{}, err
	}
	endpoint, ok := safeURL(cfg.BaseURL, cfg.Credential)
	if !ok || !validConfig(cfg) {
		return Result{}, ErrInvalidInput
	}
	body, path, err := requestBody(cfg, input)
	if err != nil {
		return Result{}, errFailed
	}
	endpoint = endpoint.JoinPath(strings.TrimPrefix(path, "/"))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint.String(), bytes.NewReader(body))
	if err != nil {
		return Result{}, errFailed
	}
	req.Header.Set("Authorization", "Bearer "+cfg.Credential)
	req.Header.Set("Content-Type", "application/json")
	res, err := e.client.Do(req)
	if err != nil {
		return Result{}, requestFailure(ctx, err)
	}
	raw, readErr := readBody(res.Body)
	_ = res.Body.Close()
	if readErr != nil {
		return Result{}, requestFailure(ctx, readErr)
	}
	if err := ctx.Err(); err != nil {
		return Result{}, err
	}
	if res.StatusCode != http.StatusOK {
		return Result{}, HTTPStatusError{Status: res.StatusCode}
	}
	fullOutput, err := prettyJSON(raw)
	if err != nil {
		return Result{}, errors.New(errMalformedResponse)
	}
	if cfg.APIMode == APIModeResponses {
		return parseResponses(raw, fullOutput)
	}
	return parseChat(raw, fullOutput)
}

func validConfig(cfg Config) bool {
	if strings.TrimSpace(cfg.Credential) == "" || strings.ContainsFunc(cfg.Credential, unicode.IsControl) {
		return false
	}
	if strings.TrimSpace(cfg.Model) == "" {
		return false
	}
	switch cfg.APIMode {
	case APIModeResponses, APIModeChat:
		return true
	default:
		return false
	}
}

func requestBody(cfg Config, input string) ([]byte, string, error) {
	switch cfg.APIMode {
	case APIModeResponses:
		payload := map[string]any{
			"model": cfg.Model,
			"input": input,
			"store": false,
		}
		if cfg.Prompt != "" {
			payload["instructions"] = cfg.Prompt
		}
		body, err := json.Marshal(payload)
		return body, "responses", err
	case APIModeChat:
		messages := []map[string]string{{"role": "user", "content": input}}
		if cfg.Prompt != "" {
			messages = append([]map[string]string{{"role": "system", "content": cfg.Prompt}}, messages...)
		}
		body, err := json.Marshal(map[string]any{"model": cfg.Model, "messages": messages})
		return body, "chat/completions", err
	default:
		return nil, "", ErrInvalidInput
	}
}

func parseResponses(raw []byte, fullOutput string) (Result, error) {
	var envelope struct {
		Error  json.RawMessage `json:"error"`
		Status string          `json:"status"`
		Usage  *struct {
			InputTokens  *int64 `json:"input_tokens"`
			OutputTokens *int64 `json:"output_tokens"`
			TotalTokens  *int64 `json:"total_tokens"`
		} `json:"usage"`
		Output []struct {
			Type    string `json:"type"`
			Role    string `json:"role"`
			Channel string `json:"channel"`
			Status  string `json:"status"`
			Content []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
		} `json:"output"`
		IncompleteDetails *struct {
			Reason string `json:"reason"`
		} `json:"incomplete_details"`
	}
	if json.Unmarshal(raw, &envelope) != nil {
		return Result{}, errors.New(errMalformedResponse)
	}
	if len(envelope.Error) > 0 && string(envelope.Error) != "null" {
		return Result{}, errors.New(errProviderResponse)
	}
	if envelope.Status != "" && envelope.Status != "completed" && envelope.Status != "incomplete" {
		return Result{}, errors.New(errProviderResponse)
	}
	stopped := ""
	if envelope.Status == "incomplete" {
		stopped = "incomplete"
		if envelope.IncompleteDetails != nil && envelope.IncompleteDetails.Reason != "" {
			stopped = envelope.IncompleteDetails.Reason
		}
	}
	var parts []string
	for _, item := range envelope.Output {
		if item.Type != "message" || item.Role != "assistant" {
			continue
		}
		if item.Channel != "" && item.Channel != "final" {
			continue
		}
		if item.Status != "" && item.Status != "completed" {
			if stopped == "" {
				stopped = "incomplete"
			}
		}
		for _, part := range item.Content {
			if part.Type == "output_text" {
				parts = append(parts, part.Text)
			}
		}
	}
	result := Result{
		Content:    strings.Join(parts, "\n\n"),
		FullOutput: fullOutput,
		Stopped:    stopped,
	}
	if envelope.Usage != nil {
		result.Usage = &Usage{
			InputTokens:  envelope.Usage.InputTokens,
			OutputTokens: envelope.Usage.OutputTokens,
			TotalTokens:  envelope.Usage.TotalTokens,
		}
	}
	return result, nil
}

func parseChat(raw []byte, fullOutput string) (Result, error) {
	var envelope struct {
		Error json.RawMessage `json:"error"`
		Usage *struct {
			PromptTokens     *int64 `json:"prompt_tokens"`
			CompletionTokens *int64 `json:"completion_tokens"`
			TotalTokens      *int64 `json:"total_tokens"`
		} `json:"usage"`
		Choices []struct {
			FinishReason string `json:"finish_reason"`
			Message      struct {
				Content json.RawMessage `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if json.Unmarshal(raw, &envelope) != nil {
		return Result{}, errors.New(errMalformedResponse)
	}
	if len(envelope.Error) > 0 && string(envelope.Error) != "null" {
		return Result{}, errors.New(errProviderResponse)
	}
	content := ""
	stopped := ""
	if len(envelope.Choices) > 0 {
		choice := envelope.Choices[0]
		if choice.FinishReason != "" && choice.FinishReason != "stop" {
			stopped = choice.FinishReason
		}
		var text string
		if json.Unmarshal(choice.Message.Content, &text) == nil {
			content = text
		}
	}
	result := Result{
		Content:    content,
		FullOutput: fullOutput,
		Stopped:    stopped,
	}
	if envelope.Usage != nil {
		result.Usage = &Usage{
			InputTokens:  envelope.Usage.PromptTokens,
			OutputTokens: envelope.Usage.CompletionTokens,
			TotalTokens:  envelope.Usage.TotalTokens,
		}
	}
	return result, nil
}

func prettyJSON(raw []byte) (string, error) {
	var value json.RawMessage
	if json.Unmarshal(raw, &value) != nil {
		return "", errors.New(errMalformedResponse)
	}
	var buf bytes.Buffer
	if err := json.Indent(&buf, raw, "", "  "); err != nil {
		return "", err
	}
	return buf.String(), nil
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
