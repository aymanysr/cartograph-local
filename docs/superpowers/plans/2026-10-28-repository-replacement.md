# Repository Replacement Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development, one low implementer and one focused high review. Do not overlap source edits.

**Goal:** Concentrate repository adoption rules and protect a newer user load from stale startup work.

**Architecture:** Deepen existing `applyParsedGraph`; callers supply only selection intent and existing custom label. Keep parsing, intake reporting, DOM rendering and user navigation responsibilities intact. Spec: `docs/superpowers/specs/2026-10-28-repository-replacement-design.md`.

**Constraints:** Preserve uncommitted source, original Downloads workdir, no Git metadata writes/commits/push. No new dependencies, runtime scripts, parser/planner/scorer/fit changes, snapshot/export schema changes or broadly generalized framework. `rtk` prefix; review baseline `/tmp/cartograph-replacement-20261028/before.json`.

**Interface:** Extend `parseRepositoryIntoGraph(files, repoName, repoDescription, provenance, options)` and `applyParsedGraph(graph, provenance, options)` compatibly; optional `options` contains `selection: 'preserve'|'hotspot'|{path, pan}` and `customLabel` as needed. Existing calls preserve existing default. Use routine implementation judgment for exact small representation if tests and report document it; no generic callbacks. Empty graph has null selection.

## Task 2: Repository replacement lifecycle

**Files:** `app/cartograph-graph-state.js`, scoped callers/bootstrap in `app/cartograph-app-shell.js`, possibly `app/cartograph-ui-panels.js`, new `test/replacement.test.js` or existing UI test as appropriate, `app/README.md`, `test/README.md`. No edits to intake policy/CLI or unrelated areas.

- [x] Add meaningful real-code lifecycle tests for same-count replacement, reset transient states, selection intent and startup race; test parser exceptions through preset, folder and pasted-file handlers, asserting prior graph identity, raw files, provenance, selection and dropdown remain unchanged (Last intake still records the attempt); record expected RED.
- [x] Implement agreed narrow lifecycle deepening and stale-startup guard; preserve saved snapshots, Last intake, existing focus and layout behavior, benchmark explicit execution, graph identity.
- [x] Run focused+full `node --test`, syntax/diff checks; actual browser tests for user-load vs delayed server response, drag replacement, custom file selection/label, hidden canvas, snapshot/empty and stale model success/failure; reuse unchanged previous evidence. Record `/tmp/cartograph-replacement-20261028/report.md`, screenshots and exact commands.
- [x] Generate review diff from saved pre-task snapshot. Obtain independent high spec/quality review, fix actionable findings, scoped high re-review. Mark complete only after acceptance and tests.

Next: navigation and overlays, then Evals execution. No repeated questions for routine recommendations.

## Acceptance

Fresh high review accepted dropdown rollback, single refresh, and actual-user focus evidence. Full `node --test`85/85 and `git diff --check` pass. Evidence `/tmp/cartograph-replacement-20261028/report.md`; existing source remains uncommitted.
