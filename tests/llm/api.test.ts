import assert from 'node:assert/strict';
import { afterEach, describe, it, mock, test } from 'node:test';
import { LlmError, mapLlmRunError, submitLlm } from '../../src/lib/llm/api.ts';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    }
  };
}

const validBody = {
  content: 'parsed',
  fullOutput: '{"ok":true}',
  stopped: '',
  promptVersion: null,
  usage: { inputTokens: 3, outputTokens: null, totalTokens: 3 }
};

afterEach(() => mock.restoreAll());

test('a cancelled run leaves no result and does not surface as an error', () => {
  assert.equal(mapLlmRunError(new LlmError('canceled', 'LLM was canceled.')), null);
  assert.equal(mapLlmRunError(new LlmError('timeout', 'LLM timed out.')), 'LLM timed out.');
});

describe('submitLlm', () => {
  it('posts JSON to the LLM Probe route and omits promptId when none is chosen', async () => {
    mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
      assert.equal(url, '/api/v1/probes/llm');
      assert.equal(init.method, 'POST');
      assert.equal((init.headers as Record<string, string>)['Content-Type'], 'application/json');
      assert.ok(typeof init.body === 'string');
      assert.deepEqual(JSON.parse(init.body), {
        connectorId: 'c1',
        modelId: 'gpt-test',
        input: 'ocr text'
      });
      return jsonResponse(200, validBody);
    });
    const result = await submitLlm('c1', 'gpt-test', null, 'ocr text');
    assert.deepEqual(result, {
      content: 'parsed',
      fullOutput: '{"ok":true}',
      stopped: '',
      promptVersion: null,
      usage: { inputTokens: 3, outputTokens: null, totalTokens: 3 }
    });
  });

  it('sends promptId when a Prompt is selected', async () => {
    mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
      assert.ok(typeof init.body === 'string');
      assert.deepEqual(JSON.parse(init.body), {
        connectorId: 'c1',
        modelId: 'gpt-test',
        input: 'in',
        promptId: 'prompt-1'
      });
      return jsonResponse(200, validBody);
    });
    await submitLlm('c1', 'gpt-test', 'prompt-1', 'in');
  });

  it('maps a mis-shaped Probe reply to malformed, not a result', async () => {
    for (const body of [null, { content: 'x' }, { ...validBody, content: 1 }]) {
      mock.method(globalThis, 'fetch', async () => jsonResponse(200, body));
      await assert.rejects(
        submitLlm('c1', 'gpt-test', null, 'in'),
        { name: 'LlmError', kind: 'malformed', message: 'Goldfin returned an unexpected response.' },
        JSON.stringify(body)
      );
    }
  });

  it('parses usage with a missing count as null for that count', async () => {
    mock.method(globalThis, 'fetch', async () =>
      jsonResponse(200, {
        ...validBody,
        usage: { inputTokens: 10 }
      })
    );
    const result = await submitLlm('c1', 'gpt-test', null, 'in');
    assert.deepEqual(result.usage, { inputTokens: 10, outputTokens: null, totalTokens: null });
  });

  it('maps caller abort to canceled through the shared request core', async () => {
    mock.method(globalThis, 'fetch', async (_url: string, init?: RequestInit) => {
      assert.ok(init?.signal instanceof AbortSignal);
      throw new DOMException('The operation was aborted.', 'AbortError');
    });
    await assert.rejects(submitLlm('c1', 'gpt-test', null, 'in', new AbortController().signal), error => {
      assert.ok(error instanceof LlmError);
      assert.equal(error.kind, 'canceled');
      assert.equal(error.message, 'LLM was canceled.');
      return true;
    });
  });

  it('gives the request the 5-minute LLM budget plus 35 s of server write headroom', async () => {
    const timeout = mock.method(AbortSignal, 'timeout');
    mock.method(globalThis, 'fetch', async () => jsonResponse(200, validBody));
    await submitLlm('c1', 'gpt-test', null, 'in');
    assert.deepEqual(timeout.mock.calls.map(call => call.arguments), [[335_000]]);
  });
});
