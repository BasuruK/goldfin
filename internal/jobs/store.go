package jobs

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/BasuruK/goldfin/internal/secretbox"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Kind string

const (
	KindCatalog Kind = "catalog"
	KindVerify  Kind = "verify"
)

type Status string

const (
	StatusQueued   Status = "queued"
	StatusRunning  Status = "running"
	StatusFinished Status = "finished"
)

type Job struct {
	ID           string
	Kind         Kind
	Status       Status
	ProviderType string
	BaseURL      string
	ModelID      string
	Result       json.RawMessage
	SafeMessage  string
}

var ErrNotFound = errors.New("job not found")

type Store struct {
	pool *pgxpool.Pool
	key  []byte
}

func NewStore(pool *pgxpool.Pool, key []byte) *Store {
	return &Store{pool: pool, key: key}
}

type CreateCatalogInput struct {
	ProviderType string
	BaseURL      string
	APIKey       string
}

type CreateVerifyInput struct {
	ProviderType string
	BaseURL      string
	APIKey       string
	ModelID      string
}

func (s *Store) CreateCatalog(ctx context.Context, in CreateCatalogInput) (string, error) {
	return s.insert(ctx, KindCatalog, in.ProviderType, in.BaseURL, in.APIKey, "")
}

func (s *Store) CreateVerify(ctx context.Context, in CreateVerifyInput) (string, error) {
	return s.insert(ctx, KindVerify, in.ProviderType, in.BaseURL, in.APIKey, in.ModelID)
}

func (s *Store) insert(ctx context.Context, kind Kind, providerType, baseURL, apiKey, modelID string) (string, error) {
	ciphertext, err := secretbox.Encrypt(s.key, []byte(apiKey))
	if err != nil {
		return "", err
	}
	id := uuid.NewString()
	_, err = s.pool.Exec(ctx, `
		INSERT INTO discovery_jobs (id, kind, status, provider_type, base_url, credential_ciphertext, model_id)
		VALUES ($1, $2, 'queued', $3, $4, $5, NULLIF($6, ''))
	`, id, string(kind), providerType, baseURL, ciphertext, modelID)
	return id, err
}

func (s *Store) Get(ctx context.Context, id string) (Job, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT id, kind, status, provider_type, base_url, COALESCE(model_id, ''), result_json, COALESCE(safe_message, '')
		FROM discovery_jobs WHERE id = $1
	`, id)
	var job Job
	var result []byte
	var kind, status string
	err := row.Scan(&job.ID, &kind, &status, &job.ProviderType, &job.BaseURL, &job.ModelID, &result, &job.SafeMessage)
	if errors.Is(err, pgx.ErrNoRows) {
		return Job{}, ErrNotFound
	}
	if err != nil {
		return Job{}, err
	}
	job.Kind = Kind(kind)
	job.Status = Status(status)
	if len(result) > 0 {
		job.Result = result
	}
	return job, nil
}

func (s *Store) ClaimNext(ctx context.Context) (Job, []byte, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Job{}, nil, err
	}
	defer tx.Rollback(ctx)

	row := tx.QueryRow(ctx, `
		SELECT id, kind, provider_type, base_url, credential_ciphertext, COALESCE(model_id, '')
		FROM discovery_jobs
		WHERE status = 'queued'
		   OR (status = 'running' AND updated_at < now() - interval '2 minutes')
		ORDER BY created_at
		LIMIT 1
		FOR UPDATE SKIP LOCKED
	`)
	var job Job
	var kind string
	var ciphertext []byte
	err = row.Scan(&job.ID, &kind, &job.ProviderType, &job.BaseURL, &ciphertext, &job.ModelID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Job{}, nil, nil
	}
	if err != nil {
		return Job{}, nil, err
	}
	job.Kind = Kind(kind)
	_, err = tx.Exec(ctx, `UPDATE discovery_jobs SET status = 'running', updated_at = now() WHERE id = $1`, job.ID)
	if err != nil {
		return Job{}, nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Job{}, nil, err
	}
	return job, ciphertext, nil
}

func (s *Store) Finish(ctx context.Context, id string, result json.RawMessage, safeMessage string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE discovery_jobs
		SET status = 'finished', result_json = $2, safe_message = $3,
		    credential_ciphertext = NULL, updated_at = now()
		WHERE id = $1
	`, id, result, safeMessage)
	return err
}

func (s *Store) DecryptCredential(ciphertext []byte) (string, error) {
	plain, err := secretbox.Decrypt(s.key, ciphertext)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}
