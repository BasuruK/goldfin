package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/BasuruK/goldfin/internal/workflow"
	"github.com/jackc/pgx/v5"
)

const WorkflowsPath = "/api/v1/workflows"

type workflowResponse struct {
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	Nodes     []workflow.Node `json:"nodes"`
	CreatedAt time.Time       `json:"createdAt"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

func (s *server) registerWorkflowRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET "+WorkflowsPath, s.listWorkflows)
	mux.HandleFunc("POST "+WorkflowsPath, s.createWorkflow)
	mux.HandleFunc("GET "+WorkflowsPath+"/{id}", s.getWorkflow)
	mux.HandleFunc("PUT "+WorkflowsPath+"/{id}", s.updateWorkflow)
	mux.HandleFunc("DELETE "+WorkflowsPath+"/{id}", s.deleteWorkflow)
}

func (s *server) listWorkflows(w http.ResponseWriter, r *http.Request) {
	rows, err := s.pool.Query(r.Context(), `
		SELECT id, name, nodes_json, created_at, updated_at
		FROM workflows
		ORDER BY created_at, id`)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not load Workflows."})
		return
	}
	defer rows.Close()
	out := []workflowResponse{}
	for rows.Next() {
		item, err := scanWorkflowRow(rows)
		if err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not load Workflows."})
			return
		}
		out = append(out, item)
	}
	if err := rows.Err(); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not load Workflows."})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"workflows": out})
}

func (s *server) createWorkflow(w http.ResponseWriter, r *http.Request) {
	graph, err := decodeWorkflowBody(w, r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid Workflow."})
		return
	}
	catalog := poolCatalog{ctx: r.Context(), pool: s.pool}
	if _, err := workflow.Validate(graph, catalog); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid Workflow."})
		return
	}
	out, err := s.insertWorkflow(r.Context(), graph)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not save the Workflow."})
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

func (s *server) getWorkflow(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid Workflow."})
		return
	}
	out, err := s.loadWorkflow(r.Context(), id)
	if errors.Is(err, errWorkflowNotFound) {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Workflow not found."})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not load the Workflow."})
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *server) updateWorkflow(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid Workflow."})
		return
	}
	graph, err := decodeWorkflowBody(w, r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid Workflow."})
		return
	}
	catalog := poolCatalog{ctx: r.Context(), pool: s.pool}
	if _, err := workflow.Validate(graph, catalog); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid Workflow."})
		return
	}
	out, err := s.replaceWorkflow(r.Context(), id, graph)
	if errors.Is(err, errWorkflowNotFound) {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Workflow not found."})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not save the Workflow."})
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *server) deleteWorkflow(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid Workflow."})
		return
	}
	tag, err := s.pool.Exec(r.Context(), `DELETE FROM workflows WHERE id = $1`, id)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not delete the Workflow."})
		return
	}
	if tag.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Workflow not found."})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

var errWorkflowNotFound = errors.New("workflow not found")

type poolCatalog struct {
	ctx  context.Context
	pool interface {
		QueryRow(context.Context, string, ...any) pgx.Row
	}
}

func (c poolCatalog) Connector(id string) (workflow.ConnectorInfo, error) {
	var providerType string
	err := c.pool.QueryRow(c.ctx, `SELECT provider_type FROM connectors WHERE id = $1`, id).Scan(&providerType)
	if errors.Is(err, pgx.ErrNoRows) {
		return workflow.ConnectorInfo{}, errors.New("missing connector")
	}
	if err != nil {
		return workflow.ConnectorInfo{}, err
	}
	return workflow.ConnectorInfo{ProviderType: providerType}, nil
}

func (c poolCatalog) ModelEnabled(connectorID, modelID string) (bool, error) {
	var enabled bool
	err := c.pool.QueryRow(c.ctx, `
		SELECT enabled FROM connector_models
		WHERE connector_id = $1 AND model_id = $2`, connectorID, modelID,
	).Scan(&enabled)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return enabled, nil
}

func (c poolCatalog) PromptExists(id string) (bool, error) {
	var one int
	err := c.pool.QueryRow(c.ctx, `SELECT 1 FROM prompts WHERE id = $1`, id).Scan(&one)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func (s *server) insertWorkflow(ctx context.Context, graph workflow.Graph) (workflowResponse, error) {
	nodesJSON, err := json.Marshal(graph.Nodes)
	if err != nil {
		return workflowResponse{}, err
	}
	var out workflowResponse
	err = s.pool.QueryRow(ctx, `
		INSERT INTO workflows (name, nodes_json)
		VALUES ($1, $2::jsonb)
		RETURNING id, name, nodes_json, created_at, updated_at`,
		strings.TrimSpace(graph.Name), nodesJSON,
	).Scan(&out.ID, &out.Name, &nodesJSON, &out.CreatedAt, &out.UpdatedAt)
	if err != nil {
		return workflowResponse{}, err
	}
	if err := json.Unmarshal(nodesJSON, &out.Nodes); err != nil {
		return workflowResponse{}, err
	}
	return out, nil
}

func (s *server) replaceWorkflow(ctx context.Context, id string, graph workflow.Graph) (workflowResponse, error) {
	nodesJSON, err := json.Marshal(graph.Nodes)
	if err != nil {
		return workflowResponse{}, err
	}
	var out workflowResponse
	err = s.pool.QueryRow(ctx, `
		UPDATE workflows
		SET name = $2, nodes_json = $3::jsonb, updated_at = now()
		WHERE id = $1
		RETURNING id, name, nodes_json, created_at, updated_at`,
		id, strings.TrimSpace(graph.Name), nodesJSON,
	).Scan(&out.ID, &out.Name, &nodesJSON, &out.CreatedAt, &out.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return workflowResponse{}, errWorkflowNotFound
	}
	if err != nil {
		return workflowResponse{}, err
	}
	if err := json.Unmarshal(nodesJSON, &out.Nodes); err != nil {
		return workflowResponse{}, err
	}
	return out, nil
}

func (s *server) loadWorkflow(ctx context.Context, id string) (workflowResponse, error) {
	var out workflowResponse
	var nodesJSON []byte
	err := s.pool.QueryRow(ctx, `
		SELECT id, name, nodes_json, created_at, updated_at
		FROM workflows WHERE id = $1`, id,
	).Scan(&out.ID, &out.Name, &nodesJSON, &out.CreatedAt, &out.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return workflowResponse{}, errWorkflowNotFound
	}
	if err != nil {
		return workflowResponse{}, err
	}
	if err := json.Unmarshal(nodesJSON, &out.Nodes); err != nil {
		return workflowResponse{}, err
	}
	return out, nil
}

type workflowRowScanner interface {
	Scan(dest ...any) error
}

func scanWorkflowRow(rows workflowRowScanner) (workflowResponse, error) {
	var out workflowResponse
	var nodesJSON []byte
	if err := rows.Scan(&out.ID, &out.Name, &nodesJSON, &out.CreatedAt, &out.UpdatedAt); err != nil {
		return workflowResponse{}, err
	}
	if err := json.Unmarshal(nodesJSON, &out.Nodes); err != nil {
		return workflowResponse{}, err
	}
	return out, nil
}

var errInvalidWorkflow = errors.New("invalid workflow")

func decodeWorkflowBody(w http.ResponseWriter, r *http.Request) (workflow.Graph, error) {
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if err != nil {
		return workflow.Graph{}, err
	}
	if err := rejectDuplicateJSONKeys(raw); err != nil {
		return workflow.Graph{}, errInvalidWorkflow
	}
	var body struct {
		Name  string          `json:"name"`
		Nodes []workflow.Node `json:"nodes"`
	}
	if err := json.Unmarshal(raw, &body); err != nil {
		return workflow.Graph{}, errInvalidWorkflow
	}
	if body.Nodes == nil {
		return workflow.Graph{}, errInvalidWorkflow
	}
	return workflow.Graph{Name: body.Name, Nodes: body.Nodes}, nil
}
