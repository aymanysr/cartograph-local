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
      ctx.save();ctx.scale(dpr,dpr);ctx.fillStyle='#171719';ctx.fillRect(0,0,W,H);
      ctx.translate(state.camera.x,state.camera.y);ctx.scale(state.camera.zoom,state.camera.zoom);
      const nodeMap=new Map(state.graph.nodes.map(n=>[n.path,n]));
      const selected=nodeMap.get(state.selectedFile);
      for(const edge of state.graph.edges){
        const source=nodeMap.get(edge.source),target=nodeMap.get(edge.target);if(!source||!target)continue;
        const role=getGraphEdgeRole(edge,selected), start=graphCardEndpoint(source,target),end=graphCardEndpoint(target,source);
        ctx.save();if((state.isolateBlastRadius&&role==='neutral')||(state.layerFilter!=='all'&&source.layer!==state.layerFilter&&target.layer!==state.layerFilter))ctx.globalAlpha=.15;
        ctx.strokeStyle=role==='hop1'?'rgba(229,86,111,.35)':role==='hop2'?'rgba(217,164,65,.30)':'#2a2a2e';ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.lineTo(end.x,end.y);ctx.stroke();
        const angle=Math.atan2(end.y-start.y,end.x-start.x);ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.moveTo(end.x,end.y);ctx.lineTo(end.x-6*Math.cos(angle-.5),end.y-6*Math.sin(angle-.5));ctx.lineTo(end.x-6*Math.cos(angle+.5),end.y-6*Math.sin(angle+.5));ctx.closePath();ctx.fill();
        if(state.agentActiveEdges.has(`${edge.source}->${edge.target}`)){ctx.fillStyle='#5fc39c';ctx.fillRect((start.x+end.x)/2-2,(start.y+end.y)/2-2,4,4);}
        ctx.restore();
      }
      for(const node of state.graph.nodes){
        const role=getNodeVisualRole(node.path),bounds=getGraphNodeBounds(node);
        ctx.save();if((state.isolateBlastRadius&&role==='neutral')||(state.layerFilter!=='all'&&node.layer!==state.layerFilter&&role==='neutral'))ctx.globalAlpha=.18;
        ctx.fillStyle='#131217';ctx.strokeStyle=role==='selected'?'#4a8ad6':role==='hop1'?'#e5566f':role==='hop2'?'#d9a441':state.hoveredFile===node.path?'#8a8c92':'#222224';ctx.lineWidth=1;
        ctx.beginPath();ctx.roundRect(bounds.minX,bounds.minY,192,48,6);ctx.fill();ctx.stroke();
        if(role==='selected'){ctx.beginPath();ctx.roundRect(bounds.minX-2,bounds.minY-2,196,52,8);ctx.stroke();}
        ctx.textAlign='left';ctx.textBaseline='middle';ctx.font='500 11px "JetBrains Mono", monospace';ctx.fillStyle='#ffffff';
        let label=node.label;while(label.length&&ctx.measureText(label).width>168)label=label.slice(0,-1);if(label!==node.label)label=label.slice(0,-1)+'…';
        ctx.fillText(label,bounds.minX+12,node.y-8);ctx.fillStyle='#8a8c92';ctx.font='400 11px "JetBrains Mono", monospace';ctx.fillText(`${node.exports.length} exports · ${node.totalImpact} dependents`,bounds.minX+12,node.y+10);
        if(state.agentWalkedFiles.has(node.path)){ctx.fillStyle='#5fc39c';ctx.fillRect(bounds.maxX-8,bounds.minY+5,3,3);}
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
          const bounds = getGraphNodeBounds(n);
          if (wx >= bounds.minX && wx <= bounds.maxX && wy >= bounds.minY && wy <= bounds.maxY) return n;
        }
        return null;
      }

      let pointerDownPos = { x: 0, y: 0 };
      let pointerMoved = false;

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
      fitGraphToCanvas();
      if (typeof updateShellZoom === 'function') updateShellZoom();
      showToast('Graph fitted to screen');
    }

    function setGraphLayout(mode) {
      state.graphLayout = mode;
      document.getElementById('layoutBtnDag').className = mode === 'dag'
        ? 'px-2.5 py-1 rounded text-xs font-medium bg-slate-800 text-white flex items-center gap-1 transition-all'
        : 'px-2.5 py-1 rounded text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1 transition-all';
      document.getElementById('layoutBtnForce').className = mode === 'force'
        ? 'px-2.5 py-1 rounded text-xs font-medium bg-slate-800 text-white flex items-center gap-1 transition-all'
        : 'px-2.5 py-1 rounded text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1 transition-all';
      computeGraphNodePositions();
      lucide.createIcons();
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
