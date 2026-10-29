# Cartograph Local — Codebase Intelligence & Impact Graph

Inspired by the JavaScript Mastery tutorial (*"Nobody Can Read AI Code Anymore |
Build a Full Stack Codebase Intelligence App (with AI Agents)"*), built to run
**with no cloud backend**: every graph edge comes from parsing local source
files. The UI loads Tailwind, Lucide, and Google Fonts from CDNs, so the first
styled load needs network access; the parser and CLI never do.

## Start Here

Prerequisites: a modern browser, and Node.js 18+ for the CLI and tests (verified
on Node 26). Run all commands from the repository root.

```bash
node --test                    # expect: 101 tests passing
node cli/cartograph-scan.mjs . --out /tmp/cartograph-scan.json
open cartograph.html           # macOS; or double-click the file
```

## Quick Start

1. **Open the app directly**
   Double-click `cartograph.html`, or open it from the repository root. It loads
   the shared intake/parser/agent/evals/fit modules from `lib/` and the UI code from
   `app/`, so keep the repository layout intact. `cartograph.html` holds the
   markup and load order; `app/*.js` are the classic scripts it runs, in order:
   `preset-repos`, `graph-state`, `canvas-render`, `ui-panels`,
   `agent-evals`, `app-shell`.
2. **Load a repository**
   - Click **Open folder** in the top bar or choose **Open folder** from Commands and choose a project directory
     (the browser's local directory reader; no files leave your machine).
   - Drag a `cartograph-snapshot.json` file onto the window (directory drag/drop
     is not supported).
   - Or pick a built-in sample: `repo: cartograph-nextjs-saas (16 files)`,
     `repo: fintech-checkout-service (11 files)`, or
     `repo: python-rag-orchestrator (9 files)`.
3. **Scan from the terminal (optional)**
   ```bash
   node cli/cartograph-scan.mjs /path/to/repo --out cartograph-snapshot.json
   node cli/cartograph-scan.mjs /path/to/repo --file src/lib/db.ts
   node cli/cartograph-scan.mjs /path/to/repo --serve 4173
   ```
   The CLI prints a terminal blast-radius report. With `--serve`, open
   <http://localhost:4173> and the scanned graph loads automatically.
   Browser and CLI use the same intake policy for supplied repository files:
   `.ts/.tsx/.js/.jsx/.mjs/.cjs/.py/.go/.css/.json` (case-insensitive), up to
   **500,000 bytes** inclusive. Hidden entries and dependency/build directories
   (`node_modules`, `dist`, `build`, `out`, `coverage`, `__pycache__`, `venv`,
   `vendor`, `target`) are skipped by whole path segment. The selected root itself
   is kept; CLI symlinks are not followed. Browser availability depends on the
   files supplied by the file picker.
   **Last intake** keeps skipped reason counts and up to 100 safe-text details
   accessible in the browser; the CLI prints the same kind of report. A pruned
   directory counts as one skipped entry. All-skipped browser selections keep
   the current map. Both graph and files snapshots retain their recorded files
   without intake filtering; snapshot/export formats stay unchanged.
4. **Connect a local LLM (optional)**
   The built-in deterministic graph walker needs no model. For natural-language
   synthesis with [Ollama](https://ollama.com):
   ```bash
   ollama pull qwen2.5-coder:7b
   OLLAMA_ORIGINS='*' ollama serve   # allow requests from the browser page
   ```
   Open **Settings** from the rail, Menu, or Commands, and set the endpoint to
   `http://localhost:11434/api/chat`. Whatever the model writes is validated
   before it may replace the deterministic answer: any path-like token that is
   outside the parsed graph or the visible tool trace keeps the deterministic
   synthesis and shows a rejection toast naming the ungrounded paths.

## Working in the app

Use **Map**, **Evals**, and **Docs** in the persistent rail, or **Menu** on narrower screens. Above 1100px, Map shows Files, canvas and Impact/Ask together. At 641–1100px, Files and Impact open in one dismissible sheet. At 640px and below, **Files | Map | Impact | Ask** switches the visible region; choosing a file opens Impact. The repository, selected file, file-list scroll and document edits survive ordinary view changes.

**Commands** opens the action palette. Press **⌘/Ctrl+K** for commands or **⌘/Ctrl+P** for file search. Switch Commands/Files inside the palette, type to filter, use ↑/↓ and Enter to choose, or Escape to close. File search includes the whole current graph regardless of sidebar filters. Unavailable actions explain their requirements. Escape closes sheets and dialogs and returns focus to their launcher.

On Map, choose Blast radius or Folder tree, filter files by path/export, drag cards, pan the canvas, scroll to zoom and use **Fit** to frame the current positions. Arrows point from the importing file to its dependency. Impact shows direct and transitive dependents, outbound imports and source evidence; expand Source to copy it. File paths in explanations and Ask answers jump to the corresponding file.

Evals starts **Not run**. Only **Run benchmark suite** executes it; changing repository or strict/naive mode clears stored results. Expand each case for the answer, citations, diagnostics and tool trace. Docs keeps edits while switching documents; **Sync with current graph** explicitly regenerates content, and Copy/Download use the active document. A repository replacement clears previous conversation and evaluation results. Freshness distinguishes built-in samples, local parse time and snapshot timestamps.

## Glossary

- **Blast radius** — the files that break if the selected file changes:
  its 1-hop dependents plus its 2-hop dependents.
- **1-hop / direct dependents** — files that import the selected file.
- **2-hop / transitive dependents** — files that import a 1-hop file, excluding
  the selected file and the 1-hop set.
- **Barrel file** — an `index.ts` / `index.tsx` / `index.js` / `__init__.py`
  that re-exports a directory's modules; imports resolve through it.
- **Grounded** — every cited file path exists in the parsed graph (and, for the
  eval suite, should have appeared in a tool trace).
- **Chip / badge** — two names for the same thing: an underlined clickable file path in
  agent answers and explanations (marked with a `data-filepath="..."`
  attribute); clicking it selects that file on the canvas.
- **Rejection toast** — the on-screen warning when the LLM's synthesis is
  rejected for naming paths outside the graph or the tool trace; it names the
  ungrounded paths and the deterministic answer stays.
- **Provenance** — evidence that a cited file actually appeared in the visible
  agent tool trace, not merely in the graph; strict eval mode requires it.
- **AST** — "abstract syntax tree"; here it is legacy branding only (see the
  architecture note below).
- **Snapshot** — the JSON file written by the CLI: `{ name, scannedAt, graph }`.
- **Classic script** — an ordinary `<script src>` file rather than an ES
  module: it runs in document order and its top-level declarations become
  browser globals. All `lib/*.js` and `app/*.js` files are classic scripts.
- **Fit camera** — the framing computed by
  `CartographFit.computeFitCamera(...)`: one uniform zoom (clamped to
  `[0.05, 2.6]`) plus a pan that places the whole graph's world box inside the
  visible canvas, with padding so cards clear the canvas toolbar. Fit changes the camera without rearranging dragged cards.

## Architecture

- **One parser, three consumers.** `lib/cartograph-parser.js` is the single
  deterministic source of truth for import/export extraction, module resolution,
  cycle detection, and blast-radius metrics. The browser app, the CLI, and the
  tests all load it; none duplicates parser logic, and graph construction never
  calls an LLM.
- **No hidden edges.** The parser records every unresolved specifier in
  `graph.unresolved` (`source`, `specifier`, `kind`, `line`, `statement`) so
  resolution accuracy can be inspected.
- **No build step.** The parser is a classic script in the browser and a
  CommonJS module in Node, with zero npm dependencies.
- **"AST" is legacy branding.** The parser is a line-oriented import/export
  scanner with quote/comment masking; it builds no syntax tree.

## Project Structure

- [`cartograph.html`](cartograph.html) — single-page Codebase Intelligence app:
  markup plus the explicit load order (five `lib/` modules, six `app/` scripts).
- [`lib/cartograph-intake.js`](lib/cartograph-intake.js) — shared file-selection policy for browser and CLI scans.
- [`lib/cartograph-parser.js`](lib/cartograph-parser.js) — shared standalone
  deterministic parser (browser + Node).
- [`lib/cartograph-agent.js`](lib/cartograph-agent.js) — deterministic agent
  tool executor and LLM-output validation gate (browser + Node).
- [`lib/cartograph-evals.js`](lib/cartograph-evals.js) — groundedness/recall
  eval scorer and graph-derived benchmark cases (browser + Node).
- [`lib/cartograph-fit.js`](lib/cartograph-fit.js) — fit-camera math that
  frames the whole graph inside the visible canvas (browser + Node).
- [`app/`](app/README.md) — the six browser-only UI scripts
  (`cartograph-preset-repos`, `-graph-state`, `-canvas-render`, `-ui-panels`,
  `-agent-evals`, `-app-shell`); see [`app/README.md`](app/README.md) for
  the file map and load-order invariant.
- [`cli/cartograph-scan.mjs`](cli/cartograph-scan.mjs) — zero-dependency Node.js
  CLI scanner, report, and local server.
- [`test/parser.test.js`](test/parser.test.js) — `node:test` suite for parser
  resolution, cycles, and blast radius.
- [`test/agent.test.js`](test/agent.test.js) — `node:test` suite for agent
  tool handlers, routing, and validation.
- [`test/evals.test.js`](test/evals.test.js) — `node:test` suite for the eval
  scorer.
- [`test/fit.test.js`](test/fit.test.js) — `node:test` suite for the
  fit-camera framing.
- [`PROJECT.md`](PROJECT.md) — product brief, golden rules, and anti-goals.
- [`CLAUDE.md`](CLAUDE.md) — agent governance rules and invariants.
- [`specs/`](specs/) — phase-by-phase engineering specifications.

## Browser App Map

`cartograph.html` is the markup plus an explicit load order — five `lib/`
modules in `<head>`, then six classic scripts from `app/` at the end of
`<body>`. The landmarks, in load order:

| File | Landmarks |
| --- | --- |
| `app/cartograph-preset-repos.js` | `PRESET_REPOS` demo repositories; the `AGENT_TOOLS` sample block (kept name-identical with the `lib/cartograph-agent.js` `TOOLS` registry) |
| `app/cartograph-graph-state.js` | The `state` object (graph, selection, agent config); parse pipeline `parseRepositoryIntoGraph` → `applyParsedGraph`; layout `computeGraphNodePositions` (+ `CartographFit` camera fit), `getNodeVisualRole` |
| `app/cartograph-canvas-render.js` | `drawDependencyGraph`, canvas animation loop, mouse/wheel interactions, `zoomGraph`, `resetGraphView`, `setGraphLayout`, blast-radius isolate, break simulation |
| `app/cartograph-ui-panels.js` | `selectFileNode`, `renderInspectorPanel`, `buildGroundedModuleExplanationHtml`, file chips (`makeFileChipHtml`), header metrics |
| `app/cartograph-agent-evals.js` | `buildDeterministicAgentPlan` and `runAgentQuery` (routing through the `lib/cartograph-agent.js` `TOOLS` registry); evaluation suite `runEvaluationSuite` and `renderEvalSuite` (execution and scoring in `lib/cartograph-evals.js`) |
| `app/cartograph-app-shell.js` | Loading: `ingestUploadedFileObjects`, `handlePresetChange`, `markPresetSelectCustom`; `openSettingsModal`; spec-docs viewer, modals, snapshot export, toasts; `DOMContentLoaded` bootstrap |

Phase 02 and phase 03 specs describe the intended behavior of these areas, and
[`app/README.md`](app/README.md) documents the load-order invariant.

## Directory Guides

Start here when you need the contract for one area rather than the whole app:

| Directory | Guide | Covers |
| --- | --- | --- |
| `lib/` | [lib/README.md](lib/README.md) | Parser API and graph schema; agent, eval, and fit contracts; resolution rules; supported syntax; invariants |
| `app/` | [app/README.md](app/README.md) | Browser UI layer: the six app scripts, load-order invariant, split provenance |
| `cli/` | [cli/README.md](cli/README.md) | Scan scope, flags, snapshot format, terminal report, local server routes |
| `test/` | [test/README.md](test/README.md) | Parser, planner, and eval tests; how to run or extend them; protected invariants |
| `specs/` | [specs/README.md](specs/README.md) | Phase requirements, implementation mapping, known spec-to-code gaps |

## Tests

```bash
node --test
```

The suite runs against `parseRepository(files)` — the same public seam the CLI
and browser app use. `npm test` runs the same command; `npm run scan -- <dir>`
runs the CLI. The measured suite has **101 passing tests** covering shared modules, intake, CLI, UI helpers, navigation, repository replacement and Evals. `test/ui.test.js` loads the actual shared modules and all six app scripts in a Node VM, with bootstrap suppressed and minimal DOM stubs, to test geometry, edge roles, deterministic card separation and palette ranking/availability. Cross-surface contracts also read scripts to keep tool names consistent. This does not simulate real layout, focus, pointer input, dialogs, clipboard/downloads or asynchronous browser lifecycle behavior; those require real-browser checks. Locally captured acceptance evidence and installed design-probe metrics are in `.taste-skill/after/` when available.
