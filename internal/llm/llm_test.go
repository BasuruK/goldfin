package llm_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/BasuruK/goldfin/internal/llm"
)

const credential = "synthetic-llm-Credential" // #nosec G101 -- Public synthetic test Credential, with no provider access.
const baseURL = "https://llm.example.test/v1"
const sentinelBody = "SENTINEL_PROVIDER_DETAIL_DO_NOT_LEAK"

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func response(status int, body []byte) *http.Response {
	return &http.Response{StatusCode: status, Header: make(http.Header), Body: io.NopCloser(bytes.NewReader(body))}
}

func cfg(mode string) llm.Config {
	return llm.Config{
		BaseURL:    baseURL,
		APIMode:    mode,
		Model:      "gpt-test",
		Credential: credential,
		Prompt:     "Extract fields as JSON.",
	}
}

func TestAResponsesCallSendsThePromptVerbatimAsInstructionsAndNoSchemaShapedKeys(t *testing.T) {
	executor := llm.New(roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.Method != http.MethodPost || r.URL.Path != "/v1/responses" {
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
		var payload map[string]json.RawMessage
		if json.Unmarshal(body, &payload) != nil {
			t.Fatal("request body JSON")
		}
		for _, forbidden := range []string{
			"response_format", "json_schema", "schema", "temperature", "max_tokens",
			"max_output_tokens", "top_p", "messages", "format",
		} {
			if _, ok := payload[forbidden]; ok {
				t.Errorf("forbidden key %q in request", forbidden)
			}
		}
		var instructions string
		if json.Unmarshal(payload["instructions"], &instructions) != nil || instructions != "Extract fields as JSON." {
			t.Errorf("instructions: %v", payload["instructions"])
		}
		var input string
		if json.Unmarshal(payload["input"], &input) != nil || input != "document text" {
			t.Error("input")
		}
		var store bool
		if json.Unmarshal(payload["store"], &store) != nil || store {
			t.Error("store")
		}
		return response(http.StatusOK, []byte(`{"output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"ok"}]}]}`)), nil
	}))
	got, err := executor.Complete(t.Context(), cfg(llm.APIModeResponses), "document text")
	if err != nil || got.Content != "ok" {
		t.Fatalf("Complete: %v, %+v", err, got)
	}
}

func TestAChatCallSendsThePromptAsTheSystemMessageAndTheInputAsTheUserMessage(t *testing.T) {
	executor := llm.New(roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/v1/chat/completions" {
			t.Errorf("path: %s", r.URL.Path)
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatal(err)
		}
		var payload struct {
			Messages []struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"messages"`
		}
		if json.Unmarshal(body, &payload) != nil {
			t.Fatal("request body JSON")
		}
		if len(payload.Messages) != 2 || payload.Messages[0].Role != "system" ||
			payload.Messages[0].Content != "Extract fields as JSON." ||
			payload.Messages[1].Role != "user" || payload.Messages[1].Content != "document text" {
			t.Fatalf("messages: %+v", payload.Messages)
		}
		return response(http.StatusOK, []byte(`{"choices":[{"message":{"content":"ok"},"finish_reason":"stop"}]}`)), nil
	}))
	got, err := executor.Complete(t.Context(), cfg(llm.APIModeChat), "document text")
	if err != nil || got.Content != "ok" {
		t.Fatalf("Complete: %v, %+v", err, got)
	}
}

func TestChatCallOmitsSystemMessageWhenPromptEmpty(t *testing.T) {
	settings := cfg(llm.APIModeChat)
	settings.Prompt = ""
	executor := llm.New(roundTripFunc(func(r *http.Request) (*http.Response, error) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatal(err)
		}
		var payload struct {
			Messages []struct {
				Role string `json:"role"`
			} `json:"messages"`
		}
		if json.Unmarshal(body, &payload) != nil {
			t.Fatal(err)
		}
		if len(payload.Messages) != 1 || payload.Messages[0].Role != "user" {
			t.Fatalf("messages: %+v", payload.Messages)
		}
		return response(http.StatusOK, []byte(`{"choices":[{"message":{"content":"ok"},"finish_reason":"stop"}]}`)), nil
	}))
	if _, err := executor.Complete(t.Context(), settings, "in"); err != nil {
		t.Fatal(err)
	}
}

func TestAnIncompleteResponsesReplyReturnsItsTextWithTheVerbatimStopReason(t *testing.T) {
	body := `{"status":"incomplete","incomplete_details":{"reason":"max_output_tokens"},"output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"partial"}]}]}`
	executor := llm.New(roundTripFunc(func(*http.Request) (*http.Response, error) {
		return response(http.StatusOK, []byte(body)), nil
	}))
	got, err := executor.Complete(t.Context(), cfg(llm.APIModeResponses), "in")
	if err != nil || got.Content != "partial" || got.Stopped != "max_output_tokens" {
		t.Fatalf("got %+v, err %v", got, err)
	}
}

func TestAChatReplyWithFinishReasonLengthReturnsItsTextWithStoppedLength(t *testing.T) {
	executor := llm.New(roundTripFunc(func(*http.Request) (*http.Response, error) {
		return response(http.StatusOK, []byte(`{"choices":[{"message":{"content":"cut"},"finish_reason":"length"}]}`)), nil
	}))
	got, err := executor.Complete(t.Context(), cfg(llm.APIModeChat), "in")
	if err != nil || got.Content != "cut" || got.Stopped != "length" {
		t.Fatalf("got %+v, err %v", got, err)
	}
}

func TestAWellFormedReplyWithNoExtractableTextReturnsAnEmptyResultNotAnError(t *testing.T) {
	for name, body := range map[string]string{
		"responses": `{"output":[{"type":"message","role":"assistant","content":[{"type":"refusal","text":"no"}]}]}`,
		"chat":      `{"choices":[{"message":{"content":null},"finish_reason":"stop"}]}`,
	} {
		t.Run(name, func(t *testing.T) {
			mode := llm.APIModeResponses
			if name == "chat" {
				mode = llm.APIModeChat
			}
			executor := llm.New(roundTripFunc(func(*http.Request) (*http.Response, error) {
				return response(http.StatusOK, []byte(body)), nil
			}))
			got, err := executor.Complete(t.Context(), cfg(mode), "in")
			if err != nil {
				t.Fatal(err)
			}
			if got.Content != "" || got.Stopped != "" {
				t.Fatalf("expected empty Result, got %+v", got)
			}
		})
	}
}

func TestAProviderErrorBodyNeverAppearsInTheReturnedError(t *testing.T) {
	executor := llm.New(roundTripFunc(func(*http.Request) (*http.Response, error) {
		return response(http.StatusBadRequest, []byte(`{"error":{"message":"`+sentinelBody+`"}}`)), nil
	}))
	_, err := executor.Complete(t.Context(), cfg(llm.APIModeChat), "in")
	if err == nil {
		t.Fatal("expected error")
	}
	if strings.Contains(err.Error(), sentinelBody) || strings.Contains(err.Error(), credential) {
		t.Fatalf("error leaked detail: %v", err)
	}
	var statusErr llm.HTTPStatusError
	if !errors.As(err, &statusErr) || statusErr.Status != http.StatusBadRequest {
		t.Fatalf("status not exposed: %v", err)
	}
}

func TestUsageCountsMapFromBothProtocolsAndStayNilWhenAbsent(t *testing.T) {
	t.Run("responses", func(t *testing.T) {
		executor := llm.New(roundTripFunc(func(*http.Request) (*http.Response, error) {
			return response(http.StatusOK, []byte(`{"output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"x"}]}],"usage":{"input_tokens":10,"output_tokens":5,"total_tokens":15}}`)), nil
		}))
		got, err := executor.Complete(t.Context(), cfg(llm.APIModeResponses), "in")
		if err != nil || got.Usage == nil || got.Usage.InputTokens == nil || *got.Usage.InputTokens != 10 ||
			got.Usage.OutputTokens == nil || *got.Usage.OutputTokens != 5 ||
			got.Usage.TotalTokens == nil || *got.Usage.TotalTokens != 15 {
			t.Fatalf("got %+v, err %v", got, err)
		}
	})
	t.Run("chat", func(t *testing.T) {
		executor := llm.New(roundTripFunc(func(*http.Request) (*http.Response, error) {
			return response(http.StatusOK, []byte(`{"choices":[{"message":{"content":"x"},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":7,"total_tokens":10}}`)), nil
		}))
		got, err := executor.Complete(t.Context(), cfg(llm.APIModeChat), "in")
		if err != nil || got.Usage == nil || got.Usage.InputTokens == nil || *got.Usage.InputTokens != 3 ||
			got.Usage.OutputTokens == nil || *got.Usage.OutputTokens != 7 ||
			got.Usage.TotalTokens == nil || *got.Usage.TotalTokens != 10 {
			t.Fatalf("got %+v, err %v", got, err)
		}
	})
	t.Run("absent", func(t *testing.T) {
		executor := llm.New(roundTripFunc(func(*http.Request) (*http.Response, error) {
			return response(http.StatusOK, []byte(`{"choices":[{"message":{"content":"x"},"finish_reason":"stop"}]}`)), nil
		}))
		got, err := executor.Complete(t.Context(), cfg(llm.APIModeChat), "in")
		if err != nil || got.Usage != nil {
			t.Fatalf("got %+v, err %v", got, err)
		}
	})
}

func TestInvalidConfigFailsBeforeAnyRequest(t *testing.T) {
	calls := 0
	executor := llm.New(roundTripFunc(func(*http.Request) (*http.Response, error) {
		calls++
		return nil, errors.New("transport")
	}))
	for _, settings := range []llm.Config{
		{BaseURL: "http://llm.example.test", APIMode: llm.APIModeChat, Model: "m", Credential: credential},
		{BaseURL: baseURL, APIMode: llm.APIModeChat, Model: "m", Credential: ""},
		{BaseURL: baseURL, APIMode: "unknown", Model: "m", Credential: credential},
	} {
		_, err := executor.Complete(t.Context(), settings, "in")
		if !errors.Is(err, llm.ErrInvalidInput) {
			t.Fatalf("settings %+v: %v", settings, err)
		}
	}
	if calls != 0 {
		t.Fatalf("transport calls: %d", calls)
	}
}

func TestCompletePropagatesContextCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	executor := llm.New(roundTripFunc(func(r *http.Request) (*http.Response, error) {
		<-r.Context().Done()
		return nil, r.Context().Err()
	}))
	_, err := executor.Complete(ctx, cfg(llm.APIModeChat), "in")
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("got %v", err)
	}
}

func TestCompleteReturnsFullOutputOnSuccess(t *testing.T) {
	raw := `{"choices":[{"message":{"content":"hi"},"finish_reason":"stop"}]}`
	executor := llm.New(roundTripFunc(func(*http.Request) (*http.Response, error) {
		return response(http.StatusOK, []byte(raw)), nil
	}))
	got, err := executor.Complete(t.Context(), cfg(llm.APIModeChat), "in")
	if err != nil {
		t.Fatal(err)
	}
	var fromRaw, fromFull any
	if json.Unmarshal([]byte(raw), &fromRaw) != nil || json.Unmarshal([]byte(got.FullOutput), &fromFull) != nil {
		t.Fatal("JSON")
	}
	eq, _ := json.Marshal(fromRaw)
	eqFull, _ := json.Marshal(fromFull)
	if string(eq) != string(eqFull) {
		t.Fatalf("FullOutput JSON mismatch:\n%s", got.FullOutput)
	}
	if !strings.Contains(got.FullOutput, "\n") {
		t.Fatal("FullOutput should be indented")
	}
}

func TestCompleteFollowsSameHostRedirectAndKeepsAuthorization(t *testing.T) {
	calls := 0
	executor := llm.New(roundTripFunc(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.Header.Get("Authorization") != "Bearer "+credential {
			t.Errorf("call %d: Authorization header", calls)
		}
		if calls == 1 {
			resp := response(http.StatusFound, nil)
			resp.Header.Set("Location", baseURL+"/responses")
			return resp, nil
		}
		return response(http.StatusOK, []byte(`{"output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"ok"}]}]}`)), nil
	}))
	got, err := executor.Complete(t.Context(), cfg(llm.APIModeResponses), "in")
	if err != nil || got.Content != "ok" || calls != 2 {
		t.Fatalf("Complete: %v, %+v, calls %d", err, got, calls)
	}
}

func TestWhitespaceOnlyPromptSentVerbatim(t *testing.T) {
	spacePrompt := "  "
	t.Run("responses", func(t *testing.T) {
		settings := cfg(llm.APIModeResponses)
		settings.Prompt = spacePrompt
		executor := llm.New(roundTripFunc(func(r *http.Request) (*http.Response, error) {
			body, err := io.ReadAll(r.Body)
			if err != nil {
				t.Fatal(err)
			}
			var payload map[string]json.RawMessage
			if json.Unmarshal(body, &payload) != nil {
				t.Fatal("request body JSON")
			}
			var instructions string
			if json.Unmarshal(payload["instructions"], &instructions) != nil || instructions != spacePrompt {
				t.Errorf("instructions: %q", instructions)
			}
			return response(http.StatusOK, []byte(`{"output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"ok"}]}]}`)), nil
		}))
		if _, err := executor.Complete(t.Context(), settings, "in"); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("chat", func(t *testing.T) {
		settings := cfg(llm.APIModeChat)
		settings.Prompt = spacePrompt
		executor := llm.New(roundTripFunc(func(r *http.Request) (*http.Response, error) {
			body, err := io.ReadAll(r.Body)
			if err != nil {
				t.Fatal(err)
			}
			var payload struct {
				Messages []struct {
					Role    string `json:"role"`
					Content string `json:"content"`
				} `json:"messages"`
			}
			if json.Unmarshal(body, &payload) != nil {
				t.Fatal(err)
			}
			if len(payload.Messages) != 2 || payload.Messages[0].Role != "system" || payload.Messages[0].Content != spacePrompt {
				t.Fatalf("messages: %+v", payload.Messages)
			}
			return response(http.StatusOK, []byte(`{"choices":[{"message":{"content":"ok"},"finish_reason":"stop"}]}`)), nil
		}))
		if _, err := executor.Complete(t.Context(), settings, "in"); err != nil {
			t.Fatal(err)
		}
	})
}

func TestResponsesStatusFailedWithoutTopLevelErrorReturnsProviderErrorWithoutBodyLeak(t *testing.T) {
	body := `{"status":"failed","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"` + sentinelBody + `"}]}]}`
	executor := llm.New(roundTripFunc(func(*http.Request) (*http.Response, error) {
		return response(http.StatusOK, []byte(body)), nil
	}))
	_, err := executor.Complete(t.Context(), cfg(llm.APIModeResponses), "in")
	if err == nil {
		t.Fatal("expected error")
	}
	if err.Error() != "LLM returned an error response" {
		t.Fatalf("unexpected error: %v", err)
	}
	if strings.Contains(err.Error(), sentinelBody) {
		t.Fatalf("error leaked detail: %v", err)
	}
}

func TestBaseURLTrailingSlash(t *testing.T) {
	settings := cfg(llm.APIModeResponses)
	settings.BaseURL = baseURL + "/"
	executor := llm.New(roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/v1/responses" {
			t.Errorf("path: %s", r.URL.Path)
		}
		return response(http.StatusOK, []byte(`{"output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"ok"}]}]}`)), nil
	}))
	if _, err := executor.Complete(t.Context(), settings, "in"); err != nil {
		t.Fatal(err)
	}
}
