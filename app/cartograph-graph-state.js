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
      graph: (typeof CartographParser !== 'undefined' && typeof CartographParser.createGraph === 'function')
        ? CartographParser.createGraph({ nodes: [], edges: [], cycles: [], unresolved: [] })
        : {
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
      folderFilter: null,
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
        entry:  { label: 'Entry Points', color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)', rank: 5 }, // taste-skill-ignore: asserted by test/student-features.test.js
        core:   { label: 'DB & Core',     color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)', rank: 4 },
        parser: { label: 'Parser Engine', color: '#bdbdc0', bg: 'rgba(189, 189, 192, 0.15)', rank: 3 },
        agent:  { label: 'Agent & Evals', color: '#44a282', bg: 'rgba(68, 162, 130, 0.15)', rank: 2 },
        api:    { label: 'API & Auth',    color: '#d9a441', bg: 'rgba(217, 164, 65, 0.15)', rank: 1 },
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
      state.folderFilter = null;
      syncCanvasToggleState();
      const stream = document.getElementById('agentConversationStream');
      if (stream) stream.replaceChildren();
      const question = document.getElementById('agentQuestionInput');
      if (question) question.value = '';
      const banner = document.getElementById('canvasAlertBanner');
      if (banner) banner.classList.add('hidden');

      state.graph = (graph && typeof graph.getNode === 'function')
        ? graph
        : (typeof CartographParser !== 'undefined' && typeof CartographParser.createGraph === 'function'
            ? CartographParser.createGraph({
                name: state.repoName,
                description: state.repoDescription,
                nodes,
                edges,
                cycles: graph.cycles || [],
                unresolved: graph.unresolved || []
              })
            : {
                nodes,
                edges,
                cycles: graph.cycles || [],
                unresolved: graph.unresolved || []
              });
      state.agentWalkedFiles.clear();
      state.agentActiveEdges.clear();

      const knownPathsSet = new Set(nodes.map(n => n.path));
      if (options.selection === 'hotspot') state.selectedFile = null;
      else if (options.selection && typeof options.selection === 'object') state.selectedFile = options.selection.path;
      if (!nodes.length) state.selectedFile = null;
      if (!knownPathsSet.has(state.selectedFile) && nodes.length > 0) {
        const top = typeof state.graph.getTopHubs === 'function' ? state.graph.getTopHubs(1)[0] : null;
        state.selectedFile = top ? top.path : nodes[0].path;
      }

      if (options.customLabel !== undefined) markPresetSelectCustom(options.customLabel);

      adoptedPresetValue = document.getElementById('repoPresetSelect')?.value;
      computeGraphNodePositions();
      if (options.selection && options.selection.pan && state.selectedFile) {
        const selectedNode = typeof state.graph.getNode === 'function' ? state.graph.getNode(state.selectedFile) : nodes.find(node => node.path === state.selectedFile);
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
      return CartographCamera.getNodeBounds(node);
    }

    function fitGraphToCanvas(paddingOverride) {
      const canvas = document.getElementById('dependencyCanvas');
      if (!canvas || !canvas.clientWidth || !canvas.clientHeight || (canvas.getClientRects && !canvas.getClientRects().length)) {
        state.ui.pendingFit = true;
        return false;
      }
      if (!state.graph.nodes.length) { state.camera = { x: 0, y: 0, zoom: 1 }; return true; }

      let targetNodes = state.graph.nodes;
      if (state.folderFilter && state.layerFilter !== 'all') {
        const folder = state.folderFilter;
        const matching = state.graph.nodes.filter(n =>
          (folder === '/' ? (!n.folder || n.folder === '/') : (n.folder === folder || n.path.startsWith(folder + '/'))) &&
          n.layer === state.layerFilter
        );
        if (matching.length) {
          targetNodes = matching;
        } else {
          const folderOnly = state.graph.nodes.filter(n =>
            folder === '/' ? (!n.folder || n.folder === '/') : (n.folder === folder || n.path.startsWith(folder + '/'))
          );
          if (folderOnly.length) targetNodes = folderOnly;
        }
      } else if (state.folderFilter) {
        const folder = state.folderFilter;
        const matching = state.graph.nodes.filter(n =>
          folder === '/' ? (!n.folder || n.folder === '/') : (n.folder === folder || n.path.startsWith(folder + '/'))
        );
        if (matching.length) targetNodes = matching;
      } else if (state.layerFilter !== 'all') {
        const matching = state.graph.nodes.filter(n => n.layer === state.layerFilter);
        if (matching.length) targetNodes = matching;
      }

      const pad = paddingOverride || { top: 48, right: 16, bottom: 16, left: 16 };
      state.camera = CartographCamera.fitToNodes(targetNodes, canvas.clientWidth, canvas.clientHeight, pad);
      state.ui.pendingFit = false;
      return true;
    }

    // Compatibility seam consumed by the responsive shell.
    function fitGraphToViewport() { return fitGraphToCanvas(); }

    function getNodeVisualRole(nodePath) {
      if (nodePath === state.selectedFile) return 'selected';
      const selNode = (state.graph && typeof state.graph.getNode === 'function')
        ? state.graph.getNode(state.selectedFile)
        : (state.graph?.nodes?.find(n => n.path === state.selectedFile));
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
        if (updates.folderFilter !== undefined) s.folderFilter = updates.folderFilter;
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

      function selectFile(filePath, pan = false) {
        if (typeof selectFileNode === 'function') {
          selectFileNode(filePath, pan);
        } else {
          s.selectedFile = filePath;
          notify({ type: 'selectFile', filePath, pan });
        }
      }

      function setFolderFocus(folder) {
        if (typeof focusFolder === 'function') {
          focusFolder(folder);
        } else {
          s.folderFilter = folder;
          notify({ type: 'filter', updates: { folderFilter: folder } });
        }
      }

      function clearFolderFocusAction() {
        if (typeof clearFolderFocus === 'function') {
          clearFolderFocus();
        } else {
          s.folderFilter = null;
          notify({ type: 'filter', updates: { folderFilter: null } });
        }
      }

      function setLayerFilterAction(layer) {
        if (typeof setLayerFilter === 'function') {
          setLayerFilter(layer);
        } else {
          s.layerFilter = layer;
          notify({ type: 'filter', updates: { layerFilter: layer } });
        }
      }

      function fit(padding) {
        const result = (typeof fitGraphToCanvas === 'function') ? fitGraphToCanvas(padding) : null;
        notify({ type: 'fit', camera: s.camera });
        return result;
      }

      function dispatch(action) {
        if (!action || typeof action.type !== 'string') return;
        switch (action.type) {
          case 'LOAD_GRAPH':
            loadGraph(action.graph, action.provenance, action.options);
            break;
          case 'SELECT_FILE':
            selectFile(action.filePath, action.pan);
            break;
          case 'SET_FOLDER_FOCUS':
            setFolderFocus(action.folder);
            break;
          case 'CLEAR_FOLDER_FOCUS':
            clearFolderFocusAction();
            break;
          case 'SET_LAYER_FILTER':
            setLayerFilterAction(action.layer);
            break;
          case 'SET_LAYOUT':
            setLayout(action.mode || action.layout);
            break;
          case 'SET_SIMULATION':
            setSimulation(action);
            break;
          case 'UPDATE_CAMERA':
            updateCamera(action.camera);
            break;
          case 'FIT':
            fit(action.padding);
            break;
          default:
            notify(action);
        }
      }

      return {
        state: s,
        getState,
        subscribe,
        loadGraph,
        setLayout,
        setFilter,
        selectFile,
        setFolderFocus,
        clearFolderFocus: clearFolderFocusAction,
        setLayerFilter: setLayerFilterAction,
        setSimulation,
        updateCamera,
        fit,
        dispatch,
        notify,
      };
    }

    const CartographStore = createGraphStore(state);
    if (typeof globalThis !== 'undefined') globalThis.CartographStore = CartographStore;
    else if (typeof window !== 'undefined') window.CartographStore = CartographStore;

