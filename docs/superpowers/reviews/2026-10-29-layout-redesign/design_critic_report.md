# EGM Stage 7 Design Critic Audit: Layout & Visual Wayfinding

**Target Scope:**
- `app/cartograph-canvas-render.js` (Canvas rendering pipeline, dot grid, layer accents, stage column guides, hover flashlight, Bézier curves, layout toggling)
- `cartograph.html` (Canvas toolbar layout toggle button `#btnToggleLayout`, layout controls)
- `CONTEXT.md` (ADR-001, ADR-002, ADR-003)

---

## Executive Summary

Cartograph Local's layout redesign represents a major architectural improvement over the previous point-mass force simulation and regex-bucket DAG. The extraction of mathematical layout algorithms into `lib/cartograph-layouts.js` (ADR-002), rigid AABB collision resolution, and the introduction of Left-to-Right (LR), Top-to-Bottom (TB), and Directory Cluster modes establish a solid technical foundation.

However, a rigorous design and ergonomics review across visual wayfinding, color contrast, interaction physics, and accessibility reveals **1 Critical**, **5 Material**, and **4 Minor** defects. Most prominently:
1. **Severe WCAG Contrast Failures**: The stage column guides (`#475569`, 2.46:1 contrast), card subtitles (`#71717a`, 3.81:1 contrast), and default dependency edges (`#2b2b32`, 1.34:1 contrast) fail WCAG 2.1 AA and graphical contrast standards. Default cards are virtually borderless against the canvas (`#242428` on `#141416`, 1.19:1 contrast).
2. **Sticky Hover Flashlight Leak**: Pointer tracking on `mousemove` fails to clear `state.hoveredFile` when moving over the toolbar, inspector, or sidebar, leaving the canvas locked in a permanently dimmed state.
3. **Bézier Tangent & Directional Mismatch**: Arrowheads are rotated to the straight-line secant angle rather than the curve's arrival tangent, creating a broken kink at destination cards; moreover, horizontal control points are hardcoded, causing awkward S-curves on vertical edges in Tree (TB) mode.
4. **Wayfinding Fragility**: Dragging a card in LR mode dynamically spawns phantom stage columns and renumbers headers; cluster watermarks use bounding boxes that swallow foreign nodes; and file cards strip directory prefixes, rendering identically-named files indistinguishable.

---

## Findings Matrix

| ID | Title | Severity | Area | Target Lines |
|---|---|---|---|---|
| **D1** | Sticky Hover Flashlight Leak on Toolbar / Sidebar Boundary Crossing | **Material** | Interaction Ergonomics | `app/cartograph-canvas-render.js:351-370` |
| **D2** | Stage Headers, Subtitles, Edges, and Card Borders Fail WCAG Contrast Standards | **Critical** | Color Contrast & Accessibility | `app/cartograph-canvas-render.js:23, 33, 83, 116, 141, 222, 287` |
| **D3** | Bézier Edge Arrowhead Angle Misalignment and TB Mode S-Curve Kinking | **Material** | Interaction Ergonomics / Visual Readability | `app/cartograph-canvas-render.js:174-191` |
| **D4** | Directory Cluster Watermarks Form Spurious Bounding Boxes Swallowing Foreign Nodes | **Material** | Visual Wayfinding | `app/cartograph-canvas-render.js:54-89` |
| **D5** | LR Stage Column Guides are Fragile, Viewport-Unpinned, and Absent in TB Mode | **Material** | Visual Wayfinding / Information Hierarchy | `app/cartograph-canvas-render.js:91-123` |
| **D6** | Canvas Lacks Keyboard Operability and Assistive Technology Accessibility | **Material** | Accessibility | `cartograph.html:174`, `app/cartograph-canvas-render.js:312-393` |
| **D7** | Dot Grid World-Space Scaling Aliasing and Unthrottled 60 FPS Loop | **Minor** | Visual Ergonomics / Performance | `app/cartograph-canvas-render.js:26-38, 301-310` |
| **D8** | Node Cards Strip Directory Prefixes Leaving Identical Basenames Ambiguous | **Minor** | Information Hierarchy | `app/cartograph-canvas-render.js:273-285` |
| **D9** | Cyclic Toolbar Layout Button Lacks ARIA Affordance and Mobile Resiliency | **Minor** | Interaction Ergonomics | `cartograph.html:161`, `app/cartograph-canvas-render.js:411-452` |
| **D10** | Semantic Color Collision Between DB Layer and Hover Outbound Highlighting | **Minor** | Visual Wayfinding | `app/cartograph-canvas-render.js:146, 254`, `app/cartograph-graph-state.js:50-55` |

---

## Detailed Audit Findings

### D1. Sticky Hover Flashlight Leak on Toolbar / Sidebar Boundary Crossing
- **Severity**: Material
- **Area**: Interaction Ergonomics
- **Target File**: `app/cartograph-canvas-render.js:351-370`
- **Description**:
  The interactive hover flashlight (`hoveredFile`) dims all unrelated nodes to 0.25 opacity and edges to 0.10 opacity while highlighting inbound callers (rose) and outbound imports (cyan).
  In `initCanvasInteractions()`, hover detection is implemented inside a global `window.addEventListener('mousemove', ...)` handler:
  ```javascript
  if (e.target === canvas) {
    const world = screenToWorld(e.clientX, e.clientY);
    const hit = findNodeAt(world.x, world.y);
    state.hoveredFile = hit ? hit.path : null;
    canvas.style.cursor = hit ? 'pointer' : 'grab';
  }
  ```
  When the cursor leaves a node and moves directly over `#canvasToolbar` (which sits at `z-index: 20` directly over the canvas) to click *Fit*, *Pipeline*, or *Isolate*, or moves left into the file browser (`#fileBrowser`) or right into `#inspectorRegion`, `e.target` is no longer `canvas`. There is no `else` clause and no `canvas.addEventListener('mouseleave')`.
- **Impact**:
  `state.hoveredFile` remains permanently set to the last hovered file. The entire graph stays frozen in the dimmed, high-contrast flashlight state while the user interacts with menus, search inputs, or toolbar controls. The user must manually move the cursor back over empty canvas space to clear the hover effect. On touch devices, a single tap permanently engages this state without any exit path.
- **Remediation**:
  1. Add an `else` branch or a `canvas.addEventListener('mouseleave')` that explicitly sets `state.hoveredFile = null; canvas.style.cursor = 'grab';`.
  2. In `screenToWorld()`, verify that the pointer is within canvas bounds, resetting `state.hoveredFile` whenever the pointer leaves the canvas viewport.

---

### D2. Stage Headers, Subtitles, Edges, and Card Borders Fail WCAG Contrast Standards
- **Severity**: Critical
- **Area**: Color Contrast & Accessibility
- **Target File**: `app/cartograph-canvas-render.js:23, 33, 83, 116, 141, 222, 287`
- **Description & Mathematical Evaluation**:
  All canvas elements are rendered over background `#141416` (relative luminance L1 = 0.0071). Calculating contrast ratios via WCAG 2.1 formula `(L_high + 0.05) / (L_low + 0.05)`:

  1. **Stage Column Headers (`#475569` on `#141416`)**:
     - Font: `600 10px "JetBrains Mono"` (lines 116-117)
     - Luminance of `#475569`: L = 0.0903
     - Contrast Ratio: `(0.0903 + 0.05) / (0.0071 + 0.05) = 2.46 : 1`
     - **Result: FAILS WCAG 1.4.3 AA** (requires 4.5:1 for normal text < 18pt / 14pt bold). At 10px, 2.46:1 is virtually invisible under normal office lighting.
  2. **Card Subtitles (`#71717a` on card `#141417`)**:
     - Font: `400 10px "JetBrains Mono"` (lines 287-289)
     - Luminance of `#71717a`: L = 0.1678
     - Contrast Ratio: `(0.1678 + 0.05) / (0.0071 + 0.05) = 3.81 : 1`
     - **Result: FAILS WCAG 1.4.3 AA** (requires 4.5:1).
  3. **Cluster Hull Titles (`#64748b` on `#141416`)**:
     - Font: `600 11px "JetBrains Mono"` (lines 83-85)
     - Luminance of `#64748b`: L = 0.1711
     - Contrast Ratio: `(0.1711 + 0.05) / (0.0071 + 0.05) = 3.87 : 1`
     - **Result: FAILS WCAG 1.4.3 AA** (requires 4.5:1).
  4. **Default Dependency Edges (`#2b2b32` on `#141416`)**:
     - Line width: 1px (lines 141-142)
     - Luminance of `#2b2b32`: L = 0.0263
     - Contrast Ratio: `(0.0263 + 0.05) / (0.0071 + 0.05) = 1.34 : 1`
     - **Result: FAILS WCAG 1.4.11 Non-text Contrast** (requires 3:1 for user interface components and graphical objects). Dependency lines at rest appear nearly invisible; files look like unlinked floating boxes.
  5. **Card Boundary Stroke (`#242428` on canvas `#141416`)**:
     - Card stroke width: 1px (line 222)
     - Luminance of `#242428`: L = 0.0179
     - Contrast Ratio: `(0.0179 + 0.05) / (0.0071 + 0.05) = 1.19 : 1`
     - **Result: FAILS WCAG 1.4.11** (requires 3:1). Cards have no perceptible container edge against the canvas background; only the 3.5px accent bar on the left edge indicates where the card begins.
  6. **Over-Aggressive Dimming on Hover (`nodeAlpha = 0.25`, `edgeAlpha = 0.10`)**:
     - Dimming non-hovered nodes to 0.25 drops subtitle contrast to ~1.2:1 and white labels to ~4:1. Dimmed edges at 0.10 alpha drop contrast below 1.05:1, entirely destroying the mental map of the rest of the codebase.
- **Remediation**:
  - Boost Stage Column Headers from `#475569` to `#94a3b8` (Slate-400, contrast 6.2:1, AA compliant).
  - Boost Card Subtitles from `#71717a` to `#a1a1aa` (Zinc-400, contrast 6.8:1, AA compliant).
  - Boost Directory Hull labels from `#64748b` to `#94a3b8` (Slate-400, contrast 6.2:1).
  - Strengthen default edge stroke from `#2b2b32` to `#3f3f46` (Zinc-700, contrast 3.1:1, meeting SC 1.4.11).
  - Elevate card background to `#18181b` (Zinc-900) with border `#27272a` (Zinc-800, contrast 1.8:1) or `#3f3f46` to establish clear rectangular affordance.
  - Relax non-hovered dimming from `0.25` to `0.40` for nodes and `0.10` to `0.20` for edges to maintain ambient legibility.

---

### D3. Bézier Edge Arrowhead Angle Misalignment and TB Mode S-Curve Kinking
- **Severity**: Material
- **Area**: Interaction Ergonomics / Visual Readability
- **Target File**: `app/cartograph-canvas-render.js:174-191`
- **Description**:
  Two mathematical defects plague the Bézier edge rendering:

  1. **Arrowhead Angle Miscalculation**:
     In lines 183-184:
     ```javascript
     const angle = Math.atan2(
       end.y - (end.y * 0.2 + start.y * 0.8),
       end.x - (end.x * 0.2 + start.x * 0.8)
     );
     ```
     Simplifying the terms:
     `end.y - (0.2 * end.y + 0.8 * start.y) = 0.8 * (end.y - start.y)`
     Because positive scaling cancels out in `Math.atan2(0.8 * dy, 0.8 * dx)`, this is mathematically identical to `Math.atan2(end.y - start.y, end.x - start.x)`.
     This computes the angle of the **secant straight line** connecting `start` to `end`. However, the edge is rendered as a cubic Bézier curve whose end control point is `CP2 = (end.x - cpOffset, end.y)` (line 179). The tangent vector of this cubic Bézier curve at `t = 1` is strictly horizontal (`dy/dx = 0`). The curve enters the node horizontally, while the arrowhead is drawn rotated at the secant diagonal angle. The arrow points in a different direction than the line arriving into it, producing a visibly broken joint.
  2. **Hardcoded Horizontal Control Points in Vertical (TB) Layout**:
     The curve calculation assumes horizontal Left-to-Right flow:
     ```javascript
     const dx = end.x - start.x;
     const cpOffset = Math.min(100, Math.max(30, Math.abs(dx) * 0.4));
     ctx.bezierCurveTo(
       start.x + (dx >= 0 ? cpOffset : -cpOffset), start.y,
       end.x - (dx >= 0 ? cpOffset : -cpOffset), end.y,
       end.x, end.y
     );
     ```
     In Tree (TB) mode, dependencies flow vertically from top to bottom. For vertical edges where `dx` is near 0 and `dy` is large (~150px), `abs(dx) = 0`, forcing `cpOffset = 30`. Because `dx >= 0`, `CP1` shifts right by 30px (`start.x + 30`) and `CP2` shifts left by 30px (`end.x - 30`). Instead of a smooth downward curve, the edge bulges out horizontally to the right, twists back to the left, and hooks into the destination card as an unnatural S-curve.
  3. **Agent Indicator Disconnect**:
     On line 194, the agent active edge indicator is drawn at `((start.x + end.x) / 2 - 3, (start.y + end.y) / 2 - 3)`. Because cubic Bézier curves bow away from the straight-line midpoint, this green square hovers detached in empty whitespace rather than sitting on the line.
- **Remediation**:
  1. Determine control point orientation based on layout mode: if `state.graphLayout === 'dag-tb'`, offset control points in Y (`start.x, start.y + cpOffset` and `end.x, end.y - cpOffset`). In Cluster mode, use proportional 2D vector offsets or straight lines.
  2. Compute the true tangent angle at `t = 1`: `angle = Math.atan2(end.y - cp2.y, end.x - cp2.x)`.
  3. Evaluate the cubic Bézier formula at `t = 0.5` to position the agent active edge indicator directly on the rendered curve.

---

### D4. Directory Cluster Watermarks Form Spurious Bounding Boxes Swallowing Foreign Nodes
- **Severity**: Material
- **Area**: Visual Wayfinding
- **Target File**: `app/cartograph-canvas-render.js:54-89`
- **Description**:
  In Cluster mode (`state.graphLayout === 'cluster'`), directory regions are drawn using simple Axis-Aligned Bounding Boxes (AABBs):
  ```javascript
  for (const [dir, dNodes] of dirGroups.entries()) {
    if (dNodes.length < 2) continue;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const dn of dNodes) {
      const b = getGraphNodeBounds(dn);
      // update minX, minY, maxX, maxY
    }
    ctx.roundRect(minX - pad, minY - pad - 18, (maxX - minX) + pad * 2, (maxY - minY) + pad * 2 + 18, 12);
  }
  ```
- **Flaws & Impact**:
  1. **Single-file directories are invisible**: `if (dNodes.length < 2) continue;` skips any directory containing exactly one module (e.g. `main.py`, root config files, isolated single-module packages). These files float without any directory enclosure.
  2. **Rectangular AABB False Enclosure**: In a force-directed cluster simulation, directory nodes disperse based on edge spring attractions. If two files in `app/` are separated across the canvas and files from `lib/` or `test/` lie between them, the rectangular box for `app/` stretches across the canvas and physically encloses the foreign `lib/` nodes. Users mistakenly read those foreign nodes as belonging to `app/`.
  3. **Overlapping Hull Interference**: When bounding boxes of neighboring directories intersect, their rectangular outlines overlap, creating confusing dark intersections and colliding label badges.
- **Remediation**:
  - Compute a convex hull or an alpha-shape (or rounded centroid bubble) around directory nodes, or pad each node locally rather than generating a global rectangular bounding box across distant coordinates.
  - Render an indicator or watermark chip for single-node directories (`dNodes.length === 1`) so isolated files are not stripped of architectural neighborhood context.

---

### D5. LR Stage Column Guides are Fragile, Viewport-Unpinned, and Absent in TB Mode
- **Severity**: Material
- **Area**: Visual Wayfinding / Information Hierarchy
- **Target File**: `app/cartograph-canvas-render.js:91-123`
- **Description**:
  1. **Dynamic Phantom Column Spawning During Drag**:
     Columns are grouped by `Math.round(n.x)`:
     ```javascript
     const colMap = new Map();
     for (const n of state.graph.nodes) {
       const colKey = Math.round(n.x);
       if (!colMap.has(colKey)) colMap.set(colKey, []);
       colMap.get(colKey).push(n);
     }
     ```
     When an engineer drags a card horizontally in LR mode, `n.x` updates continuously. The dragged card instantly creates a new entry in `colMap`, dynamically spawning an extra vertical guide line and stage label that slides across the screen. When dragged past the rightmost column, the dragged node suddenly renames itself `FOUNDATION & DB` while the previous foundation column drops back to `STAGE N`.
  2. **Viewport Clipping on Zoom/Pan**:
     Stage titles are placed at `minY - 44` in world coordinates (where `minY` is the top node in that column). If the repository has a tall column and the user zooms in or pans down to inspect lower nodes, the column headers scroll completely out of view. The user loses all stage orientation.
  3. **Completely Absent in Tree (TB) Mode**:
     Line 92 restricts stage guides to LR mode: `const isLRMode = state.graphLayout === 'dag' || state.graphLayout === 'dag-lr' || state.activeLayoutVariant === 'A';`. When switching to Tree (TB) mode, there are no stage row guides or layer headers whatsoever, despite TB being a direct topological projection.
  4. **Mental Model Distortion ("Stage" vs "Depth")**:
     Labeling static dependency ranks as `ENTRY POINTS`, `STAGE 1`, `STAGE 2`, `FOUNDATION & DB` communicates a temporal or runtime execution pipeline (like a build runner or dataflow DAG) rather than static dependency depth.
- **Remediation**:
  - Group columns by topological rank (`n.rank`) rather than raw `Math.round(n.x)`, keeping stage columns stable even when cards are dragged.
  - Pin stage headers to the top of the canvas viewport (screen space `y = 20`) or clamp their world Y so they remain visible while scrolling tall columns.
  - Provide horizontal stage divider bands when in Tree (TB) mode.
  - Adjust nomenclature: use `ENTRY POINTS`, `DEPENDENCY TIER 1`, `TIER 2`, `LEAF / FOUNDATION` to accurately describe static codebase depth.

---

### D6. Canvas Lacks Keyboard Operability and Assistive Technology Accessibility
- **Severity**: Material
- **Area**: Accessibility (WCAG 2.1.1 Keyboard, 4.1.2 Name/Role/Value)
- **Target File**: `cartograph.html:174`, `app/cartograph-canvas-render.js:312-393`
- **Description**:
  The HTML5 `<canvas id="dependencyCanvas">` element contains no `tabindex="0"`, no ARIA role (`role="region"` or `role="application"`), and no accessible name or description (`aria-label`).
  Furthermore:
  - Users navigating exclusively via keyboard cannot focus the canvas.
  - No keyboard handlers exist for canvas panning (arrow keys), zooming (`+` / `-`), or node selection (Tab / Enter).
  - Screen readers encounter an invisible element with no indication that an interactive dependency graph exists. While the File Browser sidebar and Command Palette (`⌘K`) offer keyboard navigation, the primary canvas viewport is inaccessible.
- **Remediation**:
  - Add `tabindex="0"`, `role="region"`, and `aria-label="Interactive Architecture Dependency Graph"` to `<canvas id="dependencyCanvas">`.
  - Add keyboard listeners for Arrow keys (pan), `+`/`-` (zoom), and `Home` (fit).
  - Provide accessible live region updates when a node is selected from the canvas.

---

### D7. Dot Grid World-Space Scaling Aliasing and Unthrottled 60 FPS Loop
- **Severity**: Minor
- **Area**: Visual Ergonomics / Performance
- **Target File**: `app/cartograph-canvas-render.js:26-38, 301-310`
- **Description**:
  The dot grid is rendered in world space with a fixed world dimension:
  ```javascript
  ctx.translate(state.camera.x, state.camera.y);
  ctx.scale(state.camera.zoom, state.camera.zoom);
  // ...
  ctx.fillRect(gx, gy, 1.2, 1.2);
  ```
  1. **Scaling Artifacts**: At minimum zoom (`zoom = 0.4`), a 1.2 unit square scales to `1.2 * 0.4 = 0.48` screen pixels. Combined with low contrast (`#202024` on `#141416`), the dots either vanish entirely or flicker into subpixel aliasing patterns during panning. At maximum zoom (`zoom = 2.6`), dots scale to 3.12 screen pixels, appearing as heavy, distractingly coarse square blocks.
  2. **Unnecessary Redraw Overhead**: At `zoom = 0.4` on a 1440×900 display, the grid spans 3600×2250 world units, executing ~6,200 `fillRect` calls every frame. `startCanvasAnimationLoop()` runs at 60 FPS continuously via `requestAnimationFrame` even when the graph, camera, and mouse are completely stationary.
- **Remediation**:
  - Render the dot grid in viewport screen coordinates using `(screenX % (dotSpacing * zoom))` with a fixed 1px dot size, or draw a static repeating pattern / CSS background.
  - Implement a dirty flag (`state.needsRedraw`) in `startCanvasAnimationLoop()` to only re-render when camera coordinates, hover state, or node selections change.

---

### D8. Node Cards Strip Directory Prefixes Leaving Identical Basenames Ambiguous
- **Severity**: Minor
- **Area**: Information Hierarchy
- **Target File**: `app/cartograph-canvas-render.js:273-285`
- **Description**:
  In section 5, `dirPrefix` is extracted from the node path:
  ```javascript
  const parts = node.path.split('/');
  const dirPrefix = parts.length > 1 ? parts.slice(0, -1).join('/') + '/' : '';
  const baseName = parts[parts.length - 1];
  ```
  However, `dirPrefix` is never rendered. Only `displayLabel` (derived solely from `baseName`) is drawn on line 284:
  `ctx.fillText(displayLabel, bounds.minX + 12, node.y - 8);`
  In modern web and service codebases, identical filenames in different directories are standard (e.g. `app/index.js`, `lib/index.js`, `api/route.ts`, `auth/route.ts`). On the canvas, all of these cards display only `index.js` or `route.ts`. Users cannot distinguish between modules without hovering or clicking them one by one.
- **Remediation**:
  Render the directory prefix in a muted font above or preceding the basename (e.g. `app/` in `#71717a` followed by `index.js` in `#ffffff`), or append the immediate parent directory (`lib/index.js`) when basenames collide.

---

### D9. Cyclic Toolbar Layout Button Lacks ARIA Affordance and Mobile Resiliency
- **Severity**: Minor
- **Area**: Interaction Ergonomics
- **Target File**: `cartograph.html:161`, `app/cartograph-canvas-render.js:411-452`
- **Description**:
  In `#canvasToolbar`:
  `<button id="btnToggleLayout" onclick="cycleGraphLayout()" title="Cycle layout (Pipeline LR / Tree TB / Cluster)">Pipeline</button>`
  1. **Ambiguous Button State**: The button label displays the *currently active* layout mode ("Pipeline"). However, flat text buttons that change state on click without a dropdown arrow or chevron create ambiguity: users cannot tell whether clicking "Pipeline" activates Pipeline mode or switches to the next mode.
  2. **Screen Reader Blindness**: Screen readers announce only "Pipeline, button". There is no `aria-label` or state announcement (e.g. `aria-label="Layout mode: Pipeline. Click to cycle"`).
  3. **Mobile Toolbar Congestion**: `#canvasToolbar` contains 7 items (`Fit`, `−`, `+`, `btnToggleLayout`, `Isolate`, `Simulate`, `Hide inspector`). On mobile screens (<= 390px), this toolbar spans ~350px at `top: 8px; right: 12px`, crowding against or overlapping compact map controls.
- **Remediation**:
  - Add an icon or chevron affordance: `Layout: Pipeline ▾` or a 3-segment icon switch.
  - Add `aria-label="Graph layout: Pipeline. Click to cycle layout modes"`.
  - On viewports < 640px, collapse layout, isolate, and simulate controls into a single "Tools" overflow menu.

---

### D10. Semantic Color Collision Between DB Layer and Hover Outbound Highlighting
- **Severity**: Minor
- **Area**: Visual Wayfinding
- **Target File**: `app/cartograph-canvas-render.js:146, 254`, `app/cartograph-graph-state.js:50-55`
- **Description**:
  There is a direct color collision across visual states:
  - In `getLayerMeta('core')`, the architectural layer color for **DB & Core** is `#38BDF8` (Sky Blue / Cyan).
  - In `drawDependencyGraph()`, the stroke color for **hover outbound dependencies** is `#38bdf8` (line 146), and the card border for outbound nodes is `#38bdf8` (line 235).
  - Additionally, Hop 2 blast radius (`#d9a441`, Amber) visually clashes with the API & Auth layer accent (`#f59e0b`, Amber).
  When an engineer hovers a file, any card turning cyan could either mean "this file belongs to DB & Core" or "this file is an outbound import of the hovered module". Overloading identical hues for permanent architectural classification and ephemeral interactive state causes cognitive dissonance.
- **Remediation**:
  Differentiate status and layer palettes: reserve cyan (`#38bdf8`) for outbound connections while shifting DB & Core to deep cobalt/cyan `#0284c7` or purple `#a855f7`, or use dotted/dashed stroke patterns for interactive dependency tracking.

---

## Remediation Roadmap

1. **Immediate (P0 - Critical Accessibility & Bugs)**:
   - Fix D1: Add canvas `mouseleave` event listener to clear `state.hoveredFile`.
   - Fix D2: Upgrade `#475569` stage titles to `#94a3b8` and `#71717a` subtitles to `#a1a1aa` to satisfy WCAG AA contrast.
   - Fix D3: Align arrowhead rotation with Bézier arrival tangent (`t = 1`), and route control points in Y for `dag-tb` mode.
2. **Near-Term (P1 - Wayfinding Polish)**:
   - Fix D4: Replace loose AABB directory hulls with convex hulls or localized cluster bubbles.
   - Fix D5: Anchor stage guides to topological rank rather than mutable `n.x`, and pin headers to viewport top.
   - Fix D6: Add `tabindex="0"`, ARIA region attributes, and arrow-key panning to canvas.
3. **Refinement (P2 - Visual Ergonomics)**:
   - Fix D7: Convert dot grid to screen space with dirty-flag throttled rendering.
   - Fix D8: Render muted directory prefixes (`lib/`) on card labels to eliminate basename collisions.
   - Fix D9: Add chevron/dropdown affordance to `#btnToggleLayout`.
   - Fix D10: Separate architectural layer hues from interactive highlight hues.
