/**
 * Cartograph Render Math — Pure geometry, edge curve routing, and layout stage models.
 *
 * Zero dependencies. No DOM or canvas access. Pure mathematical foundations for:
 * - Card boundary intersection endpoints.
 * - Adaptive edge curve routing (cubic Béziers for LR / TB pipelines, straight line for cluster).
 * - Exact arrival-tangent arrowhead angles and polygon points.
 * - Viewport world-space dot grid bounds.
 * - Directory cluster bounding hulls.
 * - Topological pipeline column / row stage guides.
 * - Collision-free file label disambiguation.
 *
 * Shared by the canvas renderer (`app/cartograph-canvas-render.js`) and Node test suites.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CartographRenderMath = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CARD_WIDTH = 192;
  const CARD_HEIGHT = 48;
  const CARD_HALF_WIDTH = CARD_WIDTH / 2; // 96
  const CARD_HALF_HEIGHT = CARD_HEIGHT / 2; // 24

  function getNodeBounds(node) {
    const x = (node && Number.isFinite(node.x)) ? node.x : 0;
    const y = (node && Number.isFinite(node.y)) ? node.y : 0;
    return {
      minX: x - CARD_HALF_WIDTH,
      minY: y - CARD_HALF_HEIGHT,
      maxX: x + CARD_HALF_WIDTH,
      maxY: y + CARD_HALF_HEIGHT,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
    };
  }

  function computeCardEndpoint(node, other) {
    const b = getNodeBounds(node);
    const halfW = (b.maxX - b.minX) / 2;
    const halfH = (b.maxY - b.minY) / 2;
    const dx = other.x - node.x;
    const dy = other.y - node.y;
    const scale = 1 / Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH, 1);
    return {
      x: node.x + dx * scale,
      y: node.y + dy * scale,
    };
  }

  function computeEdgeGeometry(sourceNode, targetNode, layoutMode = 'dag-lr') {
    const start = computeCardEndpoint(sourceNode, targetNode);
    const end = computeCardEndpoint(targetNode, sourceNode);

    const isLR = layoutMode === 'dag' || layoutMode === 'dag-lr';
    const isTB = layoutMode === 'dag-tb';

    if (isLR) {
      const dx = end.x - start.x;
      const cpOffset = Math.min(100, Math.max(30, Math.abs(dx) * 0.45));
      const cp1 = { x: start.x + (dx >= 0 ? cpOffset : -cpOffset), y: start.y };
      const cp2 = { x: end.x - (dx >= 0 ? cpOffset : -cpOffset), y: end.y };
      const arrivalAngle = Math.atan2(end.y - cp2.y, end.x - cp2.x);
      return {
        type: 'bezier',
        mode: 'dag-lr',
        start,
        end,
        controlPoints: [cp1, cp2],
        arrivalAngle,
      };
    }

    if (isTB) {
      const dy = end.y - start.y;
      const cpOffset = Math.min(100, Math.max(30, Math.abs(dy) * 0.45));
      const cp1 = { x: start.x, y: start.y + (dy >= 0 ? cpOffset : -cpOffset) };
      const cp2 = { x: end.x, y: end.y - (dy >= 0 ? cpOffset : -cpOffset) };
      const arrivalAngle = Math.atan2(end.y - cp2.y, end.x - cp2.x);
      return {
        type: 'bezier',
        mode: 'dag-tb',
        start,
        end,
        controlPoints: [cp1, cp2],
        arrivalAngle,
      };
    }

    // Default: linear (Cluster, Force, etc.)
    const arrivalAngle = Math.atan2(end.y - start.y, end.x - start.x);
    return {
      type: 'line',
      mode: 'cluster',
      start,
      end,
      controlPoints: [],
      arrivalAngle,
    };
  }

  function computeArrowheadPoints(end, arrivalAngle, arrowLength = 7, arrowAngle = 0.45) {
    const tip = { x: end.x, y: end.y };
    const left = {
      x: end.x - arrowLength * Math.cos(arrivalAngle - arrowAngle),
      y: end.y - arrowLength * Math.sin(arrivalAngle - arrowAngle),
    };
    const right = {
      x: end.x - arrowLength * Math.cos(arrivalAngle + arrowAngle),
      y: end.y - arrowLength * Math.sin(arrivalAngle + arrowAngle),
    };
    return [tip, left, right];
  }

  function computeDotGridBounds(camera, viewWidth, viewHeight, dotSpacing = 36) {
    const cam = camera || { x: 0, y: 0, zoom: 1 };
    const z = cam.zoom || 1;
    let startX = Math.floor((-cam.x / z) / dotSpacing) * dotSpacing - dotSpacing;
    let endX = startX + (viewWidth / z) + dotSpacing * 2;
    let startY = Math.floor((-cam.y / z) / dotSpacing) * dotSpacing - dotSpacing;
    let endY = startY + (viewHeight / z) + dotSpacing * 2;
    if (startX === 0) startX = 0;
    if (startY === 0) startY = 0;
    return { startX, endX, startY, endY, dotSpacing };
  }

  function computeClusterHulls(nodes, getDirectoryFn, pad = 24) {
    if (!nodes || !nodes.length) return [];
    const dirMap = new Map();
    for (const n of nodes) {
      const dir = typeof getDirectoryFn === 'function' ? getDirectoryFn(n.path) : (n.path.split('/')[0] || 'root');
      if (!dirMap.has(dir)) dirMap.set(dir, []);
      dirMap.get(dir).push(n);
    }

    const hulls = [];
    for (const [dir, dNodes] of dirMap.entries()) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const dn of dNodes) {
        const b = getNodeBounds(dn);
        if (b.minX < minX) minX = b.minX;
        if (b.minY < minY) minY = b.minY;
        if (b.maxX > maxX) maxX = b.maxX;
        if (b.maxY > maxY) maxY = b.maxY;
      }
      hulls.push({
        directory: dir,
        nodeCount: dNodes.length,
        nodes: dNodes,
        bounds: {
          x: minX - pad,
          y: minY - pad - 18,
          width: (maxX - minX) + pad * 2,
          height: (maxY - minY) + pad * 2 + 18,
          labelX: minX - pad + 12,
          labelY: minY - pad - 2,
        },
      });
    }
    return hulls;
  }

  function computePipelineGuides(nodes, layoutMode, spacing = 260) {
    if (!nodes || !nodes.length) return [];
    const isLR = layoutMode === 'dag' || layoutMode === 'dag-lr';
    const isTB = layoutMode === 'dag-tb';
    if (!isLR && !isTB) return [];

    const rankMap = new Map();
    for (const n of nodes) {
      const r = Number.isFinite(n.rank) ? n.rank : 0;
      if (!rankMap.has(r)) rankMap.set(r, []);
      rankMap.get(r).push(n);
    }
    const sortedRanks = Array.from(rankMap.keys()).sort((a, b) => a - b);
    const maxRank = sortedRanks[sortedRanks.length - 1] || 0;

    const guides = [];
    for (const r of sortedRanks) {
      const rNodes = rankMap.get(r);
      if (isLR) {
        const colX = (r - maxRank / 2) * spacing;
        const minY = Math.min(...rNodes.map((n) => n.y));
        const maxY = Math.max(...rNodes.map((n) => n.y));
        const label = r === 0 ? 'ENTRY POINTS' : r === maxRank ? 'LEAF & CORE' : `TIER ${r}`;
        guides.push({
          rank: r,
          label,
          type: 'vertical-col',
          line: { x1: colX, y1: minY - 60, x2: colX, y2: maxY + 60 },
          labelPos: { x: colX, y: minY - 44, align: 'center' },
        });
      } else {
        const rowSpacing = 110;
        const rowY = (r - maxRank / 2) * rowSpacing;
        const minX = Math.min(...rNodes.map((n) => n.x));
        const maxX = Math.max(...rNodes.map((n) => n.x));
        const label = r === 0 ? 'ENTRY' : r === maxRank ? 'CORE' : `TIER ${r}`;
        guides.push({
          rank: r,
          label,
          type: 'horizontal-row',
          line: { x1: minX - 60, y1: rowY, x2: maxX + 60, y2: rowY },
          labelPos: { x: minX - 70, y: rowY + 3, align: 'right' },
        });
      }
    }
    return guides;
  }

  function disambiguateNodeLabels(nodes) {
    if (!nodes) return new Map();
    const basenameCounts = new Map();
    for (const n of nodes) {
      const bn = n.path.split('/').pop();
      basenameCounts.set(bn, (basenameCounts.get(bn) || 0) + 1);
    }

    const labelMap = new Map();
    for (const n of nodes) {
      const parts = n.path.split('/');
      const baseName = parts[parts.length - 1];
      const isColliding = (basenameCounts.get(baseName) || 0) > 1;
      const displayLabel = isColliding && parts.length > 1
        ? `${parts[parts.length - 2]}/${baseName}`
        : baseName;
      labelMap.set(n.path, {
        baseName,
        displayLabel,
        isColliding,
      });
    }
    return labelMap;
  }

  return {
    CARD_WIDTH,
    CARD_HEIGHT,
    CARD_HALF_WIDTH,
    CARD_HALF_HEIGHT,
    getNodeBounds,
    computeCardEndpoint,
    computeEdgeGeometry,
    computeArrowheadPoints,
    computeDotGridBounds,
    computeClusterHulls,
    computePipelineGuides,
    disambiguateNodeLabels,
  };
});
