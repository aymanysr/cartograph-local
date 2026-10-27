// Moved verbatim from cartograph.html (split preserved original file order).
// graph-state: see cartograph.html; loads as a classic script after the lib/ files.
    const state = {
      activeView: 'explorer',
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

    function getLayerMeta(layer) {
      const map = {
        core:   { label: 'DB & Core',     color: '#38BDF8', bg: 'rgba(56, 189, 248, 0.15)', rank: 4 },
        parser: { label: 'Parser Engine', color: '#A855F7', bg: 'rgba(168, 85, 247, 0.15)', rank: 3 },
        agent:  { label: 'Agent & Evals', color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)', rank: 2 },
        api:    { label: 'API & Auth',    color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)', rank: 1 },
        ui:     { label: 'UI & Entry',    color: '#6366F1', bg: 'rgba(99, 102, 241, 0.15)', rank: 0 }
      };
      return map[layer] || map.core;
    }

    function parseRepositoryIntoGraph(files, repoName, repoDescription = '') {
      state.repoName = repoName;
      state.repoDescription = repoDescription;
      state.rawFiles = files;

      const graph = CartographParser.parseRepository(files, {
        repoName,
        repoDescription
      });
      applyParsedGraph(graph);
    }

    function applyParsedGraph(graph) {
      const nodes = graph.nodes || [];
      const edges = graph.edges || [];

      state.repoName = graph.name || state.repoName;
      state.repoDescription = graph.description || state.repoDescription || '';
      if (!state.rawFiles.length || state.rawFiles.length !== nodes.length) {
        state.rawFiles = nodes.map(n => ({ path: n.path, content: n.content }));
      }

      state.graph = {
        nodes,
        edges,
        cycles: graph.cycles || [],
        unresolved: graph.unresolved || []
      };
      state.agentWalkedFiles.clear();
      state.agentActiveEdges.clear();

      const knownPathsSet = new Set(nodes.map(n => n.path));
      if (!knownPathsSet.has(state.selectedFile) && nodes.length > 0) {
        const sorted = [...nodes].sort((a, b) => b.totalImpact - a.totalImpact);
        state.selectedFile = sorted[0].path;
      }

      computeGraphNodePositions();
      updateHeaderMetrics();
      renderFileListSidebar();
      renderInspectorPanel();
      regenerateSpecDocs();
      renderEvalSuite();
    }

    function computeGraphNodePositions() {
      const nodes = state.graph.nodes;
      const edges = state.graph.edges;
      if (!nodes.length) return;

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

        const padX = 110;
        const padY = 85;
        const usableW = Math.max(520, width - padX * 2);
        const usableH = Math.max(400, height - padY * 2);

        activeRanks.forEach((rankVal, rowIdx) => {
          const rowNodes = rankBuckets[rankVal];
          rowNodes.sort((a, b) => b.totalImpact - a.totalImpact || a.path.localeCompare(b.path));
          const y = padY + (activeRanks.length === 1 ? usableH / 2 : (rowIdx / (activeRanks.length - 1)) * usableH);

          rowNodes.forEach((node, colIdx) => {
            const x = padX + (rowNodes.length === 1 ? usableW / 2 : ((colIdx + 0.5) / rowNodes.length) * usableW);
            const stagger = (colIdx % 2 === 0 ? -12 : 12);
            node.x = x;
            node.y = y + stagger;
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

      const worldBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      nodes.forEach((n) => {
        worldBox.minX = Math.min(worldBox.minX, n.x ?? 0);
        worldBox.minY = Math.min(worldBox.minY, n.y ?? 0);
        worldBox.maxX = Math.max(worldBox.maxX, n.x ?? 0);
        worldBox.maxY = Math.max(worldBox.maxY, n.y ?? 0);
      });
      state.camera = (typeof CartographFit === 'object' && CartographFit)
        ? CartographFit.computeFitCamera(worldBox, width, height,
            { top: 88, right: 40, bottom: 104, left: 40 })
        : { x: 0, y: 0, zoom: 1 };
    }

    function getNodeVisualRole(nodePath) {
      if (nodePath === state.selectedFile) return 'selected';
      const selNode = state.graph.nodes.find(n => n.path === state.selectedFile);
      if (selNode) {
        if (selNode.hop1Files.includes(nodePath)) return 'hop1';
        if (selNode.hop2Files.includes(nodePath)) return 'hop2';
        if (selNode.outboundEdges.some(e => e.target === nodePath)) return 'outbound';
      }
      if (state.agentWalkedFiles.has(nodePath)) return 'agent';
      return 'neutral';
    }

