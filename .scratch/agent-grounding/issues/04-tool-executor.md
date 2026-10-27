# Ticket 04 — Generalize the deterministic agent into a tool executor

Owner: agent · Status: done · Blocked by: none (independent; bigger refactor)

## Contract

Split the keyword-routed planner into real agents with a discovered handler registry:

- `TOOLS` table: `{ name, run(args, graph) → { output, files } }` for `find_entry_points`, `search_symbols`, `get_file_ast`, `walk_dependents`, `trace_dependency_path`, `detect_cycles_and_hubs`.
- A `plan(question)` router maps a question to a sequence of tool calls with concrete arguments, then executes them so every step's `output`/`files` comes from the tool's run — not precomputed strings.
- Behavior-compatible: existing UI expectations (visible trace, highlighted canvas, grounded synthesis) unchanged.

## Acceptance

- `node --test` executes each tool handler directly against fixture graphs and asserts outputs are derived from the graph, not literals.
- `detect_cycles_and_hubs` gains a real executor (today it is only a step label).

## Outcome (done)

- `lib/cartograph-agent.js` now exports `TOOLS`: six pure handlers, each `run(args, graph) -> { output, files }` derived live from the graph, plus a `label(args)` display formatter so trace `args` strings are byte-identical to the previous UI (including the pinned `from="${target}"` blast form):
  - `search_symbols` — tokenizes the query (≥3-char `[a-z0-9]` tokens) and matches real node paths/exports; honest `Matched 0` dead end.
  - `get_file_ast` — real exports, outbound import targets, and LOC; `verified: true` keeps the blast branch's legacy `Verified exports: [...] (N LOC)` line.
  - `walk_dependents` — depth 1/2 return the node's real `hop1Files`/`hop2Files`; `framing: 'enforcement'` returns the auth branch's combined 1-hop+2-hop line. No-mutation preserved.
  - `trace_dependency_path` — BFS over outbound edges builds a real chain when `to` is given (`Verified dependency chain: a -> b (2 hops)`), absent `to` keeps the legacy outbound listing, unreachable pairs report `No outbound dependency chain`.
  - `find_entry_points` — REAL executor: returns nodes with `inDegree === 0` (was a narrative scan listing hub files).
  - `detect_cycles_and_hubs` — REAL executor (was only a step label): reads `graph.cycles`, ranks top-2 hubs by `totalImpact`, and traces hubs + every cycle member.
- `buildAgentPlan` is now router→calls→executor: identical branch keywords pick identical call sequences with concrete args; `executeCalls` derives every step (`tool`, `args` via `label`, plus handler `output`/`files`). `visitedFiles`/`activeEdges`/`answerHtml` assembly is unchanged, so canvas highlighting and the grounding contract are byte-compatible.
- Tests: 8 new red-first tests (suite 37 → 45, all green): registry shape, per-tool derivation (two-graph divergence in the executor test proves outputs are not literals), BFS chains/dead ends, entry points, cycles+hubs on a synthetic 2-cycle fixture. All previous planner/evals contracts pass unchanged.
- Eval replay on the self-scan through the new executor: strict 3/3 PASS, 100.0% grounded, 100.0% recall, `avgSteps 3.7` — identical to the ticket-02 baseline; naive cases still fail via invented paths as designed.
- Browser check (CLI `--serve` + headless Chrome `--dump-dom`): agent card renders the new executor outputs (`Matched …`, `1-Hop enforcement callers (…)`, `Step-by-step graph walk verification`), eval cards show `PASS • 100.0% GROUNDED` ×3 and the computed `3.7` avg-steps card, no invented path reaches the UI.

## Remaining notes

- At the time of ticket 04 landing, ticket 05 (tool-name alignment) was still open; it is done now — see its outcome notes.
