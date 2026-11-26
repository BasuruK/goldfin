-- Saved Workflows (ADR 0014). Mutable in place for v1; no Workflow versions yet.

-- +goose Up
CREATE TABLE workflows (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name text NOT NULL CHECK (btrim(name) <> ''),
    nodes_json jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX workflows_created_at_id_idx ON workflows (created_at, id);

-- +goose Down
DROP TABLE workflows;