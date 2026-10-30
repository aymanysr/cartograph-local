const test = require('node:test');
const assert = require('node:assert/strict');
const CartographViewModel = require('../lib/cartograph-view-model.js');

test('CartographViewModel exports public API', () => {
  assert.equal(typeof CartographViewModel.computeFileListViewModel, 'function');
  assert.equal(typeof CartographViewModel.computeInspectorViewModel, 'function');
  assert.equal(typeof CartographViewModel.computeHeaderMetrics, 'function');
  assert.equal(typeof CartographViewModel.getLayerMeta, 'function');
});

test('computeFileListViewModel filters, searches, and groups by folder', () => {
  const sampleGraph = {
    nodes: [
      { path: 'app/main.js', label: 'main.js', folder: 'app', layer: 'ui', totalImpact: 5, inDegree: 0, exports: ['start'] },
      { path: 'lib/db.js', label: 'db.js', folder: 'lib', layer: 'db', totalImpact: 12, inDegree: 2, exports: ['query'] },
      { path: 'lib/auth.js', label: 'auth.js', folder: 'lib', layer: 'agent', totalImpact: 8, inDegree: 1, exports: ['login'] },
      { path: 'root.js', label: 'root.js', folder: '/', layer: 'ui', totalImpact: 1, inDegree: 0, exports: [] },
    ],
  };

  // 1. Sort by blast radius descending
  const blastVm = CartographViewModel.computeFileListViewModel(sampleGraph, {
    fileSortMode: 'blast',
    layerFilter: 'all',
  });
  assert.equal(blastVm.filteredNodes.length, 4);
  assert.equal(blastVm.filteredNodes[0].path, 'lib/db.js');
  assert.equal(blastVm.filteredNodes[0].totalImpact, 12);
  assert.equal(blastVm.filteredNodes[1].path, 'lib/auth.js');

  // 2. Filter by folder
  const folderVm = CartographViewModel.computeFileListViewModel(sampleGraph, {
    folderFilter: 'lib',
    fileSortMode: 'path',
  });
  assert.equal(folderVm.filteredNodes.length, 2);
  assert.deepEqual(folderVm.filteredNodes.map(n => n.path), ['lib/auth.js', 'lib/db.js']);
  assert.equal(folderVm.folderGroups.length, 1);
  assert.equal(folderVm.folderGroups[0].folder, 'lib');
  assert.equal(folderVm.folderGroups[0].count, 2);
  assert.equal(folderVm.folderGroups[0].isFocused, true);

  // 3. Filter by entry points
  const entryVm = CartographViewModel.computeFileListViewModel(sampleGraph, {
    layerFilter: 'entry',
  });
  assert.equal(entryVm.filteredNodes.length, 2);
  assert.deepEqual(entryVm.filteredNodes.map(n => n.path), ['app/main.js', 'root.js']);

  // 4. Search query
  const searchVm = CartographViewModel.computeFileListViewModel(sampleGraph, {
    searchQuery: 'query',
  });
  assert.equal(searchVm.filteredNodes.length, 1);
  assert.equal(searchVm.filteredNodes[0].path, 'lib/db.js');
});

test('computeInspectorViewModel formats metrics, flow, and circular warnings', () => {
  const sampleGraph = {
    nodes: [
      {
        path: 'lib/db.js',
        label: 'db.js',
        layer: 'db',
        loc: 150,
        exports: ['query', 'connect'],
        outboundEdges: ['lib/config.js'],
        hop1Files: ['app/main.js'],
        hop2Files: ['app/routes.js'],
        totalImpact: 2,
        inDegree: 1,
      },
      { path: 'lib/config.js', totalImpact: 1 },
    ],
    cycles: [['lib/db.js', 'lib/config.js']],
  };

  // Selection present
  const vm = CartographViewModel.computeInspectorViewModel(sampleGraph.nodes[0], sampleGraph);
  assert.equal(vm.hasSelection, true);
  assert.equal(vm.path, 'lib/db.js');
  assert.equal(vm.layerLabel, 'DB & Core');
  assert.equal(vm.impactPercent, '100.0');
  assert.equal(vm.role, 'cycle');
  assert.equal(vm.isCycle, true);
  assert.equal(vm.cycleCount, 2);
  assert.equal(vm.hop1Count, 1);
  assert.equal(vm.hop2Count, 1);
  assert.equal(vm.outboundCount, 1);

  // Empty selection
  const emptyVm = CartographViewModel.computeInspectorViewModel(null, sampleGraph);
  assert.equal(emptyVm.hasSelection, false);
  assert.equal(emptyVm.title, 'No file selected');
});

test('computeHeaderMetrics derives totals, hotspots, and freshness', () => {
  const sampleGraph = {
    nodes: [{ path: 'a.js', totalImpact: 5 }, { path: 'b.js', totalImpact: 10 }],
    edges: [{ source: 'a.js', target: 'b.js' }],
    cycles: [],
    getTopHubs: () => [{ path: 'b.js', totalImpact: 10 }],
  };
  const metrics = CartographViewModel.computeHeaderMetrics(sampleGraph, { kind: 'sample' });
  assert.equal(metrics.totalFiles, 2);
  assert.equal(metrics.totalEdges, 1);
  assert.equal(metrics.cyclesCount, 0);
  assert.equal(metrics.topHotspot.path, 'b.js');
  assert.equal(metrics.freshnessLabel, 'Built-in sample');
});
