-- Azure Document Intelligence OCR Connector settings alongside existing Web Request Connectors.

-- +goose Up
ALTER TABLE connectors ADD COLUMN IF NOT EXISTS api_version text;

ALTER TABLE connectors DROP CONSTRAINT connectors_provider_type_check;

ALTER TABLE connectors ADD CONSTRAINT connectors_provider_type_check
    CHECK (provider_type IN ('web_request', 'azure_document_intelligence'));

ALTER TABLE connectors ADD CONSTRAINT connectors_provider_api_version_check
    CHECK (
        (provider_type = 'web_request' AND api_version IS NULL)
        OR (
            provider_type = 'azure_document_intelligence'
            AND api_version IS NOT NULL
            AND btrim(api_version) <> ''
        )
    );

-- +goose Down
ALTER TABLE connectors DROP CONSTRAINT IF EXISTS connectors_provider_api_version_check;

ALTER TABLE connectors DROP CONSTRAINT IF EXISTS connectors_provider_type_check;

ALTER TABLE connectors ADD CONSTRAINT connectors_provider_type_check
    CHECK (provider_type = 'web_request') NOT VALID;
