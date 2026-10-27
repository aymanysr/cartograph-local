# `test/` — Parser and CLI Test Suite

`test/parser.test.js` is the executable contract for the shared parser and the
CLI. It uses the Node built-in test runner (`node:test`) and `node:assert/strict`,
with no test framework dependency and no network access. All parser tests go
through the same public seam the app and CLI use: `parseRepository(files)`.

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

Eleven tests, grouped by the behavior they lock down.

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

The last test is the only one that touches the filesystem. It creates a fixture
under `os.tmpdir()`, runs the CLI with `execFileSync`, parses the written JSON
snapshot, and removes the fixture in a `finally` block.

Remaining coverage gap: trailing comments on an import line and Python
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
| `parser.test.js` | All parser and CLI tests |
| `README.md` | This guide |

The parser API and graph schema are documented in
[`../lib/README.md`](../lib/README.md). CLI flags and snapshot format are in
[`../cli/README.md`](../cli/README.md).
