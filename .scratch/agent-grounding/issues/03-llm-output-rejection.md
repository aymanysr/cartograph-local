# Ticket 03 — LLM synthesis must reject ungrounded paths

Owner: agent · Status: open · Blocked by: none

## Contract

After an optional Ollama/OpenAI-compatible synthesis replaces the deterministic answer:

- Only replace the deterministic answer when every file path the model named exists in `state.graph.nodes` and appeared in the tool trace (`plan.visitedFiles`).
- Otherwise keep the deterministic synthesis and show a toast naming the rejected model.
- Reuse the same path-scanning approach already used for chip-ification.

## Acceptance

- A model response naming a path outside the trace cannot reach the UI; row covered by a browser QA check (CLI/Node tests cannot exercise the fetch path).
