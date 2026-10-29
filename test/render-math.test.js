'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CartographRenderMath = require('../lib/cartograph-render-math.js');

test('computeCardEndpoint calculates exact boundary intersections on 192x48 cards', () => {
  const node = { x: 0, y: 0 };

  // Pure horizontal ray to the right
  const rightTarget = { x: 300, y: 0 };
  const pRight = CartographRenderMath.computeCardEndpoint(node, rightTarget);
  assert.equal(pRight.x, 96);
  assert.equal(pRight.y, 0);

  // Pure horizontal ray to the left
  const leftTarget = { x: -300, y: 0 };
  const pLeft = CartographRenderMath.computeCardEndpoint(node, leftTarget);
  assert.equal(pLeft.x, -96);
  assert.equal(pLeft.y, 0);

  // Pure vertical ray downwards
  const downTarget = { x: 0, y: 200 };
  const pDown = CartographRenderMath.computeCardEndpoint(node, downTarget);
  assert.equal(pDown.x, 0);
  assert.equal(pDown.y, 24);

  // Pure vertical ray upwards
  const upTarget = { x: 0, y: -200 };
  const pUp = CartographRenderMath.computeCardEndpoint(node, upTarget);
  assert.equal(pUp.x, 0);
  assert.equal(pUp.y, -24);
});

test('computeEdgeGeometry routes cubic Béziers in LR and TB modes and straight lines in Cluster mode', () => {
  const source = { x: 100, y: 100 };
  const target = { x: 400, y: 250 };

  // 1. LR Pipeline Mode
  const lrGeom = CartographRenderMath.computeEdgeGeometry(source, target, 'dag-lr');
  assert.equal(lrGeom.type, 'bezier');
  assert.equal(lrGeom.mode, 'dag-lr');
  assert.equal(lrGeom.controlPoints.length, 2);
  // In LR mode, start control point has horizontal offset
  assert.ok(lrGeom.controlPoints[0].x > lrGeom.start.x);
  assert.equal(lrGeom.controlPoints[0].y, lrGeom.start.y);
  assert.ok(Number.isFinite(lrGeom.arrivalAngle));

  // 2. TB Pipeline Mode
  const tbGeom = CartographRenderMath.computeEdgeGeometry(source, target, 'dag-tb');
  assert.equal(tbGeom.type, 'bezier');
  assert.equal(tbGeom.mode, 'dag-tb');
  assert.equal(tbGeom.controlPoints.length, 2);
  // In TB mode, start control point has vertical offset
  assert.equal(tbGeom.controlPoints[0].x, tbGeom.start.x);
  assert.ok(tbGeom.controlPoints[0].y > lrGeom.start.y);

  // 3. Cluster / Force Mode
  const clusterGeom = CartographRenderMath.computeEdgeGeometry(source, target, 'cluster');
  assert.equal(clusterGeom.type, 'line');
  assert.equal(clusterGeom.mode, 'cluster');
  assert.equal(clusterGeom.controlPoints.length, 0);
  const expectedAngle = Math.atan2(clusterGeom.end.y - clusterGeom.start.y, clusterGeom.end.x - clusterGeom.start.x);
  assert.ok(Math.abs(clusterGeom.arrivalAngle - expectedAngle) < 1e-9);
});

test('computeArrowheadPoints aligns arrowhead polygon with arrival tangent angle', () => {
  const end = { x: 200, y: 150 };
  const angle = 0; // Pointing directly to the right
  const points = CartographRenderMath.computeArrowheadPoints(end, angle, 10, 0.5);

  assert.equal(points.length, 3);
  assert.deepEqual(points[0], { x: 200, y: 150 }, 'Tip matches target endpoint');
  assert.ok(points[1].x < 200, 'Wings extend backwards from tip');
  assert.ok(points[2].x < 200, 'Wings extend backwards from tip');
});

test('computeDotGridBounds calculates aligned grid boundaries for viewport', () => {
  const camera = { x: 100, y: 50, zoom: 1.0 };
  const bounds = CartographRenderMath.computeDotGridBounds(camera, 800, 600, 36);

  assert.equal(bounds.dotSpacing, 36);
  assert.ok(bounds.startX <= -100);
  assert.ok(bounds.endX >= 700);
  assert.ok(bounds.startY <= -50);
  assert.ok(bounds.endY >= 550);
  assert.equal(Math.abs(bounds.startX % 36), 0);
  assert.equal(Math.abs(bounds.startY % 36), 0);
});

test('computeClusterHulls groups nodes by directory and derives bounding regions', () => {
  const nodes = [
    { path: 'src/lib/a.ts', x: 100, y: 100 },
    { path: 'src/lib/b.ts', x: 250, y: 150 },
    { path: 'src/api/c.ts', x: 500, y: 300 },
  ];

  const hulls = CartographRenderMath.computeClusterHulls(nodes, (p) => p.split('/')[1]);
  assert.equal(hulls.length, 2);

  const libHull = hulls.find((h) => h.directory === 'lib');
  assert.ok(libHull);
  assert.equal(libHull.nodeCount, 2);
  assert.ok(libHull.bounds.width > 200);
  assert.ok(libHull.bounds.height > 50);

  const apiHull = hulls.find((h) => h.directory === 'api');
  assert.ok(apiHull);
  assert.equal(apiHull.nodeCount, 1);
});

test('computePipelineGuides computes stage columns and rows with accurate topological labels', () => {
  const nodes = [
    { path: 'a.ts', rank: 0, x: 0, y: 100 },
    { path: 'b.ts', rank: 1, x: 260, y: 120 },
    { path: 'c.ts', rank: 2, x: 520, y: 140 },
  ];

  // LR Pipeline guides
  const lrGuides = CartographRenderMath.computePipelineGuides(nodes, 'dag-lr');
  assert.equal(lrGuides.length, 3);
  assert.equal(lrGuides[0].label, 'ENTRY POINTS');
  assert.equal(lrGuides[1].label, 'TIER 1');
  assert.equal(lrGuides[2].label, 'LEAF & CORE');

  // TB Pipeline guides
  const tbGuides = CartographRenderMath.computePipelineGuides(nodes, 'dag-tb');
  assert.equal(tbGuides.length, 3);
  assert.equal(tbGuides[0].label, 'ENTRY');
  assert.equal(tbGuides[1].label, 'TIER 1');
  assert.equal(tbGuides[2].label, 'CORE');
});

test('disambiguateNodeLabels prefixes parent directory only for colliding basenames', () => {
  const nodes = [
    { path: 'src/auth/service.ts' },
    { path: 'src/billing/service.ts' },
    { path: 'src/unique-file.ts' },
  ];

  const labels = CartographRenderMath.disambiguateNodeLabels(nodes);
  assert.equal(labels.get('src/auth/service.ts').displayLabel, 'auth/service.ts');
  assert.equal(labels.get('src/billing/service.ts').displayLabel, 'billing/service.ts');
  assert.equal(labels.get('src/unique-file.ts').displayLabel, 'unique-file.ts');
});
