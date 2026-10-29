# Quiet Shell Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved quiet, responsive Cartograph shell while preserving every existing repository-analysis feature.

**Architecture:** Keep the six classic scripts and their current responsibilities. Add UI state and small global helpers within those scripts; share geometry across layout, drawing, hit testing and fitting. Keep parser, planner, scorer and camera mathematics in the existing shared libraries.

**Tech Stack:** HTML/CSS, browser classic JavaScript, Canvas, native dialogs, Node's built-in test runner and `node:vm`; existing browser tooling only.

**Spec:** `docs/superpowers/specs/2026-10-27-quiet-shell-redesign-design.md` (read alongside this plan). Its explicit values govern; mockup `.superpowers/brainstorm/61050-1793134801/content/data-terminal-v2.html` supplies visual context.

**Readiness:** EGM Stage 9 passed on 2026-10-28. See the [readiness review](../reviews/2026-10-28-quiet-shell-plan-review.md). This is a plan-readiness verdict, not implementation or browser-verification evidence.

## Global Constraints

- **No build step, no deps.** No npm installation, new runtime scripts, framework, backend, telemetry or network dependency.
- `PRESET_REPOS` then `state` remain the only top-level `const`s; keep classic globals and the existing six-script order, without IIFE/ESM conversion.
- No edits to `lib/`, `cli/`, parser/planner/scorer behavior, tool registry/spellings, hop definitions, graph edges or `lib/cartograph-fit.js` mathematics.
- Preserve old globals and signatures, including `selectFileNode(filePath, panToNode = false)`, view IDs `explorer|evals|specs` and right-panel IDs `inspector|agent`.
- Dark-only tokens: ground `#171719`, surface `#131217`, raised `#212023`, border `#222224`, rule `#1b1a1f`, control `#3a3a3e`, text `#ffffff`, muted `#8a8c92`, faint `#5f6065`, accent `#4a8ad6`, rose `#e5566f`, amber `#d9a441`, visited `#5fc39c`, radius `6px`, gap `12px`.
- SF system text; JetBrains Mono paths/counts/figures with tabular numerals. Follow all spec type sizes, selection exceptions and contrast rules. Required text is at least 4.5:1; phone text/labels 14px and sublines at least 12px.
- No gradients, glow, shadows, glass, tinted chrome, filled badge pills, marketing copy or tracked uppercase labels. One inversion primary per screen; selection lines 1px; focus outline white 2px with 2px offset.
- Feedback motion at most 200ms; reduced-motion removes transitions. Default 1440px color budget at most 3%; semantic data colors in denser states remain correct and are recorded separately.
- Paths from the graph are clickable `data-filepath` chips; source and invalid-path diagnostics remain escaped text. Tool trace precedes synthesis and rejection toasts retain ungrounded paths.
- Prefix shell commands with `rtk`. Keep one ordered task-progress list: use these tasks during execution, not a second plan.
- Follow `AGENTS.md`: low reasoning for drafting and mechanical checks; high reasoning for substantive final design, architecture, readiness and code reviews. Use fresh EGM contexts when appropriate and check usage between bounded agent waves.

## Review Focus

1. Equal-sized repository replacement must replace raw files, export content, conversation, provenance and prior evaluation; test in Task 1/4.
2. Quotes, angle brackets, ampersands, spaces and duplicate basenames must remain safe and selectable across every path surface; test in Task 2/3/4.
3. Hidden or resized canvas must fit only on visibility with real dimensions, without resetting dragged positions; test in Task 1/2.
4. Delayed model success and failure after graph replacement must neither alter the new answer nor raise an obsolete toast; test in Task 4.
5. Empty/no-match/disabled palette results and overlapping overlay requests must preserve keyboard access and destination focus; test in Task 3/4.

## Exact File Map

**Create:** `test/ui.test.js` — dependency-free VM tests of actual UI helpers/classic scripts.

**Modify:**

| File | Responsibility |
| --- | --- |
| `cartograph.html` | Tokens, persistent shell, responsive regions, semantic controls, palette/settings/add-file dialogs and pane markup |
| `app/cartograph-graph-state.js` | UI/provenance/eval state, graph lifecycle, card geometry, deterministic positions and fit-only helper |
| `app/cartograph-canvas-render.js` | Card/edge rendering, rectangular hit testing, layout/fit distinction and surviving control states |
| `app/cartograph-ui-panels.js` | Safe chips, user selection wrapper, sidebar, status and Impact rendering |
| `app/cartograph-agent-evals.js` | Quiet trace/answers, stale-run guard and stored explicit evaluation lifecycle |
| `app/cartograph-app-shell.js` | Responsive navigation, overlay arbitration, palette, ingestion/export freshness, Docs/settings/bootstrap glue |
| `app/README.md` | Updated responsibilities, geometry/UI seams and VM/browser test boundary |
| `test/README.md` | Actual added UI coverage and resulting test count |
| `README.md` | Updated navigation/shortcuts/responsive usage; retain existing network caveats |

The remaining runtime file `app/cartograph-preset-repos.js` stays untouched; it is first in the six-script load order. Do not rename/restructure runtime files. Evidence belongs only under `.taste-skill/before/` and `.taste-skill/after/`; no extra planning artifact is needed.

## Task 1: Persistent Responsive Shell and Lifecycle

**Files:** Modify `cartograph.html`, `app/cartograph-graph-state.js`, `app/cartograph-app-shell.js`, `app/cartograph-ui-panels.js`.

**Interfaces:** Preserve existing domain state. Add `state.ui = { phonePane: 'map', inspectorCollapsed: false, overlay: null, overlayOpener: null, paletteMode: 'commands', paletteQuery: '', paletteActiveIndex: -1, pendingFit: false }`; `phonePane` is `files|map|impact|ask`, overlay is `null|navigation|files|inspector|palette|settings|add-file`. DOM opener references are UI-only. Add `state.repositoryProvenance = { kind: 'sample', scannedAt: null }` (`sample|local|snapshot`, valid ISO timestamp or null), separate from UI state. Add `state.evalRun = null` (full `evaluateEvalSuite()` return once run). Add global `setPhonePane(pane): void`, `openUiOverlay(kind, opener = document.activeElement): void`, `closeUiOverlay(restoreFocus = true): void`, and `syncResponsiveShell(): void` in app-shell. Existing view/tab setters update surviving semantic controls.

- [x] Inventory every existing element-ID lookup and inline handler before deleting markup; pair each deletion with its consumer update. Run `rtk proxy node --test` and record the current 53-test baseline; capture before evidence using Task 5's inspector command with `.taste-skill/before` before source edits.
- [x] Implement the spec tokens/type/selection/primary hierarchy and persistent shell outside `viewExplorer`, `viewEvals`, `viewSpecs`: 46px rail, 40px desktop top bar, 26px status, 236px browser, 300px inspector. Preserve repository select ID/custom gating and all input hooks. Initial Map/Impact remains selected; retain the existing startup walkthrough.
- [x] Implement breakpoints exactly: above 1100 desktop; 641–1100 48px top bar/navigation with one max-360px sheet bounded by viewport minus 32px; at most 640 only name/menu/Commands in top bar and a 44px `Files | Map | Impact | Ask` row with one region visible. Keep upload/export/settings reachable from every view and all phone touch targets at least 44px.
- [x] Apply graph loads transactionally: always rebuild `rawFiles` from the current graph rather than testing equal node counts; clear empty selection, old source/inspector/conversation, walked marks and eval result. Set provenance at ingestion call sites: sample says “Built-in sample”; local parse records actual parse time; snapshot uses valid `scannedAt`, otherwise says “Snapshot loaded”. Preserve snapshot export schema and settings storage schema/key.
- [x] Browser checkpoint: at 1440/768/390 navigate Map → Evals → Docs → Map with persistent navigation; verify one responsive region/sheet, close/Escape/scrim focus restore, preserved file scroll/tab/selection, no horizontal scroll or deleted-ID exceptions. Replace two repositories with equal node counts and confirm exported paths/content and freshness belong to the second. Empty graph shows `0 files · 0 edges · 0 cycles` and cleared content.
- [x] Run `rtk proxy node --test`; checkpoint this task with a focused commit once its browser check passes.

## Task 2: Cards, Fit, File Browser and Impact

**Files:** Create `test/ui.test.js`; modify `app/cartograph-graph-state.js`, `app/cartograph-canvas-render.js`, `app/cartograph-ui-panels.js`, `cartograph.html`.

**Interfaces:** In graph-state add `getGraphNodeBounds(node): {minX,minY,maxX,maxY}` for a centered 192×48 world-unit card; `separateGraphNodeCards(nodes): void`; `fitGraphToCanvas(): boolean` (false/defer on hidden/zero canvas). `computeGraphNodePositions(): void` performs layout and requests fit; `resetGraphView(): void` fits only. In canvas-render add `getGraphEdgeRole(edge, selectedNode): 'hop1'|'hop2'|'neutral'`. In ui-panels add `selectFileFromUi(path, panToNode = true): void`, validating membership, switching to Map, calling unchanged `selectFileNode`, then phone Impact/tablet canvas navigation. Internal agent focus continues using `selectFileNode` and keeps Ask visible.

- [x] Add VM harness that loads the actual libraries and six classic scripts in order, stubs `window` listener registration without invoking bootstrap, and accesses lexical state through VM evaluation; no DOM framework or copied production algorithm. Add failing tests: centered bounds for `(0,0)` equal `{-96,-24,96,24}`; `C→B→A` roles selecting A are rose/amber, selecting B makes B→A neutral; repeated preset force layouts produce identical positions and zero card overlaps; palette cases are added in Task 3. Run `rtk proxy node --test test/ui.test.js` and confirm new helper tests fail before implementation.
- [x] Use shared bounds for 6px-radius card drawing, edge endpoints, hit testing and world-box fitting. Labels and export/dependent metadata are mono at least 11px; truncate visually without losing full accessible path. Keep selected/hop1/hop2 precedence, neutral outbound and a separate mint visited mark. Edges: target-selected rose 0.35; hop2-source/hop1-target amber 0.30; other edges `#2a2a2e`; mint evidence never replaces role.
- [x] Lay out DAG rows at 216 horizontal/96 vertical pitch centered per row, preserving layer rank and impact/path order. Retain the current force solver, then separate pairs in node order using 204×60 padded rectangles: calculate positive x/y penetration, half-shift each node on the lesser axis (x on ties), deterministic index sign for zero displacement, add 0.01 per half-shift, stop after a no-overlap pass or 32 passes. This is bounded separation, not a new solver or large-graph performance promise. Read-only planning experiment found current preset raw overlaps 14/6/4 and zero after separation; implementation tests must independently verify.
- [x] Fit card extents through existing `CartographFit.computeFitCamera` with `{top:48,right:16,bottom:16,left:16}`. Layout only on graph/layout change. Resize, inspector toggles, Fit and showing Map request fit only, preserving dragged positions. Defer hidden/zero-sized canvas and fit after its actual visible size settles; external bars contribute no internal padding.
- [x] Rebuild sidebar with filter placeholder, `Blast radius | Folder tree`, 30px desktop rows, folder headings, active layer name/Clear filter, neutral zero counts. Rebuild Impact in spec order: path h1, actual impact fraction/one-decimal percentage, three KPIs, grounded explanation, direct import-line evidence, transitive via-file evidence, outbound, collapsed Source with Copy. Remove legend/grid/vignette/drag hint; retain quiet toolbar and status actions.
- [x] Remove interpolated-path inline JavaScript everywhere touched, including chips, file rows, hotspot, hop/via lists and agent citations. Delegate `data-filepath` clicks to `selectFileFromUi`; escape attributes/text and only create clickable graph paths. Preserve walked marks through ordinary selection until next query/load.
- [x] Run VM tests/full `rtk proxy node --test`. Browser-check drag then resize/collapse/reopen/view-return/Fit without position changes; both layouts/all presets visible and selectable; filter/sort/clear, source Copy, counts and edge roles agree with parsed data. Exercise quotes, spaces, `&`, `<`, `>`, duplicate basenames and long paths in rows/chips/palette/source; no execution or broken selection. Check phone user selection → Impact versus agent internal focus → Ask; checkpoint commit.

## Task 3: Commands and Quick File Search

**Files:** Modify `app/cartograph-app-shell.js`, `cartograph.html`, `test/ui.test.js`.

**Interfaces:** `getPaletteResults(query, mode): { results: PaletteResult[], matchCount: number }` in app-shell; mode is `commands|files`. `PaletteResult` is `{id,kind:'action'|'file',label,path?,available:boolean,reason:string}`. Action implementations remain in a local registry returned by global `getPaletteActions(): Array<{id,label,available,reason,run:Function}>`; do not store a top-level const or create a generalized command framework. `openCommandPalette(mode = 'commands'): void`, `renderCommandPalette(): void`, `runPaletteResult(result): void` use `state.ui` and shared overlay arbitration.

- [x] Add failing VM tests with actual helper calls: exact full path precedes basename prefix, then path substring, then ordered-character subsequence; case-insensitive matches; ties use full-path codepoint order, including duplicate basenames; actions are substring-matched in registry order before files; Files ignores sidebar filters; total results capped at 50 with uncapped match count; empty/no-match and empty-graph availability obey the spec. Run the focused suite and confirm the absent-helper failures.
- [x] Implement ranking without debounce/cache; paths come only from current `state.graph.nodes`. Preserve sidebar's path/export substring search. IDs are stable per action/path; visible result order and availability are explicit data, not inferred from CSS.
- [x] Implement all registry entries using existing handlers: three views, six layer filters, two layouts, isolate/simulate, Fit/zoom, export/folder/add-file/settings, Files search and Help with import direction/drag/scroll. Show neutral current state. Map actions switch to Map first; fit/layout require nodes, isolate/simulate require a valid selected node. Unavailable actions give a reason and cannot execute by either input method; navigation/uploads/settings/export/search remain available on empty graph.
- [x] Build the single native modal dialog, 12px radius/border/scrim, visible Commands/Files switch and Close. Provide labelled combobox/listbox, stable option IDs, `aria-selected`, `aria-controls`, `aria-expanded`, active descendant and live no-results/count feedback. Focus input; Up/Down wraps available options and scrolls; Enter no-ops when none; Escape/Tab behavior and restore/destination focus follow spec. Meta/Ctrl+K/P ignores composition and other modals. Originating menu/sheet closes before palette opens.
- [x] Run VM/full suites. Browser-check pointer and keyboard launch from all three views, mode switching, ranking/cap/count, no results Enter, disabled clicks/Enter, wrapping arrows, Escape, Tab/Shift+Tab containment, IME guard and focus restoration. Execute every registry action including Help and empty-graph export; verify no overlay stacking or page exceptions; checkpoint commit.

## Task 4: Agent, Explicit Evals, Docs and Dialogs

**Files:** Modify `app/cartograph-agent-evals.js`, `app/cartograph-app-shell.js`, `app/cartograph-graph-state.js`, `cartograph.html`.

**Interfaces:** Preserve `evaluateEvalSuite()` return `{isStrict,cases,entries,summary}` and shared scorer calls. Only `runEvaluationSuite()` assigns this complete object to `state.evalRun`; `renderEvalSuite()` reads it and never executes a suite. Graph replacement or an actual mode change sets it null. `runAgentQuery` captures `state.graph` by reference before awaiting and checks identity before every later success/error DOM update/toast. Existing settings/Docs/upload/export globals remain public.

- [x] Restyle Ask as quiet question controls, mono trace rows containing exact tool names/args/output/clickable files before the answer, neutral step counts and underlined chips. Clear prior conversation on graph replacement. Keep deterministic synthesis and current validation; discard both stale async success and error after replacement. Do not let ordinary file selection erase visited marks.
- [x] Make Evals initially “Not run” with dashes, including after graph/mode changes; navigation/rendering never evaluates. Explicit Run stores full run and renders summary plus expandable per-case question, answer, verified citations, rejected/unproven diagnostics, groundedness, recall, real step count, trace and pass/fail. Actual zero hallucinations is `0`; missing values are dashes. Keep strict/naive behavior, 36/400 scores and phone two-line summaries with all evidence accessible.
- [x] Restyle Docs with title/grey description, primary Download and secondary Sync/Copy. Preserve all three editable documents and edits through document/view switches; sync explicitly regenerates current-graph content. Preserve the existing download/copy behavior and export schemas.
- [x] Convert settings/add-file to native dialogs governed by Task 1 arbitration, focus containment/restoration and Escape/Cancel. Keep engine/endpoint/model/key, storage key `cartograph_agent_config`, Save versus Cancel, path/source paste and multiple-file upload. Use 40px fields, 28×16 switches, stacked phone labels; restyle toasts with readable rejection details. Avoid stale DOM references on graph loads.
- [x] Browser lifecycle tests: initial Evals/mode/graph changes do not call evaluation; strict explicit run shows 100.0% groundedness and `0` hallucinations; naive exposes invalid paths; empty graph remains coherent. Intercept a delayed model success and failure, replace graph before release, verify no obsolete content/toast; current rejected/unreachable responses retain deterministic answer. Inspect trace order and chip navigation. Check Docs edit-switch-return/Copy/Sync/Download, settings Save/reload/Cancel, add paste/multiple uploads, folder/snapshot/drop and every preset. Repeat pathological paths in valid answers versus escaped invalid diagnostics. Run full tests; checkpoint commit.

## Task 5: Final Acceptance, Visual Evidence and Guides

**Files:** Modify `README.md`, `app/README.md`, `test/README.md`; inspect all changed runtime files. Evidence: `.taste-skill/before/`, `.taste-skill/after/`.

**Interfaces:** No new runtime interfaces. Handoff includes actual commands/results, screenshots, known limitations and final file diff.

- [x] Update guides to match shell/shortcuts/phone navigation, UI helper ownership and VM coverage versus real browser lifecycle checks. Replace the historical “nothing here is loaded or executed by node --test” claim and record the measured final test count. Preserve deterministic/network caveats and avoid unrelated document rewrites.
- [x] Run `rtk proxy node --test` (all original 53 plus new meaningful UI cases pass), `rtk proxy node cli/cartograph-scan.mjs . --out /tmp/cartograph-scan.json` (nodes/edges/cycles/unresolved exported), and `rtk proxy node cli/cartograph-scan.mjs . --serve 4173` (serve and assets work). Verify parser alias/barrel behavior remains covered by unchanged passing tests. Open `cartograph.html` directly as a file and complete startup/selection; no build/server required for canonical app startup.
- [x] Complete Task 1–4 browser matrix at 1440/768/390, both layouts and all three presets, including every action, overlays, keyboard/focus, empty state, repository replacement and external-model cases. Capture errors from console/page events; require zero application exceptions. Check computed SF/JetBrains fonts, contrast, touch targets, zero neutral counts, no page horizontal scroll and correct primary action per screen.
- [x] Run installed design tools from repository root:

  ```sh
  rtk proxy node /Users/ayousr/.agents/skills/design-taste-frontend/scripts/lint.mjs cartograph.html app --app
  rtk proxy node /Users/ayousr/.agents/skills/design-taste-frontend/scripts/inspect.mjs cartograph.html --app --widths 1440,768,390 --out .taste-skill/after
  ```

  Use the inspector with `.taste-skill/before` for Task 1's baseline. Require zero FAIL and review screenshots against the approved mockup/app-screen rubric. The type override skips the dealt-font rule, so report computed/visual font evidence separately. Allow at most three visual fix rounds; report residual failures honestly.
- [x] Inspect additional states: Evals, Docs, palette, settings and selected tablet/phone regions. The installed inspector starts a fresh page and offers no state hook: use Playwright to set each state, serialize the installed `probe.mjs` app/probe/layout functions into that active page, collect their metrics, and apply installed `rules.mjs` judges without resetting it. Save per-state metrics/screenshots under after evidence; do not claim the CLI's default-startup run covers these states. Check default 1440 color budget separately from dense semantic graph states.
- [x] Use a fresh high-reasoning subagent for the substantive final code review. Review final diff for unchanged lib/CLI/preset files, exactly six runtime scripts/load order, only original top-level consts, exact tool spellings/`AGENT_TOOLS`, no path-inline JavaScript, stale element IDs, implicit eval execution or hidden-canvas layout resets. Resolve actionable findings and run relevant checks again when fixes change code. Checkpoint documentation/evidence and hand off actual results.

## Completion and Handoff

All five tasks completed and accepted on 2026-10-28. Low-reasoning implementation and high-reasoning substantive reviews followed the saved preference. Fresh whole-change review and scoped repair reviews are complete; all actionable findings addressed.

Final verification:62/62 tests; CLI18nodes/12edges/0cycles/24external and0internal unresolved; direct-file startup/selection and serve/assets pass. Installed lint0FAIL and three-width inspector0FAIL; actual expanded Evals and Source scrolling probes pass at1440/768/390, no application exceptions. Nonblocking warnings and explicit additional corrective-wave rulings remain documented.

See `.superpowers/sdd/2026-10-28-quiet-shell-redesign/completion.md` for the result, evidence and rulings. Source changes are uncommitted in the original Downloads project; no Git metadata/commit/push. Snapshots/diffs/evidence preserved. No required implementation or review steps remain. Optional next action: owner reviews the app or chooses integration separately.
