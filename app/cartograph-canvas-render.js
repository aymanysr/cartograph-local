// Moved verbatim from cartograph.html (split preserved original file order).
// canvas-render: see cartograph.html; loads as a classic script after the lib/ files.
    function drawDependencyGraph() {
      const canvas = document.getElementById('dependencyCanvas');
      if (!canvas) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
        canvas.width = Math.floor(rect.width * dpr);
        canvas.height = Math.floor(rect.height * dpr);
      }

      const ctx = canvas.getContext('2d');
      ctx.save();
      ctx.scale(dpr, dpr);

      const W = rect.width;
      const H = rect.height;

      ctx.fillStyle = '#070B12';
      ctx.fillRect(0, 0, W, H);

      const gridStep = 28 * state.camera.zoom;
      if (gridStep > 10) {
        ctx.fillStyle = 'rgba(51, 65, 85, 0.32)';
        const startX = (state.camera.x % gridStep + gridStep) % gridStep;
        const startY = (state.camera.y % gridStep + gridStep) % gridStep;
        for (let x = startX; x < W; x += gridStep) {
          for (let y = startY; y < H; y += gridStep) {
            ctx.fillRect(x, y, 1.2, 1.2);
          }
        }
      }

      ctx.translate(state.camera.x, state.camera.y);
      ctx.scale(state.camera.zoom, state.camera.zoom);

      const nodes = state.graph.nodes;
      const edges = state.graph.edges;
      const nodeMap = new Map(nodes.map(n => [n.path, n]));
      const selNode = nodeMap.get(state.selectedFile);

      if (state.graphLayout === 'dag' && nodes.length > 0) {
        const layerGroups = new Map();
        nodes.forEach(n => {
          if (!layerGroups.has(n.layer)) layerGroups.set(n.layer, []);
          layerGroups.get(n.layer).push(n.y);
        });
        layerGroups.forEach((ys, layerKey) => {
          const avgY = ys.reduce((a, b) => a + b, 0) / ys.length;
          const meta = getLayerMeta(layerKey);
          ctx.strokeStyle = 'rgba(30, 41, 59, 0.55)';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 6]);
          ctx.beginPath();
          ctx.moveTo(30, avgY);
          ctx.lineTo(W - 30, avgY);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = meta.color;
          ctx.font = '600 10px "JetBrains Mono", monospace';
          ctx.fillText(meta.label.toUpperCase(), 24, avgY - 22);
        });
      }

      for (const edge of edges) {
        const src = nodeMap.get(edge.source);
        const tgt = nodeMap.get(edge.target);
        if (!src || !tgt) continue;

        let edgeType = 'normal';
        const edgeKey = `${edge.source}->${edge.target}`;

        if (state.agentActiveEdges.has(edgeKey)) {
          edgeType = 'agent';
        } else if (selNode) {
          if (edge.target === selNode.path) {
            edgeType = 'hop1';
          } else if (selNode.hop1Files.includes(edge.target) && selNode.hop2Files.includes(edge.source)) {
            edgeType = 'hop2';
          } else if (edge.source === selNode.path) {
            edgeType = 'outbound';
          }
        }

        const isCycleEdge = state.graph.cycles.some(c =>
          (c[0] === edge.source && c[1] === edge.target) ||
          (c[1] === edge.source && c[0] === edge.target)
        );

        const isDimmed = (state.isolateBlastRadius && edgeType === 'normal' && !isCycleEdge) ||
          (state.layerFilter !== 'all' && src.layer !== state.layerFilter && tgt.layer !== state.layerFilter);

        ctx.save();
        if (isDimmed) ctx.globalAlpha = 0.12;

        const dx = tgt.x - src.x;
        const dy = tgt.y - src.y;
        const midX = (src.x + tgt.x) / 2 - dy * 0.12;
        const midY = (src.y + tgt.y) / 2 + dx * 0.12;

        if (isCycleEdge) {
          ctx.strokeStyle = '#EC4899';
          ctx.lineWidth = 2.4;
        } else if (edgeType === 'hop1') {
          ctx.strokeStyle = '#F43F5E';
          ctx.lineWidth = 2.4;
        } else if (edgeType === 'hop2') {
          ctx.strokeStyle = '#F59E0B';
          ctx.lineWidth = 2.0;
          ctx.setLineDash([5, 4]);
        } else if (edgeType === 'outbound') {
          ctx.strokeStyle = '#22D3EE';
          ctx.lineWidth = 2.0;
        } else if (edgeType === 'agent') {
          ctx.strokeStyle = '#10B981';
          ctx.lineWidth = 2.6;
        } else {
          ctx.strokeStyle = 'rgba(100, 116, 139, 0.35)';
          ctx.lineWidth = 1.2;
        }

        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.quadraticCurveTo(midX, midY, tgt.x, tgt.y);
        ctx.stroke();
        ctx.setLineDash([]);

        if (edgeType !== 'normal' || isCycleEdge) {
          const t = ((state.animPhase * 0.015) % 1);
          const flowT = (edgeType === 'hop1' || edgeType === 'hop2') ? (1 - t) : t;
          const px = (1 - flowT) * (1 - flowT) * src.x + 2 * (1 - flowT) * flowT * midX + flowT * flowT * tgt.x;
          const py = (1 - flowT) * (1 - flowT) * src.y + 2 * (1 - flowT) * flowT * midY + flowT * flowT * tgt.y;

          ctx.fillStyle = edgeType === 'hop1' ? '#FDA4AF' : edgeType === 'hop2' ? '#FDE68A' : edgeType === 'agent' ? '#6EE7B7' : '#67E8F9';
          ctx.beginPath();
          ctx.arc(px, py, 3.2, 0, Math.PI * 2);
          ctx.fill();
        }

        const angle = Math.atan2(tgt.y - midY, tgt.x - midX);
        const targetRadius = 18;
        const ax = tgt.x - Math.cos(angle) * targetRadius;
        const ay = tgt.y - Math.sin(angle) * targetRadius;
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - 7 * Math.cos(angle - Math.PI / 6), ay - 7 * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(ax - 7 * Math.cos(angle + Math.PI / 6), ay + 7 * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();

        ctx.restore();
      }

      for (const node of nodes) {
        const role = getNodeVisualRole(node.path);
        const layerMeta = getLayerMeta(node.layer);
        const isHovered = state.hoveredFile === node.path;

        const isDimmed = (state.isolateBlastRadius && role === 'neutral') ||
          (state.layerFilter !== 'all' && node.layer !== state.layerFilter && role === 'neutral');

        ctx.save();
        if (isDimmed) ctx.globalAlpha = 0.18;

        const baseRadius = 14 + Math.min(8, node.totalImpact * 0.75);

        if (role === 'selected') {
          ctx.fillStyle = state.simulateBreakingChange ? 'rgba(244, 63, 94, 0.28)' : 'rgba(99, 102, 241, 0.28)';
          ctx.beginPath();
          ctx.arc(node.x, node.y, baseRadius + 9, 0, Math.PI * 2);
          ctx.fill();
        } else if (role === 'hop1') {
          ctx.fillStyle = 'rgba(244, 63, 94, 0.22)';
          ctx.beginPath();
          ctx.arc(node.x, node.y, baseRadius + 6, 0, Math.PI * 2);
          ctx.fill();
        } else if (role === 'hop2') {
          ctx.fillStyle = 'rgba(245, 158, 11, 0.18)';
          ctx.beginPath();
          ctx.arc(node.x, node.y, baseRadius + 5, 0, Math.PI * 2);
          ctx.fill();
        } else if (role === 'agent') {
          ctx.fillStyle = 'rgba(16, 185, 129, 0.24)';
          ctx.beginPath();
          ctx.arc(node.x, node.y, baseRadius + 7, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, baseRadius, 0, Math.PI * 2);
        if (role === 'selected') {
          ctx.fillStyle = state.simulateBreakingChange ? '#E11D48' : '#4F46E5';
          ctx.strokeStyle = state.simulateBreakingChange ? '#FDA4AF' : '#C7D2FE';
          ctx.lineWidth = 3;
        } else if (role === 'hop1') {
          ctx.fillStyle = '#881337';
          ctx.strokeStyle = '#F43F5E';
          ctx.lineWidth = 2.5;
        } else if (role === 'hop2') {
          ctx.fillStyle = '#78350F';
          ctx.strokeStyle = '#F59E0B';
          ctx.lineWidth = 2.2;
        } else if (role === 'outbound') {
          ctx.fillStyle = '#164E63';
          ctx.strokeStyle = '#22D3EE';
          ctx.lineWidth = 2.2;
        } else if (role === 'agent') {
          ctx.fillStyle = '#064E3B';
          ctx.strokeStyle = '#10B981';
          ctx.lineWidth = 2.5;
        } else {
          ctx.fillStyle = '#0F172A';
          ctx.strokeStyle = isHovered ? '#94A3B8' : layerMeta.color;
          ctx.lineWidth = isHovered ? 2.2 : 1.6;
        }
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '600 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(node.totalImpact), node.x, node.y);

        const label = node.label;
        ctx.font = (role !== 'neutral' || isHovered) ? '600 11px "JetBrains Mono", monospace' : '500 10.5px "JetBrains Mono", monospace';
        const textWidth = ctx.measureText(label).width;
        const pillW = textWidth + 12;
        const pillH = 18;
        const pillX = node.x - pillW / 2;
        const pillY = node.y + baseRadius + 5;

        ctx.fillStyle = role === 'selected' ? 'rgba(79, 70, 229, 0.92)'
          : role === 'hop1' ? 'rgba(159, 18, 57, 0.92)'
          : role === 'hop2' ? 'rgba(146, 64, 14, 0.92)'
          : 'rgba(15, 23, 42, 0.88)';
        ctx.strokeStyle = role === 'selected' ? '#818CF8'
          : role === 'hop1' ? '#FB7185'
          : role === 'hop2' ? '#FBBF24'
          : 'rgba(51, 65, 85, 0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = role === 'neutral' ? '#E2E8F0' : '#FFFFFF';
        ctx.fillText(label, node.x, pillY + pillH / 2 + 0.5);

        if (role === 'hop1' || role === 'hop2') {
          const tag = role === 'hop1' ? '1-HOP BREAK' : '2-HOP IMPACT';
          ctx.font = '700 8.5px "JetBrains Mono", monospace';
          const tw = ctx.measureText(tag).width + 8;
          ctx.fillStyle = role === 'hop1' ? '#E11D48' : '#D97706';
          ctx.beginPath();
          ctx.roundRect(node.x - tw / 2, node.y - baseRadius - 17, tw, 13, 3);
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.fillText(tag, node.x, node.y - baseRadius - 10.5);
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
        const sx = clientX - rect.left;
        const sy = clientY - rect.top;
        return {
          x: (sx - state.camera.x) / state.camera.zoom,
          y: (sy - state.camera.y) / state.camera.zoom
        };
      }

      function findNodeAt(wx, wy) {
        for (let i = state.graph.nodes.length - 1; i >= 0; i--) {
          const n = state.graph.nodes[i];
          const dx = wx - n.x;
          const dy = wy - n.y;
          if (dx * dx + dy * dy <= 26 * 26) return n;
        }
        return null;
      }

      let pointerDownPos = { x: 0, y: 0 };

      canvas.addEventListener('mousedown', (e) => {
        pointerDownPos = { x: e.clientX, y: e.clientY };
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
        }
      });

      window.addEventListener('mouseup', (e) => {
        const movedDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
        if (state.draggingNode && movedDist < 6) {
          selectFileNode(state.draggingNode.path, false);
        }
        state.draggingNode = null;
        state.panningCanvas = false;
      });

      canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.12 : 0.89;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        const newZoom = Math.min(2.6, Math.max(0.4, state.camera.zoom * factor));
        state.camera.x = mx - (mx - state.camera.x) * (newZoom / state.camera.zoom);
        state.camera.y = my - (my - state.camera.y) * (newZoom / state.camera.zoom);
        state.camera.zoom = newZoom;
      }, { passive: false });
    }

    function zoomGraph(factor) {
      const canvas = document.getElementById('dependencyCanvas');
      const cx = canvas ? canvas.clientWidth / 2 : 400;
      const cy = canvas ? canvas.clientHeight / 2 : 300;
      const newZoom = Math.min(2.6, Math.max(0.4, state.camera.zoom * factor));
      state.camera.x = cx - (cx - state.camera.x) * (newZoom / state.camera.zoom);
      state.camera.y = cy - (cy - state.camera.y) * (newZoom / state.camera.zoom);
      state.camera.zoom = newZoom;
    }

    function resetGraphView() {
      computeGraphNodePositions();
      showToast('Graph view centered and fitted to screen');
    }

    function setGraphLayout(mode) {
      state.graphLayout = mode;
      document.getElementById('layoutBtnDag').className = mode === 'dag'
        ? 'px-2.5 py-1 rounded text-xs font-medium bg-indigo-600 text-white flex items-center gap-1 transition-all'
        : 'px-2.5 py-1 rounded text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1 transition-all';
      document.getElementById('layoutBtnForce').className = mode === 'force'
        ? 'px-2.5 py-1 rounded text-xs font-medium bg-indigo-600 text-white flex items-center gap-1 transition-all'
        : 'px-2.5 py-1 rounded text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1 transition-all';
      computeGraphNodePositions();
      lucide.createIcons();
    }

    function toggleIsolateBlastRadius() {
      state.isolateBlastRadius = !state.isolateBlastRadius;
      const btn = document.getElementById('btnToggleIsolate');
      btn.className = state.isolateBlastRadius
        ? 'px-2.5 py-1 rounded text-xs font-medium bg-rose-600 text-white flex items-center gap-1 transition-all'
        : 'px-2.5 py-1 rounded text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1 transition-all';
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
      lucide.createIcons();
    }

    function clearCanvasBanner() {
      state.simulateBreakingChange = false;
      document.getElementById('canvasAlertBanner').classList.add('hidden');
      document.getElementById('btnSimulateBreak').className = 'px-2.5 py-1 rounded text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1 transition-all';
    }

