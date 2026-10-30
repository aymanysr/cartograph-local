# CLAUDE.md — Agent Engineering Rules for cartograph-local-project

## 1. Mandatory Pre-Flight Check
Before modifying any file in `cartograph-local-project`:
1. Inspect its **1-Hop Direct Dependents** and **2-Hop Transitive Dependents** in Cartograph.
2. If the target file has `totalImpact >= 3` (such as `lib/cartograph-parser.js`), do NOT change exported function signatures or return shapes without updating all 1-hop callers in the same atomic step.

## 2. Architecture Invariants
- **Strict Layer Boundaries**:
  - Core/DB modules must never import from UI or Route handlers.
  - Parser modules must remain 100% standalone and deterministic.
- **Zero Hallucinated Paths**: Never reference a file path unless it exists in the repository file tree.
- **DAG Invariant**: Keep Circular Dependencies at 0.

## 3. Communication Protocol
- When an architectural trade-off arises, stop and ask a concrete **A or B question** with a 1-sentence trade-off and your recommended default.
- No walls of text. State the exact file path and line number when reporting issues.
