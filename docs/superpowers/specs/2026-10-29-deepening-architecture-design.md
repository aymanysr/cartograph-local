# Architecture Design: 3-Module Deepening & Seam Consolidation
**Date:** 2026-10-29  
**Status:** DRAFT (Under EGM Adversarial Review)  
**Author:** @egm-architect  
**Target Codebase:** Cartograph Local (`/tmp/cartograph-local-project`)

---

# Zone 1: Feature Range (High-Level Architecture)

## 1. Context & Motivation
Cartograph Local is built on deterministic code intelligence: every line and edge in the dependency graph comes from real parsed imports. The codebase recently completed the Quiet Shell redesign (splitting a monolithic script into 6 classic scripts in `app/`) and the Layout Engine overhaul (ADR-001 through ADR-004 in `lib/cartograph-layouts.js`).

However, three shared modules remain **shallow** or leak implementation details across their seams:
1. **`lib/cartograph-fit.js` (Viewport Camera)**: Only exposes a single box-framing formula. Coordinate transforms (`toWorld`), node centering, and cursor-anchored zoom are duplicated with conflicting constants across 4 UI files.
2. **`lib/cartograph-intake.js` (Repository Intake)**: Exposes 6 fine-grained helper functions. The CLI and Browser adapters duplicate root detection, file deduplication, skip reporting, and snapshot parsing.
3. **`lib/cartograph-agent.js` (Deterministic Agent)**: Embeds presentation HTML markup and Tailwind classes into the graph reasoning loop, while calling the planner twice per UI query.

## 2. Goals & Non-Goals
### Explicit Goals
* **G1:** Deepen `lib/cartograph-fit.js` into `CartographCamera`, concentrating all coordinate projection, node centering, focal zoom, and bounds framing into a single zero-dependency UMD module.
* **G2:** Deepen `lib/cartograph-intake.js` to provide `processBatch(entries)` and `discriminate(input)`, eliminating duplicate intake loops in both CLI and Browser adapters.
* **G3:** Decouple `lib/cartograph-agent.js` from presentation HTML, returning structured domain records while preserving visible tool traces and strict provenance validation.
* **G4:** Establish `GLOSSARY.md` in the project root to formalize domain and architectural terminology.
* **G5:** Zero test regressions across all 110 tests (`node --test`).

### Explicit Non-Goals
* **NG1:** No rewrite of the parsing regex engine (`lib/cartograph-parser.js`).
* **NG2:** No migration of classic browser scripts to ES modules or bundlers (load-order invariant must be preserved).
* **NG3:** No change to the underlying graph schema (`{ name, description, nodes, edges, cycles, unresolved }`).

## 3. High-Level Architecture & Seam Boundaries

```mermaid
flowchart TD
    subgraph INTAKE[1. Shared Intake Engine (lib/cartograph-intake.js)]
        CLI[CLI Scanner] -->|fs entries| INTAKE_PROC[CartographIntake.processBatch]
        BROWSER_UI[Browser Drag/Drop] -->|File entries| INTAKE_PROC
        INTAKE_PROC -->|Normalized files| PARSER[CartographParser.parseRepository]
        INTAKE_PROC -->|Turnkey Summary| REPORT[Intake Skip Report]
    end

    subgraph PROJECTION[2. Viewport Camera (lib/cartograph-fit.js)]
        PARSER -->|Nodes & Bounds| CAM[CartographCamera]
        CANVAS_EVENTS[Mouse / Wheel / Keys] -->|Screen Coords & Deltas| CAM
        CAM -->|toWorld / toScreen| HIT_TEST[Canvas Hit Test & Hover]
        CAM -->|Camera Matrix| CTX[Canvas Render Loop]
    end

    subgraph REASONING[3. Structured Agent (lib/cartograph-agent.js)]
        Q[Repository Question] --> AGENT[CartographAgent.query]
        PARSER -->|Graph| AGENT
        AGENT -->|Deterministic Walk| TOOLS[Execute 6 AST Tools]
        TOOLS --> MODEL[Optional LLM Synthesis]
        MODEL --> GATE[Provenance & Grounding Gate]
        GATE -->|Structured Domain Record| RECORD[Structured Plan & Citations]
    end

    RECORD -->|Data Record| EVALS[Eval Benchmark Suite]
    RECORD -->|Data Record| BADGE_FORMATTER[UI Chip Formatter]
```

## 4. Alternatives Considered & Trade-Off Analysis

| Area | Option Considered | Trade-Off & Decision |
| :--- | :--- | :--- |
| **Camera** | Stateful Camera Class Instance (`new CartographCamera()`) | Rejected. Violates Cartograph's convention where `state` is the single serializable store. **Selected: Pure Functional Record**, where methods take a camera and return a new `{ x, y, zoom }`. |
| **Intake** | Streaming Generator / Observable Pipeline | Rejected. Overkill for batch file selections. Both CLI and browser already collect file lists up-front. **Selected: Turnkey Batch Ingestion** (`processBatch(entries)`). |
| **Agent** | Template Callback Middleware | Rejected. Still entangles markup generation with library code. **Selected: Pure Structured Domain Records**, moving 100% of HTML rendering to the UI view adapter. |

---

# Zone 2: Detailed Range (Implementation Blueprint)

## 1. File Changes Matrix

| File | Nature of Change | Responsibility |
| :--- | :--- | :--- |
| `lib/cartograph-fit.js` | Deepen | Add `fitToNodes`, `centerOnNode`, `zoomAt`, `panBy`, `toWorld`, `toScreen`, `computeBoundingBox`. Preserve `computeFitCamera`. Export as both `CartographCamera` and `CartographFit`. |
| `lib/cartograph-intake.js` | Deepen | Add `processBatch(entries)` and `discriminate(input)`. Preserve `checkFile`, `checkDirectory`, `detectSharedRoot`, `createIntakeSession`. |
| `lib/cartograph-agent.js` | Deepen | Refactor `buildAgentPlan` and `queryAgent` to emit structured records (`{ target, blastRadius, steps, citedFiles, narrative }`). Retain backward-compatible `answerHtml` generation if formatter provided. |
| `app/cartograph-canvas-render.js` | Adapter Refactor | Delegate `screenToWorld` to `CartographCamera.toWorld`. Delegate cursor zooming to `CartographCamera.zoomAt`. Use `CartographCamera.MIN_ZOOM`/`MAX_ZOOM`. |
| `app/cartograph-graph-state.js` | Adapter Refactor | Delegate `fitGraphToCanvas` and node bounds to `CartographCamera`. Use `CartographCamera.centerOnNode`. |
| `app/cartograph-ui-panels.js` | Adapter Refactor | Replace inline camera centering in `selectFileNode` with `CartographCamera.centerOnNode`. |
| `app/cartograph-app-shell.js` | Adapter Refactor | Simplify `ingestUploadedFileObjects` using `CartographIntake.processBatch`. Replace `CartographNavigation.centerOnNode` with `CartographCamera.centerOnNode`. |
| `app/cartograph-agent-evals.js` | Adapter Refactor | Format UI badges from structured agent narrative. Eliminate duplicate `buildAgentPlan` calls. |
| `cli/cartograph-scan.mjs` | Adapter Refactor | Replace custom skip array and duplicate tracking with `CartographIntake.processBatch`. |
| `GLOSSARY.md` | New File | Canonical definitions for Viewport Camera, Intake Pipeline, Structured Agent, Blast Radius, etc. |
| `test/camera.test.js` | New Test File | Tests for `CartographCamera` (toWorld, toScreen, zoomAt, centerOnNode, fitToNodes). |

## 2. Concrete Typed Signatures

### 2.1 `CartographCamera` (`lib/cartograph-fit.js`)
```typescript
interface Camera {
  x: number;
  y: number;
  zoom: number;
}

interface Point {
  x: number;
  y: number;
}

interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface NodeBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface CartographCameraModule {
  MIN_ZOOM: number; // 0.05
  MAX_ZOOM: number; // 2.6
  DEFAULT_PAD: Padding;
  computeFitCamera(box: NodeBounds, viewWidth: number, viewHeight: number, padding?: number | Partial<Padding>): Camera;
  computeBoundingBox(nodes: Array<{ x: number, y: number }>): NodeBounds;
  fitToNodes(nodes: Array<{ x: number, y: number }>, viewWidth: number, viewHeight: number, padding?: number | Partial<Padding>): Camera;
  centerOnNode(camera: Camera, node: { x: number, y: number }, viewWidth: number, viewHeight: number): Camera;
  zoomAt(camera: Camera, screenAnchor: Point, factor: number): Camera;
  panBy(camera: Camera, dx: number, dy: number): Camera;
  toWorld(camera: Camera, screenPoint: Point): Point;
  toScreen(camera: Camera, worldPoint: Point): Point;
}
```

### 2.2 `CartographIntake` (`lib/cartograph-intake.js`)
```typescript
interface FileEntry {
  path: string;
  size?: number;
  content?: string;
}

interface IntakeSummary {
  includedCount: number;
  skippedCount: number;
  countsByReason: Record<string, number>;
  displaySkipped: Array<{ path: string, reason: string }>;
  omittedCount: number;
}

interface BatchResult {
  included: Array<{ path: string, content: string }>;
  skipped: Array<{ path: string, reason: string }>;
  summary: IntakeSummary;
  sharedRoot: string;
  rootFolder: string;
}

interface CartographIntakeModule {
  discriminate(content: string | object): {
    isSnapshot: boolean;
    type: 'graph' | 'files' | 'raw';
    payload: any;
    count: number;
    provenance: { kind: string, scannedAt: string | null };
  } | null;
  processBatch(entries: FileEntry[], options?: { maxBytes?: number }): BatchResult;
  // Preserved legacy exports: parts, checkDirectory, checkFile, parseSnapshot, detectSharedRoot, createIntakeSession
}
```

### 2.3 `CartographAgent` (`lib/cartograph-agent.js`)
```typescript
interface StructuredPlan {
  question: string;
  target: { path: string, layer: string, exports: string[] } | null;
  blastRadius: {
    hop1Files: string[];
    hop2Files: string[];
    outboundTargets: string[];
  };
  steps: Array<{ tool: string, args: string, output: string, files: string[] }>;
  visitedFiles: string[];
  activeEdges: string[];
  citedFiles: string[];
  primaryFocus: string | null;
  narrative: {
    headline: string;
    details: Array<{ label: string, files: string[] }>;
  };
  answerHtml: string; // generated via optional chipFormatter for 100% backward compatibility
}
```

## 3. Verification & Testing Strategy
1. **Zero Regression Baseline:** All 110 existing tests must continue to pass on `node --test`.
2. **New Dedicated Suite (`test/camera.test.js`):**
   * Reciprocal projection: `toScreen(camera, toWorld(camera, pt)) === pt`.
   * Focal cursor anchoring: cursor world coordinates remain invariant before and after zoom.
   * Centering: centered node world coordinates project exactly to `(viewWidth/2, viewHeight/2)`.
3. **Intake Batch Tests (`test/intake.test.js`):**
   * Batch processing of mixed supported, excluded, duplicate, and oversized files.
   * Turnkey snapshot discrimination.
4. **Agent Structured Tests (`test/agent.test.js`):**
   * Verify `target`, `blastRadius`, and `narrative` fields on fixture queries without mock formatters.

