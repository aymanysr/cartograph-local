# Ticket 03 — LLM synthesis must reject ungrounded paths

Owner: agent · Status: done · Blocked by: none

## Contract

After an optional Ollama/OpenAI-compatible synthesis replaces the deterministic answer:

- Only replace the deterministic answer when every file path the model named exists in `state.graph.nodes` and appeared in the tool trace (`plan.visitedFiles`).
- Otherwise keep the deterministic synthesis and show a toast naming the rejected model.
- Reuse the same path-scanning approach already used for chip-ification.

## Acceptance

- A model response naming a path outside the trace cannot reach the UI; row covered by a browser QA check (CLI/Node tests cannot exercise the fetch path).

## Outcome (done)

- New DOM-free gate `CartographAgent.validateSynthesis(rawText, graph, tracePaths)` in `lib/cartograph-agent.js`, with helpers `findPathLikeMentions` (URL stripping, slash-token + dotted-final-segment detection, sentence-trailing-`.` trimming) and `findAuthNodes` reused from the planner. Returns `{ accepted, citedPaths, unknownPaths, unprovenPaths }`.
- 8 red-first unit tests added to `test/agent.test.js` (invented-path rejection, untraced-real-path rejection, trace acceptance, URL/slash-prose tolerance, graph-less trace, path-less prose, empty inputs) — suite now 37/37.
- `cartograph.html` `runAgentQuery` wires it: accepted synthesis is escaped + chip-ified only if fully grounded and traced; otherwise the deterministic synthesis is kept and `showToast("Rejected <model> answer — ungrounded path(s): …", "warn")` names up to 3 rejected paths.
- Browser QA: a deterministic mock Ollama server (no real LLM) served the app + injected `cartograph_agent_config` + the real self-scan graph. Headless Chrome (`--dump-dom`) verified both paths on the real fetch route:
  - grounded reply citing the trace-backed node (`test/agent.test.js`) → accepted, card body replaced with the reply, citation chip-ified, no rejection toast;
  - hallucinated reply also citing `src/middleware/session-cookie.ts` + `lib/claims/mock-cache.ts` → rejected, amber warn toast `Rejected mock-llm answer — ungrounded path(s): src/middleware/session-cookie.ts, lib/claims/mock-cache.ts`, deterministic synthesis kept, invented tokens never chip-ified, no invented-path chip in the DOM.
- Note: the browser QA caveat in this ticket's acceptance line is dissolved — the mock Ollama endpoint makes the fetch path testable in the browser (the mock extended the served HTML with a localStorage preload before `DOMContentLoaded`).
