# `test/` — Parser, Planner, Evals, and Fit Test Suite

`test/parser.test.js`, `test/agent.test.js`, `test/evals.test.js`, and
`test/fit.test.js` are the executable contracts for the shared modules and the
CLI. They use the Node built-in test runner (`node:test`) and
`node:assert/strict`, with no test framework dependency and no network access.
Tests go through the same public seams the app and CLI use:
`parseRepository(files)`, `CartographAgent.buildAgentPlan(...)`,
`CartographAgent.validateSynthesis(...)`, `CartographEvals.scoreCase(...)`,
and `CartographFit.computeFitCamera(...)`.

## Verify

```bash
node --test
```

Equivalent script from the repository root:

```bash
npm test
```

Run just this file, or one test by name:

```bash
node --test test/parser.test.js
node --test --test-name-pattern="Go" test/parser.test.js
```

`node --test` auto-discovers `*.test.js` files, so new test files should follow
that naming pattern.

## Coverage

105 tests across ten files, grouped by the behavior they lock down.

`test/parser.test.js` (11 cases) — parser and CLI:

| Test | What it proves |
| --- | --- |
| `parseRepository resolves relative imports and directory barrels` | `../lib/db` resolves to `src/lib/db/index.ts`; `./page` resolves to `src/app/page.tsx`; `line` and `specifier` are preserved |
| `parseRepository resolves Go package imports and extracts exported symbols` | Grouped and single-line Go imports expand to production `.go` files in the package; `_test.go` files are excluded; `Parse()`, `Config`, and `Version` are exported; source lines are 1-indexed |
| `parseRepository detects multi-file dependency cycles, not just 2-cycles` | A three-file SCC is reported once; a file that merely consumes the cycle is not included; acyclic chains stay out |
| `parseRepository detects 2-cycle loops` | A mutual `x <-> y` import produces exactly one cycle containing both files |
| `parseRepository resolves aliases, tracks unresolved imports, and computes degrees` | `@/` and `~/` aliases resolve, as does a literal `src/...` path; `react` is classified `external-package`; `./missing` is classified `internal-unresolved`; degrees count unique files |
| `parseRepository resolves Python imports plus dynamic and CommonJS imports` | Dotted Python modules resolve across directories; dynamic `import('./lazy')` and `require('./legacy')` become edges with correct line numbers |
| `parseRepository applies the 1-hop / 2-hop blast radius definition exactly` | `hop1Files` and `hop2Files` sets are exact; 2-hop excludes the selected node and 1-hop nodes; `totalImpact`, `inDegree`, `outDegree`, and `outboundEdges` match the definition |
| `parseRepository ignores import-like text embedded in string literals` | Quoted `import`/`require` examples produce no edges and no unresolved entries |
| `parseRepository ignores import-like text in block comments and multiline templates` | A `/* import ... */` line and an import-like line inside a multiline template produce no edges |
| `parseRepository extracts named and default exports` | Default function, default class, default identifier, and anonymous default forms all surface in `node.exports` |
| `CLI scans a folder into a parsed graph and prints a blast-radius report` | A temporary directory is scanned through `cli/cartograph-scan.mjs`; the snapshot has the expected edge, `inDegree`, and `hop1Files`; stdout contains the hotspot report |

Most tests treat the repository as pure data. The CLI test writes: it creates a
fixture under `os.tmpdir()`, runs the CLI with `execFileSync`, parses the written
JSON snapshot, and removes the fixture in a `finally` block. Three agent tests
also read repository files — read-only — to keep the tool-name alignment
locked. Two of them scan the full UI surface (`cartograph.html` plus every
`app/*.js` script), so the app split can never loosen what they guarantee; the
legacy-spelling scan additionally covers `specs/`, `PROJECT.md`, and
`README.md`.

`test/agent.test.js` (27 cases) — the DOM-free agent: a tool-handler registry
(`CartographAgent.TOOLS`), the question router/executor, and the synthesis
validator. Fixture graphs are built through `parseRepository`, so planner tests
run the full public pipeline:

| Test | What it proves |
| --- | --- |
| `planner routes auth questions through the auth branch` | Auth keyword routing picks the auth node; steps, visited files, and highlighted edges match the walk |
| `planner routes blast questions by full path and traces outbound imports` | A question naming a full path routes to the blast branch even if the path contains `auth`; the outbound trace step runs and highlights outbound edges |
| `planner blast route cites its 1-hop and 2-hop dependents and outbound targets` | Every expected dependent/outbound target is cited, and every citation appears in the tool trace (the provenance invariant) |
| `planner blast route matches by full path before the label fallback` | Two files sharing a label (`repo.ts`): the question's exact path wins; the label fallback cannot divert the target |
| `planner falls back to the generic parser-to-UI walk for open questions` | The generic branch emits `search_symbols` + `trace_dependency_path` and stays grounded |
| `planner is pure: identical inputs produce identical plans` | Repeat runs return identical steps/visited/activeEdges/citations/answer |
| `planner reports no state mutation across repeated runs` | The planner never mutates graph node metrics |
| `findAuthNodes matches auth paths and exports, in node order` | Auth detection by path and export names; empty list when no signal exists |
| `validateSynthesis accepts answers that only cite traced paths` | A synthesis whose only path-like tokens are graph paths that appeared in the trace is accepted, with `citedPaths` collected in order |
| `validateSynthesis rejects invented paths outside the graph` | A path-like token that names no real node lands in `unknownPaths` (duplicates deduped) and the answer is rejected |
| `validateSynthesis rejects real paths that were never traced` | A real graph path that never appeared in the tool trace lands in `unprovenPaths` and the answer is rejected |
| `validateSynthesis accepts real paths once they appear in the trace` | Adding the cited path to the trace clears `unprovenPaths`, so the same synthesis becomes acceptable |
| `validateSynthesis strips URLs and treats slash prose as non-paths` | `scheme://` URLs are removed before scanning; extension-less slash words like `and/or` never count as file citations |
| `validateSynthesis reports a graph-less trace as unproven (provenance on)` | With an empty trace, every cited graph path is flagged unproven and the answer is rejected |
| `validateSynthesis passes prose without any path-like token` | Prose with no slash-token produces no citations and is accepted |
| `validateSynthesis tolerates empty text and an empty graph` | Empty text is accepted; an empty graph makes any invented path `unknownPaths` and the answer rejected |
| `TOOLS exposes the six deterministic tool handlers` | The registry covers exactly `find_entry_points`, `search_symbols`, `get_file_ast`, `walk_dependents`, `trace_dependency_path`, `detect_cycles_and_hubs` |
| `search_symbols derives matched modules from path and export tokens` | Query tokens match real node paths/exports against the fixture; unknown tokens yield `Matched 0` and no files |
| `get_file_ast derives exports, outbound imports, and LOC (lines of code) from the node` | Both output variants (combined vs. verified+LOC) and the not-found dead end derive from the node |
| `walk_dependents derives the exact hop sets and counts the graph computed` | depth 1/2 return the node's real `hop1Files`/`hop2Files`; the enforcement framing returns the combined set |
| `trace_dependency_path traces real chains and reports honest dead ends` | BFS (breadth-first search) over outbound edges builds the chain (`2 hops`), absent `to` keeps the legacy outbound listing, unreachable targets report no chain |
| `find_entry_points returns the real zero-incoming nodes` | Files equal the graph-derived `inDegree === 0` set |
| `detect_cycles_and_hubs finds real cycles and ranks real hubs` | A two-file cycle fixture triggers `Circular dependencies: 1` with cycle members traced; the acyclic fixture reports 0 and traces both ranked hubs |
| `plan steps are produced by tool executes, not precomputed strings` | The same question against two different repositories yields graph-specific outputs (paths, counts, LOC) — step text cannot be literals |
| `spec, docs, and UI copy never use the legacy tool spellings` | Reads `specs/phase-03-agent-evals.md`, `specs/README.md`, `PROJECT.md`, `README.md`, and the full UI surface (`cartograph.html` + `app/*.js`), failing on any `trace_path` or bare `detect_cycles` (word-boundary aware — `_` keeps `detect_cycles_and_hubs` one token) |
| `phase-03 spec lists every canonical handler name` | Every `TOOLS` registry key appears verbatim in the phase-03 spec |
| `the UI AGENT_TOOLS sample lists every canonical handler name` | The demo `AGENT_TOOLS` sample block — wherever it lives in `cartograph.html` or `app/*.js` — contains all six canonical names as string literals |

`test/evals.test.js` (14 cases) — the trace-provenance eval scorer. The PASS
rule these tests exercise: a case passes only when citation groundedness is
100% (`0 hallucinated, 0 unproven`) **and** blast-radius recall is exactly
100%:

| Test | What it proves |
| --- | --- |
| `buildBenchmarkCases produces three graph-derived cases that route into real branches` | Cases derive from graph metrics; case 3's question routes through the blast branch |
| `naive benchmark lists include invented paths while case questions are real` | Naive fallbacks contain at least one path outside the graph (the demo hallucination) |
| `strict runs pass all cases: grounded, proven, full recall` | Real planner runs score 100% grounded (zero unproven) and 100% recall on the fixture |
| `the provenance rule fails a case when a real path was never traced` | Cited-but-untraced real path → `unprovenPaths`, groundedness drops (50%), case fails |
| `hallucinated citations are paths outside the graph and fail the case` | Invented paths are flagged and fail the case even when provenance is off |
| `naive mode grounds by existence only (no trace provenance)` | `requireProvenance: false` skips the trace check; demo naive lists still fail via invented paths |
| `recall measures expected coverage, independently of grounding` | Recall formula and the interaction with the PASS rule |
| `collectTraceFiles unions step files in order and dedupes` | Trace provenance set equals the union of all step files |
| `computeSuiteSummary weights totals rather than averaging case percentages` | Overall groundedness/recall/counts and 1-decimal average step latency |
| `scoreCase guards against empty citations and empty expectations` | `0 cited` grounds at 100 while recall hits 0; `0 expected` recalls at 100 |

`test/fit.test.js` (5 cases) — the fit-camera contract for
`lib/cartograph-fit.js`, which `app/cartograph-graph-state.js` calls so the
whole graph lands inside the visible canvas:

| Test | What it proves |
| --- | --- |
| `fits the layered (dag) world box without clipping and centers it` | A layered (DAG) world fits the canvas with uniform zoom and ends up centered |
| `fits the force-graph world box (343-node scatter) onto the canvas` | A wide force-layout scatter fits with slack to spare |
| `zoom clamps to MIN_ZOOM for huge worlds and MAX_ZOOM for specks` | The clamp keeps extreme worlds displayable instead of exploding |
| `per-side padding keeps the graph clear of the canvas chrome` | Per-side padding reserves the reserved per-side padding so no node hides behind them |
| `degenerate boxes fall back to sane cameras` | Empty or one-sided world boxes never produce NaN or inverted cameras |

Parser coverage gap (only): trailing comments on an import line and Python
triple-quoted strings are not modeled.

`test/ui.test.js` adds nine cases over the actual four shared modules and six classic app scripts, loaded in production order in a Node VM. Bootstrap is suppressed by stubbing listener registration; helpers are evaluated against lexical state with minimal DOM stubs. Cases cover centered 192×48 card bounds, incoming hop edge roles and neutral outbound, deterministic overlap-free preset force layouts, full-path/basename/substring/subsequence ranking, raw-codepoint ties and supplementary Unicode, graph-wide search independent of filters, 50-result cap with full match count, action registry ordering and empty/stale availability.

This VM coverage does not exercise browser layout or native focus/dialog behavior. Real-browser acceptance separately checks direct-file startup, CLI assets, all presets/layouts at 1440/768/390px, keyboard/pointer selection, preserved dragged positions, overlays/focus, source Copy, Docs edits/downloads, ingestion and empty/replacement lifecycle, explicit evals and delayed external-model results. See `.taste-skill/after/` for screenshots/probe metrics and the task reports under `.superpowers/sdd/2026-10-28-quiet-shell-redesign/` for lifecycle evidence.

## Conventions

- Import the parser once at the top:

  ```js
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const { parseRepository } = require('../lib/cartograph-parser.js');
  ```

- Fixtures are inline arrays of `{ path, content }`. Use repository-relative
  POSIX (`/`-separated, no backslash) paths (`src/app/page.tsx`), because the
  resolver operates on `/` segments.
- Assert on the public graph (`nodes`, `edges`, `cycles`, `unresolved`) or on
  documented helper returns. Do not reach into parser internals.
- Include the minimum source text needed to trigger the behavior. The parser is
  line-oriented, so fixture formatting is part of the test.
- Keep tests deterministic: no clock, network, or machine-specific paths in
  assertions.

Minimal template:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRepository } = require('../lib/cartograph-parser.js');

test('resolves a new edge case', () => {
  const graph = parseRepository([
    { path: 'src/a.ts', content: "import { b } from './b';" },
    { path: 'src/b.ts', content: 'export const b = 1;' },
  ]);

  assert.ok(
    graph.edges.some(
      (edge) => edge.source === 'src/a.ts' && edge.target === 'src/b.ts'
    )
  );
});
```

## Invariants protected here

- Every edge originates from a parsed import statement, never from an LLM or a
  heuristic guess.
- Line numbers are 1-indexed and point at the import statement.
- Alias and barrel resolution cannot silently regress; unresolved imports remain
  visible with a classification.
- The 1-hop/2-hop definition matches
  [`../CLAUDE.md`](../CLAUDE.md): direct dependents, then dependents of those
  dependents, excluding the selected node and the 1-hop set.
- The CLI and the browser app consume the same parser module.

## What lives here

| File | Role |
| --- | --- |
| `parser.test.js` | Parser and CLI tests (11 cases) |
| `agent.test.js` | Agent tool registry, router/executor, routing, grounding, purity, synthesis-validation, and cross-surface tool-name consistency tests (27 cases) |
| `evals.test.js` | Eval provenance scoring and benchmark-case and complete execution tests (14 cases) |
| `fit.test.js` | Fit-camera framing tests for `lib/cartograph-fit.js` (5 cases) |
| `layouts.test.js` | Layout engine determinism, cycle rank safety, directory extraction, and multi-scale preset collision-free contracts (4 cases) |
| `ui.test.js` | Actual-script VM geometry, edge roles, force-layout separation and palette contracts (9 cases) |
| `README.md` | This guide |

The parser API and graph schema are documented in
[`../lib/README.md`](../lib/README.md). CLI flags and snapshot format are in
[`../cli/README.md`](../cli/README.md).

## Repository intake regressions

`intake.test.js` exercises the actual CLI subprocess and production browser
handler with identical fixtures: CSS/CJS/JSON, Unicode byte boundaries, hidden
and excluded paths, deceptive directory names, selected and mixed roots,
duplicates, unreadable paths, all-skipped graph retention, both snapshot forms,
and bounded accessible report markup. A subprocess filesystem hook simulates
unreadable siblings, a file growing after stat and a symlink swap before open.
`ui.test.js` loads the intake library in the same classic-script VM order.
Run `node --test` for the full suite; browser checks cover native disclosure,
phone sizing, direct-file startup and CLI server delivery.

`test/replacement.test.js` adds thirteen real-code lifecycle cases: selection/reset/preferences, custom insertion, parser exceptions through three handlers, delayed startup success/failure, delayed model success/failure, and both snapshot forms. The VM supplies DOM boundaries while loading production parser and adoption code.

`navigation.test.js` adds ten production-handler regressions for palette
pointer/Enter dispatch, inert stale paths, desktop redraw focus and equivalent
controls, canvas clicks versus returning drags, and file-sheet scroll capture
before native close. Full suite: 101 cases. Native dialog timing, actual focus,
responsive navigation at 1440/768/390px, raw special paths and live region/scroll
preservation are also checked in a real browser; evidence is recorded in
`/tmp/cartograph-navigation-20261028/report.md`.


## Shared Evals execution

`evals.test.js` calls the production `evaluateSuite` seam for full strict and naive runs: actual plans/trace/weighted summary, zero naive planner calls, empty and invalid mode, determinism and graph immutability, and safe caller formatting of special paths. Primitive scorer/provenance/weighted aggregation checks remain independent. Naive fake paths that exist in the graph remain valid existence-only citations.

`evals-ui.test.js` adds two production-script lifecycle tests in a minimal DOM VM: render/view changes never run, explicit Run delegates to the shared suite, same mode preserves the result, real mode and same-count graph adoption clear it, and empty Run stays Not run. No selection/highlight/fetch effects. Real browser desktop/phone expanded trace, answer, special paths and snapshot checks are recorded in `/tmp/cartograph-evals-20261028/report.md`.
