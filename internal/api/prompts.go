package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
)

const (
	PromptsPath           = "/api/v1/prompts"
	promptMaxNameRunes    = 80
	promptMaxContentBytes = 512 * 1024
)

type promptVersionResponse struct {
	ID        string    `json:"id"`
	Version   int       `json:"version"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"createdAt"`
}

type promptResponse struct {
	ID             string                 `json:"id"`
	Name           string                 `json:"name"`
	CreatedAt      time.Time              `json:"createdAt"`
	LatestVersion  *promptVersionResponse `json:"latestVersion,omitempty"`
}

func (s *server) registerPromptRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET "+PromptsPath, s.listPrompts)
	mux.HandleFunc("POST "+PromptsPath, s.createPrompt)
	mux.HandleFunc("PATCH /api/v1/prompts/{id}", s.renamePrompt)
	mux.HandleFunc("POST /api/v1/prompts/{id}/versions", s.appendPromptVersion)
}

func (s *server) listPrompts(w http.ResponseWriter, r *http.Request) {
	rows, err := s.pool.Query(r.Context(), `
		SELECT p.id, p.name, p.created_at,
		       v.id, v.version, v.content, v.created_at
		FROM prompts p
		LEFT JOIN LATERAL (
			SELECT id, version, content, created_at
			FROM prompt_versions
			WHERE prompt_id = p.id
			ORDER BY version DESC
			LIMIT 1
		) v ON true
		ORDER BY p.created_at, p.id`)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not load Prompts."})
		return
	}
	defer rows.Close()
	out := []promptResponse{}
	for rows.Next() {
		var p promptResponse
		var versionID *string
		var versionNum *int
		var content *string
		var versionCreated *time.Time
		if err := rows.Scan(&p.ID, &p.Name, &p.CreatedAt, &versionID, &versionNum, &content, &versionCreated); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not load Prompts."})
			return
		}
		if versionID != nil {
			p.LatestVersion = &promptVersionResponse{
				ID:        *versionID,
				Version:   *versionNum,
				Content:   *content,
				CreatedAt: *versionCreated,
			}
		}
		out = append(out, p)
	}
	if err := rows.Err(); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not load Prompts."})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"prompts": out})
}

func (s *server) createPrompt(w http.ResponseWriter, r *http.Request) {
	name, content, err := decodePromptCreate(w, r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid Prompt."})
		return
	}
	out, err := s.insertPromptWithFirstVersion(r, name, content)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not save the Prompt."})
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

func (s *server) renamePrompt(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid Prompt."})
		return
	}
	name, err := decodePromptRename(w, r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid Prompt."})
		return
	}
	out, err := s.updatePromptName(r, id, name)
	if errors.Is(err, errPromptNotFound) {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Prompt not found."})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not save the Prompt."})
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *server) appendPromptVersion(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid Prompt."})
		return
	}
	content, err := decodePromptVersionBody(w, r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid Prompt."})
		return
	}
	out, err := s.insertPromptVersion(r, id, content)
	if errors.Is(err, errPromptNotFound) {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Prompt not found."})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Could not save the Prompt."})
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

var errPromptNotFound = errors.New("prompt not found")

func (s *server) insertPromptWithFirstVersion(r *http.Request, name, content string) (promptResponse, error) {
	tx, err := s.pool.Begin(r.Context())
	if err != nil {
		return promptResponse{}, err
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	var out promptResponse
	err = tx.QueryRow(r.Context(), `
		INSERT INTO prompts (name) VALUES ($1)
		RETURNING id, name, created_at`, name,
	).Scan(&out.ID, &out.Name, &out.CreatedAt)
	if err != nil {
		return promptResponse{}, err
	}
	createdAt := time.Now().UTC().Truncate(time.Microsecond)
	var version promptVersionResponse
	err = tx.QueryRow(r.Context(), `
		INSERT INTO prompt_versions (prompt_id, version, content, created_at)
		VALUES ($1, 1, $2, $3)
		RETURNING id, version, content, created_at`, out.ID, content, createdAt,
	).Scan(&version.ID, &version.Version, &version.Content, &version.CreatedAt)
	if err != nil {
		return promptResponse{}, err
	}
	out.LatestVersion = &version
	if err := tx.Commit(r.Context()); err != nil {
		return promptResponse{}, err
	}
	return out, nil
}

func (s *server) insertPromptVersion(r *http.Request, promptID, content string) (promptResponse, error) {
	tx, err := s.pool.Begin(r.Context())
	if err != nil {
		return promptResponse{}, err
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	var out promptResponse
	err = tx.QueryRow(r.Context(), `
		SELECT id, name, created_at FROM prompts WHERE id = $1 FOR UPDATE`, promptID,
	).Scan(&out.ID, &out.Name, &out.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return promptResponse{}, errPromptNotFound
	}
	if err != nil {
		return promptResponse{}, err
	}
	var nextVersion int
	if err := tx.QueryRow(r.Context(), `
		SELECT COALESCE(MAX(version), 0) + 1 FROM prompt_versions WHERE prompt_id = $1`, promptID,
	).Scan(&nextVersion); err != nil {
		return promptResponse{}, err
	}
	createdAt := time.Now().UTC().Truncate(time.Microsecond)
	var version promptVersionResponse
	err = tx.QueryRow(r.Context(), `
		INSERT INTO prompt_versions (prompt_id, version, content, created_at)
		VALUES ($1, $2, $3, $4)
		RETURNING id, version, content, created_at`, promptID, nextVersion, content, createdAt,
	).Scan(&version.ID, &version.Version, &version.Content, &version.CreatedAt)
	if err != nil {
		return promptResponse{}, err
	}
	out.LatestVersion = &version
	if err := tx.Commit(r.Context()); err != nil {
		return promptResponse{}, err
	}
	return out, nil
}

func (s *server) updatePromptName(r *http.Request, promptID, name string) (promptResponse, error) {
	var out promptResponse
	err := s.pool.QueryRow(r.Context(), `
		UPDATE prompts SET name = $2 WHERE id = $1
		RETURNING id, name, created_at`, promptID, name,
	).Scan(&out.ID, &out.Name, &out.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return promptResponse{}, errPromptNotFound
	}
	if err != nil {
		return promptResponse{}, err
	}
	version, err := s.loadLatestVersion(r.Context(), promptID)
	if err != nil {
		return promptResponse{}, err
	}
	out.LatestVersion = version
	return out, nil
}

func (s *server) loadLatestVersion(ctx context.Context, promptID string) (*promptVersionResponse, error) {
	var v promptVersionResponse
	err := s.pool.QueryRow(ctx, `
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

func decodePromptCreate(w http.ResponseWriter, r *http.Request) (string, string, error) {
	body, err := readPromptBody(w, r)
	if err != nil {
		return "", "", err
	}
	name, ok := body["name"].(string)
	if !ok {
		return "", "", errInvalidPrompt
	}
	content, ok := body["content"].(string)
	if !ok {
		return "", "", errInvalidPrompt
	}
	return normalizePromptName(name), content, validatePromptFields(normalizePromptName(name), content)
}

func decodePromptRename(w http.ResponseWriter, r *http.Request) (string, error) {
	body, err := readPromptBody(w, r)
	if err != nil {
		return "", err
	}
	name, ok := body["name"].(string)
	if !ok {
		return "", errInvalidPrompt
	}
	name = normalizePromptName(name)
	if err := validatePromptName(name); err != nil {
		return "", err
	}
	return name, nil
}

func decodePromptVersionBody(w http.ResponseWriter, r *http.Request) (string, error) {
	body, err := readPromptBody(w, r)
	if err != nil {
		return "", err
	}
	content, ok := body["content"].(string)
	if !ok {
		return "", errInvalidPrompt
	}
	if err := validatePromptContent(content); err != nil {
		return "", err
	}
	return content, nil
}

func readPromptBody(w http.ResponseWriter, r *http.Request) (map[string]any, error) {
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if err := rejectDuplicateJSONKeys(raw); err != nil {
		return nil, errInvalidPrompt
	}
	var body map[string]any
	if err := json.Unmarshal(raw, &body); err != nil {
		return nil, errInvalidPrompt
	}
	return body, nil
}

var errInvalidPrompt = errors.New("invalid prompt")

func normalizePromptName(name string) string {
	return strings.TrimSpace(name)
}

func validatePromptFields(name, content string) error {
	if err := validatePromptName(name); err != nil {
		return err
	}
	return validatePromptContent(content)
}

func validatePromptName(name string) error {
	if name == "" || utf8.RuneCountInString(name) > promptMaxNameRunes {
		return errInvalidPrompt
	}
	return nil
}

func validatePromptContent(content string) error {
	if len(content) > promptMaxContentBytes {
		return errInvalidPrompt
	}
	return nil
}
