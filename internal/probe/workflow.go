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

	"github.com/BasuruK/goldfin/internal/azureocr"
	"github.com/BasuruK/goldfin/internal/foundryocr"
	"github.com/BasuruK/goldfin/internal/llm"
	"github.com/BasuruK/goldfin/internal/secretbox"
	"github.com/BasuruK/goldfin/internal/workflow"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	workflowProbePath      = "/api/v1/workflows/{id}/probe"
	WorkflowProbePattern   = "POST " + workflowProbePath
	workflowResolveBudget  = 5 * time.Second
	workflowUploadRoutePad = 30 * time.Second
)

type workflowHandler struct {
	pool *pgxpool.Pool
	ocr  ocrHandler
	llm  llmHandler
}

type workflowProbeResponse struct {
	WorkflowID string              `json:"workflowId"`
	Nodes      []workflowNodeProbe `json:"nodes"`
}

type workflowNodeProbe struct {
	NodeID        string `json:"nodeId"`
	NodeName      string `json:"nodeName"`
	Kind          string `json:"kind"`
	ModelID       string `json:"modelId,omitempty"`
	PromptVersion *int   `json:"promptVersion,omitempty"`
	Status        string `json:"status"`
	StopReason    string `json:"stopReason,omitempty"`
	Text          string `json:"text,omitempty"`
	DurationMs    int64  `json:"durationMs"`
	Error         string `json:"error,omitempty"`
}

// NewWorkflowHandler runs one uploaded Document through a saved Workflow synchronously.
func NewWorkflowHandler(pool *pgxpool.Pool, box *secretbox.Box, transport http.RoundTripper) http.Handler {
	h := workflowHandler{
		pool: pool,
		ocr: ocrHandler{
			pool:            pool,
			box:             box,
			azureExecutor:   azureocr.New(transport),
			foundryExecutor: foundryocr.New(transport),
		},
		llm: llmHandler{pool: pool, box: box, executor: llm.New(transport)},
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		uploadBudget := workflowRouteBudget(1)
		deadline := time.Now().Add(uploadBudget)
		rc := http.NewResponseController(w)
		_ = rc.SetReadDeadline(deadline)
		_ = rc.SetWriteDeadline(deadline)
		h.serveWorkflowProbe(w, r)
	})
}

func (h *workflowHandler) serveWorkflowProbe(w http.ResponseWriter, r *http.Request) {
	workflowID := strings.TrimSpace(r.PathValue("id"))
	if workflowID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid Workflow Probe request."})
		return
	}
	document, documentMIME, err := readWorkflowDocument(w, r)
	if err != nil {
		return
	}
	loadCtx, loadCancel := context.WithTimeout(r.Context(), workflowResolveBudget)
	wf, err := h.loadWorkflow(loadCtx, workflowID)
	loadCancel()
	if errors.Is(err, errWorkflowMissing) {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Workflow not found."})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not run the Workflow Probe."})
		return
	}
	graph := workflow.Graph{Name: wf.Name, Nodes: wf.Nodes}
	order, err := workflow.ExecutionOrder(graph)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not run the Workflow Probe."})
		return
	}
	routeBudget := workflowRouteBudget(len(order))
	routeDeadline := time.Now().Add(routeBudget)
	rc := http.NewResponseController(w)
	_ = rc.SetReadDeadline(routeDeadline)
	_ = rc.SetWriteDeadline(routeDeadline)

	byID := make(map[string]workflow.Node, len(wf.Nodes))
	for _, node := range wf.Nodes {
		byID[strings.TrimSpace(node.ID)] = node
	}
	outputs := make(map[string]string, len(order))
	names := make(map[string]string, len(wf.Nodes))
	for _, node := range wf.Nodes {
		names[strings.TrimSpace(node.ID)] = strings.TrimSpace(node.Name)
	}
	results := make([]workflowNodeProbe, 0, len(order))
	for _, nodeID := range order {
		node := byID[nodeID]
		connectorID := strings.TrimSpace(node.ConnectorID)
		modelID := strings.TrimSpace(node.ModelID)
		started := time.Now()
		kindCtx, kindCancel := context.WithTimeout(r.Context(), workflowResolveBudget)
		kind, kindErr := h.nodeKind(kindCtx, connectorID)
		kindCancel()
		item := workflowNodeProbe{
			NodeID:   nodeID,
			NodeName: names[nodeID],
			ModelID:  modelID,
		}
		if kindErr != nil {
			if isInvalidConnectorID(kindErr) || errors.Is(kindErr, pgx.ErrNoRows) {
				item.Status = "failed"
				item.DurationMs = time.Since(started).Milliseconds()
				item.Error = "The Connector cannot run this node."
				results = append(results, item)
				break
			}
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not run the Workflow Probe."})
			return
		}
		item.Kind = kind
		switch kind {
		case "ocr":
			item = h.runOCRNode(r.Context(), document, documentMIME, item, started, connectorID, modelID)
		case "llm":
			input := joinNodeInputs(node, outputs, names)
			item = h.runLLMNode(r.Context(), item, started, connectorID, modelID, input, strings.TrimSpace(node.PromptID))
		default:
			item.Status = "failed"
			item.DurationMs = time.Since(started).Milliseconds()
			item.Error = "The Connector cannot run this node."
		}
		results = append(results, item)
		if item.Status == "failed" {
			break
		}
		if item.Status == "completed" || item.Status == "incomplete" {
			outputs[nodeID] = item.Text
		}
	}
	writeJSON(w, http.StatusOK, workflowProbeResponse{WorkflowID: workflowID, Nodes: results})
}

func workflowRouteBudget(nodeCount int) time.Duration {
	if nodeCount < 1 {
		nodeCount = 1
	}
	perNode := azureocr.ProcessingBudget + llm.CompletionBudget
	return perNode*time.Duration(nodeCount) + workflowUploadRoutePad
}

var errWorkflowMissing = errors.New("workflow not found")

type storedWorkflow struct {
	Name  string
	Nodes []workflow.Node
}

func (h *workflowHandler) loadWorkflow(ctx context.Context, id string) (storedWorkflow, error) {
	var wf storedWorkflow
	var nodesJSON []byte
	err := h.pool.QueryRow(ctx, `
		SELECT name, nodes_json FROM workflows WHERE id = $1`, id,
	).Scan(&wf.Name, &nodesJSON)
	if errors.Is(err, pgx.ErrNoRows) {
		return storedWorkflow{}, errWorkflowMissing
	}
	if err != nil {
		return storedWorkflow{}, err
	}
	if err := json.Unmarshal(nodesJSON, &wf.Nodes); err != nil {
		return storedWorkflow{}, err
	}
	return wf, nil
}

func (h *workflowHandler) nodeKind(ctx context.Context, connectorID string) (string, error) {
	var providerType string
	err := h.pool.QueryRow(ctx, `SELECT provider_type FROM connectors WHERE id = $1`, connectorID).Scan(&providerType)
	if err != nil {
		return "", err
	}
	switch providerType {
	case "azure_document_intelligence", "azure_foundry":
		return "ocr", nil
	case "openai", "openai_compatible":
		return "llm", nil
	default:
		return "", nil
	}
}

func joinNodeInputs(node workflow.Node, outputs map[string]string, names map[string]string) string {
	inputs := node.InputNodeIDs
	if len(inputs) == 1 {
		return outputs[strings.TrimSpace(inputs[0])]
	}
	var b strings.Builder
	for i, raw := range inputs {
		id := strings.TrimSpace(raw)
		if i > 0 {
			b.WriteString("\n\n")
		}
		b.WriteString("## ")
		b.WriteString(names[id])
		b.WriteString("\n")
		b.WriteString(outputs[id])
	}
	return b.String()
}

func (h *workflowHandler) runOCRNode(ctx context.Context, document []byte, documentMIME string, item workflowNodeProbe, started time.Time, connectorID, modelID string) workflowNodeProbe {
	execCtx, cancel := context.WithTimeout(ctx, azureocr.ProcessingBudget)
	defer cancel()
	resolved, err := h.ocr.resolve(execCtx, connectorID, modelID)
	if err != nil {
		item.Status = "failed"
		item.DurationMs = time.Since(started).Milliseconds()
		item.Error = workflowNodeOCRError(err)
		return item
	}
	doc := azureocr.Document{Bytes: document, MIMEType: documentMIME}
	var content string
	switch resolved.provider {
	case "azure_document_intelligence":
		var extraction azureocr.Extraction
		extraction, err = h.ocr.azureExecutor.Extract(execCtx, resolved.azure, doc)
		content = extraction.Content
	case "azure_foundry":
		var extraction foundryocr.Extraction
		extraction, err = h.ocr.foundryExecutor.Extract(execCtx, resolved.foundry, foundryocr.Document{Bytes: document, MIMEType: documentMIME})
		content = extraction.Content
	default:
		item.Status = "failed"
		item.DurationMs = time.Since(started).Milliseconds()
		item.Error = "The Connector cannot run this node."
		return item
	}
	if err != nil {
		item.Status = "failed"
		item.DurationMs = time.Since(started).Milliseconds()
		item.Error = workflowNodeOCRError(err)
		return item
	}
	item.Status = "completed"
	item.Text = content
	item.DurationMs = time.Since(started).Milliseconds()
	return item
}

func (h *workflowHandler) runLLMNode(ctx context.Context, item workflowNodeProbe, started time.Time, connectorID, modelID, input, promptID string) workflowNodeProbe {
	resolveCtx, resolveCancel := context.WithTimeout(ctx, llmResolveBudget)
	cfg, promptVersion, err := h.llm.resolve(resolveCtx, connectorID, modelID, &promptID)
	resolveCancel()
	if err != nil {
		item.Status = "failed"
		item.DurationMs = time.Since(started).Milliseconds()
		item.Error = workflowNodeLLMError(err)
		return item
	}
	if promptVersion != nil {
		v := promptVersion.Version
		item.PromptVersion = &v
	}
	execCtx, execCancel := context.WithTimeout(ctx, llm.CompletionBudget)
	defer execCancel()
	result, err := h.llm.executor.Complete(execCtx, cfg, input)
	if err != nil {
		item.Status = "failed"
		item.DurationMs = time.Since(started).Milliseconds()
		item.Error = workflowNodeLLMError(err)
		return item
	}
	item.DurationMs = time.Since(started).Milliseconds()
	if result.Stopped != "" {
		item.Status = "incomplete"
		item.StopReason = result.Stopped
		item.Text = result.Content
		return item
	}
	item.Status = "completed"
	item.Text = result.Content
	return item
}

func readWorkflowDocument(w http.ResponseWriter, r *http.Request) ([]byte, string, error) {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || !strings.HasPrefix(mediaType, "multipart/form-data") {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid Workflow Probe request."})
		return nil, "", errInvalidProbeRequest
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxDocumentBytes+maxMultipartOverhead)
	reader, err := r.MultipartReader()
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid Workflow Probe request."})
		return nil, "", errInvalidProbeRequest
	}
	var document []byte
	var documentMIME string
	documentSeen := false
	for {
		part, err := reader.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			rejectWorkflowDocument(w, err)
			return nil, "", err
		}
		switch part.FormName() {
		case "document":
			if documentSeen {
				writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid Workflow Probe request."})
				return nil, "", errInvalidProbeRequest
			}
			documentSeen = true
			documentMIME = strings.TrimSpace(part.Header.Get("Content-Type"))
			document, err = readBoundedBytes(part, maxDocumentBytes)
		default:
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid Workflow Probe request."})
			return nil, "", errInvalidProbeRequest
		}
		if err != nil {
			rejectWorkflowDocument(w, err)
			return nil, "", err
		}
	}
	if !documentSeen || len(document) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid Workflow Probe request."})
		return nil, "", errInvalidProbeRequest
	}
	documentMIME = normalizeDocumentMIME(documentMIME, document)
	if documentMIME == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid Workflow Probe request."})
		return nil, "", errInvalidProbeRequest
	}
	return document, documentMIME, nil
}

var errInvalidProbeRequest = errors.New("invalid workflow probe request")

func rejectWorkflowDocument(w http.ResponseWriter, err error) {
	var maxBytesErr *http.MaxBytesError
	if errors.Is(err, errTooLarge) || errors.As(err, &maxBytesErr) {
		writeJSON(w, http.StatusRequestEntityTooLarge, map[string]string{"message": "Request is too large."})
		return
	}
	writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid Workflow Probe request."})
}

func workflowNodeOCRError(err error) string {
	switch {
	case errors.Is(err, errDisabledModel):
		return "The model is not enabled on this Connector."
	case errors.Is(err, errWrongConnector):
		return "The Connector cannot run this node."
	case errors.Is(err, azureocr.ErrInvalidInput), errors.Is(err, foundryocr.ErrInvalidInput):
		return "Invalid OCR settings for this node."
	case errors.Is(err, context.DeadlineExceeded):
		return "OCR timed out."
	case errors.Is(err, context.Canceled):
		return "OCR was canceled."
	default:
		return "Could not extract the Document."
	}
}

func workflowNodeLLMError(err error) string {
	var statusErr llm.HTTPStatusError
	if errors.As(err, &statusErr) {
		return fmt.Sprintf("LLM Connector returned HTTP %d.", statusErr.Status)
	}
	switch {
	case errors.Is(err, errDisabledModel):
		return "The model is not enabled on this Connector."
	case errors.Is(err, errWrongConnector), errors.Is(err, errUnknownPrompt):
		return "The Connector cannot run this node."
	case errors.Is(err, llm.ErrInvalidInput):
		return "Invalid LLM settings for this node."
	case errors.Is(err, context.DeadlineExceeded):
		return "LLM timed out."
	case errors.Is(err, context.Canceled):
		return "LLM was canceled."
	default:
		return "Could not complete the LLM request."
	}
}
