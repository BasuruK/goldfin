const TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],:])/g;
const LITERAL_CLASS = { true: 'k-ok', false: 'k-ok', null: 'k-bad' };

export function isNullLine(line) {
  return /: null,?$/.test(line);
}

const indentOf = line => line.length - line.trimStart().length;
const OPENS_NODE = /[{[]\s*,?$/;

export function nodeRange(lines, index) {
  const line = lines[index];
  if (!OPENS_NODE.test(line)) return { opens: false, end: index };
  const base = indentOf(line);
  let end = lines.length - 1;
  for (let next = index + 1; next < lines.length; next++) {
    if (lines[next].trim() === '') continue;
    if (indentOf(lines[next]) <= base) { end = next; break; }
  }
  return { opens: true, end };
}

export function countChildItems(lines) {
  return lines.map((line, index) => {
    if (!OPENS_NODE.test(line)) return null;
    const base = indentOf(line);
    let childIndent = 0;
    let count = 0;
    for (let next = index + 1; next < lines.length; next++) {
      if (lines[next].trim() === '') continue;
      if (/^[}\]]/.test(lines[next].trim())) continue;
      const indent = indentOf(lines[next]);
      if (indent <= base) break;
      if (childIndent === 0) childIndent = indent;
      if (indent === childIndent) count++;
    }
    return count;
  });
}

export function tokenizeJsonLine(line) {
  const tokens = [];
  let last = 0;
  for (const match of line.matchAll(TOKEN)) {
    if (match.index > last) tokens.push({ text: line.slice(last, match.index), cls: null });
    const [text, quoted, colon, number, literal, punctuation] = match;
    if (quoted !== undefined) {
      tokens.push({ text: quoted, cls: colon ? 'k-key' : 'k-str' });
      if (colon) tokens.push({ text: colon, cls: 'k-p' });
    } else if (number !== undefined) {
      tokens.push({ text: number, cls: 'k-num' });
    } else if (literal !== undefined) {
      tokens.push({ text: literal, cls: LITERAL_CLASS[literal] });
    } else {
      tokens.push({ text: punctuation, cls: 'k-p' });
    }
    last = match.index + text.length;
  }
  if (last < line.length) tokens.push({ text: line.slice(last), cls: null });
  return tokens;
}
