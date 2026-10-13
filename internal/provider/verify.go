package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
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
	Model     string        `json:"model"`
	Messages  []chatMessage `json:"messages"`
	MaxTokens int           `json:"max_tokens"`
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
		endpoint, azure, endpointErr := chatEndpoint(providerType, baseURL, modelID)
		if endpointErr != nil {
			return VerifyResult{State: "failed", Verified: false, ModelID: modelID, Message: "Could not build verification request."}, nil
		}
		ok, msg, err := minimalChat(ctx, client, endpoint, apiKey, modelID, azure)
		if err != nil {
			return VerifyResult{State: "failed", Verified: false, ModelID: modelID, Message: msg}, nil
		}
		if !ok {
			return VerifyResult{State: "failed", Verified: false, ModelID: modelID, Message: msg}, nil
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

const azureAPIVersion = "2024-10-21"

func chatEndpoint(providerType, baseURL, modelID string) (string, bool, error) {
	root := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if providerType != "azure" {
		return root + "/chat/completions", false, nil
	}
	endpoint, err := azureChatURL(root, modelID)
	return endpoint, true, err
}

func azureChatURL(root, deployment string) (string, error) {
	base, err := url.Parse(root)
	if err != nil {
		return "", err
	}
	path := strings.TrimRight(base.Path, "/")
	const marker = "/openai/deployments/"
	if idx := strings.Index(path, marker); idx >= 0 {
		rest := path[idx+len(marker):]
		existing, _, _ := strings.Cut(rest, "/")
		if existing != "" && existing != deployment {
			return "", fmt.Errorf("deployment in base URL does not match model ID")
		}
	} else {
		path += marker + deployment
	}
	base.Path = path + "/chat/completions"
	query := base.Query()
	query.Set("api-version", azureAPIVersion)
	base.RawQuery = query.Encode()
	return base.String(), nil
}

func minimalChat(ctx context.Context, client *http.Client, endpoint, apiKey, modelID string, azure bool) (bool, string, error) {
	payload, err := json.Marshal(chatRequest{
		Model:     modelID,
		Messages:  []chatMessage{{Role: "user", Content: "ping"}},
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
		if azure {
			req.Header.Set("api-key", apiKey)
		} else {
			req.Header.Set("Authorization", "Bearer "+apiKey)
		}
	}
	res, err := client.Do(req)
	if err != nil {
		return false, "Verification request failed.", err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
	if res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden {
		return false, "Authentication failed during verification.", nil
	}
	if res.StatusCode == http.StatusNotFound {
		return false, "Model not found or not accessible.", nil
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return false, fmt.Sprintf("Verification failed (HTTP %d).", res.StatusCode), nil
	}
	var envelope struct {
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(raw, &envelope); err == nil && envelope.Error != nil {
		return false, "The provider rejected the verification request.", nil
	}
	return true, "", nil
}
