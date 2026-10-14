-- +goose Up
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- +goose Down
-- Goldfin runs in a dedicated database and owns its schema; rolling back this
-- bootstrap migration requires rolling back any dependent objects first (RESTRICT).
DROP EXTENSION IF EXISTS pgcrypto RESTRICT;
