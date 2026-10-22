-- ADR 0013: a Connector is saved with one INSERT. The staged-Save schema (ADR 0012) only ever
-- held loopback development data, so it is dropped rather than migrated.

-- +goose Up
DROP TABLE IF EXISTS connector_save_attempts;
ALTER TABLE IF EXISTS connectors DROP CONSTRAINT IF EXISTS connectors_credential_generation_fk;
DROP TABLE IF EXISTS credential_generations;
DROP TABLE IF EXISTS connectors;

CREATE TABLE connectors (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name text NOT NULL CHECK (btrim(name) <> ''),
    provider_type text NOT NULL CHECK (provider_type = 'web_request'),
    base_url text NOT NULL CHECK (btrim(base_url) <> ''),
    credential_label text CHECK (btrim(credential_label) <> ''),
    credential_ciphertext bytea,
    credential_set_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((credential_ciphertext IS NULL) = (credential_label IS NULL)),
    CHECK ((credential_ciphertext IS NULL) = (credential_set_at IS NULL))
);

-- +goose Down
DROP TABLE connectors;
