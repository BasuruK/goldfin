package api

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/BasuruK/goldfin/internal/jobs"
)

type Server struct {
	store  *jobs.Store
	logger *slog.Logger
}

func NewServer(store *jobs.Store, logger *slog.Logger) *Server {
	return &Server{store: store, logger: logger}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/v1/model-discovery/attempts", s.postCatalogAttempt)
	mux.HandleFunc("GET /api/v1/model-discovery/attempts/{id}", s.getAttempt)
	mux.HandleFunc("POST /api/v1/model-verification/attempts", s.postVerifyAttempt)
	mux.HandleFunc("GET /api/v1/model-verification/attempts/{id}", s.getVerifyAttempt)
	return mux
}

type attemptResponse struct {
	ID     string          `json:"id"`
	Status string          `json:"status"`
	Result json.RawMessage `json:"result,omitempty"`
}

func (s *Server) postCatalogAttempt(w http.ResponseWriter, r *http.Request) {
	in, err := decodeDiscoveryRequest(w, r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": err.Error()})
		return
	}
	id, err := s.store.CreateCatalog(r.Context(), jobs.CreateCatalogInput{
		ProviderType: in.ProviderType,
		BaseURL:      in.BaseURL,
		APIKey:       in.APIKey,
	})
	if err != nil {
		s.logger.Error("create catalog job", "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Could not queue discovery."})
		return
	}
	writeJSON(w, http.StatusAccepted, attemptResponse{ID: id, Status: "queued"})
}

func (s *Server) postVerifyAttempt(w http.ResponseWriter, r *http.Request) {
	in, err := decodeVerifyRequest(w, r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": err.Error()})
		return
	}
	id, err := s.store.CreateVerify(r.Context(), jobs.CreateVerifyInput{
		ProviderType: in.ProviderType,
		BaseURL:      in.BaseURL,
		APIKey:       in.APIKey,
		ModelID:      in.ModelID,
	})
	if err != nil {
		s.logger.Error("create verify job", "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Could not queue verification."})
		return
	}
	writeJSON(w, http.StatusAccepted, attemptResponse{ID: id, Status: "queued"})
}

func (s *Server) getAttempt(w http.ResponseWriter, r *http.Request) {
	s.writeJob(w, r, r.PathValue("id"))
}

func (s *Server) getVerifyAttempt(w http.ResponseWriter, r *http.Request) {
	s.writeJob(w, r, r.PathValue("id"))
}

func (s *Server) writeJob(w http.ResponseWriter, r *http.Request, id string) {
	job, err := s.store.Get(r.Context(), id)
	if errors.Is(err, jobs.ErrNotFound) {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Attempt not found."})
		return
	}
	if err != nil {
		s.logger.Error("get job", "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Could not load attempt."})
		return
	}
	resp := attemptResponse{ID: job.ID, Status: string(job.Status)}
	if job.Status == jobs.StatusFinished && len(job.Result) > 0 {
		resp.Result = job.Result
	}
	writeJSON(w, http.StatusOK, resp)
}

type discoveryRequest struct {
	ConnectorID  string `json:"connectorId"`
	ProviderType string `json:"providerType"`
	BaseURL      string `json:"baseUrl"`
	APIKey       string `json:"apiKey"`
}

type verifyRequest struct {
	ConnectorID  string `json:"connectorId"`
	ProviderType string `json:"providerType"`
	BaseURL      string `json:"baseUrl"`
	APIKey       string `json:"apiKey"`
	ModelID      string `json:"modelId"`
}

func decodeDiscoveryRequest(w http.ResponseWriter, r *http.Request) (discoveryRequest, error) {
	var in discoveryRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&in); err != nil {
		return discoveryRequest{}, errors.New("Invalid request body.")
	}
	in.ProviderType = strings.TrimSpace(in.ProviderType)
	in.BaseURL = strings.TrimSpace(in.BaseURL)
	if in.ProviderType == "" || in.BaseURL == "" {
		return discoveryRequest{}, errors.New("providerType and baseUrl are required.")
	}
	return in, nil
}

func decodeVerifyRequest(w http.ResponseWriter, r *http.Request) (verifyRequest, error) {
	var in verifyRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&in); err != nil {
		return verifyRequest{}, errors.New("Invalid request body.")
	}
	in.ProviderType = strings.TrimSpace(in.ProviderType)
	in.BaseURL = strings.TrimSpace(in.BaseURL)
	in.ModelID = strings.TrimSpace(in.ModelID)
	if in.ProviderType == "" || in.BaseURL == "" || in.ModelID == "" {
		return verifyRequest{}, errors.New("providerType, baseUrl and modelId are required.")
	}
	return in, nil
}

func writeJSON(w http.ResponseWriter, status int, body interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
