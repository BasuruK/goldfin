# Azure OCR fixtures

`invoice.docx`, `running.json`, `succeeded.json` and `content.txt` come from Azure's
sanitized Python SDK recording of `prebuilt-read` on a synthetic Contoso invoice:

https://github.com/Azure/azure-sdk-assets/blob/python/formrecognizer/azure-ai-formrecognizer_ec714f4765/python/sdk/formrecognizer/azure-ai-formrecognizer/tests/recordings/test_dac_analyze_prebuilt_read.pyTestDACAnalyzeReadtest_document_read_stream_docx.json

The Document is decoded from the recorded request's base64 body, unchanged. The
response fixtures retain status, timestamps, model/API identifiers, exact content
and page numbers; unused spans, words and geometry are omitted. `content.txt` is
the recorded content, without an added trailing newline. No customer data or live
Credential is included. The recording used the older `2023-02-28-preview` API; it
checks the shared Read response contract. Outbound request assertions separately
pin the prototype's `documentintelligence` path and configured `2024-11-30` API.
Azure's fixtures are Copyright (c) Microsoft Corporation, under the included
`LICENSE` (MIT).

Failure, redirect, reflection and timing cases are synthetic test responses, not
claims of captured Azure failures. All tests run offline, without paid calls.

`blank.pdf` is a self-authored one-page blank PDF. The PNG/JPEG fixtures are made
in memory with Go's standard image encoders.
