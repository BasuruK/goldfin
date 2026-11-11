/**
 * LLM Probe API client. Uses the same long timeout as OCR because the route may run
 * for up to five minutes.
 */

import { fetchApiRequest, isJsonRecord } from '../request-core.ts';
import type { SavedConnector } from '../connectors/api.ts';

const LLM_PATH = '/api/v1/probes/llm';

/** Route processing budget (5m) plus server write headroom. */
const LLM_REQUEST_TIMEOUT_MS = 5 * 60 * 1000 + 35 * 1000;

type LlmErrorKind =
  | 'timeout'
  | 'unreachable'
  | 'rejected'
  | 'unavailable'
  | 'malformed'
  | 'canceled';

interface LlmUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

interface LlmPromptVersion {
  id: string;
  version: number;
  content: string;
  createdAt: string;
}

export interface LlmResult {
  content: string;
  fullOutput: string;
  stopped: string;
  promptVersion: LlmPromptVersion | null;
  usage: LlmUsage | null;
}

export class LlmError extends Error {
  readonly kind: LlmErrorKind;

  constructor(kind: LlmErrorKind, message: string) {
    super(message);
    this.name = 'LlmError';
    this.kind = kind;
  }
}

/** Null when the operator stopped the run or the browser canceled it; otherwise the message to show. */
export function mapLlmRunError(error: unknown): string | null {
  if (error instanceof LlmError && error.kind === 'canceled') return null;
  return error instanceof LlmError ? error.message : 'Could not run LLM. Try again.';
}

const MESSAGES: Record<LlmErrorKind, string> = {
  timeout: 'LLM timed out.',
  unreachable: 'Could not reach the API. Check that Goldfin is running, then try again.',
  unavailable: 'Goldfin is unavailable right now. Try again.',
  malformed: 'Goldfin returned an unexpected response.',
  rejected: 'Invalid LLM request.',
  canceled: 'LLM was canceled.'
};

function parseTokenCount(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new LlmError('malformed', MESSAGES.malformed);
}

function parseUsage(value: unknown): LlmUsage | null {
  if (value === null || value === undefined) return null;
  if (!isJsonRecord(value)) throw new LlmError('malformed', MESSAGES.malformed);
  return {
    inputTokens: parseTokenCount(value.inputTokens),
    outputTokens: parseTokenCount(value.outputTokens),
    totalTokens: parseTokenCount(value.totalTokens)
  };
}

function parsePromptVersion(value: unknown): LlmPromptVersion | null {
  if (value === null || value === undefined) return null;
  if (!isJsonRecord(value)) throw new LlmError('malformed', MESSAGES.malformed);
  const { id, version, content, createdAt } = value;
  if (typeof id !== 'string' || typeof version !== 'number' || typeof content !== 'string' || typeof createdAt !== 'string') {
    throw new LlmError('malformed', MESSAGES.malformed);
  }
  return { id, version, content, createdAt };
}

function parseLlmResult(record: Record<string, unknown> | null): LlmResult {
  if (!record) throw new LlmError('malformed', MESSAGES.malformed);
  const { content, fullOutput, stopped, promptVersion, usage } = record;
  if (typeof content !== 'string' || typeof fullOutput !== 'string' || typeof stopped !== 'string') {
    throw new LlmError('malformed', MESSAGES.malformed);
  }
  return {
    content,
    fullOutput,
    stopped,
    promptVersion: parsePromptVersion(promptVersion),
    usage: parseUsage(usage)
  };
}

export async function submitLlm(
  connectorId: string,
  modelId: string,
  promptId: string | null,
  input: string,
  signal?: AbortSignal
): Promise<LlmResult> {
  const payload: Record<string, unknown> = { connectorId, modelId, input };
  if (promptId !== null) payload.promptId = promptId;
  const { record } = await fetchApiRequest({
    path: LLM_PATH,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    },
    timeoutMs: LLM_REQUEST_TIMEOUT_MS,
    callerSignal: signal,
    canceledKind: 'canceled',
    canceledMessage: MESSAGES.canceled,
    messages: MESSAGES,
    createError: (kind, message) => new LlmError(kind, message),
    httpTimeoutStatuses: true,
    statusMessage: mapStatus
  });
  return parseLlmResult(record);
}

export type LlmRunPlan =
  | { kind: 'invalid'; field: 'input' | 'connector' | 'model'; message: string }
  | { kind: 'run'; connectorId: string; modelId: string; input: string };

/** Enabled model ids on a Connector, in list order. */
export function enabledModelIds(connector: SavedConnector | undefined): readonly string[] {
  return connector?.models?.filter(model => model.enabled).map(model => model.id) ?? [];
}

/** The chosen model while it is still enabled; otherwise the first enabled one, or none. */
export function pickModelId(current: string, enabledIds: readonly string[]): string {
  if (enabledIds.includes(current)) return current;
  return enabledIds[0] ?? '';
}

/** What Run submits, or the first reason it cannot run yet. */
export function planLlmRun(
  input: string,
  connectorId: string,
  modelId: string,
  connector: SavedConnector | undefined
): LlmRunPlan {
  if (!input.trim()) {
    return { kind: 'invalid', field: 'input', message: 'Run OCR on a Document first.' };
  }
  if (!connectorId || !connector) {
    return { kind: 'invalid', field: 'connector', message: 'Choose an LLM Connector.' };
  }
  const enabledIds = enabledModelIds(connector);
  if (enabledIds.length === 0) {
    return { kind: 'invalid', field: 'model', message: 'Enable at least one model on this Connector.' };
  }
  const resolvedModelId = pickModelId(modelId, enabledIds);
  if (!resolvedModelId) {
    return { kind: 'invalid', field: 'model', message: 'Choose an enabled model.' };
  }
  return { kind: 'run', connectorId, modelId: resolvedModelId, input };
}

function mapStatus(status: number): string {
  if (status === 408 || status === 504) return MESSAGES.timeout;
  if (status >= 500) return MESSAGES.unavailable;
  if (status === 413) return 'Request is too large.';
  return MESSAGES.rejected;
}
