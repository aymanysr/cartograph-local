# Layout Engine & Integration Review — EGM Stage 7/9 Structural & Implementation Readiness

**Date:** 2026-10-29  
**Review Target:**  
- `lib/cartograph-layouts.js` (Pure layout engine)  
- `app/cartograph-graph-state.js` (`computeGraphNodePositions` integration)  
- `test/layouts.test.js` (Unit test suite)  
- `test/ui.test.js` (Integration harness)  
- Supporting touched surfaces: `app/cartograph-canvas-render.js`, `cartograph.html`, `CONTEXT.md`  

**Status:** CONDITIONAL PASS — Core mathematical layout algorithms and collision convergence are sound, cycle-safe, and deterministic. Two Material integration findings (Bézier S-curve distortion in non-LR modes, and Command Palette route desynchronization) and several Minor inner-loop allocation and dead-code items require remediation before final sign-off.

---

## 1. Review Method & Verification Scope

A fresh-context read-only audit was conducted across the newly introduced graph layout engine, canvas rendering enhancements, and integration seams. The review evaluated:
1. **Algorithmic Correctness**: DFS back-edge detection cycle tolerance, 3-pass barycenter ordering determinism, and normalized AABB minimum-penetration separation.
2. **Performance & Scaling**: Empirical and analytical computational complexity on 20-node, 100-node, and 300-node topologies; inner-loop allocation profiles and GC impact.
3. **Architecture Invariants & Grounding**: Compliance with non-negotiable rules in `CLAUDE.md` and `PROJECT.md` (parser independence, shared module contracts, zero DOM in mathematical engines, grounded citations).
4. **Execution & Regression Verification**: Full test suite (`node --test`), CLI scanner integration (`node cli/cartograph-scan.mjs`), and standalone multi-scale collision benchmarks.

---

## 2. Executive Audit Verdict Across Dimensions

### 2.1 Algorithmic Correctness: PASS
- **Cycle Tolerance in DFS Back-Edge Detection**: `findBackEdges()` partitions edges via 3-color DFS traversal (`0=unvisited, 1=visiting, 2=visited`) after pre-sorting nodes lexicographically. Directed cycles of any length (including 2-cycles and self-loops) are guaranteed to trigger the `color.get(v) === 1` active stack check. The resulting subgraph `G' = (V, E \ backEdges)` is strictly acyclic. The longest-path relaxation in `computeTopologicalRanks()` is bounded by `maxIter = nodes.length`, preventing rank explosion or infinite loops.
- **Deterministic Barycenter Sweeps**: The Sugiyama-inspired crossing minimization in `orderBucketsByBarycenter()` uses a three-sweep schedule (Forward Rank 1 to maxRank, Backward maxRank-1 down to 0, Final Forward Rank 1 to maxRank). Determinism is rigorously guaranteed by strict total-order tie-breaking (`aAvg - bAvg || b.totalImpact - a.totalImpact || a.path.localeCompare(b.path)`).
- **Normalized AABB Collision Convergence**: `separateNodeCards()` replaces naive distance comparisons with fractional dimensional penetration `px / minDx <= py / minDy` (`minDx = 216`, `minDy = 68`), resolving overlaps along the true shallowest penetration axis. In empirical testing over 10 repeated randomized trials of 300 nodes and 800 edges, card overlap count converged to exactly **0** in <= 25 passes (under the 45-pass ceiling).

### 2.2 Performance & Scaling: PASS WITH RECOMMENDATIONS
Empirical benchmarks run on synthetic topologies with directory distribution:
- **20 nodes, 30 edges**: LR = 7.8ms (0 overlaps), TB = 0.2ms (0 overlaps), Cluster = 3.9ms (0 overlaps).
- **100 nodes, 250 edges**: LR = 2.3ms (0 overlaps), TB = 1.8ms (0 overlaps), Cluster = 11.0ms (0 overlaps).
- **300 nodes, 900 edges**: LR = 13.3ms (0 overlaps), TB = 11.5ms (0 overlaps), Cluster = 30.6ms (0 overlaps).

*Analytical Complexity:*
- DAG Ranks: Worst-case O(|V| × |E|) Bellman-Ford relaxation on DAG.
- Cluster Simulation: O(I × (|V|^2 + |E|)) where I = 120 iterations.
- Collision Passes: O(P × |V|^2) where P <= 45 passes.

### 2.3 Test Coverage & Architecture Invariants: PASS
- All **105 tests** in the test suite pass with 0 failures (`test/layouts.test.js` contributes 4 tests covering directory parsing, cycle tolerance, determinism, and zero-collision assertions across all preset repos).
- **CLAUDE.md Invariant 1 (Parser Standalone)**: Untouched. `lib/cartograph-parser.js` and `cli/cartograph-scan.mjs` remain 100% deterministic and standalone.
- **CLAUDE.md Invariant 2 (Strict Grounding)**: Untouched. All 44 evals tests in `test/evals.test.js` pass with 100% citation groundedness.
- **CLAUDE.md Invariant 5 (Shared Modules Rule)**: `lib/cartograph-layouts.js` conforms to the UMD zero-dependency, DOM-free contract, functioning identically under Node.js CommonJS and browser classic script loading.

---

## 3. Findings & Residual Defects Matrix

| ID | Severity | Scope | Finding and Proposed Resolution |
| --- | --- | --- | --- |
| **S1** | **Material** | `app/cartograph-canvas-render.js` (lines 174–180) | **Bézier curve routing hardcodes horizontal-only control points, causing distorted S-kinks in Tree (`dag-tb`) and Cluster modes.** Control points offset along the X-axis (`start.x ± cpOffset`) regardless of active mode. In `dag-tb`, where flow is vertical, vertical edges bulge sideways by 30px. *Resolution:* Branch control point calculation by layout orientation (offset along Y for `dag-tb`, straight `lineTo` or radial Béziers for `cluster`). |
| **S2** | **Material** | `app/cartograph-app-shell.js` (line 735), `cartograph.html` | **Command Palette (`⌘K`) is desynchronized from the new layout modes and cannot trigger Tree layout (`dag-tb`).** Palette actions hardcode `['dag', 'force']`, omitting `dag-tb` and causing active `(current)` indicator mismatches when cycling through `Pipeline`, `Tree`, and `Cluster`. *Resolution:* Update palette action registry to iterate `LAYOUT_MODES` (`dag-lr`, `dag-tb`, `cluster`). |
| **S3** | **Material** | `app/cartograph-canvas-render.js` (lines 26–123, 301–310) | **High heap allocations and redundant grouping loops inside the continuous 60/120 FPS animation loop.** `drawDependencyGraph()` runs unconditionally every frame via `requestAnimationFrame` and allocates `nodeMap = new Map()`, `colMap = new Map()`, `dirGroups = new Map()`, and performs ~1,600 `fillRect` calls for the dot grid every frame even when idle. *Resolution:* Cache static layout groupings and only re-render when camera, hover, drag, or layout state changes. |
| **S4** | **Minor** | `app/cartograph-graph-state.js` (lines 146–250) | **Unreachable legacy layout code and unnormalized collision check retained in `computeGraphNodePositions`.** Lines 146–250 are dead code when `CartographLayouts` is present. If `CartographLayouts` were ever omitted, the fallback uses the buggy `px <= py` unnormalized collision logic. *Resolution:* Remove unreachable legacy fallback or align it to call `CartographLayouts`. |
| **S5** | **Minor** | `lib/cartograph-layouts.js` (lines 108, 161–193) | **Inner-loop template string allocations and unmemoized barycenter comparator calls.** `${e.source}->${e.target}` generates up to 270,000 short-lived strings in `computeTopologicalRanks`. In `orderBucketsByBarycenter`, `computeBarycenter` is recomputed on every comparator pair instead of pre-computed once per node. *Resolution:* Pre-filter `edges` into an acyclic array prior to relaxation; precompute bucket barycenters before `cur.sort()`. |
| **S6** | **Minor** | `lib/README.md`, `test/README.md` | **Documentation counts drifted.** `lib/README.md` refers to "four shared deterministic modules" (now five). `test/README.md` states "101 tests across nine files" (now 105 tests across ten files). *Resolution:* Update documentation counts and document `lib/cartograph-layouts.js` public API in `lib/README.md`. |
| **S7** | **Minor** | `lib/cartograph-layouts.js` (lines 109–112) | **Lack of membership guard for edge targets in `computeTopologicalRanks`.** If an unindexed or external edge target is supplied, `ranks.set(e.target, ...)` registers it, skewing `maxRank` and grid centering. *Resolution:* Add `if (!ranks.has(e.source) || !ranks.has(e.target)) continue;`. |

---

## 4. Detailed Defect Analysis

### S1: Bézier Edge Routing Distortion in Non-Pipeline Modes (Material)
In `app/cartograph-canvas-render.js` (lines 174–180):
```javascript
const dx = end.x - start.x;
const cpOffset = Math.min(100, Math.max(30, Math.abs(dx) * 0.4));
ctx.beginPath();
ctx.moveTo(start.x, start.y);
ctx.bezierCurveTo(start.x + (dx >= 0 ? cpOffset : -cpOffset), start.y, end.x - (dx >= 0 ? cpOffset : -cpOffset), end.y, end.x, end.y);
ctx.stroke();
```
When `state.graphLayout === 'dag-tb'`, dependency flow is Top-to-Bottom. For two nodes in the same vertical column (`dx = 0`, `dy > 0`):
- `dx >= 0` evaluates to true, yielding `cpOffset = 30`.
- Control point 1 is `(start.x + 30, start.y)` and control point 2 is `(end.x - 30, end.y)`.
- The edge departs heading 30px east, reverses horizontally through the center, and enters from 30px west, forming a visible S-kink on an otherwise straight vertical tree connection.
- In `cluster` mode, where nodes are positioned radially, horizontal control points distort diagonal and vertical edges.
Furthermore, the arrowhead angle:
```javascript
const angle = Math.atan2(end.y - (end.y * 0.2 + start.y * 0.8), end.x - (end.x * 0.2 + start.x * 0.8));
```
evaluates to the straight secant angle between start and end (`atan2(dy, dx)`), whereas the cubic curve arrives horizontally (`dy/dx = 0`). This produces a visible tilt between the arrow tip and the incoming line.

### S2: Command Palette Layout Synchronization (Material)
In `app/cartograph-app-shell.js` (line 735):
```javascript
['dag','force'].forEach(layout=>add('layout-'+layout,'Layout: '+(layout==='dag'?'Dependency':'Force')+(state.graphLayout===layout?' (current)':''),map(()=>setGraphLayout(layout)),hasNodes,'Load files to change layout'));
```
The Command Palette (`⌘K`) still registers only `['dag', 'force']`.
1. The new Tree mode (`dag-tb`) cannot be triggered via keyboard commands.
2. When the user selects Tree (`dag-tb`) or Cluster (`cluster`) via `#btnToggleLayout`, neither action in the Command Palette displays `(current)`.
3. Selecting `Layout: Force` from the palette passes `'force'`, which normalizes to `'cluster'` in `setGraphLayout`, but leaves `state.graphLayout = 'force'`.

### S3: Continuous Render Loop Allocations (Material)
In `app/cartograph-canvas-render.js` (lines 301–310):
`startCanvasAnimationLoop()` triggers `drawDependencyGraph()` 60 to 120 times every second. Inside:
1. `nodeMap = new Map(state.graph.nodes.map(n => [n.path, n]))` creates N two-element arrays and a Map on every frame.
2. In LR mode, `colMap` creates a Map, populates it with all nodes, and runs `Array.from(colMap.keys()).sort()` on every frame.
3. In Cluster mode, `dirGroups` groups all nodes by directory on every frame.
4. The 36px dot grid executes between 1,000 and 2,000 `ctx.fillRect` calls on every frame.
Even on an idle canvas, this causes steady garbage collection pressure and unnecessary CPU consumption on laptops and mobile devices.

---

## 5. Implementation Readiness & Transition Plan

1. **Immediate Pre-Commit Fixes (Remediate S1 and S2)**:
   - Update `app/cartograph-canvas-render.js` to branch edge drawing:
     - In `dag-lr` mode: use horizontal Bézier curves.
     - In `dag-tb` mode: use vertical Bézier curves (offsetting along Y: `start.y + cpOffset`, `end.y - cpOffset`).
     - In `cluster` mode: use straight lines (`ctx.lineTo`) or tangent-aligned Béziers.
   - Update `app/cartograph-app-shell.js` line 735 to register all three canonical modes: `dag-lr` (Pipeline), `dag-tb` (Tree), and `cluster` (Cluster).
2. **Performance Cleanup (Remediate S3, S4, S5)**:
   - Cache column and directory group maps during `computeGraphNodePositions()` rather than rebuilding them inside `drawDependencyGraph()`.
   - Remove dead lines 146–250 from `app/cartograph-graph-state.js`.
   - Pre-filter `edges` in `computeTopologicalRanks` to eliminate inner-loop string allocations.
3. **Documentation Alignment (Remediate S6)**:
   - Update `lib/README.md` and `test/README.md` to reflect 5 shared modules and 105 tests.

**Final Critic Verdict:** Algorithmic architecture and collision invariants are fully validated. Once S1 (Bézier orientation) and S2 (Command Palette registration) are addressed, the layout engine redesign is ready for production merge.