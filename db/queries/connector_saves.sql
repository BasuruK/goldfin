-- name: StageAttempt :one
INSERT INTO connector_save_attempts (name, base_url, credential_label, candidate_ciphertext, expires_at)
VALUES (sqlc.arg(name), sqlc.arg(base_url), NULLIF(sqlc.arg(credential_label)::text, ''),
        sqlc.narg(candidate_ciphertext), clock_timestamp() + sqlc.arg(ttl_seconds)::double precision * interval '1 second')
RETURNING id;

-- name: GetAttempt :one
SELECT id, state,
       COALESCE(connector_id, '')::text AS connector_id,
       COALESCE(finding_kind, '')::text AS finding_kind,
       COALESCE(http_status, 0)::smallint AS http_status,
       COALESCE(latency_ms, 0)::bigint AS latency_ms,
       COALESCE(failure_code, '')::text AS failure_code
FROM connector_save_attempts WHERE id = sqlc.arg(id);

-- name: ListConnectors :many
SELECT c.id, c.name, c.provider_type, c.base_url,
       COALESCE(g.label, '')::text AS credential_label, g.set_at AS credential_set_at
FROM connectors c
LEFT JOIN credential_generations g ON g.id = c.credential_generation_id
ORDER BY c.created_at, c.id;

-- name: ExpireAttempts :exec
UPDATE connector_save_attempts
SET state = 'finished', claim_token = NULL, candidate_ciphertext = NULL,
    failure_code = CASE WHEN expires_at <= clock_timestamp() THEN 'expired' ELSE 'attempts_exhausted' END,
    updated_at = clock_timestamp()
WHERE id IN (
    SELECT id FROM connector_save_attempts
    WHERE state IN ('queued', 'running')
      AND (expires_at <= clock_timestamp()
           OR (claim_attempts >= sqlc.arg(max_claims)::integer AND
               (state = 'queued' OR updated_at <= clock_timestamp() - sqlc.arg(lease_seconds)::double precision * interval '1 second')))
    FOR UPDATE SKIP LOCKED
);

-- name: ClaimNext :one
WITH next AS (
    SELECT id FROM connector_save_attempts
    WHERE claim_attempts < sqlc.arg(max_claims)::integer AND expires_at > clock_timestamp()
      AND (state = 'queued' OR (state = 'running'
           AND updated_at <= clock_timestamp() - sqlc.arg(lease_seconds)::double precision * interval '1 second'))
    ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
)
UPDATE connector_save_attempts a
SET state = 'running', claim_token = gen_random_uuid()::text,
    claim_attempts = a.claim_attempts + 1, updated_at = clock_timestamp()
FROM next WHERE a.id = next.id
RETURNING a.id, a.name, a.base_url, COALESCE(a.credential_label, '')::text AS credential_label,
          a.candidate_ciphertext, COALESCE(a.claim_token, '')::text AS claim_token, a.claim_attempts;

-- name: LockClaim :one
SELECT name, base_url, COALESCE(credential_label, '')::text AS credential_label, candidate_ciphertext
FROM connector_save_attempts
WHERE id = sqlc.arg(id) AND state = 'running' AND claim_token = sqlc.arg(token)::text
  AND expires_at > clock_timestamp()
  AND updated_at > clock_timestamp() - sqlc.arg(lease_seconds)::double precision * interval '1 second'
FOR UPDATE;

-- name: CreateConnector :one
INSERT INTO connectors (name, base_url) VALUES (sqlc.arg(name), sqlc.arg(base_url)) RETURNING id;

-- name: SetInitialCredential :execrows
WITH generation AS (
    INSERT INTO credential_generations (connector_id, label, ciphertext)
    VALUES (sqlc.arg(connector_id), sqlc.arg(label), sqlc.arg(ciphertext))
    RETURNING id, connector_id
)
UPDATE connectors c SET credential_generation_id = g.id, updated_at = clock_timestamp()
FROM generation g WHERE c.id = g.connector_id;

-- name: FinishSuccess :execrows
UPDATE connector_save_attempts
SET state = 'finished', claim_token = NULL, candidate_ciphertext = NULL,
    connector_id = sqlc.arg(connector_id)::text, finding_kind = 'reachable',
    http_status = sqlc.arg(http_status)::smallint, latency_ms = sqlc.arg(latency_ms)::bigint,
    updated_at = clock_timestamp()
WHERE id = sqlc.arg(id) AND state = 'running' AND claim_token = sqlc.arg(token)::text
  AND expires_at > clock_timestamp()
  AND updated_at > clock_timestamp() - sqlc.arg(lease_seconds)::double precision * interval '1 second';

-- name: FinishFailure :execrows
UPDATE connector_save_attempts
SET state = 'finished', claim_token = NULL, candidate_ciphertext = NULL,
    failure_code = sqlc.arg(failure_code)::text, updated_at = clock_timestamp()
WHERE id = sqlc.arg(id) AND state = 'running' AND claim_token = sqlc.arg(token)::text
  AND expires_at > clock_timestamp()
  AND updated_at > clock_timestamp() - sqlc.arg(lease_seconds)::double precision * interval '1 second';

-- name: ReleaseClaim :execrows
UPDATE connector_save_attempts
SET state = 'queued', claim_token = NULL, updated_at = clock_timestamp()
WHERE id = sqlc.arg(id) AND state = 'running' AND claim_token = sqlc.arg(token)::text
  AND expires_at > clock_timestamp()
  AND updated_at > clock_timestamp() - sqlc.arg(lease_seconds)::double precision * interval '1 second';
