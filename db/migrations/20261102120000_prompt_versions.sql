-- Immutable Prompt versions (ADR 0014). A Prompt is a stable identity; each save appends a row.

-- +goose Up
CREATE TABLE prompts (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name text NOT NULL CHECK (btrim(name) <> ''),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE prompt_versions (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    prompt_id text NOT NULL REFERENCES prompts (id) ON DELETE RESTRICT,
    version integer NOT NULL CHECK (version >= 1),
    content text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (prompt_id, version)
);

CREATE INDEX prompt_versions_prompt_id_version_idx ON prompt_versions (prompt_id, version DESC);

-- +goose Down
DROP TABLE prompt_versions;
DROP TABLE prompts;
