export type Format = 'integer' | 'decimal';

export function formatValue(value: unknown, format: Format = 'integer'): string {
  const number = Number(value);
  return format === 'decimal'
    ? number.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : number.toLocaleString('en-US');
}

export function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? 'null';
  } catch {
    return '[Unserializable value]';
  }
}
