/**
 * Cartograph Layout Engine — Deterministic graph placement algorithms.
 *
 * Zero dependencies. No DOM access. Pure math shared by the browser UI layer
 * and Node tests.
 *
 * Provides:
 * 1. computeTopologicalLR: Left-to-right DAG pipeline (4:1 horizontal card optimization).
 * 2. computeTopologicalTB: Top-to-bottom DAG tree.
 * 3. computeDirectoryClusterBox: Spatial clustering with normalized AABB card separation.
 * 4. computeBoundingBox: Computes { minX, minY, maxX, maxY } for camera fitting.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CartographLayouts = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CARD_WIDTH = 192;
  const CARD_HEIGHT = 48;
  const MIN_DX = 216; // 192 + 24 margin
  const MIN_DY = 68;  // 48 + 20 margin

  function getGraphNodeBounds(node) {
    return {
      minX: node.x - CARD_WIDTH / 2,
      minY: node.y - CARD_HEIGHT / 2,
      maxX: node.x + CARD_WIDTH / 2,
      maxY: node.y + CARD_HEIGHT / 2
    };
  }

  function computeBoundingBox(nodes) {
    if (!nodes || !nodes.length) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      const b = getGraphNodeBounds(n);
      if (b.minX < minX) minX = b.minX;
      if (b.minY < minY) minY = b.minY;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.maxY > maxY) maxY = b.maxY;
    }
    return { minX, minY, maxX, maxY };
  }

  /**
   * Find back-edges creating cycles using DFS coloring.
   * Returns a Set of "source->target" keys that can be excluded from topological ranking.
   */
  function findBackEdges(nodes, edges) {
    const adj = new Map();
    nodes.forEach(n => adj.set(n.path, []));
    edges.forEach(e => {
      if (adj.has(e.source)) adj.get(e.source).push(e.target);
    });

    const color = new Map(); // 0 = unvisited, 1 = visiting, 2 = visited
    nodes.forEach(n => color.set(n.path, 0));
    const backEdges = new Set();

    function dfs(u) {
      color.set(u, 1);
      const neighbors = adj.get(u) || [];
      for (const v of neighbors) {
        const c = color.get(v);
        if (c === 1) {
          // Encountered currently active node in call stack -> cycle back-edge
          backEdges.add(`${u}->${v}`);
        } else if (c === 0) {
          dfs(v);
        }
      }
      color.set(u, 2);
    }

    // Sort nodes deterministically before DFS traversal
    const sortedNodes = [...nodes].sort((a, b) => a.path.localeCompare(b.path));
    for (const n of sortedNodes) {
      if (color.get(n.path) === 0) {
        dfs(n.path);
      }
    }

    return backEdges;
  }

  /**
   * Topological rank leveling ignoring cycle back-edges.
   * Guaranteed to terminate and prevent rank explosion.
   */
  function computeTopologicalRanks(nodes, edges) {
    const ranks = new Map();
    nodes.forEach(n => ranks.set(n.path, 0));
    if (!nodes.length) return ranks;

    const backEdges = findBackEdges(nodes, edges);

    // Pre-filter valid acyclic edges to eliminate inner-loop string allocations
    const acyclicEdges = [];
    for (const e of edges) {
      if (ranks.has(e.source) && ranks.has(e.target) && !backEdges.has(`${e.source}->${e.target}`)) {
        acyclicEdges.push(e);
      }
    }

    // Iterative longest path relaxation on the acyclic subgraph
    const maxIter = nodes.length;
    for (let iter = 0; iter < maxIter; iter++) {
      let changed = false;
      for (let i = 0; i < acyclicEdges.length; i++) {
        const e = acyclicEdges[i];
        const sRank = ranks.get(e.source);
        const tRank = ranks.get(e.target);
        if (sRank + 1 > tRank) {
          ranks.set(e.target, sRank + 1);
          changed = true;
        }
      }
      if (!changed) break;
    }

    return ranks;
  }

  /**
   * Multi-sweep barycenter heuristic for edge crossing minimization.
   */
  function orderBucketsByBarycenter(buckets, maxRank, edges, nodes) {
    const incomingMap = new Map();
    const outgoingMap = new Map();
    nodes.forEach(n => {
      incomingMap.set(n.path, []);
      outgoingMap.set(n.path, []);
    });
    edges.forEach(e => {
      if (incomingMap.has(e.target)) incomingMap.get(e.target).push(e.source);
      if (outgoingMap.has(e.source)) outgoingMap.get(e.source).push(e.target);
    });

    // 1. Initial Rank 0 deterministic ordering
    const rank0 = buckets.get(0) || [];
    rank0.sort((a, b) => b.totalImpact - a.totalImpact || a.path.localeCompare(b.path));

    // Helper to get average coordinate of connected nodes
    function computeBarycenter(fileList, posMap, fallback) {
      if (!fileList || !fileList.length) return fallback;
      let sum = 0, count = 0;
      for (const f of fileList) {
        if (posMap.has(f)) {
          sum += posMap.get(f);
          count++;
        }
      }
      return count > 0 ? sum / count : fallback;
    }

    // Forward Sweep: Rank 1 -> maxRank
    for (let r = 1; r <= maxRank; r++) {
      const cur = buckets.get(r) || [];
      const prevPosMap = new Map();
      for (let prevR = 0; prevR < r; prevR++) {
        (buckets.get(prevR) || []).forEach((n, idx) => prevPosMap.set(n.path, idx));
      }
      cur.sort((a, b) => {
        const aAvg = computeBarycenter(incomingMap.get(a.path), prevPosMap, cur.length / 2);
        const bAvg = computeBarycenter(incomingMap.get(b.path), prevPosMap, cur.length / 2);
        return aAvg - bAvg || b.totalImpact - a.totalImpact || a.path.localeCompare(b.path);
      });
    }

    // Backward Sweep: maxRank - 1 -> 0
    for (let r = maxRank - 1; r >= 0; r--) {
      const cur = buckets.get(r) || [];
      const nextPosMap = new Map();
      for (let nextR = r + 1; nextR <= maxRank; nextR++) {
        (buckets.get(nextR) || []).forEach((n, idx) => nextPosMap.set(n.path, idx));
      }
      cur.sort((a, b) => {
        const aAvg = computeBarycenter(outgoingMap.get(a.path), nextPosMap, cur.length / 2);
        const bAvg = computeBarycenter(outgoingMap.get(b.path), nextPosMap, cur.length / 2);
        return aAvg - bAvg || b.totalImpact - a.totalImpact || a.path.localeCompare(b.path);
      });
    }

    // Final Forward Sweep to lock in positions
    for (let r = 1; r <= maxRank; r++) {
      const cur = buckets.get(r) || [];
      const prevPosMap = new Map();
      for (let prevR = 0; prevR < r; prevR++) {
        (buckets.get(prevR) || []).forEach((n, idx) => prevPosMap.set(n.path, idx));
      }
      cur.sort((a, b) => {
        const aAvg = computeBarycenter(incomingMap.get(a.path), prevPosMap, cur.length / 2);
        const bAvg = computeBarycenter(incomingMap.get(b.path), prevPosMap, cur.length / 2);
        return aAvg - bAvg || b.totalImpact - a.totalImpact || a.path.localeCompare(b.path);
      });
    }
  }

  /**
   * Layout Variant A: Topological Left-to-Right.
   * Callers on left, dependencies on right.
   */
  function computeTopologicalLR(nodes, edges, options = {}) {
    if (!nodes || !nodes.length) return;
    const ranks = computeTopologicalRanks(nodes, edges);
    const maxRank = Math.max(0, ...Array.from(ranks.values()));
    const buckets = new Map();
    for (let r = 0; r <= maxRank; r++) buckets.set(r, []);
    nodes.forEach(n => {
      const r = ranks.get(n.path) || 0;
      buckets.get(r).push(n);
    });

    orderBucketsByBarycenter(buckets, maxRank, edges, nodes);

    const colWidth = options.colWidth || 260; // 192 card + 68 gap
    const rowHeight = options.rowHeight || 72; // 48 card + 24 gap

    for (let r = 0; r <= maxRank; r++) {
      const colNodes = buckets.get(r) || [];
      const totalH = (colNodes.length - 1) * rowHeight;
      colNodes.forEach((node, idx) => {
        node.rank = r;
        node.maxRank = maxRank;
        node.x = (r - maxRank / 2) * colWidth;
        node.y = idx * rowHeight - totalH / 2;
      });
    }
  }

  /**
   * Layout Variant B: Topological Top-to-Bottom.
   * Callers at top, dependencies at bottom.
   */
  function computeTopologicalTB(nodes, edges, options = {}) {
    if (!nodes || !nodes.length) return;
    const ranks = computeTopologicalRanks(nodes, edges);
    const maxRank = Math.max(0, ...Array.from(ranks.values()));
    const buckets = new Map();
    for (let r = 0; r <= maxRank; r++) buckets.set(r, []);
    nodes.forEach(n => {
      const r = ranks.get(n.path) || 0;
      buckets.get(r).push(n);
    });

    orderBucketsByBarycenter(buckets, maxRank, edges, nodes);

    const colWidth = options.colWidth || 224; // 192 card + 32 gap
    const rowHeight = options.rowHeight || 110; // 48 card + 62 gap

    for (let r = 0; r <= maxRank; r++) {
      const rowNodes = buckets.get(r) || [];
      const totalW = (rowNodes.length - 1) * colWidth;
      rowNodes.forEach((node, idx) => {
        node.rank = r;
        node.maxRank = maxRank;
        node.x = idx * colWidth - totalW / 2;
        node.y = (r - maxRank / 2) * rowHeight;
      });
    }
  }

  /**
   * Extract meaningful directory name, skipping leading 'src/' if present.
   */
  function getEffectiveDirectory(filepath) {
    if (!filepath) return 'root';
    const clean = filepath.replace(/^[./\\]+/, '').replace(/\\/g, '/');
    const parts = clean.split('/');
    if (parts.length <= 1) return 'root';
    if (parts[0] === 'src' && parts.length > 2) {
      return parts[1]; // e.g. src/lib -> lib, src/app -> app
    }
    return parts[0]; // e.g. lib, app, test, cli
  }

  /**
   * Normalized multi-pass AABB rectangular separation.
   * Uses fractional penetration along the axis of minimum overlap.
   */
  function separateNodeCards(nodes, minDx = MIN_DX, minDy = MIN_DY, maxPasses = 40) {
    for (let pass = 0; pass < maxPasses; pass++) {
      let overlap = false;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const px = minDx - Math.abs(dx);
          const py = minDy - Math.abs(dy);
          if (px <= 0 || py <= 0) continue;
          overlap = true;
          // Fractional minimum penetration check
          if (px / minDx <= py / minDy) {
            const shift = (px / 2 + 0.5) * (Math.sign(dx) || 1);
            a.x -= shift;
            b.x += shift;
          } else {
            const shift = (py / 2 + 0.5) * (Math.sign(dy) || 1);
            a.y -= shift;
            b.y += shift;
          }
        }
      }
      if (!overlap) break;
    }
  }

  /**
   * Layout Variant C: Directory Communities + Box Collision.
   */
  function computeDirectoryClusterBox(nodes, edges, options = {}) {
    if (!nodes || !nodes.length) return;

    // 1. Group directories and assign deterministic centroids
    const dirMap = new Map();
    nodes.forEach(n => {
      const dir = getEffectiveDirectory(n.path);
      if (!dirMap.has(dir)) dirMap.set(dir, []);
      dirMap.get(dir).push(n);
    });

    const dirs = Array.from(dirMap.keys()).sort();
    const centroids = new Map();
    const clusterRadius = options.clusterRadius || Math.max(280, nodes.length * 16);
    dirs.forEach((dir, i) => {
      const angle = (i / dirs.length) * Math.PI * 2 - Math.PI / 2;
      centroids.set(dir, {
        x: Math.cos(angle) * clusterRadius,
        y: Math.sin(angle) * clusterRadius
      });
    });

    // 2. Initial placement around directory centroids
    nodes.forEach((n, idx) => {
      const dir = getEffectiveDirectory(n.path);
      const c = centroids.get(dir) || { x: 0, y: 0 };
      const subAngle = (idx % 8) * (Math.PI / 4);
      const subRadius = 45 + (idx % 4) * 35;
      n.x = c.x + Math.cos(subAngle) * subRadius;
      n.y = c.y + Math.sin(subAngle) * subRadius;
      n.vx = 0;
      n.vy = 0;
    });

    const nodeMap = new Map(nodes.map(n => [n.path, n]));

    // 3. Force relaxation with directory gravity & edge springs
    const iterations = options.iterations || 120;
    for (let iter = 0; iter < iterations; iter++) {
      // Centroid attraction
      for (const n of nodes) {
        const dir = getEffectiveDirectory(n.path);
        const c = centroids.get(dir) || { x: 0, y: 0 };
        n.vx += (c.x - n.x) * 0.035;
        n.vy += (c.y - n.y) * 0.035;
      }

      // Edge spring attraction (targetDist 240px to respect 216px card width)
      for (const e of edges) {
        const s = nodeMap.get(e.source);
        const t = nodeMap.get(e.target);
        if (!s || !t) continue;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const targetDist = 240;
        const force = (dist - targetDist) * 0.025;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        s.vx += fx; s.vy += fy;
        t.vx -= fx; t.vy -= fy;
      }

      // Inter-node repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const distSq = dx * dx + dy * dy + 1;
          const dist = Math.sqrt(distSq);
          if (dist < 400) {
            const force = 24000 / distSq;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            a.vx -= fx; a.vy -= fy;
            b.vx += fx; b.vy += fy;
          }
        }
      }

      // Update positions with damping
      for (const n of nodes) {
        n.x += n.vx * 0.22;
        n.y += n.vy * 0.22;
        n.vx *= 0.6;
        n.vy *= 0.6;
      }
    }

    // 4. Multi-pass rigid AABB rectangular card separation
    separateNodeCards(nodes, MIN_DX, MIN_DY, 45);
  }

  return {
    CARD_WIDTH,
    CARD_HEIGHT,
    MIN_DX,
    MIN_DY,
    getGraphNodeBounds,
    computeBoundingBox,
    findBackEdges,
    computeTopologicalRanks,
    getEffectiveDirectory,
    separateNodeCards,
    computeTopologicalLR,
    computeTopologicalTB,
    computeDirectoryClusterBox
  };
});
