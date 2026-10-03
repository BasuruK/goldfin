import {
  DEFAULT_MODEL,
  MODELS,
  SAMPLE_DOCUMENT,
  SAMPLE_OCR_TEXT,
  SAMPLE_RESULT,
  SYSTEM_PROMPT,
} from './fixtures.js';

export const STORAGE_KEY = 'mlsvc-tester:2a';

export const LAYOUT = {
  promptMin: 260,
  resultMin: 360,
  runMin: 240,
  promptDefault: 520,
  runDefault: 308,
};

export const LIMITS = {
  temperature: { min: 0, max: 2, step: 0.1 },
  maxTokens: { min: 256, max: 32768, step: 256, default: 16384 },
};

export const LONG_STRING = 110;
const INTEGER_KEYS = new Set(['line_id', 'quantity']);

/* ------------------------------------------------------------------ *
 * Pure helpers — everything below is covered by test/app.test.js
 * ------------------------------------------------------------------ */

export function formatTokens(value) {
  return Math.round(value).toLocaleString('en-US');
}

export function countTokens(text) {
  return Math.round(text.length / 4);
}

export function promptMeta(text) {
  return `${formatTokens(text.length)} chars · ≈${(text.length / 4 / 1000).toFixed(1)}k tokens`;
}

export function formatNumber(key, value) {
  return Number.isInteger(value) && !INTEGER_KEYS.has(key) ? value.toFixed(1) : String(value);
}

export function valueSegment(key, value) {
  if (value === null) return { t: 'null', k: 'bad' };
  if (typeof value === 'number') return { t: formatNumber(key, value), k: 'num' };
  if (typeof value === 'boolean') return { t: String(value), k: 'ok' };
  return { t: JSON.stringify(value), k: 'str' };
}

export function toTree(value) {
  const nodes = [];

  const walk = (node, indent, key, isIndex, last) => {
    if (node !== null && typeof node === 'object') {
      const isArray = Array.isArray(node);
      const entries = isArray ? node.map((entry, i) => [i, entry]) : Object.entries(node);
      if (entries.length === 0) {
        nodes.push({ kind: 'empty', indent, key, isIndex, isArray, last });
        return;
      }
      const open = { kind: 'open', indent, key, isIndex, isArray, count: entries.length, last };
      nodes.push(open);
      entries.forEach(([entryKey, entryValue], i) => {
        walk(entryValue, indent + 1, entryKey, isArray, i === entries.length - 1);
      });
      open.closeIndex = nodes.length;
      nodes.push({ kind: 'close', indent, isArray, last });
      return;
    }
    nodes.push({ kind: 'leaf', indent, key, isIndex, value: node, last, isNull: node === null });
  };

  walk(value, 0, null, false, true);
  return nodes.map((node, i) => ({ ...node, n: i + 1 }));
}

export function nullNodes(tree) {
  return tree.filter((node) => node.isNull);
}

export function nextMissingIndex(count, current) {
  return count > 0 ? (current + 1) % count : -1;
}

export function containerLineNumbers(tree) {
  return tree.filter((node) => node.kind === 'open' && node.n !== 1).map((node) => node.n);
}

export function renderTree(tree, options = {}) {
  const {
    formatted = true,
    collapsed = new Set(),
    expanded = new Set(),
    jumpLine = 0,
  } = options;

  const rows = [];

  for (let i = 0; i < tree.length; i += 1) {
    const node = tree[i];
    const indent = { t: '  '.repeat(node.indent), k: 'p' };
    const keySegs = node.key == null
      ? []
      : node.isIndex
        ? (formatted ? [{ t: `${node.key}: `, k: 'cnt' }] : [])
        : [{ t: formatted ? node.key : JSON.stringify(node.key), k: 'key' }, { t: ': ', k: 'p' }];
    const comma = formatted || node.last ? [] : [{ t: ',', k: 'p' }];
    const openBracket = node.isArray ? '[' : '{';
    const closeBracket = node.isArray ? ']' : '}';

    const row = {
      n: node.n,
      mark: node.isNull ? '●' : '',
      chev: '',
      background: node.isNull ? (node.n === jumpLine ? 'uhl' : 'badbg') : 'row0',
      action: null,
      segs: [],
    };

    if (node.kind === 'open') {
      const foldable = formatted && node.n !== 1;
      const folded = foldable && collapsed.has(node.n);
      if (foldable) {
        row.chev = folded ? '▸' : '▾';
        row.action = { type: 'toggle-fold', n: node.n };
      }
      row.segs = folded
        ? [indent, ...keySegs, { t: openBracket, k: 'p' }, { t: ` ${node.count} items `, k: 'cnt' }, { t: closeBracket, k: 'p' }, ...comma]
        : [indent, ...keySegs, { t: openBracket, k: 'p' }, ...(formatted ? [{ t: ` ${node.count} items`, k: 'cnt' }] : []), ...comma];
      rows.push(row);
      if (folded) i = node.closeIndex;
    } else if (node.kind === 'close') {
      row.segs = [indent, { t: closeBracket, k: 'p' }, ...comma];
      rows.push(row);
    } else if (node.kind === 'empty') {
      row.segs = [indent, ...keySegs, { t: openBracket + closeBracket, k: 'p' }, ...(formatted ? [{ t: ' 0 items', k: 'cnt' }] : []), ...comma];
      rows.push(row);
    } else {
      let valueSegs;
      if (typeof node.value === 'string' && formatted) {
        const truncated = node.value.length > LONG_STRING && !expanded.has(node.n);
        const text = truncated ? `${node.value.slice(0, LONG_STRING)}…` : node.value;
        valueSegs = [{ t: `"${text}"`, k: 'str' }];
        if (node.value.length > LONG_STRING) {
          valueSegs.push({
            t: truncated ? `  expand (${node.value.length - LONG_STRING} more characters)` : '  collapse',
            k: 'key',
          });
          row.action = { type: 'toggle-expand', n: node.n };
        }
      } else {
        valueSegs = [valueSegment(node.key, node.value)];
      }
      row.segs = [indent, ...keySegs, ...valueSegs, ...comma];
      rows.push(row);
    }
  }

  return rows;
}

export function sanitizePrice(raw) {
  const parsed = typeof raw === 'number' ? raw : parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function resolvePrice(model, overrides = {}) {
  const base = MODELS[model] ?? MODELS[DEFAULT_MODEL];
  const custom = overrides[model] ?? {};
  const input = custom.input ?? base.input;
  const output = custom.output ?? base.output;
  return { input, output, custom: custom.input != null || custom.output != null };
}

export function estimateCost({ promptTokens = 0, completionTokens = 0, input = 0, output = 0 }) {
  const dollars = (promptTokens * input + completionTokens * output) / 1e6;
  return `$${dollars.toFixed(4)}`;
}

export function budgetUsage(promptTokens, completionTokens, maxTokens) {
  const total = Math.max(1, maxTokens);
  const share = (tokens) => Math.min(100, Math.max(0, (tokens / total) * 100));
  return {
    prompt: share(promptTokens),
    completion: share(completionTokens),
    label: `${Math.round(((promptTokens + completionTokens) / total) * 100)}% of ${formatTokens(maxTokens)}`,
  };
}

export function clampPromptWidth(requested, runWidth, total) {
  return Math.round(Math.max(LAYOUT.promptMin, Math.min(requested, total - runWidth - LAYOUT.resultMin)));
}

export function clampRunWidth(requested, promptWidth, total) {
  return Math.round(Math.max(LAYOUT.runMin, Math.min(requested, total - promptWidth - LAYOUT.resultMin)));
}

export function gridColumns({ promptWidth, runWidth, runOpen }) {
  return `${promptWidth}px 1px minmax(0,1fr) 1px ${runOpen ? runWidth : 0}px`;
}

export function describeError(error) {
  if (!error) return 'Request failed';
  return error.message || 'Request failed';
}

function abortError() {
  const error = new Error('Run stopped');
  error.name = 'AbortError';
  return error;
}

/**
 * Stands in for the MLSVC `recipe/execute` round trip. Same contract the real
 * endpoint has to honour: a cancellable promise, token usage, and a latency.
 */
export function runExtraction(options = {}) {
  const {
    document = SAMPLE_DOCUMENT,
    prompt = SYSTEM_PROMPT,
    result = SAMPLE_RESULT,
    ocrText = SAMPLE_OCR_TEXT,
    maxTokens = LIMITS.maxTokens.default,
    signal,
    latencyMs = 5200 + Math.random() * 2600,
  } = options;

  if (!document) return Promise.reject(new Error('No document loaded'));

  const promptTokens = countTokens(prompt);
  const completionTokens = countTokens(JSON.stringify(result));
  if (completionTokens > maxTokens) {
    return Promise.reject(new Error(`Response needs ${formatTokens(completionTokens)} tokens, over the ${formatTokens(maxTokens)} budget`));
  }

  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve({
        result,
        ocrText,
        document,
        usage: { promptTokens, completionTokens, total: promptTokens + completionTokens },
        latencyMs: Date.now() - startedAt,
      });
    }, latencyMs);

    if (!signal) return;
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });
}

/* ------------------------------------------------------------------ *
 * DOM layer
 * ------------------------------------------------------------------ */

const state = {
  theme: 'dark',
  promptWidth: LAYOUT.promptDefault,
  runWidth: LAYOUT.runDefault,
  runOpen: true,
  dragging: false,
  tab: 'output',
  formatted: true,
  modelOpen: false,
  model: DEFAULT_MODEL,
  prompt: SYSTEM_PROMPT,
  businessCase: 'entity-extraction',
  temperature: 0,
  maxTokens: LIMITS.maxTokens.default,
  priceOverrides: {},
  priceText: {},
  collapsed: new Set(),
  expanded: new Set(),
  jumpIndex: -1,
  document: { ...SAMPLE_DOCUMENT },
  result: SAMPLE_RESULT,
  ocrText: SAMPLE_OCR_TEXT,
  run: { phase: 'idle', elapsed: 0, latencyMs: null, at: null, stopped: false, error: null },
};

const ICONS = {
  play: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15L19.5 12z"></path></svg>',
  stop: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="3"></rect></svg>',
  check: '✓',
};

const $ = (id) => document.getElementById(id);

let dom = null;

function bindDom() {
  dom = {
    grid: $('grid'),
    prompt: $('prompt'),
    promptMeta: $('prompt-meta'),
    promptReset: $('prompt-reset'),
    promptCopy: $('prompt-copy'),
    chip: $('chip'),
    chipText: $('chip-text'),
    theme: $('theme'),
    jsonState: $('json-state'),
    copy: $('copy'),
    copyLabels: $('copy-labels'),
    copyIn: $('copy-in'),
    copyOut: $('copy-out'),
    pills: $('pills'),
    tabOutput: $('tab-output'),
    tabOcr: $('tab-ocr'),
    fmt: $('fmt'),
    fmtFormatted: $('fmt-formatted'),
    fmtJson: $('fmt-json'),
    paneOutput: $('pane-output'),
    paneOcr: $('pane-ocr'),
    lineCount: $('line-count'),
    foldAll: $('fold-all'),
    jsonbox: $('jsonbox'),
    ocrMeta: $('ocr-meta'),
    ocrbox: $('ocrbox'),
    divPrompt: $('div-prompt'),
    divRun: $('div-run'),
    knob: $('knob'),
    knobPath: $('knob-path'),
    runPanel: $('runpanel'),
    drop: $('drop'),
    file: $('file'),
    dd: $('dd'),
    ddTrigger: $('dd-trigger'),
    ddCurrent: $('dd-current'),
    ddMenu: $('dd-menu'),
    biz: $('biz'),
    temp: $('temp'),
    tempValue: $('temp-value'),
    maxtok: $('maxtok'),
    maxtokValue: $('maxtok-value'),
    priceSource: $('price-source'),
    priceReset: $('price-reset'),
    priceIn: $('price-in'),
    priceOut: $('price-out'),
    lastRunMeta: $('last-run-meta'),
    budgetP: $('budget-p'),
    budgetC: $('budget-c'),
    lastPrompt: $('last-prompt'),
    lastCompletion: $('last-completion'),
    lastBudget: $('last-budget'),
    lastCost: $('last-cost'),
    run: $('run'),
    runLabel: $('run-label'),
    live: $('live'),
  };
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
}

/* ---------- persistence ---------- */

function persist() {
  if (state.dragging) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      theme: state.theme,
      promptWidth: state.promptWidth,
      runWidth: state.runWidth,
      runOpen: state.runOpen,
      tab: state.tab,
      formatted: state.formatted,
      model: state.model,
      prompt: state.prompt,
      businessCase: state.businessCase,
      temperature: state.temperature,
      maxTokens: state.maxTokens,
      priceOverrides: state.priceOverrides,
    }));
  } catch {
    /* private mode / quota — persistence is a nicety, not a requirement */
  }
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!saved) return;
    Object.assign(state, {
      theme: saved.theme === 'light' ? 'light' : 'dark',
      promptWidth: Number.isFinite(saved.promptWidth) ? saved.promptWidth : LAYOUT.promptDefault,
      runWidth: Number.isFinite(saved.runWidth) ? saved.runWidth : LAYOUT.runDefault,
      runOpen: saved.runOpen !== false,
      tab: saved.tab === 'ocr' ? 'ocr' : 'output',
      formatted: saved.formatted !== false,
      model: MODELS[saved.model] ? saved.model : DEFAULT_MODEL,
      prompt: typeof saved.prompt === 'string' && saved.prompt ? saved.prompt : SYSTEM_PROMPT,
      businessCase: typeof saved.businessCase === 'string' ? saved.businessCase : 'entity-extraction',
      temperature: Number.isFinite(saved.temperature) ? saved.temperature : 0,
      maxTokens: Number.isFinite(saved.maxTokens) ? saved.maxTokens : LIMITS.maxTokens.default,
      priceOverrides: saved.priceOverrides && typeof saved.priceOverrides === 'object' ? saved.priceOverrides : {},
    });
  } catch {
    /* corrupt payload — fall back to defaults */
  }
}

function setState(patch) {
  Object.assign(state, patch);
  persist();
  render();
}

function announce(message) {
  dom.live.textContent = message;
}

/* ---------- derived values ---------- */

function currentTree() {
  return state.result ? toTree(state.result) : [];
}

function currentUsage() {
  if (!state.result) return { promptTokens: 0, completionTokens: 0, total: 0 };
  const promptTokens = countTokens(state.prompt);
  const completionTokens = countTokens(JSON.stringify(state.result));
  return { promptTokens, completionTokens, total: promptTokens + completionTokens };
}

function currentCost(usage) {
  const price = resolvePrice(state.model, state.priceOverrides);
  return estimateCost({ ...usage, ...price });
}

function isBusy() {
  return state.run.phase === 'rise' || state.run.phase === 'running';
}

/* ---------- render ---------- */

function render() {
  renderHeader();
  renderLayout();
  renderPrompt();
  renderResult();
  renderRunPanel();
  renderRunButton();
}

function renderHeader() {
  document.body.dataset.theme = state.theme;

  const last = state.run.latencyMs == null ? null : (state.run.latencyMs / 1000).toFixed(1);
  let tone = last ? 'ok' : 'stopped';
  let text = last ? `Success · ${last} s` : 'Ready';
  if (isBusy()) {
    tone = 'running';
    text = `Running · ${(state.run.elapsed / 1000).toFixed(1)} s`;
  } else if (state.run.error) {
    tone = 'error';
    text = state.run.error;
  } else if (state.run.stopped) {
    tone = 'stopped';
    text = 'Stopped';
  }
  dom.chip.dataset.tone = tone;
  if (dom.chipText.textContent !== text) dom.chipText.textContent = text;
  if (text !== dom.chip.getAttribute('aria-label')) dom.chip.setAttribute('aria-label', text);

  const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
  const themeTitle = `Switch to ${nextTheme}`;
  dom.theme.title = themeTitle;
  dom.theme.setAttribute('aria-label', themeTitle);
}

function renderLayout() {
  dom.grid.style.setProperty('--cols', gridColumns({
    promptWidth: state.promptWidth,
    runWidth: state.runWidth,
    runOpen: state.runOpen,
  }));
  dom.runPanel.style.setProperty('--run-w', `${state.runWidth}px`);
  dom.runPanel.classList.toggle('closed', !state.runOpen);
  dom.runPanel.setAttribute('aria-hidden', String(!state.runOpen));
  dom.divRun.dataset.draggable = String(state.runOpen);
  dom.divRun.style.setProperty('--knob-left', state.runOpen ? '-7px' : '-15px');
  dom.knobPath.setAttribute('d', state.runOpen ? 'm9.5 5.5 6.5 6.5-6.5 6.5' : 'm14.5 5.5-6.5 6.5 6.5 6.5');
  const toggleTitle = state.runOpen ? 'Hide run panel' : 'Show run panel';
  dom.knob.title = toggleTitle;
  dom.knob.setAttribute('aria-label', toggleTitle);
  dom.knob.setAttribute('aria-expanded', String(state.runOpen));
}

function renderPrompt() {
  if (dom.prompt.value !== state.prompt) dom.prompt.value = state.prompt;
  dom.promptMeta.textContent = promptMeta(state.prompt);
}

function renderResult() {
  const usage = currentUsage();
  const nulls = nullNodes(currentTree());
  const jump = state.jumpIndex >= 0 && state.jumpIndex < nulls.length ? nulls[state.jumpIndex] : null;
  const onOcr = state.tab === 'ocr';

  dom.jsonState.className = state.result ? 'meta ok' : 'meta';
  dom.jsonState.textContent = state.result ? 'valid JSON' : '—';

  dom.pills.replaceChildren(
    el('span', { class: 'pill', text: `Latency: ${state.run.latencyMs == null ? '—' : `${(state.run.latencyMs / 1000).toFixed(1)} s`}` }),
    el('span', { class: 'pill' }, [
      'Tokens: ',
      el('span', { class: 'mono' }, [
        el('span', { class: 'k', text: formatTokens(usage.promptTokens) }),
        ' → ',
        el('span', { class: 'n', text: formatTokens(usage.completionTokens) }),
        ` (Σ ${formatTokens(usage.total)})`,
      ]),
    ]),
    el('span', { class: 'pill inverted', text: `Est. cost: ${currentCost(usage)}` }),
    el('span', { class: 'pill', text: `Model: ${state.model}` }),
    nulls.length
      ? el('button', {
          class: 'pill missing',
          onclick: jumpToNextMissing,
          title: 'Jump to the next null field',
        }, [
          `${nulls.length} missing`,
          el('span', { class: 'sub', text: `· ${jump ? `${jump.key} (${state.jumpIndex + 1}/${nulls.length})` : 'jump to first'}` }),
        ])
      : null,
  );

  dom.tabOutput.setAttribute('aria-selected', String(!onOcr));
  dom.tabOcr.setAttribute('aria-selected', String(onOcr));
  dom.paneOutput.hidden = onOcr;
  dom.paneOcr.hidden = !onOcr;

  dom.fmt.dataset.disabled = String(onOcr);
  dom.fmt.title = onOcr ? 'Not available for OCR text' : 'Result view';
  dom.fmtFormatted.disabled = onOcr;
  dom.fmtJson.disabled = onOcr;
  dom.fmtFormatted.setAttribute('aria-pressed', String(state.formatted));
  dom.fmtJson.setAttribute('aria-pressed', String(!state.formatted));

  dom.copyIn.className = onOcr ? 'out' : 'in';
  dom.copyOut.className = onOcr ? 'in' : 'out';
  dom.copy.setAttribute('aria-label', onOcr ? 'Copy raw text' : 'Copy JSON');
  measureCopyLabels();

  dom.ocrMeta.textContent = `prebuilt-read · ${formatTokens(state.ocrText.length)} chars`;
  dom.ocrbox.textContent = state.ocrText;

  if (onOcr || !state.result) {
    dom.lineCount.textContent = '0 lines';
    dom.foldAll.disabled = true;
    dom.jsonbox.replaceChildren(el('div', { class: 'jsonline' }, [
      el('span', { class: 'ln' }),
      el('span', { class: 'mark' }),
      el('span', { class: 'chev' }),
      el('span', { class: 'segs', text: state.result ? '' : 'No result yet — run an extraction.' }),
    ]));
    return;
  }

  const rows = renderTree(currentTree(), {
    formatted: state.formatted,
    collapsed: state.collapsed,
    expanded: state.expanded,
    jumpLine: jump ? jump.n : 0,
  });

  dom.lineCount.textContent = `${rows.length} lines`;
  dom.foldAll.disabled = false;
  dom.foldAll.textContent = state.collapsed.size ? 'Expand all' : 'Collapse all';
  dom.jsonbox.style.opacity = isBusy() ? '0.4' : '1';
  dom.jsonbox.replaceChildren(...rows.map((row) => el('div', {
    class: `jsonline${row.action ? ' clickable' : ''}`,
    'data-n': row.n,
    onclick: row.action ? () => applyRowAction(row.action) : undefined,
  }, [
    el('span', { class: 'ln', text: row.n }),
    el('span', { class: 'mark', text: row.mark }),
    el('span', { class: 'chev', text: row.chev }),
    el('span', { class: 'segs' }, row.segs.map((seg) => el('span', { class: `k-${seg.k}`, text: seg.t }))),
  ])));
}

function renderRunPanel() {
  const usage = currentUsage();
  const price = resolvePrice(state.model, state.priceOverrides);

  dom.drop.querySelector('.name').textContent = state.document ? state.document.name : 'No document';
  dom.drop.querySelector('.sub').textContent = state.document
    ? `${Math.round(state.document.size / 1024)} KB · drop to replace`
    : 'click or drop a PDF';

  dom.ddCurrent.textContent = state.model;
  dom.ddTrigger.setAttribute('aria-expanded', String(state.modelOpen));
  dom.ddMenu.hidden = !state.modelOpen;
  dom.ddMenu.replaceChildren(...Object.entries(MODELS).map(([id, model]) => el('button', {
    class: 'dd-opt',
    role: 'option',
    'aria-selected': String(id === state.model),
    onclick: () => setState({ model: id, modelOpen: false }),
  }, [
    el('span', { class: 'check', text: id === state.model ? ICONS.check : '' }),
    el('span', { class: 'text' }, [
      el('span', { class: 'id', text: id }),
      el('span', { class: 'note', text: `${model.note} · $${model.input} / $${model.output}` }),
    ]),
  ])));

  if (dom.biz.value !== state.businessCase) dom.biz.value = state.businessCase;
  dom.temp.value = String(state.temperature);
  dom.tempValue.textContent = state.temperature.toFixed(1);
  dom.maxtok.value = String(state.maxTokens);
  dom.maxtokValue.textContent = formatTokens(state.maxTokens);

  dom.priceSource.textContent = price.custom ? 'USD · custom' : 'USD';
  dom.priceReset.hidden = !price.custom;
  if (document.activeElement !== dom.priceIn) dom.priceIn.value = state.priceText.in ?? String(price.input);
  if (document.activeElement !== dom.priceOut) dom.priceOut.value = state.priceText.out ?? String(price.output);

  const budget = budgetUsage(usage.promptTokens, usage.completionTokens, state.maxTokens);
  dom.budgetP.style.width = `${budget.prompt}%`;
  dom.budgetC.style.width = `${budget.completion}%`;
  dom.lastRunMeta.textContent = state.run.at
    ? `${state.run.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${(state.run.latencyMs / 1000).toFixed(1)} s`
    : 'sample result — no run yet';
  dom.lastPrompt.textContent = formatTokens(usage.promptTokens);
  dom.lastCompletion.textContent = formatTokens(usage.completionTokens);
  dom.lastBudget.textContent = budget.label;
  dom.lastCost.textContent = currentCost(usage);
}

function renderRunButton() {
  const busy = isBusy();
  dom.run.dataset.running = String(busy);
  dom.run.title = busy ? 'Stop the run' : 'Run extraction';

  if (renderedPhase !== state.run.phase) {
    dom.run.querySelector('.sea')?.remove();
    if (state.run.phase !== 'idle') dom.run.insertBefore(sea(), dom.runLabel);
    renderedPhase = state.run.phase;
  }

  if (busy) {
    dom.runLabel.replaceChildren(
      el('span', { html: ICONS.stop }),
      document.createTextNode(`Stop · ${(state.run.elapsed / 1000).toFixed(1)} s`),
    );
  } else {
    dom.runLabel.replaceChildren(
      el('span', { html: ICONS.play }),
      document.createTextNode('Run extraction'),
      el('span', { class: 'hint', text: '⌘↵' }),
    );
  }
}

let renderedPhase = null;

function sea() {
  const wave = (className, fill, amp) => el('span', { class: `wave ${className}` }, [
    el('span', {
      html: `<svg viewBox="0 0 200 40" preserveAspectRatio="none"><path d="M0 ${amp} Q25 0 50 ${amp} T100 ${amp} T150 ${amp} T200 ${amp} V40 H0 Z" fill="${fill}"></path></svg>`,
    }),
  ]);
  return el('span', {
    class: `sea${state.run.phase === 'sink' ? ' sinking' : ''}`,
    'aria-hidden': 'true',
  }, [
    el('span', { class: 'sea-water' }, [
      el('span', { class: 'sea-crest' }, [
        el('span', { html: '<svg viewBox="0 0 200 10" preserveAspectRatio="none"><path d="M0 6 Q25 0 50 6 T100 6 T150 6 T200 6 V10 H0 Z" fill="#0a1430"></path></svg>' }),
      ]),
    ]),
    wave('back', '#13285f', 10),
    wave('mid', '#1c3f99', 8),
    wave('front', '#3a6fd4', 6),
  ]);
}

function measureCopyLabels() {
  if (!dom.copyIn.offsetWidth) return;
  const width = state.tab === 'ocr' ? dom.copyOut.offsetWidth : dom.copyIn.offsetWidth;
  dom.copyLabels.style.width = `${width}px`;
}

/* ---------- interactions ---------- */

function applyRowAction(action) {
  const next = new Set(state.collapsed);
  if (action.type === 'toggle-fold') {
    if (next.has(action.n)) next.delete(action.n);
    else next.add(action.n);
    setState({ collapsed: next });
    return;
  }
  const expanded = new Set(state.expanded);
  if (expanded.has(action.n)) expanded.delete(action.n);
  else expanded.add(action.n);
  setState({ expanded });
}

function jumpToNextMissing() {
  const nulls = nullNodes(currentTree());
  if (!nulls.length) return;
  const index = nextMissingIndex(nulls.length, state.jumpIndex);
  setState({ jumpIndex: index, tab: 'output' });
  const target = dom.jsonbox.querySelector(`[data-n="${nulls[index].n}"]`);
  if (target) dom.jsonbox.scrollTop = target.offsetTop - 80;
  announce(`${nulls[index].key} is null. ${index + 1} of ${nulls.length}.`);
}

function toggleAll() {
  if (state.collapsed.size) {
    setState({ collapsed: new Set() });
    return;
  }
  setState({ formatted: true, collapsed: new Set(containerLineNumbers(currentTree())) });
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    copyViaSelection(text);
  }
  dom.copyLabels.classList.add('copied');
  setTimeout(() => dom.copyLabels.classList.remove('copied'), 1200);
  announce(message);
}

function copyViaSelection(text) {
  const scratch = el('textarea', { style: 'position:fixed;top:0;left:-9999px' });
  scratch.value = text;
  document.body.append(scratch);
  scratch.select();
  const copied = document.execCommand('copy');
  scratch.remove();
  return copied;
}

function setDocument(file) {
  const name = file?.name ?? '';
  if (!/\.pdf$/i.test(name)) {
    setState({ run: { ...state.run, stopped: false, error: 'Only PDF documents are supported' } });
    return;
  }
  setState({ document: { name, size: file.size }, run: { ...state.run, error: null } });
  announce(`${name} loaded, ${Math.round(file.size / 1024)} KB.`);
}

function startDrag(which, event) {
  if (event.button !== 0) return;
  if (which === 'run' && !state.runOpen) return;
  event.preventDefault();
  const rect = dom.grid.getBoundingClientRect();
  const total = dom.grid.offsetWidth - 2;
  state.dragging = true;
  dom.grid.classList.add('dragging');

  const onMove = (moveEvent) => {
    const x = moveEvent.clientX - rect.left;
    setState(which === 'prompt'
      ? { promptWidth: clampPromptWidth(x, state.runWidth, total) }
      : { runWidth: clampRunWidth(total - x, state.promptWidth, total) });
  };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    state.dragging = false;
    dom.grid.classList.remove('dragging');
    persist();
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function setPrice(field, raw) {
  const overrides = { ...state.priceOverrides };
  const forModel = { ...(overrides[state.model] ?? {}) };
  forModel[field] = sanitizePrice(raw);
  forModel[`${field}Text`] = raw;
  overrides[state.model] = forModel;
  const priceText = { ...state.priceText, [field]: raw };
  setState({ priceOverrides: overrides, priceText });
}

function resetPrice() {
  const overrides = { ...state.priceOverrides };
  delete overrides[state.model];
  setState({ priceOverrides: overrides, priceText: {} });
}

/* ---------- run lifecycle ---------- */

let runController = null;
let tickTimer = null;
let sinkTimer = null;

function settleRun(phase) {
  state.run.phase = phase;
  render();
  if (phase !== 'idle') return;
  runController = null;
}

async function startRun() {
  if (isBusy()) return;
  clearTimeout(sinkTimer);
  runController = new AbortController();

  const startedAt = performance.now();
  setState({ run: { phase: 'rise', elapsed: 0, latencyMs: state.run.latencyMs, at: state.run.at, stopped: false, error: null } });
  tickTimer = setInterval(() => {
    setState({ run: { ...state.run, phase: 'running', elapsed: performance.now() - startedAt } });
  }, 100);

  try {
    const outcome = await runExtraction({
      document: state.document,
      prompt: state.prompt,
      maxTokens: state.maxTokens,
      signal: runController.signal,
    });
    clearInterval(tickTimer);
    setState({
      result: outcome.result,
      ocrText: outcome.ocrText,
      document: outcome.document,
      jumpIndex: -1,
      collapsed: new Set(),
      expanded: new Set(),
      run: { phase: 'sink', elapsed: 0, latencyMs: outcome.latencyMs, at: new Date(), stopped: false, error: null },
    });
    announce(`Extraction finished in ${(outcome.latencyMs / 1000).toFixed(1)} seconds.`);
    sinkTimer = setTimeout(() => settleRun('idle'), 1150);
  } catch (error) {
    clearInterval(tickTimer);
    if (error.name === 'AbortError') {
      setState({ run: { ...state.run, phase: 'sink', stopped: true, error: null } });
      announce('Run stopped.');
    } else {
      setState({ run: { ...state.run, phase: 'sink', stopped: false, error: describeError(error) } });
      announce(describeError(error));
    }
    sinkTimer = setTimeout(() => settleRun('idle'), 1150);
  }
}

function stopRun() {
  runController?.abort();
}

/* ---------- wiring ---------- */

function wire() {
  dom.theme.addEventListener('click', () => setState({ theme: state.theme === 'dark' ? 'light' : 'dark' }));

  dom.prompt.addEventListener('input', (event) => setState({ prompt: event.target.value }));
  dom.promptReset.addEventListener('click', () => setState({ prompt: SYSTEM_PROMPT, expanded: new Set() }));
  dom.promptCopy.addEventListener('click', () => copyText(state.prompt, 'System prompt copied.'));

  dom.copy.addEventListener('click', () => {
    if (state.tab === 'ocr') copyText(state.ocrText, 'OCR text copied.');
    else copyText(JSON.stringify(state.result, null, 2), 'JSON copied.');
  });

  dom.tabOutput.addEventListener('click', () => setState({ tab: 'output' }));
  dom.tabOcr.addEventListener('click', () => setState({ tab: 'ocr' }));
  dom.fmtFormatted.addEventListener('click', () => setState({ formatted: true }));
  dom.fmtJson.addEventListener('click', () => setState({ formatted: false }));
  dom.foldAll.addEventListener('click', toggleAll);

  dom.divPrompt.addEventListener('mousedown', (event) => startDrag('prompt', event));
  dom.divRun.addEventListener('mousedown', (event) => {
    if (event.target.closest('.knob')) return;
    startDrag('run', event);
  });
  for (const divider of [dom.divPrompt, dom.divRun]) {
    divider.addEventListener('dblclick', (event) => {
      if (event.target.closest('.knob')) return;
      setState({ promptWidth: LAYOUT.promptDefault, runWidth: LAYOUT.runDefault });
    });
    divider.addEventListener('keydown', (event) => {
      const step = event.shiftKey ? 48 : 16;
      if (event.key === 'Home') {
        setState({ promptWidth: LAYOUT.promptDefault, runWidth: LAYOUT.runDefault });
      } else if (event.key === 'ArrowLeft' && event.currentTarget === dom.divPrompt) {
        setState({ promptWidth: state.promptWidth - step });
      } else if (event.key === 'ArrowRight' && event.currentTarget === dom.divPrompt) {
        setState({ promptWidth: state.promptWidth + step });
      } else if (event.key === 'ArrowLeft' && state.runOpen) {
        setState({ runWidth: state.runWidth + step });
      } else if (event.key === 'ArrowRight' && state.runOpen) {
        setState({ runWidth: state.runWidth - step });
      } else return;
      event.preventDefault();
    });
  }
  dom.knob.addEventListener('mousedown', (event) => event.stopPropagation());
  dom.knob.addEventListener('click', () => setState({ runOpen: !state.runOpen }));

  dom.drop.addEventListener('click', () => dom.file.click());
  dom.drop.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      dom.file.click();
    }
  });
  dom.drop.addEventListener('dragover', (event) => {
    event.preventDefault();
    dom.drop.classList.add('over');
  });
  dom.drop.addEventListener('dragleave', () => dom.drop.classList.remove('over'));
  dom.drop.addEventListener('drop', (event) => {
    event.preventDefault();
    dom.drop.classList.remove('over');
    setDocument(event.dataTransfer.files[0]);
  });
  dom.file.addEventListener('change', (event) => setDocument(event.target.files[0]));

  dom.ddTrigger.addEventListener('click', () => setState({ modelOpen: !state.modelOpen }));
  document.addEventListener('mousedown', (event) => {
    if (state.modelOpen && !dom.dd.contains(event.target)) setState({ modelOpen: false });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.modelOpen) setState({ modelOpen: false });
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (isBusy()) stopRun();
      else startRun();
    }
  });

  dom.biz.addEventListener('input', (event) => setState({ businessCase: event.target.value }));
  dom.temp.addEventListener('input', (event) => setState({ temperature: Number(event.target.value) }));
  dom.maxtok.addEventListener('input', (event) => setState({ maxTokens: Number(event.target.value) }));
  dom.priceIn.addEventListener('input', (event) => setPrice('input', event.target.value));
  dom.priceOut.addEventListener('input', (event) => setPrice('output', event.target.value));
  dom.priceReset.addEventListener('click', resetPrice);

  dom.run.addEventListener('click', () => {
    if (isBusy()) stopRun();
    else startRun();
  });
}

function boot() {
  bindDom();
  restore();
  document.body.dataset.theme = state.theme;
  wire();
  render();
  const measure = () => requestAnimationFrame(measureCopyLabels);
  if (document.fonts) document.fonts.ready.then(measure);
  measure();
}

if (typeof document !== 'undefined') boot();
