/**
 * Cartograph Viewport Camera — world-to-viewport projection and framing engine.
 *
 * Zero dependencies. No DOM access. Pure math shared by the browser UI layer
 * (`app/cartograph-graph-state.js`, `app/cartograph-canvas-render.js`) and Node
 * test suites:
 * - World-to-screen and screen-to-world coordinate transformations.
 * - Uniform zoom clamping in [MIN_ZOOM, MAX_ZOOM].
 * - Cursor-anchored focal zooming (maintains stationary world coordinate under cursor).
 * - Target node centering without changing zoom.
 * - Automatic bounding-box derivation and whole-graph viewport auto-fit.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const mod = factory();
    root.CartographCamera = mod;
    root.CartographFit = mod; // Full backward compatibility
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MIN_ZOOM = 0.05;
  const MAX_ZOOM = 2.6;
  const DEFAULT_PAD = Object.freeze({ top: 40, right: 40, bottom: 40, left: 40 });
  const ZERO_SPAN = 1e-6;
  const CARD_HALF_WIDTH = 96;
  const CARD_HALF_HEIGHT = 24;

  function clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
  }

  function padSides(padding) {
    if (padding === undefined || padding === null || padding === false) {
      return { ...DEFAULT_PAD };
    }
    if (typeof padding === 'object') {
      return {
        top: Number.isFinite(padding.top) ? padding.top : DEFAULT_PAD.top,
        right: Number.isFinite(padding.right) ? padding.right : DEFAULT_PAD.right,
        bottom: Number.isFinite(padding.bottom) ? padding.bottom : DEFAULT_PAD.bottom,
        left: Number.isFinite(padding.left) ? padding.left : DEFAULT_PAD.left,
      };
    }
    const pad = Number.isFinite(padding) ? padding : DEFAULT_PAD.top;
    return { top: pad, right: pad, bottom: pad, left: pad };
  }

  function getNodeBounds(node) {
    const x = (node && Number.isFinite(node.x)) ? node.x : 0;
    const y = (node && Number.isFinite(node.y)) ? node.y : 0;
    return {
      minX: x - CARD_HALF_WIDTH,
      minY: y - CARD_HALF_HEIGHT,
      maxX: x + CARD_HALF_WIDTH,
      maxY: y + CARD_HALF_HEIGHT,
    };
  }

  function computeBoundingBox(nodes) {
    if (!nodes || !nodes.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      const b = getNodeBounds(n);
      if (b.minX < minX) minX = b.minX;
      if (b.minY < minY) minY = b.minY;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.maxY > maxY) maxY = b.maxY;
    }
    return {
      minX: Number.isFinite(minX) ? minX : 0,
      minY: Number.isFinite(minY) ? minY : 0,
      maxX: Number.isFinite(maxX) ? maxX : 0,
      maxY: Number.isFinite(maxY) ? maxY : 0,
    };
  }

  function computeFitCamera(box, viewWidth, viewHeight, padding) {
    if (!box ||
        !Number.isFinite(box.minX) || !Number.isFinite(box.minY) ||
        !Number.isFinite(box.maxX) || !Number.isFinite(box.maxY)) {
      return { x: 0, y: 0, zoom: 1 };
    }

    const pad = padSides(padding);
    const availW = Math.max(1, (viewWidth || 800) - pad.left - pad.right);
    const availH = Math.max(1, (viewHeight || 600) - pad.top - pad.bottom);
    const spanX = box.maxX - box.minX;
    const spanY = box.maxY - box.minY;
    const zx = spanX > ZERO_SPAN ? availW / spanX : Infinity;
    const zy = spanY > ZERO_SPAN ? availH / spanY : Infinity;

    const rawZoom = Math.min(zx, zy);
    const zoom = Number.isFinite(rawZoom)
      ? clamp(rawZoom, MIN_ZOOM, MAX_ZOOM)
      : 1;

    const worldW = Math.max(spanX, ZERO_SPAN);
    const worldH = Math.max(spanY, ZERO_SPAN);
    const x = pad.left + (availW - worldW * zoom) / 2 - box.minX * zoom;
    const y = pad.top + (availH - worldH * zoom) / 2 - box.minY * zoom;

    return { x, y, zoom };
  }

  function fitToNodes(nodes, viewWidth, viewHeight, padding) {
    if (!nodes || !nodes.length) return { x: 0, y: 0, zoom: 1 };
    const box = computeBoundingBox(nodes);
    return computeFitCamera(box, viewWidth, viewHeight, padding);
  }

  function centerOnNode(camera, node, viewWidth, viewHeight) {
    const cam = camera || { x: 0, y: 0, zoom: 1 };
    const zoom = clamp(cam.zoom || 1, MIN_ZOOM, MAX_ZOOM);
    const nx = (node && Number.isFinite(node.x)) ? node.x : 0;
    const ny = (node && Number.isFinite(node.y)) ? node.y : 0;
    const vw = (Number.isFinite(viewWidth) && viewWidth > 0) ? viewWidth : 800;
    const vh = (Number.isFinite(viewHeight) && viewHeight > 0) ? viewHeight : 600;

    return {
      x: vw / 2 - nx * zoom,
      y: vh / 2 - ny * zoom,
      zoom,
    };
  }

  function zoomAt(camera, screenPt, factor) {
    const cam = camera || { x: 0, y: 0, zoom: 1 };
    const currentZoom = clamp(cam.zoom || 1, MIN_ZOOM, MAX_ZOOM);
    const newZoom = clamp(currentZoom * factor, MIN_ZOOM, MAX_ZOOM);
    const sx = (screenPt && Number.isFinite(screenPt.x)) ? screenPt.x : 0;
    const sy = (screenPt && Number.isFinite(screenPt.y)) ? screenPt.y : 0;

    return {
      x: sx - (sx - cam.x) * (newZoom / currentZoom),
      y: sy - (sy - cam.y) * (newZoom / currentZoom),
      zoom: newZoom,
    };
  }

  function panBy(camera, dx, dy) {
    const cam = camera || { x: 0, y: 0, zoom: 1 };
    return {
      x: cam.x + (Number.isFinite(dx) ? dx : 0),
      y: cam.y + (Number.isFinite(dy) ? dy : 0),
      zoom: cam.zoom,
    };
  }

  function toWorld(camera, screenPt) {
    const cam = camera || { x: 0, y: 0, zoom: 1 };
    const z = clamp(cam.zoom || 1, MIN_ZOOM, MAX_ZOOM);
    const sx = (screenPt && Number.isFinite(screenPt.x)) ? screenPt.x : 0;
    const sy = (screenPt && Number.isFinite(screenPt.y)) ? screenPt.y : 0;
    return {
      x: (sx - cam.x) / z,
      y: (sy - cam.y) / z,
    };
  }

  function toScreen(camera, worldPt) {
    const cam = camera || { x: 0, y: 0, zoom: 1 };
    const z = clamp(cam.zoom || 1, MIN_ZOOM, MAX_ZOOM);
    const wx = (worldPt && Number.isFinite(worldPt.x)) ? worldPt.x : 0;
    const wy = (worldPt && Number.isFinite(worldPt.y)) ? worldPt.y : 0;
    return {
      x: wx * z + cam.x,
      y: wy * z + cam.y,
    };
  }

  return {
    MIN_ZOOM,
    MAX_ZOOM,
    DEFAULT_PAD,
    computeFitCamera,
    computeBoundingBox,
    getNodeBounds,
    fitToNodes,
    centerOnNode,
    zoomAt,
    panBy,
    toWorld,
    toScreen,
  };
});
