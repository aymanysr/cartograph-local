# Ticket 01 — Eval strict mode must run the agent per case

Owner: agent · Status: done · Blocked by: none

## Contract

- `getEvalBenchmarkCases()` keeps its 3 benchmark cases, with questions whose wording routes deterministically into real agent branches (change/blast, auth/enforce, import+break).
- Strict mode evaluates by executing the deterministic agent planner for each case question — no canned `strictCited` lists.
- `buildDeterministicAgentPlan(question)` must be a pure function over the parsed graph (no DOM writes, no `state.agentWalkedFiles` mutation) and must expose every file cited in its answer as `citedFiles`.
- The planner must be a shared, DOM-free module (`lib/cartograph-agent.js`) so Node tests can run the same code the browser runs.

## Acceptance

- `node --test` covers the planner routing and citation exhaustiveness via a fixture graph.
- Browser evals show per-case real traces (step counts from actual runs, latency card no longer hardcoded).

## Outcome (not graded by self-review, but be careful not to regress it)

- Shipped in `lib/cartograph-agent.js`: `buildAgentPlan(question, graph, chipFormatter)` returns `{ steps, visitedFiles[], activeEdges[], answerHtml, primaryFocus, citedFiles[] }`. `cartograph.html`'s `buildDeterministicAgentPlan` is now a thin delegate; `runAgentQuery` rebuilds the canvas Sets from the returned arrays.
- Blast route additionally traces/cites outbound imports (new `trace_dependency_path` step), and an explicitly named full file path wins over the auth keyword routing so questions like "What breaks if src/lib/auth/x.ts changes?" reach the blast branch.
- Benchmark cases are graph-derived in `lib/cartograph-evals.js` (`buildBenchmarkCases`); case 3's question was rewritten ("What breaks if ... changes and which modules does it import?") to route through the blast deterministically.
- Verified: `node --test` (29 passing), headless-Chrome run against `--serve` shows per-case real tool-step badges (4/3/4) and the computed `3.7 steps` latency card.
