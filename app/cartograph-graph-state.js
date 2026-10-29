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

      const canvas = document.getElementById('dependencyCanvas');
      const width = (canvas && canvas.clientWidth) ? canvas.clientWidth : 860;
      const height = (canvas && canvas.clientHeight) ? canvas.clientHeight : 600;

      if (state.graphLayout === 'dag') {
        const rankBuckets = { 0: [], 1: [], 2: [], 3: [], 4: [] };
        nodes.forEach(n => {
          const rank = getLayerMeta(n.layer).rank;
          rankBuckets[rank].push(n);
        });

        const activeRanks = Object.keys(rankBuckets)
          .map(Number)
          .filter(r => rankBuckets[r].length > 0)
          .sort((a, b) => a - b);

        activeRanks.forEach((rankVal, rowIdx) => {
          const rowNodes = rankBuckets[rankVal];
          rowNodes.sort((a, b) => b.totalImpact - a.totalImpact || a.path.localeCompare(b.path));
          rowNodes.forEach((node, colIdx) => {
            node.x = (colIdx - (rowNodes.length - 1) / 2) * 216;
            node.y = rowIdx * 96;
          });
        });
      } else {
        const cx = width / 2;
        const cy = height / 2;
        nodes.forEach((n, idx) => {
          const angle = (idx / nodes.length) * Math.PI * 2;
          const radius = Math.min(width, height) * 0.32;
          n.x = cx + Math.cos(angle) * radius;
          n.y = cy + Math.sin(angle) * radius;
          n.vx = 0;
          n.vy = 0;
        });

        const nodeMap = new Map(nodes.map(n => [n.path, n]));
        for (let iter = 0; iter < 140; iter++) {
          for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
              const a = nodes[i];
              const b = nodes[j];
              let dx = b.x - a.x;
              let dy = b.y - a.y;
              let distSq = dx * dx + dy * dy + 1;
              let dist = Math.sqrt(distSq);
              const force = 18000 / distSq;
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;
              a.vx -= fx;
              a.vy -= fy;
              b.vx += fx;
              b.vy += fy;
            }
          }
          for (const e of edges) {
            const s = nodeMap.get(e.source);
            const t = nodeMap.get(e.target);
            if (!s || !t) continue;
            const dx = t.x - s.x;
            const dy = t.y - s.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const targetDist = 155;
            const force = (dist - targetDist) * 0.035;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            s.vx += fx;
            s.vy += fy;
            t.vx -= fx;
            t.vy -= fy;
          }
          for (const n of nodes) {
            n.vx += (cx - n.x) * 0.012;
            n.vy += (cy - n.y) * 0.012;
            n.x += n.vx * 0.25;
            n.y += n.vy * 0.25;
            n.vx *= 0.65;
            n.vy *= 0.65;
          }
        }
      }

      if (state.graphLayout === 'force') separateGraphNodeCards(nodes);
      fitGraphToCanvas();
    }

    function getGraphNodeBounds(node) {
      return { minX: node.x - 96, minY: node.y - 24, maxX: node.x + 96, maxY: node.y + 24 };
    }

    function separateGraphNodeCards(nodes) {
      for (let pass = 0; pass < 32; pass++) {
        let overlap = false;
        for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const px = 204 - Math.abs(dx), py = 60 - Math.abs(dy);
          if (px <= 0 || py <= 0) continue;
          overlap = true;
          if (px <= py) { const shift = (px / 2 + .01) * (Math.sign(dx) || 1); a.x -= shift; b.x += shift; }
          else { const shift = (py / 2 + .01) * (Math.sign(dy) || 1); a.y -= shift; b.y += shift; }
        }
        if (!overlap) break;
      }
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

