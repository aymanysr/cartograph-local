'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const fs = require('node:fs');
const vm = require('node:vm');

const CartographParser = require('../lib/cartograph-parser.js');
const CartographLayouts = require('../lib/cartograph-layouts.js');

function loadPresets() {
  const ctx = vm.createContext({});
  const code = fs.readFileSync('app/cartograph-preset-repos.js', 'utf8') + '\n;PRESET_REPOS;';
  return vm.runInContext(code, ctx);
}

const PRESET_REPOS = loadPresets();

test('getEffectiveDirectory extracts meaningful directories and skips src/', () => {
  assert.equal(CartographLayouts.getEffectiveDirectory('package.json'), 'root');
  assert.equal(CartographLayouts.getEffectiveDirectory('src/lib/db.ts'), 'lib');
  assert.equal(CartographLayouts.getEffectiveDirectory('src/app/page.tsx'), 'app');
  assert.equal(CartographLayouts.getEffectiveDirectory('lib/parser.js'), 'lib');
  assert.equal(CartographLayouts.getEffectiveDirectory('test/ui.test.js'), 'test');
});

test('computeTopologicalRanks handles cycles without rank explosion', () => {
  const nodes = [
    { path: 'a.js' },
    { path: 'b.js' },
    { path: 'c.js' }
  ];
  // Cycle: a -> b -> a, plus b -> c
  const edges = [
    { source: 'a.js', target: 'b.js' },
    { source: 'b.js', target: 'a.js' },
    { source: 'b.js', target: 'c.js' }
  ];
  const ranks = CartographLayouts.computeTopologicalRanks(nodes, edges);
  for (const [path, r] of ranks.entries()) {
    assert.ok(r <= nodes.length, `rank ${r} exploded for ${path}`);
  }
});

test('computeTopologicalLR is completely deterministic', () => {
  for (const preset of Object.values(PRESET_REPOS)) {
    const graph = CartographParser.parseRepository(preset.files);
    CartographLayouts.computeTopologicalLR(graph.nodes, graph.edges);
    const coords1 = JSON.stringify(graph.nodes.map(n => [n.x, n.y]));

    CartographLayouts.computeTopologicalLR(graph.nodes, graph.edges);
    const coords2 = JSON.stringify(graph.nodes.map(n => [n.x, n.y]));

    assert.equal(coords1, coords2, `Nondeterministic LR layout for preset ${preset.name}`);
  }
});

test('all preset layouts have zero card collisions in LR, TB, and Cluster modes', () => {
  for (const preset of Object.values(PRESET_REPOS)) {
    const graph = CartographParser.parseRepository(preset.files);

    // Test LR
    CartographLayouts.computeTopologicalLR(graph.nodes, graph.edges);
    for (let i = 0; i < graph.nodes.length; i++) {
      for (let j = i + 1; j < graph.nodes.length; j++) {
        const a = CartographLayouts.getGraphNodeBounds(graph.nodes[i]);
        const b = CartographLayouts.getGraphNodeBounds(graph.nodes[j]);
        const overlap = a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
        assert.ok(!overlap, `Overlap in LR layout: ${graph.nodes[i].path} and ${graph.nodes[j].path}`);
      }
    }

    // Test TB
    CartographLayouts.computeTopologicalTB(graph.nodes, graph.edges);
    for (let i = 0; i < graph.nodes.length; i++) {
      for (let j = i + 1; j < graph.nodes.length; j++) {
        const a = CartographLayouts.getGraphNodeBounds(graph.nodes[i]);
        const b = CartographLayouts.getGraphNodeBounds(graph.nodes[j]);
        const overlap = a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
        assert.ok(!overlap, `Overlap in TB layout: ${graph.nodes[i].path} and ${graph.nodes[j].path}`);
      }
    }

    // Test Cluster Box
    CartographLayouts.computeDirectoryClusterBox(graph.nodes, graph.edges);
    for (let i = 0; i < graph.nodes.length; i++) {
      for (let j = i + 1; j < graph.nodes.length; j++) {
        const a = CartographLayouts.getGraphNodeBounds(graph.nodes[i]);
        const b = CartographLayouts.getGraphNodeBounds(graph.nodes[j]);
        const overlap = a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
        assert.ok(!overlap, `Overlap in Cluster layout: ${graph.nodes[i].path} and ${graph.nodes[j].path}`);
      }
    }
  }
});
