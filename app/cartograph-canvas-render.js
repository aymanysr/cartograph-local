// Moved verbatim from cartograph.html (split preserved original file order).
// canvas-render: see cartograph.html; loads as a classic script after the lib/ files.
    function getGraphEdgeRole(edge, selectedNode) {
      if (!selectedNode) return 'neutral';
      if (edge.target === selectedNode.path) return 'hop1';
      if (selectedNode.hop2Files.includes(edge.source) && selectedNode.hop1Files.includes(edge.target)) return 'hop2';
      return 'neutral';
    }

    function graphCardEndpoint(node, other) {
      if (typeof CartographRenderMath !== 'undefined') {
        return CartographRenderMath.computeCardEndpoint(node, other);
      }
      const bounds = getGraphNodeBounds(node);
      const dx = other.x - node.x, dy = other.y - node.y;
      const scale = 1 / Math.max(Math.abs(dx) / ((bounds.maxX - bounds.minX) / 2), Math.abs(dy) / ((bounds.maxY - bounds.minY) / 2), 1);
      return {x: node.x + dx * scale, y: node.y + dy * scale};
    }

    function getCachedLabelMap(graph) {
      if (!graph) return new Map();
      if (!graph._labelMap || graph._labelMapNodes !== graph.nodes) {
        graph._labelMap = (typeof CartographRenderMath !== 'undefined')
          ? CartographRenderMath.disambiguateNodeLabels(graph.nodes)
          : new Map();
        graph._labelMapNodes = graph.nodes;
      }
      return graph._labelMap;
    }

    function syncCanvasSize(canvas, dpr) {
      const W = canvas.clientWidth, H = canvas.clientHeight;
      const targetW = Math.floor(W * dpr), targetH = Math.floor(H * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      return { W, H };
    }

    function drawDependencyGraph() {
      const canvas = document.getElementById('dependencyCanvas');
      if (!canvas || !canvas.clientWidth || !canvas.clientHeight) return;
      const dpr = window.devicePixelRatio || 1;
      const { W, H } = syncCanvasSize(canvas, dpr);
      const ctx = canvas.getContext('2d');
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#141416';
      ctx.fillRect(0, 0, W, H);

      const getNode = (p) => (typeof state.graph.getNode === 'function')
        ? state.graph.getNode(p)
        : (state.graph.nodes ? state.graph.nodes.find(n => n.path === p) : null);
      const selected = getNode(state.selectedFile);
      const hovered = state.hoveredFile ? getNode(state.hoveredFile) : null;
      const labelMap = getCachedLabelMap(state.graph);

      if (typeof CartographCanvasPipeline !== 'undefined') {
        CartographCanvasPipeline.executePipeline({
          ctx,
          width: W,
          height: H,
          graph: state.graph,
          camera: state.camera,
          layoutMode: state.graphLayout,
          selectedNode: selected,
          hoveredNode: hovered,
          folderFilter: state.folderFilter,
          labelMap,
          getNode,
          simulateBreakingChange: Boolean(state.simulateBreakingChange),
        });
      }
      ctx.restore();
    }

    function startCanvasAnimationLoop() {
      function frame() {
        state.animPhase = (state.animPhase + 1) % 10000;
        if (state.activeView === 'explorer') {
          drawDependencyGraph();
        }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    function initCanvasInteractions() {
      const canvas = document.getElementById('dependencyCanvas');
      if (!canvas) return;

      function screenToWorld(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        return CartographCamera.toWorld(state.camera, {
          x: clientX - rect.left,
          y: clientY - rect.top,
        });
      }

      function findNodeAt(wx, wy) {
        for (let i = state.graph.nodes.length - 1; i >= 0; i--) {
          const n = state.graph.nodes[i];
          const bounds = getGraphNodeBounds(n);
          if (wx >= bounds.minX && wx <= bounds.maxX && wy >= bounds.minY && wy <= bounds.maxY) return n;
        }
        return null;
      }

      let pointerDownPos = { x: 0, y: 0 };
      let pointerMoved = false;

      canvas.addEventListener('mouseleave', () => {
        if (!state.draggingNode && !state.panningCanvas) {
          state.hoveredFile = null;
        }
      });

      canvas.addEventListener('mousedown', (e) => {
        pointerDownPos = { x: e.clientX, y: e.clientY };
        pointerMoved = false;
        const world = screenToWorld(e.clientX, e.clientY);
        const hit = findNodeAt(world.x, world.y);
        if (hit) {
          state.draggingNode = hit;
        } else {
          state.panningCanvas = true;
          state.panStart = { x: e.clientX - state.camera.x, y: e.clientY - state.camera.y };
        }
      });

      window.addEventListener('mousemove', (e) => {
        if ((state.draggingNode || state.panningCanvas) && Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y) >= 6) pointerMoved = true;
        if (state.draggingNode) {
          const world = screenToWorld(e.clientX, e.clientY);
          state.draggingNode.x = world.x;
          state.draggingNode.y = world.y;
          return;
        }
        if (state.panningCanvas) {
          state.camera.x = e.clientX - state.panStart.x;
          state.camera.y = e.clientY - state.panStart.y;
          return;
        }
        if (e.target === canvas) {
          const world = screenToWorld(e.clientX, e.clientY);
          const hit = findNodeAt(world.x, world.y);
          state.hoveredFile = hit ? hit.path : null;
          canvas.style.cursor = hit ? 'pointer' : 'grab';
        } else if (!state.draggingNode && !state.panningCanvas) {
          if (state.hoveredFile) state.hoveredFile = null;
        }
      });

      window.addEventListener('mouseup', (e) => {
        const movedDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
        if (state.draggingNode && !pointerMoved && movedDist < 6) {
          selectFileFromUi(state.draggingNode.path, false);
        }
        state.draggingNode = null;
        state.panningCanvas = false;
      });

      window.addEventListener('keydown', (e) => {
        if (state.activeView !== 'explorer') return;
        if (e.target && e.target.matches && e.target.matches('input, textarea, select')) return;
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '_', '0', 'f', 'F'].includes(e.key)) {
          const active = document.activeElement;
          const isMapActive = !active || active === canvas || active === document.body || active.id === 'mapRegion';
          if (!isMapActive) return;
          e.preventDefault();
          const panStep = 50;
          if (e.key === 'ArrowLeft') state.camera = CartographCamera.panBy(state.camera, panStep, 0);
          else if (e.key === 'ArrowRight') state.camera = CartographCamera.panBy(state.camera, -panStep, 0);
          else if (e.key === 'ArrowUp') state.camera = CartographCamera.panBy(state.camera, 0, panStep);
          else if (e.key === 'ArrowDown') state.camera = CartographCamera.panBy(state.camera, 0, -panStep);
          else if (e.key === '+' || e.key === '=') zoomGraph(1.15);
          else if (e.key === '-' || e.key === '_') zoomGraph(0.85);
          else if (e.key === '0' || e.key === 'f' || e.key === 'F') resetGraphView();
        }
      });

      canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.12 : 0.89;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        state.camera = CartographCamera.zoomAt(state.camera, { x: mx, y: my }, factor);
      }, { passive: false });
    }

    function zoomGraph(factor) {
      const canvas = document.getElementById('dependencyCanvas');
      const cx = canvas ? canvas.clientWidth / 2 : 400;
      const cy = canvas ? canvas.clientHeight / 2 : 300;
      state.camera = CartographCamera.zoomAt(state.camera, { x: cx, y: cy }, factor);
    }

    function resetGraphView() {
      fitGraphToCanvas();
      if (typeof updateShellZoom === 'function') updateShellZoom();
      showToast('Graph fitted to screen');
    }

    const LAYOUT_MODES = [
      { id: 'dag-lr', label: 'Pipeline', title: 'Layout: Pipeline (Left-to-Right)' },
      { id: 'dag-tb', label: 'Tree', title: 'Layout: Tree (Top-to-Bottom)' },
      { id: 'cluster', label: 'Cluster', title: 'Layout: Directory Clusters' }
    ];

    function cycleGraphLayout() {
      let cur = state.graphLayout;
      if (cur === 'dag') cur = 'dag-lr';
      if (cur === 'force') cur = 'cluster';
      const curIdx = LAYOUT_MODES.findIndex(m => m.id === cur);
      const nextIdx = (curIdx + 1) % LAYOUT_MODES.length;
      const nextMode = LAYOUT_MODES[nextIdx >= 0 ? nextIdx : 0];
      setGraphLayout(nextMode.id);
      showToast(nextMode.title);
    }

    function setGraphLayout(mode) {
      state.graphLayout = mode;
      const normalized = (mode === 'dag') ? 'dag-lr' : (mode === 'force') ? 'cluster' : mode;
      const modeObj = LAYOUT_MODES.find(m => m.id === normalized) || LAYOUT_MODES[0];
      const toggleBtn = document.getElementById('btnToggleLayout');
      if (toggleBtn) {
        toggleBtn.textContent = modeObj.label;
        toggleBtn.title = modeObj.title;
      }
      const btnDag = document.getElementById('layoutBtnDag');
      const btnForce = document.getElementById('layoutBtnForce');
      if (btnDag) {
        btnDag.className = (mode === 'dag' || mode === 'dag-lr')
          ? 'px-2.5 py-1 rounded text-xs font-medium bg-slate-800 text-white flex items-center gap-1 transition-colors'
          : 'px-2.5 py-1 rounded text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1 transition-colors';
      }
      if (btnForce) {
        btnForce.className = (mode === 'force' || mode === 'cluster')
          ? 'px-2.5 py-1 rounded text-xs font-medium bg-slate-800 text-white flex items-center gap-1 transition-colors'
          : 'px-2.5 py-1 rounded text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1 transition-colors';
      }
      computeGraphNodePositions();
      if (typeof updateShellZoom === 'function') updateShellZoom();
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }

    function toggleIsolateBlastRadius() {
      state.isolateBlastRadius = !state.isolateBlastRadius;
      syncCanvasToggleState();
      lucide.createIcons();
    }

    function toggleBreakSimulation() {
      state.simulateBreakingChange = !state.simulateBreakingChange;
      const btn = document.getElementById('btnSimulateBreak');
      const banner = document.getElementById('canvasAlertBanner');
      const bannerText = document.getElementById('canvasAlertText');
      const selNode = (state.graph && typeof state.graph.getNode === 'function')
        ? state.graph.getNode(state.selectedFile)
        : (state.graph?.nodes ? state.graph.nodes.find(n => n.path === state.selectedFile) : null);

      if (state.simulateBreakingChange && selNode) {
        if (btn) btn.className = 'px-2.5 py-1 rounded text-xs font-medium bg-amber-500 text-slate-950 font-semibold flex items-center gap-1 transition-colors';
        if (banner) banner.classList.remove('hidden');
        if (bannerText) bannerText.textContent = `Simulated signature change in ${selNode.path} (${selNode.exports[0] || 'default'}): ${selNode.hop1Files.length} direct files and ${selNode.hop2Files.length} transitive files will break!`;
      } else {
        if (btn) btn.className = 'px-2.5 py-1 rounded text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1 transition-colors';
        if (banner) banner.classList.add('hidden');
      }
      syncCanvasToggleState();
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }

    function clearCanvasBanner() {
      state.simulateBreakingChange = false;
      const banner = document.getElementById('canvasAlertBanner');
      if (banner) banner.classList.add('hidden');
      syncCanvasToggleState();
      const btn = document.getElementById('btnSimulateBreak');
      if (btn) btn.className = 'px-2.5 py-1 rounded text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1 transition-colors';
    }


    function syncCanvasToggleState() {
      [
        ['btnToggleIsolate', state.isolateBlastRadius],
        ['btnSimulateBreak', state.simulateBreakingChange],
        ['btnInspectorSimulate', state.simulateBreakingChange]
      ].forEach(([id, pressed]) => {
        const button = document.getElementById(id);
        if (button) button.setAttribute('aria-pressed', String(pressed));
      });
    }
