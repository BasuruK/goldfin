# Goldfin source handoff

Prepared: 2026-10-04.
Destination: `<repo-root>`.

## Deliverables

- Root `DESIGN.md`: authoritative design rules.
- This `HANDOFF.md`: transfer and ownership instructions.
- `Goldfin_Components/handoff/Goldfin-source-handoff.zip`: source archive.

The archive expands to:

```text
DESIGN.md
HANDOFF.md
Goldfin_Components/
  README.md
  package.json
  package-lock.json
  .gitignore
  vite.config.js
  index.html
  src/
    goldfin.css
    main.js
    App.svelte
    examples/
    lib/
  tests/
```

Dependencies, generated `dist/`, Git internals, Open Design metadata, private environment files and temporary packaging files are excluded. The original HTML reference is not an active source in this package.

## Transfer without overwriting existing work

1. Extract the ZIP into a new empty folder. Do not extract directly over the main repository.
2. Open `<repo-root>`. Review its current changes before importing anything.
3. If root `DESIGN.md`, `HANDOFF.md` and `Goldfin_Components/` do not already exist, copy those three entries into the repository root.
4. If any destination exists, compare and merge deliberately. Do not replace a directory wholesale or discard existing design decisions.
5. Review the imported diff. Keep it uncommitted until you choose to commit it.

This session creates the package in the Open Design project. It does not write into the destination repository.

## Ownership after transfer

| Edit | Location in the main repository |
| --- | --- |
| Design intent and usage rules | `DESIGN.md` |
| Shared styles and theme values | `Goldfin_Components/src/goldfin.css` |
| Reusable components | `Goldfin_Components/src/lib/` |
| Public exports | `Goldfin_Components/src/lib/index.js` |
| Sample compositions | `Goldfin_Components/src/examples/` |
| Showcase arrangement | `Goldfin_Components/src/App.svelte` |
| Pure helper tests | `Goldfin_Components/tests/` |

The main repository becomes the active source. The Open Design project and original HTML remain snapshots; there is no automatic synchronization between repositories or between Markdown and CSS.

This root `DESIGN.md` supersedes the transferred README's historical wording that the original HTML reference is the design authority. Retain the README's setup/API examples and historical verification record.

## Run the transferred showcase

In your terminal:

```sh
cd <repo-root>/Goldfin_Components
npm ci
npm run dev
```

Open the localhost URL printed by Vite. Use the compatible Node version described in the source README; the starter was originally generated with Node 26.7.0.

For subsequent integration work, the existing scripts are:

```sh
npm test
npm run build
```

The build produces `Goldfin_Components/dist/`. Serve that output over HTTP when needed. The Open Design project's root launcher is preserved in that project; it is not included in this source archive and is not your product entry.

The test files are supplied for future use. This handoff does not claim they were executed again.

## Integrate into the product host

The main repository specifies a SvelteKit frontend with static output. Keep its architecture and domain vocabulary. This package does not scaffold that frontend or implement a feature.

- Application screens use Goldfin components; those components use Bits UI internally where needed.
- Import the shared stylesheet once at the host entry. Supply the declared fonts; their loading is currently in the showcase HTML, not embedded in the stylesheet.
- Theme state belongs on `body`; portaled UI must inherit the same tokens.
- Reuse the product application's build setup. Do not nest the transferred Vite starter inside the production app.
- Retain this starter as a separate component showcase until the application consumes the source through a single deliberate integration. Do not maintain copied components as two active implementations.
- Keep application calls, persistence, uploads and domain validation outside the reusable controls.
- Start with one approved real screen. The main repository's feature workflow and `AGENTS.md` govern that implementation.

The stylesheet currently includes global resets/selectors, reference rules and showcase styles. Review their impact before importing into the product. A scoped production extraction is not included here.

## Limits carried with the handoff

- No new packages, component behavior changes, application scaffold, real model requests or backend wiring.
- Font loading currently depends on Google Fonts and retains CSS fallbacks.
- Browser behavior, keyboard/focus restoration, mobile rendering and visual parity remain unverified.
- JSONViewer is escaped text with whole-output disclosure, not a full syntax-tree renderer.
- SplitPane is collapsible, not a draggable resizer.
- Sample loading, suite creation, pairing and deletion are local examples; model bounds/prices are not production guarantees.
- Design/code synchronization is manual.

The documents reflect the approved existing design. The ZIP is source transfer, not certification of production readiness.
