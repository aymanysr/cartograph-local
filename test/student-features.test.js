const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createUiHarness() {
  const elements = new Map();
  const el = (tag = 'div') => {
    const classes = new Set();
    const attrs = new Map();
    let isModalOpen = false;
    return {
      tagName: tag.toUpperCase(),
      getClientRects() { return []; },
      value: '',
      children: [],
      textContent: '',
      innerHTML: '',
      dataset: {},
      style: {},
      disabled: false,
      classList: {
        add(c) { classes.add(c); },
        remove(c) { classes.delete(c); },
        toggle(c, force) {
          if (force === undefined) {
            if (classes.has(c)) classes.delete(c); else classes.add(c);
          } else if (force) classes.add(c);
          else classes.delete(c);
        },
        contains(c) { return classes.has(c); },
      },
      setAttribute(k, v) { attrs.set(k, String(v)); },
      getAttribute(k) { return attrs.get(k); },
      removeAttribute(k) { attrs.delete(k); },
      hasAttribute(k) { return attrs.has(k); },
      appendChild(child) { this.children.push(child); return child; },
      replaceChildren() { this.children = []; this.innerHTML = ''; },
      remove() {},
      querySelector(sel) { return null; },
      querySelectorAll(sel) { return []; },
      click() {},
      showModal() { isModalOpen = true; },
      close() { isModalOpen = false; },
      get open() { return isModalOpen; },
    };
  };

  const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    URLSearchParams,
    window: { addEventListener() {}, innerWidth: 1024 },
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, el());
        return elements.get(id);
      },
      querySelectorAll(sel) {
        if (sel === 'button') {
          return ['btnInspectorAsk', 'btnInspectorCenter', 'btnInspectorSimulate', 'btnInspectorCopyPath'].map(id => {
            if (!elements.has(id)) elements.set(id, el('button'));
            return elements.get(id);
          });
        }
        return [];
      },
      createElement(tag) { return el(tag); },
      body: { appendChild() {} },
    },
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    showToast() {},
  });

  for (const file of [
    'lib/cartograph-intake.js',
    'lib/cartograph-parser.js',
    'lib/cartograph-agent.js',
    'lib/cartograph-evals.js',
    'lib/cartograph-fit.js',
    'lib/cartograph-layouts.js',
    'lib/cartograph-render-math.js',
    'lib/cartograph-specs.js',
    'lib/cartograph-palette.js',
    'lib/cartograph-view-model.js',
    'lib/cartograph-canvas-pipeline.js',
    'lib/cartograph-shell-coordinator.js',
    'app/cartograph-preset-repos.js',
    'app/cartograph-graph-state.js',
    'app/cartograph-canvas-render.js',
    'app/cartograph-ui-panels.js',
    'app/cartograph-agent-evals.js',
    'app/cartograph-app-shell.js',
  ]) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }

  return {
    run: s => vm.runInContext(s, context),
    elements,
    context,
  };
}

test('Student UI Pruning: cartograph.html hides evals and break simulation from human UI', () => {
  const html = fs.readFileSync('cartograph.html', 'utf8');

  // Evals tabs and menu items must have the hidden attribute
  assert.match(html, /<button[^>]+id="navTabEvals"[^>]*hidden/, 'navTabEvals should have hidden attribute');
  assert.match(html, /<button[^>]+data-view="evals"[^>]*hidden/, 'data-view="evals" button should have hidden attribute');

  // Break Simulation buttons must have hidden attribute
  assert.match(html, /<button[^>]+id="btnSimulateBreak"[^>]*hidden/, 'btnSimulateBreak should have hidden attribute');
  assert.match(html, /<button[^>]+id="btnInspectorSimulate"[^>]*hidden/, 'btnInspectorSimulate should have hidden attribute');

  // Layer filter bar must contain Entry filter pill
  assert.match(html, /data-layer="entry"/, 'Layer filter container must include Entry pill');

  // Cycle fixer modal must exist in DOM
  assert.match(html, /<dialog[^>]+id="modalCycleFixer"/, 'Modal modalCycleFixer must exist in cartograph.html');
  assert.match(html, /id="cycleFixerContent"/, 'cycleFixerContent must exist in modalCycleFixer');
});

test('Student First-Class Entry Points: graph query, metadata, sidebar badge, and layer filtering', () => {
  const { run, elements } = createUiHarness();

  const files = [
    { path: 'src/main.ts', content: "import { runService } from './service';\nrunService();" },
    { path: 'src/service.ts', content: "import { db } from './db';\nexport function runService() { return db; }" },
    { path: 'src/db.ts', content: "export const db = 'connected';" },
  ];

  run(`state.graph = CartographParser.parseRepository(${JSON.stringify(files)});`);

  // 1. CartographGraph query methods
  assert.equal(run(`state.graph.isEntryPoint('src/main.ts')`), true);
  assert.equal(run(`state.graph.isEntryPoint('src/service.ts')`), false);
  assert.equal(run(`state.graph.isEntryPoint('src/db.ts')`), false);

  const entryPoints = run(`state.graph.getEntryPoints()`);
  assert.equal(entryPoints.length, 1);
  assert.equal(entryPoints[0].path, 'src/main.ts');

  // 2. Layer metadata
  const entryMeta = run(`getLayerMeta('entry')`);
  assert.equal(entryMeta.label, 'Entry Points');
  assert.equal(entryMeta.color, '#10B981');

  // 3. Sidebar rendering with ENTRY badge
  run(`renderFileListSidebar();`);
  const sidebarHtml = elements.get('fileListContainer').innerHTML;
  assert.match(sidebarHtml, /ENTRY/, 'Sidebar should render ENTRY badge');
  assert.match(sidebarHtml, /src\/main\.ts/, 'Sidebar should list main.ts');

  // 4. Layer filter set to 'entry'
  run(`setLayerFilter('entry'); renderFileListSidebar();`);
  assert.equal(run(`state.layerFilter`), 'entry');
  const filteredSidebarHtml = elements.get('fileListContainer').innerHTML;
  assert.match(filteredSidebarHtml, /src\/main\.ts/);
  assert.doesNotMatch(filteredSidebarHtml, /src\/service\.ts/);
  assert.doesNotMatch(filteredSidebarHtml, /src\/db\.ts/);

  // 5. Grounded module explanation for entry points
  const explanation = run(`buildGroundedModuleExplanationHtml(state.graph.getNode('src/main.ts'))`);
  assert.match(explanation, /Execution Entry Point/);
  assert.match(explanation, /No other files in the project import this module/);

  // Non-entry point does not have entry point callout
  const dbExplanation = run(`buildGroundedModuleExplanationHtml(state.graph.getNode('src/db.ts'))`);
  assert.doesNotMatch(dbExplanation, /Execution Entry Point/);

  // 6. Command palette includes entry-points action
  const actions = run(`getPaletteActions()`);
  const entryAction = actions.find(a => a.id === 'entry-points');
  assert.ok(entryAction, 'Palette should include entry-points action');
  assert.equal(entryAction.available, true);
});

test('Student Cycle Fixer Guide: interactive modal, refactoring recipe, and inspector integration', () => {
  const { run, elements } = createUiHarness();

  const cycleFiles = [
    { path: 'src/user.ts', content: "import { getOrder } from './order';\nexport const User = { id: 1 };" },
    { path: 'src/order.ts', content: "import { User } from './user';\nexport function getOrder() { return User; }" },
  ];

  run(`state.graph = CartographParser.parseRepository(${JSON.stringify(cycleFiles)});`);

  assert.equal(run(`state.graph.cycles.length`), 1);
  const cycle = run(`state.graph.cycles[0]`);
  assert.equal(cycle.length, 2);
  assert.ok(cycle.includes('src/user.ts'));
  assert.ok(cycle.includes('src/order.ts'));

  // 1. openCycleFixerModal populates dialog content and opens dialog
  run(`openCycleFixerModal(state.graph.cycles[0]);`);
  const modal = elements.get('modalCycleFixer');
  assert.equal(modal.open, true, 'Modal should be opened');

  const content = elements.get('cycleFixerContent').innerHTML;
  // Explains the runtime crash
  assert.match(content, /Why this causes bugs in your code:/);
  assert.match(content, /TypeError: \(0, func\) is not a function/);
  // Contains interactive cycle path chips
  assert.match(content, /src\/user\.ts/);
  assert.match(content, /src\/order\.ts/);
  // Contains 3-step recipe
  assert.match(content, /Find the Shared Concept/);
  assert.match(content, /Extract to a New Seam/);
  assert.match(content, /Invert the Imports/);

  // 2. closeCycleFixerModal closes dialog
  run(`closeCycleFixerModal();`);
  assert.equal(modal.open, false, 'Modal should be closed');

  // 3. Inspector panel includes Cycle Fix Guide link
  run(`state.selectedFile = 'src/user.ts'; renderInspectorPanel();`);
  const inspectorCycleBadge = elements.get('inspectorCycleBadge').innerHTML;
  assert.match(inspectorCycleBadge, /Fix Guide →/);
  assert.match(inspectorCycleBadge, /openCycleFixerModal/);

  // 4. Grounded module explanation includes Fix Guide link for cycle nodes
  const userExplanation = run(`buildGroundedModuleExplanationHtml(state.graph.getNode('src/user.ts'))`);
  assert.match(userExplanation, /Fix Guide →/);

  // 5. Palette includes cycle-guide command
  const actions = run(`getPaletteActions()`);
  const cycleAction = actions.find(a => a.id === 'cycle-guide');
  assert.ok(cycleAction, 'Palette should include cycle-guide action');
  assert.equal(cycleAction.available, true);
});

test('Student Inspector Rework: single-column causal flow, friendly labels, role cards, and pruned AI tab', () => {
  const html = fs.readFileSync('cartograph.html', 'utf8');

  // 1. Inspector tab switcher and Ask button hidden
  assert.match(html, /<div[^>]+id="inspectorTabSwitcher"[^>]*hidden/, 'inspectorTabSwitcher should have hidden attribute');
  assert.match(html, /<button[^>]+id="btnInspectorAsk"[^>]*hidden/, 'btnInspectorAsk should have hidden attribute');

  // 2. Heading displays Module Inspector and Causal Flow
  assert.match(html, /Module Inspector/, 'Inspector panel should have Module Inspector title');
  assert.match(html, /Causal Flow/, 'Inspector panel should display Causal Flow');

  // 3. Educational section headings and KPI labels
  assert.match(html, /Called by \(Direct callers\)/, 'Section heading should be Called by (Direct callers)');
  assert.match(html, /Downstream dependents \(Transitive\)/, 'Section heading should be Downstream dependents (Transitive)');
  assert.match(html, /Depends on \(Imports\)/, 'Section heading should be Depends on (Imports)');
  assert.match(html, /<label>Depends on<\/label>/, 'KPI label should be Depends on');
  assert.match(html, /<label>Direct callers<\/label>/, 'KPI label should be Direct callers');
  assert.match(html, /<label>Downstream<\/label>/, 'KPI label should be Downstream');

  // 4. File sort friendly label
  assert.match(html, /Most connected/, 'Sort button should say Most connected');

  // 5. Renders Causal Flow card and role badges
  const { run, elements } = createUiHarness();
  const files = [
    { path: 'src/main.ts', content: "import { api } from './api';\napi();" },
    { path: 'src/api.ts', content: "import { db } from './db';\nexport function api() { return db; }" },
    { path: 'src/db.ts', content: "export const db = 'connected';" },
  ];
  run(`state.graph = CartographParser.parseRepository(${JSON.stringify(files)});`);

  // Test Entry Point module
  run(`state.selectedFile = 'src/main.ts'; renderInspectorPanel();`);
  assert.match(elements.get('inspectorImpactPercent').textContent, /0 \/ 3 modules/);
  assert.match(elements.get('inspectorImpactCaption').textContent, /depend on this module directly or indirectly/);
  assert.match(elements.get('inspectorExplanationText').innerHTML, /Execution Entry Point/);
  assert.match(elements.get('inspectorExplanationText').innerHTML, /&rarr;|→/);

  // Test Leaf module (db.ts)
  run(`state.selectedFile = 'src/db.ts'; renderInspectorPanel();`);
  assert.match(elements.get('inspectorImpactPercent').textContent, /2 \/ 3 modules/);
  assert.match(elements.get('inspectorExplanationText').innerHTML, /Foundational Leaf Module/);

  // Test Internal Engine module (api.ts)
  run(`state.selectedFile = 'src/api.ts'; renderInspectorPanel();`);
  assert.match(elements.get('inspectorExplanationText').innerHTML, /Internal Engine Module/);
});

test('ADR-013: Developer Mode Isolation via URL query ?mode=dev and Causal Flow Pill interaction', () => {
  const { run, elements, context } = createUiHarness();

  // 1. By default without query params, developerMode is false
  assert.equal(Boolean(run('state.developerMode')), false);

  // 2. When location.search contains ?mode=dev, initDeveloperMode unhides controls
  context.window.location = { search: '?mode=dev' };
  run('if (typeof initDeveloperMode === "function") initDeveloperMode();');
  assert.equal(run('state.developerMode'), true);

  // 3. Causal Flow pill interaction: explanation contains clickable scrollToInspectorSection calls
  const files = [
    { path: 'src/main.ts', content: "import { api } from './api';\napi();" },
    { path: 'src/api.ts', content: "import { db } from './db';\nexport function api() { return db; }" },
    { path: 'src/db.ts', content: "export const db = 'connected';" },
  ];
  run(`state.graph = CartographParser.parseRepository(${JSON.stringify(files)});`);
  const explanation = run(`buildGroundedModuleExplanationHtml(state.graph.getNode('src/api.ts'))`);
  assert.match(explanation, /scrollToInspectorSection\('outboundListContainer'\)/);
  assert.match(explanation, /scrollToInspectorSection\('hop1ListContainer'\)/);
  assert.match(explanation, /scrollToInspectorSection\('hop2ListContainer'\)/);
});

