/**
 * Cartograph fit-camera — world-to-viewport framing for the canvas graph.
 *
 * Zero dependencies. No DOM access. Pure math shared by the browser UI layer
 * (`app/cartograph-graph-state.js`, global `CartographFit`) and the Node
 * tests: given a world-space
 * bounding box of graph nodes plus the visible canvas size, return an
 * `{ x, y, zoom }` camera such that
 * `ctx.translate(camera.x, camera.y); ctx.scale(camera.zoom, camera.zoom)`
 * draws the whole box inside the canvas with padding, centered.
 *
 * Semantics:
 * - Uniform zoom (both axes share one factor), since node chips and labels
 *   must not stretch.
 * - Fit zoom is clamped to [0.05, 2.6]. Huge worlds floor at 0.05 (the user
 *   pans for detail); a single-node "speck" graph ceilings at 2.6 so it stays
 *   readable instead of becoming a giant blob.
 * - Degenerate input (missing/null box, ±Infinity spans) returns the identity
 *   camera {x: 0, y: 0, zoom: 1} rather than NaN fried state.
 * - A zero-length span (flat row, single point) is centered on the opposite
 *   axis and compressed to ~0 for framing; finite axis still drives the zoom.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CartographFit = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MIN_ZOOM = 0.05;
  const MAX_ZOOM = 2.6;
  const DEFAULT_PAD = 40;
  const ZERO_SPAN = 1e-6;

  // Padding may be a number (all sides) or a per-side object, so callers can
  // exclude the canvas chrome (top toolbar, bottom legend) from the fit band.
  function padSides(padding) {
    if (padding === undefined || padding === null || padding === false) {
      return { top: DEFAULT_PAD, right: DEFAULT_PAD, bottom: DEFAULT_PAD, left: DEFAULT_PAD };
    }
    if (typeof padding === 'object') {
      return {
        top: isFinite(padding.top) ? padding.top : DEFAULT_PAD,
        right: isFinite(padding.right) ? padding.right : DEFAULT_PAD,
        bottom: isFinite(padding.bottom) ? padding.bottom : DEFAULT_PAD,
        left: isFinite(padding.left) ? padding.left : DEFAULT_PAD,
      };
    }
    const pad = isFinite(padding) ? padding : DEFAULT_PAD;
    return { top: pad, right: pad, bottom: pad, left: pad };
  }

  function computeFitCamera(box, viewWidth, viewHeight, padding) {
    if (!box ||
        !isFinite(box.minX) || !isFinite(box.minY) ||
        !isFinite(box.maxX) || !isFinite(box.maxY)) {
      return { x: 0, y: 0, zoom: 1 };
    }

    const pad = padSides(padding);
    const availW = Math.max(1, viewWidth - pad.left - pad.right);
    const availH = Math.max(1, viewHeight - pad.top - pad.bottom);
    const spanX = box.maxX - box.minX;
    const spanY = box.maxY - box.minY;
    const zx = spanX > ZERO_SPAN ? availW / spanX : Infinity;
    const zy = spanY > ZERO_SPAN ? availH / spanY : Infinity;

    const rawZoom = Math.min(zx, zy);
    const zoom = isFinite(rawZoom)
      ? clamp(rawZoom, MIN_ZOOM, MAX_ZOOM)
      : 1;

    const worldW = Math.max(spanX, ZERO_SPAN);
    const worldH = Math.max(spanY, ZERO_SPAN);
    const x = pad.left + (availW - worldW * zoom) / 2 - box.minX * zoom;
    const y = pad.top + (availH - worldH * zoom) / 2 - box.minY * zoom;

    return { x, y, zoom };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  return {
    computeFitCamera,
    MIN_ZOOM,
    MAX_ZOOM,
  };
});
