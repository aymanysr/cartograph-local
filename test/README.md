# `test/` — Parser, Planner, and Eval Test Suite

`test/parser.test.js`, `test/agent.test.js`, and `test/evals.test.js` are the
executable contracts for the shared modules and the CLI. They use the Node
built-in test runner (`node:test`) and `node:assert/strict`, with no test
framework dependency and no network access. Tests go through the same public
seams the app and CLI use: `parseRepository(files)`, `CartographAgent.buildAgentPlan(...)`,
`CartographAgent.validateSynthesis(...)`, and `CartographEvals.scoreCase(...)`.

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

Forty-five tests across three files, grouped by the behavior they lock down.

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

The CLI test is the only one that touches the filesystem. It creates a fixture
under `os.tmpdir()`, runs the CLI with `execFileSync`, parses the written JSON
snapshot, and removes the fixture in a `finally` block.

`test/agent.test.js` (24 cases) — the DOM-free agent: a tool-handler registry
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
| `get_file_ast derives exports, outbound imports, and LOC from the node` | Both output variants (combined vs. verified+LOC) and the not-found dead end derive from the node |
| `walk_dependents derives the exact hop sets and counts the graph computed` | depth 1/2 return the node's real `hop1Files`/`hop2Files`; the enforcement framing returns the combined set |
| `trace_dependency_path traces real chains and reports honest dead ends` | BFS over outbound edges builds the chain (`2 hops`), absent `to` keeps the legacy outbound listing, unreachable targets report no chain |
| `find_entry_points returns the real zero-incoming nodes` | Files equal the graph-derived `inDegree === 0` set |
| `detect_cycles_and_hubs finds real cycles and ranks real hubs` | A two-file cycle fixture triggers `Circular dependencies: 1` with cycle members traced; the acyclic fixture reports 0 and traces both ranked hubs |
| `plan steps are produced by tool executes, not precomputed strings` | The same question against two different repositories yields graph-specific outputs (paths, counts, LOC) — step text cannot be literals |

`test/evals.test.js` (10 cases) — the trace-provenance eval scorer:

| Test | What it proves |
| --- | --- |
| `buildBenchmarkCases produces three graph-derived cases...` | Cases derive from graph metrics; case 3's question routes through the blast branch |
| `naive benchmark lists include invented paths...` | Naive fallbacks contain at least one path outside the graph (the demo hallucination) |
| `strict runs pass all cases: grounded, proven, full recall` | Real planner runs score 100% grounded (zero unproven) and 100% recall on the fixture |
| `the provenance rule fails a case when a real path was never traced` | Cited-but-untraced real path → `unprovenPaths`, groundedness drops (50%), case fails |
| `hallucinated citations are paths outside the graph and fail the case` | Invented paths are flagged and fail the case even when provenance is off |
| `naive mode grounds by existence only (no trace provenance)` | `requireProvenance: false` skips the trace check; demo naive lists still fail via invented paths |
| `recall measures expected coverage, independently of grounding` | Recall formula and the interaction with the PASS rule |
| `collectTraceFiles unions step files in order and dedupes` | Trace provenance set equals the union of all step files |
| `computeSuiteSummary aggregates real percentages and average step latency` | Overall groundedness/recall/counts and 1-decimal average step latency |
| `scoreCase guards against empty citations and empty expectations` | `0 cited` grounds at 100 while recall hits 0; `0 expected` recalls at 100 |

Parser coverage gap (only): trailing comments on an import line and Python
triple-quoted strings are not modeled.

## Conventions

- Import the parser once at the top:

  ```js
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const { parseRepository } = require('../lib/cartograph-parser.js');
  ```

- Fixtures are inline arrays of `{ path, content }`. Use repository-relative
  POSIX paths (`src/app/page.tsx`), because the resolver operates on `/`
  segments.
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
| `agent.test.js` | Agent tool registry, router/executor, routing, grounding, purity, and synthesis-validation tests (24 cases) |
| `evals.test.js` | Eval provenance scoring and benchmark-case tests (10 cases) |
| `README.md` | This guide |

The parser API and graph schema are documented in
[`../lib/README.md`](../lib/README.md). CLI flags and snapshot format are in
[`../cli/README.md`](../cli/README.md).
