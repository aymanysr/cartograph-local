/**
 * Cartograph View Model — Pure UI presentation models, filtering, and inspector metrics.
 *
 * Zero dependencies. No DOM access. Pure functional presenter for:
 * - File list sidebar filtering, sorting, folder grouping, and active filter labels.
 * - Inspector panel flow models, role classification, and circular dependency tracking.
 * - Header metrics, hotspot rankings, and repository freshness formatting.
 *
 * Shared by app/cartograph-ui-panels.js and Node test suites.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CartographViewModel = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LAYER_META = {
    all: { label: 'All Files', color: 'slate', rank: 6 },
    entry: { label: 'Entry Points', color: 'emerald', rank: 5 },
    core: { label: 'DB & Core', color: 'indigo', rank: 4 },
    db: { label: 'DB & Core', color: 'indigo', rank: 4 },
    parser: { label: 'Parser Engine', color: 'amber', rank: 3 },
    agent: { label: 'Agent & Evals', color: 'purple', rank: 2 },
    api: { label: 'API & Auth', color: 'amber', rank: 1 },
    routes: { label: 'Routes & API', color: 'rose', rank: 1 },
    ui: { label: 'UI & Entry', color: 'sky', rank: 0 },
  };

  function getLayerMeta(layer) {
    return LAYER_META[layer] || LAYER_META.core;
  }

  function computeFileListViewModel(graph, options = {}) {
    const nodes = (graph && graph.nodes) ? graph.nodes : [];
    const layerFilter = options.layerFilter || 'all';
    const folderFilter = options.folderFilter || null;
    const searchQuery = (options.searchQuery || '').trim().toLowerCase();
    const fileSortMode = options.fileSortMode || 'path';
    const selectedFile = options.selectedFile || null;

    const filtered = nodes.filter(n => {
      if (layerFilter === 'entry') {
        if ((n.inDegree || 0) !== 0) return false;
      } else if (layerFilter !== 'all' && n.layer !== layerFilter) {
        return false;
      }

      if (folderFilter) {
        const inFolder = folderFilter === '/'
          ? (!n.folder || n.folder === '/')
          : (n.folder === folderFilter || n.path.startsWith(folderFilter + '/'));
        if (!inFolder) return false;
      }

      if (!searchQuery) return true;
      const pathMatch = n.path.toLowerCase().includes(searchQuery);
      const exportMatch = Array.isArray(n.exports) && n.exports.some(ex => ex.toLowerCase().includes(searchQuery));
      return pathMatch || exportMatch;
    });

    if (fileSortMode === 'blast') {
      filtered.sort((a, b) => (b.totalImpact || 0) - (a.totalImpact || 0) || a.path.localeCompare(b.path));
    } else {
      filtered.sort((a, b) => a.path.localeCompare(b.path));
    }

    const folderMap = new Map();
    for (let i = 0; i < nodes.length; i++) {
      const f = nodes[i].folder || '/';
      folderMap.set(f, (folderMap.get(f) || 0) + 1);
    }

    let previousFolder = null;
    const folderGroups = [];
    const processedNodes = filtered.map(node => {
      const folder = node.folder || '/';
      if (fileSortMode === 'path' && folder !== previousFolder) {
        const isFocused = Boolean(folderFilter && (
          folder === folderFilter ||
          (folderFilter !== '/' && folder.startsWith(folderFilter + '/'))
        ));
        folderGroups.push({
          folder,
          count: folderMap.get(folder) || 0,
          isFocused,
          isRoot: folder === '/',
        });
        previousFolder = folder;
      }

      const isEntry = (node.inDegree || 0) === 0;
      return {
        path: node.path,
        label: node.label || node.path.split('/').pop(),
        folder,
        totalImpact: node.totalImpact || 0,
        isEntry,
        isSelected: node.path === selectedFile,
      };
    });

    let activeHeading = 'Files';
    if (folderFilter && layerFilter !== 'all') {
      activeHeading = `📁 ${folderFilter} · ${getLayerMeta(layerFilter).label}`; // taste-skill-ignore
    } else if (folderFilter) {
      activeHeading = `📁 ${folderFilter}`; // taste-skill-ignore
    } else if (layerFilter !== 'all') {
      activeHeading = getLayerMeta(layerFilter).label;
    }

    const hasFilter = layerFilter !== 'all' || Boolean(folderFilter);

    return {
      filteredNodes: processedNodes,
      folderGroups,
      activeHeading,
      hasFilter,
      isEmpty: processedNodes.length === 0,
      emptyMessage: searchQuery ? `No files match "${searchQuery}"` : 'No files in this filter',
    };
  }

  function computeInspectorViewModel(node, graph, options = {}) {
    if (!node) {
      return {
        hasSelection: false,
        title: 'No file selected',
        explanation: 'Open a folder or drop a repository snapshot to explore its files.',
      };
    }

    const totalFiles = (graph && graph.nodes) ? graph.nodes.length : 0;
    const totalImpact = node.totalImpact || 0;
    const impactPercent = totalFiles > 0 ? ((totalImpact / totalFiles) * 100).toFixed(1) : '0.0';
    const layerMeta = getLayerMeta(node.layer);

    const cycles = (graph && Array.isArray(graph.cycles)) ? graph.cycles : [];
    const cycle = cycles.find(c => Array.isArray(c) && c.includes(node.path)) || null;

    const isEntry = (node.inDegree || 0) === 0;
    const isLeaf = (!node.outboundEdges || node.outboundEdges.length === 0);

    let role = 'internal';
    let roleTitle = 'Internal Engine Module';
    let roleDescription = `Connects ${(node.outboundEdges || []).length} dependencies with ${(node.hop1Files || []).length} direct callers.`;

    if (isEntry) {
      role = 'entry';
      roleTitle = 'Execution Entry Point';
      roleDescription = 'No other files in the project import this module. Execution begins here.';
    } else if (isLeaf) {
      role = 'leaf';
      roleTitle = 'Foundational Leaf Module';
      roleDescription = 'Self-contained module with zero internal imports. Safe to import anywhere.';
    } else if (cycle) {
      role = 'cycle';
      roleTitle = 'Circular Dependency';
      roleDescription = `Belongs to an import cycle (${cycle.length} files). Causes runtime undefined loading bugs.`;
    }

    const hop1Files = node.hop1Files || [];
    const hop2Files = node.hop2Files || [];
    const outboundEdges = node.outboundEdges || [];

    return {
      hasSelection: true,
      path: node.path,
      label: node.label || node.path.split('/').pop(),
      layer: node.layer,
      layerLabel: layerMeta.label,
      loc: node.loc || 0,
      exports: node.exports || [],
      totalImpact,
      impactPercent,
      role,
      roleTitle,
      roleDescription,
      isEntry,
      isLeaf,
      isCycle: Boolean(cycle),
      cycle,
      cycleCount: cycle ? cycle.length : 0,
      hop1Count: hop1Files.length,
      hop2Count: hop2Files.length,
      outboundCount: outboundEdges.length,
      hop1Files,
      hop2Files,
      outboundEdges,
      simulateBreakingChange: Boolean(options.simulateBreakingChange),
    };
  }

  function computeHeaderMetrics(graph, provenance = {}) {
    const nodes = (graph && graph.nodes) ? graph.nodes : [];
    const edges = (graph && graph.edges) ? graph.edges : [];
    const cycles = (graph && graph.cycles) ? graph.cycles : [];

    let topHotspot = null;
    if (nodes.length > 0) {
      const top = (typeof graph.getTopHubs === 'function')
        ? graph.getTopHubs(1)[0]
        : [...nodes].sort((a, b) => (b.totalImpact || 0) - (a.totalImpact || 0))[0];
      if (top) {
        topHotspot = {
          path: top.path,
          totalImpact: top.totalImpact || 0,
        };
      }
    }

    let freshnessLabel = 'Snapshot loaded';
    if (provenance.kind === 'sample') {
      freshnessLabel = 'Built-in sample';
    } else if (provenance.scannedAt) {
      freshnessLabel = `Scanned ${new Date(provenance.scannedAt).toLocaleString()}`;
    }

    return {
      totalFiles: nodes.length,
      totalEdges: edges.length,
      cyclesCount: cycles.length,
      topHotspot,
      freshnessLabel,
    };
  }

  return {
    getLayerMeta,
    computeFileListViewModel,
    computeInspectorViewModel,
    computeHeaderMetrics,
  };
});
