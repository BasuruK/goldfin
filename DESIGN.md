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

## Themes and colors

Dark values are declared on `:root, body`. Light overrides are declared on `body[data-theme="light"]`; dark is the default. Set the theme on the document body so portaled dialogs and menus inherit it. A theme on an inner component wrapper is insufficient.

Use semantic CSS variables in components. The following values record the current implementation.

### Core tokens

| Token | Role | Dark | Light |
| --- | --- | --- | --- |
| `--ubg` | Page | `#111214` | `#ffffff` |
| `--usurf` | Raised surface | `#17181b` | `#f7f8f9` |
| `--uwell` | Recessed surface | `#141518` | `#fbfbfc` |
| `--uline` | Divider/border | `#2a2c31` | `#e4e6ea` |
| `--ufg` | Strong text | `#f3f4f6` | `#0f1115` |
| `--ufg2` | General text | `#b9bec6` | `#3f4650` |
| `--ufg3` | Muted text | `#8c929b` | `#646b75` |
| `--uprim` | Primary/control fill | `#f3f4f6` | `#111317` |
| `--uprimfg` | Primary/control contrast | `#111214` | `#ffffff` |
| `--upill` | Neutral pill | `#212328` | `#eff1f3` |
| `--key` | Accent/key | `#60a5fa` | `#1d4ed8` |
| `--ok` | Success | `#34d399` | `#047857` |
| `--bad` | Error/destructive | `#f87171` | `#c81e1e` |
| `--warn` | Warning | `#fbbf24` | `#9a5a06` |

Boolean state is two-tone, not accent blue. Keep `--key` for its existing accent roles. Colors do not authorize invented processing states; application state and visible labels must agree.

### Specialist tokens

| Token | Dark | Light |
| --- | --- | --- |
| `--uout` | `#121d17` | `#f1f8f3` |
| `--uoutline` | `#1f3a2b` | `#d3e8da` |
| `--uhl` | `#1d2a3d` | `#e3ebf9` |
| `--uhead` | `#1b1c1e` | `#ffffff` |
| `--uprompt` | `#121212` | `#f4f5f7` |
| `--upwell` | `#0d0d0d` | `#ffffff` |
| `--uresult` | `#1c1c1c` | `#ffffff` |
| `--urun` | `#2c2d30` | `#ffffff` |
| `--urunfield` | `#38393c` | `#ffffff` |
| `--urunwell` | `#232427` | `#f7f8f9` |
| `--urunline` | `#45474b` | `#e4e6ea` |
| `--umenu` | `#414245` | `#ffffff` |
| `--str` | `#cbd5e1` | `#334155` |
| `--num` | `#fbbf24` | `#9a5a06` |
| `--p` | `#858d98` | `#6b7280` |
| `--cnt` | `var(--ufg3)` | Inherited alias |
| `--badbg` | `rgba(248,113,113,.10)` | `#fdeded` |
| `--okbg` | `rgba(52,211,153,.10)` | `#e5f5ee` |
| `--runchip` | `rgba(63,116,216,.16)` | `#e6eefc` |
| `--runchipfg` | `#8fb4ff` | `#1d4ed8` |
| `--runtext` | `#eaf1ff` | `#111214` |
| `--seawater` | `#0a1430` | `#e9f0fb` |
| `--seawater2` | `#0d1b44` | `#ffffff` |
| `--seawave` | `#1a3a8f` | `#a8c2e8` |
| `--sel` | `rgba(63,116,216,.32)` | `rgba(29,78,216,.16)` |
| `--hover` | `rgba(255,255,255,.05)` | `rgba(0,0,0,.05)` |
| `--scrim` | `rgba(0,0,0,.58)` | `rgba(17,19,23,.34)` |

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

## Spacing, shape and layout

- Default structural rhythm uses 4/8px steps and 12/16/24px grouping. Preserve existing optical exceptions such as 7/11px button geometry.
- Borders are generally 1px. Common containers use 8px corners; standard buttons use 7px. Rounded pills, switch tracks and slider thumbs retain their deliberate capsule shapes.
- Standard buttons are 30px high; neutral chips are 28px. Existing small variants keep their own dimensions.
- Tables retain 6px vertical and 16px horizontal cell padding. Contained tables use 8px corners. Do not restore the earlier 12px vertical padding.
- Lay content out in normal flex/grid flow. Reserve absolute positioning for intentional overlays, chrome and decorative mosaic layers.
- Keep `@layer od-layout` first in the shared stylesheet. Compose existing `od-row`, `od-field`, `od-fill`, `od-stat`, `od-cell`, `od-tile` and `od-screen` primitives.
- Stacked labels, helpers, values and captions are separate block-level pieces. Data can truncate or clamp only when the full value remains accessible. Authored headings and action labels must fit without truncation.
- Existing showcase layouts reflow below 768px, adapt three-column grids to two columns from 768–1023px and widen at 1440px. Product layouts must also accommodate 375px without page-level horizontal overflow.
- Use full image frames for content-bearing images; preserve intrinsic ratios. Only deliberately decorative media may crop.

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
- Mosaic content is decorative and aria-hidden. The observer/listener are cleaned up on unmount, and animation pauses when the document is hidden.
- Confirmations use the existing Cancel-first focus behavior. Escape/scrim dismissal is allowed when idle; pending confirmation blocks dismissal and duplicate execution.
- Confirmation succeeds only after the application callback resolves. Rejection keeps the dialog open with retryable error feedback. Reopening resets prior result/error state.
- Keep clear close/cancel paths and focus restoration. Verify their browser behavior during product integration; this handoff does not certify it.

### Forms, menus and navigation

- Inputs keep visible labels, adjacent useful errors, required markers and validation on blur.
- Selection menus choose values; action menus invoke actions. Do not conflate those APIs.
- Preserve single/multiple selection, disabled options and selected/highlighted states.
- Tabs switch content; segmented controls express one selection. Retain keyboard operation and explicit selected state.
- FileDrop selects and validates a local file; it does not upload it. Full production validation remains application-owned.

### Tables

- Plain and contained variants; no avatars.
- Semantic headers and keyboard-accessible sort controls, ascending/descending feedback and compact spacing.
- Sort raw numeric size/time values rather than formatted labels. Preserve stable sorting, missing values last in either direction and non-mutating input handling.
- Row IDs must be unique. Keep mobile reflow and reachable sorting.

### Loading and timelines

- Preserve the ring/dot loaders and supplied 12 loading patterns.
- Loading state must describe a real operation or clearly labeled local example. Cancellation and stale callbacks must not revive an outdated result.
- Preserve the 11 timeline layouts, status markers/connectors and native collapsible disclosures; no avatars.
- Show the application's real state with text as well as visual cues. Sample events are not production records.

### Data and special actions

- Run is exclusive to the main LLM test case. Its button has no cost or execution-time hint. App callbacks own real execution; sample mode is local.
- JSONViewer provides escaped JSON text, line presentation and whole-output disclosure. It is not a nested syntax-tree editor or full syntax highlighter.
- CopyButton uses the browser clipboard and reports failure; clipboard availability depends on the browser context.
- SplitPane currently collapses/restores a pane. It is not a draggable splitter.
- BudgetBar displays derived example values; it is not billing or a model-pricing authority.
- Chips, pills and status selection use existing tokens and explicit labels.

## Public inventory

The current barrel exports 32 components:

Slider, MosaicHeader, ConfirmDialog, Dialog, Button, Icon, Checkbox, CheckboxGroup, RadioGroup, Switch, SwitchCard, Input, Select, StatusSelect, DropdownMenu, Tabs, SegmentedControl, Pill, Chip, Spinner, LoadingTask, LoadingSearch, Table, BudgetBar, RunButton, CopyButton, SplitPane, FileDrop, JSONViewer, Timeline, TimelineItem and FieldGroup.

API examples live in the source README and example files. LoadingGallery, TimelineGallery, TableExamples and TokenGallery are showcase/support compositions, not additional public exports. Keep sample state out of reusable primitives.

## Motion and accessibility requirements

The existing switch transition is 180ms. Ordinary state transitions should remain within 150–300ms and larger transitions within 400ms unless the already-approved timed sea/mosaic effect applies. Animate transform/opacity rather than layout dimensions in new interactions.

Reduced-motion styling disables animations and transitions. Avoid dependence on animation for status or comprehension.

Product integration must retain accessible names, labels, focus order, visible focus, keyboard controls, disabled behavior, non-color state cues and system zoom. General final focus styling is a 2px foreground outline with 3px offset; the slider thumb uses its explicit accent outline.

Coarse-pointer controls need at least 44px interaction targets. Existing coarse-pointer CSS expands several controls, but this is not a blanket certification of every exported control. Mobile consumers must retain sufficient spacing between adjacent targets.

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

This handoff adds documentation and packages unchanged source; it adds no new component/domain logic and does not claim new tests, rendering or archive validation. Archive contents are selected during creation, not inspected after generation.

Remaining work: transfer into the main repository, integrate a real screen using its product host and review runtime behavior there. External font hosting, production CSS scoping and the documented JSONViewer/SplitPane limitations remain explicit integration considerations.
