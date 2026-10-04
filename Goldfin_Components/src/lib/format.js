export function formatValue(value, format = 'integer') {
  const number = Number(value);
  return format === 'decimal'
    ? number.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : number.toLocaleString('en-US');
}
