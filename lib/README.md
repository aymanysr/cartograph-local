# `lib/` — Shared Deterministic Modules

`lib/` holds the four shared deterministic modules — parser, agent tool
executor, eval scorer, and fit-camera — loaded unchanged by the browser app
(`cartograph.html`), the CLI (`cli/cartograph-scan.mjs`), and the tests.
There is no bundler, no dependency, no network call, and no LLM involvement in
graph construction. `lib/cartograph-parser.js` is the single source of
dependency truth: every node and edge comes from scanning real file text.

The parser is line-oriented: it scans source lines with deterministic regular
expressions and per-line quote tracking. It does **not** build a formal AST, and
it does not perform type or scope resolution. It also performs no I/O:
`parseRepository` receives in-memory `{ path, content }` objects and returns a
graph; reading files is the caller's job.

## Loading the module

The UMD (Universal Module Definition) wrapper exports through `module.exports`
under Node and attaches `CartographParser` to `globalThis` in the browser.

| Consumer | How to load | Handle |
| --- | --- | --- |
| Browser | `<script src="lib/cartograph-parser.js"></script>` | `window.CartographParser` |
| Node CommonJS | `const CartographParser = require('./lib/cartograph-parser.js');` | module object |
| Node ES module (ESM) | `import CartographParser from './lib/cartograph-parser.js';` | default export |

## Public API

| Export | Signature | Returns |
| --- | --- | --- |
| `parseRepository` | `(files, options?)` | Full graph: `{ name, description, nodes, edges, cycles, unresolved }` |
| `classifyArchitecturalLayer` | `(filePath)` | One of `'core'`, `'parser'`, `'agent'`, `'api'`, `'ui'` |
| `extractExportedSymbols` | `(content, filePath)` | `string[]` of exported symbol labels |
| `resolveModuleSpecifier` | `(fromFile, rawSpec, knownPathsSet, allPathsList)` | Repo-relative path or `null` |
| `extractFileImports` | `(filePath, content, knownPathsSet, allPathsList)` | `edge[]` only (unresolved entries discarded) |
| `detectCircularDependencies` | `(nodes, edges)` | `string[][]` of cycle members |
| `computeBlastRadiusForNode` | `(targetPath, edges)` | `{ hop1Edges, hop1Files, hop2Files, hop2Details, outboundEdges, totalImpactCount }` (`totalImpactCount` is stored on nodes as `totalImpact`) |

### `parseRepository(files, options?)`

This is the public seam used by the browser, the CLI, and `test/parser.test.js`.

- `files`: `Array<{ path: string, content: string }>`. `path` must be
  repository-relative and use `/` separators (`src/app/page.tsx`). The parser
  does not normalize Windows paths, `./` prefixes, or absolute paths.
- `options`: optional. `repoName` (alias `name`, default `'repository'`) and
  `repoDescription` (alias `description`, default `''`).
- Return: the graph object described below. The input `content` is retained on
  every node, so snapshots embed full source text.

### Node shape

| Field | Meaning |
| --- | --- |
| `id`, `path` | Repository-relative file path (identical values) |
| `label` | Basename, e.g. `page.tsx` |
| `folder` | Directory portion, e.g. `src/app` |
| `layer` | Heuristic layer from `classifyArchitecturalLayer` |
| `exports` | Labels from `extractExportedSymbols`; always non-empty |
| `loc` | Line count (`content.split('\n').length`) |
| `content` | Original file text |
| `x`, `y`, `vx`, `vy` | Layout seeds, always `0` from the parser |
| `inDegree` | Number of unique files importing this node |
| `outDegree` | Number of unique files this node imports |
| `hop1Files` | Unique direct dependents |
| `hop2Files` | Unique transitive dependents, excluding `hop1Files` and the node |
| `hop1Edges` | Every non-self import edge targeting this node (duplicates preserved) |
| `hop2Details` | One `{ file, via, line, statement }` per 2-hop file |
| `outboundEdges` | Every non-self edge sourced from this node |
| `totalImpact` | `hop1Files.length + hop2Files.length` |

### Edge and unresolved shapes

Edges carry the proof for the map:

| Field | Meaning |
| --- | --- |
| `source`, `target` | Repo-relative file paths |
| `specifier` | Raw specifier as written in source |
| `importedSymbols` | Named imports, `[]` for side-effect-only imports, `['*']` for `require()`/bare `import()`, package basename for Go |
| `line` | 1-indexed line number of the import statement |
| `statement` | Trimmed source line that produced the edge |

`unresolved` entries are `{ source, specifier, kind, line, statement }`, where
`kind` is `'internal-unresolved'` for specifiers starting with `.`, `@/`, `~/`,
or `src/` (plus `./`/`../`), and `'external-package'` for bare specifiers,
including repo-relative-looking bare paths such as `components/Button`.
Unresolved imports never become edges.

## Graph invariants

- **One edge per parsed import statement.** Two imports of the same module from
  the same file produce two edges, and one Go package import can expand into one
  edge per production file in that package. `inDegree`/`outDegree` deduplicate by
  file.
- **1-hop** = unique `source` values of edges whose `target` is the selected
  node, excluding self-imports.
- **2-hop** = unique `source` values of edges targeting a 1-hop node, excluding
  the selected node and all 1-hop nodes.
- **Outbound** = edges sourced from the selected node, excluding self-imports.
- **Cycles** come from Tarjan strongly connected components (SCCs) with more than
  one member. Self-imports are dropped at edge-creation time — they never become
  edges in `parseRepository` output, so the public graph contains no single-node
  cycles (though `detectCircularDependencies(nodes, edges)` itself will report a
  self-loop edge handed to it directly as a `[p, p]` cycle). Cycle arrays contain
  file paths, not edge objects.
- **Every node has at least one export label.** If the scanner finds no explicit
  export, it falls back to the filename stem. That label is a display fallback,
  not evidence of a real export.
- **String-literal and comment false positives are suppressed.** A per-line quote
  tracker ignores import-like text inside `'...'`, `"..."`, and `` `...` `` on the
  same line. A stateful line scanner skips lines that start inside a multiline
  block comment or template literal. Full-line `//`, `#`, `/*`, `*/`, and `*`
  comments are skipped. Two imperfect spots remain: trailing comments on the
  same line as an import are not modeled (import-like text in a trailing
  comment can still produce an edge), and template-literal nesting can
  desynchronize the line scanner — import-shaped text inside the CLI-source
  doc embedded in `app/cartograph-app-shell.js` produces an edge that is not
  executed code, while a plain multi-line template is correctly skipped.

## Module resolution

`resolveModuleSpecifier` builds candidate paths, tries exact matches with each
extension, then falls back to suffix matching against all known paths.

A **barrel file** is an `index.ts` / `index.tsx` / `index.js` / `__init__.py`
that re-exports a directory's modules; an import of the directory resolves
through it.

| Specifier form | Candidate bases |
| --- | --- |
| `@/lib/db`, `~/lib/db` | `src/lib/db`, `lib/db` |
| `./db`, `../lib/db` | Path resolved relative to the importing file |
| `.models`, `..pkg` (Python) | Package-relative path (`<dir>/models`, parent package) |
| `app.db.vector_store` (dots, no slash) | `app/db/vector_store` |
| `src/lib/db` (repo-relative) | Tried literally: `src/lib/db`, then `src/src/lib/db`; there is no separate `src/` alias rewrite |
| Bare package, e.g. `react` | `react`, `src/react` (normally unresolved) |

Extensions are tried in this order:

```text
''  .ts  .tsx  .js  .jsx  .mjs  .py  .go
/index.ts  /index.tsx  /index.js  /__init__.py
```

There is no `tsconfig.json` path-alias support (only hard-coded `@/` and `~/`,
plus literal `src/...` paths),
no `package.json` `main`/`exports` lookup, and no `node_modules` traversal.

## Supported source syntax

| Language | Extracted imports | Extracted exports |
| --- | --- | --- |
| JS / TS / JSX / TSX / MJS / CJS | `import ... from`, `export ... from`, dynamic `import()`, `require()` | `export function`, `export const`, `export interface/type/class/enum`, named and anonymous `export default` (default class/fn, identifier, and expression forms) |
| Python | `from ... import ...`, `import ...` | top-level `def`, `class`, and `name = Call(...)` assignments (no leading `_`) |
| Go | single and grouped `import` blocks | top-level `func`, `type`, `var`, `const` with uppercase names (receiver methods are not captured) |

Go imports name packages, not files. A Go import expands to every non-`_test.go`
file directly inside the matched package directory. Python `__init__.py` is
treated as a barrel candidate.

## Verify

```bash
node --test test/parser.test.js
```

Quick smoke test:

```bash
node -e "const { parseRepository } = require('./lib/cartograph-parser.js'); \
const g = parseRepository([{ path: 'src/a.ts', content: \"import { b } from './b';\" }, \
{ path: 'src/b.ts', content: 'export const b = 1;' }]); \
console.log(g.nodes.length, g.edges.length, g.edges[0]);"
```

Expected: `2 1` followed by an edge from `src/a.ts` to `src/b.ts`.

## What lives here

| File | Role |
| --- | --- |
| `cartograph-parser.js` | The complete deterministic parser and graph builder |
| `cartograph-agent.js` | DOM-free agent tool executor: the `TOOLS` handler registry (six pure `run(args, graph) -> { output, files }` handlers with display `label`s), `buildAgentPlan` (routes a repository question onto concrete call arguments, executes every call against the registry, and returns steps, visited files, highlighted edges, and cited paths), `findAuthNodes` (routing input, also used by evals), and `validateSynthesis`, the LLM-output gate rejecting paths outside the graph or the visible tool trace |
| `cartograph-evals.js` | DOM-free complete suite runner (`evaluateSuite`) and eval scorer (`scoreCase`, `computeSuiteSummary`, `collectTraceFiles`) plus the graph-derived benchmark cases (`buildBenchmarkCases`); see the eval-scorer contract below |
| `cartograph-fit.js` | DOM-free fit-camera math (`computeFitCamera`): pure UMD like the parser — browser global `CartographFit`, Node `module.exports` — used by `app/cartograph-graph-state.js` to frame the graph inside the canvas; covered by `test/fit.test.js` (fit-camera contract below) |
| `README.md` | This guide |

Eval scorer contract for `cartograph-evals.js` (all exports are DOM-free):

| Export | Contract |
| --- | --- |
| `buildBenchmarkCases(graph)` | Derives benchmark cases (question, expected files, naive decoys) from graph metrics — no hand-written ground truth |
| `collectTraceFiles(plan)` | Unions every trace step's `files` in order, deduped — the provenance set |
| `scoreCase({ graph, citedFiles, expectedFiles, traceFiles, requireProvenance })` | Returns `{ citedFiles, hallucinatedPaths, unprovenPaths, groundedCount, totalCited, recalledCount, totalExpected, groundednessScore, recallScore, passed }`. Hallucinated = cited path missing from the graph; unproven = cited, in-graph, but absent from `traceFiles` when `requireProvenance` is true; groundedness% = grounded / cited (0 cited → 100); recall% = \|expected ∩ cited\| / \|expected\| (0 expected → 100); `passed` = 0 hallucinated ∧ 0 unproven ∧ recall exactly 100 |
| `evaluateSuite(graph, mode, chipFormatter)` | Complete `{isStrict,cases,entries,summary}` run. Strict executes actual plans and scores trace provenance; naive skips planner and scores existence only. Accepts only `strict`/`naive`, rejecting other modes before graph access. Empty graph returns empty cases and 100% empty aggregate scores, zero steps. Caller supplies a safe HTML chip formatter; citations are scored from paths, never HTML. Deterministic and does not mutate graph. |
| `computeSuiteSummary(perCase, plans)` | Aggregates overall groundedness/recall percentages and a 1-decimal average step count |

Fit-camera contract for `cartograph-fit.js` (DOM-free, Node-testable):

| Export | Contract |
| --- | --- |
| `computeFitCamera(box, width, height, padding)` | Given a world-space box `{ minX, minY, maxX, maxY }` and the visible canvas size, returns `{ x, y, zoom }`: a uniform zoom (clamped to `[0.05, 2.6]`) and translation that fit the box inside `width` × `height`. `padding` is a number or a per-side `{ top, right, bottom, left }` object — the app passes chrome-aware padding so nodes stay clear of the top bar and legend. Degenerate or empty boxes fall back to a sane camera. |

Architectural rules that constrain this module live in
[`../PROJECT.md`](../PROJECT.md) and [`../CLAUDE.md`](../CLAUDE.md). Phase
requirements are in [`../specs/phase-01-parser.md`](../specs/phase-01-parser.md).

## Repository intake policy

`cartograph-intake.js` is a DOM-free classic/CommonJS module exposing
`checkDirectory(path)` and `checkFile(path, byteLength)`. Both return
`{ include, reason, skippedPath }`; reasons are `hidden`, `excluded-directory`,
`unsupported`, or `too-large`. Paths are repository-relative, separators are
normalized, exclusions match whole segments, and 500,000 bytes is included.
Readers own root stripping, I/O, duplicate/unreadable reporting and snapshots.
Snapshots bypass this policy. See the root README for the fixed intake scope.
