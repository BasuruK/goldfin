package probe

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"strings"
	"time"

	"github.com/BasuruK/goldfin/internal/llm"
	"github.com/BasuruK/goldfin/internal/secretbox"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	llmPath          = "/api/v1/probes/llm"
	LLMPattern       = "POST " + llmPath
	maxLLMBodyBytes  = 2 << 20
	llmResolveBudget = 5 * time.Second
)

type llmHandler struct {
	pool     *pgxpool.Pool
	box      *secretbox.Box
	executor *llm.Executor
}

type llmProbeRequest struct {
	ConnectorID string  `json:"connectorId"`
	ModelID     string  `json:"modelId"`
	PromptID    *string `json:"promptId"`
	Input       string  `json:"input"`
}

type promptVersionResponse struct {
	ID        string    `json:"id"`
	Version   int       `json:"version"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"createdAt"`
}

type llmUsageResponse struct {
	InputTokens  *int64 `json:"inputTokens"`
	OutputTokens *int64 `json:"outputTokens"`
	TotalTokens  *int64 `json:"totalTokens"`
}

type llmProbeResponse struct {
	Content       string                 `json:"content"`
	FullOutput    string                 `json:"fullOutput"`
	Stopped       string                 `json:"stopped"`
	PromptVersion *promptVersionResponse `json:"promptVersion"`
	Usage         *llmUsageResponse      `json:"usage"`
}

// NewLLMHandler decrypts the saved Connector Credential and calls the LLM provider synchronously.
func NewLLMHandler(pool *pgxpool.Pool, box *secretbox.Box, transport http.RoundTripper) http.Handler {
	h := llmHandler{pool: pool, box: box, executor: llm.New(transport)}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		prepBudget := llmResolveBudget + 30*time.Second
		deadline := time.Now().Add(prepBudget)
		rc := http.NewResponseController(w)
		_ = rc.SetReadDeadline(deadline)
		_ = rc.SetWriteDeadline(deadline)
		h.serveLLM(w, r)
	})
}

func (h *llmHandler) serveLLM(w http.ResponseWriter, r *http.Request) {
	if ct := r.Header.Get("Content-Type"); ct != "" {
		mediaType, _, err := mime.ParseMediaType(ct)
		if err != nil || mediaType != "application/json" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid LLM request."})
			return
		}
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxLLMBodyBytes)
	dec := json.NewDecoder(r.Body)
	var in llmProbeRequest
	if err := dec.Decode(&in); err != nil {
		rejectLLMBody(w, err)
		return
	}
	if err := dec.Decode(new(any)); !errors.Is(err, io.EOF) {
		rejectLLMBody(w, err)
		return
	}
	connectorID := strings.TrimSpace(in.ConnectorID)
	modelID := strings.TrimSpace(in.ModelID)
	input := in.Input
	if connectorID == "" || modelID == "" || strings.TrimSpace(input) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid LLM request."})
		return
	}
	if in.PromptID != nil && strings.TrimSpace(*in.PromptID) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid LLM request."})
		return
	}
	resolveCtx, resolveCancel := context.WithTimeout(r.Context(), llmResolveBudget)
	cfg, promptVersion, err := h.resolve(resolveCtx, connectorID, modelID, in.PromptID)
	resolveCancel()
	if err != nil {
		if errors.Is(err, errWrongConnector) || isInvalidConnectorID(err) || errors.Is(err, errDisabledModel) || errors.Is(err, errUnknownPrompt) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid LLM request."})
			return
		}
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not run LLM."})
		return
	}
	execBudget := llm.CompletionBudget + 30*time.Second
	_ = http.NewResponseController(w).SetWriteDeadline(time.Now().Add(execBudget))
	execCtx, execCancel := context.WithTimeout(r.Context(), llm.CompletionBudget)
	defer execCancel()
	result, err := h.executor.Complete(execCtx, cfg, input)
	if err != nil {
		if errors.Is(err, llm.ErrInvalidInput) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid LLM request."})
			return
		}
		status, message := llmFailure(err)
		writeJSON(w, status, map[string]string{"message": message})
		return
	}
	out := llmProbeResponse{
		Content:    result.Content,
		FullOutput: result.FullOutput,
		Stopped:    result.Stopped,
	}
	if promptVersion != nil {
		out.PromptVersion = promptVersion
	}
	if result.Usage != nil {
		out.Usage = &llmUsageResponse{
			InputTokens:  result.Usage.InputTokens,
			OutputTokens: result.Usage.OutputTokens,
			TotalTokens:  result.Usage.TotalTokens,
		}
	}
	writeJSON(w, http.StatusOK, out)
}

var errDisabledModel = errors.New("model not enabled")
var errUnknownPrompt = errors.New("unknown Prompt")

func (h *llmHandler) resolve(ctx context.Context, connectorID, modelID string, promptID *string) (llm.Config, *promptVersionResponse, error) {
	var providerType, baseURL, apiMode string
	var ciphertext []byte
	err := h.pool.QueryRow(ctx, `
		SELECT provider_type, base_url, COALESCE(llm_api_mode, ''), credential_ciphertext
		FROM connectors WHERE id = $1`, connectorID,
	).Scan(&providerType, &baseURL, &apiMode, &ciphertext)
	if err != nil {
		return llm.Config{}, nil, err
	}
	if !isLLMProvider(providerType) || apiMode == "" || len(ciphertext) == 0 {
		return llm.Config{}, nil, errWrongConnector
	}
	var enabled bool
	err = h.pool.QueryRow(ctx, `
		SELECT enabled FROM connector_models
		WHERE connector_id = $1 AND model_id = $2`, connectorID, modelID,
	).Scan(&enabled)
	if errors.Is(err, pgx.ErrNoRows) {
		return llm.Config{}, nil, errDisabledModel
	}
	if err != nil {
		return llm.Config{}, nil, err
	}
	if !enabled {
		return llm.Config{}, nil, errDisabledModel
	}
	plain, err := h.box.Decrypt(ciphertext)
	if err != nil {
		return llm.Config{}, nil, err
	}
	cfg := llm.Config{
		BaseURL:    baseURL,
		APIMode:    apiMode,
		Model:      modelID,
		Credential: string(plain),
	}
	var promptVersion *promptVersionResponse
	if promptID != nil {
		promptVersion, err = h.loadLatestPromptVersion(ctx, strings.TrimSpace(*promptID))
		if err != nil {
			return llm.Config{}, nil, err
		}
		if promptVersion == nil {
			return llm.Config{}, nil, errUnknownPrompt
		}
		cfg.Prompt = promptVersion.Content
	}
	return cfg, promptVersion, nil
}

func (h *llmHandler) loadLatestPromptVersion(ctx context.Context, promptID string) (*promptVersionResponse, error) {
	var exists bool
	if err := h.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM prompts WHERE id = $1)`, promptID).Scan(&exists); err != nil {
		return nil, err
	}
	if !exists {
		return nil, nil
	}
	var v promptVersionResponse
	err := h.pool.QueryRow(ctx, `
		SELECT id, version, content, created_at
		FROM prompt_versions
		WHERE prompt_id = $1
		ORDER BY version DESC
		LIMIT 1`, promptID,
	).Scan(&v.ID, &v.Version, &v.Content, &v.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &v, nil
}

func isLLMProvider(providerType string) bool {
	switch providerType {
	case "openai", "openai_compatible":
		return true
	default:
		return false
	}
}

func rejectLLMBody(w http.ResponseWriter, err error) {
	var maxBytesErr *http.MaxBytesError
	if errors.As(err, &maxBytesErr) {
		writeJSON(w, http.StatusRequestEntityTooLarge, map[string]string{"message": "Request is too large."})
		return
	}
	writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid LLM request."})
}

func llmFailure(err error) (int, string) {
	var statusErr llm.HTTPStatusError
	if errors.As(err, &statusErr) {
		return http.StatusBadGateway, fmt.Sprintf("LLM Connector returned HTTP %d.", statusErr.Status)
	}
	switch {
	case errors.Is(err, context.DeadlineExceeded):
		return http.StatusGatewayTimeout, "LLM timed out."
	case errors.Is(err, context.Canceled):
		return http.StatusBadRequest, "LLM was canceled."
	default:
		return http.StatusBadGateway, "Could not complete the LLM request."
	}
}
