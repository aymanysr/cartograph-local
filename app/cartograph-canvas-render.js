// Moved verbatim from cartograph.html (split preserved original file order).
// canvas-render: see cartograph.html; loads as a classic script after the lib/ files.
    function getGraphEdgeRole(edge, selectedNode) {
      if (!selectedNode) return 'neutral';
      if (edge.target === selectedNode.path) return 'hop1';
      if (selectedNode.hop2Files.includes(edge.source) && selectedNode.hop1Files.includes(edge.target)) return 'hop2';
      return 'neutral';
    }

    function graphCardEndpoint(node, other) {
      const bounds = getGraphNodeBounds(node);
      const dx = other.x - node.x, dy = other.y - node.y;
      const scale = 1 / Math.max(Math.abs(dx) / ((bounds.maxX - bounds.minX) / 2), Math.abs(dy) / ((bounds.maxY - bounds.minY) / 2), 1);
      return {x: node.x + dx * scale, y: node.y + dy * scale};
    }

    function drawDependencyGraph() {
      const canvas = document.getElementById('dependencyCanvas');
      if (!canvas || !canvas.clientWidth || !canvas.clientHeight) return;
      const W = canvas.clientWidth, H = canvas.clientHeight, dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.floor(W*dpr) || canvas.height !== Math.floor(H*dpr)) {canvas.width=Math.floor(W*dpr);canvas.height=Math.floor(H*dpr);}
      const ctx=canvas.getContext('2d');
      ctx.save();ctx.scale(dpr,dpr);ctx.fillStyle='#141416';ctx.fillRect(0,0,W,H);
      ctx.translate(state.camera.x,state.camera.y);ctx.scale(state.camera.zoom,state.camera.zoom);

      // 1. Subtle World-Space Dot Grid for Spatial Grounding (batched path - S3/D7)
      const dotSpacing = 36;
      const startX = Math.floor((-state.camera.x / state.camera.zoom) / dotSpacing) * dotSpacing - dotSpacing;
      const endX = startX + (W / state.camera.zoom) + dotSpacing * 2;
      const startY = Math.floor((-state.camera.y / state.camera.zoom) / dotSpacing) * dotSpacing - dotSpacing;
      const endY = startY + (H / state.camera.zoom) + dotSpacing * 2;

      ctx.fillStyle = '#222228';
      ctx.beginPath();
      for (let gx = startX; gx <= endX; gx += dotSpacing) {
        for (let gy = startY; gy <= endY; gy += dotSpacing) {
          ctx.rect(gx, gy, 1.2, 1.2);
        }
      }
      ctx.fill();

      // Caching nodeMap on state.graph to eliminate 60 FPS inner-loop array allocations (S3)
      let nodeMap = state.graph._nodeMap;
      if (!nodeMap || state.graph._nodeMapNodes !== state.graph.nodes) {
        nodeMap = new Map();
        for (let i = 0; i < state.graph.nodes.length; i++) {
          nodeMap.set(state.graph.nodes[i].path, state.graph.nodes[i]);
        }
        state.graph._nodeMap = nodeMap;
        state.graph._nodeMapNodes = state.graph.nodes;
      }
      const selected = nodeMap.get(state.selectedFile);
      const hovered = state.hoveredFile ? nodeMap.get(state.hoveredFile) : null;

      // Sets for fast neighbor lookup during hover
      const hoveredOutbound = new Set();
      const hoveredInbound = new Set();
      if (hovered) {
        for (const e of state.graph.edges) {
          if (e.source === hovered.path) hoveredOutbound.add(e.target);
          if (e.target === hovered.path) hoveredInbound.add(e.source);
        }
      }

      // Check for colliding basenames across files (D8 cached - S3)
      let basenameCount = state.graph._basenameCount;
      if (!basenameCount || state.graph._basenameCountNodes !== state.graph.nodes) {
        basenameCount = new Map();
        for (let i = 0; i < state.graph.nodes.length; i++) {
          const bn = state.graph.nodes[i].path.split('/').pop();
          basenameCount.set(bn, (basenameCount.get(bn) || 0) + 1);
        }
        state.graph._basenameCount = basenameCount;
        state.graph._basenameCountNodes = state.graph.nodes;
      }

      // 2. Directory Cluster Region Watermarks (Cluster mode)
      const isClusterMode = state.graphLayout === 'force' || state.graphLayout === 'cluster';
      if (isClusterMode && state.graph.nodes.length) {
        const dirGroups = new Map();
        for (const n of state.graph.nodes) {
          const dir = (typeof CartographLayouts !== 'undefined') ? CartographLayouts.getEffectiveDirectory(n.path) : (n.path.split('/')[0] || 'root');
          if (!dirGroups.has(dir)) dirGroups.set(dir, []);
          dirGroups.get(dir).push(n);
        }
        for (const [dir, dNodes] of dirGroups.entries()) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const dn of dNodes) {
            const b = getGraphNodeBounds(dn);
            if (b.minX < minX) minX = b.minX;
            if (b.minY < minY) minY = b.minY;
            if (b.maxX > maxX) maxX = b.maxX;
            if (b.maxY > maxY) maxY = b.maxY;
          }
          const pad = 24;
          ctx.save();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(minX - pad, minY - pad - 18, (maxX - minX) + pad * 2, (maxY - minY) + pad * 2 + 18, 12);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#94a3b8'; // WCAG AA compliant contrast (D2)
          ctx.font = '600 11px "JetBrains Mono", monospace';
          ctx.textAlign = 'left';
          ctx.fillText(`📁 ${dir}/ (${dNodes.length})`, minX - pad + 12, minY - pad - 2);
          ctx.restore();
        }
      }

      // 3. Stage Guides (DAG Left-to-Right and Top-to-Bottom modes - D5)
      const isLRMode = state.graphLayout === 'dag' || state.graphLayout === 'dag-lr';
      const isTBMode = state.graphLayout === 'dag-tb';

      if (isLRMode && state.graph.nodes.length) {
        const rankColMap = new Map();
        for (const n of state.graph.nodes) {
          const r = n.rank !== undefined ? n.rank : 0;
          if (!rankColMap.has(r)) rankColMap.set(r, []);
          rankColMap.get(r).push(n);
        }
        const sortedRanks = Array.from(rankColMap.keys()).sort((a, b) => a - b);
        const maxRank = sortedRanks[sortedRanks.length - 1] || 0;

        sortedRanks.forEach((r) => {
          const rNodes = rankColMap.get(r);
          const colX = (r - maxRank / 2) * 260;
          const minY = Math.min(...rNodes.map(n => n.y));
          const maxY = Math.max(...rNodes.map(n => n.y));

          ctx.save();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(colX, minY - 60);
          ctx.lineTo(colX, maxY + 60);
          ctx.stroke();

          ctx.fillStyle = '#94a3b8'; // WCAG AA compliant (D2)
          ctx.font = '600 10px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          const stageName = r === 0 ? 'ENTRY POINTS' : r === maxRank ? 'LEAF & CORE' : `TIER ${r}`;
          ctx.fillText(stageName, colX, minY - 44);
          ctx.restore();
        });
      } else if (isTBMode && state.graph.nodes.length) {
        const rankRowMap = new Map();
        for (const n of state.graph.nodes) {
          const r = n.rank !== undefined ? n.rank : 0;
          if (!rankRowMap.has(r)) rankRowMap.set(r, []);
          rankRowMap.get(r).push(n);
        }
        const sortedRanks = Array.from(rankRowMap.keys()).sort((a, b) => a - b);
        const maxRank = sortedRanks[sortedRanks.length - 1] || 0;

        sortedRanks.forEach((r) => {
          const rNodes = rankRowMap.get(r);
          const rowY = (r - maxRank / 2) * 110;
          const minX = Math.min(...rNodes.map(n => n.x));
          const maxX = Math.max(...rNodes.map(n => n.x));

          ctx.save();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(minX - 60, rowY);
          ctx.lineTo(maxX + 60, rowY);
          ctx.stroke();

          ctx.fillStyle = '#94a3b8';
          ctx.font = '600 10px "JetBrains Mono", monospace';
          ctx.textAlign = 'right';
          const stageName = r === 0 ? 'ENTRY' : r === maxRank ? 'CORE' : `TIER ${r}`;
          ctx.fillText(stageName, minX - 70, rowY + 3);
          ctx.restore();
        });
      }

      // 4. Edges with Adaptive Routing & Arrival Tangent Arrowheads (D3, S1)
      for (const edge of state.graph.edges) {
        const source = nodeMap.get(edge.source), target = nodeMap.get(edge.target);
        if (!source || !target) continue;

        const role = getGraphEdgeRole(edge, selected);
        const start = graphCardEndpoint(source, target);
        const end = graphCardEndpoint(target, source);

        const isHoveredOut = hovered && edge.source === hovered.path;
        const isHoveredIn = hovered && edge.target === hovered.path;

        ctx.save();

        let edgeAlpha = 1;
        let strokeColor = '#3f3f46'; // WCAG non-text 3.1:1 compliant (D2)
        let strokeWidth = 1;

        if (hovered) {
          if (isHoveredOut) {
            strokeColor = '#38bdf8'; // Outbound imports in bright cyan
            strokeWidth = 2.2;
            edgeAlpha = 0.95;
          } else if (isHoveredIn) {
            strokeColor = '#f43f5e'; // Inbound callers in bright rose
            strokeWidth = 2.2;
            edgeAlpha = 0.95;
          } else {
            edgeAlpha = 0.20; // Maintain ambient legibility (D2)
          }
        } else if (state.isolateBlastRadius && role === 'neutral') {
          edgeAlpha = 0.12;
        } else if (state.layerFilter !== 'all' && source.layer !== state.layerFilter && target.layer !== state.layerFilter) {
          edgeAlpha = 0.15;
        } else if (role === 'hop1') {
          strokeColor = '#e5566f';
          strokeWidth = 1.8;
          edgeAlpha = 0.85;
        } else if (role === 'hop2') {
          strokeColor = '#d9a441';
          strokeWidth = 1.5;
          edgeAlpha = 0.75;
        }

        ctx.globalAlpha = edgeAlpha;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;

        let arrivalAngle = 0;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);

        if (isLRMode) {
          // Horizontal flow
          const dx = end.x - start.x;
          const cpOffset = Math.min(100, Math.max(30, Math.abs(dx) * 0.45));
          const cp1x = start.x + (dx >= 0 ? cpOffset : -cpOffset), cp1y = start.y;
          const cp2x = end.x - (dx >= 0 ? cpOffset : -cpOffset), cp2y = end.y;
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, end.x, end.y);
          arrivalAngle = Math.atan2(end.y - cp2y, end.x - cp2x);
        } else if (isTBMode) {
          // Vertical flow (Fix S1/D3 S-curve bug)
          const dy = end.y - start.y;
          const cpOffset = Math.min(100, Math.max(30, Math.abs(dy) * 0.45));
          const cp1x = start.x, cp1y = start.y + (dy >= 0 ? cpOffset : -cpOffset);
          const cp2x = end.x, cp2y = end.y - (dy >= 0 ? cpOffset : -cpOffset);
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, end.x, end.y);
          arrivalAngle = Math.atan2(end.y - cp2y, end.x - cp2x);
        } else {
          // Cluster mode: clean straight line
          ctx.lineTo(end.x, end.y);
          arrivalAngle = Math.atan2(end.y - start.y, end.x - start.x);
        }
        ctx.stroke();

        // Arrowhead perfectly aligned with arrival tangent angle
        ctx.fillStyle = strokeColor;
        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - 7 * Math.cos(arrivalAngle - 0.45), end.y - 7 * Math.sin(arrivalAngle - 0.45));
        ctx.lineTo(end.x - 7 * Math.cos(arrivalAngle + 0.45), end.y - 7 * Math.sin(arrivalAngle + 0.45));
        ctx.closePath();
        ctx.fill();

        if (state.agentActiveEdges.has(`${edge.source}->${edge.target}`)) {
          ctx.fillStyle = '#5fc39c';
          ctx.fillRect((start.x + end.x) / 2 - 3, (start.y + end.y) / 2 - 3, 6, 6);
        }
        ctx.restore();
      }

      // 5. Node Cards with Layer Accent Bar & WCAG Contrast (D2, D8)
      for (const node of state.graph.nodes) {
        const role = getNodeVisualRole(node.path);
        const bounds = getGraphNodeBounds(node);
        const meta = getLayerMeta(node.layer);

        const isHoveredSelf = hovered && hovered.path === node.path;
        const isHoveredNeighbor = hovered && (hoveredOutbound.has(node.path) || hoveredInbound.has(node.path));

        ctx.save();

        let nodeAlpha = 1;
        if (hovered && !isHoveredSelf && !isHoveredNeighbor) {
          nodeAlpha = 0.38; // Retain ambient legibility (D2)
        } else if (state.isolateBlastRadius && role === 'neutral') {
          nodeAlpha = 0.18;
        } else if (state.layerFilter !== 'all' && node.layer !== state.layerFilter && role === 'neutral') {
          nodeAlpha = 0.18;
        }
        ctx.globalAlpha = nodeAlpha;

        // Card background & borders (D2)
        ctx.fillStyle = isHoveredSelf ? '#20222a' : '#18181c';
        let strokeColor = '#2d2d34';
        let strokeW = 1;

        if (role === 'selected') {
          strokeColor = '#4a8ad6';
          strokeW = 2;
        } else if (isHoveredSelf) {
          strokeColor = '#38bdf8';
          strokeW = 2;
        } else if (hovered && hoveredInbound.has(node.path)) {
          strokeColor = '#f43f5e';
          strokeW = 1.5;
        } else if (hovered && hoveredOutbound.has(node.path)) {
          strokeColor = '#38bdf8';
          strokeW = 1.5;
        } else if (role === 'hop1') {
          strokeColor = '#e5566f';
          strokeW = 1.5;
        } else if (role === 'hop2') {
          strokeColor = '#d9a441';
          strokeW = 1.5;
        }

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeW;

        ctx.beginPath();
        ctx.roundRect(bounds.minX, bounds.minY, 192, 48, 6);
        ctx.fill();
        ctx.stroke();

        // Architectural layer vertical accent bar on left edge
        ctx.fillStyle = meta.color || '#38bdf8';
        ctx.beginPath();
        ctx.roundRect(bounds.minX, bounds.minY + 3, 3.5, 42, [3, 0, 0, 3]);
        ctx.fill();

        // Selected halo
        if (role === 'selected') {
          ctx.strokeStyle = 'rgba(74, 138, 214, 0.4)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(bounds.minX - 3, bounds.minY - 3, 198, 54, 8);
          ctx.stroke();
        }

        // Card Labels (D8: Disambiguate colliding basenames)
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        const parts = node.path.split('/');
        const baseName = parts[parts.length - 1];
        const isColliding = (basenameCount.get(baseName) || 0) > 1;
        let displayLabel = isColliding && parts.length > 1
          ? `${parts[parts.length - 2]}/${baseName}`
          : baseName;

        ctx.font = '500 11px "JetBrains Mono", monospace';
        ctx.fillStyle = '#ffffff';

        while (displayLabel.length && ctx.measureText(displayLabel).width > 156) displayLabel = displayLabel.slice(0, -1);
        if (displayLabel !== baseName && (!isColliding || displayLabel !== `${parts[parts.length - 2]}/${baseName}`)) {
          displayLabel = displayLabel.slice(0, -1) + '…';
        }

        ctx.fillText(displayLabel, bounds.minX + 12, node.y - 8);

        // Subtitle: Layer Tag & Dependents (WCAG AA compliant #a1a1aa - D2)
        ctx.fillStyle = '#a1a1aa';
        ctx.font = '400 10px "JetBrains Mono", monospace';
        ctx.fillText(`${meta.label} · ${node.totalImpact} dep`, bounds.minX + 12, node.y + 10);

        if (state.agentWalkedFiles.has(node.path)) {
          ctx.fillStyle = '#5fc39c';
          ctx.fillRect(bounds.maxX - 8, bounds.minY + 5, 3, 3);
        }

        ctx.restore();
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
          ? 'px-2.5 py-1 rounded text-xs font-medium bg-slate-800 text-white flex items-center gap-1 transition-all'
          : 'px-2.5 py-1 rounded text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1 transition-all';
      }
      if (btnForce) {
        btnForce.className = (mode === 'force' || mode === 'cluster')
          ? 'px-2.5 py-1 rounded text-xs font-medium bg-slate-800 text-white flex items-center gap-1 transition-all'
          : 'px-2.5 py-1 rounded text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1 transition-all';
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
      const selNode = state.graph.nodes.find(n => n.path === state.selectedFile);

      if (state.simulateBreakingChange && selNode) {
        btn.className = 'px-2.5 py-1 rounded text-xs font-medium bg-amber-500 text-slate-950 font-semibold flex items-center gap-1 transition-all';
        banner.classList.remove('hidden');
        bannerText.textContent = `Simulated signature change in ${selNode.path} (${selNode.exports[0] || 'default'}): ${selNode.hop1Files.length} direct files and ${selNode.hop2Files.length} transitive files will break!`;
      } else {
        btn.className = 'px-2.5 py-1 rounded text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1 transition-all';
        banner.classList.add('hidden');
      }
      syncCanvasToggleState();
      lucide.createIcons();
    }

    function clearCanvasBanner() {
      state.simulateBreakingChange = false;
      document.getElementById('canvasAlertBanner').classList.add('hidden');
      syncCanvasToggleState();
      document.getElementById('btnSimulateBreak').className = 'px-2.5 py-1 rounded text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1 transition-all';
    }


    function syncCanvasToggleState() {
      [['btnToggleIsolate', state.isolateBlastRadius], ['btnSimulateBreak', state.simulateBreakingChange]].forEach(([id, pressed]) => {
        const button = document.getElementById(id);
        if (button) button.setAttribute('aria-pressed', String(pressed));
      });
    }
