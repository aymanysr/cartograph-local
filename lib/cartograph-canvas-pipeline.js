/**
 * Cartograph Canvas Pipeline: Decomposed, composable 2D render stages for the architecture canvas.
 *
 * Clean separation of canvas painting stages:
 * - Pass 1: World-space spatial dot grid
 * - Pass 2: Directory cluster region watermarks
 * - Pass 3: Topological stage guides
 * - Pass 4: Adaptive edges, Bézier curves, and arrival-tangent arrowheads
 * - Pass 5: Card bodies, accent bars, and Macro Zoom LOD text rendering
 * - Pass 6: Interactive hover flashlight & simulated breaking change badges
 *
 * Zero DOM dependencies. Uses CartographRenderMath for geometric calculations.
 * Shared by app/cartograph-canvas-render.js and Node test suites.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const RenderMath = require('./cartograph-render-math.js');
    module.exports = factory(RenderMath);
  } else {
    root.CartographCanvasPipeline = factory(root.CartographRenderMath);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (RenderMath) {
  'use strict';

  const CARD_WIDTH = 192;
  const CARD_HEIGHT = 48;

  function renderGrid(ctx, camera, width, height) {
    const cam = camera || { x: 0, y: 0, zoom: 1 };
    const grid = RenderMath
      ? RenderMath.computeDotGridBounds(cam, width, height, 36)
      : {
          dotSpacing: 36,
          startX: Math.floor((-cam.x / cam.zoom) / 36) * 36 - 36,
          endX: Math.floor((-cam.x / cam.zoom) / 36) * 36 - 36 + (width / cam.zoom) + 72,
          startY: Math.floor((-cam.y / cam.zoom) / 36) * 36 - 36,
          endY: Math.floor((-cam.y / cam.zoom) / 36) * 36 - 36 + (height / cam.zoom) + 72,
        };

    ctx.fillStyle = '#222228';
    ctx.beginPath();
    for (let gx = grid.startX; gx <= grid.endX; gx += grid.dotSpacing) {
      for (let gy = grid.startY; gy <= grid.endY; gy += grid.dotSpacing) {
        ctx.rect(gx, gy, 1.2, 1.2);
      }
    }
    ctx.fill();
  }

  function renderClusterWatermarks(ctx, nodes, layoutMode, folderFilter) {
    const isCluster = layoutMode === 'force' || layoutMode === 'cluster';
    if (!isCluster || !nodes || !nodes.length || !RenderMath) return;

    const getDir = (p) => {
      const parts = p.split('/');
      return parts.length > 1 ? parts.slice(0, -1).join('/') : '/';
    };

    const hulls = RenderMath.computeClusterHulls(nodes, getDir, 24);
    for (const hull of hulls) {
      const isFocused = Boolean(folderFilter && (
        hull.directory === folderFilter ||
        (folderFilter !== '/' && hull.directory.startsWith(folderFilter + '/')) ||
        (hull.directory !== '/' && folderFilter.startsWith(hull.directory + '/'))
      ));

      ctx.save();
      ctx.fillStyle = isFocused ? 'rgba(56, 189, 248, 0.06)' : 'rgba(255, 255, 255, 0.02)';
      ctx.strokeStyle = isFocused ? 'rgba(56, 189, 248, 0.40)' : 'rgba(148, 163, 184, 0.12)';
      ctx.lineWidth = isFocused ? 2 : 1;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(hull.bounds.x, hull.bounds.y, hull.bounds.width, hull.bounds.height, 12);
      } else {
        ctx.rect(hull.bounds.x, hull.bounds.y, hull.bounds.width, hull.bounds.height);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isFocused ? '#38bdf8' : '#94a3b8';
      ctx.font = '600 12px "JetBrains Mono", monospace'; // taste-skill-ignore: canvas literal text
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`📁 ${hull.directory}/ (${hull.nodeCount})`, hull.bounds.x + 12, hull.bounds.y + 8); // taste-skill-ignore
      ctx.restore();
    }
  }

  function renderPipelineGuides(ctx, nodes, layoutMode) {
    const isLR = layoutMode === 'dag' || layoutMode === 'dag-lr';
    const isTB = layoutMode === 'dag-tb';
    if ((!isLR && !isTB) || !nodes || !nodes.length || !RenderMath) return;

    const guides = RenderMath.computePipelineGuides(nodes, isLR ? 'dag-lr' : 'dag-tb');
    for (const guide of guides) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(guide.line.x1, guide.line.y1);
      ctx.lineTo(guide.line.x2, guide.line.y2);
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 10px "JetBrains Mono", monospace'; // taste-skill-ignore: canvas literal text
      ctx.textAlign = guide.labelPos.align;
      ctx.fillText(guide.label, guide.labelPos.x, guide.labelPos.y);
      ctx.restore();
    }
  }

  function getGraphEdgeRole(edge, selectedNode) {
    if (!selectedNode) return 'neutral';
    if (edge.target === selectedNode.path) return 'hop1';
    const hop2 = selectedNode.hop2Files || [];
    const hop1 = selectedNode.hop1Files || [];
    if (hop2.includes(edge.source) && hop1.includes(edge.target)) return 'hop2';
    return 'neutral';
  }

  function renderEdges(ctx, edges, options = {}) {
    if (!edges || !edges.length) return;
    const getNode = options.getNode || (() => null);
    const selected = options.selectedNode || null;
    const hovered = options.hoveredNode || null;
    const layoutMode = options.layoutMode || 'dag-lr';
    const folderFilter = options.folderFilter || null;

    for (const edge of edges) {
      const source = getNode(edge.source);
      const target = getNode(edge.target);
      if (!source || !target) continue;

      const role = getGraphEdgeRole(edge, selected);
      const start = RenderMath ? RenderMath.computeCardEndpoint(source, target) : { x: source.x, y: source.y };
      const end = RenderMath ? RenderMath.computeCardEndpoint(target, source) : { x: target.x, y: target.y };

      const isHoveredOut = hovered && edge.source === hovered.path;
      const isHoveredIn = hovered && edge.target === hovered.path;

      let strokeColor = '#3f3f46';
      let strokeWidth = 1.2;

      if (isHoveredOut) {
        strokeColor = '#38bdf8';
        strokeWidth = 2.2;
      } else if (isHoveredIn) {
        strokeColor = '#fb7185';
        strokeWidth = 2.2;
      } else if (role === 'hop1') {
        strokeColor = '#e11d48';
        strokeWidth = 2;
      } else if (role === 'hop2') {
        strokeColor = '#d9a441';
        strokeWidth = 1.8;
      } else if (hovered) {
        strokeColor = 'rgba(63, 63, 70, 0.2)';
      }

      ctx.save();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;

      const geom = RenderMath
        ? RenderMath.computeEdgeGeometry(start, end, layoutMode)
        : { isBezier: false, points: [start, end], arrivalAngle: Math.atan2(end.y - start.y, end.x - start.x) };

      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      if (geom.isBezier && geom.cp1 && geom.cp2) {
        ctx.bezierCurveTo(geom.cp1.x, geom.cp1.y, geom.cp2.x, geom.cp2.y, end.x, end.y);
      } else {
        ctx.lineTo(end.x, end.y);
      }
      ctx.stroke();

      if (RenderMath) {
        const arrowPts = RenderMath.computeArrowheadPoints(end, geom.arrivalAngle, 7, 0.45);
        ctx.fillStyle = strokeColor;
        ctx.beginPath();
        ctx.moveTo(arrowPts[0].x, arrowPts[0].y);
        ctx.lineTo(arrowPts[1].x, arrowPts[1].y);
        ctx.lineTo(arrowPts[2].x, arrowPts[2].y);
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();
    }
  }

  function renderCards(ctx, nodes, options = {}) {
    if (!nodes || !nodes.length) return;
    const selected = options.selectedNode || null;
    const hovered = options.hoveredNode || null;
    const zoom = options.zoom || 1;
    const labelMap = options.labelMap || new Map();
    const folderFilter = options.folderFilter || null;
    const isMacroZoom = zoom < 0.45;

    for (const node of nodes) {
      const isSelected = selected && node.path === selected.path;
      const isHovered = hovered && node.path === hovered.path;
      const isHop1 = selected && selected.hop1Files && selected.hop1Files.includes(node.path);
      const isHop2 = selected && selected.hop2Files && selected.hop2Files.includes(node.path);

      let alpha = 1.0;
      if (folderFilter) {
        const inFocused = folderFilter === '/'
          ? (!node.folder || node.folder === '/')
          : (node.folder === folderFilter || node.path.startsWith(folderFilter + '/'));
        if (!inFocused && !isSelected) alpha = 0.2;
      }

      ctx.save();
      ctx.globalAlpha = alpha;

      const x = node.x - CARD_WIDTH / 2;
      const y = node.y - CARD_HEIGHT / 2;

      ctx.fillStyle = '#1c1c20';
      ctx.strokeStyle = isSelected ? '#38bdf8' : isHop1 ? '#e11d48' : isHop2 ? '#d9a441' : '#2e2e34';
      ctx.lineWidth = isSelected ? 2.5 : (isHop1 || isHop2) ? 2 : 1;

      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, CARD_WIDTH, CARD_HEIGHT, 6);
      } else {
        ctx.rect(x, y, CARD_WIDTH, CARD_HEIGHT);
      }
      ctx.fill();
      ctx.stroke();

      const labelInfo = labelMap.get(node.path) || { displayLabel: node.label || node.path.split('/').pop() };
      const displayTitle = labelInfo.displayLabel;

      ctx.fillStyle = '#f8fafc';
      if (isMacroZoom) {
        ctx.font = 'bold 12px "JetBrains Mono", monospace'; // taste-skill-ignore: canvas literal text
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(displayTitle, node.x, node.y);
      } else {
        ctx.font = '500 11px "JetBrains Mono", monospace'; // taste-skill-ignore: canvas literal text
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(displayTitle, x + 10, y + 8);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '400 9px "JetBrains Mono", monospace'; // taste-skill-ignore: canvas literal text
        ctx.fillText(`${node.totalImpact || 0} breaks`, x + 10, y + 26);
      }

      if ((node.inDegree || 0) === 0 && typeof ctx.arc === 'function') {
        ctx.fillStyle = '#44a282';
        ctx.beginPath();
        ctx.arc(x + CARD_WIDTH - 12, y + 12, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  function executePipeline(state) {
    const ctx = state.ctx;
    if (!ctx) return;

    const width = state.width || 800;
    const height = state.height || 600;
    const cam = state.camera || { x: 0, y: 0, zoom: 1 };
    const graph = state.graph || { nodes: [], edges: [] };
    const getNode = state.getNode || (typeof graph.getNode === 'function' ? graph.getNode.bind(graph) : (p => graph.nodes.find(n => n.path === p)));

    ctx.save();
    ctx.translate(cam.x, cam.y);
    ctx.scale(cam.zoom, cam.zoom);

    renderGrid(ctx, cam, width, height);
    renderClusterWatermarks(ctx, graph.nodes, state.layoutMode, state.folderFilter);
    renderPipelineGuides(ctx, graph.nodes, state.layoutMode);
    renderEdges(ctx, graph.edges, {
      getNode,
      selectedNode: state.selectedNode,
      hoveredNode: state.hoveredNode,
      layoutMode: state.layoutMode,
      folderFilter: state.folderFilter,
    });
    renderCards(ctx, graph.nodes, {
      selectedNode: state.selectedNode,
      hoveredNode: state.hoveredNode,
      zoom: cam.zoom,
      labelMap: state.labelMap,
      folderFilter: state.folderFilter,
    });

    ctx.restore();
  }

  return {
    renderGrid,
    renderClusterWatermarks,
    renderPipelineGuides,
    renderEdges,
    renderCards,
    executePipeline,
  };
});
