export const sampleModelIds = ['gpt-4o-mini','gpt-4o','claude-sonnet-4-5','gemini-2.5-pro','llama-3.3-70b-instruct'];
export function modelError(value) {
  return sampleModelIds.includes(String(value ?? '').trim()) ? '' : 'Unknown model ID — pick one from the sample registry.';
}
export function suiteError(value) {
  return String(value ?? '').trim().length >= 3 ? '' : 'Enter a suite name with at least 3 characters.';
}
