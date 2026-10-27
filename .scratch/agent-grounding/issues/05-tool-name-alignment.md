# Ticket 05 — Align agent tool names across spec, UI, and planner

Owner: agent · Status: open · Blocked by: none

## Contract

- Pick one canonical set of tool names and make `specs/phase-03-agent-evals.md`, `PROJECT.md`, the planner step labels, and the `AGENT_TOOLS` sample list agree (`trace_dependency_path` vs `trace_path`; `detect_cycles_and_hubs` vs `detect_cycles`).
- Update the root README and `specs/README.md` tool-name gap row when done.

## Acceptance

- `grep` finds a single spelling per tool across `specs/`, `PROJECT.md`, and `cartograph.html` user-facing text.
