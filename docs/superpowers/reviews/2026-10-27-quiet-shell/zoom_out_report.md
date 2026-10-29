# Initial zoom-out review

Target: `../../specs/2026-10-27-quiet-shell-redesign-design.md`, original lines 1–155. EGM Stage 5, fresh-context read-only reviewer. Review completed on 2026-10-27.

## Findings

| ID | Severity | Scope | Finding and proposed resolution |
| --- | --- | --- | --- |
| Z1 | Major | Shell; constraint 6 | The rail is inside `viewExplorer`, but `switchMainView()` hides that entire element for Evals/Docs. Keep the rail and shared shell outside the three switched panes. |
| Z2 | Major | Shell; verification | Fixed rail, browser and inspector consume 582px before the canvas. Specify tablet/phone pane transitions before requiring the 390px design gate. |
| Z3 | Major | Direction; references | `.taste-skill/direction.json` contains light `framed-sheet`, seed 1215534039, conflicting with the locked dark `data-terminal` design and seed 1049632490. Establish reference precedence and a matching verification configuration. |
| Z4 | Major | Verification | Repository `scripts/` does not exist. Use the installed skill's absolute tool paths and explicit source/HTML targets. |

Existing search, chips, selection, view/filter/sort handlers, export and modals can be reused for palette actions. No material YAGNI finding.

## Evidence read

Complete target; `PROJECT.md`, `CLAUDE.md`, root `README.md`, `app/README.md`; assigned zoom-out persona and standard; complete referenced app-screen standard; direction JSON; fit helper and tests; complete graph-state/UI-panel scripts. Relevant app-shell/HTML sections and mockups inspected; app code searched for reuse. Missing repository scripts were explicitly reported.
