# Phase 03 — Graph-Walking Agent & Quantitative Evals

## Goal
Answer multi-hop architectural questions by walking the real dependency graph step-by-step, and verify agent trustworthiness with a deterministic evaluation suite.

## Specification
1. Implement agent tools that query the parsed AST graph (`find_entry_points`, `search_symbols`, `get_file_ast`, `walk_dependents`, `trace_path`, `detect_cycles`).
2. Record every tool call in a visible step-by-step execution trace before producing the final answer.
3. Support 100% local deterministic execution out-of-the-box, plus optional connection to local Ollama (`http://localhost:11434`) or an OpenAI-compatible endpoint.
4. Provide an Evaluation Suite tab that runs benchmark questions and scores Citation Groundedness, Blast-Radius Recall, and Hallucination Rate (`0%` required).
