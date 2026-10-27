# `cli/` — Local Scanner, Report, and Server

`cli/cartograph-scan.mjs` walks a directory, sends every supported file through
the shared parser at [`../lib/cartograph-parser.js`](../lib/cartograph-parser.js),
writes a JSON snapshot, prints a terminal blast-radius report, and can serve the
browser app with the scanned graph pre-loaded.

It is a zero-dependency ES module. It imports only Node built-ins
(`node:fs`, `node:path`, `node:http`, `node:url`) and the shared parser. It never
calls an LLM or a remote service.

## Usage

```bash
node cli/cartograph-scan.mjs [targetDir] [options]
```

`targetDir` defaults to the current working directory. If several positional
arguments are supplied, the last one wins.

| Flag | Default | Behavior |
| --- | --- | --- |
| `--out <file>` | `cartograph-snapshot.json` | Snapshot path, resolved against the current working directory, not `targetDir` |
| `--file <path>` | none | Adds a focused blast-radius section. Matches an exact node path, then a `/`-suffixed path, then any path ending with the value |
| `--top <n>` | `10` | Caps the number of nodes in the hotspot report |
| `--serve [port]` | `4173` | Starts the local UI server after writing the snapshot. `--serve` alone uses port 4173 |

There is no `--help` flag; unrecognized flags have no effect, and a following
non-flag argument is treated as `targetDir`. `--out` overwrites an existing file.
A missing target directory throws from `fs.readdirSync`; a busy `--serve` port
fails with Node's `EADDRINUSE`. Run the commands below for the supported surface.

## Scan scope

The walker is deliberately conservative:

| Rule | Value |
| --- | --- |
| Included extensions | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.py`, `.go`, `.css`, `.json` |
| Ignored directories | `node_modules`, `.git`, `.next`, `dist`, `build`, `out`, `coverage`, `.turbo`, `.vercel`, `__pycache__`, `.venv`, `venv`, `vendor`, `target` |
| Hidden entries | Skipped (any name starting with `.`); `.env.example` is exempt from the hidden check but still filtered by extension |
| File size limit | 500,000 characters (UTF-16 code units); larger files are skipped silently after reading |
| Unreadable files | Skipped silently |

The shared parser extracts imports and exports from JS/TS, Python, and Go. CSS
and JSON files are still added as graph nodes, but the parser's import rules are
not designed for them; any edges they produce are incidental. `cartograph.html`
is **not** scanned because `.html` is not in the extension list; neither are
Markdown docs or `package.json`-style metadata beyond the JSON file itself.

Paths written into the graph are relative to `targetDir` and use `/` separators.

## Snapshot format

The CLI writes:

```json
{
  "name": "repository-directory-name",
  "scannedAt": "2026-10-27T17:09:48.637Z",
  "graph": {
    "name": "repository-directory-name",
    "description": "Deterministic scan of /absolute/target/path",
    "nodes": [],
    "edges": [],
    "cycles": [],
    "unresolved": []
  }
}
```

`graph` is exactly the object returned by `parseRepository(files, options)`.
Node and edge fields are documented in [`../lib/README.md`](../lib/README.md).
Because `content` is retained on every node, snapshots can be large.

This is the format the browser app accepts when a single `.json` file is
drag-and-dropped or opened. The app can also re-parse a snapshot that contains a
top-level `files` array, which is the shape produced by the app's own
"export graph" action.

## Terminal report

After writing the snapshot, the CLI prints:

1. **Scan counts**: files read, nodes, edges, cycles, unresolved imports.
2. **Top blast-radius hotspots**: up to `--top` nodes (default 10) sorted by
   `totalImpact`, then `inDegree`, then path. Each line shows total affected
   files plus the direct and two-hop counts.
3. **Circular dependencies**: each cycle as `a -> b -> ...`, or `none`.
4. **Unresolved imports**: counts split into external packages and internal
   unresolved specifiers, with the first five internal examples.
5. **Focused report** when `--file` is supplied: every 1-hop edge with its line
   and statement, every 2-hop file with the file it came through, and every
   outbound import.

A scan of this repository at the time of writing reports `lib/cartograph-parser.js`
as the only file with dependents: `cli/cartograph-scan.mjs` and
`test/parser.test.js`. `cartograph.html` does not appear because HTML is outside
the scan scope. Treat this as an example snapshot, not a permanent invariant.

Sample report excerpt:

```text
[Cartograph CLI] Scanned 4 files -> 4 nodes, 2 edges (0 cycles, 10 unresolved imports)
Top blast-radius hotspots:
   1. lib/cartograph-parser.js — 2 affected (2 direct, 0 two-hop)
Circular dependencies: none
Unresolved imports: 10 external package(s), 0 internal
```

## Local server

`--serve` first writes the snapshot, then starts an HTTP server. It keeps running
until interrupted.

| Route | Response |
| --- | --- |
| `/` and `/cartograph.html` | `cartograph.html` from the repository root |
| `/lib/cartograph-parser.js` | The shared parser, served as JavaScript |
| `/api/local-repo` | The just-scanned `{ name, scannedAt, graph }` payload as JSON |
| `/favicon.ico` | `204 No Content` |
| Anything else | `404 Not found` |

The HTML, parser, and JSON responses use `Cache-Control: no-store`.

```bash
node cli/cartograph-scan.mjs /path/to/repo --serve 4173
# open http://localhost:4173
```

## Verify

```bash
# End-to-end scan and report
node cli/cartograph-scan.mjs . --out /tmp/cartograph-scan.json

# Focused blast radius for one file
node cli/cartograph-scan.mjs . --file lib/cartograph-parser.js --out /tmp/cartograph-scan.json

# Server routes (leave the server running in another terminal)
node cli/cartograph-scan.mjs . --serve 4173 --out /tmp/cartograph-scan.json
curl -s http://localhost:4173/api/local-repo | head -c 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4173/lib/cartograph-parser.js
```

The CLI itself is covered end-to-end by the last test in
[`../test/parser.test.js`](../test/parser.test.js). The full suite runs with:

```bash
node --test
```

## Invariants

- **No parser fork.** The CLI imports `../lib/cartograph-parser.js`; it does not
  contain its own import/export extraction.
- **No network for graph construction.** The HTTP server only serves local files
  and the in-memory scan result.
- **Read-only against the target.** The only write is the `--out` snapshot.
- **Unresolved imports are recorded, not hidden.** They appear in
  `graph.unresolved` and in the terminal report.
- **Deterministic graph, non-deterministic timestamp.** Node/edge data depends
  only on the scanned files; `scannedAt` changes per run.

## What lives here

| File | Role |
| --- | --- |
| `cartograph-scan.mjs` | Directory walker, snapshot writer, report printer, local server |
| `README.md` | This guide |

The parser contract is in [`../lib/README.md`](../lib/README.md). The CLI
verification checklist is also recorded in [`../CLAUDE.md`](../CLAUDE.md).
