package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// VerifyResult records whether a single model ID answered a minimal completion.
type VerifyResult struct {
	State    string `json:"state"`
	Verified bool   `json:"verified"`
	ModelID  string `json:"modelId"`
	Message  string `json:"message,omitempty"`
}

type chatRequest struct {
	Model    string          `json:"model"`
	Messages []chatMessage   `json:"messages"`
	MaxTokens int            `json:"max_tokens"`
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// VerifyModel performs a minimal chat completion to confirm model access.
func VerifyModel(ctx context.Context, client *http.Client, providerType, baseURL, apiKey, modelID string) (VerifyResult, error) {
	modelID = strings.TrimSpace(modelID)
	if modelID == "" {
		return VerifyResult{State: "failed", Verified: false, ModelID: modelID, Message: "Model ID is required."}, nil
	}
	switch providerType {
	case "web_request":
		return VerifyResult{
			State:    "failed",
			Verified: false,
			ModelID:  modelID,
			Message:  "Web Request endpoints do not support model verification.",
		}, nil
	case "openai", "openai_compatible", "azure":
		ok, msg, err := minimalChat(ctx, client, baseURL, apiKey, modelID)
		if err != nil {
			return VerifyResult{State: "failed", Verified: false, ModelID: modelID, Message: msg}, nil
		}
		if !ok {
			return VerifyResult{State: "ready", Verified: false, ModelID: modelID, Message: msg}, nil
		}
		return VerifyResult{
			State:    "ready",
			Verified: true,
			ModelID:  modelID,
			Message:  "Model access verified for the LLM stage.",
		}, nil
	default:
		return VerifyResult{State: "failed", Verified: false, ModelID: modelID, Message: "Unsupported provider."}, nil
	}
}

func minimalChat(ctx context.Context, client *http.Client, baseURL, apiKey, modelID string) (bool, string, error) {
	root := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	endpoint := root + "/chat/completions"
	payload, err := json.Marshal(chatRequest{
		Model: modelID,
		Messages: []chatMessage{{Role: "user", Content: "ping"}},
		MaxTokens: 1,
	})
	if err != nil {
		return false, "Could not build verification request.", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return false, "Could not build verification request.", err
	}
	req.Header.Set("Content-Type", "application/json")
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}
	res, err := client.Do(req)
	if err != nil {
		return false, "Verification request failed.", err
	}
	defer res.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 4096))
	if res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden {
		return false, "Authentication failed during verification.", nil
	}
	if res.StatusCode == http.StatusNotFound {
		return false, "Model not found or not accessible.", nil
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return false, fmt.Sprintf("Verification failed (HTTP %d).", res.StatusCode), nil
	}
	return true, "", nil
}
