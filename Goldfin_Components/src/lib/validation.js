export const sampleModelIds = ['gpt-4o-mini','gpt-4o','claude-sonnet-4-5','gemini-2.5-pro','llama-3.3-70b-instruct'];
export function modelError(value) {
  return sampleModelIds.includes(String(value ?? '').trim()) ? '' : 'Unknown model ID — pick one from the sample registry.';
}
export function suiteError(value) {
  return String(value ?? '').trim().length >= 3 ? '' : 'Enter a suite name with at least 3 characters.';
}

/* A chosen file is matched against the accept string locally; FileDrop selects a file, it never
   uploads one. An accept list of nothing (empty, whitespace or commas only) accepts everything. */
export function matchesAccept(candidate, accept) {
  const types = String(accept ?? '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  if (!types.length) return true;
  const name = String(candidate?.name ?? '').toLowerCase();
  const type = candidate?.type ?? '';
  return types.some(entry => entry.startsWith('.') ? name.endsWith(entry) : entry.endsWith('/*') ? type.startsWith(entry.slice(0, -1)) : entry === type);
}
