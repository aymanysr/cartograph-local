/**
 * Cartograph deterministic parser — shared by the browser app and the CLI.
 *
 * Zero dependencies. No network calls. Every edge in the graph comes from
 * parsing real source text, never from an LLM.
 *
 * Browser: loaded as a classic script; exposes `window.CartographParser`.
 * Node:    `require('./lib/cartograph-parser.js')` (or default-import from ESM).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CartographParser = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function classifyArchitecturalLayer(filePath) {
    const p = filePath.toLowerCase();
    if (p.includes('/db/') || p.includes('/core/') || p.includes('/config/') || p.includes('prisma') || p.includes('supabase') || p.includes('vector_store')) {
      return 'core';
    }
    if (p.includes('/parser/') || p.includes('/ingest/') || p.includes('ast') || p.includes('resolver') || p.includes('blast') || p.includes('chunker') || p.includes('embedder')) {
      return 'parser';
    }
    if (p.includes('/agent/') || p.includes('/evals/') || p.includes('explainer') || p.includes('walker') || p.includes('synthesizer') || p.includes('retriever')) {
      return 'agent';
    }
    if (p.includes('/api/') || p.includes('/routes') || p.includes('/auth') || p.includes('/middleware') || p.includes('/workers')) {
      return 'api';
    }
    if (p.includes('/components/') || p.includes('/hooks/') || p.endsWith('.tsx') || p.endsWith('.jsx') || p.includes('main.py') || p.endsWith('index.ts')) {
      return 'ui';
    }
    return 'core';
  }

  function extractExportedSymbols(content, filePath) {
    const exports = new Set();
    const lines = content.split('\n');
    const isPy = filePath.endsWith('.py');
    const isGo = filePath.endsWith('.go');

    for (const line of lines) {
      if (isPy) {
        const pyDef = line.match(/^(?:async\s+)?def\s+([A-Za-z0-9_]+)\s*\(/);
        if (pyDef && !pyDef[1].startsWith('_')) exports.add(pyDef[1] + '()');
        const pyCls = line.match(/^class\s+([A-Za-z0-9_]+)/);
        if (pyCls && !pyCls[1].startsWith('_')) exports.add(pyCls[1]);
        const pyVar = line.match(/^([A-Za-z0-9_]+)\s*=\s*[A-Za-z0-9_]+\(/);
        if (pyVar && !pyVar[1].startsWith('_')) exports.add(pyVar[1]);
      } else if (isGo) {
        const goFunc = line.match(/^func\s+([A-Z][A-Za-z0-9_]*)\s*\(/);
        if (goFunc) exports.add(goFunc[1] + '()');
        const goType = line.match(/^type\s+([A-Z][A-Za-z0-9_]*)/);
        if (goType) exports.add(goType[1]);
        const goVar = line.match(/^(?:var|const)\s+([A-Z][A-Za-z0-9_]*)/);
        if (goVar) exports.add(goVar[1]);
      } else {
        const fnMatch = line.match(/export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)/);
        if (fnMatch) exports.add(fnMatch[1] + '()');
        const constMatch = line.match(/export\s+const\s+([A-Za-z0-9_]+)/);
        if (constMatch) exports.add(constMatch[1]);
        const typeMatch = line.match(/export\s+(?:interface|type|class|enum)\s+([A-Za-z0-9_]+)/);
        if (typeMatch) exports.add(typeMatch[1]);
        if (/export\s+default\s+/.test(line)) {
          const namedDefault = line.match(/export\s+default\s+(?:async\s+)?(?:function|class)\s+([A-Za-z0-9_]+)/);
          if (namedDefault) {
            exports.add(/\bfunction\b/.test(line) ? namedDefault[1] + '()' : namedDefault[1]);
          } else {
            const identDefault = line.match(/export\s+default\s+([A-Za-z0-9_]+)\s*;?\s*$/);
            if (identDefault) exports.add(identDefault[1]);
            else exports.add('default');
          }
        }
      }
    }
    if (exports.size === 0) {
      const base = filePath.split('/').pop().replace(/\.[^.]+$/, '');
      exports.add(base);
    }
    return Array.from(exports);
  }

  function resolveModuleSpecifier(fromFile, rawSpec, knownPathsSet, allPathsList) {
    const spec = rawSpec.trim().replace(/^['"]|['"]$/g, '');
    if (!spec) return null;

    const candidates = [];

    if (spec.startsWith('@/') || spec.startsWith('~/')) {
      const stripped = spec.slice(2);
      candidates.push('src/' + stripped);
      candidates.push(stripped);
    } else if (spec.startsWith('./') || spec.startsWith('../')) {
      const dirParts = fromFile.split('/').slice(0, -1);
      for (const seg of spec.split('/')) {
        if (!seg || seg === '.') continue;
        if (seg === '..') dirParts.pop();
        else dirParts.push(seg);
      }
      candidates.push(dirParts.join('/'));
    } else if (spec.startsWith('.')) {
      const relativeMatch = spec.match(/^(\.+)(.*)$/);
      const dotCount = relativeMatch ? relativeMatch[1].length : 1;
      const rest = relativeMatch ? relativeMatch[2].replace(/^\./, '') : '';
      const dirParts = fromFile.split('/').slice(0, -1);
      for (let i = 1; i < dotCount; i += 1) dirParts.pop();
      if (rest) dirParts.push(...rest.split('.'));
      candidates.push(dirParts.join('/'));
    } else if (spec.includes('.') && !spec.includes('/')) {
      candidates.push(spec.replace(/\./g, '/'));
    } else {
      candidates.push(spec);
      candidates.push('src/' + spec);
    }

    const exts = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.py', '.go', '/index.ts', '/index.tsx', '/index.js', '/__init__.py'];
    for (const base of candidates) {
      for (const ext of exts) {
        const cand = base + ext;
        if (knownPathsSet.has(cand)) return cand;
      }
    }

    for (const base of candidates) {
      for (const ext of exts) {
        const suffix = '/' + base + ext;
        const found = allPathsList.find((p) => p.endsWith(suffix));
        if (found) return found;
      }
    }
    return null;
  }

  function resolveGoPackage(rawSpec, allPathsList) {
    const spec = rawSpec.trim().replace(/^['"]|['"]$/g, '');
    if (!spec) return [];

    // A Go import names a package directory. Local module prefixes vary
    // (module path may include a host + repo), so try every path suffix.
    const parts = spec.split('/');
    for (let i = 0; i < parts.length; i++) {
      const base = parts.slice(i).join('/');
      const prefix = base + '/';
      const hits = allPathsList
        .filter((p) => p.startsWith(prefix) && p.endsWith('.go') && !p.endsWith('_test.go'))
        .filter((p) => !p.slice(prefix.length).includes('/'))
        .sort();
      if (hits.length > 0) return hits;
    }
    return [];
  }

  function classifySpecifier(specifier) {
    if (specifier.startsWith('.')) return 'internal-unresolved';
    if (specifier.startsWith('@/') || specifier.startsWith('~/') || specifier.startsWith('src/')) {
      return 'internal-unresolved';
    }
    return 'external-package';
  }

  function extractGoImports(filePath, content, allPathsList, unresolved) {
    const edges = [];
    const lines = content.split('\n');
    let inGroup = false;

    const addImport = (spec, lineNum, statement) => {
      const targets = resolveGoPackage(spec, allPathsList);
      if (targets.length === 0) {
        unresolved.push({
          source: filePath,
          specifier: spec,
          kind: classifySpecifier(spec),
          line: lineNum,
          statement,
        });
        return;
      }
      for (const target of targets) {
        if (target === filePath) continue;
        edges.push({
          source: filePath,
          target,
          specifier: spec,
          importedSymbols: [spec.split('/').pop()],
          line: lineNum,
          statement,
        });
      }
    };

    lines.forEach((lineText, idx) => {
      const trimmed = lineText.trim();
      if (!trimmed || trimmed.startsWith('//')) return;

      if (!inGroup) {
        if (/^import\s*\($/.test(trimmed)) {
          inGroup = true;
          return;
        }
        const single = trimmed.match(/^import\s+(?:[._A-Za-z][A-Za-z0-9_]*\s+)?"([^"]+)"/);
        if (single) addImport(single[1], idx + 1, trimmed);
        return;
      }

      if (trimmed.startsWith(')')) {
        inGroup = false;
        return;
      }
      const grouped = trimmed.match(/^(?:[._A-Za-z][A-Za-z0-9_]*\s+)?"([^"]+)"/);
      if (grouped) addImport(grouped[1], idx + 1, trimmed);
    });

    return edges;
  }

  function isInsideQuotedLiteral(line, endIndex) {
    let quote = null;
    for (let i = 0; i < endIndex; i += 1) {
      const ch = line[i];
      if (quote) {
        if (ch === '\\') {
          i += 1;
        } else if (ch === quote) {
          quote = null;
        }
      } else if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch;
      }
    }
    return quote !== null;
  }

  function computeLineLeadingStates(lines) {
    const states = new Array(lines.length).fill('code');
    let state = 'code';

    for (let i = 0; i < lines.length; i += 1) {
      states[i] = state;
      const line = lines[i];
      let j = 0;
      while (j < line.length) {
        const ch = line[j];
        if (state === 'code') {
          if (ch === '/' && line[j + 1] === '/') break;
          if (ch === '/' && line[j + 1] === '*') {
            state = 'block-comment';
            j += 2;
            continue;
          }
          if (ch === '`') {
            state = 'template';
            j += 1;
            continue;
          }
          if (ch === '"' || ch === "'") {
            const quote = ch;
            j += 1;
            while (j < line.length) {
              if (line[j] === '\\') {
                j += 2;
                continue;
              }
              if (line[j] === quote) {
                j += 1;
                break;
              }
              j += 1;
            }
            continue;
          }
          j += 1;
        } else if (state === 'block-comment') {
          if (ch === '*' && line[j + 1] === '/') {
            state = 'code';
            j += 2;
            continue;
          }
          j += 1;
        } else {
          if (ch === '\\') {
            j += 2;
            continue;
          }
          if (ch === '`') {
            state = 'code';
            j += 1;
            continue;
          }
          j += 1;
        }
      }
    }
    return states;
  }

  function analyzeFileImports(filePath, content, knownPathsSet, allPathsList) {
    const edges = [];
    const unresolved = [];
    const lines = content.split('\n');
    const isPy = filePath.endsWith('.py');

    if (filePath.endsWith('.go')) {
      return {
        edges: extractGoImports(filePath, content, allPathsList, unresolved),
        unresolved,
      };
    }

    const record = (specifier, importedSymbols, lineNum, statement, target) => {
      if (target) {
        if (target !== filePath) {
          edges.push({
            source: filePath,
            target,
            specifier,
            importedSymbols,
            line: lineNum,
            statement,
          });
        }
        return;
      }
      unresolved.push({
        source: filePath,
        specifier,
        kind: classifySpecifier(specifier),
        line: lineNum,
        statement,
      });
    };

    const leadingStates = computeLineLeadingStates(lines);

    lines.forEach((lineText, idx) => {
      const lineNum = idx + 1;
      if (leadingStates[idx] !== 'code') return;
      const trimmed = lineText.trim();
      if (
        trimmed.startsWith('//') ||
        trimmed.startsWith('#') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('/*') ||
        trimmed.startsWith('*/')
      ) {
        return;
      }

      if (isPy) {
        const pyFrom = trimmed.match(/^from\s+([A-Za-z0-9_.]+)\s+import\s+(.+)$/);
        if (pyFrom && !isInsideQuotedLiteral(trimmed, pyFrom.index)) {
          const target = resolveModuleSpecifier(filePath, pyFrom[1], knownPathsSet, allPathsList);
          record(
            pyFrom[1],
            pyFrom[2].split(',').map((s) => s.trim()),
            lineNum,
            trimmed,
            target
          );
        }
        const pyImp = trimmed.match(/^import\s+([A-Za-z0-9_.]+)/);
        if (pyImp && !pyFrom && !isInsideQuotedLiteral(trimmed, pyImp.index)) {
          const target = resolveModuleSpecifier(filePath, pyImp[1], knownPathsSet, allPathsList);
          record(pyImp[1], [pyImp[1].split('.').pop()], lineNum, trimmed, target);
        }
      } else {
        const esMatch = trimmed.match(/(?:import|export)\s+(?:type\s+)?(?:(.+?)\s+from\s+)?['"]([^'"]+)['"]/);
        if (esMatch && !isInsideQuotedLiteral(trimmed, esMatch.index)) {
          const rawSymbols = esMatch[1] || '';
          const specifier = esMatch[2];
          const target = resolveModuleSpecifier(filePath, specifier, knownPathsSet, allPathsList);
          const cleanedSyms = rawSymbols
            .replace(/[{}]/g, '')
            .split(',')
            .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
            .filter(Boolean);
          record(specifier, cleanedSyms, lineNum, trimmed, target);
        }
        const reqMatch = trimmed.match(/(?:require|import)\(\s*['"]([^'"]+)['"]\s*\)/);
        if (reqMatch && !esMatch && !isInsideQuotedLiteral(trimmed, reqMatch.index)) {
          const target = resolveModuleSpecifier(filePath, reqMatch[1], knownPathsSet, allPathsList);
          record(reqMatch[1], ['*'], lineNum, trimmed, target);
        }
      }
    });

    return { edges, unresolved };
  }

  function extractFileImports(filePath, content, knownPathsSet, allPathsList) {
    return analyzeFileImports(filePath, content, knownPathsSet, allPathsList).edges;
  }

  function detectCircularDependencies(nodes, edges) {
    const nodePaths = nodes.map((n) => n.path);
    const adjacency = new Map(nodePaths.map((p) => [p, []]));
    const selfLoops = new Set();

    for (const edge of edges) {
      if (!adjacency.has(edge.source) || !adjacency.has(edge.target)) continue;
      if (edge.source === edge.target) {
        selfLoops.add(edge.source);
      } else {
        adjacency.get(edge.source).push(edge.target);
      }
    }
    for (const targets of adjacency.values()) targets.sort();

    let index = 0;
    const indexes = new Map();
    const lowlinks = new Map();
    const onStack = new Set();
    const stack = [];
    const cycles = [];

    const strongConnect = (node) => {
      indexes.set(node, index);
      lowlinks.set(node, index);
      index += 1;
      stack.push(node);
      onStack.add(node);

      for (const next of adjacency.get(node) || []) {
        if (!indexes.has(next)) {
          strongConnect(next);
          lowlinks.set(node, Math.min(lowlinks.get(node), lowlinks.get(next)));
        } else if (onStack.has(next)) {
          lowlinks.set(node, Math.min(lowlinks.get(node), indexes.get(next)));
        }
      }

      if (lowlinks.get(node) === indexes.get(node)) {
        const component = [];
        let member;
        do {
          member = stack.pop();
          onStack.delete(member);
          component.push(member);
        } while (member !== node);
        if (component.length > 1) cycles.push(component.sort());
      }
    };

    for (const nodePath of nodePaths) {
      if (!indexes.has(nodePath)) strongConnect(nodePath);
    }

    for (const loop of Array.from(selfLoops).sort()) cycles.push([loop, loop]);
    return cycles;
  }

  function computeBlastRadiusForNode(targetPath, edges) {
    const hop1Edges = edges.filter((e) => e.target === targetPath && e.source !== targetPath);
    const hop1Files = Array.from(new Set(hop1Edges.map((e) => e.source)));
    const hop1Set = new Set(hop1Files);

    const hop2Details = [];
    const hop2Set = new Set();
    for (const e of edges) {
      if (hop1Set.has(e.target) && e.source !== targetPath && !hop1Set.has(e.source)) {
        if (!hop2Set.has(e.source)) {
          hop2Set.add(e.source);
          hop2Details.push({
            file: e.source,
            via: e.target,
            line: e.line,
            statement: e.statement,
          });
        }
      }
    }

    const outboundEdges = edges.filter((e) => e.source === targetPath && e.target !== targetPath);

    return {
      hop1Edges,
      hop1Files,
      hop2Files: Array.from(hop2Set),
      hop2Details,
      outboundEdges,
      totalImpactCount: hop1Files.length + hop2Set.size,
    };
  }

  function parseRepository(files, options) {
    const opts = options || {};
    const repoName = opts.repoName || opts.name || 'repository';
    const repoDescription = opts.repoDescription || opts.description || '';

    const allPathsList = files.map((f) => f.path);
    const knownPathsSet = new Set(allPathsList);

    const nodes = [];
    const edges = [];
    const unresolved = [];

    for (const file of files) {
      const layer = classifyArchitecturalLayer(file.path);
      const exportedSymbols = extractExportedSymbols(file.content, file.path);
      const loc = file.content.split('\n').length;
      const analysis = analyzeFileImports(file.path, file.content, knownPathsSet, allPathsList);
      edges.push(...analysis.edges);
      unresolved.push(...analysis.unresolved);

      nodes.push({
        id: file.path,
        path: file.path,
        label: file.path.split('/').pop(),
        folder: file.path.split('/').slice(0, -1).join('/'),
        layer,
        exports: exportedSymbols,
        loc,
        content: file.content,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      });
    }

    const inboundByNode = new Map(nodes.map((node) => [node.path, new Set()]));
    const outboundByNode = new Map(nodes.map((node) => [node.path, new Set()]));
    for (const edge of edges) {
      if (outboundByNode.has(edge.source)) outboundByNode.get(edge.source).add(edge.target);
      if (inboundByNode.has(edge.target)) inboundByNode.get(edge.target).add(edge.source);
    }

    for (const node of nodes) {
      node.inDegree = inboundByNode.get(node.path).size;
      node.outDegree = outboundByNode.get(node.path).size;
      const br = computeBlastRadiusForNode(node.path, edges);
      node.hop1Files = br.hop1Files;
      node.hop2Files = br.hop2Files;
      node.hop1Edges = br.hop1Edges;
      node.hop2Details = br.hop2Details;
      node.outboundEdges = br.outboundEdges;
      node.totalImpact = br.totalImpactCount;
    }

    const cycles = detectCircularDependencies(nodes, edges);

    return createGraph({
      name: repoName,
      description: repoDescription,
      nodes,
      edges,
      cycles,
      unresolved,
    });
  }

  /**
   * Deepened Graph Model (ADR-006): Encapsulates dependency graph queries,
   * indexed lookups, hotspot rankings, layer categorization, and search filtering
   * behind a clean, high-leverage interface.
   */
  function createGraph(data = {}) {
    const name = data.name || 'local-project';
    const description = data.description || '';
    const nodes = Array.isArray(data.nodes) ? data.nodes : [];
    const edges = Array.isArray(data.edges) ? data.edges : [];
    const cycles = Array.isArray(data.cycles) ? data.cycles : [];
    const unresolved = Array.isArray(data.unresolved) ? data.unresolved : [];

    // Fast indexed lookups
    const pathMap = new Map();
    const lowerMap = new Map();
    const layerMap = new Map();

    for (const node of nodes) {
      pathMap.set(node.path, node);
      lowerMap.set(node.path.toLowerCase(), node);
      const layer = node.layer || 'core';
      if (!layerMap.has(layer)) layerMap.set(layer, []);
      layerMap.get(layer).push(node);
    }

    // Memoized cached top hubs
    let cachedSortedHubs = null;
    function getSortedHubs() {
      if (!cachedSortedHubs) {
        cachedSortedHubs = [...nodes].sort((a, b) => (b.totalImpact || 0) - (a.totalImpact || 0));
      }
      return cachedSortedHubs;
    }

    return {
      name,
      description,
      nodes,
      edges,
      cycles,
      unresolved,

      getNode(filePath) {
        if (!filePath) return null;
        let node = pathMap.get(filePath) || lowerMap.get(String(filePath).toLowerCase());
        if (!node && pathMap.size !== nodes.length) {
          for (const n of nodes) {
            if (n && n.path && !pathMap.has(n.path)) {
              pathMap.set(n.path, n);
              lowerMap.set(n.path.toLowerCase(), n);
            }
          }
          node = pathMap.get(filePath) || lowerMap.get(String(filePath).toLowerCase());
        }
        return node || null;
      },

      hasNode(filePath) {
        if (!filePath) return false;
        if (pathMap.has(filePath) || lowerMap.has(String(filePath).toLowerCase())) return true;
        if (pathMap.size !== nodes.length) {
          for (const n of nodes) {
            if (n && n.path && !pathMap.has(n.path)) {
              pathMap.set(n.path, n);
              lowerMap.set(n.path.toLowerCase(), n);
            }
          }
          return pathMap.has(filePath) || lowerMap.has(String(filePath).toLowerCase());
        }
        return false;
      },

      getTopHubs(limit = 10) {
        return getSortedHubs().slice(0, Math.max(0, limit));
      },

      getBlastRadius(filePath) {
        const node = this.getNode(filePath);
        if (!node) {
          return { target: null, hop1Files: [], hop2Files: [], outboundEdges: [], totalImpact: 0 };
        }
        return {
          target: node,
          hop1Files: [...(node.hop1Files || [])],
          hop2Files: [...(node.hop2Files || [])],
          outboundEdges: [...(node.outboundEdges || [])],
          totalImpact: node.totalImpact || 0,
        };
      },

      getAuthNodes() {
        return nodes.filter((node) => {
          const p = node.path.toLowerCase();
          const exports = Array.isArray(node.exports) ? node.exports : [];
          return (
            p.includes('auth') ||
            p.includes('verify') ||
            p.includes('session') ||
            p.includes('jwt') ||
            p.includes('token') ||
            exports.some((ex) => /auth|verify|token|session|jwt/i.test(ex))
          );
        });
      },

      findExplicitNode(query) {
        if (!query || typeof query !== 'string') return null;
        const q = query.toLowerCase();
        // Exact path match
        for (const [lowerPath, node] of lowerMap.entries()) {
          if (q.includes(lowerPath)) return node;
        }
        // Basename match
        for (const node of nodes) {
          const base = (node.label || node.path.split('/').pop() || '').toLowerCase();
          if (base.length > 3 && q.includes(base)) return node;
        }
        return null;
      },

      getLayers() {
        return Array.from(layerMap.keys());
      },

      getNodesInLayer(layer) {
        return layerMap.get(layer) ? [...layerMap.get(layer)] : [];
      },

      getEntryPoints() {
        return nodes.filter((n) => (n.inDegree || 0) === 0);
      },

      isEntryPoint(filePath) {
        const n = this.getNode(filePath);
        return Boolean(n && (n.inDegree || 0) === 0);
      },

      filterByQuery(query, layerFilter = 'all') {
        const q = (query || '').trim().toLowerCase();
        return nodes.filter((n) => {
          if (layerFilter !== 'all' && n.layer !== layerFilter) return false;
          if (!q) return true;
          return (
            n.path.toLowerCase().includes(q) ||
            (n.exports && n.exports.some((ex) => ex.toLowerCase().includes(q)))
          );
        });
      },

      hasCycles() {
        return cycles.length > 0;
      },

      getCycles() {
        return cycles;
      },

      getSummary() {
        return {
          nodeCount: nodes.length,
          edgeCount: edges.length,
          cycleCount: cycles.length,
          unresolvedCount: unresolved.length,
          topHub: getSortedHubs()[0] || null,
        };
      },

      exportSnapshot() {
        return {
          name,
          description,
          graph: {
            nodes,
            edges,
            cycles,
            unresolved,
          },
        };
      },
    };
  }

  return {
    classifyArchitecturalLayer,
    extractExportedSymbols,
    resolveModuleSpecifier,
    extractFileImports,
    detectCircularDependencies,
    computeBlastRadiusForNode,
    parseRepository,
    createGraph,
  };
});
