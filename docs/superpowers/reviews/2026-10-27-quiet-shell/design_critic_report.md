# Design critique

EGM Stage 7, fresh-context read-only design critic, original design lines 1–155.

| ID | Severity | Scope | Finding and proposed resolution |
| --- | --- | --- | --- |
| D1 | Major | Locked decisions | No alternatives comparison. Compare simplified existing navigation, persistent rail/split inspector and palette-only navigation. Same issue as S1. |
| D2 | Major | Canvas; palette | Both graph layout destinations are omitted. Add Layered map and Force graph actions and test both. Same issue as B3. |
| D3 | Major | Palette | Essential navigation lacks clickable/Ctrl access, focus containment/restoration, accessible selection and overlay arbitration. Same issue as B4. |
| D4 | Major | Tokens; browser; canvas | Essential counts and metadata use low-contrast faint text. Use muted or brighter with a 4.5:1 minimum. Same issue as B5. |

Read: full target; critic instructions and feature-spec standard; `PROJECT.md`, `CLAUDE.md`, `app/README.md`, UI-panel source, RTK rules. Relevant canonical HTML, app-shell and canvas source excerpts searched. No required files missing.
