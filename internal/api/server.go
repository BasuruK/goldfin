// Package api saves and lists Connectors. It encrypts a Credential on write and never decrypts one.
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

	"github.com/BasuruK/goldfin/internal/secretbox"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ConnectorsPath is the create and list collection for Connectors.
const ConnectorsPath = "/api/v1/connectors"

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

type connectorRequest struct {
	Name            string `json:"name"`
	ProviderType    string `json:"providerType"`
	BaseURL         string `json:"baseUrl"`
	Credential      string `json:"credential"`
	CredentialLabel string `json:"credentialLabel"`
}

// connectorResponse carries no value-derived Credential detail, only its label and when it was set.
type connectorResponse struct {
	ID              string     `json:"id"`
	Name            string     `json:"name"`
	ProviderType    string     `json:"providerType"`
	BaseURL         string     `json:"baseUrl"`
	CredentialLabel string     `json:"credentialLabel,omitempty"`
	CredentialSetAt *time.Time `json:"credentialSetAt,omitempty"`
}

// ponytail: create only, no save-time check; edits and a worker check return with their ADR 0013 triggers.
func (s *server) createConnector(w http.ResponseWriter, r *http.Request) {
	in, err := decodeConnector(w, r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid Connector."})
		return
	}
	out := connectorResponse{Name: in.Name, ProviderType: in.ProviderType, BaseURL: in.BaseURL}
	var label *string
	var ciphertext []byte
	if in.Credential != "" {
		if ciphertext, err = s.box.Encrypt([]byte(in.Credential)); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not save the Connector."})
			return
		}
		setAt := time.Now().UTC().Truncate(time.Microsecond) // Postgres precision, so create and list agree.
		label, out.CredentialLabel, out.CredentialSetAt = &in.CredentialLabel, in.CredentialLabel, &setAt
	}
	err = s.pool.QueryRow(r.Context(), `
		INSERT INTO connectors (name, provider_type, base_url, credential_label, credential_ciphertext, credential_set_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id`,
		in.Name, in.ProviderType, in.BaseURL, label, ciphertext, out.CredentialSetAt,
	).Scan(&out.ID)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not save the Connector."})
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

func (s *server) listConnectors(w http.ResponseWriter, r *http.Request) {
	rows, err := s.pool.Query(r.Context(), `
		SELECT id, name, provider_type, base_url, COALESCE(credential_label, ''), credential_set_at
		FROM connectors
		ORDER BY created_at, id`)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not load Connectors."})
		return
	}
	defer rows.Close()
	out := []connectorResponse{}
	for rows.Next() {
		var c connectorResponse
		if err := rows.Scan(&c.ID, &c.Name, &c.ProviderType, &c.BaseURL, &c.CredentialLabel, &c.CredentialSetAt); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not load Connectors."})
			return
		}
		out = append(out, c)
	}
	if rows.Err() != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not load Connectors."})
		return
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
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
	if token, err := decoder.Token(); err != nil || token != json.Delim('{') {
		return connectorRequest{}, invalid
	}
	var in connectorRequest
	fields := map[string]*string{
		"name": &in.Name, "providerType": &in.ProviderType, "baseUrl": &in.BaseURL,
		"credential": &in.Credential, "credentialLabel": &in.CredentialLabel,
	}
	for decoder.More() {
		token, err := decoder.Token()
		if err != nil {
			return connectorRequest{}, invalid
		}
		name, ok := token.(string)
		if !ok || fields[name] == nil {
			return connectorRequest{}, invalid
		}
		var value any
		if err := decoder.Decode(&value); err != nil {
			return connectorRequest{}, invalid
		}
		text, ok := value.(string)
		if !ok {
			return connectorRequest{}, invalid
		}
		*fields[name] = text
		delete(fields, name) // Reject duplicate fields rather than silently picking one.
	}
	if _, err := decoder.Token(); err != nil {
		return connectorRequest{}, invalid
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		return connectorRequest{}, invalid
	}
	in.Name = strings.TrimSpace(in.Name)
	in.ProviderType = strings.TrimSpace(in.ProviderType)
	in.BaseURL = strings.TrimSpace(in.BaseURL)
	in.CredentialLabel = strings.TrimSpace(in.CredentialLabel)
	if in.Name == "" || in.ProviderType != "web_request" ||
		(in.Credential != "" && in.CredentialLabel == "") || (in.Credential == "" && in.CredentialLabel != "") ||
		strings.ContainsFunc(in.Credential, unicode.IsControl) {
		return connectorRequest{}, invalid
	}
	endpoint, err := url.Parse(in.BaseURL)
	if err != nil || endpoint.Hostname() == "" || endpoint.User != nil || endpoint.Fragment != "" ||
		(endpoint.Scheme != "http" && endpoint.Scheme != "https") ||
		(in.Credential != "" && endpoint.Scheme != "https") {
		return connectorRequest{}, invalid
	}
	if port := endpoint.Port(); port != "" {
		n, err := strconv.Atoi(port)
		if err != nil || n < 1 || n > 65535 {
			return connectorRequest{}, invalid
		}
	}
	query, err := url.ParseQuery(endpoint.RawQuery)
	if err != nil {
		return connectorRequest{}, invalid
	}
	for key := range query {
		switch strings.ToLower(key) {
		case "api_key", "token", "access_token", "sig", "key", "subscription-key", "x-amz-signature":
			return connectorRequest{}, invalid
		}
	}
	return in, nil
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
