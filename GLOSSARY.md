# Cartograph Domain Glossary

## Core Architecture & Dependency Graph
- **Blast Radius**: The full set of files that break if a target module changes: its 1-hop direct dependents plus its 2-hop transitive dependents.
- **1-Hop / Direct Dependents**: Modules that directly import the target file.
- **2-Hop / Transitive Dependents**: Modules that import a 1-hop dependent, excluding the target and 1-hop sets.
- **Outbound Imports**: Modules that the target file directly imports.
- **Barrel File**: An `index.ts` / `index.tsx` / `index.js` / `__init__.py` module that aggregates and re-exports a directory's modules.
- **Grounded**: Every cited file path exists in the parsed graph.
- **Provenance**: Strict verification that every cited file path appeared in the visible agent AST tool trace.
- **Chip / Badge**: An interactive UI element (`data-filepath="..."`) that selects and focuses a module on the canvas.
- **Rejection Toast**: The on-screen alert displayed when external LLM synthesis cites ungrounded or untraced paths.
- **Classic Script**: An ordinary `<script src>` file running in document order where top-level declarations attach to global scope.

## Deepened Subsystems
- **Viewport Camera**: The shared, zero-dependency projection engine (`lib/cartograph-fit.js`) governing world-to-screen coordinate mapping, cursor-anchored focal zoom, node centering, and bounding-box auto-framing.
- **Intake Pipeline**: The unified file ingestion engine (`lib/cartograph-intake.js`) providing snapshot discrimination, common root normalization, folder pruning, and skip policy enforcement for CLI and browser adapters.
- **Structured Agent Plan**: The presentation-free domain record emitted by `lib/cartograph-agent.js` containing the deterministic tool trace, topological blast radius, and provenance-validated citations.
