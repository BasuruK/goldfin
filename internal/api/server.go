// Package api exposes checked Connector Saves without provider calls or Credential decryption.
package api

import (
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

	"github.com/BasuruK/goldfin/internal/jobs"
)

// SaveAttemptsPath is the create and polling collection for checked Saves.
const SaveAttemptsPath = "/api/v1/connector-save-attempts"

// ConnectorsPath exposes committed Connector metadata.
const ConnectorsPath = "/api/v1/connectors"

type server struct{ store *jobs.Store }

// NewHandler borrows the caller-owned Store and bounds database work to five seconds.
func NewHandler(store *jobs.Store) http.Handler {
	s := server{store: store}
	mux := http.NewServeMux()
	mux.HandleFunc("POST "+SaveAttemptsPath, s.stage)
	mux.HandleFunc("GET "+SaveAttemptsPath+"/{id}", s.getAttempt)
	mux.HandleFunc("GET "+ConnectorsPath, s.listConnectors)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		mux.ServeHTTP(w, r.WithContext(ctx))
	})
}

type proposalRequest struct {
	Name            string `json:"name"`
	ProviderType    string `json:"providerType"`
	BaseURL         string `json:"baseUrl"`
	Credential      string `json:"credential"`
	CredentialLabel string `json:"credentialLabel"`
}

type attemptResponse struct {
	ID          string           `json:"id"`
	State       string           `json:"state"`
	ConnectorID string           `json:"connectorId,omitempty"`
	Finding     *findingResponse `json:"finding,omitempty"`
	FailureCode string           `json:"failureCode,omitempty"`
}

type findingResponse struct {
	Kind       string `json:"kind"`
	HTTPStatus int16  `json:"httpStatus"`
	LatencyMS  int64  `json:"latencyMs"`
}

type connectorResponse struct {
	ID              string     `json:"id"`
	Name            string     `json:"name"`
	ProviderType    string     `json:"providerType"`
	BaseURL         string     `json:"baseUrl"`
	CredentialLabel string     `json:"credentialLabel,omitempty"`
	CredentialSetAt *time.Time `json:"credentialSetAt,omitempty"`
}

func (s *server) listConnectors(w http.ResponseWriter, r *http.Request) {
	connectors, err := s.store.ListConnectors(r.Context())
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not load Connectors."})
		return
	}
	out := make([]connectorResponse, 0, len(connectors))
	for _, c := range connectors {
		out = append(out, connectorResponse{ID: c.ID, Name: c.Name, ProviderType: c.ProviderType,
			BaseURL: c.BaseURL, CredentialLabel: c.CredentialLabel, CredentialSetAt: c.CredentialSetAt})
	}
	writeJSON(w, http.StatusOK, struct {
		Connectors []connectorResponse `json:"connectors"`
	}{Connectors: out})
}

func (s *server) getAttempt(w http.ResponseWriter, r *http.Request) {
	attempt, err := s.store.Get(r.Context(), r.PathValue("id"))
	if errors.Is(err, jobs.ErrNotFound) {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Save attempt not found."})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not load Save attempt."})
		return
	}
	out := attemptResponse{ID: attempt.ID, State: attempt.State, ConnectorID: attempt.ConnectorID, FailureCode: attempt.FailureCode}
	if attempt.FindingKind != "" {
		out.Finding = &findingResponse{Kind: attempt.FindingKind, HTTPStatus: attempt.HTTPStatus, LatencyMS: attempt.LatencyMS}
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *server) stage(w http.ResponseWriter, r *http.Request) {
	in, err := decodeProposal(w, r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid Save proposal."})
		return
	}
	id, err := s.store.Stage(r.Context(), jobs.Proposal{
		Name: in.Name, BaseURL: in.BaseURL, Credential: in.Credential, CredentialLabel: in.CredentialLabel,
	})
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not queue Save."})
		return
	}
	w.Header().Set("Location", SaveAttemptsPath+"/"+id)
	writeJSON(w, http.StatusAccepted, attemptResponse{ID: id, State: "queued"})
}

func decodeProposal(w http.ResponseWriter, r *http.Request) (proposalRequest, error) {
	invalid := errors.New("invalid Save proposal")
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		return proposalRequest{}, invalid
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
	if token, err := decoder.Token(); err != nil || token != json.Delim('{') {
		return proposalRequest{}, invalid
	}
	var in proposalRequest
	fields := map[string]*string{
		"name": &in.Name, "providerType": &in.ProviderType, "baseUrl": &in.BaseURL,
		"credential": &in.Credential, "credentialLabel": &in.CredentialLabel,
	}
	for decoder.More() {
		token, err := decoder.Token()
		if err != nil {
			return proposalRequest{}, invalid
		}
		name, ok := token.(string)
		if !ok || fields[name] == nil {
			return proposalRequest{}, invalid
		}
		var value any
		if err := decoder.Decode(&value); err != nil {
			return proposalRequest{}, invalid
		}
		text, ok := value.(string)
		if !ok {
			return proposalRequest{}, invalid
		}
		*fields[name] = text
		delete(fields, name) // Reject duplicate fields rather than silently picking one.
	}
	if _, err := decoder.Token(); err != nil {
		return proposalRequest{}, invalid
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		return proposalRequest{}, invalid
	}
	in.Name = strings.TrimSpace(in.Name)
	in.ProviderType = strings.TrimSpace(in.ProviderType)
	in.BaseURL = strings.TrimSpace(in.BaseURL)
	in.CredentialLabel = strings.TrimSpace(in.CredentialLabel)
	if in.Name == "" || in.ProviderType != "web_request" ||
		(in.Credential != "" && in.CredentialLabel == "") || (in.Credential == "" && in.CredentialLabel != "") ||
		strings.ContainsFunc(in.Credential, unicode.IsControl) {
		return proposalRequest{}, invalid
	}
	endpoint, err := url.Parse(in.BaseURL)
	if err != nil || endpoint.Hostname() == "" || endpoint.User != nil || endpoint.Fragment != "" ||
		(endpoint.Scheme != "http" && endpoint.Scheme != "https") ||
		(in.Credential != "" && endpoint.Scheme != "https") {
		return proposalRequest{}, invalid
	}
	if port := endpoint.Port(); port != "" {
		n, err := strconv.Atoi(port)
		if err != nil || n < 1 || n > 65535 {
			return proposalRequest{}, invalid
		}
	}
	query, err := url.ParseQuery(endpoint.RawQuery)
	if err != nil {
		return proposalRequest{}, invalid
	}
	for key := range query {
		switch strings.ToLower(key) {
		case "api_key", "token", "access_token", "sig", "key", "subscription-key", "x-amz-signature":
			return proposalRequest{}, invalid
		}
	}
	return in, nil
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
