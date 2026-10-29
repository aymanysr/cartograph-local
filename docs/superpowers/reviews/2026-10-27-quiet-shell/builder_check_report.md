# Builder check

Target: original design, lines 1–155. Fresh-context read-only builder, using the implementation-readiness and codebase-details personas. This is advisory: no detailed implementation plan existed, so it is not a formal EGM Stage 9 pass.

| ID | Severity | Scope | Finding and proposed resolution |
| --- | --- | --- | --- |
| B1 | Blocker | Direction; references | Saved light framed-sheet metadata contradicts the locked dark design. Pin a matching artifact; preserve the original JSON and mockup. |
| B2 | Major | Shell | Persistent navigation inside a hidden pane and no tablet/phone contract. Same issues as Z1/Z2. |
| B3 | Major | Canvas; palette; builder choices | Replacement destinations omit both graph layouts. Existing `setGraphLayout()` dereferences removed button IDs. Preserve actions and rewire DOM consumers; choose repository control and visited-mark lifetime. |
| B4 | Major | Palette | Define initial focus, focus containment/restoration, background inertness, list selection announcements, Tab, empty Enter, availability outside Map, ranking and touch access. |
| B5 | Major | Tokens; typography | Essential small text uses `#5f6065`: calculated contrast 2.97:1 on surface, 2.85:1 on ground, 2.58:1 on raised. Use existing `--muted` for essential labels/counts; reserve faint for decoration and define visible keyboard focus. |
| B6 | Major | Canvas | Edge coloring reverses dependency direction. Use incoming rose, hop2→hop1 amber, outbound neutral and a three-node acceptance example. Same issue as C4. |

Evidence: full design; requested personas and implementation standard; `CLAUDE.md`, `PROJECT.md`, `app/README.md`; full UI-panel/graph-state scripts; relevant app-shell/canvas/agent code and canonical HTML; actual direction JSON and approved mockup. No edits or tests by reviewer.
