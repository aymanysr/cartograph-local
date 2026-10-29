// Moved verbatim from cartograph.html (split preserved original file order).
// graph-state: see cartograph.html; loads as a classic script after the lib/ files.
    const state = {
      activeView: 'explorer',
      ui: { phonePane: 'map', inspectorCollapsed: false, overlay: null, overlayOpener: null, paletteMode: 'commands', paletteQuery: '', paletteActiveIndex: -1, pendingFit: false },
      repositoryProvenance: { kind: 'sample', scannedAt: null },
      evalRun: null,
      rightPanelTab: 'inspector',
      repoName: 'cartograph-nextjs-saas',
      repoDescription: '',
      rawFiles: [],
      graph: {
        nodes: [],
        edges: [],
        cycles: [],
        unresolved: []
      },
      selectedFile: 'src/lib/db/supabase.ts',
      hoveredFile: null,
      agentWalkedFiles: new Set(),
      agentActiveEdges: new Set(),
      layerFilter: 'all',
      fileSortMode: 'blast',
      searchQuery: '',
      graphLayout: 'dag',
      isolateBlastRadius: false,
      simulateBreakingChange: false,
      camera: { x: 0, y: 0, zoom: 1 },
      draggingNode: null,
      panningCanvas: false,
      panStart: { x: 0, y: 0 },
      animPhase: 0,
      evalPromptMode: 'strict',
      activeSpecDoc: 'PROJECT.md',
      specDocs: {
        'PROJECT.md': '',
        'CLAUDE.md': '',
        'cartograph-scan.mjs': ''
      },
      agentConfig: {
        engine: 'deterministic',
        endpoint: 'http://localhost:11434/api/chat',
        model: 'qwen2.5-coder:7b',
        apiKey: ''
      }
    };

    let adoptedPresetValue = document.getElementById('repoPresetSelect')?.value;

    function getLayerMeta(layer) {
      const map = {
        core:   { label: 'DB & Core',     color: '#6366f1', bg: 'rgba(99, 102, 241, 0.15)', rank: 4 },
        parser: { label: 'Parser Engine', color: '#bdbdc0', bg: 'rgba(189, 189, 192, 0.15)', rank: 3 },
        agent:  { label: 'Agent & Evals', color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)', rank: 2 },
        api:    { label: 'API & Auth',    color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)', rank: 1 },
        ui:     { label: 'UI & Entry',    color: '#4a8ad6', bg: 'rgba(74, 138, 214, 0.15)', rank: 0 }
      };
      return map[layer] || map.core;
    }

    function parseRepositoryIntoGraph(files, repoName, repoDescription = '', provenance = { kind: 'local', scannedAt: new Date().toISOString() }, options = {}) {
      const graph = CartographParser.parseRepository(files, {
        repoName,
        repoDescription
      });
      applyParsedGraph(graph, provenance, options);
    }

    function applyParsedGraph(graph, provenance = { kind: 'snapshot', scannedAt: null }, options = {}) {
      const nodes = graph.nodes || [];
      const edges = graph.edges || [];

      state.repoName = graph.name || state.repoName;
      state.repoDescription = graph.description || '';
      state.rawFiles = nodes.map(n => ({ path: n.path, content: n.content || '' }));
      state.repositoryProvenance = { kind: provenance.kind, scannedAt: provenance.scannedAt && Number.isFinite(Date.parse(provenance.scannedAt)) ? new Date(provenance.scannedAt).toISOString() : null };
      state.evalRun = null;
      state.hoveredFile = null;
      state.draggingNode = null;
      state.panningCanvas = false;
      state.simulateBreakingChange = false;
      state.isolateBlastRadius = false;
      syncCanvasToggleState();
      const stream = document.getElementById('agentConversationStream');
      if (stream) stream.replaceChildren();
      const question = document.getElementById('agentQuestionInput');
      if (question) question.value = '';
      const banner = document.getElementById('canvasAlertBanner');
      if (banner) banner.classList.add('hidden');

      state.graph = {
        nodes,
        edges,
        cycles: graph.cycles || [],
        unresolved: graph.unresolved || []
      };
      state.agentWalkedFiles.clear();
      state.agentActiveEdges.clear();

      const knownPathsSet = new Set(nodes.map(n => n.path));
      if (options.selection === 'hotspot') state.selectedFile = null;
      else if (options.selection && typeof options.selection === 'object') state.selectedFile = options.selection.path;
      if (!nodes.length) state.selectedFile = null;
      if (!knownPathsSet.has(state.selectedFile) && nodes.length > 0) {
        const sorted = [...nodes].sort((a, b) => b.totalImpact - a.totalImpact);
        state.selectedFile = sorted[0].path;
      }

      if (options.customLabel !== undefined) markPresetSelectCustom(options.customLabel);

      adoptedPresetValue = document.getElementById('repoPresetSelect')?.value;
      computeGraphNodePositions();
      if (options.selection && options.selection.pan && state.selectedFile) {
        const selectedNode = nodes.find(node => node.path === state.selectedFile);
        const canvas = document.getElementById('dependencyCanvas');
        if (selectedNode && canvas) {
          state.camera.x = canvas.clientWidth / 2 - selectedNode.x * state.camera.zoom;
          state.camera.y = canvas.clientHeight / 2 - selectedNode.y * state.camera.zoom;
        }
      }
      updateHeaderMetrics();
      renderFileListSidebar();
      renderInspectorPanel();
      regenerateSpecDocs();
      renderEvalSuite();
      if (typeof syncResponsiveShell === 'function') syncResponsiveShell();
    }

    function computeGraphNodePositions() {
      const nodes = state.graph.nodes;
      const edges = state.graph.edges;
      if (!nodes.length) return;

      if (typeof CartographLayouts !== 'undefined') {
        if (state.graphLayout === 'dag-tb') {
          CartographLayouts.computeTopologicalTB(nodes, edges);
        } else if (state.graphLayout === 'force' || state.graphLayout === 'cluster') {
          CartographLayouts.computeDirectoryClusterBox(nodes, edges);
        } else {
          CartographLayouts.computeTopologicalLR(nodes, edges);
        }
        fitGraphToCanvas();
        return;
      }

      // Sane fallback positioning if CartographLayouts is not present
      nodes.forEach((n, idx) => {
        n.x = (idx % 6) * 216;
        n.y = Math.floor(idx / 6) * 96;
      });
      fitGraphToCanvas();
    }

    function getGraphNodeBounds(node) {
      return { minX: node.x - 96, minY: node.y - 24, maxX: node.x + 96, maxY: node.y + 24 };
    }

    function fitGraphToCanvas() {
      const canvas = document.getElementById('dependencyCanvas');
      if (!canvas || !canvas.clientWidth || !canvas.clientHeight || (canvas.getClientRects && !canvas.getClientRects().length)) {
        state.ui.pendingFit = true;
        return false;
      }
      if (!state.graph.nodes.length) { state.camera = { x: 0, y: 0, zoom: 1 }; return true; }
      const bounds = state.graph.nodes.map(getGraphNodeBounds);
      const worldBox = {minX: Math.min(...bounds.map(b => b.minX)), minY: Math.min(...bounds.map(b => b.minY)), maxX: Math.max(...bounds.map(b => b.maxX)), maxY: Math.max(...bounds.map(b => b.maxY))};
      state.camera = CartographFit.computeFitCamera(worldBox, canvas.clientWidth, canvas.clientHeight, {top:48,right:16,bottom:16,left:16});
      state.ui.pendingFit = false;
      return true;
    }

    // Compatibility seam consumed by the responsive shell.
    function fitGraphToViewport() { return fitGraphToCanvas(); }

    function getNodeVisualRole(nodePath) {
      if (nodePath === state.selectedFile) return 'selected';
      const selNode = state.graph.nodes.find(n => n.path === state.selectedFile);
      if (selNode) {
        if (selNode.hop1Files.includes(nodePath)) return 'hop1';
        if (selNode.hop2Files.includes(nodePath)) return 'hop2';
        if (selNode.outboundEdges.some(e => e.target === nodePath)) return 'neutral';
      }
      return 'neutral';
    }

    /**
     * Encapsulated store for Cartograph application state.
     * Provides subscription notifications and explicit action dispatchers.
     */
    function createGraphStore(targetState) {
      const listeners = new Set();
      const s = targetState;

      function notify(event = {}) {
        for (const listener of listeners) {
          try {
            listener(s, event);
          } catch (err) {
            console.error('Store listener error:', err);
          }
        }
      }

      function subscribe(listener) {
        if (typeof listener !== 'function') return () => {};
        listeners.add(listener);
        return () => listeners.delete(listener);
      }

      function getState() {
        return s;
      }

      function loadGraph(graph, provenance, options) {
        applyParsedGraph(graph, provenance, options);
        notify({ type: 'loadGraph', graph, provenance, options });
      }

      function setLayout(mode) {
        s.graphLayout = mode;
        computeGraphNodePositions();
        notify({ type: 'layout', mode });
      }

      function setFilter(updates = {}) {
        if (updates.layerFilter !== undefined) s.layerFilter = updates.layerFilter;
        if (updates.searchQuery !== undefined) s.searchQuery = updates.searchQuery;
        if (updates.fileSortMode !== undefined) s.fileSortMode = updates.fileSortMode;
        if (typeof renderFileListSidebar === 'function') renderFileListSidebar();
        notify({ type: 'filter', updates });
      }

      function setSimulation({ breaking, isolate } = {}) {
        if (breaking !== undefined) s.simulateBreakingChange = breaking;
        if (isolate !== undefined) s.isolateBlastRadius = isolate;
        if (typeof syncCanvasToggleState === 'function') syncCanvasToggleState();
        notify({ type: 'simulation', breaking, isolate });
      }

      function updateCamera(updates = {}) {
        Object.assign(s.camera, updates);
        notify({ type: 'camera', camera: s.camera });
      }

      function fit() {
        const result = fitGraphToCanvas();
        notify({ type: 'fit', camera: s.camera });
        return result;
      }

      return {
        state: s,
        getState,
        subscribe,
        loadGraph,
        setLayout,
        setFilter,
        setSimulation,
        updateCamera,
        fit,
        notify,
      };
    }

    const CartographStore = createGraphStore(state);
    if (typeof globalThis !== 'undefined') globalThis.CartographStore = CartographStore;
    else if (typeof window !== 'undefined') window.CartographStore = CartographStore;

