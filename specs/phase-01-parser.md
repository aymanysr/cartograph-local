# Phase 01 — Deterministic Import/Export Graph Parser

## Goal
Turn a raw collection of repository files into a verified, queryable directed graph (`nodes` and `edges`) without calling an LLM.

## Specification
1. Extract all static `import ... from '...'`, `export ... from '...'`, dynamic `import('...')`, CommonJS `require('...')`, Python `from ... import ...`, and Go `import "..."` declarations with exact 1-indexed line numbers.
2. Extract all module exports (`export function`, `export class`, `export const`, `export type`, `export interface`, `export default`, Python `def`/`class`) so each node carries a ground-truth symbol manifest.
3. Resolve internal module specifiers across:
   - Relative paths (`./`, `../`)
   - Root aliases (`@/`, `~/`) and repo-relative `src/...` paths
   - Implicit extensions (`.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.go`)
   - Directory barrel files (`/index.ts`, `/index.tsx`, `/index.js`, `/__init__.py`)
4. Compute deterministic graph topology metrics for every node:
   - `inDegree` (direct dependents count)
   - `outDegree` (direct imports count)
   - `hop1Files` (1-hop breakage set)
   - `hop2Files` (2-hop transitive breakage set)
   - `cycles` (circular dependency loops detected via Tarjan's DFS-based — depth-first search — strongly-connected-component detection)
5. Record every unresolved module specifier in `graph.unresolved` with source file, line, specifier, and classification (`internal-unresolved` vs `external-package`) so resolution accuracy can be inspected.
