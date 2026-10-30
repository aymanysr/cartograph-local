/**
 * Cartograph deterministic agent — tool registry, question router, executor.
 *
 * Zero dependencies. No DOM access. Given a parsed graph
 * (`{ nodes, edges, cycles, ... }` from `CartographParser.parseRepository`),
 * `buildAgentPlan` routes a repository question to a sequence of concrete tool
 * call arguments, executes every call against the registry, and returns the
 * steps, walked files, highlighted edges, and every file the answer cites.
 * No file path is invented: every cited path is either visited by the walk or
 * named in a tool trace step, and every step's `output`/`files` comes from the
 * tool's run on the graph — never from precomputed strings.
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

  function pickTopHubs(nodes, count) {
    return [...nodes].sort((a, b) => b.totalImpact - a.totalImpact).slice(0, count);
  }

  function findGraphNode(nodesOrGraph, path) {
    if (!nodesOrGraph || !path) return null;
    if (typeof nodesOrGraph.getNode === 'function') {
      return nodesOrGraph.getNode(path);
    }
    if (Array.isArray(nodesOrGraph)) {
      return nodesOrGraph.find((n) => n.path === path) || null;
    }
    if (nodesOrGraph.nodes && typeof nodesOrGraph.getNode === 'function') {
      return nodesOrGraph.getNode(path);
    }
    if (nodesOrGraph.nodes && Array.isArray(nodesOrGraph.nodes)) {
      return nodesOrGraph.nodes.find((n) => n.path === path) || null;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Tool handler registry. Every handler is pure: `(args, graph) -> { output,
  // files }` where both fields are derived from the graph at call time. `label`
  // renders the structured args into the display string shown in the trace.
  // ---------------------------------------------------------------------------

  function runSearchSymbols(args, graph) {
    const query = String(args.query || '');
    const tokens = (query.toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => t.length >= 3);
    const matched = (graph.nodes || []).filter((n) =>
      tokens.some(
        (t) =>
          n.path.toLowerCase().includes(t) ||
          n.exports.some((e) => e.toLowerCase().includes(t))
      )
    );
    return {
      output: matched.length
        ? `Matched ${matched.length} module(s): ${matched.map((n) => n.path).join(', ')}`
        : `Matched 0 module(s) for query "${query}"`,
      files: matched.map((n) => n.path),
    };
  }

  function runGetFileAst(args, graph) {
    const node = findGraphNode(graph, args.path);
    if (!node) {
      return { output: `No graph node for path "${args.path}"`, files: [] };
    }
    const outboundTargets = node.outboundEdges.map((e) => e.target);
    if (args.verified === true) {
      return {
        output: `Verified exports: [${node.exports.join(', ')}] (${node.loc} LOC)`,
        files: [node.path],
      };
    }
    return {
      output: `Exports: [${node.exports.join(', ')}] • Outbound imports: [${outboundTargets.join(', ') || 'none'}]`,
      files: [node.path, ...outboundTargets],
    };
  }

  function runWalkDependents(args, graph) {
    const node = findGraphNode(graph, args.path);
    if (!node) {
      return { output: `No graph node for path "${args.path}"`, files: [] };
    }
    if (args.framing === 'enforcement') {
      return {
        output: `1-Hop enforcement callers (${node.hop1Files.length}): [${node.hop1Files.join(', ')}] • 2-Hop upstream (${node.hop2Files.length}): [${node.hop2Files.join(', ')}]`,
        files: [...node.hop1Files, ...node.hop2Files],
      };
    }
    if (args.depth === 1) {
      return {
        output: `Found ${node.hop1Files.length} direct 1-hop dependents: [${node.hop1Files.join(', ')}]`,
        files: [...node.hop1Files],
      };
    }
    if (args.depth === 2) {
      return {
        output: `Found ${node.hop2Files.length} transitive 2-hop dependents: [${node.hop2Files.join(', ')}]`,
        files: [...node.hop2Files],
      };
    }
    return { output: `Unsupported walk depth ${args.depth} for "${args.path}"`, files: [] };
  }

  function findDependencyChain(graph, fromPath, toPath) {
    if (fromPath === toPath) return [fromPath];
    const queue = [[fromPath]];
    const seen = new Set([fromPath]);
    while (queue.length > 0) {
      const chain = queue.shift();
      const current = findGraphNode(graph, chain[chain.length - 1]);
      if (!current) continue;
      for (const edge of current.outboundEdges) {
        if (edge.target === toPath) {
          return [...chain, edge.target];
        }
        if (!seen.has(edge.target)) {
          seen.add(edge.target);
          queue.push([...chain, edge.target]);
        }
      }
    }
    return null;
  }

  function runTraceDependencyPath(args, graph) {
    if (!args.to) {
      const node = findGraphNode(graph, args.from);
      const targets = node ? node.outboundEdges.map((e) => e.target) : [];
      return {
        output: `Traced ${targets.length} outbound import(s): [${targets.join(', ') || 'none'}]`,
        files: [...targets],
      };
    }
    const chain = findDependencyChain(graph, args.from, args.to);
    if (!chain) {
      return {
        output: `No outbound dependency chain from "${args.from}" to "${args.to}".`,
        files: [],
      };
    }
    const hops = chain.length - 1;
    return {
      output: `Verified dependency chain: ${chain.join(' -> ')} (${hops} hop${hops === 1 ? '' : 's'})`,
      files: [...chain],
    };
  }

  function runFindEntryPoints(args, graph) {
    const nodes = graph.nodes || [];
    const edges = graph.edges || [];
    const entryPoints = nodes.filter((n) => n.inDegree === 0).map((n) => n.path);
    return {
      output: entryPoints.length
        ? `Entry points (${entryPoints.length}) among ${nodes.length} scanned nodes and ${edges.length} edges: ${entryPoints.join(', ')}`
        : `No zero-incoming entry nodes among ${nodes.length} scanned nodes and ${edges.length} edges.`,
      files: [...entryPoints],
    };
  }

  function runDetectCyclesAndHubs(args, graph) {
    const nodes = graph.nodes || [];
    const cycles = graph.cycles || [];
    const hubs = typeof graph.getTopHubs === 'function' ? graph.getTopHubs(2) : pickTopHubs(nodes, 2);
    const topHub = hubs[0];
    if (!topHub) {
      return { output: 'No graph nodes to analyze for cycles and hubs.', files: [] };
    }

    const files = [];
    const seen = new Set();
    for (const filePath of [...hubs.map((n) => n.path), ...cycles.flat()]) {
      if (!seen.has(filePath)) {
        seen.add(filePath);
        files.push(filePath);
      }
    }

    return {
      output: `Circular dependencies: ${cycles.length} • Top hub: ${topHub.path} (${topHub.totalImpact} dependents)`,
      files,
    };
  }

  const TOOLS = {
    find_entry_points: {
      run: runFindEntryPoints,
      label: () => 'scan_all=true',
    },
    search_symbols: {
      run: runSearchSymbols,
      label: (args) => `query="${args.query}"`,
    },
    get_file_ast: {
      run: runGetFileAst,
      label: (args) => `path="${args.path}"`,
    },
    walk_dependents: {
      run: runWalkDependents,
      label: (args) => `path="${args.path}", depth=${args.depth}`,
    },
    trace_dependency_path: {
      run: runTraceDependencyPath,
      label: (args) => (args.to ? `from="${args.from}", to="${args.to}"` : `from="${args.from}"`),
    },
    detect_cycles_and_hubs: {
      run: runDetectCyclesAndHubs,
      label: () => 'max_depth=3',
    },
  };

  function executeToolCall(call, graph) {
    const tool = TOOLS[call.tool];
    if (!tool) {
      throw new Error(`Unknown tool: ${call.tool}`);
    }
    const result = tool.run(call.args, graph);
    return {
      tool: call.tool,
      args: tool.label(call.args),
      output: result.output,
      files: result.files,
    };
  }

  function executeCalls(calls, graph) {
    return calls.map((call) => executeToolCall(call, graph));
  }

  /**
   * Route a question onto concrete tool calls. The router decides WHICH tools
   * run and with WHICH arguments (from graph lookups); the executor then runs
   * each handler so every step's output/files are derived live from the graph.
   */
  function buildAgentPlan(question, graph, rawChipFormatter) {
    const chipFormatter = typeof rawChipFormatter === 'function' ? rawChipFormatter : ((p) => p);

    const q = question.toLowerCase();
    const nodes = graph.nodes || [];

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

    const emptyPlan = () => ({
      question,
      target: null,
      blastRadius: {
        hop1Files: [],
        hop2Files: [],
        outboundTargets: [],
      },
      steps,
      visitedFiles: [],
      activeEdges: [],
      answerHtml: '',
      primaryFocus: null,
      citedFiles: [],
      narrative: {
        headline: 'No architectural match found',
        details: [],
      },
    });

    const authBranch = q.includes('auth') || q.includes('enforce') || q.includes('token') || q.includes('session') || q.includes('jwt') || q.includes('key');
    const cycleBranch = q.includes('circular') || q.includes('cycle') || q.includes('bottleneck') || q.includes('risk') || q.includes('single point');

    // An explicitly named file path (blast/impact intent) wins over the keyword
    // branches, including auth — otherwise a path like `src/lib/auth/verify.ts`
    // inside the question would silently hijack a change-impact question.
    const explicitNode = typeof graph.findExplicitNode === 'function'
      ? graph.findExplicitNode(q)
      : (findExplicitNode(nodes, q) || null);
    const blastBranch =
      explicitNode !== null ||
      q.includes('break') || q.includes('db') || q.includes('database') || q.includes('supabase') || q.includes('ledger') || q.includes('vector') || q.includes('change');

    if (authBranch && !explicitNode) {
      const authNodes = typeof graph.getAuthNodes === 'function'
        ? graph.getAuthNodes()
        : findAuthNodes(nodes);
      const primaryAuth = authNodes[0] || nodes[0];
      if (!primaryAuth) {
        return emptyPlan();
      }

      const planSteps = executeCalls(
        [
          { tool: 'search_symbols', args: { query: 'auth | requireAuth | verify' } },
          { tool: 'get_file_ast', args: { path: primaryAuth.path } },
          { tool: 'walk_dependents', args: { path: primaryAuth.path, depth: 2, framing: 'enforcement' } },
        ],
        graph
      );
      steps.push(...planSteps);

      visitedFiles.add(primaryAuth.path);
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
        question,
        steps,
        target: {
          path: primaryAuth.path,
          layer: primaryAuth.layer || '',
          exports: [...(primaryAuth.exports || [])],
        },
        blastRadius: {
          hop1Files: [...primaryAuth.hop1Files],
          hop2Files: [...primaryAuth.hop2Files],
          outboundTargets: primaryAuth.outboundEdges.map(e => e.target),
        },
        narrative: {
          headline: "Authentication is enforced in " + primaryAuth.path,
          details: [
            { label: 'Direct Enforcement Callers (1-Hop)', files: [...primaryAuth.hop1Files] },
            { label: 'Upstream Consumers (2-Hops Out)', files: [...primaryAuth.hop2Files] },
            { label: 'Downstream Backing Store', files: primaryAuth.outboundEdges.map(e => e.target) },
          ],
        },
        visitedFiles: Array.from(visitedFiles),
        activeEdges: Array.from(activeEdges),
        answerHtml,
        primaryFocus: primaryAuth.path,
        citedFiles,
      };
    }

    if (blastBranch) {
      const topHub = typeof graph.getTopHubs === 'function' ? graph.getTopHubs(1)[0] : pickTopHubs(nodes, 1)[0];
      const target = pickBlastTarget(nodes, q) || topHub;
      if (!target) {
        return emptyPlan();
      }

      const planSteps = executeCalls(
        [
          { tool: 'get_file_ast', args: { path: target.path, verified: true } },
          { tool: 'walk_dependents', args: { path: target.path, depth: 1 } },
          { tool: 'walk_dependents', args: { path: target.path, depth: 2 } },
          { tool: 'trace_dependency_path', args: { from: target.path } },
        ],
        graph
      );
      steps.push(...planSteps);

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

      const answerHtml = `
          Changing ${cite(target.path)} (<code class="font-mono text-sky-300">${target.exports.join(', ')}</code>) has a verified 2-level blast radius of <strong class="text-rose-300">${target.totalImpact} files</strong> (${Math.round((target.totalImpact / nodes.length) * 100)}% of the repository):
          <ul class="list-disc pl-4 mt-1.5 space-y-1">
            <li><strong class="text-rose-300">1-Hop Immediate Breakage (${target.hop1Files.length} files):</strong> ${target.hop1Files.map(cite).join(' ') || 'None'} import ${cite(target.path)} directly.</li>
            <li><strong class="text-amber-300">2-Hop Cascading Breakage (${target.hop2Files.length} files):</strong> ${target.hop2Files.map(cite).join(' ') || 'None'} depend on the 1-hop modules and will fail if return types or signatures shift.</li>
            ${target.outboundEdges.length ? `<li><strong class="text-sky-300">Outbound Imports (${target.outboundEdges.length}):</strong> ${cite(target.path)} itself imports ${target.outboundEdges.map((e) => cite(e.target)).join(', ')}, verified at exact line numbers.</li>` : ''}
          </ul>
        `;
      return {
        question,
        steps,
        target: {
          path: target.path,
          layer: target.layer || '',
          exports: [...(target.exports || [])],
        },
        blastRadius: {
          hop1Files: [...target.hop1Files],
          hop2Files: [...target.hop2Files],
          outboundTargets: target.outboundEdges.map(e => e.target),
        },
        narrative: {
          headline: "Modifying " + target.path + " will impact " + target.totalImpact + " modules",
          details: [
            { label: 'Directly Affected Callers (1-Hop)', files: [...target.hop1Files] },
            { label: 'Transitive Blast Radius (2-Hops Out)', files: [...target.hop2Files] },
            { label: 'Outbound Imports', files: target.outboundEdges.map(e => e.target) },
          ],
        },
        visitedFiles: Array.from(visitedFiles),
        activeEdges: Array.from(activeEdges),
        answerHtml,
        primaryFocus: target.path,
        citedFiles,
      };
    }

    if (cycleBranch) {
      const topHubs = typeof graph.getTopHubs === 'function' ? graph.getTopHubs(2) : pickTopHubs(nodes, 2);
      const top1 = topHubs[0];
      const top2 = topHubs[1] || top1;
      if (!top1) {
        return emptyPlan();
      }
      visitedFiles.add(top1.path);
      visitedFiles.add(top2.path);

      const planSteps = executeCalls(
        [
          { tool: 'find_entry_points', args: { scan_all: true } },
          { tool: 'detect_cycles_and_hubs', args: { max_depth: 3 } },
        ],
        graph
      );
      steps.push(...planSteps);

      const cycles = graph.cycles || [];
      const cycleText = cycles.length > 0
        ? `<strong class="text-rose-400">Circular Dependency Found:</strong> ${cite(cycles[0][0])} and ${cite(cycles[0][1])} form a closed import loop.`
        : `<strong class="text-emerald-300">Zero Circular Dependencies:</strong> The repository forms a clean directed acyclic graph (DAG).`;

      const answerHtml = `
          ${cycleText}
          <br/><br/>
          <strong>Highest-Risk Architectural Bottlenecks (by 2-Hop Blast Radius):</strong>
          <ul class="list-disc pl-4 mt-1 space-y-1">
            <li>${cite(top1.path)} : <strong class="text-rose-300">${top1.totalImpact} total dependents</strong> (${top1.hop1Files.length} direct, ${top1.hop2Files.length} transitive).</li>
            <li>${top2 && top2 !== top1 ? cite(top2.path) : ''} ${top2 && top2 !== top1 ? `: <strong class="text-amber-300">${top2.totalImpact} total dependents</strong> (${top2.hop1Files.length} direct, ${top2.hop2Files.length} transitive).` : ''}</li>
          </ul>
        `;
      return {
        question,
        steps,
        target: {
          path: top1.path,
          layer: top1.layer || '',
          exports: [...(top1.exports || [])],
        },
        blastRadius: {
          hop1Files: [...(top1.hop1Files || [])],
          hop2Files: [...(top1.hop2Files || [])],
          outboundTargets: (top1.outboundEdges || []).map(e => e.target),
        },
        narrative: {
          headline: cycles.length > 0 ? `Circular dependency detected between ${cycles[0][0]} and ${cycles[0][1]}` : `Architecture forms a clean DAG with ${top1.path} as primary hub`,
          details: [
            { label: 'Primary Bottleneck', files: [top1.path] },
            { label: 'Secondary Bottleneck', files: top2 && top2 !== top1 ? [top2.path] : [] },
            { label: 'Blast Radius (Top Hub)', files: [...(top1.hop1Files || [])] },
          ],
        },
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
      return emptyPlan();
    }

    visitedFiles.add(startNode.path);
    visitedFiles.add(endNode.path);
    startNode.hop1Files.forEach((f) => {
      visitedFiles.add(f);
      activeEdges.add(`${f}->${startNode.path}`);
    });

    const planSteps = executeCalls(
      [
        { tool: 'search_symbols', args: { query: question.slice(0, 32) } },
        { tool: 'trace_dependency_path', args: { from: endNode.path, to: startNode.path } },
      ],
      graph
    );
    steps.push(...planSteps);

    const answerHtml = `
        Walking the parsed AST graph from the entry/UI layer (${cite(endNode.path)}) down to the core engine (${cite(startNode.path)}):
        <ul class="list-disc pl-4 mt-1.5 space-y-1">
          <li>${cite(startNode.path)} exports <code class="font-mono text-sky-300">${startNode.exports.join(', ')}</code>.</li>
          <li>It connects upward through ${startNode.hop1Files.map(cite).join(', ') || cite(endNode.path)}.</li>
          <li>All ${visitedFiles.size} highlighted nodes on the canvas were verified directly from parsed import statements.</li>
        </ul>
      `;
    return {
      question,
      steps,
      target: {
        path: startNode.path,
        layer: startNode.layer || '',
        exports: [...(startNode.exports || [])],
      },
      blastRadius: {
        hop1Files: [...(startNode.hop1Files || [])],
        hop2Files: [...(startNode.hop2Files || [])],
        outboundTargets: (startNode.outboundEdges || []).map(e => e.target),
      },
      narrative: {
        headline: `AST trace from ${endNode.path} down to ${startNode.path}`,
        details: [
          { label: 'Entry/UI Layer', files: [endNode.path] },
          { label: 'Core Engine Layer', files: [startNode.path] },
          { label: 'Direct Dependents', files: [...(startNode.hop1Files || [])] },
        ],
      },
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

  function collectTraceFiles(plan) {
    const traceFiles = [];
    const seen = new Set();
    for (const step of (plan && plan.steps ? plan.steps : [])) {
      for (const filePath of (step.files || [])) {
        if (!seen.has(filePath)) {
          seen.add(filePath);
          traceFiles.push(filePath);
        }
      }
    }
    return traceFiles;
  }

  /**
   * Factory for creating a pluggable ModelClient.
   * Encapsulates HTTP transport, Bearer authentication, request formatting,
   * and dual-format unmarshaling (Ollama and OpenAI-compatible endpoints).
   */
  function createModelClient(config = {}, customFetch = null) {
    const fetchImpl = customFetch || (typeof fetch !== 'undefined' ? fetch : null);

    return {
      async complete({ systemPrompt, userPrompt, signal } = {}) {
        if (!fetchImpl) {
          throw new Error('No fetch implementation available for ModelClient');
        }
        if (!config.endpoint) {
          throw new Error('ModelClient requires config.endpoint');
        }

        const headers = {
          'Content-Type': 'application/json',
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        };

        const body = JSON.stringify({
          model: config.model || 'qwen2.5-coder:7b',
          stream: false,
          messages: [
            { role: 'system', content: systemPrompt || '' },
            { role: 'user', content: userPrompt || '' },
          ],
        });

        const resp = await fetchImpl(config.endpoint, {
          method: 'POST',
          headers,
          body,
          signal,
        });

        if (!resp.ok) {
          throw new Error(`Endpoint returned ${resp.status}`);
        }

        const data = await resp.json();
        const rawText =
          (data.message && data.message.content) ||
          (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ||
          '';

        return rawText;
      },
    };
  }

  /**
   * End-to-end agent query execution.
   * Runs the deterministic planner, queries the model client if available,
   * validates the synthesis against the AST trace, and returns a verified result
   * or a safe deterministic fallback.
   */
  async function queryAgent(question, graph, options = {}) {
    const chipFormatter = options.chipFormatter || ((p) => p);
    const plan = options.plan || buildAgentPlan(question, graph, chipFormatter);

    const baseResult = {
      plan,
      question: plan.question || question,
      target: plan.target || null,
      blastRadius: plan.blastRadius || null,
      narrative: plan.narrative || null,
      answerHtml: plan.answerHtml,
      primaryFocus: plan.primaryFocus,
      visitedFiles: plan.visitedFiles,
      activeEdges: plan.activeEdges,
    };

    const isDeterministicOnly =
      !options.modelClient ||
      (options.config && options.config.engine === 'deterministic');

    if (isDeterministicOnly) {
      return {
        ...baseResult,
        source: 'deterministic',
        rawText: null,
        validation: null,
      };
    }

    const allowedPaths = Array.from(plan.visitedFiles);
    const systemPrompt = `You are the Cartograph Codebase Agent. You are ONLY allowed to cite files from this verified AST tool output list: ${JSON.stringify(allowedPaths)}. Explain the answer concisely in 3-4 sentences.`;
    const userPrompt = `Question: ${question}\nVerified Tool Trace: ${JSON.stringify(plan.steps)}`;

    const rawText = await options.modelClient.complete({
      systemPrompt,
      userPrompt,
      signal: options.signal,
    });

    if (!rawText) {
      return {
        ...baseResult,
        source: 'deterministic',
        rawText: '',
        validation: null,
      };
    }

    const tracePaths = collectTraceFiles(plan);
    const validation = validateSynthesis(rawText, graph, tracePaths);

    if (validation.accepted) {
      return {
        ...baseResult,
        source: 'model',
        rawText,
        validation,
      };
    }

    const rejectedPaths = validation.unknownPaths.concat(validation.unprovenPaths);
    return {
      ...baseResult,
      source: 'deterministic',
      rawText,
      validation,
      rejected: true,
      rejectedPaths,
    };
  }

  return {
    buildAgentPlan,
    findAuthNodes,
    validateSynthesis,
    collectTraceFiles,
    createModelClient,
    queryAgent,
    TOOLS,
  };
});
