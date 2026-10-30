# PROJECT.md — cartograph-local-project (Architecture & Context Spec)

## 1. What This Repository Is
Deterministic scan of /Users/ayousr/.codex/worktrees/quiet-shell-redesign/cartograph-local-project
- **Parsed Source Files**: 39
- **Verified Internal Import Edges**: 28
- **Circular Dependencies**: 0

## 2. Architectural Layers (Verified by AST Parser)
- **UI & Entry** (0 files): None
- **API & Auth** (0 files): None
- **Agent & Evals** (0 files): None
- **Parser Engine** (0 files): None
- **DB & Core** (39 files): `app/cartograph-agent-evals.js`, `app/cartograph-app-shell.js`, `app/cartograph-canvas-render.js`, `app/cartograph-graph-state.js`, `app/cartograph-preset-repos.js`, `app/cartograph-ui-panels.js`, `cli/cartograph-scan.mjs`, `lib/cartograph-agent.js`, `lib/cartograph-canvas-pipeline.js`, `lib/cartograph-evals.js`, `lib/cartograph-fit.js`, `lib/cartograph-intake.js`, `lib/cartograph-layouts.js`, `lib/cartograph-palette.js`, `lib/cartograph-parser.js`, `lib/cartograph-render-math.js`, `lib/cartograph-shell-coordinator.js`, `lib/cartograph-specs.js`, `lib/cartograph-view-model.js`, `package.json`, `test/agent.test.js`, `test/camera.test.js`, `test/canvas-pipeline.test.js`, `test/evals-ui.test.js`, `test/evals.test.js`, `test/fit.test.js`, `test/intake.test.js`, `test/layouts.test.js`, `test/navigation.test.js`, `test/palette.test.js`, `test/parser.test.js`, `test/render-math.test.js`, `test/replacement.test.js`, `test/shell-coordinator.test.js`, `test/specs.test.js`, `test/store.test.js`, `test/student-features.test.js`, `test/ui.test.js`, `test/view-model.test.js`

## 3. High-Blast-Radius Hotspots (Check Before Modifying!)
Changing the exported signatures of these modules will break the largest number of downstream files:
- `lib/cartograph-parser.js` — **6 total dependents** (6 direct 1-hop, 0 transitive 2-hop) • Exports: `cartograph-parser`
- `lib/cartograph-agent.js` — **3 total dependents** (3 direct 1-hop, 0 transitive 2-hop) • Exports: `cartograph-agent`
- `lib/cartograph-render-math.js` — **3 total dependents** (2 direct 1-hop, 1 transitive 2-hop) • Exports: `cartograph-render-math`
- `lib/cartograph-fit.js` — **2 total dependents** (2 direct 1-hop, 0 transitive 2-hop) • Exports: `cartograph-fit`
- `lib/cartograph-intake.js` — **2 total dependents** (2 direct 1-hop, 0 transitive 2-hop) • Exports: `cartograph-intake`

## 4. What We Refuse To Do (Non-Goals & Reasons)
- **No Unverified AI Connections**: Every dependency edge must come from parsing real source imports. A dependency map that is 90% right is worse than no map at all because engineers cannot tell which 10% is hallucinated.
- **No Arbitrary Health Grades**: Never invent subjective "Code Quality Scores". Report only deterministic in-degree, out-degree, 2-hop blast radius counts, and circular dependency cycles.
- **No Silent Alias Fallbacks**: Always resolve `@/`, `./`, `../`, and barrel `index` files deterministically so edges never disappear silently.
