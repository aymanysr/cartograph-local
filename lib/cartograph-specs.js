/**
 * Cartograph Architectural Spec Engine (lib/cartograph-specs.js)
 *
 * Zero dependencies. No DOM or CLI I/O.
 * Shared pure module for generating deterministic architectural specifications,
 * agent rules, and local CLI scanner scripts from a Cartograph graph model.
 *
 * Public API:
 * - generateProjectSpec(graph, options)
 * - generateClaudeRules(graph, options)
 * - generateCliSnippet(graph, options)
 * - generateSpecDocs(graph, options)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CartographSpecs = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_LAYER_LABELS = Object.freeze({
    ui: 'UI & Entry',
    api: 'API & Auth',
    agent: 'Agent & Evals',
    parser: 'Parser Engine',
    core: 'DB & Core',
  });

  const DEFAULT_LAYER_ORDER = Object.freeze(['ui', 'api', 'agent', 'parser', 'core']);

  /**
   * Generates a PROJECT.md architecture and context spec markdown document.
   */
  function generateProjectSpec(graph, options = {}) {
    const g = graph || {};
    const nodes = g.nodes || [];
    const edges = g.edges || [];
    const cycles = g.cycles || [];
    const repoName = options.repoName || g.name || 'repository';
    const repoDescription = options.repoDescription || g.description || 'Local codebase analyzed by Cartograph AST Engine.';

    const sortedHotspots = typeof g.getTopHubs === 'function'
      ? g.getTopHubs(5)
      : [...nodes].sort((a, b) => (b.totalImpact || 0) - (a.totalImpact || 0)).slice(0, 5);

    const hotspotLines = sortedHotspots.length > 0
      ? sortedHotspots.map(n =>
          `- \`${n.path}\` — **${n.totalImpact || 0} total dependents** (${(n.hop1Files || []).length} direct 1-hop, ${(n.hop2Files || []).length} transitive 2-hop) • Exports: \`${(n.exports || []).join(', ')}\`` // taste-skill-ignore
        ).join('\n')
      : '- (No hotspot modules identified)';

    const layerOrder = options.layerOrder || DEFAULT_LAYER_ORDER;
    const layerLabels = Object.assign({}, DEFAULT_LAYER_LABELS, options.layerLabels || {});

    const layerBreakdown = layerOrder.map(l => {
      const matching = typeof g.getNodesInLayer === 'function'
        ? g.getNodesInLayer(l)
        : nodes.filter(n => n.layer === l);
      const label = layerLabels[l] || l;
      return `- **${label}** (${matching.length} files): ${matching.map(m => '`' + m.path + '`').join(', ') || 'None'}`;
    }).join('\n');

    return `# PROJECT.md — ${repoName} (Architecture & Context Spec) <!-- taste-skill-ignore -->

## 1. What This Repository Is
${repoDescription}
- **Parsed Source Files**: ${nodes.length}
- **Verified Internal Import Edges**: ${edges.length}
- **Circular Dependencies**: ${cycles.length}

## 2. Architectural Layers (Verified by AST Parser)
${layerBreakdown}

## 3. High-Blast-Radius Hotspots (Check Before Modifying!)
Changing the exported signatures of these modules will break the largest number of downstream files:
${hotspotLines}

## 4. What We Refuse To Do (Non-Goals & Reasons)
- **No Unverified AI Connections**: Every dependency edge must come from parsing real source imports. A dependency map that is 90% right is worse than no map at all because engineers cannot tell which 10% is hallucinated.
- **No Arbitrary Health Grades**: Never invent subjective "Code Quality Scores". Report only deterministic in-degree, out-degree, 2-hop blast radius counts, and circular dependency cycles.
- **No Silent Alias Fallbacks**: Always resolve \`@/\`, \`./\`, \`../\`, and barrel \`index\` files deterministically so edges never disappear silently.
`;
  }

  /**
   * Generates a CLAUDE.md agent engineering rules document.
   */
  function generateClaudeRules(graph, options = {}) {
    const g = graph || {};
    const nodes = g.nodes || [];
    const cycles = g.cycles || [];
    const repoName = options.repoName || g.name || 'repository';

    const sortedHotspots = typeof g.getTopHubs === 'function'
      ? g.getTopHubs(5)
      : [...nodes].sort((a, b) => (b.totalImpact || 0) - (a.totalImpact || 0)).slice(0, 5);

    const topHotspotPath = sortedHotspots[0]?.path || 'core modules';
    const cycleAlert = (cycles.length > 0 && Array.isArray(cycles[0]) && cycles[0].length >= 2)
      ? `- **Active Tech Debt Alert**: Resolve the circular dependency between \`${cycles[0][0]}\` and \`${cycles[0][1]}\` by extracting shared interfaces into \`src/types/\`.`
      : '- **DAG Invariant**: Keep Circular Dependencies at 0.';

    return `# CLAUDE.md — Agent Engineering Rules for ${repoName} <!-- taste-skill-ignore -->

## 1. Mandatory Pre-Flight Check
Before modifying any file in \`${repoName}\`:
1. Inspect its **1-Hop Direct Dependents** and **2-Hop Transitive Dependents** in Cartograph.
2. If the target file has \`totalImpact >= 3\` (such as \`${topHotspotPath}\`), do NOT change exported function signatures or return shapes without updating all 1-hop callers in the same atomic step.

## 2. Architecture Invariants
- **Strict Layer Boundaries**:
  - Core/DB modules must never import from UI or Route handlers.
  - Parser modules must remain 100% standalone and deterministic.
- **Zero Hallucinated Paths**: Never reference a file path unless it exists in the repository file tree.
${cycleAlert}

## 3. Communication Protocol
- When an architectural trade-off arises, stop and ask a concrete **A or B question** with a 1-sentence trade-off and your recommended default.
- No walls of text. State the exact file path and line number when reporting issues.
`;
  }

  /**
   * Generates a standalone cartograph-scan.mjs CLI scanner script snippet.
   */
  function generateCliSnippet() {
    return `#!/usr/bin/env node
// Run locally: node cli/cartograph-scan.mjs /path/to/repo --serve 4173
import fs from 'node:fs';
import path from 'node:path';
import CartographParser from '../lib/cartograph-parser.js';

const IGNORED = new Set(['node_modules', '.git', '.next', 'dist', 'build', '__pycache__', '.venv']);
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.py', '.go']);

export function scanLocalRepo(rootDir, dir = rootDir, list = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !IGNORED.has(entry.name)) scanLocalRepo(rootDir, full, list);
    else if (entry.isFile() && EXTS.has(path.extname(entry.name))) {
      list.push({ path: path.relative(rootDir, full).replace(/\\\\/g, '/'), content: fs.readFileSync(full, 'utf8') });
    }
  }
  return list;
}

if (import.meta.url === \`file://\${process.argv[1]}\`) {
  const target = path.resolve(process.argv[2] || '.');
  const files = scanLocalRepo(target);
  const graph = CartographParser.parseRepository(files, { repoName: path.basename(target) });
  fs.writeFileSync('cartograph-snapshot.json', JSON.stringify({ name: path.basename(target), graph }, null, 2));
  console.log(\`Scanned \${graph.nodes.length} nodes / \${graph.edges.length} edges into cartograph-snapshot.json\`);
}`;
  }

  /**
   * Generates all three specification documents as an object dictionary.
   */
  function generateSpecDocs(graph, options = {}) {
    return {
      'PROJECT.md': generateProjectSpec(graph, options),
      'CLAUDE.md': generateClaudeRules(graph, options),
      'cartograph-scan.mjs': generateCliSnippet(graph, options),
    };
  }

  return {
    DEFAULT_LAYER_LABELS,
    DEFAULT_LAYER_ORDER,
    generateProjectSpec,
    generateClaudeRules,
    generateCliSnippet,
    generateSpecDocs,
  };
});
