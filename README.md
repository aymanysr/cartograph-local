# Cartograph Local — Codebase Intelligence & Impact Graph

Inspired by the JavaScript Mastery tutorial (*"Nobody Can Read AI Code Anymore | Build a Full Stack Codebase Intelligence App (with AI Agents)"*), built to run **100% locally** on your machine with zero cloud dependencies required.

## Quick Start (Zero Setup)

1. **Open Directly in Your Browser**:
   Double-click `cartograph.html` in any modern browser. It loads `lib/cartograph-parser.js` from the same folder, so keep both files together.
2. **Load Any Local Repository**:
   - Click **"Open Local Folder"** in the top bar and select any project directory on your computer (uses the browser's local directory reader — no files ever leave your machine).
   - Or drag-and-drop a project folder or `cartograph-snapshot.json` file onto the window.
   - Or explore the **3 built-in sample codebases** (*Cartograph Next.js SaaS*, *FinTech Checkout Microservice*, and *Autonomous Agent Runtime*).
3. **Optional Local CLI Scanner & Server**:
   If you have Node.js installed, scan any local folder from your terminal with the same parser the browser uses:
   ```bash
   node cli/cartograph-scan.mjs /path/to/your/repo --out cartograph-snapshot.json
   node cli/cartograph-scan.mjs /path/to/your/repo --file src/lib/db.ts
   node cli/cartograph-scan.mjs /path/to/your/repo --serve 4173
   ```
   The CLI prints a terminal blast-radius report. With `--serve`, open <http://localhost:4173> and the scanned graph loads automatically.
4. **Optional Local LLM (Ollama)**:
   Cartograph includes a built-in deterministic AST graph-walking engine that works offline with zero configuration. If you run [Ollama](https://ollama.com) locally (`http://localhost:11434`), click **"Agent Settings"** in the top-right to connect your local model (e.g., `llama3.2`, `qwen2.5-coder`, `deepseek-coder`) to synthesize natural-language answers from the verified tool trace.

## Architecture

- **One parser, two consumers.** `lib/cartograph-parser.js` is the single deterministic source of truth for import/export extraction, module resolution, cycle detection, and blast-radius metrics. The browser app and the Node CLI both load it; neither duplicates parser logic nor calls an LLM.
- **No hidden edges.** The parser records every unresolved specifier in `graph.unresolved` (`source`, `specifier`, `kind`, `line`) so resolution accuracy can be inspected.
- **Works everywhere.** The parser is a classic script in the browser (no bundler, no server) and a CommonJS module in Node (zero npm dependencies).

## Project Structure
- `cartograph.html` — Self-contained local Codebase Intelligence web app (loads `lib/cartograph-parser.js`).
- `lib/cartograph-parser.js` — Shared standalone deterministic parser (browser + Node).
- `cli/cartograph-scan.mjs` — Zero-dependency Node.js CLI scanner, report, and local server.
- `test/parser.test.js` — `node:test` suite for parser resolution, cycles, and blast radius.
- `PROJECT.md` — Architectural specification, golden rules, and anti-goals.
- `CLAUDE.md` — Agent governance rules and invariants for coding agents.
- `specs/` — Phase-by-phase engineering specifications (`phase-01` through `phase-03`).

## Tests

```bash
node --test
```

The suite runs against `parseRepository(files)` — the same public seam the CLI and browser app use.
