const TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],:])/g;
/** @type {Record<string, string>} */
const LITERAL_CLASS = { true: 'k-ok', false: 'k-ok', null: 'k-bad' };

/** @param {string} line */
export function isNullLine(line) {
  return /: null,?$/.test(line);
}

/** @param {string} line */
const indentOf = line => line.length - line.trimStart().length;
const OPENS_NODE = /[{[]\s*,?$/;

/** @typedef {{ opens: boolean, end: number }} NodeRange */

/**
 * @param {string[]} lines
 * @param {number} index
 * @returns {NodeRange}
 */
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

/**
 * @param {string[]} lines
 * @returns {(number | null)[]}
 */
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

/* Fold state is a set of opening-line indexes. Each entry hides its own descendants only,
   so one fold never collapses another line's children. */
/**
 * @param {Set<number>} folded
 * @param {number} index
 */
export function toggleFold(folded, index) {
  const next = new Set(folded);
  next.has(index) ? next.delete(index) : next.add(index);
  return next;
}

/**
 * @param {NodeRange[]} ranges
 * @param {Set<number>} folded
 */
export function hiddenLines(ranges, folded) {
  /** @type {boolean[]} */
  const mask = new Array(ranges.length).fill(false);
  for (const index of folded) {
    const range = ranges[index];
    if (!range?.opens) continue;
    for (let next = index + 1; next <= range.end; next++) mask[next] = true;
  }
  return mask;
}

/** @param {string} line */
export function tokenizeJsonLine(line) {
  /** @type {{ text: string, cls: string | null }[]} */
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
