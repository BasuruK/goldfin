# CSS cleanup — TASKS

Goal: apply the `good-css` skill to `src/` so the styles are clean, sharable and
maintainable. **`DESIGN.md` is binding; where the two disagreed the change was
approved by the user and `DESIGN.md` was updated in the same change.**

Baseline and result: `npm test` 46/46 pass, `npx playwright test` 32/32 pass in
Chromium, `npm run build` clean with no Svelte warnings.

## Decisions taken (approved 2026-10-08)

- [x] **D1** Colour converted to `oklch()`. Every value was verified to round-trip
      to the same 8-bit sRGB triple, so nothing moved. A true gray has chroma of
      exactly 0 and takes `none` as its hue; the subtly tinted grays keep theirs.
- [x] **D2** Theme switched to `light-dark()`. `body[data-theme]` still sets the
      theme, because that is what the toggle writes and what portaled menus
      inherit — it now selects a `color-scheme` instead of redeclaring tokens.
- [x] **D3** Column-count breakpoint ladders replaced with intrinsic grids.

## House rules applied

1. Logical properties over physical. Kept physical only where no logical form
   exists (horizontal box-shadow offsets, the mosaic mask).
2. Every `:hover` inside `@media (hover: hover) and (pointer: fine)`.
3. `:focus-visible` + `outline` everywhere. **No `outline: none` anywhere**;
   components that draw their own box-shadow ring set `outline-color: transparent`.
4. Every pressable gets `:active`.
5. Transitions that move or scale sit inside `@media (prefers-reduced-motion:
   no-preference)`. Layout state sits outside; only the transition is motion.
6. `overflow: clip` where nothing scrolls; `auto` kept on real scrollers.
7. Icons carry `flex: none` and size from one custom property.
8. Space between siblings owned by the parent.
9. **The two global `transition-duration: .01ms !important` nukes are gone.**
   Every animation is now guarded at its own rule.
10. Duplicated declarations, dead rules and hand-written second hexes removed.

## Pass 0 — Foundations

- [x] **P0.1** `tokens.css` — oklch conversion + `light-dark()`. `scripts/oklch.mjs`
      converts and verifies; it rejected seven subtly-tinted grays on the first
      run, which is why the near-gray threshold is `C < 0.00005`, not `0.004`.
- [x] **P0.2** `tokens.css` — motion tokens (`--ease-out` is the DESIGN.md house
      curve), duration tokens, three font-role tokens.
- [x] **P0.3** `tokens.css` — reset: `min-width: 0` on `*`, media defaults, tap
      highlight, `user-select: none` on controls, `-moz-osx-font-smoothing`,
      `interpolate-size`, `text-wrap: pretty`.
- [x] **P0.4** `tokens.css` — one focus ring, one `::selection`.
- [x] **P0.5** `layout.css` — audit done; `min-width: 0` no longer repeated, all
      logical, `dvh` app shell, `overscroll-behavior` on the rail.
- [x] **P0.6** Both global reduced-motion blocks removed; `index.html` gained
      `<meta name="color-scheme" content="dark light">`.

## Pass 1 — Controls

- [x] **P1.1** Button — hover gated, `:active` on every variant, motion tokenised,
      redundant font re-declaration removed from the link variant.
- [x] **P1.2** Input — `outline: 0` → `outline-color: transparent`, `in srgb` → `in oklch`.
- [x] **P1.3** Field layer — logical margins, hover gated, `:has()` invalid states
      merged into one rule.
- [x] **P1.4** Checkbox / **P1.5** Radio / **P1.6** Switch — logical properties,
      motion guarded, hover gated.
- [x] **P1.7** SwitchCard — `overflow` clip, `outline: none` → `outline-color:
      transparent`, grid made intrinsic so the 520px query is gone.
- [x] **P1.8** FieldGroup.

## Pass 2 — Selection & navigation

- [x] **P2.1** Select — chevron motion guarded, hover gated, logical.
- [x] **P2.2** StatusSelect — `.dd-label` merged into the trigger block.
- [x] **P2.3** DropdownMenu — `.gf-menu` documented as the scroll area, given
      `overscroll-behavior: contain`.
- [x] **P2.4** SegmentedControl — `in srgb` → `in oklch`, thumb slide guarded.
- [x] **P2.5** Tabs — hover gated, `safe center`, `flex: none`, logical radii.

## Pass 3 — Overlays

- [x] **P3.1** Dialog — logical properties, tokens, ring kept as e2e pins it.
- [x] **P3.2** ConfirmDialog — fixed the quoted-attribute Svelte warning.
- [x] **P3.3** MosaicHeader — `overflow: clip`, icon shadow to oklch.
- [x] **P3.4** SplitPane — collapsed state hoisted out of the motion query so the
      knob stays centred either way; `overflow: clip`.

## Pass 4 — Data

- [x] **P4.1** Table — **viewport media query replaced with `@container (width <
      480px)`** on `.table-frame`, so a table in a narrow column collapses the
      same way it does on a phone. Logical radii, `text-align: start`.
- [x] **P4.2** Timeline — **768px media query replaced with a container query**,
      logical properties throughout.
- [x] **P4.3** TimelineItem / details — `::details-content` accordion animation,
      no script.

## Pass 5 — Loading & feedback

- [x] **P5.1** Spinner / **P5.2** LoadingTask / **P5.3** LoadingSearch — logical,
      `in srgb` → `in oklch`, `outline: 0` removed.
- [x] **P5.4** RunButton — sea animations guarded at the rule; the endless scroll
      and bob stop under reduced motion while the rise and sink survive.
- [x] **P5.5** CopyButton — `overflow: clip`.

## Pass 6 — Content

- [x] **P6.1** Chip — **removed `--chip-bg`**, declared on four tones and never read.
- [x] **P6.2** Pill.
- [x] **P6.3** Icon — size now travels as `--icon-size` so a consumer can retune
      an icon to its label with `1.2cap` without editing markup; `flex: none` added.
- [x] **P6.4** JSONViewer — hover gated, logical, `overscroll-behavior`.
- [x] **P6.5** BudgetBar / legend / row / meta — inline swatch colours became
      classes so the bar and the legend cannot disagree.
- [x] **P6.6** FileDrop — inset shadow to oklch.

## Pass 7 — Showcase shell

- [x] **P7.1** `.page` / `.page-header` — `--page-max` token, `scroll-padding` for
      the in-page index, logical properties.
- [x] **P7.2** `.grid-2..5` — intrinsic `repeat(auto-fit, minmax(min(100%, N), 1fr))`.
      The 767px and 768–1023px column queries are deleted.
- [x] **P7.3** `.gf-index`, `.gf-skip`, swatches — hover gated, logical.
- [x] **P7.4** Every inline `style=""` removed from the Svelte, replaced by named
      classes. TokenGallery now paints `var(--token)` so it cannot drift again.

## Close-out

- [x] **C1** `npm test` — 46/46
- [x] **C2** `npm run build` — clean, no Svelte warnings
- [x] **C3** `npx playwright test` — 32/32 Chromium, no 375px horizontal overflow
- [x] **C4** `DESIGN.md` updated
- [x] **C5** Visual before/after

## Bugs found while verifying

The work was checked by running the original tree and the new tree side by side and
diffing them, not by eyeballing the new one.

1. **`.field-legend` gained 12px.** Replacing the `margin: 0 0 10px` shorthand with
   `margin-block-end: 10px` left the UA's `1em` margin-top on a `<p>` in place.
   Caught by walking every element top-to-bottom and comparing `offsetTop`. Fixed
   with `margin-block: 0 10px`.
2. **`.tone-row` lost 8px.** Its offset lived in an inline `style` on all four
   instances; removing the inline style without moving the value to the class
   dropped it. Fixed by putting it on `.tone-row`.
3. **Inline `style="width"` on the table header broke card mode (found during the
   `main` merge, not by review).** `main`'s component split added
   `style:width={column.width}` to the `<th>`. An inline width wins the cascade, so
   the card-mode container query could not hand layout back to its two-column grid:
   the cells fell to 55px and every label wrapped, pushing the header to 147px. The
   width now travels as `--col-width` and card mode resets it to `auto`. This is
   why the inline-style rule exists at all — an inline value that varies per element
   and that a layout mode must be able to override should be a custom property.

### Retracted

An earlier revision of this file recorded a "card-mode table headers collapse to one
letter per line at 375px" defect as pre-existing and unfixed. **That was wrong.** It
came from a measurement taken against a stale build with the wrong viewport. The
current tree measures every header at 171×44px in card mode, the rendered table is
correct, and `card-mode table headers keep one line at 375px` covers it. No ticket.

## Deliberate deviations from the skill

- **`input { font-size: max(16px, 1rem) }` is not applied.** The skill reset sets
  it to stop iOS zooming on focus. This design is a compact 13px UI and
  `DESIGN.md` forbids normalising it. The trade-off is recorded in `tokens.css`
  and now in `DESIGN.md`, not silently taken.
- **No `scrollbar-gutter` rule.** On `:root` it narrows the containing block of
  every `position: fixed` element while `innerWidth` stays put, and a centred
  dialog opens half a scrollbar off-centre; caught by e2e. The later
  `html:has(dialog[open])` form was removed too: the dialogs are bits-ui, not
  native `<dialog>`, so it never matched, and bits-ui owns the scroll lock.
- **`.drop .name` keeps `overflow: hidden`, not `clip`.** It carries
  `text-overflow: ellipsis`, and the skill names `hidden` as the Firefox fallback
  for exactly this case.
- **`.tabs` has no `overflow-x: auto`.** The active underline relies on a `-1px`
  overlap with the row border; a scroll container computes `overflow-y` to `auto`
  and would clip it.

## Parked, not done

- **`.tab` horizontal overflow scrolling** — the underline overlap is solvable
  (row line as `box-shadow: inset 0 -1px`, no `-1px` margin). The real blocker is
  the focus ring: a scroll container clips descendant outlines, and the house
  ring reaches 5px past the tab. Needs a design decision on the tab focus ring.
- **Cross-browser verification** — Firefox and WebKit are installed and configured
  but were never run, so everything above is verified in Chromium only.
- **`--page-header-offset` is 24px** — the header does not stick, so the value
  is a breathing gap above in-page index jumps. If the header ever sticks, set
  it to the header's measured height.
- **Native `<dialog>` instead of bits-ui** — bits-ui's dialog is headless, so
  `.gf-modal` centring duplicates nothing. The dead native-`<dialog>` CSS
  (`::backdrop`, `[open]`, `.mosaic-paused`) is removed. Moving to `showModal()`
  would hand the top layer and centring to the platform, but it is a behaviour
  change and needs its own ticket.