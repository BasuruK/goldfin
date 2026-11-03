/**
 * Prompt API client. Each save of content appends an immutable Prompt version (ADR 0014).
 */

import { fetchApiRequest } from '../connectors/request-core.ts';

const PROMPTS_PATH = '/api/v1/prompts';

const REQUEST_TIMEOUT_MS = 10_000;

export type ApiErrorKind = 'timeout' | 'unreachable' | 'rejected' | 'unavailable' | 'malformed';

interface PromptVersion {
  id: string;
  version: number;
  content: string;
  createdAt: string;
}

export interface SavedPrompt {
  id: string;
  name: string;
  createdAt: string;
  latestVersion?: PromptVersion;
}

/** Create and append always return the version they wrote; list and rename may omit it. */
type SavedPromptWithVersion = SavedPrompt & { latestVersion: PromptVersion };

export class ApiError extends Error {
  kind: ApiErrorKind;

  constructor(kind: ApiErrorKind, message: string) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
  }
}

const MESSAGES: Record<ApiErrorKind, string> = {
  timeout: 'The request timed out. Try again.',
  unreachable: 'Could not reach the API. Check that Goldfin is running, then try again.',
  unavailable: 'Goldfin is unavailable right now. Try again.',
  malformed: 'Goldfin returned an unexpected response.',
  rejected: 'The Prompt was rejected.'
};

function isApiErrorKind(kind: string): kind is ApiErrorKind {
  return kind in MESSAGES;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseVersion(value: unknown): PromptVersion {
  if (!isJsonRecord(value)) throw new ApiError('malformed', MESSAGES.malformed);
  const { id, version, content, createdAt } = value;
  if (typeof id !== 'string' || typeof version !== 'number' || typeof content !== 'string' || typeof createdAt !== 'string') {
    throw new ApiError('malformed', MESSAGES.malformed);
  }
  return { id, version, content, createdAt };
}

/** A missing `latestVersion` stays missing; a mis-shaped one makes the whole reply malformed. */
function parsePrompt(value: unknown): SavedPrompt {
  if (!isJsonRecord(value)) throw new ApiError('malformed', MESSAGES.malformed);
  const { id, name, createdAt, latestVersion } = value;
  if (typeof id !== 'string' || typeof name !== 'string' || typeof createdAt !== 'string') {
    throw new ApiError('malformed', MESSAGES.malformed);
  }
  if (latestVersion === undefined) return { id, name, createdAt };
  return { id, name, createdAt, latestVersion: parseVersion(latestVersion) };
}

function parsePromptWithVersion(value: unknown): SavedPromptWithVersion {
  const { latestVersion, ...prompt } = parsePrompt(value);
  if (!latestVersion) throw new ApiError('malformed', MESSAGES.malformed);
  return { ...prompt, latestVersion };
}

async function requestJSON(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const { record } = await fetchApiRequest({
    path,
    init,
    timeoutMs: REQUEST_TIMEOUT_MS,
    messages: MESSAGES,
    createError: (kind, message) =>
      new ApiError(isApiErrorKind(kind) ? kind : 'malformed', message)
  });
  if (!record) throw new ApiError('malformed', MESSAGES.malformed);
  return record;
}

export function validatePromptDraft(name: string, content: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Enter a Prompt name before saving.';
  if (trimmed.length > 80) return 'Prompt name must be 80 characters or fewer.';
  // The API caps content in UTF-8 bytes; `.length` counts UTF-16 code units.
  if (new TextEncoder().encode(content).length > 512 * 1024) return 'Prompt content is too large.';
  return null;
}

export async function listPrompts(): Promise<SavedPrompt[]> {
  const { prompts } = await requestJSON(PROMPTS_PATH);
  if (!Array.isArray(prompts)) throw new ApiError('malformed', MESSAGES.malformed);
  return prompts.map(parsePrompt);
}

export async function createPrompt(name: string, content: string): Promise<SavedPromptWithVersion> {
  const record = await requestJSON(PROMPTS_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ name: name.trim(), content })
  });
  return parsePromptWithVersion(record);
}

export async function appendPromptVersion(promptId: string, content: string): Promise<SavedPromptWithVersion> {
  const record = await requestJSON(`${PROMPTS_PATH}/${encodeURIComponent(promptId)}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ content })
  });
  return parsePromptWithVersion(record);
}

export async function renamePrompt(promptId: string, name: string): Promise<SavedPrompt> {
  const record = await requestJSON(`${PROMPTS_PATH}/${encodeURIComponent(promptId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ name: name.trim() })
  });
  return parsePrompt(record);
}
