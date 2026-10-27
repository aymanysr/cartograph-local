# Ticket 02 — Grounding must require tool-trace provenance

Owner: agent · Status: done · Blocked by: 01 (needs real agent runs to ground against)

## Contract

- Extract a shared scorer (`lib/cartograph-evals.js`), pure and DOM-free, with this exact semantics:
  - **hallucinated** = cited path does not exist in `graph.nodes`.
  - **unproven** = cited path exists in the graph but never appeared in the agent's tool trace (strict mode only).
  - **grounded** = cited and not hallucinated and not unproven.
  - **Groundedness %** = grounded / total cited (x100, 1 decimal).
  - **Recall %** = |expected ∩ cited| / |expected| (x100).
  - **Case PASS** = 0 hallucinated, 0 unproven, recall 100%.
  - Naive/blind mode has no trace, so grounding falls back to existence-only (provenance check disabled) and hallucinations are still caught.
- `runEvaluationSuite()` computes scores from real runs and toasts the actual overall groundedness % (no hardcoded `41.7%`/`100.0%`).

## Acceptance

- Node tests prove the provenance rule: a cited-but-never-traced existing path drops groundedness below 100 and fails the case.
- Browser strict mode passes all 3 cases on the built-in samples with 0 hallucinations; naive mode visibly fails with invented paths.

## Outcome

- Shipped in `lib/cartograph-evals.js`: `scoreCase`, `collectTraceFiles`, `computeSuiteSummary`, `buildBenchmarkCases` — all DOM-free, no regex guessery at call sites, exact PASS rule (`0 hallucinated ∧ 0 unproven ∧ exact recall`).
- `renderEvalSuite` now runs the agent per case (strict) and renders per-case real numbers, real tool steps, untraced-citation callouts, and value-colored cards — rendered output contains no hardcoded scores (the initial HTML markup does ship placeholder strings `100.0%` etc., overwritten at load).
- Toast reports the real summary (`Run Full Benchmark Suite`).
- Verified: `test/evals.test.js` (10 cases) green, including the cited-but-untraced 50% provenance case; headless-Chrome strict run on the self-scan graph shows `100.0% / 100.0% / 0 / 3.7 steps` with all 3 cases PASS.
