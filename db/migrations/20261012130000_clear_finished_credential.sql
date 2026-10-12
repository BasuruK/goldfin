-- +goose Up
ALTER TABLE discovery_jobs ALTER COLUMN credential_ciphertext DROP NOT NULL;
ALTER TABLE discovery_jobs DROP CONSTRAINT IF EXISTS discovery_jobs_credential_chk;
ALTER TABLE discovery_jobs ADD CONSTRAINT discovery_jobs_credential_chk CHECK (
    status = 'finished'
    OR (credential_ciphertext IS NOT NULL AND octet_length(credential_ciphertext) > 0)
);

-- +goose Down
ALTER TABLE discovery_jobs DROP CONSTRAINT IF EXISTS discovery_jobs_credential_chk;
ALTER TABLE discovery_jobs ALTER COLUMN credential_ciphertext SET NOT NULL;
