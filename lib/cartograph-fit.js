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

  function createCamera(initialState) {
    let x = (initialState && Number.isFinite(initialState.x)) ? initialState.x : 0;
    let y = (initialState && Number.isFinite(initialState.y)) ? initialState.y : 0;
    let zoom = clamp((initialState && Number.isFinite(initialState.zoom)) ? initialState.zoom : 1, MIN_ZOOM, MAX_ZOOM);

    const instance = {
      get x() { return x; },
      set x(val) { if (Number.isFinite(val)) x = val; },
      get y() { return y; },
      set y(val) { if (Number.isFinite(val)) y = val; },
      get zoom() { return zoom; },
      set zoom(val) { zoom = clamp(val, MIN_ZOOM, MAX_ZOOM); },

      getState() {
        return { x, y, zoom };
      },

      setState(next) {
        if (!next) return this;
        if (Number.isFinite(next.x)) x = next.x;
        if (Number.isFinite(next.y)) y = next.y;
        if (Number.isFinite(next.zoom)) zoom = clamp(next.zoom, MIN_ZOOM, MAX_ZOOM);
        return this;
      },

      toWorld(screenPt) {
        return toWorld({ x, y, zoom }, screenPt);
      },

      toScreen(worldPt) {
        return toScreen({ x, y, zoom }, worldPt);
      },

      zoomAt(screenPt, factor) {
        const next = zoomAt({ x, y, zoom }, screenPt, factor);
        x = next.x;
        y = next.y;
        zoom = next.zoom;
        return this;
      },

      panBy(dx, dy) {
        const next = panBy({ x, y, zoom }, dx, dy);
        x = next.x;
        y = next.y;
        return this;
      },

      centerOnNode(node, viewWidth, viewHeight) {
        const next = centerOnNode({ x, y, zoom }, node, viewWidth, viewHeight);
        x = next.x;
        y = next.y;
        zoom = next.zoom;
        return this;
      },

      fitToNodes(nodes, viewWidth, viewHeight, padding) {
        const next = fitToNodes(nodes, viewWidth, viewHeight, padding);
        x = next.x;
        y = next.y;
        zoom = next.zoom;
        return this;
      },

      fitToBox(box, viewWidth, viewHeight, padding) {
        const next = computeFitCamera(box, viewWidth, viewHeight, padding);
        x = next.x;
        y = next.y;
        zoom = next.zoom;
        return this;
      },

      getVisibleWorldBox(viewWidth, viewHeight, margin = 0) {
        const vw = Math.max(1, (Number.isFinite(viewWidth) && viewWidth > 0) ? viewWidth : 800);
        const vh = Math.max(1, (Number.isFinite(viewHeight) && viewHeight > 0) ? viewHeight : 600);
        const p1 = this.toWorld({ x: -margin, y: -margin });
        const p2 = this.toWorld({ x: vw + margin, y: vh + margin });
        const minX = Math.min(p1.x, p2.x);
        const minY = Math.min(p1.y, p2.y);
        const maxX = Math.max(p1.x, p2.x);
        const maxY = Math.max(p1.y, p2.y);
        return {
          minX: minX === 0 ? 0 : minX,
          minY: minY === 0 ? 0 : minY,
          maxX: maxX === 0 ? 0 : maxX,
          maxY: maxY === 0 ? 0 : maxY,
        };
      },

      isNodeVisible(node, viewWidth, viewHeight, margin = 0) {
        if (!node) return false;
        const b = getNodeBounds(node);
        return this.isBoxVisible(b, viewWidth, viewHeight, margin);
      },

      isBoxVisible(box, viewWidth, viewHeight, margin = 0) {
        if (!box) return false;
        const view = this.getVisibleWorldBox(viewWidth, viewHeight, margin);
        return !(box.maxX < view.minX || box.minX > view.maxX || box.maxY < view.minY || box.minY > view.maxY);
      },
    };

    return instance;
  }

  return {
    MIN_ZOOM,
    MAX_ZOOM,
    DEFAULT_PAD,
    createCamera,
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
