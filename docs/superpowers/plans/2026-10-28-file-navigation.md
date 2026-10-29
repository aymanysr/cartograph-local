# File Navigation Implementation Plan

> **For agentic workers:** Use subagent-driven development; one Low implementer and one High spec/quality review; no overlapping edits.

**Goal:** Make all user file jumps share one correct navigation transition.

**Architecture:** Deepen existing `selectFileFromUi(path, panToNode=true)` in app shell and preserve native overlay ownership; no new module, dependency, framework or runtime script. Spec: `docs/superpowers/specs/2026-10-28-file-navigation-design.md`.

**Constraints:** Original Downloads checkout with uncommitted work; preserve six classic app scripts, no Git metadata writes/commits/push. Preserve replacement/intake/agent grounding and non-user agent selection. Shell `rtk` and explicit original workdir. Baseline snapshot `/tmp/cartograph-navigation-20261028/before.json`.

**Files:** app/cartograph-app-shell.js, app/cartograph-ui-panels.js, app/cartograph-canvas-render.js, test/ui.test.js and/or test/navigation.test.js, app/README.md, test/README.md; no unrelated edits.

- [x] Write failing production-handler tests for double palette selection and stale file side effects, actual desktop focus after sidebar/inspector redraw and hidden Evals/Docs, and dragging away then back near the start; record RED.
- [x] Implement one validated transition, remove duplicate capture/direct routes, preserve keyboard Enter/action behavior, native dialog and responsive focus.
- [x] Run focused and full Node tests, syntax/diff checks; real browser matrix 390/768/1440 click vs Enter, stale inputs, overlay transfers/Escape, actual focus, drag/canvas, resize, special paths and agent Ask. Reuse unaffected lifecycle evidence. Save `/tmp/cartograph-navigation-20261028/report.md`, screenshots and before-snapshot review diff.
- [x] Obtain independent high spec/quality review and scoped fixes/re-review; complete only after acceptance.

Next: Evals execution, then final whole-change review and handoff.

## Acceptance

Fresh high review accepted canvas focus and documentation fixes; full `node --test`95/95 and `git diff --check` pass. Evidence `/tmp/cartograph-navigation-20261028/report.md`; changes uncommitted.
