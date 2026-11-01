-- LLM Connectors with operator-supplied model IDs (ADR 0011). No discovery catalog.

-- +goose Up
ALTER TABLE connectors ADD COLUMN IF NOT EXISTS llm_api_mode text;

CREATE TABLE connector_models (
    connector_id text NOT NULL REFERENCES connectors (id) ON DELETE CASCADE,
    model_id text NOT NULL CHECK (btrim(model_id) <> ''),
    enabled boolean NOT NULL,
    source text NOT NULL CHECK (source = 'manual'),
    PRIMARY KEY (connector_id, model_id)
);

ALTER TABLE connectors DROP CONSTRAINT connectors_provider_type_check;

ALTER TABLE connectors ADD CONSTRAINT connectors_provider_type_check
    CHECK (provider_type IN ('web_request', 'azure_document_intelligence', 'openai', 'openai_compatible'));

ALTER TABLE connectors DROP CONSTRAINT connectors_provider_api_version_check;

ALTER TABLE connectors ADD CONSTRAINT connectors_provider_api_version_check
    CHECK (
        (provider_type = 'web_request' AND api_version IS NULL AND llm_api_mode IS NULL)
        OR (
            provider_type = 'azure_document_intelligence'
            AND api_version IS NOT NULL
            AND btrim(api_version) <> ''
            AND llm_api_mode IS NULL
        )
        OR (
            provider_type IN ('openai', 'openai_compatible')
            AND api_version IS NULL
            AND llm_api_mode IN ('responses', 'chat_completions')
        )
    );

-- +goose Down
DROP TABLE IF EXISTS connector_models;

ALTER TABLE connectors DROP CONSTRAINT connectors_provider_api_version_check;

ALTER TABLE connectors ADD CONSTRAINT connectors_provider_api_version_check
    CHECK (
        (provider_type = 'web_request' AND api_version IS NULL)
        OR (
            provider_type = 'azure_document_intelligence'
            AND api_version IS NOT NULL
            AND btrim(api_version) <> ''
        )
    );

ALTER TABLE connectors DROP CONSTRAINT connectors_provider_type_check;

ALTER TABLE connectors ADD CONSTRAINT connectors_provider_type_check
    CHECK (provider_type IN ('web_request', 'azure_document_intelligence')) NOT VALID;

ALTER TABLE connectors DROP COLUMN IF EXISTS llm_api_mode;
