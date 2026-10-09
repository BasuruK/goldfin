# Goldfin Design System

Version: 1.0, source handoff, 2026-10-04.

## Authority and scope

This is the design contract for Goldfin's reusable web components. It records the approved component design implemented in `Goldfin_Components/src/`, not a new visual direction.

Goldfin evaluates document extraction. Product terminology follows the main repository's `GLOSSARY.md`; this document governs presentation and interaction, not domain behavior.

| Responsibility | Authoritative location |
| --- | --- |
| Design decisions and usage rules | This root `DESIGN.md` |
| Implemented theme tokens and component styles | `Goldfin_Components/src/goldfin.css` |
| Reusable component behavior and API | `Goldfin_Components/src/lib/` and `src/lib/index.js` |
| Showcase compositions and sample state | `Goldfin_Components/src/examples/` and `src/App.svelte` |
| Setup and API examples | `Goldfin_Components/README.md` |
| Pure helper regression tests | `Goldfin_Components/tests/` |

Use this document and the implementation together. A design change updates both in the same reviewed change. Markdown does not drive CSS, and CSS does not regenerate Markdown. Imported component instances share their implementation; copied instances do not synchronize.

The original `goldfin-ds/components.html` is a historical reference snapshot, not a second active implementation. Older Inter/white/blue guidance and the source README's historical statement that the original HTML is the authority are superseded by this contract. Preserve the current Svelte appearance when resolving those conflicts.

## Visual character

Compact, dark-first, cool neutral tooling. Hierarchy comes from type, alignment, space and subdued surfaces. Primary actions and boolean controls use opposing light/dark tones. Semantic color communicates meaning in conjunction with text or an icon.

Keep the user-approved oval slider grip, compact tables, divided dialog footers and animated mosaic headers. No avatars in the supplied table or timeline designs. Do not introduce new gradients, glass treatments, decorative cards or unregistered colors. Existing sea and mosaic effects are approved exceptions with defined component scope.

## Main app shell

The desktop shell has a persistent left sidebar and a header above the content. The sidebar starts expanded at 224px and collapses to a 64px icon rail; it remains a navigation landmark in both states. The header and brand row are 56px high. The brand uses a logo placeholder and the Goldfin wordmark; collapse hides the wordmark and retains the placeholder.

The header currently contains only the sidebar toggle. It exposes the expanded state and keeps keyboard focus when toggled. Navigation items, header actions and the mobile drawer remain to be designed. Desktop navigation uses ordinary landmarks and a button, with no modal focus trap.

## Themes and colors

Every colour token is declared once on `:root` and holds **both** themes in a single `light-dark()` value. There is no second override block. `color-scheme` starts at `dark` because dark is the default; `body[data-theme="light"]` and `body[data-theme="dark"]` only select a `color-scheme`, they do not redeclare tokens. Keep setting the theme on the document body so portaled dialogs and menus inherit it — `color-scheme` inherits, so this still works. A theme on an inner component wrapper is insufficient.

Colours are written in `oklch()`. A true gray has zero chroma and takes `none` as its hue, which stops a later `color-mix()` dragging it toward red. Derive a tint, hover or transparent variant with `color-mix(in oklch, …)`, never with a second hand-written colour.

Use semantic CSS variables in components. The following values record the current implementation; each was converted from the previous hex and verified to round-trip to the same 8-bit sRGB triple, so the rendered colour did not change.

### Core tokens

| Token | Role | Dark | Light |
| --- | --- | --- | --- |
| `--ubg` | Page | `oklch(18.196% 0.0044 264.46)` | `oklch(100% 0 none)` |
| `--usurf` | Raised surface | `oklch(20.924% 0.0061 271.12)` | `oklch(97.865% 0.0017 247.84)` |
| `--uwell` | Recessed surface | `oklch(19.595% 0.0062 271.09)` | `oklch(98.837% 0.0013 286.38)` |
| `--uline` | Divider/border | `oklch(29.312% 0.0095 268.35)` | `oklch(92.455% 0.0058 264.53)` |
| `--ufg` | Strong text | `oklch(96.696% 0.0029 264.54)` | `oklch(17.727% 0.0089 264.32)` |
| `--ufg2` | General text | `oklch(79.999% 0.0126 259.82)` | `oklch(39.165% 0.0193 257.26)` |
| `--ufg3` | Muted text | `oklch(65.792% 0.0151 258.36)` | `oklch(52.526% 0.0179 257.24)` |
| `--uprim` | Primary/control fill | `oklch(96.696% 0.0029 264.54)` | `oklch(18.637% 0.0088 264.34)` |
| `--uprimfg` | Primary/control contrast | `oklch(18.196% 0.0044 264.46)` | `oklch(100% 0 none)` |
| `--upill` | Neutral pill | `oklch(25.618% 0.0098 268.29)` | `oklch(95.719% 0.0034 247.86)` |
| `--key` | Accent/key | `oklch(71.374% 0.1434 254.62)` | `oklch(48.82% 0.2172 264.38)` |
| `--ok` | Success | `oklch(77.294% 0.1535 163.22)` | `oklch(50.813% 0.1049 165.61)` |
| `--bad` | Error/destructive | `oklch(71.063% 0.1661 22.22)` | `oklch(53.492% 0.2026 27.61)` |
| `--warn` | Warning | `oklch(83.686% 0.1644 84.43)` | `oklch(52.939% 0.118 63.6)` |

Boolean state is two-tone, not accent blue. Keep `--key` for its existing accent roles. Colors do not authorize invented processing states; application state and visible labels must agree.

### Motion tokens

| Token | Value | Use |
| --- | --- | --- |
| `--ease-out` | `cubic-bezier(.22, 1, .32, 1)` | The house curve. Anything that moves in space. |
| `--ease-in-out` | `cubic-bezier(.77, 0, .175, 1)` | Two-way state changes. |
| `--duration-press` | `150ms` | Press feedback, colour fades. |
| `--duration-ui` | `180ms` | Hover, focus, small state changes. |
| `--duration-menu` | `200ms` | Menus, popovers. |
| `--duration-panel` | `320ms` | Panels, disclosure, collapse. |

Never `ease-in` on UI. Never `transition: all`. A transition that moves or scales something belongs inside `@media (prefers-reduced-motion: no-preference)`; the layout state it animates stays outside, so the component is still correct when motion is refused. There is no global rule that strips motion after the fact.

### Font role tokens

`--font-ui` (Urbanist), `--font-body` (IBM Plex Sans), `--font-mono` (IBM Plex Mono). Declare the family once in `tokens.css` and reference the role; do not retype a stack in a component.

### Specialist tokens

| Token | Dark | Light |
| --- | --- | --- |
| `--uout` | `oklch(21.789% 0.0197 160.35)` | `oklch(97.248% 0.0099 155.1)` |
| `--uoutline` | `oklch(32.17% 0.0429 158.45)` | `oklch(91.154% 0.0292 156.6)` |
| `--uhl` | `oklch(28.257% 0.0395 257.77)` | `oklch(93.816% 0.0208 261.77)` |
| `--uhead` | `oklch(22.62% 0.0041 264.49)` | `oklch(100% 0 none)` |
| `--uprompt` | `oklch(18.22% 0 none)` | `oklch(96.995% 0.0029 264.54)` |
| `--upwell` | `oklch(15.907% 0 none)` | `oklch(100% 0 none)` |
| `--uresult` | `oklch(22.645% 0 none)` | `oklch(100% 0 none)` |
| `--urun` | `oklch(29.732% 0.0056 271.23)` | `oklch(100% 0 none)` |
| `--urunfield` | `oklch(34.473% 0.0054 271.26)` | `oklch(100% 0 none)` |
| `--urunwell` | `oklch(26.05% 0.0058 271.19)` | `oklch(97.865% 0.0017 247.84)` |
| `--urunline` | `oklch(39.75% 0.0072 264.49)` | `oklch(92.455% 0.0058 264.53)` |
| `--umenu` | `oklch(37.923% 0.0052 271.28)` | `oklch(100% 0 none)` |
| `--str` | `oklch(86.898% 0.0198 252.89)` | `oklch(37.17% 0.0392 257.29)` |
| `--num` | `oklch(83.686% 0.1644 84.43)` | `oklch(52.939% 0.118 63.6)` |
| `--p` | `oklch(64.045% 0.0189 256.32)` | `oklch(55.102% 0.0234 264.36)` |
| `--cnt` | `var(--ufg3)` | Inherited alias |
| `--badbg` | `color-mix(in oklch, var(--bad) 10%, transparent)` | `oklch(95.875% 0.0174 17.46)` |
| `--okbg` | `color-mix(in oklch, var(--ok) 10%, transparent)` | `oklch(95.634% 0.0192 167.93)` |
| `--runchip` | `oklch(57.504% 0.1637 261.7 / 0.16)` | `oklch(94.721% 0.0207 261.77)` |
| `--runchipfg` | `oklch(77.23% 0.1154 263.77)` | `oklch(48.82% 0.2172 264.38)` |
| `--runtext` | `oklch(95.697% 0.0203 264.47)` | `oklch(18.196% 0.0044 264.46)` |
| `--seawater` | `oklch(20.067% 0.0576 266.48)` | `oklch(95.306% 0.0166 259.42)` |
| `--seawater2` | `oklch(23.833% 0.0798 266.19)` | `oklch(100% 0 none)` |
| `--seawave` | `oklch(38.183% 0.1459 264.62)` | `oklch(80.757% 0.061 257.79)` |
| `--sel` | `oklch(57.504% 0.1637 261.7 / 0.32)` | `color-mix(in oklch, var(--key) 16%, transparent)` |
| `--hover` | `oklch(100% 0 none / 0.05)` | `oklch(0% 0 none / 0.05)` |
| `--scrim` | `oklch(0% 0 none / 0.58)` | `color-mix(in oklch, var(--uprim) 34%, transparent)` |

Keep existing shadow tokens `--runshadow`, `--uheadshadow`, `--urunshadow`, `--upwellshadow` and `--umenushadow` centralized in the same stylesheet. Reuse their current theme-specific definitions; do not scatter replacement shadows through consumers.

## Typography

| Role | Family and fallback | Current sizing |
| --- | --- | --- |
| General UI and page headings | Urbanist, system-ui, sans-serif | Base 13px / 1.5; section titles 15px; page title 22px |
| Explanatory content where specified | IBM Plex Sans, system-ui, sans-serif | Follow the existing component rule |
| Code, values and metadata | IBM Plex Mono, monospace | Typically 11–12px; preserve existing per-component rules |
| Tables | Inherited UI family | 14px / 1.5 |

The actual body rule is Urbanist, not IBM Plex Sans. Font roles are not interchangeable. Use the existing weights and tabular numerals for comparable numeric values. Keep numbers and their units together.

The showcase source entry loads Urbanist 400/500/600/700, IBM Plex Sans 400/500/600 and IBM Plex Mono 400/500/600 from Google Fonts. CSS fallbacks must remain usable if web fonts fail. An application importing only the component CSS must also supply the fonts. Deployment needing offline fonts must host them deliberately.

The compact 13px UI, smaller metadata, table padding and component-specific dimensions preserve the approved design; they are exceptions to a generic 16px-body/8px-grid baseline. Do not silently enlarge or normalize them during transfer. Dense metadata is not the recommended style for long reading passages.

This is why the shared reset deliberately omits `input { font-size: max(16px, 1rem) }`, which every other reset adds to stop iOS Safari zooming when a field takes focus. Applying it would resize every control in this design. The trade-off is recorded here on purpose: **on iOS, focusing a Goldfin input will zoom the page, and the user must pinch back out.** If that proves unacceptable, the fix is a deliberate design change to the compact type scale, not a reset rule.

## Spacing, shape and layout

- Default structural rhythm uses 4/8px steps and 12/16/24px grouping. Preserve existing optical exceptions such as 7/11px button geometry.
- Borders are generally 1px. Common containers use 8px corners; standard buttons use 7px. Rounded pills, switch tracks and slider thumbs retain their deliberate capsule shapes.
- Standard buttons are 30px high; neutral chips are 28px. Existing small variants keep their own dimensions.
- Tables retain 6px vertical and 16px horizontal cell padding. Contained tables use 8px corners. Do not restore the earlier 12px vertical padding.
- Lay content out in normal flex/grid flow. Reserve absolute positioning for intentional overlays, chrome and decorative mosaic layers.
- Keep `@layer od-layout` first in the shared stylesheet. Compose existing `od-row`, `od-field`, `od-fill`, `od-stat`, `od-cell`, `od-tile` and `od-screen` primitives.
- Stacked labels, helpers, values and captions are separate block-level pieces. Data can truncate or clamp only when the full value remains accessible. Authored headings and action labels must fit without truncation.
- Column counts are **intrinsic, not a breakpoint ladder**. Grids use `repeat(auto-fit, minmax(min(100%, N), 1fr))` and components that appear in slots of different widths use a container query. A table collapses to cards when its own container is under 480px, not when the viewport is; a horizontal timeline lays out when its container is over 768px. Keep viewport media queries for things that genuinely belong to the viewport, such as coarse-pointer touch targets.
- Showcase page padding reflows below 768px and the page measure widens at 1440px. Product layouts must also accommodate 375px without page-level horizontal overflow.
- Use full image frames for content-bearing images; preserve intrinsic ratios. Only deliberately decorative media may crop.

## CSS rules

- Write logical properties, never physical: `padding-inline`, `margin-block`, `inset-inline-start`, `border-start-start-radius`. Physical values remain only where no logical form exists, such as horizontal `box-shadow` offsets and the mosaic mask.
- Put every `:hover` rule inside `@media (hover: hover) and (pointer: fine)`. A tap is not a hover, and an unguarded hover sticks after a tap.
- Give every pressable an `:active` state.
- Style focus with `:focus-visible` and `outline`. **Never `outline: none`.** A component that draws its own ring with `box-shadow` keeps the outline and sets `outline-color: transparent`, so forced-colors mode can still repaint it.
- One focus ring for the whole library: `2px solid var(--ufg)` at `3px` offset. It is pinned by e2e; do not change the value.
- Use `overflow: clip` to cut off overflow, and `overflow: hidden` only where `text-overflow: ellipsis` must draw on a browser where `clip` is untested. Keep `auto` on real scroll areas and add `overscroll-behavior: contain` to them.
- Give an icon `flex: none` so it cannot be squeezed by the label beside it. Size travels as the `--icon-size` custom property, so a consumer can retune an icon to its label with a `cap` value without editing markup.
- Space between siblings belongs to the parent, through `gap`. A child carries no block margin for a gap it could have inherited.
- Naming utilities beat inline `style` attributes. One-off showcase spacing gets a named class in the stylesheet, not a `style=""`.

The shared CSS currently includes global selectors, legacy reference rules and showcase layout rules. Importing it affects the host document. Integrate deliberately; extracting a separately scoped production stylesheet is future work, not part of this handoff.

## Icons

Use `Icon.svelte` for the existing family: 24-unit viewbox, outline strokes, round caps/joins and 1.8 stroke width. Typical controls use 16–18px glyphs. Decorative glyphs are hidden from assistive technology; their parent control still needs an accessible name. Do not use emoji as functional icons.

## Component contract

Goldfin components are the application-facing API. Bits UI remains an upstream interaction dependency, not a fork. Native HTML handles simple elements. Business operations, persistence, model requests and domain validation belong to the product application.

### Buttons, boolean controls and cards

- Preserve primary, neutral, text, warning, danger and small variants where supplied.
- Checkbox, radio and switch selected states use `--uprim` / `--uprimfg`; invalid states retain explicit error treatment. Ticks remain visually centered.
- Switch geometry: default 36×20px with 16px thumb; small 28×16px with 12px thumb. State badges communicate On/Off as well as appearance.
- Switch cards compose a control with an icon, title and description; preserve selected styling and native keyboard interaction.
- Group selection and indeterminate state derive from the selected values, not an unrelated visual flag.

### Sliders

- Scalar value with explicit min/max/step, live formatted value and persistent label.
- Capsule thumb with the decorative `< | >` grip; do not restore the round dot.
- Default track 4px, thumb 28×16px; small track 2px, thumb 24×12px.
- Default interaction area is 32px; coarse-pointer styling expands it to 44px.
- Disabled sliders remain visible and cannot change. Preserve focus indication and decimal/integer formatting.
- Temperature and token limits in examples are illustrative; model-specific constraints are product data.

### Dialogs and mosaic

- Ordinary forms use `Dialog`; confirmations use `ConfirmDialog`.
- Titles and descriptions share the mosaic header, left-aligned and vertically centered with the icon. Form fields stay below the header.
- Keep the subtle icon drop shadow and separated footer across confirmation, deletion and suite creation.
- Tile pitch is 10px; column delays are 60ms. The 5-second cycle contains a broad 1.2-second pulse, traveling left to right. Each tile has randomized intensity; peaks refresh each pass.
- The mosaic band is masked from `--modal-header-height`, not from the header's rendered height. A header grows when its description wraps, and a percentage mask made the decoration render at two different sizes for no reason other than line count; a test asserts two dialogs with different header heights resolve to the same mask.
- Mosaic content is decorative and aria-hidden. The observer/listener are cleaned up on unmount, and animation pauses when the document is hidden.
- Confirmations use the existing Cancel-first focus behavior. Escape/scrim dismissal is allowed when idle; pending confirmation blocks dismissal and duplicate execution.
- Confirmation succeeds only after the application callback resolves. Rejection keeps the dialog open with retryable error feedback. Reopening resets prior result/error state.
- Keep clear close/cancel paths and focus restoration. Verify their browser behavior during product integration; this handoff does not certify it.

### Forms, menus and navigation

- Inputs keep visible labels, adjacent useful errors, required markers and validation on blur.
- Selection menus choose values; action menus invoke actions. Do not conflate those APIs.
- Preserve single/multiple selection, disabled options and selected/highlighted states.
- Tabs switch content; segmented controls express one selection. Retain keyboard operation and explicit selected state. The selection is one indicator element that slides to the selected segment, so a change reads as movement rather than a cross-fade; it is placed without transition on first paint and must not resize the control.
- FileDrop selects and validates a local file; it does not upload it. Full production validation remains application-owned.

### Tables

- Plain and contained variants; no avatars.
- Semantic headers and keyboard-accessible sort controls, ascending/descending feedback and compact spacing.
- Sort raw numeric size/time values rather than formatted labels. Preserve stable sorting, missing values last in either direction and non-mutating input handling.
- Row IDs must be unique. Keep mobile reflow and reachable sorting.

### Loading and timelines

- Preserve the ring/dot loaders and supplied 12 loading patterns.
- A loading button keeps one size across every state. While an operation runs, the spinner replaces the text: the label keeps its box and is only hidden, and the spinner is centred over the whole button rather than sitting beside the text. The text returns when the operation finishes. A dialog or form trigger is the standard button size and is not stretched by its container.
- Loading state must describe a real operation or clearly labeled local example. Cancellation and stale callbacks must not revive an outdated result.
- Preserve the 11 timeline layouts, status markers/connectors and native collapsible disclosures; no avatars.
- Show the application's real state with text as well as visual cues. Sample events are not production records.

### Data and special actions

- Run is exclusive to the main LLM test case. Its button has no cost or execution-time hint. App callbacks own real execution; sample mode is local. The sea rises as one body — water, crest and wave bands travel together — so the leading edge of the rise is a wave and never the straight edge of a sheet. Each wave band is a fixed height.
- JSONViewer provides escaped JSON text, line presentation, token colouring and a labelled region; it has no header and no whole-output disclosure. A line whose value is null carries a gutter dot and a full-width error band. A line that opens an object or array reports its direct child count. Any such line is also a fold control: the whole line toggles on click, Enter or Space, carries `aria-expanded`, and shows ▾ when open or ▸ when folded. Folding hides descendants and keeps original line numbers. Each line folds on its own. It is not a draggable or editable tree.
- CopyButton uses the browser clipboard and reports failure; clipboard availability depends on the browser context. On success the label swaps to "Copied!" and returns to its default label afterwards. The two labels are one overlapping cell, so the swap never resizes the button, and the swap is decorative — the status line carries the announcement.
- SplitPane currently collapses/restores a pane. It is not a draggable splitter.
- BudgetBar displays derived example values; it is not billing or a model-pricing authority.
- Chips, pills and status selection use existing tokens and explicit labels.
- `FieldGroup` renders its label, optional aside and content with no divider of its own. A stacked-group rule was removed: the only composition using it wanted the groups read as one block, and a divider there was noise. Separate the groups in CSS at the call site if a future composition needs it.

## Public inventory

The current barrel exports 56 components in two groups: 32 composed components, then 24 individual parts.

Composed: Slider, MosaicHeader, ConfirmDialog, Dialog, Button, Icon, Checkbox, CheckboxGroup, RadioGroup, Switch, SwitchCard, Input, Select, StatusSelect, DropdownMenu, Tabs, SegmentedControl, Pill, Chip, Spinner, LoadingTask, LoadingSearch, Table, BudgetBar, RunButton, CopyButton, SplitPane, FileDrop, JSONViewer, Timeline, TimelineItem and FieldGroup.

Individual parts exist so a screen can build its own instead of settling for the array shape: `DialogHeader`, `DialogBody`, `DialogFooter`, `SwitchControl`, `TableSortButton`, `TableEmpty`, `TimelineMarker`, `TabList`, `TabTrigger`, `TabContent`, `MenuItem`, `MenuSeparator`, `MenuLabel`, `SegmentedItem`, `Mosaic`, `Sea`, `JSONLine`, `LoadingButton`, `LoadingOverlay`, `LoadingStatus`, `ReadRow`, `Section`, `Skeleton`, `ThemeToggle`.

The parts are additive. The composed component stays the convenient default and keeps its props; a part only earns its place where the composed shape cannot express what a screen needs. `SegmentedItem` still renders the `.seg-btn` class because the sliding thumb measures that class. `Mosaic` and `Sea` are the animated systems lifted out of `MosaicHeader` and `RunButton`, which keep their own props and output.

API examples live in the source README and example files. `src/lib/` holds only what a screen imports: the 56 exported components, their pure helpers, and `index.js`. LoadingGallery, TimelineGallery, TableExamples and TokenGallery are showcase compositions and live in `src/examples/`, not `src/lib/`. Keep sample state out of reusable primitives: `src/lib/` file count matches the export count.

## Motion and accessibility requirements

The existing switch transition is 180ms. Ordinary state transitions should remain within 150–300ms and larger transitions within 400ms unless the already-approved timed sea/mosaic effect applies. Animate transform/opacity rather than layout dimensions in new interactions.

`cubic-bezier(.22,1,.32,1)` is the house easing curve. It reaches half its travel in roughly the first eighth of its duration, so it reads as responsive rather than soft. Use it for anything that moves in space. A duration given with no easing function inherits the browser default and is a defect: `.dd-trigger svg` carried `transform 150ms` with no curve while the timeline disclosure used a different one, so two chevrons meaning the same thing disagreed. The disclosure chevrons now share 180ms on the house curve.

Two disclosure surfaces must not disagree. More generally, one meaning gets one duration and one curve; where a second surface expresses the same state change, match the first rather than choosing independently.

A state change is not finished when the value changes, it is finished when the change is seen. A press on a button scales to 0.97 over 150ms; the dialog rises into place rather than dissolving; loading content fades to its working state over 150ms and the in-button spinner fades rather than appearing from nothing. Prefer an interruptible property — opacity, transform — over `visibility`, which cannot be retargeted mid-flight.

Entering and leaving a busy state are not symmetric. The Run label keeps its 400ms colour fade on the way in, where the user is committing, and returns over 200ms on the way out, where the system is only reporting back and the water is still draining. Slow where a person decides, fast where the system answers.

A dialog is centred by its own `transform: translate(-50%,-50%)`, and an entrance keyframe that animates `transform` from an untransformed state overwrites that centring for the whole duration. The entrance keyframe must restate the centring translate it replaces, or the dialog animates in from off-centre. A test asserts this.

Reduced-motion styling disables animations and transitions. Avoid dependence on animation for status or comprehension. Because a tile's randomisation is driven by the animation's own iteration event, killing the animation also stops that work; a reduced-motion guard in the script layer would guard a path that cannot be reached.

Product integration must retain accessible names, labels, focus order, visible focus, keyboard controls, disabled behavior, non-color state cues and system zoom. General final focus styling is a 2px foreground outline with 3px offset; the slider thumb uses its explicit accent outline.

Coarse-pointer controls need at least 44px interaction targets. The coarse-pointer block covers `.ctl`, `.dd-trigger`, `.btn`, `.seg-btn`, `.tab` and `.table-sort`; a narrow viewport separately covers the table sort. Those two conditions are complementary — a wide tablet was previously uncovered. This is not a blanket certification of every exported control. Mobile consumers must retain sufficient spacing between adjacent targets. A loading button is a positioning context so its absolutely centred spinner resolves against the button rather than an ancestor.

Integration acceptance must assess each theme independently: at least 4.5:1 for body text and 3:1 for large text/essential graphics. These are requirements, not a claim that every inherited color pairing has been audited.

## Dependencies and integration boundaries

Current private starter versions:

| Dependency | Pinned version |
| --- | --- |
| Svelte | 5.57.1 |
| Bits UI | 2.19.5 |
| Vite | 8.3.2 |
| Svelte Vite plugin | 7.3.1 |

The lockfile records transitive versions. Transfer source and lockfile, not installed dependencies or generated builds. Keep the library local; no package publication or component factory is needed.

The main repository specifies SvelteKit with static output. Its future application host should reuse these component sources and styling deliberately, rather than nest another starter inside the product. This handoff does not create the product host, API integration or deployment configuration.

## Change procedure

1. Make the smallest authorized change to a shared token or reusable component.
2. Update this contract when design intent changes; update API examples when the public API changes.
3. Keep relevant helper tests with new logic. Native presentation/glue does not need tests that merely repeat upstream behavior.
4. Update affected compositions and rebuild the consumer/showcase as required.
5. Product integration owns browser, keyboard, theme and responsive verification before release.

After transfer, treat the main repository's source as the active copy. The Open Design copy is a handoff snapshot; do not maintain both as silently synchronized sources.

## Verification status and remaining work

Existing generation compiled component candidates and checked selected pure logic before writing source. The showcase generation completed previously. Browser interactions, focus restoration, responsive rendering and visual parity were not independently verified.

A later motion pass changed only `goldfin.css` and added stylesheet tests. It did not change any component, so the public inventory and `src/lib/index.js` are unchanged. It was verified by reading source and by three regression tests that assert the cross-file contracts the motion work depends on: the entrance keyframe restating the dialog's centring translate, the button being a positioning context for the centred spinner, and `RunButton` still emitting the `aria-busy` the asymmetric label fade selects on. Those assertions are non-vacuous; each was checked against a deliberately broken value.

**Browser verification: now performed, in Chromium.** An e2e suite existed and was committed (`e2e/components.spec.js` with eleven tests covering MosaicHeader peak refresh, the focus ring, ARIA validity, JSONViewer, CopyButton, Timeline, FileDrop, Select and Tabs). It could never run: `playwright.config.ts` pointed `testDir` at a non-existent absolute path and the file lived at the repository root while the components live in `Goldfin_Components/`, so the `@playwright/test` import resolved to two different module instances and every invocation failed. The config now lives beside its own `package.json`, drives the Vite dev server, and runs twenty-six tests: the original eleven plus fifteen covering the motion decisions recorded above.

That pass verifies, in a rendered browser, that a closing dialog restores focus to its trigger and never falls back to `body`; that the dialog stays centred through its entrance and not merely at rest; that a pressed button settles to `matrix(0.97, 0, 0, 0.97, 0, 0)`; that the loading spinner never changes the button box; that the Run label fades at 0.4s going in and 0.2s coming out; that the mosaic does not animate under reduced motion; that the table sort reaches 44px on a coarse pointer with the pointer actually coarse; and that 375px produces no horizontal overflow. The dialog-centring assertions were mutation-checked against the pre-fix keyframe and do fail without it.

Only Chromium was exercised. Firefox and WebKit are installed and configured for in spirit but were not run, so the `-webkit-` prefixed paths and Safari's `<dialog>` behaviour are unverified. The remaining gap is cross-browser, not unverified-anywhere.

This handoff adds documentation and packages unchanged source; it adds no new component/domain logic and does not claim new tests, rendering or archive validation. Archive contents are selected during creation, not inspected after generation.

Remaining work: transfer into the main repository, integrate a real screen using its product host and review runtime behavior there. External font hosting, production CSS scoping and the documented JSONViewer/SplitPane limitations remain explicit integration considerations.
