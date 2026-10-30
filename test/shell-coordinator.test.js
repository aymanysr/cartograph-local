const test = require('node:test');
const assert = require('node:assert/strict');
const CartographShellCoordinator = require('../lib/cartograph-shell-coordinator.js');

test('CartographShellCoordinator exports public API functions', () => {
  assert.equal(typeof CartographShellCoordinator.computeActionRegistry, 'function');
  assert.equal(typeof CartographShellCoordinator.computePaletteNavigation, 'function');
  assert.equal(typeof CartographShellCoordinator.parseKeyboardShortcut, 'function');
  assert.equal(typeof CartographShellCoordinator.computeResponsiveLayout, 'function');
});

test('computeActionRegistry derives available and disabled actions based on state', () => {
  const emptyState = {
    graph: { nodes: [], edges: [], cycles: [] },
    selectedFile: null,
    layerFilter: 'all',
    graphLayout: 'dag-lr',
    isolateBlastRadius: false,
    simulateBreakingChange: false,
    folderFilter: null,
  };

  const emptyActions = CartographShellCoordinator.computeActionRegistry(emptyState);
  assert.ok(Array.isArray(emptyActions));
  
  const fitAction = emptyActions.find(a => a.id === 'fit');
  assert.ok(fitAction);
  assert.equal(fitAction.available, false);
  assert.match(fitAction.reason, /Load files/);

  const isolateAction = emptyActions.find(a => a.id === 'isolate');
  assert.ok(isolateAction);
  assert.equal(isolateAction.available, false);
  assert.match(isolateAction.reason, /Select a file/);

  const populatedState = {
    graph: {
      nodes: [
        { path: 'src/index.js', folder: 'src' },
        { path: 'src/utils.js', folder: 'src' }
      ],
      edges: [{ source: 'src/index.js', target: 'src/utils.js' }],
      cycles: [['src/index.js', 'src/utils.js', 'src/index.js']]
    },
    selectedFile: 'src/index.js',
    layerFilter: 'all',
    graphLayout: 'dag-lr',
    isolateBlastRadius: true,
    simulateBreakingChange: false,
    folderFilter: 'src',
  };

  const popActions = CartographShellCoordinator.computeActionRegistry(populatedState);
  const popFit = popActions.find(a => a.id === 'fit');
  assert.equal(popFit.available, true);

  const popIsolate = popActions.find(a => a.id === 'isolate');
  assert.equal(popIsolate.available, true);
  assert.match(popIsolate.label, /on/);

  const cycleAction = popActions.find(a => a.id === 'cycle-guide');
  assert.ok(cycleAction);
  assert.match(cycleAction.label, /1 cycle/);
});

test('computePaletteNavigation handles arrow navigation skipping unavailable items and wrapping', () => {
  const results = [
    { id: '1', available: true },
    { id: '2', available: false },
    { id: '3', available: true },
    { id: '4', available: true }
  ];

  // Moving down from 0 (index 0 -> index 2, skipping index 1)
  const nextDown = CartographShellCoordinator.computePaletteNavigation(results, 0, 'ArrowDown');
  assert.equal(nextDown, 2);

  // Moving down from 2 -> 3
  const nextDown2 = CartographShellCoordinator.computePaletteNavigation(results, 2, 'ArrowDown');
  assert.equal(nextDown2, 3);

  // Moving down from 3 wraps to 0
  const wrapDown = CartographShellCoordinator.computePaletteNavigation(results, 3, 'ArrowDown');
  assert.equal(wrapDown, 0);

  // Moving up from 0 wraps to 3
  const wrapUp = CartographShellCoordinator.computePaletteNavigation(results, 0, 'ArrowUp');
  assert.equal(wrapUp, 3);

  // Moving up from 2 skips unavailable 1 to 0
  const nextUp = CartographShellCoordinator.computePaletteNavigation(results, 2, 'ArrowUp');
  assert.equal(nextUp, 0);
});

test('parseKeyboardShortcut detects Cmd/Ctrl+K and Cmd/Ctrl+P shortcuts', () => {
  assert.equal(CartographShellCoordinator.parseKeyboardShortcut({
    metaKey: true,
    key: 'k',
    isComposing: false,
  }), 'commands');

  assert.equal(CartographShellCoordinator.parseKeyboardShortcut({
    ctrlKey: true,
    key: 'p',
    isComposing: false,
  }), 'files');

  // Ignores if composing or unassisted
  assert.equal(CartographShellCoordinator.parseKeyboardShortcut({
    metaKey: false,
    ctrlKey: false,
    key: 'k',
    isComposing: false,
  }), null);

  assert.equal(CartographShellCoordinator.parseKeyboardShortcut({
    metaKey: true,
    key: 'k',
    isComposing: true,
  }), null);
});

test('computeResponsiveLayout calculates responsive flags and visibility correctly', () => {
  const mobileLayout = CartographShellCoordinator.computeResponsiveLayout(500, {
    activeView: 'explorer',
    phonePane: 'map',
    inspectorCollapsed: false,
    hasNodes: true,
    hasSelection: true,
  });

  assert.equal(mobileLayout.phone, true);
  assert.equal(mobileLayout.desktop, false);
  assert.equal(mobileLayout.showPhonePaneTabs, true);
  assert.equal(mobileLayout.showCompactMapTools, false);
  assert.equal(mobileLayout.mapRegionVisible, true);
  assert.equal(mobileLayout.fileBrowserVisible, false);

  const desktopLayout = CartographShellCoordinator.computeResponsiveLayout(1400, {
    activeView: 'explorer',
    phonePane: 'files',
    inspectorCollapsed: true,
    hasNodes: true,
    hasSelection: false,
  });

  assert.equal(desktopLayout.phone, false);
  assert.equal(desktopLayout.desktop, true);
  assert.equal(desktopLayout.showPhonePaneTabs, false);
  assert.equal(desktopLayout.inspectorDisplay, 'none');
  assert.equal(desktopLayout.btnSimulateDisabled, true);
});
