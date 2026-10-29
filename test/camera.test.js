const test = require('node:test');
const assert = require('node:assert/strict');
const CartographCamera = require('../lib/cartograph-fit.js');

test('CartographCamera provides reciprocal coordinate projection (toWorld and toScreen)', () => {
  const camera = { x: 120, y: -45, zoom: 1.5 };
  const worldPoint = { x: 300, y: 150 };

  const screenPoint = CartographCamera.toScreen(camera, worldPoint);
  assert.equal(screenPoint.x, 300 * 1.5 + 120);
  assert.equal(screenPoint.y, 150 * 1.5 - 45);

  const roundTripWorld = CartographCamera.toWorld(camera, screenPoint);
  assert.ok(Math.abs(roundTripWorld.x - worldPoint.x) < 1e-9);
  assert.ok(Math.abs(roundTripWorld.y - worldPoint.y) < 1e-9);
});

test('CartographCamera maintains world-point invariance under focal cursor zoom', () => {
  const camera = { x: 50, y: 80, zoom: 1.0 };
  const cursorScreen = { x: 400, y: 300 };

  // World point before zoom
  const worldBefore = CartographCamera.toWorld(camera, cursorScreen);

  // Zoom in by factor of 1.4
  const newCamera = CartographCamera.zoomAt(camera, cursorScreen, 1.4);
  assert.equal(newCamera.zoom, 1.4);

  // World point after zoom should be identical at cursorScreen
  const worldAfter = CartographCamera.toWorld(newCamera, cursorScreen);
  assert.ok(Math.abs(worldBefore.x - worldAfter.x) < 1e-9);
  assert.ok(Math.abs(worldBefore.y - worldAfter.y) < 1e-9);
});

test('CartographCamera centerOnNode places target node exactly in viewport center', () => {
  const camera = { x: 0, y: 0, zoom: 1.2 };
  const targetNode = { x: 250, y: 180 };
  const viewWidth = 1200;
  const viewHeight = 800;

  const centeredCamera = CartographCamera.centerOnNode(camera, targetNode, viewWidth, viewHeight);
  assert.equal(centeredCamera.zoom, 1.2);

  // When projected to screen with new camera, node must be at (viewWidth/2, viewHeight/2)
  const screenPos = CartographCamera.toScreen(centeredCamera, targetNode);
  assert.ok(Math.abs(screenPos.x - viewWidth / 2) < 1e-9);
  assert.ok(Math.abs(screenPos.y - viewHeight / 2) < 1e-9);
});

test('CartographCamera fitToNodes frames multi-node graph inside view bounds with padding', () => {
  const nodes = [
    { x: 0, y: 0 },
    { x: 500, y: 300 },
  ];
  const camera = CartographCamera.fitToNodes(nodes, 1000, 600, { top: 40, right: 20, bottom: 20, left: 20 });
  assert.ok(camera.zoom >= CartographCamera.MIN_ZOOM);
  assert.ok(camera.zoom <= CartographCamera.MAX_ZOOM);

  // Both node boxes must project completely inside [20, 980] horizontally and [40, 580] vertically
  for (const n of nodes) {
    const b = CartographCamera.getNodeBounds(n);
    const sMin = CartographCamera.toScreen(camera, { x: b.minX, y: b.minY });
    const sMax = CartographCamera.toScreen(camera, { x: b.maxX, y: b.maxY });
    assert.ok(sMin.x >= 19.99);
    assert.ok(sMax.x <= 980.01);
    assert.ok(sMin.y >= 39.99);
    assert.ok(sMax.y <= 580.01);
  }
});

test('CartographCamera panBy translates camera coordinates by dx and dy', () => {
  const camera = { x: 100, y: 200, zoom: 1.5 };
  const panned = CartographCamera.panBy(camera, 50, -30);
  assert.equal(panned.x, 150);
  assert.equal(panned.y, 170);
  assert.equal(panned.zoom, 1.5);
});

test('CartographCamera exports DEFAULT_PAD as a Padding object and supports MIN/MAX_ZOOM', () => {
  assert.deepEqual(CartographCamera.DEFAULT_PAD, { top: 40, right: 40, bottom: 40, left: 40 });
  assert.equal(CartographCamera.MIN_ZOOM, 0.05);
  assert.equal(CartographCamera.MAX_ZOOM, 2.6);
});
