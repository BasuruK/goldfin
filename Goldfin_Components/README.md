# Goldfin Components

Local Svelte 5 component library and interactive showcase. Application screens import Goldfin components; Bits UI supplies the interaction primitives underneath.

## Run

```sh
cd Goldfin_Components
npm ci
npm run dev
```

Open the localhost URL printed by Vite. For the generated showcase, serve the project folder over HTTP and open the root `index.html`; it links to `Goldfin_Components/dist/index.html`. ES modules and clipboard access require an HTTP origin; use localhost rather than opening the files directly with `file://`.

```sh
npm run build
npm test
```

Node 22.12+ or a compatible newer release is required by the pinned Vite toolchain. This starter was created with Node 26.7.0. Dependencies and their transitive versions are recorded in `package-lock.json`.

## Use in a Svelte application

Import `src/goldfin.css` once at the application entry. Import components from `src/lib/index.js`, or directly from their `.svelte` files. Keep the library folder local; publishing a package is unnecessary at this stage.

```svelte
<script>
  import { Slider, Switch, ConfirmDialog } from './Goldfin_Components/src/lib/index.js';
  import './Goldfin_Components/src/goldfin.css';

  let temperature = $state(0);
  let stream = $state(true);

  async function deleteSuite() {
    // Call the application's deletion operation here; reject on failure.
  }
</script>

<Slider label="Temperature" bind:value={temperature}
  min={0} max={2} step={0.1} format="decimal" />
<Switch label="Stream responses" bind:checked={stream} />
<ConfirmDialog trigger="Delete suite" title="Delete this suite?"
  description="The suite and its results will be permanently removed."
  action="Delete suite" tone="bad" icon="trash" onConfirm={deleteSuite} />
```

In an existing SvelteKit application, copy the library and stylesheet under its `src/lib` and use `$lib` imports. Reuse that application's build setup. Do not add a second Vite starter inside the application.

## Public components

| Family | Exports / main API |
| --- | --- |
| Slider | `Slider`: scalar `bind:value`, `min`, `max`, `step`, `size="sm"`, `disabled`, `format="decimal"` or integer, `unit`, `onValueChange`, `onValueCommit` |
| Dialogs | `Dialog`: `bind:open`, `trigger`, `title`, `description`, body children, `actions({close})` snippet. `ConfirmDialog`: same core fields plus `action`, `tone`, `icon`, async `onConfirm`, `onResult` |
| Mosaic | `MosaicHeader`: children and optional `icon`; shared 5-second wave with randomized peaks, visibility pause and observer cleanup |
| Boolean controls | `Checkbox`: `bind:checked`, `bind:indeterminate`, label, description, disabled, invalid. `Switch`: `bind:checked`, same fields plus size and badge. `SwitchCard`: icon, description, small / badge variants |
| Groups | `CheckboxGroup`: `{value,label}` items and `bind:selected` array. `RadioGroup`: items, scalar `bind:value`, disabled / invalid, optional card presentation |
| Selection | `Select`: `{value,label,note?,disabled?}` items, scalar value for single or array for `type="multiple"`. `StatusSelect`: value, label, status items with `tone` token. `DropdownMenu`: items and `onAction(value)` |
| Views | `Tabs`: items with value, label, content or children snippet; `bind:value`. `SegmentedControl`: single value, items, label and disabled |
| Forms | `Input`: `bind:value`, persistent label, description, message, error, `validate(value)` on blur; forwards native attributes. `FileDrop`: `bind:file`, accept, label; chooses a local file without uploading it. `FieldGroup`: label, aside and children |
| Table | `Table`: columns `{key,label,width?}`, rows, unique `rowKey` (default `id`), label, caption, variant, optional `cell(row,column)` snippet |
| Loading | `Spinner`: size, tone, accessible label, optional dots. `LoadingTask`: children snippet receiving `{busy,state,start,cancel}`. `LoadingSearch`: local sample-suite search |
| Timeline | `Timeline`: layout, markers, tone, label, count, leading and children. `TimelineItem`: title, description, time, datetime, state, status, icon, dateColumn, collapsible, open and detail children |
| Data / actions | `JSONViewer`: value, label, escaped JSON text and whole-output disclosure. `BudgetBar`: prompt, completion, maximum. `RunButton`: async `onRun`, disabled; `sample` enables a local demo. `CopyButton`: text and label. `SplitPane`: `bind:open`, first / second snippets |
| Presentation | `Button`: native attributes, variant, size, children. `Chip`: tone and children. `Pill`: variant and children. `Icon`: name and size |

## Composition examples

```svelte
<Dialog trigger="New test suite" title="New test suite"
  description="Keys every run record for this suite.">
  <Input label="Suite name" bind:value={name} required />
  {#snippet actions({close})}
    <Button variant="primary" onclick={() => saveSuite(name, close)}>Create suite</Button>
  {/snippet}
</Dialog>

<Timeline label="Evaluation pipeline" count={3}>
  <TimelineItem title="Suite created" state="complete" status="Complete" time="09:00" />
  <TimelineItem title="Evaluation running" state="current" status="Running" time="09:10" />
  <TimelineItem title="Review results" state="pending" status="Pending" time="09:20" />
</Timeline>
```

For a table, sort keys must contain the appropriate raw values: numeric bytes / elapsed hours for size and modification time, display labels rendered by the cell snippet. Missing values sort last in both directions. Sorting is stable and does not mutate the supplied rows. Keep row IDs unique.

## Design and behavior

- The repository root `DESIGN.md` is the design authority: IBM Plex Sans / Urbanist / IBM Plex Mono, dark-first cool neutrals, matching light tokens, compact tables and two-tone controls. It supersedes the original HTML reference and the older Inter / white / blue memory.
- `src/goldfin.css` contains the existing token and component styles plus the Bits-element mappings. Theme overrides live on `body[data-theme="light"]`, so portaled menus and dialogs inherit them. Tokens remain centralized; no Tailwind or additional styling framework.
- Fonts use the original Google Fonts stylesheet with CSS fallbacks. Network access is needed for those web fonts; provide your own hosted copies if the deployment requires offline fonts.
- The slider uses Bits UI thumb / range elements instead of native range pseudo-elements, retaining the oval grip and small / disabled variants.
- Confirmations focus Cancel through Bits UI defaults, permit Escape / scrim dismissal, and only report confirmation after `onConfirm` resolves. Pending confirmation blocks dismissal; rejected operations show a retryable error. Ordinary form dialogs use `Dialog`.
- Reduced motion disables animations. The mosaic pauses when the document is hidden and disconnects its observer when unmounted.
- The showcased 12 loading patterns and 11 timeline layouts retain the reference markup and sample events. Collapsible timeline details use native disclosures. Table and timeline examples contain no avatars.
- Run remains exclusive to the main LLM test case. No cost / duration hint is attached to its button. Running, pairing, deletion and suite creation in the showcase are explicitly local examples. Production business operations belong in application callbacks.
- Clipboard copy uses the actual browser clipboard and reports failure. File selection stays local. Nothing in this starter calls a model, uploads files or saves server records.

## Source layout

```text
src/lib/          reusable components, small pure helpers, public index
src/examples/     showcase state and compositions
src/App.svelte    showcase assembly and theme toggle
src/goldfin.css   shared tokens and styles
tests/            Node built-in regression tests for pure helpers
dist/             generated runnable showcase
```

`goldfin-ds/components.html` and its design documentation are preserved as the reference. No publishing, package registry, SvelteKit scaffold or universal component factory was introduced.

## Verification record

Components were compiled as in-memory candidates before source writes. Pure candidate assertions covered slider formatting, confirmation reset, suite validation, mosaic timing, tri-state selection, sorting, loading cancellation / stale callbacks, search normalization and budget bounds. Reusable Node regression files are supplied for future changes; their presence does not imply a post-write test run.

Native presentation wrappers and direct Bits bindings are glue; they received compiler checks rather than tests that duplicate library behavior. Browser interaction, focus restoration, responsive rendering and visual parity have not been previewed or independently verified in this run. The Open Design workflow prohibits post-generation previews and tests; validate those during your application integration.
