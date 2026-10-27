# CLAUDE.md — Agent Governance & Engineering Rules

## 1. Role & Operating Mode
You are working on **Cartograph Local**, a deterministic codebase intelligence application. Before writing or modifying any code, read `PROJECT.md` and the active phase spec in `specs/`.

## 2. Non-Negotiable Architecture Invariants
1. **Parser Standalone Rule**: The code parser (`parseRepository` / `cli/cartograph-scan.mjs`) must remain 100% standalone and deterministic. It must never call an LLM or external network service to construct the dependency graph.
2. **Strict Grounding Contract**: Any explanation or agent response shown in the UI must only reference file paths that exist in `state.graph.nodes`. Every mentioned file path must be rendered as an interactive badge (`data-filepath="..."`) so the user can click it to verify.
3. **2-Hop Blast Radius Definition**:
   - `hop1` (Direct Dependents): `{ u | (u -> selected) in edges }`
   - `hop2` (Transitive Dependents): `{ v | (v -> u) in edges for u in hop1 } - hop1 - {selected}`
   - `outbound` (Direct Imports): `{ w | (selected -> w) in edges }`
4. **Visible Agent Tool Trace**: When answering a repository question, the agent must log each tool invocation (`tool`, `args`, `resultSummary`, `verifiedFiles`) in the step-by-step trace panel before emitting the final synthesis.

## 3. Communication & Decision Protocol
- If an architectural ambiguity arises, do not guess silently and do not ask open-ended questions. Present a concrete **A or B choice** with a 1-sentence trade-off and your recommended default.
- Keep explanations in plain English—no walls of boilerplate text.
- Never silently swallow unresolved internal imports; track them so parser resolution accuracy can be inspected.

## 4. Verification Checklist Before Completing Any Task
- [ ] Does the parser resolve `./`, `../`, `@/`, and `/index` barrel imports across the loaded repository?
- [ ] Does clicking any node immediately update the 1-hop and 2-hop blast radius counts, graph highlighting, and grounded module explanation?
- [ ] Are all file badges inside explanations and agent answers clickable to jump to that file on the map?
- [ ] Does the Evaluation Suite score 100% on Citation Groundedness with zero hallucinated file paths?
