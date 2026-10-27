# Cartograph Local — Codebase Intelligence & Impact Graph

Inspired by the JavaScript Mastery tutorial (*"Nobody Can Read AI Code Anymore | Build a Full Stack Codebase Intelligence App (with AI Agents)"*), built to run **100% locally** on your machine with zero cloud dependencies required.

## Quick Start (Zero Setup)

1. **Open Directly in Your Browser**:
   Double-click `cartograph.html` in any modern browser.
2. **Load Any Local Repository**:
   - Click **"Open Local Folder"** in the top bar and select any project directory on your computer (uses the browser's local directory reader — no files ever leave your machine).
   - Or drag-and-drop a project folder or `cartograph-snapshot.json` file onto the window.
   - Or explore the **3 built-in sample codebases** (*Cartograph Next.js SaaS*, *FinTech Checkout Microservice*, and *Autonomous Agent Runtime*).
3. **Optional Local CLI Scanner & Server**:
   If you have Node.js installed, you can also scan any local folder from your terminal:
   ```bash
   node cli/cartograph-scan.mjs /path/to/your/repo --serve 4173
   ```
4. **Optional Local LLM (Ollama)**:
   Cartograph includes a built-in deterministic AST graph-walking engine that works offline with zero configuration. If you run [Ollama](https://ollama.com) locally (`http://localhost:11434`), click **"Agent Settings"** in the top-right to connect your local model (e.g., `llama3.2`, `qwen2.5-coder`, `deepseek-coder`) to synthesize natural-language answers from the verified tool trace.

## Project Structure
- `cartograph.html` — Self-contained local Codebase Intelligence web app.
- `cli/cartograph-scan.mjs` — Zero-dependency Node.js CLI scanner & local server.
- `PROJECT.md` — Architectural specification, golden rules, and anti-goals.
- `CLAUDE.md` — Agent governance rules and invariants for coding agents.
- `specs/` — Phase-by-phase engineering specifications (`phase-01` through `phase-03`).
