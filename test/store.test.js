const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createStoreHarness() {
  const code = fs.readFileSync('app/cartograph-graph-state.js', 'utf8');
  const sandbox = {
    console,
    document: {
      getElementById: () => null,
      querySelectorAll: () => [],
    },
    window: {},
    CartographParser: {
      createGraph: (g) => ({
        ...g,
        getNode: (p) => g.nodes.find(n => n.path === p),
        hasNode: (p) => g.nodes.some(n => n.path === p),
      }),
    },
    CartographCamera: {
      centerOnNode: (cam) => cam,
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.CartographStore;
}

test('CartographStore provides state access and subscription notifications', () => {
  const store = createStoreHarness();
  assert.ok(store);
  assert.equal(typeof store.subscribe, 'function');
  assert.equal(typeof store.dispatch, 'function');
  assert.equal(typeof store.selectFile, 'function');

  const events = [];
  const unsubscribe = store.subscribe((state, event) => {
    events.push({ selected: state.selectedFile, event });
  });

  store.dispatch({ type: 'SELECT_FILE', filePath: 'src/custom.ts', pan: false });
  assert.equal(store.getState().selectedFile, 'src/custom.ts');
  assert.equal(events.length, 1);
  assert.equal(events[0].event.type, 'selectFile');
  assert.equal(events[0].event.filePath, 'src/custom.ts');

  // Unsubscribe stops notifications
  unsubscribe();
  store.dispatch({ type: 'SELECT_FILE', filePath: 'src/other.ts', pan: false });
  assert.equal(events.length, 1);
  assert.equal(store.getState().selectedFile, 'src/other.ts');
});

test('CartographStore dispatch routes folder focus, layout, and simulation actions', () => {
  const store = createStoreHarness();
  const events = [];
  store.subscribe((state, event) => events.push(event));

  store.dispatch({ type: 'SET_FOLDER_FOCUS', folder: 'src/auth' });
  assert.equal(store.getState().folderFilter, 'src/auth');

  store.dispatch({ type: 'CLEAR_FOLDER_FOCUS' });
  assert.equal(store.getState().folderFilter, null);

  store.dispatch({ type: 'SET_LAYOUT', mode: 'cluster' });
  assert.equal(store.getState().graphLayout, 'cluster');

  store.dispatch({ type: 'SET_SIMULATION', breaking: true, isolate: true });
  assert.equal(store.getState().simulateBreakingChange, true);
  assert.equal(store.getState().isolateBlastRadius, true);

  assert.ok(events.some(e => e.type === 'filter'));
  assert.ok(events.some(e => e.type === 'layout'));
  assert.ok(events.some(e => e.type === 'simulation'));
});

test('CartographStore tolerates listener exceptions without disrupting other subscribers', () => {
  const store = createStoreHarness();
  let received = false;

  store.subscribe(() => {
    throw new Error('Broken listener');
  });

  store.subscribe(() => {
    received = true;
  });

  assert.doesNotThrow(() => {
    store.dispatch({ type: 'SELECT_FILE', filePath: 'safe.ts' });
  });
  assert.equal(received, true);
});
