# Goldfish annotated review report

**Target:** `../../specs/2026-10-27-quiet-shell-redesign-design.md` (full file).
**Status:** resolved at design level; final fresh-context zoom-out and builder recheck reported no material residual spec issues.
**Scope:** feature-design review and advisory builder check. Application implementation has not started.

The continuation instruction authorizes progressing with sufficient workspace context. These reversible document repairs were applied without additional intake/approval questions. The recorded dark mockup and parser/grounding invariants remain the basis for the repairs.

## Prioritized findings and resolutions

Every row is **PROPOSE FIX**, applied to the named section. None was contested, escalated or declined. Original severities are preserved in the source reports; B1 is Blocker while the duplicate Z3/C1 findings are Major.

| Item | Raw findings | Severity | Discrepancy and rationale | Applied edit |
| --- | --- | --- | --- | --- |
| F1 | B1, Z3, C1 | Blocker / Major duplicates | Light framed-sheet JSON conflicts with locked dark tokens/mockup. | Intent/reference precedence explicitly names the mismatch. Archive original JSON unchanged; reconstruct the active sheet with data-terminal/dark/seed 1049632490 and `keep: type`. Record the reconstruction, type override and tool command. |
| F2 | Z1, C2, B2 | Major | Hiding Explorer would also hide global navigation/settings. | Shell now places rail/top/status outside all three sibling switched panes. |
| F3 | Z2, C3, B2 | Major | 582px of fixed side panes cannot fit a 390px viewport. | Add desktop >1100, tablet 641–1100 and phone ≤640 contracts, explicit menu/sheet/region transitions, return paths, state preservation and touch targets. |
| F4 | C4, B6 | Major | “Edges out of selected” describes imports rather than dependents. | Canvas now defines source/target predicates and `C → B → A` acceptance example; outbound stays neutral. |
| F5 | Z4, C5 | Major | Gate script paths do not exist in repository. | Verification supplies complete installed-tool commands, explicit targets/widths, before/after output, type-override limitation and browser-state coverage. |
| F6 | B3, D2 | Major | Layout actions disappear; old setters dereference removed controls; choices remain open. | Add both layout actions and the handler map; retain native repo select/custom gating; specify visited-mark lifetime, folder grouping and deliberate DOM consumer rewiring. |
| F7 | B4, D3 | Major | Essential palette navigation lacks focus, keyboard, result and availability contracts. | Specify native dialog/combobox, initial/restored/trapped focus, mode switch, Meta/Ctrl shortcuts, IME/overlay arbitration, ranking/cap/empty behavior and disabled-action rules. |
| F8 | B5, D4 | Major | Required small text uses low-contrast faint token. | Essential labels/counts/metadata use muted or brighter at ≥4.5:1, with minimum sizes and independent visible keyboard focus; faint is decorative only. |
| F9 | S1, D1 | Major | Required alternatives comparison missing. | Add review-time comparison of simplified current navigation, selected rail/split explorer and palette-only navigation; do not fabricate prior owner decisions. |
| F10 | S2 | Major | Explicit risks/mitigations missing. | Add DOM lookup, safe filename/source rendering, focus, narrow-layout/fit, known force-layout limit and stale async-result risks with checks. Preserve unchanged network/shared-module scope. |
| F11 | S3 | Major | Label-width selection conflicts with ~8px extension and exceptions. | Choose exactly label-width 1px underlines; list row/rail/node exceptions and use outer outline instead of glow. |

Further clarifications make existing requirements testable: real freshness versus sample/snapshot labels; one primary per view; empty graph clears stale inspector; Evals uses explicit-run presentation and graph/mode invalidation without changing scorer math; Docs keeps editing/copy/sync/download.

## Evidence and limits

Raw reports: `zoom_out_report.md`, `comprehension_report.md`, `design_critic_report.md`, `structure_style_report.md`, `critic_report.md`, `builder_check_report.md`. The reviewers were launched with `fork_turns: none`; the root applied repairs only after their completed reports arrived.

Baseline: `node --test` passed 53/53; CLI scan succeeded with 16 nodes, 12 edges, 0 cycles, 20 unresolved external imports, 0 unresolved internal imports. These checks cover the unchanged baseline, not a redesigned browser UI.

Usage checks ran `npx -y ccusage@latest blocks --active --json` before/between waves. Each completed check reported `{"blocks":[]}`; this supplies no usable 5-hour/weekly percentage and is not evidence of zero usage. Review waves stayed at three simultaneous subagents or fewer.

No application code, shared library, prior provider session or server process was modified. No design-gate pass or formal implementation-readiness pass is claimed. Fresh-context results are recorded in `intermediate_zoom_out_report.md` and `builder_recheck_report.md`; detailed execution planning remains a separate stage. Resolution count: 11 consolidated fixes, 0 contested, 0 escalated, 0 declined; no material unresolved feature-design finding reported by the rechecks.
