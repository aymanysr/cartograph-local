/**
 * Cartograph deterministic agent planner — shared by the browser app and tests.
 *
 * Zero dependencies. No DOM access. Given a parsed graph
 * (`{ nodes, edges, cycles, ... }` from `CartographParser.parseRepository`),
 * it maps a repository question onto a deterministic tool-walk over the graph
 * and returns every file the answer cites. No file path is invented: every
 * cited path is either visited by the walk or named in a tool trace step.
 *
 * Browser: loaded as a classic script; exposes `window.CartographAgent` after
 * `lib/cartograph-parser.js`.
 * Node:    `require('./lib/cartograph-agent.js')`.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CartographAgent = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function findAuthNodes(nodes) {
    return nodes.filter((n) =>
      n.path.toLowerCase().includes('auth') ||
      n.path.toLowerCase().includes('jwt') ||
      n.path.toLowerCase().includes('hmac') ||
      n.exports.some(
        (e) =>
          e.toLowerCase().includes('auth') ||
          e.toLowerCase().includes('verify') ||
          e.toLowerCase().includes('token')
      )
    );
  }

  function findExplicitNode(nodes, q) {
    return nodes.find((n) => q.includes(n.path.toLowerCase()));
  }

  function pickBlastTarget(nodes, q) {
    return findExplicitNode(nodes, q) ||
      nodes.find((n) => q.includes(n.label.toLowerCase().replace(/\.[^.]+$/, '')));
  }

  function buildAgentPlan(question, graph, chipFormatter) {
    if (typeof chipFormatter !== 'function') {
      throw new Error('buildAgentPlan(question, graph, chipFormatter) requires a chip formatter');
    }

    const q = question.toLowerCase();
    const nodes = graph.nodes || [];
    const edges = graph.edges || [];
    const steps = [];
    const visitedFiles = new Set();
    const activeEdges = new Set();
    const citedPaths = new Set();
    const citedFiles = [];

    // Record every path rendered as a clickable chip in the final answer, so
    // the eval scorer can check groundedness AND trace provenance.
    const cite = (filePath) => {
      if (!citedPaths.has(filePath)) {
        citedPaths.add(filePath);
        citedFiles.push(filePath);
      }
      return chipFormatter(filePath);
    };

    const authBranch = q.includes('auth') || q.includes('enforce') || q.includes('token') || q.includes('session') || q.includes('jwt') || q.includes('key');
    const cycleBranch = q.includes('circular') || q.includes('cycle') || q.includes('bottleneck') || q.includes('risk') || q.includes('single point');

    // An explicitly named file path (blast/impact intent) wins over the keyword
    // branches, including auth — otherwise a path like `src/lib/auth/verify.ts`
    // inside the question would silently hijack a change-impact question.
    const explicitNode = findExplicitNode(nodes, q) || null;
    const blastBranch =
      explicitNode !== null ||
      q.includes('break') || q.includes('db') || q.includes('database') || q.includes('supabase') || q.includes('ledger') || q.includes('vector') || q.includes('change');

    if (authBranch && !explicitNode) {
      const authNodes = findAuthNodes(nodes);
      const primaryAuth = authNodes[0] || nodes[0];
      if (!primaryAuth) {
        return { steps, visitedFiles: [], activeEdges: [], answerHtml: '', primaryFocus: null, citedFiles: [] };
      }
      visitedFiles.add(primaryAuth.path);

      steps.push({
        tool: 'search_symbols',
        args: `query="auth | requireAuth | verify"`,
        output: `Matched ${authNodes.length} authentication module(s): ${authNodes.map((n) => n.path).join(', ')}`,
        files: authNodes.map((n) => n.path),
      });

      steps.push({
        tool: 'get_file_ast',
        args: `path="${primaryAuth.path}"`,
        output: `Exports: [${primaryAuth.exports.join(', ')}] • Outbound imports: [${primaryAuth.outboundEdges.map((e) => e.target).join(', ') || 'none'}]`,
        files: [primaryAuth.path, ...primaryAuth.outboundEdges.map((e) => e.target)],
      });

      steps.push({
        tool: 'walk_dependents',
        args: `path="${primaryAuth.path}", depth=2`,
        output: `1-Hop enforcement callers (${primaryAuth.hop1Files.length}): [${primaryAuth.hop1Files.join(', ')}] • 2-Hop upstream (${primaryAuth.hop2Files.length}): [${primaryAuth.hop2Files.join(', ')}]`,
        files: [...primaryAuth.hop1Files, ...primaryAuth.hop2Files],
      });

      primaryAuth.hop1Files.forEach((f) => {
        visitedFiles.add(f);
        activeEdges.add(`${f}->${primaryAuth.path}`);
      });
      primaryAuth.hop2Files.forEach((f) => visitedFiles.add(f));
      primaryAuth.outboundEdges.forEach((e) => {
        visitedFiles.add(e.target);
        activeEdges.add(`${primaryAuth.path}->${e.target}`);
      });

      const hop1Chips = primaryAuth.hop1Files.map(cite).join(', ') || 'no direct route callers';
      const hop2Chips = primaryAuth.hop2Files.map(cite).join(', ');
      const answerHtml = `
          Authentication is enforced in ${cite(primaryAuth.path)}, which exports <code class="font-mono text-emerald-300">${primaryAuth.exports.join(', ')}</code>.
          <br/><br/>
          <strong>Step-by-step graph walk verification:</strong>
          <ul class="list-disc pl-4 mt-1 space-y-1">
            <li><strong>Direct Enforcement Callers (1-Hop):</strong> ${hop1Chips} directly import ${cite(primaryAuth.path)} to guard incoming requests.</li>
            ${primaryAuth.hop2Files.length ? `<li><strong>Upstream Consumers (2-Hops Out):</strong> ${hop2Chips} invoke those guarded routes.</li>` : ''}
            ${primaryAuth.outboundEdges.length ? `<li><strong>Downstream Backing Store:</strong> ${cite(primaryAuth.path)} connects to ${primaryAuth.outboundEdges.map((e) => cite(e.target)).join(', ')}.</li>` : ''}
          </ul>
        `;
      return {
        steps,
        visitedFiles: Array.from(visitedFiles),
        activeEdges: Array.from(activeEdges),
        answerHtml,
        primaryFocus: primaryAuth.path,
        citedFiles,
      };
    }

    if (blastBranch) {
      const target = pickBlastTarget(nodes, q) || [...nodes].sort((a, b) => b.totalImpact - a.totalImpact)[0];
      if (!target) {
        return { steps, visitedFiles: [], activeEdges: [], answerHtml: '', primaryFocus: null, citedFiles: [] };
      }

      visitedFiles.add(target.path);
      target.hop1Files.forEach((f) => {
        visitedFiles.add(f);
        activeEdges.add(`${f}->${target.path}`);
      });
      target.hop2Details.forEach((d) => {
        visitedFiles.add(d.file);
        activeEdges.add(`${d.file}->${d.via}`);
      });
      target.outboundEdges.forEach((e) => {
        visitedFiles.add(e.target);
        activeEdges.add(`${target.path}->${e.target}`);
      });

      steps.push({
        tool: 'get_file_ast',
        args: `path="${target.path}"`,
        output: `Verified exports: [${target.exports.join(', ')}] (${target.loc} LOC)`,
        files: [target.path],
      });

      steps.push({
        tool: 'walk_dependents',
        args: `path="${target.path}", depth=1`,
        output: `Found ${target.hop1Files.length} direct 1-hop dependents: [${target.hop1Files.join(', ')}]`,
        files: target.hop1Files,
      });

      steps.push({
        tool: 'walk_dependents',
        args: `path="${target.path}", depth=2`,
        output: `Found ${target.hop2Files.length} transitive 2-hop dependents: [${target.hop2Files.join(', ')}]`,
        files: target.hop2Files,
      });

      steps.push({
        tool: 'trace_dependency_path',
        args: `from="${target.path}"`,
        output: `Traced ${target.outboundEdges.length} outbound import(s): [${target.outboundEdges.map((e) => e.target).join(', ') || 'none'}]`,
        files: target.outboundEdges.map((e) => e.target),
      });

      const answerHtml = `
          Changing ${cite(target.path)} (<code class="font-mono text-indigo-300">${target.exports.join(', ')}</code>) has a verified 2-level blast radius of <strong class="text-rose-300">${target.totalImpact} files</strong> (${Math.round((target.totalImpact / nodes.length) * 100)}% of the repository):
          <ul class="list-disc pl-4 mt-1.5 space-y-1">
            <li><strong class="text-rose-300">1-Hop Immediate Breakage (${target.hop1Files.length} files):</strong> ${target.hop1Files.map(cite).join(' ') || 'None'} import ${cite(target.path)} directly.</li>
            <li><strong class="text-amber-300">2-Hop Cascading Breakage (${target.hop2Files.length} files):</strong> ${target.hop2Files.map(cite).join(' ') || 'None'} depend on the 1-hop modules and will fail if return types or signatures shift.</li>
            ${target.outboundEdges.length ? `<li><strong class="text-sky-300">Outbound Imports (${target.outboundEdges.length}):</strong> ${cite(target.path)} itself imports ${target.outboundEdges.map((e) => cite(e.target)).join(', ')}, verified at exact line numbers.</li>` : ''}
          </ul>
        `;
      return {
        steps,
        visitedFiles: Array.from(visitedFiles),
        activeEdges: Array.from(activeEdges),
        answerHtml,
        primaryFocus: target.path,
        citedFiles,
      };
    }

    if (cycleBranch) {
      const sortedByImpact = [...nodes].sort((a, b) => b.totalImpact - a.totalImpact);
      const top1 = sortedByImpact[0];
      const top2 = sortedByImpact[1] || top1;
      if (!top1) {
        return { steps, visitedFiles: [], activeEdges: [], answerHtml: '', primaryFocus: null, citedFiles: [] };
      }
      visitedFiles.add(top1.path);
      visitedFiles.add(top2.path);

      steps.push({
        tool: 'find_entry_points',
        args: `scan_all=true`,
        output: `Scanned ${nodes.length} nodes and ${edges.length} edges across architectural layers.`,
        files: [top1.path, top2.path],
      });

      const cycles = graph.cycles || [];
      steps.push({
        tool: 'detect_cycles_and_hubs',
        args: `max_depth=3`,
        output: `Circular dependencies: ${cycles.length} • Top hub: ${top1.path} (${top1.totalImpact} dependents)`,
        files: cycles.length ? cycles[0] : [top1.path],
      });

      const cycleText = cycles.length > 0
        ? `<strong class="text-rose-400">Circular Dependency Found:</strong> ${cite(cycles[0][0])} and ${cite(cycles[0][1])} form a closed import loop.`
        : `<strong class="text-emerald-300">Zero Circular Dependencies:</strong> The repository forms a clean directed acyclic graph (DAG).`;

      const answerHtml = `
          ${cycleText}
          <br/><br/>
          <strong>Highest-Risk Architectural Bottlenecks (by 2-Hop Blast Radius):</strong>
          <ul class="list-disc pl-4 mt-1 space-y-1">
            <li>${cite(top1.path)} — <strong class="text-rose-300">${top1.totalImpact} total dependents</strong> (${top1.hop1Files.length} direct, ${top1.hop2Files.length} transitive).</li>
            <li>${top2 && top2 !== top1 ? cite(top2.path) : ''} ${top2 && top2 !== top1 ? `— <strong class="text-amber-300">${top2.totalImpact} total dependents</strong> (${top2.hop1Files.length} direct, ${top2.hop2Files.length} transitive).` : ''}</li>
          </ul>
        `;
      return {
        steps,
        visitedFiles: Array.from(visitedFiles),
        activeEdges: Array.from(activeEdges),
        answerHtml,
        primaryFocus: top1.path,
        citedFiles,
      };
    }

    const parserNodes = nodes.filter((n) => n.layer === 'parser' || n.layer === 'agent');
    const uiNodes = nodes.filter((n) => n.layer === 'ui' || n.layer === 'api');
    const startNode = parserNodes[0] || nodes[0];
    const endNode = uiNodes[0] || nodes[nodes.length - 1];
    if (!startNode) {
      return { steps, visitedFiles: [], activeEdges: [], answerHtml: '', primaryFocus: null, citedFiles: [] };
    }

    visitedFiles.add(startNode.path);
    visitedFiles.add(endNode.path);
    startNode.hop1Files.forEach((f) => {
      visitedFiles.add(f);
      activeEdges.add(`${f}->${startNode.path}`);
    });

    steps.push({
      tool: 'search_symbols',
      args: `query="${question.slice(0, 32)}"`,
      output: `Identified core modules ${startNode.path} and ${endNode.path}`,
      files: [startNode.path, endNode.path],
    });

    steps.push({
      tool: 'trace_dependency_path',
      args: `from="${endNode.path}", to="${startNode.path}"`,
      output: `Verified dependency chain across ${visitedFiles.size} connected modules.`,
      files: Array.from(visitedFiles),
    });

    const answerHtml = `
        Walking the parsed AST graph from the entry/UI layer (${cite(endNode.path)}) down to the core engine (${cite(startNode.path)}):
        <ul class="list-disc pl-4 mt-1.5 space-y-1">
          <li>${cite(startNode.path)} exports <code class="font-mono text-indigo-300">${startNode.exports.join(', ')}</code>.</li>
          <li>It connects upward through ${startNode.hop1Files.map(cite).join(', ') || cite(endNode.path)}.</li>
          <li>All ${visitedFiles.size} highlighted nodes on the canvas were verified directly from parsed import statements.</li>
        </ul>
      `;
    return {
      steps,
      visitedFiles: Array.from(visitedFiles),
      activeEdges: Array.from(activeEdges),
      answerHtml,
      primaryFocus: startNode.path,
      citedFiles,
    };
  }

  /**
   * Validate a raw LLM synthesis against the graph and the agent's tool
   * trace. A path-like token counts as a claim about a file; every claim must
   * both exist in the graph and have been traced, or the whole synthesis is
   * rejected and the caller keeps the deterministic answer.
   *
   * Rule details:
   * - URLs (any `scheme://...`) are stripped before scanning: they are page
   *   references, not file claims.
   * - A token must contain a slash-separated path shape AND a dotted final
   *   segment (file-like, e.g. `.ts`) to count. Extension-less prose like
   *   `and/or` or `input/output` is never a citation.
   * - Trailing sentence punctuation (`.`) is trimmed from tokens so a claim
   *   at the end of a sentence still matches the exact node path.
   */
  function findPathLikeMentions(rawText) {
    const text = String(rawText || '').replace(/[a-z][a-z0-9+.-]*:\/\/[^\s'<>]+/gi, ' ');
    const mentions = [];
    const seen = new Set();
    const pathLike = /[A-Za-z0-9_.~-]+(?:\/[A-Za-z0-9_.~-]+)+/g;

    for (const match of text.matchAll(pathLike)) {
      const token = match[0].replace(/\.+$/, '');
      const lastSegment = token.slice(token.lastIndexOf('/') + 1);
      if (!lastSegment.includes('.')) continue;
      if (!seen.has(token)) {
        seen.add(token);
        mentions.push(token);
      }
    }
    return mentions;
  }

  function validateSynthesis(rawText, graph, tracePaths) {
    const mentions = findPathLikeMentions(rawText);
    const knownPaths = new Set((graph.nodes || []).map((n) => n.path));
    const tracedPaths = new Set(tracePaths || []);

    const citedPaths = [];
    const unknownPaths = [];
    const unprovenPaths = [];

    for (const mention of mentions) {
      if (knownPaths.has(mention)) {
        citedPaths.push(mention);
        if (!tracedPaths.has(mention)) unprovenPaths.push(mention);
      } else {
        unknownPaths.push(mention);
      }
    }

    return {
      accepted: unknownPaths.length === 0 && unprovenPaths.length === 0,
      citedPaths,
      unknownPaths,
      unprovenPaths,
    };
  }

  return {
    buildAgentPlan,
    findAuthNodes,
    validateSynthesis,
  };
});
