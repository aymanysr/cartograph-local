const test = require('node:test');
const assert = require('node:assert/strict');
const CartographPalette = require('../lib/cartograph-palette.js');

test('CartographPalette exports public API functions and constants', () => {
  assert.equal(typeof CartographPalette.comparePalettePaths, 'function');
  assert.equal(typeof CartographPalette.rankFilePath, 'function');
  assert.equal(typeof CartographPalette.queryPalette, 'function');
  assert.equal(typeof CartographPalette.createPaletteEngine, 'function');
  assert.equal(CartographPalette.DEFAULT_MAX_RESULTS, 50);
});

test('rankFilePath ranks exact, basename prefix, substring, and unicode subsequence matches', () => {
  assert.equal(CartographPalette.rankFilePath('main.ts', 'src/main.ts'), 1);
  assert.equal(CartographPalette.rankFilePath('src/main.ts', 'src/main.ts'), 0);
  assert.equal(CartographPalette.rankFilePath('ain', 'src/main.ts'), 2);
  assert.equal(CartographPalette.rankFilePath('smn', 'src/main.ts'), 3);
  assert.equal(CartographPalette.rankFilePath('xyz', 'src/main.ts'), -1);

  // Supplementary Unicode subsequence match
  assert.equal(CartographPalette.rankFilePath('😀b', 'src/😀_beta.js'), 3);
  assert.equal(CartographPalette.rankFilePath('😀z', 'src/😀_beta.js'), -1);
});

test('comparePalettePaths compares Unicode code points deterministically', () => {
  const paths = [
    'z/Same.js',
    'A/Same.js',
    '!/Same.js',
    'a/same.js',
    '😀/same.js',
    '\uE000/same.js',
  ];
  const sorted = [...paths].sort(CartographPalette.comparePalettePaths);
  assert.deepEqual(sorted, [
    '!/Same.js',
    'A/Same.js',
    'a/same.js',
    'z/Same.js',
    '\uE000/same.js',
    '😀/same.js',
  ]);
});

test('queryPalette queries actions and files with deterministic order and capping', () => {
  const actions = [
    { id: 'view-map', label: 'Open Map', available: true },
    { id: 'view-evals', label: 'Open Evals', available: true },
    { id: 'isolate', label: 'Isolate impact', available: false, reason: 'Select a file' },
  ];
  const files = [
    { path: 'src/app.ts' },
    { path: 'src/auth.ts' },
    { path: 'src/db.ts' },
  ];

  // Commands mode includes actions and files
  const cmdResult = CartographPalette.queryPalette('open', 'commands', {
    getActions: () => actions,
    getFiles: () => files,
  });
  assert.equal(cmdResult.matchCount, 2);
  assert.equal(cmdResult.results[0].id, 'view-map');
  assert.equal(cmdResult.results[1].id, 'view-evals');

  // Files mode excludes actions
  const filesResult = CartographPalette.queryPalette('', 'files', {
    getActions: () => actions,
    getFiles: () => files,
  });
  assert.equal(filesResult.matchCount, 3);
  assert.ok(filesResult.results.every(r => r.kind === 'file'));

  // Capping
  const manyFiles = Array.from({ length: 70 }, (_, i) => ({ path: `file${i}.js` }));
  const capped = CartographPalette.queryPalette('', 'files', {
    getActions: () => [],
    getFiles: () => manyFiles,
    maxResults: 50,
  });
  assert.equal(capped.matchCount, 70);
  assert.equal(capped.results.length, 50);
});

test('createPaletteEngine encapsulates state, searches, and keyboard navigation with circular wrap-around', () => {
  const actions = [
    { id: 'act-1', label: 'First Action', available: true },
    { id: 'act-2', label: 'Disabled Action', available: false, reason: 'unavailable' },
    { id: 'act-3', label: 'Third Action', available: true },
  ];
  const files = [{ path: 'main.js' }];

  const engine = CartographPalette.createPaletteEngine({
    getActions: () => actions,
    getFiles: () => files,
  });

  const { results, activeIndex } = engine.search('', 'commands');
  assert.equal(results.length, 4);
  assert.equal(activeIndex, 0);
  assert.equal(engine.getActiveItem().id, 'act-1');

  // Navigate down - should skip act-2 (index 1 is disabled) and land on act-3 (index 2)
  engine.navigate('down');
  assert.equal(engine.getActiveIndex(), 2);
  assert.equal(engine.getActiveItem().id, 'act-3');

  // Navigate down - lands on main.js (index 3)
  engine.navigate('down');
  assert.equal(engine.getActiveIndex(), 3);
  assert.equal(engine.getActiveItem().id, 'file-main.js');

  // Navigate down - wraps around back to index 0 (act-1)
  engine.navigate('down');
  assert.equal(engine.getActiveIndex(), 0);

  // Navigate up - wraps backwards to index 3 (main.js)
  engine.navigate('up');
  assert.equal(engine.getActiveIndex(), 3);
});
