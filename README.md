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
node --test                    # expect: 29 tests passing (3 suites)
node cli/cartograph-scan.mjs . --out /tmp/cartograph-scan.json
open cartograph.html           # macOS; or double-click the file
```

## Quick Start

1. **Open the app directly**
   Double-click `cartograph.html`, or open it from the repository root. It loads
   `lib/cartograph-parser.js` from the `lib/` folder, so keep the repository
   layout intact.
2. **Load a repository**
   - Click **"Open Local Folder"** in the top bar and choose a project directory
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
   Browser and CLI scan scopes differ slightly: the browser accepts
   `.ts/.tsx/.js/.jsx/.mjs/.py/.go/.json` up to 350 KB, while the CLI also accepts
   `.cjs/.css`, ignores more build directories, and allows up to 500 KB.
4. **Connect a local LLM (optional)**
   The built-in deterministic graph walker needs no model. For natural-language
   synthesis with [Ollama](https://ollama.com):
   ```bash
   ollama pull qwen2.5-coder:7b
   OLLAMA_ORIGINS='*' ollama serve   # allow requests from the browser page
   ```
   Open the sliders button in the top bar (**"AST Walker (Local)"**), choose the
   **"Local Agent Execution & Ollama Settings"** modal, and set the endpoint to
   `http://localhost:11434/api/chat`. Whatever the model writes is validated
   before it may replace the deterministic answer: any path-like token that is
   outside the parsed graph or the visible tool trace keeps the deterministic
   synthesis and shows a rejection toast naming the ungrounded paths.

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
- **Snapshot** — the JSON file written by the CLI: `{ name, scannedAt, graph }`.

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

- [`cartograph.html`](cartograph.html) — single-page Codebase Intelligence app
  (loads `lib/cartograph-parser.js`).
- [`lib/cartograph-parser.js`](lib/cartograph-parser.js) — shared standalone
  deterministic parser (browser + Node).
- [`cli/cartograph-scan.mjs`](cli/cartograph-scan.mjs) — zero-dependency Node.js
  CLI scanner, report, and local server.
- [`test/parser.test.js`](test/parser.test.js) — `node:test` suite for parser
  resolution, cycles, and blast radius.
- [`PROJECT.md`](PROJECT.md) — product brief, golden rules, and anti-goals.
- [`CLAUDE.md`](CLAUDE.md) — agent governance rules and invariants.
- [`specs/`](specs/) — phase-by-phase engineering specifications.

## Browser App Map

`cartograph.html` is one ~3,000-line file. The main landmarks are:

| Concern | Function / location |
| --- | --- |
| App state | `state` object (graph, selection, agent config) |
| Parse pipeline | `parseRepositoryIntoGraph` → `applyParsedGraph` |
| Graph rendering | `computeGraphNodePositions`, `renderCanvas`, `selectFileNode` |
| Inspector and explanations | `renderInspectorPanel`, `buildGroundedModuleExplanationHtml` |
| Agent tool executor and trace | `buildDeterministicAgentPlan` (routes through `lib/cartograph-agent.js` `TOOLS` registry), `runAgentQuery` |
| Evaluation suite | `runEvaluationSuite`, `evaluateEvalSuite`, `renderEvalSuite` (scoring in `lib/cartograph-evals.js`) |
| Settings and loading | `openSettingsModal`, `ingestUploadedFileObjects` |

Phase 02 and phase 03 specs describe the intended behavior of these areas.

## Directory Guides

Start here when you need the contract for one area rather than the whole app:

| Directory | Guide | Covers |
| --- | --- | --- |
| `lib/` | [lib/README.md](lib/README.md) | Parser API, graph schema, resolution rules, supported syntax, invariants |
| `cli/` | [cli/README.md](cli/README.md) | Scan scope, flags, snapshot format, terminal report, local server routes |
| `test/` | [test/README.md](test/README.md) | Parser, planner, and eval tests; how to run or extend them; protected invariants |
| `specs/` | [specs/README.md](specs/README.md) | Phase requirements, implementation mapping, known spec-to-code gaps |

## Tests

```bash
node --test
```

The suite runs against `parseRepository(files)` — the same public seam the CLI
and browser app use. `npm test` runs the same command; `npm run scan -- <dir>`
runs the CLI.
