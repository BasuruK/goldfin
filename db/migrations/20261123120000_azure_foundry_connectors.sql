-- Azure Foundry Connectors with manual model IDs (spec #173). Down runs only after deleting azure_foundry rows.

-- +goose Up
ALTER TABLE connectors DROP CONSTRAINT connectors_provider_type_check;

ALTER TABLE connectors ADD CONSTRAINT connectors_provider_type_check
    CHECK (provider_type IN ('web_request', 'azure_document_intelligence', 'openai', 'openai_compatible', 'azure_foundry'));

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
        OR (
            provider_type = 'azure_foundry'
            AND api_version IS NULL
            AND llm_api_mode IS NULL
        )
    );

-- +goose Down
-- Restore prior constraints. Delete every azure_foundry row before running Down (loopback dev data).
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
    ) NOT VALID;

ALTER TABLE connectors DROP CONSTRAINT connectors_provider_type_check;

ALTER TABLE connectors ADD CONSTRAINT connectors_provider_type_check
    CHECK (provider_type IN ('web_request', 'azure_document_intelligence', 'openai', 'openai_compatible')) NOT VALID;