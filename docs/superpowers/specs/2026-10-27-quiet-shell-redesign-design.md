# Quiet Shell Redesign — Design Document

**Date:** 2026-10-27
**Status:** Design reviewed with EGM; review repairs recorded below. Implementation has not started. Detailed implementation planning is the next stage.
**Scope:** `cartograph.html` chrome, `app/*.js` UI styling and panel structure, new command palette. Parser, agent planner, eval scorer, fit-camera math (`lib/`) untouched.

## Intent and the why

The current UI is crammed, loud, and self-narrating: five stacked horizontal systems before any content, color and borders on everything, marketing sentences inside the product. The owner's verdict: "crammed and loaded and feels obnoxious… feels vibe coded."

Their taste anchors are **macOS apps and VS Code**: quiet chrome, dense-but-organized content, monochrome + one accent, functionality discovered through menus and a palette rather than visible buttons. Mockups in `.superpowers/brainstorm/61050-1793134801/content/` (direction deal three-up, then `data-terminal-v2.html` at real fidelity) were reviewed and approved: "feels right."

**Direction (locked): `data-terminal`** — the app style from the design-taste skill (seed 1049632490, kind `builder`). A research-monitor screen read in long sessions: cards darker than the ground, tabular digits, signs over color, and label-width 1px selection underlines, with the rail/row/node exceptions defined below.

**Reference precedence:** this spec's explicit decisions govern; the approved dark mockup supplies visual context; the direction sheet supplies defaults where this spec is silent. During recovery, `.taste-skill/direction.json` actually contained light `framed-sheet`, seed 1215534039. That file is preserved at `.taste-skill/archive/framed-sheet-direction.json`. The active sheet was reconstructed from the installed skill using the locked dark style and seed; it is a recovery artifact, not proof of the historical draw. `--keep type` records the approved SF text / JetBrains Mono override. Do not adopt the sheet's generic white builder controls, light settings pattern, or 2px detail tabs over this spec's dark tokens and 1px selections.

## Goals

1. One slim unified shell: icon rail + one top bar + status bar. Nothing else floating.
2. Color budget ≤ 3% of pixels in the default preset at 1440px. Blue accent appears only as selection lines and selected-node outlines; active text is white. Rose/amber live **only on data** (graph nodes, edges, impact counts, hop lists). Dense/high-impact graph states retain their semantic colors even if the proportion rises; record that state separately from the default-screen budget.
3. Typography carries hierarchy: SF system stack for text, JetBrains Mono (already loaded) for every path, figure, and count, tabular-nums.
4. Features preserved 1:1 (map, agent, evals, docs, all modals, export, isolate, simulate). Chrome shrinks; nothing is cut.
5. The app must pass the design gate: `lint.mjs --app` and `inspect.mjs --app` with **0 FAIL**.

## Non-goals

- Light mode. Dark-only in this pass (the app is dark today; true-black-flat was rejected as a direction).
- Any behavioral change to parser, planner, scorer, evals scoring, CLI.
- Framework/styling migration. No npm dependencies, no build step (golden rule of the repo).
- Replacing the canvas render engine; its interaction model (drag/zoom/fit) stays.
- Cutting features or demoting features the owner uses "all of them." The agent becomes *less loud*, not absent.

## Anti-goals (what would make this a failure)

- Any gradient, badge chip, glass/blur panel, glow, icon-in-tinted-square, or marketing sentence inside the UI.
- Color on chrome (tabs, nav, buttons) beyond the 1px accent line and text states.
- Tiny uppercase letter-spaced labels (a tell of the current UI); use sentence case.
- The old indigo/violet accent — banned. The accent is the dealt blue `#4a8ad6`.
- Regressions to the grounding contract: every path shown stays a clickable chip (`data-filepath="..."`).

## Locked decisions

These are decided; the builder implements them.

### Tokens (data-terminal sheet, values as dealt)

```css
:root {
  --ground: #171719; --surface: #131217; --raised: #212023;
  --border: #222224; --rule: #1b1a1f; --control: #3a3a3e;
  --text: #ffffff; --muted: #8a8c92; --faint: #5f6065;
  --accent: #4a8ad6; --rose: #e5566f; --amber: #d9a441; --visited: #5fc39c;
  --radius: 6px; --gap: 12px;
}
```

- Dark cards are **darker than the ground** (`--surface` on `--ground`), separated by 1px `--border`/`--rule`; no shadows, no glass.
- Data colors: rose = "breaks at 1 hop", amber = "2-hop cascade", grey = outbound imports and neutral files, mint reserved for agent-visited marks.
- The accent never touches buttons, tabs, nav fills, or the canvas's ambient state; it appears only as a 1px line on the current selection and on the selected node.
- `--faint` is reserved for decorative marks. Required counts, folder headings, captions, input placeholders and node metadata use `--muted` or brighter, with at least 4.5:1 contrast against their actual surface. A zero impact/cycle count is neutral, never rose or green.

### Typography

- Text: `-apple-system, "SF Pro Text", system-ui, sans-serif` (deviation from the sheet's Public Sans — reason: macOS feel the owner asked for; same neutral weight class).
- Figures, paths, counts: JetBrains Mono, `font-variant-numeric: tabular-nums`, fixed decimals per metric (counts none, percents 1).
- Scale: top-bar wordmark 13/600 · pane titles 12/500 sentence case · body 13 · small 11–12 · inspector headline number 30/400 · node labels/metadata at least 11px mono. KPI captions and group labels are at least 11px. Weight ceiling 600. No tracked uppercase labels. Phone body/labels are 14px; sublines at least 12px.

### The selection rule (the style's one move)

Tabs and segmented options use a **1px `--accent` underline, exactly as wide as the label**, placed on the nearest existing rule. Explicit exceptions:

- Rail icon: full-height hairline at the rail's inner edge (vertical rail exception, per the icon-rail study).
- Selected file row: 1px left-edge line + `--raised` fill; no simultaneous underline.
- Selected canvas node: 1px accent border + 1px outer outline, no blur or glow.
- Primary action: **white fill with dark ink** (inversion primary; one per screen). Secondary: bordered ghost. Tertiary: plain text.
- Keyboard focus is independent of selection: a 2px white `:focus-visible` outline with 2px offset. Hover uses neutral `--raised`; toggles expose `aria-pressed`, tabs expose their selected state.

### Shell (top → bottom, left → right)

1. **Persistent shell:** the rail, top bar and status bar wrap the three sibling panes `viewExplorer`, `viewEvals`, `viewSpecs`. They are outside all three. `switchMainView()` hides only these panes; navigation/settings remain reachable in every view. **Icon rail, 46px**: fork mark at top; Dependency Map (default), Agent Evals, Docs & Rules; settings pinned bottom. Outline icons ~17px, tooltips + accessible names on all; groups split by hairlines.
2. **Top bar, 40px, no rule beneath** (the window ground continues): wordmark "Cartograph" 13/600 · native repo select quietly restyled (retain `repoPresetSelect` and custom-local gating) · grey freshness text · spacer · clickable `Commands` launcher with `⌘K` hint · ghost buttons `+ Add file`, `Export JSON` · primary **Open Folder** on Map. On Evals/Docs, Open Folder becomes ghost so the pane action is the only primary. Freshness uses an imported snapshot's valid `scannedAt`, or the actual local parse time; bundled samples say "Built-in sample", snapshots without a timestamp say "Snapshot loaded". Never hardcode "scanned today".
3. **Main row**: file browser 236px (`--surface`) · canvas (`--ground`, flex) · inspector 300px (`--surface`, collapsible via a small chevron affordance; collapsed state hides it and re-fits).
4. **Status bar, 26px, hairline above**, main content is enough — *replaces the old 36px metrics strip*: `16 files · 29 edges · 0 cycles · hotspot src/lib/db/supabase.ts · 11` in muted text with tabular figures; hotspot filename clickable (selects the hotspot, rose-tinted count); right side: zoom out / percentage / zoom in / Fit as plain text controls.

### Responsive shell

- **Above 1100px:** use the desktop widths above. The collapsed inspector has a persistent, labelled `Show inspector` button in the canvas toolbar; collapse/expand fits after the canvas resize. Preserve the selected inspector tab.
- **641–1100px (including 768):** replace the rail with a labelled navigation-menu button in a 48px top bar. Show the canvas full width by default; `Files` and `Inspector` buttons open one overlay sheet at a time, maximum 360px wide and viewport minus 32px. The navigation menu contains all three views, Settings and the repository select. Close sheets via their Close button, Escape or scrim; restore opener focus and preserve list scroll/selection. A user file selection closes Files and returns to the canvas; Inspector opens separately. Refit only when the actual canvas dimensions change, never while hidden.
- **640px and below (including 390):** same navigation menu and 48px bar; top bar has product name, menu and Commands only. Open Folder, Add file and Export remain in the menu/palette. Within Map, one 44px segmented row selects `Files | Map | Impact | Ask`; exactly one work region is visible. Files show a full-width list, Map shows the canvas, Impact and Ask show the corresponding inspector content full width. A user selection from a file row/chip opens Impact; internal agent focus keeps Ask visible. Switching back preserves file-list scroll and selection; fit after Map becomes visible. Do not require drag gestures: the list, chips and Fit/zoom buttons provide the selection/framing path. All touch targets are at least 44px; increase list pitch accordingly.
- Status on phone retains files/edges/cycles; hotspot and zoom actions remain in the palette. Evals become two-line case rows with all fields retained; Docs stack the document selector above its editor, with Copy/Sync/Download reachable. Settings label columns stack above controls. No page-level horizontal scroll.

### File browser (left, 236px)

- Filter field top: "Filter files, symbols… (⌘P)" — plain input, hairline border, no icon-clutter.
- Sort as a segmented control: `Blast radius | Folder tree` (replaces pill row + separate sort toggle).
- Rows 30px on desktop: mono filename left (ellipsis, full path in accessible name/title), impact count right in `--muted`; a nonzero hotspot count in `--rose`; selected row per the selection rule. Folder-tree mode remains `setFileSortMode('path')`: sort by full path, insert noninteractive folder headings; no new expandable tree state.
- The old layer-filter pills (All/DB & Core/Parser/Agent/Routes/UI) move into the **command palette** as actions ("Filter layer: …"). The file-browser heading names the active layer and offers `Clear filter` whenever it is not All. Group headings are 11px `--muted` sentence-case rows.

### Canvas (center)

- Flat well one step of ground (no dot grid, no vignette).
- Nodes: `--surface` hairline cards, mono label + second line (exports · dependents count, `--muted`, at least 11px). Border tint by live role: direct dependents rose, 2-hop amber, outbound/neutral undyed. Retain selected/hop1/hop2 precedence. Agent-visited nodes carry a mint secondary mark, not a replacement for their blast-radius role. Visited marks/active edges persist until the next agent query replaces them or the next graph load clears them; ordinary file selection does not clear them.
- Edges retain the parser's direction `source imports target`. Rose @ 0.35 when `edge.target === selected.path`; amber @ 0.30 when `selected.hop2Files` contains `edge.source` and `selected.hop1Files` contains `edge.target`; all other edges, including outbound imports, are neutral `#2a2a2e`. An agent-walk mark may add mint evidence without changing these classifications. Example `C → B → A`, selecting A: B and B→A are 1-hop/rose; C and C→B are 2-hop/amber. Selecting B makes B→A outbound/neutral and C→B incoming/rose. No new graph edges are inferred.
- No free-floating legend. Meaning now lives in the inspector's section headers ("Breaks at 1 hop · imports here") and the palette; if the builder finds canvas-only users lost, an empty-state caption ("Select a file to light up its blast radius") may appear in `--faint` 11px — nothing more.
- Overlay controls pinned top-right, one quiet row: Fit · Zoom out · Zoom in · Isolate · Simulate · Hide/Show inspector. Both layout choices move to the palette as `Graph layout: Layered map` (`dag`) and `Graph layout: Force graph` (`force`). No glass panel or shadow. Remove the drag-hint caption; put drag/scroll help in a palette Help action.

### Inspector (right, 300px; replaces the tag-named two-panel rail)

- Tab row: `Impact | Ask · Trace`, underline per selection rule, one 1px rule spanning the panel.
- **Impact tab** (order): mono path (the h1 of this screen) → computed headline, e.g. `11 / 16 files` (30/400, tabular) → caption, e.g. "in the 2-level blast radius (68.8%)" → hairline-split 3-KPI strip (values 16/400 over 11px labels: direct breaks / 2-hop cascade / outbound imports; rose, amber, plain; zero neutral) → grounded module explanation as quiet prose with clickable chips → "Breaks at 1 hop" rows (mono name + exact import line reference) → "Cascades at 2 hops" (clickable file and via-file provenance) → "Outbound imports" → **Source** collapsed by default, retaining Copy. Readable reference text uses the role color without low-opacity fading. Counts come from unique hop sets and actual outbound edges; percentages use one decimal. Examples are illustrative, never hardcoded.
- **Ask · Trace tab**: keeps the deterministic agent loop, preset questions as plain text buttons (no borders until hover), visible step-by-step tool trace with mono tool names, and the answer set in text with chips. The old self-description card ("Unlike a single-shot LLM prompt…") is deleted; that explanation stays in README/tooltips.
- Inspector header count badges ("Agent", hop badges) are plain grey tabular numbers, not green pills.

### Command palette (new, ⌘K) and quick file search (⌘P)

- Single overlay component (one `--surface` panel, 1px border, 12px radius, scrim `rgba(0,0,0,.5)`).
- Clickable Commands launcher or Meta/Ctrl+K opens Commands mode; Meta/Ctrl+P opens Files mode. A visible `Commands | Files` mode switch supports pointer/touch. Commands mode lists matching actions first, then matching files; Files mode lists files only. Empty Commands query shows all actions and the first matching files; empty Files query shows all files. File choices are drawn only from `state.graph.nodes` and ignore sidebar filters. They carry `data-filepath` and select through `selectFileNode` after switching to Map.
- Search is case-insensitive. Rank paths by exact full path, basename prefix, path substring, then ordered-character subsequence; break ties by full-path codepoint order. Actions match label substrings in registry order. Cap visible results at 50 and show match count. Recompute on input with no debounce/cache until measurement justifies one. Use the same ranking helper for palette modes; keep the sidebar's existing path/export substring search.
- Use one native modal `dialog`, labelled “Commands” or “Find file”. On open focus its combobox input; results have `role=listbox`, options have stable IDs, `aria-selected`, and input has `aria-controls`, `aria-expanded`, `aria-activedescendant`. Up/Down wraps among available options and scrolls the active row into view. Enter runs the active option; no results means no action and an announced “No results”. Escape closes. Tab/Shift+Tab remain within the dialog's input, mode switch, results and Close button; background is inert while open. Restore opener focus on dismissal, or the destination heading/control after an action. Ignore shortcuts during IME composition or when another modal is open. Only one modal/menu/sheet is open at a time; close the originating navigation sheet before opening another overlay.
- Registry maps to existing handlers: three view actions → `switchMainView`; six layer choices → `setLayerFilter('all|core|parser|agent|api|ui')`; two layouts → `setGraphLayout('dag|force')`; isolate/simulate → existing toggles; fit/zoom → `resetGraphView`/`zoomGraph`; export/open folder/add file/settings → existing handlers; file search → Files mode. Help states import-arrow direction and mouse drag/scroll controls. Show current layer/layout/toggle state in neutral text. Map actions switch to Map before operating; fit/layout require a nonempty graph, isolate/simulate require a valid selection. Disable unavailable actions with a reason; they cannot run by keyboard or pointer. View, upload, settings, export and search remain available with an empty graph.
- Put palette glue in `app/cartograph-app-shell.js`, using only global functions and properties under `state`; add no seventh script. Rewire removed button-ID consumers (`setGraphLayout`, layer/sort/view/tab setters, header metrics, eval badge) to surviving nodes and semantic states. Retain IDs still consumed; a retained function must not dereference a deleted element. Keep tool registry/spellings and script load order.

### Evals and Docs panes

- Rebuilt in the same tokens as full-pane screens: title row 26/600 with one grey sentence. Evals primary is `Run benchmark suite`; modes remain strict/naive. Keep case question, answer, verified citations, rejected-path diagnostics, groundedness, recall, real step count and pass/fail accessible. Use a case summary table with an expandable detail row containing answer/citations/trace evidence; phone rows retain all fields as sublines/details. Scores are plain 36/400 type, right-aligned tabular. Docs primary is `Download`, with secondary `Sync with current graph` and `Copy`; keep all three editable generated documents and preserve in-memory edits when switching documents. No zebra, header fill band or tinted KPI cards.
- All easter-egg copy ("Catching Confidently Wrong AI Outputs With a Number", "LangSmith-Style…") becomes one grey sentence: what the suite measures, nothing more.

### Modals, toasts, empty/error states

- Add-file modal and settings modal: same tokens and focus containment/restoration as the palette; settings uses a label column + panel, fields 40px, switches 28×16, one Save button with the shared 6px radius. Keep deterministic/Ollama/OpenAI-compatible engines, endpoint/model/key fields, saved settings and Cancel behavior. One grey sentence explains determinism. Add-file retains path + source paste and multiple-file upload.
- Toasts: small `--surface` row with 1px border, mono detail when relevant; success stays silent or a low-key check, rejections keep naming ungrounded paths (required by contract).
- Empty graph: clear the old selection/inspector/source, show a readable drop-target caption, print `0 files · 0 edges · 0 cycles`, and disable selection-dependent actions. Missing values print a dash. Evals show “Not run” and dashes until explicit Run; changing graph or mode clears the displayed run result. `renderEvalSuite` must not silently execute a fresh suite just to display a screen. Keep scoring functions in `lib/` unchanged. After a run, actual zero hallucinations prints `0`, not a dash.

## Alternatives considered during recovery review

| Option | Trade-off and decision |
| --- | --- |
| Simplify the existing stacked top navigation | Smallest markup change, but keeps several horizontal control bands competing with graph space. The approved mockup already moves view switching into a rail. |
| Persistent rail + split explorer + palette | Chosen: keeps the three views visible on desktop, preserves direct file/impact comparison, and reuses current handlers. Narrow screens require explicit pane switching as above. |
| Palette-only navigation | Saves more chrome, but hides the three main destinations and makes discovery depend on search. Retain the visible rail/menu and use the palette for secondary actions. |

These are the recovery review's comparisons, not newly claimed historical owner decisions. The recorded dark-only/data-terminal direction and mockup remain the design basis.

## Risks and mitigations

| Failure mode or limit | Mitigation and verification |
| --- | --- |
| Deleted markup leaves live DOM lookups | Inventory all ID consumers and inline handlers before edits; change each producer/consumer together. Browser console must stay clear through all views, layouts and modals. |
| Malformed filenames or source become markup/script | Use `textContent` or escaped HTML for labels/source. Use delegated `data-filepath` events instead of interpolating paths into inline JavaScript. Exercise spaces, quotes, ampersands, angle brackets and duplicate basenames. Grounded chips remain clickable. |
| Keyboard focus disappears behind overlays | One modal/sheet at a time, modal focus containment, initial/restored focus, announced result selection, visible focus. Test keyboard-only from all main views. |
| Fixed panes overflow narrow screens; fit runs on hidden canvas | Apply the explicit responsive contracts, preserve pane state, and fit only after a visible canvas has its real dimensions. Verify 1440/768/390, collapse/reopen and view return. |
| Large repositories block palette or graph work | Palette caps DOM results at 50; no new graph solver or search dependency. Existing force-layout all-pairs work remains a known limit. Do not promise large-graph performance from this chrome pass; use the layered layout by default. |
| Stale async LLM result targets a replaced graph | Associate a run with its graph reference; discard its completion if the graph has changed. Keep visible deterministic trace and existing synthesis validation; graph construction never invokes a model. |

Network behavior stays as documented in README (existing CDN styling/fonts/icons and optional user-selected synthesis endpoint). This redesign adds no backend, telemetry or network dependency.

## Constraints (repo rules the builder must not break)

1. **No build step, no deps.** Classic scripts, browser globals, `cartograph.html` owns load order. Keep the existing six scripts; palette glue stays in app-shell and panel rendering in ui-panels. Do not add a framework or generalized command system.
2. **Load-order invariant** (`app/README.md`): `PRESET_REPOS` then `state` must remain the only top-level `const`s; no IIFE/ESM conversion; inline `onclick` handlers must keep working or be re-wired deliberately.
3. **Parser/grounding contracts** (`CLAUDE.md` §2): graph edges only from `lib/`; every mentioned path is a chip with `data-filepath` and stays click-to-select; hop definitions unchanged; agent trace stays visible per step; ungrounded-path rejection toast stays.
4. **Contract tests** read `app/*.js` as text (tool-name spelling, `AGENT_TOOLS` presence): don't rename tools or move them; `node --test` must pass.
5. **Fit camera:** top/status bars are outside the canvas, so do not count their heights as internal padding. Calculate the world box from node card extents rather than centers alone, and use canvas-local padding `{top: 48, right: 16, bottom: 16, left: 16}` (toolbar occupies the top 32px). Draw/hit-test/fit must share card dimensions. Refit after pane/viewport/layout changes when visible; `lib/cartograph-fit.js` math itself is untouched and fit tests keep passing.
6. **Old globals stay:** `selectFileNode`, `renderInspectorPanel`, `switchMainView`, `switchRightPanelTab`, `setLayerFilter`, `setFileSortMode`, `setGraphLayout`, `toggleIsolateBlastRadius`, `toggleBreakSimulation`, `exportGraphSnapshot`, `openSettingsModal`, `openAddFileModal`, etc. — restyle their markup; don't orphan them. `switchMainView` keeps `explorer|evals|specs` ids switching via the rail instead of the top bar.
7. **Deliver canonical HTML first:** the page must still open by double-click (`cartograph.html`), and `lint.mjs`/`inspect.mjs --app` run on it into `.taste-skill/after/` with **0 FAIL** (before-state already capturable via `inspect.mjs --app --out .taste-skill/before`).

## Implementation boundaries

- Remaining local choices are spacing on a 4px base and private helper organization. Interaction, responsive behavior, action destinations and visited-state lifetime are decided above.
- Ask · Trace keeps each tool's exact name, args, output and clickable files before the answer. Plain mono trace rows and neutral numeric counts replace tinted cards. Chips are inline underlined buttons, not filled badge pills; retain `data-filepath` and full-path titles.
- Motion is feedback only, at most 200ms for press/hover/panel toggles; `prefers-reduced-motion` removes transitions. No entrance animation.
- Before implementation, write a file-by-file phased plan against this spec, including browser acceptance coverage. This design is not itself a detailed execution plan or proof that the redesign has shipped.

## Verification

1. `node --test` — full suite passes.
2. `node cli/cartograph-scan.mjs . --out /tmp/cartograph-scan.json` — unchanged behavior.
3. `node cli/cartograph-scan.mjs . --serve 4173` — the new chrome serves identically.
4. Browser acceptance at 1440/768/390: Map → Evals → Docs → Map; both layouts; every preset, folder/snapshot load, add/paste/upload, export; filter/clear/sort; inspector collapse/reopen; fit/zoom/isolate/simulate; node/chip selection; source Copy. Verify counts, edge predicates and grounded explanation against parsed data. Run agent question (full trace visible before synthesis; chips select files; visited marks visible); save/cancel settings; verify rejected/unreachable LLM behavior. Verify Evals initial/mode-change/graph-change “Not run”, then strict run → 100.0% groundedness and `0` hallucinations; naive run still exposes invalid paths. Docs edits survive document switching; Copy/Sync/Download work.
5. Keyboard acceptance: launch Commands/Files via pointer and Meta/Ctrl shortcuts from each view; mode switch, arrows, empty search Enter, Escape, Tab containment and focus restore; unavailable action cannot run; modal cannot stack with palette. Check long paths, unusual filename characters, no-match filter, and empty graph. Phone has a pointer path to every action, no clipped controls or sideways page scroll.
6. Design gate: from the repository root, use the installed skill tools (these are not repository-local scripts):

   ```sh
   rtk proxy node /Users/ayousr/.agents/skills/design-taste-frontend/scripts/lint.mjs cartograph.html app --app
   rtk proxy node /Users/ayousr/.agents/skills/design-taste-frontend/scripts/inspect.mjs cartograph.html --app --widths 1440,768,390 --out .taste-skill/after
   ```

   Capture the unchanged application into `.taste-skill/before` before code edits using the same inspector command with the alternate output directory. Require 0 FAIL after implementation; review screenshots against the app-screen rubric, maximum three visual fix rounds before reporting residual failures. The default inspector only measures the rendered starting state: repeat inspection for Evals, Docs, palette, settings and selected narrow-screen panes using browser-driven state setup; screenshots and click-throughs are separate evidence from `node --test`. SF body / JetBrains Mono is the explicit type override (`input.keep` contains `type`); check font application visually/computed styles, rather than claiming the skipped dealt-font check tested it. The design gate has not been run on an implemented redesign during this document review.

## References

- Reconstructed direction: `.taste-skill/direction.json` (data-terminal, seed 1049632490, `keep: type`); reprint with `rtk proxy node /Users/ayousr/.agents/skills/design-taste-frontend/scripts/draw.mjs --show`. Original conflicting JSON is retained under `.taste-skill/archive/`.
- Approved mockup: `.superpowers/brainstorm/61050-1793134801/content/data-terminal-v2.html` (owner-approved 2026-10-27).
- Style rules: `~/.agents/skills/design-taste-frontend/references/app-screens.md` (grounded in a 23-screen product study).
- HIG vocabulary used: Clarity/Deference/Depth; one primary action; segmented controls for 2–5 options; semantic color structure.
