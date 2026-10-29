# Repository Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Use checkbox syntax for progress. One low-reasoning implementer, one fresh high-reasoning review; no parallel overlapping edits.

**Goal:** Make browser and CLI repository selection consistent and make omissions visible.

**Architecture:** Both existing readers call one DOM-free UMD/classic intake policy; parser and snapshots stay independent. Browser and CLI own reporting and I/O. See `docs/superpowers/specs/2026-10-28-repository-intake-design.md`.

**Tech Stack:** Existing HTML/classic JavaScript, Node, browser APIs, Node built-in tests. No dependency, build, network or framework addition.

## Global constraints

Honor the agreed spec precisely. Preserve existing uncommitted redesign, graph and snapshot schemas, no-build direct-file startup, existing six app scripts and all grounding/provenance behavior. New `lib/cartograph-intake.js` is the single added shared library; do not edit parser/planner/scorer/fit. Preserve Git metadata; no commits/pushes. Shell calls use `rtk`, explicit original workdir; review baseline `/tmp/cartograph-intake-20261028/before.json`.

## Review focus

1. A snapshot with hidden, excluded, oversized and otherwise unsupported recorded files must retain them.
2. Unicode byte limits must agree in both readers at exactly500,000 bytes and over; validate bytes actually read.
3. Root prefix, mixed roots, similarly named directories and duplicate paths must not silently alter graph data.
4. Skipped/unreadable entries must be accessible and truthful; an all-skipped selection must preserve the existing graph.
5. Browser file availability is platform-dependent; compare identical supplied files, not unavailable ones.

## Task 1: Shared intake policy, adapters and evidence

**Files:** Create `lib/cartograph-intake.js`, `test/intake.test.js`; modify `cli/cartograph-scan.mjs`, `app/cartograph-app-shell.js`, `cartograph.html`, `test/ui.test.js` and relevant root/cli/lib/app/test README files. Keep other files unchanged except necessary scoped fixes.

**Interfaces:** The new global/CommonJS `CartographIntake` exposes `checkDirectory(path)` and `checkFile(path, byteLength)` as pure decisions returning `{include:boolean, reason:string|null, skippedPath:string|null}` with stable `hidden|excluded-directory|unsupported|too-large` reasons; input paths are repository-relative. Readers own I/O, unreadable/duplicate reporting and snapshot detection. If a concrete edge requires a minor interface adjustment, record it in the report and preserve one policy source.

- [x] Add meaningful tests against actual CLI subprocess and production browser handler for the shared fixture and all five review-focus cases; run focused tests and record expected pre-change failures.
- [x] Implement shared policy, Node reader and browser folder/file reader. Preserve snapshots before policy decisions. Make skipped summary and bounded details persistent and accessible; no incorrect descendant counts.
- [x] Update docs and VM/classic/serve load order. Run focused tests, full `node --test`, CLI fixture, syntax and `git diff --check`. Browser-check identical available fixtures, all-skipped, snapshot, details/keyboard, direct-file startup and server route. Record commands, results, screenshots and limitations in `/tmp/cartograph-intake-20261028/report.md`.
- [x] Generate review diff against the saved before snapshot and obtain one high-reasoning spec/quality review; fix actionable findings, scoped re-review. Mark complete only with full suite, focused browser checks and review acceptance.

Next, revisit repository replacement, navigation and Evals in that order; preserve the user decisions and re-use one progress list.

## Acceptance

Fresh high review accepted both normalized-path and mixed-root fixes. Full `node --test`72/72 and `git diff --check` pass; browser and CLI evidence `/tmp/cartograph-intake-20261028/report.md`. Pre-existing changes and uncommitted state preserved.
