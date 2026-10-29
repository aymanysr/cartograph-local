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
and the split was behavior-preserving. The Quiet Shell redesign subsequently updated UI behavior in the same files; the six-script load order remains fixed.

## Load order

`cartograph.html` loads the five `lib/` modules from its `<head>` and ends its
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
| `cartograph-graph-state.js` | The `state` machine, `getLayerMeta`, `parseRepositoryIntoGraph` (calls `CartographParser.parseRepository`), `applyParsedGraph`, `getGraphNodeBounds`, deterministic card separation, `computeGraphNodePositions`, camera-only `fitGraphToCanvas` (uses `CartographFit.computeFitCamera`), and `getNodeVisualRole` |
| `cartograph-canvas-render.js` | `drawDependencyGraph` and the canvas animation loop; mouse/wheel/drag interactions, `zoomGraph`, `resetGraphView`, `setGraphLayout`, and the blast-radius isolate + break-simulation toggles |
| `cartograph-ui-panels.js` | Safe delegated file chips (`makeFileChipHtml`), header metrics, hotspot selection, `selectFileNode`, sidebar/inspector/grounded-explanation rendering, and `escapeHtml` |
| `cartograph-agent-evals.js` | The deterministic agent plan builder (delegates to `CartographAgent.buildAgentPlan` and `validateSynthesis`), the agent form submit, and the evals-suite runtime glue over `CartographEvals` (`evaluateSuite`; `collectTraceFiles` also validates optional model responses) |
| `cartograph-app-shell.js` | Spec docs viewer, uploads (local folder reader and snapshot drag/drop), `handlePresetChange` + `markPresetSelectCustom` (preset dropdown selection and relabeling), responsive shell (`state.ui`), user file routing (`selectFileFromUi`), one-overlay arbitration, Commands/Files palette and local action registry, native dialogs, snapshot export, main/right-panel view switching, filters & sorting, settings, clipboard, toasts, global drag-and-drop, and the closing `DOMContentLoaded` bootstrap |
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

`node --test` currently passes **101 tests**. `test/ui.test.js` loads the actual five shared modules and six classic app scripts into a Node VM in their production order. It stubs listener registration without invoking bootstrap and uses minimal DOM stubs. Its nine tests exercise card bounds, incoming edge roles, repeated force-layout separation and palette ranking, Unicode matching, result caps and availability. Other contract tests read script text for canonical tool names.

```bash
node --test
```

The VM does not replace browser verification. At 1440, 768 and 390px, real browser checks cover rendering, canvas hit targets and fit, both layouts/all presets, pointer/keyboard/focus, native dialogs, clipboard/downloads, repository replacement, explicit evaluation lifecycle and delayed model responses. Direct-file startup is canonical; CLI `--serve` additionally verifies assets and automatic graph loading. `.taste-skill/after/` holds final screenshots and active-state installed probes; lifecycle details are recorded in the task reports under `.superpowers/sdd/2026-10-28-quiet-shell-redesign/`.

`selectFileFromUi` owns user jumps (Map, then phone Impact or tablet canvas); internal agent focus uses `selectFileNode` so Ask stays visible. Layout runs on graph/layout changes; resize, sheet/inspector changes and Fit only reframe existing card positions, deferring when the canvas is hidden. Shared bounds drive drawing, hit testing and fitting.

`runEvaluationSuite` alone calls the shared `CartographEvals.evaluateSuite(graph, mode, makeFileChipHtml)` and stores the complete result in `state.evalRun`; `renderEvalSuite` only reads it. Graph replacement and actual strict/naive mode changes clear it. Re-selecting the active mode preserves it; opening Evals, rendering and switching views do not execute the planner. Empty graph Run keeps the result null/Not run. Agent work captures its graph and discards stale async success/error updates after replacement. Settings keep the existing `cartograph_agent_config` schema. The shell, palette and dialogs share one overlay owner and restore or deliberately move focus after actions.

## Local repository intake

The shell uses `CartographIntake` (loaded before the six app scripts) for the
same file rules as the CLI. A common `webkitRelativePath` root is stripped only
when every selected file shares it; mixed roots and plain names are preserved.
The platform supplies available files and `File.size` supplies the byte count.
Native **Last intake** details retain reason counts, 100 text-only entries and
an omitted count, with a polite live announcement. All-skipped attempts preserve
the current graph. Graph/files snapshots are detected first and bypass policy.

Repository adoption in `applyParsedGraph` resolves selection intent (`preserve`, `hotspot`, or `{path, pan}`), custom labels and transient resets together. Inputs parse before adoption. Startup preload uses graph identity to preserve a newer user load while completing essential initialization. `test/replacement.test.js` exercises this lifecycle through production functions.

User file navigation is coordinated by `selectFileFromUi(path, panToNode)` in
`cartograph-app-shell.js`. It validates current graph membership before changing
panes, closes overlays, preserves file-list scroll and restores visible focus.
File rows and palette file results use one delegated route; palette Enter uses
the same transition. Internal agent focus keeps its separate selection behavior.
