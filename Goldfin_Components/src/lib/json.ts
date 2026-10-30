const TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],:])/g;
const LITERAL_CLASS: Record<string, string> = { true: 'k-ok', false: 'k-ok', null: 'k-bad' };

export function isNullLine(line: string): boolean {
  return /: null,?$/.test(line);
}

const indentOf = (line: string) => line.length - line.trimStart().length;
const OPENS_NODE = /[{[]\s*,?$/;

export interface NodeRange {
  opens: boolean;
  end: number;
}

export function nodeRange(lines: string[], index: number): NodeRange {
  const line = lines[index];
  if (!OPENS_NODE.test(line)) return { opens: false, end: index };
  const base = indentOf(line);
  let end = lines.length - 1;
  for (let next = index + 1; next < lines.length; next++) {
    if (lines[next].trim() === '') continue;
    if (indentOf(lines[next]) <= base) {
      end = next;
      break;
    }
  }
  return { opens: true, end };
}

export function countChildItems(lines: string[]): (number | null)[] {
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

export function toggleFold(folded: Set<number>, index: number): Set<number> {
  const next = new Set(folded);
  if (next.has(index)) next.delete(index);
  else next.add(index);
  return next;
}

export function hiddenLines(ranges: NodeRange[], folded: Set<number>): boolean[] {
  const mask = new Array<boolean>(ranges.length).fill(false);
  for (const index of folded) {
    const range = ranges[index];
    if (!range?.opens) continue;
    for (let next = index + 1; next <= range.end; next++) mask[next] = true;
  }
  return mask;
}

export interface JsonToken {
  text: string;
  cls: string | null;
}

export function tokenizeJsonLine(line: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  let last = 0;
  for (const match of line.matchAll(TOKEN)) {
    if (match.index === undefined) continue;
    if (match.index > last) tokens.push({ text: line.slice(last, match.index), cls: null });
    const [text, quoted, colon, number, literal, punctuation] = match;
    if (quoted !== undefined) {
      tokens.push({ text: quoted, cls: colon ? 'k-key' : 'k-str' });
      if (colon) tokens.push({ text: colon, cls: 'k-p' });
    } else if (number !== undefined) {
      tokens.push({ text: number, cls: 'k-num' });
    } else if (literal !== undefined) {
      tokens.push({ text: literal, cls: LITERAL_CLASS[literal] });
    } else if (punctuation !== undefined) {
      tokens.push({ text: punctuation, cls: 'k-p' });
    }
    last = match.index + text.length;
  }
  if (last < line.length) tokens.push({ text: line.slice(last), cls: null });
  return tokens;
}
