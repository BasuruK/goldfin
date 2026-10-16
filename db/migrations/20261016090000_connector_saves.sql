-- +goose Up
CREATE TABLE connectors (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name text NOT NULL CHECK (btrim(name) <> ''),
    provider_type text NOT NULL DEFAULT 'web_request' CHECK (provider_type = 'web_request'),
    base_url text NOT NULL CHECK (btrim(base_url) <> ''),
    credential_generation_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE credential_generations (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    connector_id text NOT NULL REFERENCES connectors(id),
    label text NOT NULL CHECK (btrim(label) <> ''),
    ciphertext bytea,
    state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'superseded', 'tombstoned')),
    set_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (connector_id, id),
    CHECK ((state = 'tombstoned') = (ciphertext IS NULL))
);

ALTER TABLE connectors ADD CONSTRAINT connectors_credential_generation_fk
    FOREIGN KEY (id, credential_generation_id) REFERENCES credential_generations(connector_id, id);

CREATE TABLE connector_save_attempts (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name text NOT NULL CHECK (btrim(name) <> ''),
    base_url text NOT NULL CHECK (btrim(base_url) <> ''),
    credential_label text CHECK (btrim(credential_label) <> ''),
    candidate_ciphertext bytea,
    state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'running', 'finished')),
    claim_token text,
    claim_attempts integer NOT NULL DEFAULT 0 CHECK (claim_attempts >= 0),
    connector_id text REFERENCES connectors(id),
    finding_kind text CHECK (finding_kind = 'reachable'),
    http_status smallint CHECK (http_status BETWEEN 100 AND 599),
    latency_ms bigint CHECK (latency_ms >= 0),
    failure_code text CHECK (failure_code IN ('unreachable', 'timeout', 'expired', 'attempts_exhausted')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    CHECK ((state = 'running') = (claim_token IS NOT NULL)),
    CHECK (candidate_ciphertext IS NULL OR credential_label IS NOT NULL),
    CHECK (state = 'finished' OR (candidate_ciphertext IS NULL) = (credential_label IS NULL)),
    CHECK (state <> 'finished' OR candidate_ciphertext IS NULL),
    CHECK ((finding_kind IS NOT NULL) = (connector_id IS NOT NULL)),
    CHECK (finding_kind IS NULL OR (state = 'finished' AND http_status IS NOT NULL AND http_status BETWEEN 200 AND 299 AND latency_ms IS NOT NULL)),
    CHECK (failure_code IS NULL OR (state = 'finished' AND connector_id IS NULL)),
    CHECK ((state = 'finished') = (connector_id IS NOT NULL OR failure_code IS NOT NULL))
);

CREATE INDEX connector_save_attempts_pending ON connector_save_attempts (created_at, id)
    WHERE state IN ('queued', 'running');

-- +goose Down
DROP TABLE connector_save_attempts;
ALTER TABLE connectors DROP CONSTRAINT connectors_credential_generation_fk;
DROP TABLE credential_generations;
DROP TABLE connectors;
