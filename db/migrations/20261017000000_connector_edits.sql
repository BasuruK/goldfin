-- +goose Up
ALTER TABLE connectors ADD COLUMN revision bigint NOT NULL DEFAULT 1;

ALTER TABLE connector_save_attempts
    ADD COLUMN target_connector_id text REFERENCES connectors(id),
    ADD COLUMN base_revision bigint,
    ADD CONSTRAINT connector_save_attempts_edit_target_check
        CHECK ((target_connector_id IS NULL) = (base_revision IS NULL));

ALTER TABLE connector_save_attempts DROP CONSTRAINT connector_save_attempts_failure_code_check;
ALTER TABLE connector_save_attempts ADD CONSTRAINT connector_save_attempts_failure_code_check
    CHECK (failure_code IN ('unreachable', 'timeout', 'expired', 'attempts_exhausted', 'stale'));

CREATE UNIQUE INDEX credential_generations_one_active ON credential_generations (connector_id)
    WHERE state = 'active';

-- +goose Down
DROP INDEX credential_generations_one_active;

-- Edit attempts would read as creates once their target is gone, so drop them first.
DELETE FROM connector_save_attempts WHERE target_connector_id IS NOT NULL;

ALTER TABLE connector_save_attempts DROP CONSTRAINT connector_save_attempts_failure_code_check;
ALTER TABLE connector_save_attempts ADD CONSTRAINT connector_save_attempts_failure_code_check
    CHECK (failure_code IN ('unreachable', 'timeout', 'expired', 'attempts_exhausted'));

ALTER TABLE connector_save_attempts
    DROP CONSTRAINT connector_save_attempts_edit_target_check,
    DROP COLUMN base_revision,
    DROP COLUMN target_connector_id;

ALTER TABLE connectors DROP COLUMN revision;
