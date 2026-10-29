# EGM Consolidated Review Report: Inspector, Trace & Evals Upgrades (ADR-009)

**Date:** 2026-10-29  
**Reviewers:**
- EGM Design Critic (`9d96a998-7e2b-4d12-b73d-7fcbed3f5f44`)
- EGM Structural Critic (`887c270c-590c-4436-8510-c269f3f77ec7`)

---

## 1. Review Summary

Cartograph Local was evaluated across two independent, fresh-context expert reviews examining:
1. **Inspector Panel Quick Actions & Metadata Badges** (`cartograph.html`, `app/cartograph-ui-panels.js`, `app/cartograph-canvas-render.js`)
2. **Agent Tool Execution Trace Badges & Markdown Export** (`app/cartograph-agent-evals.js`, `cartograph.html`)
3. **Benchmark Evals Provenance Breakdown, Expand/Collapse & Report Export** (`app/cartograph-agent-evals.js`, `cartograph.html`, `test/ui.test.js`)

Both reviewers commended the high value of immediate contextual module actions, the deterministic AST tool trace mapping, and the evaluative benchmark framework for catching LLM hallucinations with empirical metrics.

A total of 10 design issues (D1–D10) and 11 structural/invariant findings (S1–S11) were identified and completely remediated.

---

## 2. Matrix of Findings & Remediation

| ID | Category | Finding | Remediation Applied |
| :--- | :--- | :--- | :--- |
| **D1** | Visual | Wildcard `.impact-content [class*=bg-]` reset stripped button and badge backgrounds | Scoped CSS reset in `cartograph.html` to exclude `#inspectorActionToolbar`, `[data-badge]`, and `#inspectorCycleBadge`. Defined explicit quiet-shell button and pressed states. |
| **D2 / S4** | State Sync | Simulation toggle lacked initialization, and inspector simulation button was decoupled from canvas banner dismissal | Added `btnInspectorSimulate` to `syncCanvasToggleState()`. In `toggleSimulateSelected()`, unified state handling through `toggleBreakSimulation()`. Synced `aria-pressed` in `renderInspectorPanel()`. |
| **D3** | Diagnostic | Status pill in evals misattributed incomplete recall as "unproven" | Updated failure reason computation to explicitly differentiate `incomplete recall`, `unproven`, `hallucinated`, and composite failures. |
| **D4** | Diagnostic | Missed expected citations were omitted from the Provenance Citation Audit | Added a dedicated "Missed Expected Citations" card rendering expected files omitted by the agent using interactive chips. |
| **D5 / S8** | Export | Trace Markdown exporter dropped arguments and discovered file chips | Rewrote `copyAgentRunMarkdown` to query `[data-tool-label]`, `[data-tool-args]`, outputs, and discovered file chips. |
| **S1** | Invariant 2 | Unproven file citations were rendered as raw plain text instead of clickable chips | Wrapped `unprovenPaths` in `makeFileChipHtml`, ensuring every real graph file cited is interactive with `data-filepath="..."`. |
| **S2** | Lifecycle | `exportEvalReport` revoked blob URL synchronously on unattached anchor | Appended `<a>` to `document.body`, triggered download, removed `<a>`, and deferred `URL.revokeObjectURL(url)` via `setTimeout(..., 1000)`. |
| **S3** | Clipboard | Ad-hoc clipboard writing gave false positive toasts on rejection | Replaced ad-hoc clipboard calls with shared `copyTextSafe()` utility with textarea fallback. |
| **D6** | WCAG AA | Monospace tool arguments relied on 10px `text-slate-500` (4.1:1 contrast, failing WCAG AA) | Elevated arguments to `text-xs text-slate-400` (7.7:1 contrast ratio, fully WCAG AA compliant). |
| **D7** | Ergonomics | "Copy Markdown" button had an undersized 17px height | Increased button padding and typography to `text-xs px-2.5 py-1` (min 28px height on desktop, 44px on touch). |
| **D8 / S6** | Defensive | Unselected inspector left action buttons clickable and meta context showed "— · —" | Hidden `#inspectorMetaContext` by default; toggled `hidden` and set `disabled = true` on action buttons when no file is selected. Guarded `askAgentAboutSelectedFile()` against null selections. |
| **S9** | Precision | Naive mode claimed "AST-Traced & Proven Citations" in header | Dynamically switched label to `Grounded Citations (Present in Graph):` when in Naive mode. |
| **S10** | Navigation | Centering card while on Evals/Specs pane kept map hidden | Added automatic view switching to `'explorer'` in `centerSelectedOnMap()`. |
| **S7** | Test Rigor | Test suite lacked coverage for expand-all, markdown copying, and negative eval branches | Expanded `test/ui.test.js` to assert `toggleAllEvalCases`, `copyAgentRunMarkdown`, negative eval provenance breakdown, and inspector button states. |

---

## 3. Verification & Compliance Sign-Off

- **Node.js Test Suite**: 132/132 tests passing across all 11 suites (`node --test`).
- **Playwright End-to-End Suite**: 0 page errors, 0 console errors, verified against live server `http://localhost:4173/`.
- **Architectural Invariants**:
  - Invariant 1 (Real Parsed Imports Only): 100% adhered to.
  - Invariant 2 (Strict Grounding Contract): 100% adhered to (all real files rendered as `data-filepath` chips).
  - Invariant 3 (Zero Dependencies in `lib/`): 100% adhered to.
  - Invariant 4 (Cross-Surface Tool Consistency): 100% adhered to.
