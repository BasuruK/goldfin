import {
  ApiError,
  appendPromptVersion,
  createPrompt,
  listPrompts,
  renamePrompt,
  validatePromptDraft,
  type SavedPrompt
} from './api.ts';

export type PromptSelection = 'new' | string;

export interface PromptStoreState {
  prompts: SavedPrompt[];
  listState: 'idle' | 'loading' | 'loaded' | 'failed';
  listError: string;
  selection: PromptSelection;
  name: string;
  content: string;
  loadedName: string;
  loadedContent: string;
  saving: boolean;
  saveError: string;
  statusMessage: string;
}

export const promptStore = $state<PromptStoreState>({
  prompts: [],
  listState: 'idle',
  listError: '',
  selection: 'new',
  name: '',
  content: '',
  loadedName: '',
  loadedContent: '',
  saving: false,
  saveError: '',
  statusMessage: 'New Prompt. Enter a name and system instructions.'
});

export function getPromptSelectItems(): { value: string; label: string }[] {
  return [
    { value: 'new', label: 'New prompt…' },
    ...promptStore.prompts.map(p => ({ value: p.id, label: p.name }))
  ];
}

export async function loadPromptList(): Promise<void> {
  promptStore.listState = 'loading';
  promptStore.listError = '';
  try {
    promptStore.prompts = await listPrompts();
    promptStore.listState = 'loaded';
  } catch (error) {
    promptStore.listState = 'failed';
    promptStore.listError =
      error instanceof ApiError ? error.message : 'Could not load Prompts. Try again.';
  }
}

export function selectPrompt(selection: PromptSelection): void {
  promptStore.saveError = '';
  if (selection === 'new') {
    promptStore.name = '';
    promptStore.content = '';
    promptStore.loadedName = '';
    promptStore.loadedContent = '';
    promptStore.statusMessage = 'New Prompt. Enter a name and system instructions.';
    return;
  }
  const item = promptStore.prompts.find(p => p.id === selection);
  if (!item?.latestVersion) {
    promptStore.statusMessage = 'Prompt has no versions yet.';
    return;
  }
  promptStore.name = item.name;
  promptStore.content = item.latestVersion.content;
  promptStore.loadedName = item.name;
  promptStore.loadedContent = item.latestVersion.content;
  promptStore.statusMessage = `Version ${item.latestVersion.version} loaded. Edit and save to append a new version.`;
}

export function markPromptDirty(): void {
  if (promptStore.saving) return;
  promptStore.statusMessage = 'Unsaved changes. Save before switching Prompts.';
}

export function disposePromptsPage(): void {
  promptStore.statusMessage = 'New Prompt. Enter a name and system instructions.';
  promptStore.saveError = '';
}

export async function savePrompt(): Promise<void> {
  const validation = validatePromptDraft(promptStore.name, promptStore.content);
  if (validation) {
    promptStore.saveError = validation;
    return;
  }
  promptStore.saving = true;
  promptStore.saveError = '';
  try {
    const nameChanged =
      promptStore.selection !== 'new' && promptStore.name.trim() !== promptStore.loadedName.trim();
    const contentChanged =
      promptStore.selection === 'new' || promptStore.content !== promptStore.loadedContent;
    if (promptStore.selection === 'new') {
      const saved = await createPrompt(promptStore.name, promptStore.content);
      promptStore.prompts = [...promptStore.prompts, saved];
      promptStore.selection = saved.id;
      promptStore.loadedName = saved.name;
      promptStore.loadedContent = saved.latestVersion?.content ?? '';
      promptStore.statusMessage = `Prompt saved as version ${saved.latestVersion?.version ?? 1}.`;
      return;
    }
    let latest: SavedPrompt | null = null;
    if (nameChanged) {
      latest = await renamePrompt(promptStore.selection, promptStore.name);
    }
    if (contentChanged) {
      latest = await appendPromptVersion(promptStore.selection, promptStore.content);
    }
    if (!nameChanged && !contentChanged) {
      promptStore.statusMessage = 'No changes to save.';
      return;
    }
    if (latest) {
      promptStore.prompts = promptStore.prompts.map(p => (p.id === latest.id ? latest : p));
      promptStore.loadedName = latest.name;
      promptStore.loadedContent = latest.latestVersion?.content ?? promptStore.content;
      promptStore.statusMessage = `Prompt saved as version ${latest.latestVersion?.version ?? ''}.`;
    }
  } catch (error) {
    promptStore.saveError =
      error instanceof ApiError ? error.message : 'Could not save the Prompt. Try again.';
  } finally {
    promptStore.saving = false;
  }
}
