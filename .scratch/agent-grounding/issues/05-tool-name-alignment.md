# Ticket 05 — Align agent tool names across spec, UI, and planner

Owner: agent · Status: done · Blocked by: none

## Contract

- Pick one canonical set of tool names and make `specs/phase-03-agent-evals.md`, `PROJECT.md`, the planner step labels, and the `AGENT_TOOLS` sample list agree (`trace_dependency_path` vs `trace_path`; `detect_cycles_and_hubs` vs `detect_cycles`).
- Update the root README and `specs/README.md` tool-name gap row when done.

## Acceptance

- `grep` finds a single spelling per tool across `specs/`, `PROJECT.md`, and `cartograph.html` user-facing text.

## Outcome (done)

- Canonical names = the `TOOLS` registry keys in `lib/cartograph-agent.js`: `find_entry_points`, `search_symbols`, `get_file_ast`, `walk_dependents`, `trace_dependency_path`, `detect_cycles_and_hubs` — the registry, planner step `tool` fields, and trace labels were already canonical after ticket 04, so no code changes were needed.
- Aligned surfaces:
  - `specs/phase-03-agent-evals.md` spec item 1: `trace_path`→`trace_dependency_path`, `detect_cycles`→`detect_cycles_and_hubs` (all six canonical names now listed).
  - `specs/README.md` Phase 03 required-behavior list: same alignment.
  - `specs/README.md` tool-name gap row **removed** — names agree everywhere and `detect_cycles_and_hubs` has had a real executor since ticket 04, so nothing remains to document.
  - `cartograph.html` agent-panel copy (user-facing): `trace_path`→`trace_dependency_path`.
  - `cartograph.html` demo `AGENT_TOOLS` sample list: gained `'detect_cycles_and_hubs'` as its sixth member (append-only; `AGENT_TOOLS[1]` demo callers unaffected).
  - `PROJECT.md` agent tool list: gained `detect_cycles_and_hubs(max_depth=3)` (label matches the trace).
  - Root `README.md` needed no edit: it never listed tool names, and its `TOOLS` registry mention was already canonical.
- Tests: 3 new red-first fs-based consistency tests (suite 45 → 48, all green): no legacy spelling anywhere in spec/docs/UI copy (`\btrace_path\b` and `\bdetect_cycles\b(?!_and_hubs)` — word-boundary aware; `_` means a bare `detect_cycles` cannot even sit inside `detect_cycles_and_hubs`, the lookahead is belt-and-braces), the phase-03 spec names every registry key, and the demo `AGENT_TOOLS` sample contains all six canonical names. The guard regex lives in the test, so the repo's only remaining `trace_path` mention is the enforcement itself plus its comment (visible as one bare-token hit in the self-scan source view — intentionally not a shipped surface).
- Acceptance grep verified: zero legacy spellings outside the test guard; all six canonical names present in `specs/phase-03-agent-evals.md`, `PROJECT.md`, `specs/README.md`, and `cartograph.html`.
- Browser check (CLI `--serve` + headless Chrome `--dump-dom`): agent copy renders `multi-step tool loop` with `trace_dependency_path`, demo sample shows `detect_cycles_and_hubs`, zero legacy tokens in the rendered DOM.
