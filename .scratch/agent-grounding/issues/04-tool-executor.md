# Ticket 04 — Generalize the deterministic agent into a tool executor

Owner: agent · Status: open · Blocked by: none (independent; bigger refactor)

## Contract

Split the keyword-routed planner into real agents with a discovered handler registry:

- `TOOLS` table: `{ name, run(args, graph) → { output, files } }` for `find_entry_points`, `search_symbols`, `get_file_ast`, `walk_dependents`, `trace_dependency_path`, `detect_cycles_and_hubs`.
- A `plan(question)` router maps a question to a sequence of tool calls with concrete arguments, then executes them so every step's `output`/`files` comes from the tool's run — not precomputed strings.
- Behavior-compatible: existing UI expectations (visible trace, highlighted canvas, grounded synthesis) unchanged.

## Acceptance

- `node --test` executes each tool handler directly against fixture graphs and asserts outputs are derived from the graph, not literals.
- `detect_cycles_and_hubs` gains a real executor (today it is only a step label).
