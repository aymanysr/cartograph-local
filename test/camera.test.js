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

test('CartographCamera createCamera provides encapsulated stateful camera with spatial queries', () => {
  const cam = CartographCamera.createCamera({ x: 100, y: 50, zoom: 1.0 });

  assert.equal(cam.x, 100);
  assert.equal(cam.y, 50);
  assert.equal(cam.zoom, 1.0);

  // Pan
  cam.panBy(20, -10);
  assert.equal(cam.x, 120);
  assert.equal(cam.y, 40);

  // Coordinate projections
  const screen = cam.toScreen({ x: 200, y: 100 });
  assert.equal(screen.x, 200 * 1.0 + 120);
  assert.equal(screen.y, 100 * 1.0 + 40);

  const world = cam.toWorld(screen);
  assert.ok(Math.abs(world.x - 200) < 1e-9);
  assert.ok(Math.abs(world.y - 100) < 1e-9);

  // Zoom with clamping
  cam.zoomAt({ x: 400, y: 300 }, 2.0);
  assert.equal(cam.zoom, 2.0);

  cam.zoom = 100; // clamp to MAX_ZOOM
  assert.equal(cam.zoom, CartographCamera.MAX_ZOOM);

  cam.zoom = 0.001; // clamp to MIN_ZOOM
  assert.equal(cam.zoom, CartographCamera.MIN_ZOOM);

  // Reset for viewport queries
  cam.setState({ x: 0, y: 0, zoom: 1.0 });
  const viewWidth = 800;
  const viewHeight = 600;

  const visibleBox = cam.getVisibleWorldBox(viewWidth, viewHeight);
  assert.equal(visibleBox.minX, 0);
  assert.equal(visibleBox.minY, 0);
  assert.equal(visibleBox.maxX, 800);
  assert.equal(visibleBox.maxY, 600);

  // Node inside viewport
  const insideNode = { x: 400, y: 300 };
  assert.equal(cam.isNodeVisible(insideNode, viewWidth, viewHeight), true);

  // Node completely outside viewport
  const outsideNode = { x: 2000, y: 2000 };
  assert.equal(cam.isNodeVisible(outsideNode, viewWidth, viewHeight), false);

  // Node partially on boundary with margin
  const boundaryNode = { x: 850, y: 300 }; // 850 - 96 = 754 < 800, so intersects even without margin!
  assert.equal(cam.isNodeVisible(boundaryNode, viewWidth, viewHeight), true);

  // Far node
  const farNode = { x: 1200, y: 300 };
  assert.equal(cam.isNodeVisible(farNode, viewWidth, viewHeight), false);
  assert.equal(cam.isNodeVisible(farNode, viewWidth, viewHeight, 500), true, 'Margin expands visible frustum');
});
