import {
  ApiError,
  appendPromptVersion,
  createPrompt,
  listPrompts,
  planSave,
  renamePrompt,
  type SavedPrompt,
  type SavePlan
} from './api.ts';

/** The Select's value for "New prompt…". Prompt ids are UUIDs, so no saved Prompt can collide with it. */
const NEW_PROMPT_VALUE = 'new';
const NEW_PROMPT_STATUS = 'New Prompt. Enter a name and system instructions.';

export interface PromptStoreState {
  prompts: SavedPrompt[];
  listState: 'idle' | 'loading' | 'loaded' | 'failed';
  listError: string;
  /** The saved Prompt being edited; null until the draft is saved. */
  selection: string | null;
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
  selection: null,
  name: '',
  content: '',
  loadedName: '',
  loadedContent: '',
  saving: false,
  saveError: '',
  statusMessage: NEW_PROMPT_STATUS
});

export function getPromptSelectItems(): { value: string; label: string }[] {
  return [
    { value: NEW_PROMPT_VALUE, label: 'New prompt…' },
    ...promptStore.prompts.map(p => ({ value: p.id, label: p.name }))
  ];
}

/** The Select's value for the current selection. */
export function getSelectedValue(): string {
  return promptStore.selection ?? NEW_PROMPT_VALUE;
}

/** Applies the operator's pick from the Select. */
export function selectPromptValue(value: string): void {
  selectPrompt(value === NEW_PROMPT_VALUE ? null : value);
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

export function selectPrompt(selection: string | null): void {
  promptStore.selection = selection;
  promptStore.saveError = '';
  if (selection === null) {
    promptStore.name = '';
    promptStore.content = '';
    promptStore.loadedName = '';
    promptStore.loadedContent = '';
    promptStore.statusMessage = NEW_PROMPT_STATUS;
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
  promptStore.statusMessage = NEW_PROMPT_STATUS;
  promptStore.saveError = '';
}

export async function savePrompt(): Promise<void> {
  const plan = planSave(promptStore);
  if (plan.kind === 'invalid') {
    promptStore.saveError = plan.message;
    return;
  }
  promptStore.saveError = '';
  if (plan.kind === 'unchanged') {
    promptStore.statusMessage = 'No changes to save.';
    return;
  }
  promptStore.saving = true;
  try {
    await (plan.kind === 'create' ? saveNewPrompt() : updatePrompt(plan));
  } catch (error) {
    promptStore.saveError =
      error instanceof ApiError ? error.message : 'Could not save the Prompt. Try again.';
  } finally {
    promptStore.saving = false;
  }
}

async function saveNewPrompt(): Promise<void> {
  const saved = await createPrompt(promptStore.name, promptStore.content);
  promptStore.prompts = [...promptStore.prompts, saved];
  promptStore.selection = saved.id;
  promptStore.loadedName = saved.name;
  promptStore.loadedContent = saved.latestVersion.content;
  promptStore.statusMessage = `Prompt saved as version ${saved.latestVersion.version}.`;
}

/** Applies each reply as it lands, so a failed append still keeps a rename that succeeded. */
async function updatePrompt({ promptId, rename, append }: Extract<SavePlan, { kind: 'update' }>): Promise<void> {
  if (rename) {
    const renamed = await renamePrompt(promptId, promptStore.name);
    mergePrompt(renamed);
    promptStore.loadedName = renamed.name;
    promptStore.statusMessage = 'Prompt renamed.';
  }
  if (append) {
    const appended = await appendPromptVersion(promptId, promptStore.content);
    mergePrompt(appended);
    promptStore.loadedContent = appended.latestVersion.content;
    promptStore.statusMessage = `Prompt saved as version ${appended.latestVersion.version}.`;
  }
}

/** A rename reply may omit latestVersion; merging keeps the version already listed. */
function mergePrompt(saved: SavedPrompt): void {
  promptStore.prompts = promptStore.prompts.map(p => (p.id === saved.id ? { ...p, ...saved } : p));
}
