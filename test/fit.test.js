'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const CartographFit = require('../lib/cartograph-fit.js');

function screenPoint(camera, p) {
  return {
    x: p.x * camera.zoom + camera.x,
    y: p.y * camera.zoom + camera.y,
  };
}

function assertInside(screen, viewW, viewH, pad) {
  assert.ok(screen.minimum.x >= pad - 1e-6, `left edge clipped: ${screen.minimum.x}`);
  assert.ok(screen.minimum.y >= pad - 1e-6, `top edge clipped: ${screen.minimum.y}`);
  assert.ok(screen.maximum.x <= viewW - pad + 1e-6, `right edge clipped: ${screen.maximum.x}`);
  assert.ok(screen.maximum.y <= viewH - pad + 1e-6, `bottom edge clipped: ${screen.maximum.y}`);
}

// Cartograph.html in the logged bug report: 343-node Aimane branch, canvas 855x428.
const LAYERED_BOX = { minX: 111, minY: 73, maxX: 744, maxY: 497 };
const FORCE_BOX = { minX: -2067, minY: -1475, maxX: 3602, maxY: 2421 };
const VIEW = { width: 855, height: 428, pad: 40 };

function frame(box, camera, viewW, viewH) {
  const a = screenPoint(camera, { x: box.minX, y: box.minY });
  const b = screenPoint(camera, { x: box.maxX, y: box.maxY });
  return {
    minimum: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
    maximum: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
    center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
  };
}

test('fits the layered (dag) world box without clipping and centers it', () => {
  const cam = CartographFit.computeFitCamera(LAYERED_BOX, VIEW.width, VIEW.height, VIEW.pad);
  const f = frame(LAYERED_BOX, cam, VIEW.width, VIEW.height);
  assertInside(f, VIEW.width, VIEW.height, VIEW.pad);
  assert.ok(cam.zoom > 0 && cam.zoom < 1, `expected a zoom-out, got ${cam.zoom}`);
  assert.ok(Math.abs(f.center.x - VIEW.width / 2) < 1e-6);
  assert.ok(Math.abs(f.center.y - VIEW.height / 2) < 1e-6);
});

test('fits the force-graph world box (343-node scatter) onto the canvas', () => {
  const cam = CartographFit.computeFitCamera(FORCE_BOX, VIEW.width, VIEW.height, VIEW.pad);
  const f = frame(FORCE_BOX, cam, VIEW.width, VIEW.height);
  assertInside(f, VIEW.width, VIEW.height, VIEW.pad);
  assert.ok(cam.zoom >= CartographFit.MIN_ZOOM, `zoom ${cam.zoom} below MIN_ZOOM`);
  assert.ok(Math.abs(f.center.x - VIEW.width / 2) < 1e-6);
  assert.ok(Math.abs(f.center.y - VIEW.height / 2) < 1e-6);
});

test('zoom clamps to MIN_ZOOM for huge worlds and MAX_ZOOM for specks', () => {
  const huge = CartographFit.computeFitCamera(
    { minX: 0, minY: 0, maxX: 50000, maxY: 40000 },
    VIEW.width, VIEW.height, VIEW.pad
  );
  assert.equal(huge.zoom, CartographFit.MIN_ZOOM);

  const speck = CartographFit.computeFitCamera(
    { minX: 100, minY: 100, maxX: 100.01, maxY: 100.01 },
    VIEW.width, VIEW.height, VIEW.pad
  );
  assert.equal(speck.zoom, CartographFit.MAX_ZOOM);
  const spot = frame({ minX: 100, minY: 100, maxX: 100.01, maxY: 100.01 }, speck, VIEW.width, VIEW.height);
  assert.ok(Math.abs(spot.center.x - VIEW.width / 2) < 2.1);
  assert.ok(Math.abs(spot.center.y - VIEW.height / 2) < 2.1);
});

test('per-side padding keeps the graph clear of the canvas chrome', () => {
  // Toolbar overlays the canvas top, legend + hint stack the bottom.
  const pads = { top: 88, bottom: 104, left: 40, right: 40 };
  const cam = CartographFit.computeFitCamera(LAYERED_BOX, VIEW.width, VIEW.height, pads);
  const f = frame(LAYERED_BOX, cam, VIEW.width, VIEW.height);
  assertInside(f, VIEW.width, VIEW.height, 0);
  assert.ok(Math.abs(f.minimum.x - pads.left) < 1e-6 || f.minimum.x > pads.left - 1e-6);
  assert.ok(f.minimum.y >= pads.top - 1e-6, `top row under toolbar: ${f.minimum.y}`);
  assert.ok(f.maximum.y <= VIEW.height - pads.bottom + 1e-6, `bottom row under legend: ${f.maximum.y}`);
  assert.ok(Math.abs(f.center.x - VIEW.width / 2) < 1e-6);
});

test('degenerate boxes fall back to sane cameras', () => {
  assert.deepEqual(CartographFit.computeFitCamera(null, VIEW.width, VIEW.height), {
    x: 0,
    y: 0,
    zoom: 1,
  });
  assert.deepEqual(CartographFit.computeFitCamera(
    { minX: Infinity, minY: -Infinity, maxX: -Infinity, maxY: Infinity },
    VIEW.width, VIEW.height
  ), { x: 0, y: 0, zoom: 1 });

  const flatRow = CartographFit.computeFitCamera(
    { minX: 0, minY: 200, maxX: 633, maxY: 200 },
    600, 400
  );
  const f = frame({ minX: 0, minY: 200, maxX: 633, maxY: 200 }, flatRow, 600, 400);
  assert.ok(Math.abs(f.center.y - 200) < 1e-6, `flat row not vertically centered: ${f.center.y}`);

  const single = CartographFit.computeFitCamera(
    { minX: 40, minY: 40, maxX: 40, maxY: 40 },
    VIEW.width, VIEW.height
  );
  const s = frame({ minX: 40, minY: 40, maxX: 40, maxY: 40 }, single, VIEW.width, VIEW.height);
  assert.ok(Math.abs(s.center.x - VIEW.width / 2) < 1e-6);
  assert.ok(Math.abs(s.center.y - VIEW.height / 2) < 1e-6);
});
