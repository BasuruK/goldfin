/**
 * Prompt API client. Each save of content appends an immutable Prompt version (ADR 0014).
 */

import { isJsonRecord, malformed, requestJson } from '../request-core.ts';

const PROMPTS_PATH = '/api/v1/prompts';
const REJECTED = 'The Prompt was rejected.';

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

function parseVersion(value: unknown): PromptVersion {
  if (!isJsonRecord(value)) throw malformed();
  const { id, version, content, createdAt } = value;
  if (typeof id !== 'string' || typeof version !== 'number' || typeof content !== 'string' || typeof createdAt !== 'string') {
    throw malformed();
  }
  return { id, version, content, createdAt };
}

/** A missing `latestVersion` stays missing; a mis-shaped one makes the whole reply malformed. */
function parsePrompt(value: unknown): SavedPrompt {
  if (!isJsonRecord(value)) throw malformed();
  const { id, name, createdAt, latestVersion } = value;
  if (typeof id !== 'string' || typeof name !== 'string' || typeof createdAt !== 'string') {
    throw malformed();
  }
  if (latestVersion === undefined) return { id, name, createdAt };
  return { id, name, createdAt, latestVersion: parseVersion(latestVersion) };
}

function parsePromptWithVersion(value: unknown): SavedPromptWithVersion {
  const { latestVersion, ...prompt } = parsePrompt(value);
  if (!latestVersion) throw malformed();
  return { ...prompt, latestVersion };
}

export function validatePromptDraft(name: string, content: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Enter a Prompt name before saving.';
  if (trimmed.length > 80) return 'Prompt name must be 80 characters or fewer.';
  // The API caps content in UTF-8 bytes; `.length` counts UTF-16 code units.
  if (new TextEncoder().encode(content).length > 512 * 1024) return 'Prompt content is too large.';
  return null;
}

/** The draft fields a save compares; `selection` is null until the Prompt is saved. */
interface PromptDraft {
  selection: string | null;
  name: string;
  content: string;
  loadedName: string;
  loadedContent: string;
}

export type SavePlan =
  | { kind: 'invalid'; message: string }
  | { kind: 'create' }
  | { kind: 'unchanged' }
  | { kind: 'update'; promptId: string; rename: boolean; append: boolean };

/** Decides what a save sends, so the store only applies the replies. */
export function planSave(draft: PromptDraft): SavePlan {
  const message = validatePromptDraft(draft.name, draft.content);
  if (message) return { kind: 'invalid', message };
  if (draft.selection === null) return { kind: 'create' };
  const rename = draft.name.trim() !== draft.loadedName.trim();
  const append = draft.content !== draft.loadedContent;
  if (!rename && !append) return { kind: 'unchanged' };
  return { kind: 'update', promptId: draft.selection, rename, append };
}

export async function listPrompts(): Promise<SavedPrompt[]> {
  const { prompts } = await requestJson(PROMPTS_PATH, REJECTED);
  if (!Array.isArray(prompts)) throw malformed();
  return prompts.map(parsePrompt);
}

export async function createPrompt(name: string, content: string): Promise<SavedPromptWithVersion> {
  const record = await requestJson(PROMPTS_PATH, REJECTED, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ name: name.trim(), content })
  });
  return parsePromptWithVersion(record);
}

export async function appendPromptVersion(promptId: string, content: string): Promise<SavedPromptWithVersion> {
  const record = await requestJson(`${PROMPTS_PATH}/${encodeURIComponent(promptId)}/versions`, REJECTED, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ content })
  });
  return parsePromptWithVersion(record);
}

export async function renamePrompt(promptId: string, name: string): Promise<SavedPrompt> {
  const record = await requestJson(`${PROMPTS_PATH}/${encodeURIComponent(promptId)}`, REJECTED, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ name: name.trim() })
  });
  return parsePrompt(record);
}
