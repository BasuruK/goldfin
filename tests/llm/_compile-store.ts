import { compileModule } from 'svelte/compiler';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import type { SavedConnector } from '../../src/lib/connectors/api.ts';
import type { LlmResult } from '../../src/lib/llm/api.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const storePath = join(root, 'src/lib/llm/store.svelte.ts');
const compiledPath = join(root, 'src/lib/llm/.store.test-compiled.mjs');

export interface LlmStoreTestModule {
  llmStore: {
    connectors: SavedConnector[];
    connectorId: string;
    modelId: string;
    busy: boolean;
    error: string;
    stoppedNotice: string;
    result: LlmResult | null;
    showFullOutput: boolean;
  };
  runLlm: (input: string) => Promise<void>;
  stopLlm: () => void;
  clearLlmResult: () => void;
  disposeLlm: () => void;
}

export async function loadLlmStoreModule(): Promise<LlmStoreTestModule> {
  const source = readFileSync(storePath, 'utf8').replaceAll('#lib/', '../');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022
    }
  });
  const { js } = compileModule(transpiled.outputText, { filename: 'store.svelte.ts' });
  writeFileSync(compiledPath, js.code);
  return import(`${pathToFileURL(compiledPath).href}?v=${Date.now()}`) as Promise<LlmStoreTestModule>;
}
