# PROJECT.md — Cartograph (Local Codebase Intelligence & Impact Graph)

## Who This Is For
Someone opening a codebase they didn't write—usually one built rapidly with AI coding agents—who needs to understand how modules connect and what will break before changing a file.

## The Core Problem
AI coding agents write thousands of lines of working code across dozens of files. Folder trees hide how files actually depend on each other. Changing one seemingly isolated file can silently break 11 downstream modules two hops away. Worse, asking a standard LLM about a codebase produces confident, well-written explanations that invent connections that do not exist.

## The Golden Rule
**Every line on the map comes from parsing real code.**
- Connections are never guessed, inferred, or summarized by an LLM.
- The AST/import parser proves the graph first (`nodes`, `edges`, `exports`, `imports`, `lineNumbers`).
- The AI is **only** allowed to explain or traverse edges that the parser has already proved exist.

## Core Capabilities
1. **Local Repository Parser (Deterministic AST/Import Engine)**
   - Parses TypeScript/JavaScript (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`), Python (`.py`), and Go (`.go`) directly from local folders or via the local CLI scanner.
   - Resolves relative imports (`./`, `../`), TypeScript path aliases (`@/`), barrel files (`index.ts`), dynamic `import()`, CommonJS `require()`, and Python `from ... import ...`.
   - Extracts exported symbols (functions, classes, types, interfaces, constants) and exact line numbers for every import edge.

2. **Interactive Dependency Map & 2-Level Blast Radius**
   - Visualizes every file as a node sized by its dependent count (in-degree) and colored by architectural layer (`app/routes`, `components`, `agent/ai`, `parser/core`, `db/lib`, `types/config`).
   - Selecting any file immediately highlights:
     - **Selected File** (Indigo/Primary)
     - **Direct Dependents — 1 Hop Out** (Rose/Red): Files that directly import the selected file and will break immediately if its exports change.
     - **Transitive Blast Radius — 2 Hops Out** (Amber): Files that import the 1-hop dependents and will suffer cascading breakage.
     - **Outbound Imports** (Cyan): Modules that the selected file depends on.

3. **Grounded Module Explainer**
   - Generates a concise architectural explanation of the selected module built strictly from the selected file's AST and its verified 1-hop neighbors.
   - Every referenced file path is rendered as a clickable chip that selects and focuses that node on the graph.

4. **Graph-Walking Codebase Agent ("Ask the Repository")**
   - Answers multi-step architectural questions (e.g., *"Where does auth get enforced?"*, *"What breaks if I change the database client?"*) by executing a visible tool-calling loop over the parsed graph:
     - `find_entry_points()`
     - `search_symbols(query)`
     - `get_file_ast(path)`
     - `walk_dependents(path, depth=2)`
     - `trace_dependency_path(source, target)`
   - Works 100% locally using the built-in deterministic graph-walker, with optional 1-click connection to a local **Ollama** model (`http://localhost:11434`) or OpenAI-compatible API.

5. **Quantitative Agent Evals ("Catching the AI with a Number")**
   - Runs a golden dataset of repository questions against the agent and computes numerical scores for:
     - **Citation Groundedness (%)**: Every file cited in the answer must exist in the parsed graph and have been inspected by a tool call.
     - **Blast-Radius Recall (%)**: All 1-hop and 2-hop dependents must be accurately identified.
     - **Zero Hallucinated Edges**: Any invented file path or unverified connection drops the score to 0.

## Things We Refuse To Do (And Why)
- **No "Code Quality Grades" or arbitrary 1–10 health scores**: LLMs invent subjective numbers that mean nothing across runs. Only report deterministic metrics (in-degree, out-degree, 2-hop blast radius count, circular dependency cycles).
- **No LLM-inferred edges**: Never let a language model guess that File A calls File B without a parsed import or symbol reference. A map that is 90% right is worse than no map at all because you cannot tell which 10% is lying.
- **No hidden agent loops**: Every step the agent takes to answer a question must be visible in the trace log with the exact tool name, arguments, and returned file paths.

## Where This Is Likely To Go Wrong (High-Risk Areas)
1. **Path Alias & Barrel File Resolution**: If `@/lib/db` resolves to `src/lib/db/index.ts` in the compiler but the parser leaves it as an unresolved string `@/lib/db`, half the graph edges will silently disappear while still rendering a pretty picture. Always strip aliases (`@/ -> src/`), try extension candidates (`.ts`, `.tsx`, `.js`, `/index.ts`, `/index.tsx`), and match suffix paths when root prefixes vary.
2. **Silent Hallucination in Module Summaries**: When using an LLM via Ollama or API, the prompt must pass the exact list of allowed neighbor file paths and reject any cited path not present in the parsed graph.
