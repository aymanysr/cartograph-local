# Phase 02 — Interactive Dependency Map & Blast Radius Inspector

## Goal
Let an engineer visually navigate the parsed repository, click any file, and immediately see its 1-hop and 2-hop blast radius alongside a grounded explanation.

## Specification
1. Render an interactive HTML5 canvas graph with pan, zoom, node dragging, architectural layer coloring, and both Hierarchical DAG and Force-Directed layouts.
2. When a node is selected:
   - Highlight the selected node in Indigo, 1-hop dependents in Rose, 2-hop transitive dependents in Amber, and outbound imports in Cyan.
   - Display the exact list of 1-hop and 2-hop affected files with line numbers and import statements.
   - Generate a Grounded Module Explanation referencing only verified connected files, where every file name is clickable.
