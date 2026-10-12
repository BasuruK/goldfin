# Model selection belongs to the Connector

A provider-backed LLM Connector owns its endpoint, Credential and model selections.
It can expose several models without duplicating the connection. A separate Models
page is deferred until models need an independent managed lifecycle or reusable
settings beyond their IDs.

This replaces the glossary's previous assumption that each LLM Connector is bound
to one model ID. It does not change the `ocr`, `llm` and `fused` kinds or require a
custom gateway to enumerate models.

## Selection and availability

Newly discovered models start disabled. An enabled model is an operator choice,
not proof of access. A Run selects among enabled models whose access is verified.
Per ADR 0008, its resolved Connector definition includes the selected model or
deployment ID; later catalog, Credential or toggle changes cannot rewrite it.

Changing the provider, base URL or Credential blocks availability until discovery
succeeds again. Refresh keeps selections for matching IDs, leaves new IDs disabled,
and removes catalog IDs no longer returned. Explicit custom IDs are retained.
Late results for an older connection or request
are ignored. A failed refresh does not leave the previous catalog available.

Every provider allows manually supplied model/deployment IDs alongside its catalog,
including endpoints without discovery. They
remain unverified until checked. Discovery alone does not prove that an ID supports
the LLM Stage: capability and access checks remain worker-owned findings.

## Current UI slice

The Models panel is beside the Connector form on desktop and below it on narrow
viewports, within one dialog focus trap. Its entry uses the existing motion tokens
and respects reduced motion.

The UI uses an explicit **Preview models** action and a simulated catalog, with
sample IDs visibly labelled. It does not make a provider request or establish a
real connection. Sample and unverified IDs are excluded from system availability.
Live worker discovery is a separate ticket. The existing browser reachability
probe and local Credential persistence remain provisional work outside this slice;
they do not satisfy ADR 0005 or the production worker boundary.
