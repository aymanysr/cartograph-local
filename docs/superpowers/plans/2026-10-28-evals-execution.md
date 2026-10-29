# Shared Evals Execution Implementation Plan

> **For agentic workers:** Use subagent-driven development; Low implementation, High substantive review, no overlapping edits.

**Goal:** Put the full Evals run behind the existing shared module while preserving the user-facing lifecycle.

**Architecture:** `CartographEvals.evaluateSuite(graph, mode, chipFormatter)` returns existing `{isStrict,cases,entries,summary}` shape; browser owns Run/state/render. Existing shared planner and scorer supply all behavior. See `docs/superpowers/specs/2026-10-28-evals-execution-design.md`.

**Constraints:** Original Downloads checkout with prior uncommitted changes; no Git metadata/commit/push. Preserve parser/agent/fit/intake/CLI, six app scripts, snapshots, no dependencies/build. Shell uses rtk and explicit workdir. Review baseline `/tmp/cartograph-evals-20261028/before.json`. User authorizes recommended routine choices without repeated questions.

**Files:** lib/cartograph-evals.js, app/cartograph-agent-evals.js, test/evals.test.js, test/evals-ui.test.js or suitable existing tests, lib/README.md, app/README.md, test/README.md; avoid unrelated changes.

- [x] Write meaningful actual shared-suite and production-browser lifecycle tests; watch expected RED. Cover strict/naive, zero/invalid mode, graph immutability, formatter+path escaping, mode/replacement invalidation and no planner calls except Run.
- [x] Move orchestration into shared module; preserve the result shape, explicit empty UI guard, real evidence semantics and old exports. Refactor redundant test-only whole-suite assembly to call production interface; retain independent scorer tests.
- [x] Run focused/full Node tests, syntax/diff checks and CLI scan; focused real browser explicit/not-run, mode/same-count graph/snapshot invalidation, special paths/expanded traces at desktop+phone; reuse unaffected previous browser checks. Save `/tmp/cartograph-evals-20261028/report.md`, screenshots and baseline-based review.diff.
- [x] Obtain fresh High spec/quality review, fix actionable findings and scoped re-review. Complete after accepted review + required checks.

Then whole-change final review across all four opportunities; preserve uncommitted source.

## Acceptance

High review approved; no Critical or Important findings. One nonblocking indentation cleanup deferred to final review. Full101/101 and focused browser evidence recorded in `/tmp/cartograph-evals-20261028/report.md`.
