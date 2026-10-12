-- +goose Up
CREATE TABLE discovery_jobs (
    id UUID PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('catalog', 'verify')),
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'finished')),
    provider_type TEXT NOT NULL,
    base_url TEXT NOT NULL,
    credential_ciphertext BYTEA,
    CONSTRAINT discovery_jobs_credential_chk CHECK (
        status = 'finished'
        OR (credential_ciphertext IS NOT NULL AND octet_length(credential_ciphertext) > 0)
    ),
    model_id TEXT,
    result_json JSONB,
    safe_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX discovery_jobs_status_created_idx ON discovery_jobs (status, created_at);

-- +goose Down
DROP TABLE discovery_jobs;
