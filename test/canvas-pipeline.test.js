const test = require('node:test');
const assert = require('node:assert/strict');
const CartographCanvasPipeline = require('../lib/cartograph-canvas-pipeline.js');

function createMockContext() {
  const calls = [];
  return {
    calls,
    save() { calls.push('save'); },
    restore() { calls.push('restore'); },
    beginPath() { calls.push('beginPath'); },
    fill() { calls.push('fill'); },
    stroke() { calls.push('stroke'); },
    rect(x, y, w, h) { calls.push({ op: 'rect', x, y, w, h }); },
    roundRect(x, y, w, h, r) { calls.push({ op: 'roundRect', x, y, w, h, r }); },
    arc(x, y, r, sa, ea) { calls.push({ op: 'arc', x, y, r }); },
    moveTo(x, y) { calls.push({ op: 'moveTo', x, y }); },
    lineTo(x, y) { calls.push({ op: 'lineTo', x, y }); },
    bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) { calls.push({ op: 'bezierCurveTo', cp1x, cp1y, cp2x, cp2y, x, y }); },
    fillText(text, x, y) { calls.push({ op: 'fillText', text, x, y }); },
    translate(x, y) { calls.push({ op: 'translate', x, y }); },
    scale(x, y) { calls.push({ op: 'scale', x, y }); },
    fillRect(x, y, w, h) { calls.push({ op: 'fillRect', x, y, w, h }); },
  };
}

test('CartographCanvasPipeline exports public API functions', () => {
  assert.equal(typeof CartographCanvasPipeline.renderGrid, 'function');
  assert.equal(typeof CartographCanvasPipeline.renderClusterWatermarks, 'function');
  assert.equal(typeof CartographCanvasPipeline.renderPipelineGuides, 'function');
  assert.equal(typeof CartographCanvasPipeline.renderEdges, 'function');
  assert.equal(typeof CartographCanvasPipeline.renderCards, 'function');
  assert.equal(typeof CartographCanvasPipeline.executePipeline, 'function');
});

test('renderGrid draws batched world dot grid based on camera view', () => {
  const ctx = createMockContext();
  const camera = { x: 0, y: 0, zoom: 1 };
  CartographCanvasPipeline.renderGrid(ctx, camera, 200, 200);

  assert.ok(ctx.calls.includes('beginPath'));
  assert.ok(ctx.calls.includes('fill'));
  const rects = ctx.calls.filter(c => c.op === 'rect');
  assert.ok(rects.length > 0, 'Grid dots should be rendered');
});

test('renderClusterWatermarks draws directory bounding hulls in cluster mode', () => {
  const ctx = createMockContext();
  const nodes = [
    { path: 'app/main.js', x: 100, y: 100 },
    { path: 'app/shell.js', x: 200, y: 200 },
  ];
  CartographCanvasPipeline.renderClusterWatermarks(ctx, nodes, 'force', null);
  assert.ok(ctx.calls.includes('save'));
  assert.ok(ctx.calls.includes('restore'));
  const hulls = ctx.calls.filter(c => c.op === 'roundRect');
  assert.ok(hulls.length > 0, 'Directory cluster watermark hull should be drawn');
});

test('executePipeline coordinates all passes sequentially', () => {
  const ctx = createMockContext();
  const graph = {
    nodes: [{ path: 'a.js', x: 0, y: 0, label: 'a.js', layer: 'core', loc: 10, totalImpact: 1 }],
    edges: [],
    getNode: (p) => graph.nodes.find(n => n.path === p),
  };
  const camera = { x: 0, y: 0, zoom: 1 };

  CartographCanvasPipeline.executePipeline({
    ctx,
    width: 500,
    height: 500,
    graph,
    camera,
    layoutMode: 'dag-lr',
    selectedFile: null,
    hoveredFile: null,
    folderFilter: null,
    simulateBreakingChange: false,
  });

  assert.ok(ctx.calls.includes('save'));
  assert.ok(ctx.calls.includes('restore'));
});
