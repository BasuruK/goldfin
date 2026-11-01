// Package api saves and lists Connectors. It encrypts a Credential on write and never decrypts one.
package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/BasuruK/goldfin/internal/secretbox"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ConnectorsPath is the create and list collection for Connectors.
const ConnectorsPath = "/api/v1/connectors"

const (
	defaultAzureAPIVersion = "2024-11-30"
	llmModeResponses       = "responses"
	llmModeChat            = "chat_completions"
)

type server struct {
	pool *pgxpool.Pool
	box  *secretbox.Box
}

// NewHandler borrows the caller-owned pool and bounds database work to five seconds.
func NewHandler(pool *pgxpool.Pool, box *secretbox.Box) http.Handler {
	s := server{pool: pool, box: box}
	mux := http.NewServeMux()
	mux.HandleFunc("POST "+ConnectorsPath, s.createConnector)
	mux.HandleFunc("GET "+ConnectorsPath, s.listConnectors)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		mux.ServeHTTP(w, r.WithContext(ctx))
	})
}

type connectorModelRequest struct {
	ID      string
	Enabled bool
}

type connectorRequest struct {
	Name            string
	ProviderType    string
	BaseURL         string
	APIVersion      string
	Credential      string
	CredentialLabel string
	LLMApiMode      string
	Models          []connectorModelRequest
}

type connectorModelResponse struct {
	ID      string `json:"id"`
	Enabled bool   `json:"enabled"`
}

// connectorResponse carries no value-derived Credential detail, only its label and when it was set.
type connectorResponse struct {
	ID              string                   `json:"id"`
	Name            string                   `json:"name"`
	ProviderType    string                   `json:"providerType"`
	BaseURL         string                   `json:"baseUrl"`
	APIVersion      string                   `json:"apiVersion,omitempty"`
	LLMApiMode      string                   `json:"llmApiMode,omitempty"`
	Models          []connectorModelResponse `json:"models,omitempty"`
	CredentialLabel string                   `json:"credentialLabel,omitempty"`
	CredentialSetAt *time.Time               `json:"credentialSetAt,omitempty"`
}

func isLLMProvider(providerType string) bool {
	switch providerType {
	case "openai", "openai_compatible":
		return true
	default:
		return false
	}
}

func defaultLLMApiMode(providerType string) string {
	if providerType == "openai_compatible" {
		return llmModeChat
	}
	return llmModeResponses
}

// ponytail: create only, no save-time check; edits and a worker check return with their ADR 0013 triggers.
func (s *server) createConnector(w http.ResponseWriter, r *http.Request) {
	in, err := decodeConnector(w, r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid Connector."})
		return
	}
	out := connectorResponse{
		Name:         in.Name,
		ProviderType: in.ProviderType,
		BaseURL:      in.BaseURL,
		APIVersion:   in.APIVersion,
		LLMApiMode:   in.LLMApiMode,
	}
	if isLLMProvider(in.ProviderType) {
		out.Models = make([]connectorModelResponse, len(in.Models))
		for i, model := range in.Models {
			out.Models[i] = connectorModelResponse{ID: model.ID, Enabled: model.Enabled}
		}
	}
	var label *string
	var ciphertext []byte
	var apiVersion *string
	var llmMode *string
	if in.APIVersion != "" {
		apiVersion = &in.APIVersion
	}
	if in.LLMApiMode != "" {
		llmMode = &in.LLMApiMode
	}
	if in.Credential != "" {
		if ciphertext, err = s.box.Encrypt([]byte(in.Credential)); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not save the Connector."})
			return
		}
		setAt := time.Now().UTC().Truncate(time.Microsecond) // Postgres precision, so create and list agree.
		label, out.CredentialLabel, out.CredentialSetAt = &in.CredentialLabel, in.CredentialLabel, &setAt
	}
	tx, err := s.pool.Begin(r.Context())
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not save the Connector."})
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	err = tx.QueryRow(r.Context(), `
		INSERT INTO connectors (name, provider_type, base_url, api_version, llm_api_mode, credential_label, credential_ciphertext, credential_set_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id`,
		in.Name, in.ProviderType, in.BaseURL, apiVersion, llmMode, label, ciphertext, out.CredentialSetAt,
	).Scan(&out.ID)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not save the Connector."})
		return
	}
	for _, model := range in.Models {
		if _, err := tx.Exec(r.Context(), `
			INSERT INTO connector_models (connector_id, model_id, enabled, source)
			VALUES ($1, $2, $3, 'manual')`, out.ID, model.ID, model.Enabled); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not save the Connector."})
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not save the Connector."})
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

func (s *server) listConnectors(w http.ResponseWriter, r *http.Request) {
	rows, err := s.pool.Query(r.Context(), `
		SELECT id, name, provider_type, base_url, COALESCE(api_version, ''), COALESCE(llm_api_mode, ''), COALESCE(credential_label, ''), credential_set_at
		FROM connectors
		ORDER BY created_at, id`)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not load Connectors."})
		return
	}
	defer rows.Close()
	out := []connectorResponse{}
	ids := []string{}
	for rows.Next() {
		var c connectorResponse
		if err := rows.Scan(&c.ID, &c.Name, &c.ProviderType, &c.BaseURL, &c.APIVersion, &c.LLMApiMode, &c.CredentialLabel, &c.CredentialSetAt); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not load Connectors."})
			return
		}
		out = append(out, c)
		ids = append(ids, c.ID)
	}
	if rows.Err() != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not load Connectors."})
		return
	}
	if len(ids) > 0 {
		modelRows, err := s.pool.Query(r.Context(), `
			SELECT connector_id, model_id, enabled
			FROM connector_models
			WHERE connector_id = ANY($1)
			ORDER BY connector_id, model_id`, ids)
		if err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not load Connectors."})
			return
		}
		defer modelRows.Close()
		byConnector := map[string][]connectorModelResponse{}
		for modelRows.Next() {
			var connectorID, modelID string
			var enabled bool
			if err := modelRows.Scan(&connectorID, &modelID, &enabled); err != nil {
				writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not load Connectors."})
				return
			}
			byConnector[connectorID] = append(byConnector[connectorID], connectorModelResponse{ID: modelID, Enabled: enabled})
		}
		if modelRows.Err() != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not load Connectors."})
			return
		}
		for i := range out {
			if models, ok := byConnector[out[i].ID]; ok {
				out[i].Models = models
			}
		}
	}
	writeJSON(w, http.StatusOK, struct {
		Connectors []connectorResponse `json:"connectors"`
	}{Connectors: out})
}

func decodeConnector(w http.ResponseWriter, r *http.Request) (connectorRequest, error) {
	invalid := errors.New("invalid Connector")
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		return connectorRequest{}, invalid
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 64<<10))
	if err != nil {
		return connectorRequest{}, invalid
	}
	if err := rejectDuplicateJSONKeys(body); err != nil {
		return connectorRequest{}, invalid
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		return connectorRequest{}, invalid
	}
	allowed := map[string]struct{}{
		"name": {}, "providerType": {}, "baseUrl": {}, "apiVersion": {},
		"credential": {}, "credentialLabel": {}, "llmApiMode": {}, "models": {},
	}
	for key := range raw {
		if _, ok := allowed[key]; !ok {
			return connectorRequest{}, invalid
		}
	}
	readString := func(key string) (string, error) {
		value, ok := raw[key]
		if !ok {
			return "", nil
		}
		var text string
		if err := json.Unmarshal(value, &text); err != nil {
			return "", invalid
		}
		return text, nil
	}
	var in connectorRequest
	var errField error
	in.Name, errField = readString("name")
	if errField != nil {
		return connectorRequest{}, invalid
	}
	in.ProviderType, errField = readString("providerType")
	if errField != nil {
		return connectorRequest{}, invalid
	}
	in.BaseURL, errField = readString("baseUrl")
	if errField != nil {
		return connectorRequest{}, invalid
	}
	in.APIVersion, errField = readString("apiVersion")
	if errField != nil {
		return connectorRequest{}, invalid
	}
	in.Credential, errField = readString("credential")
	if errField != nil {
		return connectorRequest{}, invalid
	}
	in.CredentialLabel, errField = readString("credentialLabel")
	if errField != nil {
		return connectorRequest{}, invalid
	}
	in.LLMApiMode, errField = readString("llmApiMode")
	if errField != nil {
		return connectorRequest{}, invalid
	}
	if modelsRaw, ok := raw["models"]; ok {
		if in.Models, err = parseModels(modelsRaw); err != nil {
			return connectorRequest{}, invalid
		}
	}
	in.Name = strings.TrimSpace(in.Name)
	in.ProviderType = strings.TrimSpace(in.ProviderType)
	in.BaseURL = strings.TrimSpace(in.BaseURL)
	in.APIVersion = strings.TrimSpace(in.APIVersion)
	in.CredentialLabel = strings.TrimSpace(in.CredentialLabel)
	in.LLMApiMode = strings.TrimSpace(in.LLMApiMode)
	if in.Name == "" || strings.ContainsFunc(in.Credential, unicode.IsControl) {
		return connectorRequest{}, invalid
	}
	switch in.ProviderType {
	case "web_request":
		if in.APIVersion != "" || in.LLMApiMode != "" || len(in.Models) > 0 ||
			(in.Credential != "" && in.CredentialLabel == "") || (in.Credential == "" && in.CredentialLabel != "") {
			return connectorRequest{}, invalid
		}
		if err := validateBaseURL(in.BaseURL, in.Credential, true); err != nil {
			return connectorRequest{}, invalid
		}
	case "azure_document_intelligence":
		if in.LLMApiMode != "" || len(in.Models) > 0 {
			return connectorRequest{}, invalid
		}
		if in.APIVersion == "" {
			in.APIVersion = defaultAzureAPIVersion
		}
		if in.Credential == "" || in.CredentialLabel == "" {
			return connectorRequest{}, invalid
		}
		if err := validateBaseURL(in.BaseURL, in.Credential, false); err != nil {
			return connectorRequest{}, invalid
		}
	case "openai", "openai_compatible":
		if in.APIVersion != "" {
			return connectorRequest{}, invalid
		}
		if in.Credential == "" || in.CredentialLabel == "" {
			return connectorRequest{}, invalid
		}
		if in.LLMApiMode == "" {
			in.LLMApiMode = defaultLLMApiMode(in.ProviderType)
		}
		if in.LLMApiMode != llmModeResponses && in.LLMApiMode != llmModeChat {
			return connectorRequest{}, invalid
		}
		if err := validateLLMModels(in.Models); err != nil {
			return connectorRequest{}, invalid
		}
		if err := validateBaseURL(in.BaseURL, in.Credential, false); err != nil {
			return connectorRequest{}, invalid
		}
	default:
		return connectorRequest{}, invalid
	}
	return in, nil
}

func parseModels(raw json.RawMessage) ([]connectorModelRequest, error) {
	invalid := errors.New("invalid models")
	var items []json.RawMessage
	if err := json.Unmarshal(raw, &items); err != nil {
		return nil, invalid
	}
	out := make([]connectorModelRequest, 0, len(items))
	seen := map[string]struct{}{}
	for _, item := range items {
		var fields map[string]json.RawMessage
		if err := json.Unmarshal(item, &fields); err != nil {
			return nil, invalid
		}
		if len(fields) != 2 {
			return nil, invalid
		}
		idRaw, ok := fields["id"]
		if !ok {
			return nil, invalid
		}
		enabledRaw, ok := fields["enabled"]
		if !ok {
			return nil, invalid
		}
		var id string
		if err := json.Unmarshal(idRaw, &id); err != nil {
			return nil, invalid
		}
		id = strings.TrimSpace(id)
		if id == "" {
			return nil, invalid
		}
		var enabled bool
		if err := json.Unmarshal(enabledRaw, &enabled); err != nil {
			return nil, invalid
		}
		if _, dup := seen[id]; dup {
			return nil, invalid
		}
		seen[id] = struct{}{}
		out = append(out, connectorModelRequest{ID: id, Enabled: enabled})
	}
	return out, nil
}

var errInvalidModels = errors.New("invalid models")

func validateLLMModels(models []connectorModelRequest) error {
	if len(models) == 0 {
		return errInvalidModels
	}
	enabled := 0
	for _, model := range models {
		if model.Enabled {
			enabled++
		}
	}
	if enabled == 0 {
		return errInvalidModels
	}
	return nil
}

func rejectDuplicateJSONKeys(body []byte) error {
	dec := json.NewDecoder(bytes.NewReader(body))
	token, err := dec.Token()
	if err != nil || token != json.Delim('{') {
		return errInvalidBaseURL
	}
	seen := map[string]struct{}{}
	for dec.More() {
		keyToken, err := dec.Token()
		if err != nil {
			return errInvalidBaseURL
		}
		key, ok := keyToken.(string)
		if !ok {
			return errInvalidBaseURL
		}
		if _, dup := seen[key]; dup {
			return errInvalidBaseURL
		}
		seen[key] = struct{}{}
		var skip json.RawMessage
		if err := dec.Decode(&skip); err != nil {
			return errInvalidBaseURL
		}
	}
	if _, err := dec.Token(); err != nil {
		return errInvalidBaseURL
	}
	if err := dec.Decode(new(any)); !errors.Is(err, io.EOF) {
		return errInvalidBaseURL
	}
	return nil
}

var errInvalidBaseURL = errors.New("invalid base URL")

func validateBaseURL(raw, credential string, allowHTTPWithoutCredential bool) error {
	endpoint, err := url.Parse(raw)
	if err != nil || endpoint.Hostname() == "" || endpoint.User != nil || endpoint.Fragment != "" {
		return errInvalidBaseURL
	}
	switch endpoint.Scheme {
	case "https":
	case "http":
		if !allowHTTPWithoutCredential || credential != "" {
			return errInvalidBaseURL
		}
	default:
		return errInvalidBaseURL
	}
	if port := endpoint.Port(); port != "" {
		n, err := strconv.Atoi(port)
		if err != nil || n < 1 || n > 65535 {
			return errInvalidBaseURL
		}
	}
	query, err := url.ParseQuery(endpoint.RawQuery)
	if err != nil {
		return errInvalidBaseURL
	}
	for key := range query {
		switch strings.ToLower(key) {
		case "api_key", "token", "access_token", "sig", "key", "subscription-key", "x-amz-signature":
			return errInvalidBaseURL
		}
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
