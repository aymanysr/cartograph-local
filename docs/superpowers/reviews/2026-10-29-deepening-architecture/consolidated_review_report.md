# EGM Adversarial Architecture Review: 3-Module Deepening & Seam Consolidation
**Date:** 2026-10-29  
**Review Type:** EGM Phase 3 (Comprehension, Critic Swarm, Implementation Readiness)  
**Spec Under Review:** `docs/superpowers/specs/2026-10-29-deepening-architecture-design.md`  
**Reviewers:** Goldfish Design Critic & Goldfish Structural Critic  

---

## 1. Executive Verdict: CONDITIONAL GO (3 Minor Remediations Required)

The proposal cleanly addresses the shallowness of `lib/cartograph-fit.js`, the fragmentation of `lib/cartograph-intake.js`, and the presentation coupling of `lib/cartograph-agent.js`. The pure functional architecture for `CartographCamera` is strictly superior to stateful instances, and the batch processing seam for `CartographIntake` adheres to the "two adapters = real seam" invariant.

Before code implementation begins, three critical edge cases must be locked down:

---

## 2. Findings & Required Remediations

### Finding F1 (Camera Division-by-Zero Guard)
* **Severity:** Material (Edge Case)
* **Risk:** If a corrupted or zero-zoom camera state (`zoom: 0` or `zoom: NaN`) is passed to `toWorld(camera, screenPt)`, `(screenPt.x - camera.x) / camera.zoom` will produce `±Infinity` or `NaN`, poisoning canvas state.
* **Remediation:** Enforce `const z = clamp(camera.zoom || 1, MIN_ZOOM, MAX_ZOOM)` inside `toWorld`, `toScreen`, `centerOnNode`, and `zoomAt`.

### Finding F2 (Intake Snapshot Discrimination Guard)
* **Severity:** Material (Correctness)
* **Risk:** `package.json` or `tsconfig.json` in a multi-file folder upload contains valid JSON. If `discriminate` runs unconditionally on any JSON file, it might mistake a dependency manifest for an imported Cartograph snapshot.
* **Remediation:** In `processBatch`, snapshot discrimination must only trigger if `entries.length === 1` and the file has a `.json` extension (matching existing `app-shell.js` semantics).

### Finding F3 (Agent Backward-Compatibility Surface)
* **Severity:** Minor (Regression Prevention)
* **Risk:** `test/agent.test.js` and `test/evals.test.js` assert that `buildAgentPlan` returns `answerHtml` containing formatted chips. If `answerHtml` is omitted, existing test assertions will fail.
* **Remediation:** `buildAgentPlan` must continue to expose `answerHtml` alongside the new structured fields (`target`, `blastRadius`, `narrative`), formatting chips via the supplied `chipFormatter` (or default identity).

---

## 3. Implementation Readiness Verdict
* **Verdict:** **GO** (With F1, F2, F3 remediated in code).
* **Target Invariant:** 110/110 tests green on `node --test` after refactoring.
