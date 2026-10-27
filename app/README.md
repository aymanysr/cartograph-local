# `app/` — Browser UI Layer

`app/` holds the browser-only code of the single-page app. These six files are
the runtime half of `cartograph.html`: the parser, agent planner, eval scorer,
and fit-camera helpers still live untouched in [`../lib/README.md`](../lib/README.md), and this
layer is everything that touches `window`, `document`, the canvas, and the DOM.
There is no framework, no build step, no bundler, and no dependency — the files
are classic (non-module) scripts that attach functions to the global namespace.

On 2026-10-27 the single ~2200-line inline `<script>` block inside
`cartograph.html` was split into these six files. The code moved **verbatim**:
no edits beyond the two header comment lines. "Original file order" means the
slices were cut at section boundaries and re-joined by `<script>` tags in the
exact order the code executed before the split. Every file opens with a
provenance header
(`Moved verbatim from cartograph.html (split preserved original file order).`),
and the split is behavior-preserving.

## Load order

`cartograph.html` loads the four `lib/` modules from its `<head>` and ends its
`<body>` with explicit `<script src>` tags for these six files, in exactly
this order:

| # | File | Handle |
| --- | --- | --- |
| 1 | `app/cartograph-preset-repos.js` | declares `const PRESET_REPOS` |
| 2 | `app/cartograph-graph-state.js` | declares `const state` |
| 3 | `app/cartograph-canvas-render.js` | global functions |
| 4 | `app/cartograph-ui-panels.js` | global functions |
| 5 | `app/cartograph-agent-evals.js` | global functions |
| 6 | `app/cartograph-app-shell.js` | global functions + DOMContentLoaded bootstrap |

The invariant this order guarantees:

- **Classic scripts execute in document order.** The only reusable top-level
  values — `PRESET_REPOS` (file 1) and `state` (file 2) — are `const`
  declarations that exist before any later file reads them.
- **Top-level `function` declarations become globals.** Inline
  `onclick="..."` attributes in the markup (and cross-file calls such as
  `computeGraphNodePositions` in the bootstrap) keep working because every
  helper is a top-level declaration.
- **The one other top-level statement** is the `DOMContentLoaded` listener
  registration in file 6. Registration itself is harmless in any order; its
  callback only runs once the DOM is ready, i.e. after all six scripts have
  loaded, which is why it can safely call `computeGraphNodePositions()`,
  `startCanvasAnimationLoop()`, and `lucide.createIcons()`.

Reordering files, converting them to ES modules, or wrapping them in an IIFE
(a `(function(){ ... })()` wrapper that would hide top-level declarations from
the global scope) would break this contract.

## What lives here

| File | Role |
| --- | --- |
| `cartograph-preset-repos.js` | `PRESET_REPOS`: three embedded sample repositories (`cartograph-nextjs-saas`, `fintech-checkout-service`, `python-rag-orchestrator`) shipped as raw source strings and parsed through `CartographParser` when one is selected or loaded; also the `AGENT_TOOLS` sample block, in the top bar dropdown |
| `cartograph-graph-state.js` | The `state` machine, `getLayerMeta`, `parseRepositoryIntoGraph` (calls `CartographParser.parseRepository`), `applyParsedGraph`, `computeGraphNodePositions` (uses `CartographFit.computeFitCamera`), and `getNodeVisualRole` |
| `cartograph-canvas-render.js` | `drawDependencyGraph` and the canvas animation loop; mouse/wheel/drag interactions, `zoomGraph`, `resetGraphView`, `setGraphLayout`, and the blast-radius isolate + break-simulation toggles |
| `cartograph-ui-panels.js` | File chips (`makeFileChipHtml`), header metrics, hotspot selection, `selectFileNode`, sidebar/inspector/grounded-explanation rendering, and `escapeHtml` |
| `cartograph-agent-evals.js` | The deterministic agent plan builder (delegates to `CartographAgent.buildAgentPlan` and `validateSynthesis`), the agent form submit, and the evals-suite runtime glue over `CartographEvals` (`scoreCase`, `collectTraceFiles`, `buildBenchmarkCases`, `computeSuiteSummary`) |
| `cartograph-app-shell.js` | Spec docs viewer, uploads (local folder reader and snapshot drag/drop), `handlePresetChange` + `markPresetSelectCustom` (preset dropdown selection and relabeling), modals, snapshot export, main/right-panel view switching, filters & sorting, settings, clipboard, toasts, global drag-and-drop, and the closing `DOMContentLoaded` bootstrap |
| `README.md` | This guide |

## Relation to `lib/` and the CLI

Repository rules in [`../CLAUDE.md`](../CLAUDE.md) bind this layer: shared
logic stays in `lib/`, where it stays DOM-free and Node-testable. `app/` is
UI-only glue and must not fork `lib/` logic — every file above calls the
`lib/` globals (`CartographParser`, `CartographAgent`, `CartographEvals`,
`CartographFit`) rather than reimplementing parser/planner/scorer behavior.
`cartograph.html` owns the markup and the load order; this directory owns the
behavior those scripts provide.

When the app is served by the CLI (`node cli/cartograph-scan.mjs
/path/to/repo --serve`), the server in `cli/cartograph-scan.mjs` resolves any
`/lib/*.js` and `/app/*.js` request dynamically against disk
(a pattern that rejects path traversal; a pattern-valid but missing file
returns `404`), so adding or renaming a file here never requires touching the
serve route.

## Verify

Nothing here is loaded or executed by `node --test`: five of the six files
depend on `document`, `window`, or the canvas (`cartograph-preset-repos.js` is
a pure data const). The suite covers the `lib/` modules, and two of its
contracts read these files as plain text — the `AGENT_TOOLS` and
legacy-spelling checks — so tool-name spelling stays consistent across
surfaces (see [`../test/README.md`](../test/README.md) for the current test
count):

```bash
node --test
```

Browser checks are manual, per the root
[`../README.md`](../README.md) Quick Start: open `cartograph.html` (or the
`--serve` URL), load a repository or a preset, and confirm the canvas,
inspector, agent answer, and eval suite render and interact as before. The
2026-10-27 split changed only file placement — if any interaction behaves
differently, the load order or the verbatim-move rule was violated.
