# CONTEXT.md — Cartograph Local Architecture & Decisions

## Domain & Core Purpose
Cartograph Local is a deterministic codebase intelligence tool. Every edge, cycle, and blast radius calculation is computed from real parsed code imports—never guessed or summarized by an LLM.

## Active Initiative: Graph Layout Redesign

### Motivation
The existing canvas layout modes in `app/cartograph-graph-state.js` suffer from two fundamental flaws:
1. **DAG Mode is a pseudo-DAG**: It groups nodes into 5 static layer-bucket rows (`rankBuckets 0..4`) based on regex rules rather than actual topological dependency depth. Layers with many files stretch into excessively wide horizontal rows with overlapping edge crossings.
2. **Force Mode is collision-unaware**: It treats 192x48 rectangular cards as point masses in a 2D Coulomb-Hooke simulation, resulting in overlapping rectangular nodes and tangled card clumps.

### Proposed Architecture: Dual Optimized Modes
1. **Topological Hierarchy (Dependency Flow)**:
   - Real topological sorting (longest path from entry roots or dependency depth).
   - Card-aware horizontal or vertical layout with edge crossing minimization.
2. **Community Cluster (Architectural Map)**:
   - Force simulation with rectangular bounding-box collision detection (`AABB` push-apart).
   - Folder/directory-based gravitational clustering to group related modules in readable visual neighborhoods.

### Log of Architectural Decisions (ADRs)

#### ADR-001: Graph Layout Engine Redesign
- **Status:** Accepted & Prototyped (2026-10-29)
- **Decisions:**
  1. **Dual-Direction Topological Hierarchy (DAG)**:
     - Compute real topological dependency ranks based on longest path from entry nodes (or depth from leaf modules).
     - Support both **Left-to-Right (`lr`)** (horizontal pipeline, optimal for widescreen 16:9 monitors and 192×48 text cards) and **Top-to-Bottom (`tb`)** (classic downward tree hierarchy).
  2. **Community Directory Clustering with Rigid Box Collision (Cluster)**:
     - Group nodes by filesystem directory (`app/`, `lib/`, `test/`, etc.) with soft cluster centroids/attractors and edge springs.
     - Enforce rigid Axis-Aligned Bounding Box (AABB) separation so 192×48 rectangular cards cannot overlap under any circumstances.
  3. **Visual Prototype Detour**:
     - Followed the `/prototype` pattern (Sub-shape A: on the existing canvas page via `?variant=` and a floating prototype switcher) to visually verify card spacing, edge routing, and viewport fit.

#### ADR-002: EGM Review Outcome & Layout Engine Seam
- **Status:** Implemented (2026-10-29)
- **EGM Review Findings Remediated:**
  1. **Architecture Seam**: Extracted pure mathematical layout algorithms into [`lib/cartograph-layouts.js`](lib/cartograph-layouts.js) (zero-dependency UMD module), separating math from DOM controller `app/cartograph-prototype-layouts.js`.
  2. **Cycle Safety**: Implemented DFS back-edge filtering in `computeTopologicalRanks` to eliminate rank inflation/explosion on cyclic imports.
  3. **AABB 2D Collision Fix**: Replaced naive coordinate diff with dimensional normalization `(px / 216) <= (py / 68)`, ensuring collisions resolve along the true axis of minimum penetration.
  4. **Directory Extraction**: Added `getEffectiveDirectory()` to strip root `src/` prefixes, correctly resolving Next.js and nested projects into distinct visual neighborhoods (`app`, `lib`, `test`, `cli`).
  5. **Barycenter Crossing Minimization**: Implemented multi-pass (forward + backward + forward) sweeps with deterministic Rank 0 tie-breaking.
  6. **Automated Verification**: Added [`test/layouts.test.js`](test/layouts.test.js) (4 new tests; 105/105 suite pass) proving determinism, cycle safety, and zero card overlaps across all preset repos.

#### ADR-003: Production Layout Toggling & Canvas Visual Wayfinding
- **Status:** Implemented (2026-10-29)
- **Decisions:**
  1. **Seamless In-App Toggle**:
     - Added `#btnToggleLayout` directly to `#canvasToolbar` cycling through `Pipeline (LR)`, `Tree (TB)`, and `Cluster`.
     - Integrated `CartographLayouts` directly into `app/cartograph-graph-state.js` and registered routes in Command Palette (`⌘K`).
  2. **Canvas Wayfinding Upgrades to Eliminate Disorientation**:
     - **Spatial Dot Grid**: Subtle 36px world-space dot grid (`#202024`) anchors panning, zooming, and scale.
     - **Card Layer Accent Bars**: Color-coded 3.5px vertical left borders for architectural layers allowing instant recognition.
     - **Interactive Hover Flashlight**: Hovering over any file highlights all its incoming callers (crimson/rose) and outgoing dependencies (sky cyan) with smooth cubic Bézier curves, while gently dimming unrelated files.
     - **Stage Headers in Pipeline Mode**: Subtle column headers (`ENTRY POINTS`, `STAGE 1`, `FOUNDATION & DB`) clarify caller-callee flow.
     - **Directory Watermark Hulls in Cluster Mode**: Soft translucent rounded containers labeled `📁 app/`, `📁 lib/`, `📁 test/` make folder neighborhoods immediately visible.

#### ADR-004: Formal EGM Review Audit & Full Production Remediation
- **Status:** Implemented (2026-10-29)
- **Reviewers:** Parallel fresh-context subagents (Design Critic `fa4e508d` & Structural Critic `642be472`).
- **Reports:** Preserved in [`docs/superpowers/reviews/2026-10-29-layout-redesign/`](docs/superpowers/reviews/2026-10-29-layout-redesign/).
- **Key Remediations:**
  1. **D1 (Sticky Hover Leak)**: Added `canvas.mouseleave` and outside-canvas mousemove clearing to ensure flashlight dimming reliably deactivates.
  2. **D2 (WCAG Contrast)**: Raised stage headers to `#94a3b8` (5.8:1), subtitles to `#a1a1aa` (7.0:1), and default edges to `#3f3f46` (3.1:1).
  3. **D3 / S1 (Bézier Geometry & Arrival Tangents)**: Branched curve routing per mode (horizontal for LR, vertical for TB, linear for Cluster) and calculated true arrival tangent angle atan2(dy, dx) for arrowhead orientation.
  4. **D5 (Stage Guides)**: Grouped guides strictly by topological integer rank (`n.rank`) rather than mutable screen coordinates.
  5. **D6 / D9 (Accessibility & Keyboard)**: Added `role="region" aria-label="..."` on canvas, `aria-live="polite"` on the layout toggle button, and global keyboard shortcuts (Arrow keys pan, `+`/`-` zoom, `f`/`0` fit).
  6. **D7 / S3 (Performance & GC Pressure)**: Batched the dot grid into a single path call and cached `nodeMap` and `basenameCount` on `state.graph`.
  7. **D8 (Basename Ambiguity)**: Disambiguated duplicate basenames with parent folder prefixes.
  8. **D10 (Palette Separation)**: Re-assigned DB & Core layer color to Indigo (`#6366f1`), reserving Cyan (`#38bdf8`) exclusively for interactive outbound hover links.
  9. **S2 (Command Palette)**: Synchronized `⌘K` palette with `dag-lr`, `dag-tb`, and `cluster`.
  10. **S6 (Documentation Alignment)**: Updated [`lib/README.md`](lib/README.md) (5 shared modules) and [`test/README.md`](test/README.md) (105 tests across 10 suites).
- **Verification:** 105/105 tests passing, zero card overlaps across all preset topologies, and verified live in Orca browser.

#### ADR-005: Deep Modular Architecture & Encapsulated Seams
- **Status:** Accepted & Implemented (2026-10-29)
- **Motivation:**
  Following the architectural survey of shallow modules and leaked seams across lib/, app/, and cli/, four architectural deepening opportunities were identified and orchestrated into production.
- **Architectural Seams Implemented:**
  1. **Candidate 3: Pluggable Agent Model Client Seam (`lib/cartograph-agent.js`)**:
     - Extracted inline HTTP fetch, chat schema formatting, Bearer authentication, and dual-format response unmarshaling (Ollama `data.message.content` and OpenAI `data.choices[0].message.content`) behind `createModelClient(config, customFetch)`.
     - Introduced `queryAgent(question, graph, options)` which orchestrates the deterministic planner, queries the model client, validates citations against the AST trace via `validateSynthesis`, and returns a verified grounded answer or safe deterministic fallback.
     - Fully testable in pure Node.js without browser DOM mocks.
  2. **Candidate 2: Unified Repository Ingestion Pipeline (`lib/cartograph-intake.js`)**:
     - Deepened `CartographIntake` beyond basic path classification to encapsulate snapshot discrimination (`parseSnapshot`), common-root path detection and stripping (`detectSharedRoot`), and intake session state tracking (`createIntakeSession`).
     - Consolidated duplicate file handling, skip reasoning, and excluded-directory collapsing into a reusable domain object shared by CLI and browser.
  3. **Candidate 1: Encapsulated Application & Graph Store (`app/cartograph-graph-state.js`)**:
     - Encapsulated reactive state behind `CartographStore` (`createGraphStore`) with explicit action dispatchers (`loadGraph`, `setLayout`, `setFilter`, `setSimulation`, `updateCamera`, `fit`) and subscriber notifications (`subscribe`).
     - Removed 100+ lines of dead, unconstrained legacy force simulation code that had been superseded by `CartographLayouts`.
     - Preserved backwards-compatible `state` property access for existing harnesses and components.
  4. **Candidate 4: Unified Navigation & Selection Coordinator (`app/cartograph-app-shell.js`)**:
     - Introduced `CartographNavigation` coordinator (`navigateTo(path, options)` and `centerOnNode(path)`) unifying all 7 file selection triggers across the UI (canvas cards, inline citations, command palette, hotspot alerts, and agent queries).
     - Centralizes responsive mobile sheet switching, viewport camera centering, overlay dismissal, and accessible DOM focus arbitration with raw codepoint comparison.
- **Verification:**
  - 110/110 tests passing across all 10 suites (`node --test`).
  - Deterministic CLI scan verified (`node cli/cartograph-scan.mjs . --out /tmp/cartograph-scan.json`).
  - Real-browser live UI reactivity verified in Orca browser.#### ADR-006: CartographGraph Encapsulated Deep Query Facade
- **Status:** Accepted & Implemented (2026-10-29)
- **Motivation:**
  `lib/cartograph-parser.js` previously functioned as a procedural record builder that emitted raw arrays (`nodes`, `edges`, `cycles`, `unresolved`). Downstream consumers (`cli/cartograph-scan.mjs`, `lib/cartograph-agent.js`, `lib/cartograph-evals.js`, and `app/cartograph-graph-state.js`) repeatedly reimplemented ad-hoc graph traversals, O(N) array scans for node lookups, and manual hotspot sorting. This leaked graph querying logic across multiple layers.
- **Architectural Seams Implemented:**
  1. **Encapsulated `CartographGraph` (`lib/cartograph-parser.js`)**:
     - Introduced `createGraph(graphData)` facade returned directly by `CartographParser.parseRepository(files, options)`.
     - Maintains 100% backward compatibility for all property accesses (`.nodes`, `.edges`, `.cycles`, `.unresolved`, `.name`, `.description`).
     - Provides O(1) indexed lookups: `getNode(path)` and `hasNode(path)`.
     - Encapsulates domain graph queries:
       - `getTopHubs(count = 10)`: Pre-sorted ranking of blast-radius hotspots.
       - `getBlastRadius(path)`: Canonical 2-hop impact computation returning 1-hop callers, 2-hop transitive callers, outbound imports, and total impact.
       - `getAuthNodes()`: Discovers authentication, session, and cryptographic guardrail nodes.
       - `findExplicitNode(query)`: Locates nodes explicitly mentioned in natural language questions.
       - `getLayers()` & `getNodesInLayer(layer)`: Partitioned layer queries.
       - `filterByQuery(query)`: Multi-token filtering over paths and exports.
       - `hasCycles()`: Fast boolean cycle predicate.
       - `getSummary()`: High-level architectural metrics.
       - `exportSnapshot()`: Serializes clean snapshot format.
  2. **Consumer Adoption**:
     - **CLI Scanner (`cli/cartograph-scan.mjs`)**: Uses `graph.getTopHubs(args.top)` and `graph.getNode(focusFile)` for hotspot reports.
     - **Agent Engine (`lib/cartograph-agent.js`)**: Uses `graph.getAuthNodes()`, `graph.getTopHubs()`, and `graph.findExplicitNode()` for deterministic plan routing and cycle analysis.
     - **Evaluation Suite (`lib/cartograph-evals.js`)**: Uses `graph.getTopHubs(1)[0]`, `graph.getAuthNodes()`, `graph.getNodesInLayer()`, and O(1) `graph.hasNode(path)` during benchmark scoring.
- **Verification:**
  - 122/122 tests passing across all suites (`node --test`).
  - Automated headless Playwright end-to-end browser suite passed with 0 console errors, 100% groundedness, and 100% recall.

#### ADR-007: Encapsulated Spatial Camera & Viewport Frustum Model
- **Status:** Implemented (2026-10-29)
- **Motivation:**
  `lib/cartograph-fit.js` previously exposed only stateless projection functions that took loose camera objects `{ x, y, zoom }`. Callers were forced to handle coordinate clamping, zoom state tracking, and had no standard way to determine visible world bounds or perform viewport culling.
- **Architectural Seams Implemented:**
  - `CartographCamera.createCamera(initialState)`: Returns an encapsulated stateful camera instance.
  - Spatial Queries:
    - `getVisibleWorldBox(viewWidth, viewHeight, margin)`: Calculates the exact world-space bounding box visible in the current viewport.
    - `isNodeVisible(node, viewWidth, viewHeight, margin)`: High-performance frustum culling predicate.
    - `isBoxVisible(box, viewWidth, viewHeight, margin)`: AABB visibility test.
  - Stateful Mutators: `zoomAt(screenPt, factor)`, `panBy(dx, dy)`, `centerOnNode(node, w, h)`, `fitToNodes(nodes, w, h, pad)`, `fitToBox(box, w, h, pad)`.
  - 100% backward compatibility for all static functions (`CartographCamera.toWorld`, `CartographCamera.toScreen`, `CartographFit.computeFitCamera`).

#### ADR-008: Decoupled Render Math & Geometric Engine
- **Status:** Implemented (2026-10-29)
- **Motivation:**
  Visual rendering logic in `app/cartograph-canvas-render.js` combined HTML5 Canvas context painting with geometric algorithms (card boundary intersection math, layout-dependent Bézier curve control points, arrival tangent trigonometry, dot grid alignment, cluster hulls, and pipeline stage guides). This prevented unit testing of rendering geometry in Node.js test suites.
- **Architectural Seams Implemented:**
  - Extracted `lib/cartograph-render-math.js` as the 6th shared, zero-dependency UMD module:
    - `computeCardEndpoint(node, other)`: Calculates card border intersection points for 192x48 cards.
    - `computeEdgeGeometry(sourceNode, targetNode, layoutMode)`: Routes cubic Béziers in `dag-lr` and `dag-tb` modes with tangent control points and arrival angles, or straight lines in `cluster` mode.
    - `computeArrowheadPoints(end, arrivalAngle, arrowLength, arrowAngle)`: Computes exact arrowhead polygon coordinates.
    - `computeDotGridBounds(camera, viewWidth, viewHeight, dotSpacing)`: Derives aligned world-space grid bounds.
    - `computeClusterHulls(nodes, getDirectoryFn, pad)`: Computes bounding boxes and labels for directory neighborhoods.
    - `computePipelineGuides(nodes, layoutMode, spacing)`: Computes column and row guides with topological labels.
    - `disambiguateNodeLabels(nodes)`: Pre-computes collision-free labels with parent directory prefixes.
  - `app/cartograph-canvas-render.js` adopts `CartographRenderMath` for all geometric calculations while caching label and node maps on `state.graph` to eliminate 60fps GC pressure.
- **Verification:**
  - 130/130 unit tests passing across all 11 test suites (`node --test`).

#### ADR-009: Observability, Grounding Provenance & Inspector Workflow Upgrades
- **Status:** Implemented & EGM Verified (2026-10-29)
- **Motivation:**
  Following the layout and math decoupling, user workflows required three critical enhancements:
  1. **Inspector Panel**: Turning a passive file summary into an active workspace hub with quick actions (one-click Ask Agent, Viewport Centering, Contract Breaking Simulation, Path Copying) and circular dependency entanglement awareness.
  2. **Agent Tool Trace**: Surfacing granular AST exploration steps with semantic badges (Symbol Search, AST Inspection, Dependent Walk, Path Trace, Entry Points, Cycles & Hubs) and GitHub Markdown export.
  3. **Benchmark Evals**: Rigorous evaluation suite controls (expand/collapse all, JSON audit report export), disambiguated failure modes (incomplete recall vs. unproven vs. hallucinated), and visual breakdown of missed expected blast-radius citations.
- **Architectural Seams & Remediation (EGM Guided)**:
  1. **Inspector Hub (`cartograph.html`, `app/cartograph-ui-panels.js`, `app/cartograph-canvas-render.js`)**:
     - Quick Action Toolbar in 2x2 grid layout with semantic Lucide icons.
     - Global synchronization of break simulation via `syncCanvasToggleState()`, eliminating divergent state between canvas toolbar, alert banner, and inspector.
     - Defensive empty state: Disables buttons and hides metadata when no file is selected.
     - Circular dependency warning badge (`↺ Cycle (N files)`).
  2. **Agent Observability (`app/cartograph-agent-evals.js`)**:
     - `TOOL_META` mapping 6 AST handlers to distinct semantic palettes.
     - WCAG AA compliant typography (upgraded monospace arguments from 10px text-slate-500 to text-xs text-slate-400 with 7.7:1 contrast).
     - Markdown Exporter (`copyAgentRunMarkdown`) capturing question, tool step badges, arguments, outputs, discovered files, and answer via shared `copyTextSafe()`.
  3. **Evaluation Rigor (`app/cartograph-agent-evals.js`, `lib/cartograph-evals.js`)**:
     - Dual-encoded pass/fail pills disambiguating `incomplete recall` from `unproven` and `hallucinated`.
     - Full compliance with CLAUDE.md Invariant 2 (*Strict Grounding Contract*): unproven file paths are rendered as interactive, clickable badges (`data-filepath="..."`).
     - Visual audit of missed expected citations in failed recall cases.
     - Safe JSON report export with DOM body attachment and deferred `URL.revokeObjectURL`.
- **Verification**:
  - 132/132 tests passing across all 11 test suites (`node --test`).
  - Headless Playwright suite verified with 0 page errors and 0 console errors.

#### ADR-010: Folder Focus & Macro Zoom Level-of-Detail (LOD)
- **Status:** Implemented (2026-10-29)
- **Motivation:**
  In medium-to-large repositories (50–300+ files), rendering the entire codebase at once scales the canvas camera down to `zoom < 0.45` (often 0.15–0.25). At this zoom distance, standard 11px font sizes shrank to micro-text (1.6px–2.5px screen space), making node cards illegible specks. Additionally, users navigating complex directories (e.g., `auth-profile-web`, `src/core`) lacked a way to isolate and frame specific folder subtrees directly from the file browser.
- **Architectural Seams Implemented:**
  1. **Folder Focus State & Camera Subsets (`app/cartograph-graph-state.js`, `app/cartograph-ui-panels.js`)**:
     - Introduced `state.folderFilter` (null or target folder path) alongside `state.layerFilter`.
     - `focusFolder(folder)`: Frames the camera directly onto matching direct and nested nodes via `CartographCamera.fitToNodes()`, updates sidebar state, and dispatches toasts. Calling `focusFolder` on an already-focused folder toggles it off.
     - `clearFolderFocus()` & `clearAllBrowserFilters()`: Resets filters and refits camera to the full graph or active layer.
     - `fitGraphToCanvas()`: Automatically computes camera viewports for folder subsets, layer subsets, or their intersection when active.
  2. **Interactive Folder Tree Navigation (`app/cartograph-ui-panels.js`, `cartograph.html`)**:
     - Upgraded folder headings in Folder Tree mode (`state.fileSortMode === 'path'`) from static text into interactive folder hubs with folder icons (`folder`/`folder-open`), file counts `(N)`, and dedicated `[Focus]` / `[Focused ✕]` action pills.
     - Active focus visually emphasizes the folder row (`.folder-heading-focused`) and surfaces active folder status with a `Clear focus` button in the sidebar heading (`#activeLayerName`, `#clearLayerFilter`).
     - Command Palette (`⌘K` / `⌘P`) integration: Added `clear-folder-focus` and dynamic `focus-folder-*` actions for instant keyboard navigation across all directories.
  3. **Macro Zoom Level-of-Detail (LOD) Engine (`app/cartograph-canvas-render.js`)**:
     - When `zoom < 0.45`, node cards switch to Semantic Zoom: the primary file title is centered vertically with a balanced 12px bold font that fits 20+ characters without truncation, while suppressing secondary metadata to eliminate overlapping micro-text.
     - Folder focus dimming: Dims non-focused nodes (`alpha = 0.15`) and edges (`alpha = 0.16`), highlighting focused folder nodes and cluster hulls with Sky Blue borders (`#38bdf8`) rather than amber, completely preserving amber/rose semantics for Hop-2/Hop-1 blast-radius risk.
     - Directory cluster hulls are activated in cluster mode with delimiter-checked directory matching and top-left anchored watermarks.
  4. **Un-hidden Layer Filter Pills & Safe Seams (`cartograph.html`, `app/cartograph-app-shell.js`, `app/cartograph-ui-panels.js`)**:
     - Restored the quiet-shell layer filter row (`#layerFilterContainer`) in a 3-column grid (`All`, `DB`, `Parser`, `Agent`, `Routes`, `UI`).
     - Event delegation for folder focus (`data-folder-focus` and `data-folder-clear`), preventing any inline JS quotation / syntax error crashes on paths containing quotes or apostrophes.
     - Lifecycle hygiene: `applyParsedGraph()` resets `state.folderFilter = null` on repository switch, preventing ghost canvas dimming.
     - Palette safety: core utility actions (`Export`, `Settings`, `Help`) are registered before dynamic folders, preventing action starvation in large codebases.
- **Verification & EGM Review**:
  - Independent parallel EGM review passed with Design Critic (`880cb9d3-ae6f-4e75-927f-117c4e85e16b`) and Structural Critic (`bc5d8c6c-3440-4705-8744-f49ab3b544c0`).
  - 133/133 unit tests passing across all test suites (`node --test`).
  - Automated Playwright end-to-end browser test verified on live server `http://localhost:4173/` with 0 console errors and 0 exceptions.




