package api

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const connectorItemPattern = "PUT " + ConnectorsPath + "/{id}"
const connectorDeletePattern = "DELETE " + ConnectorsPath + "/{id}"

type storedConnector struct {
	ID                   string
	Name                 string
	ProviderType         string
	BaseURL              string
	APIVersion           string
	LLMApiMode           string
	CredentialLabel      string
	CredentialCiphertext []byte
	CredentialSetAt      *time.Time
}

type connectorEditContext struct {
	hasStoredCredential bool
	existingProvider    string
	existingLabel       string
}

func (s *server) registerConnectorItemRoutes(mux *http.ServeMux) {
	mux.HandleFunc(connectorItemPattern, s.updateConnector)
	mux.HandleFunc(connectorDeletePattern, s.deleteConnector)
}

func (s *server) loadStoredConnector(ctx context.Context, id string) (storedConnector, error) {
	var c storedConnector
	err := s.pool.QueryRow(ctx, `
		SELECT id, name, provider_type, base_url, COALESCE(api_version, ''), COALESCE(llm_api_mode, ''),
		       COALESCE(credential_label, ''), credential_ciphertext, credential_set_at
		FROM connectors WHERE id = $1`, id,
	).Scan(&c.ID, &c.Name, &c.ProviderType, &c.BaseURL, &c.APIVersion, &c.LLMApiMode,
		&c.CredentialLabel, &c.CredentialCiphertext, &c.CredentialSetAt)
	return c, err
}

func (s *server) connectorModels(ctx context.Context, id string) ([]connectorModelResponse, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT model_id, enabled FROM connector_models
		WHERE connector_id = $1 ORDER BY model_id`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []connectorModelResponse{}
	for rows.Next() {
		var model connectorModelResponse
		if err := rows.Scan(&model.ID, &model.Enabled); err != nil {
			return nil, err
		}
		out = append(out, model)
	}
	return out, rows.Err()
}

func storedToResponse(c storedConnector, models []connectorModelResponse) connectorResponse {
	out := connectorResponse{
		ID:              c.ID,
		Name:            c.Name,
		ProviderType:    c.ProviderType,
		BaseURL:         c.BaseURL,
		APIVersion:      c.APIVersion,
		LLMApiMode:      c.LLMApiMode,
		CredentialLabel: c.CredentialLabel,
		CredentialSetAt: c.CredentialSetAt,
	}
	if len(models) > 0 {
		out.Models = models
	}
	return out
}

func credentialForURLCheck(credential string, edit *connectorEditContext) string {
	if credential != "" {
		return credential
	}
	if edit != nil && edit.hasStoredCredential {
		return "stored"
	}
	return ""
}

func credentialFieldsValid(in connectorRequest, edit *connectorEditContext) bool {
	if edit == nil {
		return (in.Credential == "" && in.CredentialLabel == "") ||
			(in.Credential != "" && in.CredentialLabel != "")
	}
	if in.Credential != "" {
		if in.CredentialLabel != "" {
			return true
		}
		return edit.existingLabel != ""
	}
	return true
}

func storedCredentialRequired(in connectorRequest, edit *connectorEditContext) bool {
	if edit == nil {
		return in.Credential == ""
	}
	return in.Credential == "" && !edit.hasStoredCredential
}

func (s *server) updateConnector(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Connector not found."})
		return
	}
	existing, err := s.loadStoredConnector(r.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Connector not found."})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not update the Connector."})
		return
	}
	body, err := readConnectorBody(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid Connector."})
		return
	}
	edit := &connectorEditContext{
		hasStoredCredential: len(existing.CredentialCiphertext) > 0,
		existingProvider:    existing.ProviderType,
		existingLabel:       existing.CredentialLabel,
	}
	in, err := decodeConnectorBody(body, edit)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid Connector."})
		return
	}
	if in.ProviderType != "" && in.ProviderType != existing.ProviderType {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid Connector."})
		return
	}
	in.ProviderType = existing.ProviderType
	tx, err := s.pool.Begin(r.Context())
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not update the Connector."})
		return
	}
	ctx := r.Context()
	defer func() { _ = tx.Rollback(ctx) }()

	var label *string
	var ciphertext = existing.CredentialCiphertext
	var setAt = existing.CredentialSetAt
	labelText := existing.CredentialLabel
	if in.CredentialLabel != "" {
		labelText = in.CredentialLabel
	}
	if in.Credential != "" {
		ciphertext, err = s.box.Encrypt([]byte(in.Credential))
		if err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not update the Connector."})
			return
		}
		now := time.Now().UTC().Truncate(time.Microsecond)
		setAt = &now
	}
	if labelText != "" {
		label = &labelText
	}
	var apiVersion *string
	var llmMode *string
	if in.APIVersion != "" {
		apiVersion = &in.APIVersion
	}
	if in.LLMApiMode != "" {
		llmMode = &in.LLMApiMode
	}
	tag, err := tx.Exec(ctx, `
		UPDATE connectors
		SET name = $2, base_url = $3, api_version = $4, llm_api_mode = $5,
		    credential_label = $6, credential_ciphertext = $7, credential_set_at = $8
		WHERE id = $1`,
		id, in.Name, in.BaseURL, apiVersion, llmMode, label, ciphertext, setAt)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not update the Connector."})
		return
	}
	if tag.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Connector not found."})
		return
	}
	if hasManualModels(in.ProviderType) {
		if _, err := tx.Exec(ctx, `DELETE FROM connector_models WHERE connector_id = $1`, id); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not update the Connector."})
			return
		}
		for _, model := range in.Models {
			if _, err := tx.Exec(ctx, `
				INSERT INTO connector_models (connector_id, model_id, enabled, source)
				VALUES ($1, $2, $3, 'manual')`, id, model.ID, model.Enabled); err != nil {
				writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not update the Connector."})
				return
			}
		}
	}
	if err := tx.Commit(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not update the Connector."})
		return
	}
	updated, err := s.loadStoredConnector(ctx, id)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not update the Connector."})
		return
	}
	models, err := s.connectorModels(ctx, id)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not update the Connector."})
		return
	}
	writeJSON(w, http.StatusOK, storedToResponse(updated, models))
}

func (s *server) deleteConnector(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Connector not found."})
		return
	}
	_, err := s.loadStoredConnector(r.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Connector not found."})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not delete the Connector."})
		return
	}
	rows, err := s.pool.Query(r.Context(), `
		SELECT name FROM workflows
		WHERE EXISTS (
			SELECT 1 FROM jsonb_array_elements(nodes_json) AS n(node)
			WHERE n.node->>'connectorId' = $1
		)
		ORDER BY name`, id)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not delete the Connector."})
		return
	}
	defer rows.Close()
	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not delete the Connector."})
			return
		}
		names = append(names, name)
	}
	if err := rows.Err(); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not delete the Connector."})
		return
	}
	if len(names) > 0 {
		writeJSON(w, http.StatusConflict, map[string]string{
			"message": fmt.Sprintf("Cannot delete Connector because it is used by Workflow: %s", strings.Join(names, ", ")),
		})
		return
	}
	tag, err := s.pool.Exec(r.Context(), `DELETE FROM connectors WHERE id = $1`, id)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not delete the Connector."})
		return
	}
	if tag.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Connector not found."})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func readConnectorBody(r *http.Request) ([]byte, error) {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		return nil, errors.New("invalid content type")
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 64<<10))
	if err != nil {
		return nil, err
	}
	if err := rejectDuplicateJSONKeys(body); err != nil {
		return nil, err
	}
	return body, nil
}
