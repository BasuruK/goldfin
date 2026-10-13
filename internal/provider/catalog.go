package provider

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

var errCatalogTruncated = errors.New("catalog truncated")

// CatalogResult is the worker-owned outcome of a model catalog discovery.
type CatalogResult struct {
	State   string   `json:"state"`
	IDs     []string `json:"ids,omitempty"`
	Source  string   `json:"source,omitempty"`
	Message string   `json:"message,omitempty"`
}

const (
	maxCatalogPages = 50
	maxCatalogIDs   = 5000
	catalogBudget   = 90 * time.Second
)

type modelsPage struct {
	Data []struct {
		ID string `json:"id"`
	} `json:"data"`
	HasMore bool   `json:"has_more"`
	After   string `json:"after"`
}

// DiscoverCatalog lists model IDs for providers that expose an OpenAI-style /models route.
func DiscoverCatalog(ctx context.Context, client *http.Client, providerType, baseURL, apiKey string) (CatalogResult, error) {
	switch providerType {
	case "azure", "web_request":
		return CatalogResult{
			State:   "unsupported",
			Message: "Model catalog discovery is not available for this provider. Add a model or deployment ID manually.",
		}, nil
	case "openai", "openai_compatible":
		ids, err := listOpenAIModels(ctx, client, baseURL, apiKey)
		if err != nil {
			if len(ids) > 0 && errors.Is(err, errCatalogTruncated) {
				return CatalogResult{
					State:   "ready",
					IDs:     ids,
					Source:  "discovered",
					Message: fmt.Sprintf("%d models discovered (catalog list was truncated). Enable a model, then verify access before a Run.", len(ids)),
				}, nil
			}
			return CatalogResult{State: "failed", Message: safeCatalogError(err)}, nil
		}
		if len(ids) == 0 {
			return CatalogResult{State: "ready", IDs: ids, Source: "discovered", Message: "No models returned."}, nil
		}
		return CatalogResult{
			State:   "ready",
			IDs:     ids,
			Source:  "discovered",
			Message: fmt.Sprintf("%d models discovered. Enable a model, then verify access before a Run.", len(ids)),
		}, nil
	default:
		return CatalogResult{State: "failed", Message: "Unsupported provider."}, nil
	}
}

func listOpenAIModels(ctx context.Context, client *http.Client, baseURL, apiKey string) ([]string, error) {
	root := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	ctx, cancel := context.WithTimeout(ctx, catalogBudget)
	defer cancel()
	var ids []string
	after := ""
	truncated := false
	hitPageCap := false
	for page := 0; page < maxCatalogPages && len(ids) < maxCatalogIDs; page++ {
		pageURL, err := modelsListURL(root, after)
		if err != nil {
			return nil, err
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, pageURL, nil)
		if err != nil {
			return nil, err
		}
		if apiKey != "" {
			req.Header.Set("Authorization", "Bearer "+apiKey)
		}
		res, err := client.Do(req)
		if err != nil {
			if res != nil {
				res.Body.Close()
			}
			return nil, err
		}
		body, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
		res.Body.Close()
		if err != nil {
			return nil, err
		}
		if res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden {
			return nil, fmt.Errorf("authentication failed (HTTP %d)", res.StatusCode)
		}
		if res.StatusCode < 200 || res.StatusCode >= 300 {
			return nil, fmt.Errorf("provider returned HTTP %d", res.StatusCode)
		}
		var raw map[string]json.RawMessage
		if err := json.Unmarshal(body, &raw); err != nil {
			return nil, fmt.Errorf("invalid models response")
		}
		if _, ok := raw["data"]; !ok {
			return nil, fmt.Errorf("invalid models response")
		}
		var parsed modelsPage
		if err := json.Unmarshal(body, &parsed); err != nil {
			return nil, fmt.Errorf("invalid models response")
		}
		for _, item := range parsed.Data {
			if item.ID != "" {
				ids = append(ids, item.ID)
				if len(ids) >= maxCatalogIDs {
					truncated = true
					break
				}
			}
		}
		if truncated {
			break
		}
		if !parsed.HasMore || parsed.After == "" {
			break
		}
		if page == maxCatalogPages-1 {
			hitPageCap = true
			break
		}
		after = parsed.After
	}
	if hitPageCap || truncated {
		return ids, errCatalogTruncated
	}
	return ids, nil
}

func modelsListURL(root, after string) (string, error) {
	u, err := url.Parse(root)
	if err != nil {
		return "", err
	}
	u.Path = strings.TrimRight(u.Path, "/") + "/models"
	q := u.Query()
	q.Set("limit", "100")
	if after != "" {
		q.Set("after", after)
	}
	u.RawQuery = q.Encode()
	return u.String(), nil
}

func safeCatalogError(err error) string {
	msg := err.Error()
	if strings.Contains(msg, "authentication failed") {
		return "Authentication failed. Check the API key and base URL."
	}
	if strings.Contains(msg, "invalid models response") {
		return "The provider did not return a recognizable model catalog."
	}
	return "Model discovery failed. Try again."
}
