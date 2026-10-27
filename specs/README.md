# `specs/` — Phase Requirements

This directory holds the phase-by-phase engineering requirements for Cartograph
Local. The specs describe intended behavior; they are not a second source of
truth for the current implementation.

Read these first, in this order:

1. [`../PROJECT.md`](../PROJECT.md) — product brief and the golden rule: every
   edge must come from parsing real source text.
2. [`../CLAUDE.md`](../CLAUDE.md) — non-negotiable architecture invariants.
3. The phase spec that covers the area you are changing.

If a spec conflicts with `PROJECT.md` or `CLAUDE.md`, the root documents win.
Record the conflict instead of silently coding around it.

## Phase index

| Spec | Scope | Primary implementation | Verification |
| --- | --- | --- | --- |
| [`phase-01-parser.md`](phase-01-parser.md) | Deterministic import/export graph | `lib/cartograph-parser.js`, `cli/cartograph-scan.mjs` | `node --test` |
| [`phase-02-graph-ui.md`](phase-02-graph-ui.md) | Interactive map, blast radius, grounded explainer | `cartograph.html` | Manual browser checks |
| [`phase-03-agent-evals.md`](phase-03-agent-evals.md) | Graph-walking agent and quantitative evals | `cartograph.html` | Manual agent and Evals tabs |

## Phase summaries

### Phase 01 — Deterministic parser

**Goal:** turn raw files into a verified directed graph without calling an LLM.

Required behavior:

- Extract static `import`/`export ... from`, dynamic `import()`, CommonJS
  `require()`, Python `from ... import`/`import`, and Go `import` declarations
  with 1-indexed line numbers.
- Extract exported symbols for each node.
- Resolve relative paths, `@/`/`~/` aliases plus literal `src/...` paths,
  implicit extensions, and
  barrel files (`index.ts`, `index.tsx`, `index.js`, `__init__.py`).
- Compute `inDegree`, `outDegree`, 1-hop dependents, 2-hop dependents, and
  circular dependencies.
- Record unresolved specifiers with source, line, specifier, and
  `internal-unresolved` vs `external-package` classification.

The implementation and exact graph schema live in
[`../lib/README.md`](../lib/README.md). The CLI contract is in
[`../cli/README.md`](../cli/README.md).

### Phase 02 — Graph UI and blast radius

**Goal:** let an engineer click any file and immediately see what breaks.

Required behavior:

- Canvas graph with pan, zoom, node dragging, architectural layer coloring, and
  both hierarchical DAG and force-directed layouts.
- Selection highlighting: selected node, 1-hop dependents, 2-hop transitive
  dependents, and outbound imports in distinct colors.
- Inspector lists the exact affected files with line numbers and import
  statements.
- Grounded module explanation that references only verified connected files,
  with every cited path rendered as a clickable badge.

All of this is implemented in the single-file app `cartograph.html`; there is no
framework or build step.

### Phase 03 — Agent and evals

**Goal:** answer multi-hop questions by walking the parsed graph, and score the
answers against deterministic ground truth.

Required behavior:

- Agent tools over the parsed graph: `find_entry_points`, `search_symbols`,
  `get_file_ast`, `walk_dependents`, `trace_path`, `detect_cycles`.
- A visible step-by-step trace of every tool call before the final answer.
- Fully local deterministic execution by default, with optional Ollama or an
  OpenAI-compatible endpoint.
- An Evaluation Suite tab scoring Citation Groundedness, Blast-Radius Recall,
  and Hallucination Rate (0% required).

## Known spec-to-code gaps

These are current observations from the code, recorded so nobody mistakes a
requirement for an implemented guarantee. They are documentation findings, not
requests to change code.

| Area | Spec or product claim | Current code |
| --- | --- | --- |
| Parser model | The parser is deterministic and line-oriented | `lib/cartograph-parser.js` is a line-oriented regex scanner with quote/comment masking; it builds no AST, while the app UI still uses "AST" branding |
| Cycle algorithm | Phase 01 says cycles detected via DFS | `detectCircularDependencies` uses Tarjan SCC (DFS-based); self-imports are dropped before cycle detection |
| Agent tool names | Phase 03 lists `trace_path` and `detect_cycles` | UI traces use `trace_dependency_path`; `detect_cycles_and_hubs` exists only as a step label in the deterministic planner, with no executor behind it |
| Agent loop | Phase 03 describes a tool-calling loop | The built-in deterministic agent is a keyword-routed planner (`CartographAgent.buildAgentPlan`) that emits labeled steps, not a generic executor over arbitrary tool arguments |
| Hallucination metric | Phase 03 describes a Hallucination Rate | The UI displays a hallucinated-path count (`evalScoreHallucinations`), not a percentage |

## Invariants

The non-negotiable rules live in [`../CLAUDE.md`](../CLAUDE.md) section 2:
parser standalone, strict grounding, the exact 1-hop/2-hop definition, visible
agent traces, and the shared parser module. If an implementation choice
conflicts with that list, the list wins.

## Verify

```bash
node --test
node cli/cartograph-scan.mjs . --out /tmp/cartograph-scan.json
```

Browser QA script:

1. Open `cartograph.html` (or run the CLI with `--serve 4173`).
2. Click any node in the map. The inspector should show the file path, layer,
   export chips, and non-zero 1-hop/2-hop counts where dependents exist.
3. Click a file chip inside the inspector or agent answer; the map should select
   and focus that node.
4. Open the **Agent** tab, run a question, and confirm each trace step shows a
   tool name, arguments, output, and verified files.
5. Open **Agent Evals**, click **Run Full Benchmark Suite**, and confirm the
   groundedness, recall, and latency cards update. Strict mode executes the
   deterministic agent for every case, cites only files the planner visited or
   traced, and shows each case's real tool-step count. Naive mode scores the
   canned, deliberately hallucinated fallback lists.
6. Open the sliders button (**"AST Walker (Local)"**) to check the optional
   Ollama/OpenAI-compatible settings modal.

## What lives here

| File | Scope |
| --- | --- |
| `phase-01-parser.md` | Parser, resolution, topology, unresolved tracking |
| `phase-02-graph-ui.md` | Canvas, selection highlighting, inspector, explainer |
| `phase-03-agent-evals.md` | Agent tools, trace, local/LLM execution, eval metrics |
| `README.md` | This index and the spec-to-code gap list |

Do not rewrite `PROJECT.md` or `CLAUDE.md` as part of a documentation pass; they
are authoritative inputs.
