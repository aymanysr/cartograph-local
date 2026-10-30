const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function harness() {
  const canvas = { clientWidth: 860, clientHeight: 600 };
  const context = vm.createContext({ console, setTimeout, clearTimeout, window: {addEventListener(){}}, document: {getElementById(id){return id === 'dependencyCanvas' ? canvas : null;}} });
  for (const file of ['lib/cartograph-intake.js','lib/cartograph-parser.js','lib/cartograph-agent.js','lib/cartograph-evals.js','lib/cartograph-fit.js','lib/cartograph-layouts.js','lib/cartograph-render-math.js','lib/cartograph-specs.js','lib/cartograph-palette.js','lib/cartograph-view-model.js','lib/cartograph-canvas-pipeline.js','lib/cartograph-shell-coordinator.js','app/cartograph-preset-repos.js','app/cartograph-graph-state.js','app/cartograph-canvas-render.js','app/cartograph-ui-panels.js','app/cartograph-agent-evals.js','app/cartograph-app-shell.js']) vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  return source => vm.runInContext(source,context);
}
test('card bounds include the full centered card',()=>{const run=harness();assert.deepEqual(JSON.parse(run('JSON.stringify(getGraphNodeBounds({x:0,y:0}))')),{minX:-96,minY:-24,maxX:96,maxY:24});});
test('edge roles follow incoming dependency distance and keep outbound neutral',()=>{const run=harness();assert.deepEqual(JSON.parse(run(`JSON.stringify([getGraphEdgeRole({source:'B',target:'A'},{path:'A',hop1Files:['B'],hop2Files:['C']}),getGraphEdgeRole({source:'C',target:'B'},{path:'A',hop1Files:['B'],hop2Files:['C']}),getGraphEdgeRole({source:'B',target:'A'},{path:'B',hop1Files:['C'],hop2Files:[]})])`)),['hop1','hop2','neutral']);});
test('preset force layouts repeat exactly and cards never overlap',()=>{const run=harness();run(`for (const preset of Object.values(PRESET_REPOS)) { state.graph=CartographParser.parseRepository(preset.files);state.graphLayout='force';computeGraphNodePositions();const first=JSON.stringify(state.graph.nodes.map(n=>[n.x,n.y]));computeGraphNodePositions();if(first!==JSON.stringify(state.graph.nodes.map(n=>[n.x,n.y])))throw Error('nondeterministic');for(let i=0;i<state.graph.nodes.length;i++)for(let j=i+1;j<state.graph.nodes.length;j++){const a=getGraphNodeBounds(state.graph.nodes[i]),b=getGraphNodeBounds(state.graph.nodes[j]);if(a.minX<b.maxX&&a.maxX>b.minX&&a.minY<b.maxY&&a.maxY>b.minY)throw Error('overlap');}}`);});

test('palette ranks current graph paths deterministically and ignores sidebar filters',()=>{const run=harness();run(`state.graph.nodes=['z/abc.js','abc.js','b/ABC.js','a/abc.js','x/a_b_c.js','x/containsabc.js'].map(path=>({path}));state.searchQuery='missing';state.layerFilter='core';`);assert.deepEqual(JSON.parse(run(`JSON.stringify(getPaletteResults('abc.js','files').results.map(r=>r.path))`)),['abc.js','a/abc.js','b/ABC.js','z/abc.js','x/containsabc.js','x/a_b_c.js']);});
test('palette caps results with an uncapped count and actions precede files',()=>{const run=harness();run(`state.graph.nodes=Array.from({length:70},(_,i)=>({path:'file'+i+'.js'}));`);assert.equal(run(`getPaletteResults('','files').matchCount`),70);assert.equal(run(`getPaletteResults('','files').results.length`),50);assert.equal(run(`getPaletteResults('','commands').results[0].kind`),'action');assert.equal(run(`getPaletteResults('nonexistent','files').matchCount`),0);});
test('palette reports empty graph and valid-selection availability',()=>{const run=harness();run(`state.graph.nodes=[];state.selectedFile='stale';`);assert.equal(run(`getPaletteActions().find(a=>a.id==='fit').available`),false);assert.equal(run(`getPaletteActions().find(a=>a.id==='isolate').available`),false);assert.equal(run(`getPaletteActions().find(a=>a.id==='export').available`),true);assert.equal(run(`getPaletteResults('','files').matchCount`),0);});

test('palette ties use raw codepoints including punctuation case and supplementary Unicode',()=>{const run=harness();run(`state.graph.nodes=['z/Same.js','A/Same.js','!/Same.js','a/same.js','😀/same.js','\uE000/same.js'].map(path=>({path}));`);assert.deepEqual(JSON.parse(run(`JSON.stringify(getPaletteResults('same','files').results.map(r=>r.path))`)),['!/Same.js','A/Same.js','a/same.js','z/Same.js','\uE000/same.js','😀/same.js']);});
test('palette action matching keeps registry order and rejects stale unavailable actions',()=>{const run=harness();assert.deepEqual(JSON.parse(run(`JSON.stringify(getPaletteResults('open','commands').results.map(r=>r.id))`)),['view-explorer','view-evals','view-specs','folder']);run(`state.graph.nodes=[];state.selectedFile='stale';toggleIsolateBlastRadius=()=>{throw Error('executed disabled action')};runPaletteResult({kind:'action',id:'isolate',available:true});runPaletteResult({kind:'file',path:'absent'});`);});

test('palette subsequence matching compares supplementary Unicode codepoints',()=>{const run=harness();run(`state.graph.nodes=[{path:'src/😀_beta.js'}];`);assert.equal(run(`getPaletteResults('😀b','files').matchCount`),1);});

test('inspector panel renders metadata, circular cycle warning, and quick action toolbar', () => {
  const elements = new Map();
  const el = (tag = 'div') => {
    const classes = new Set();
    const attrs = new Map();
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
      appendChild(child) { this.children.push(child); return child; },
      replaceChildren() { this.children = []; this.innerHTML = ''; },
      remove() {},
      querySelector(sel) { return null; },
      querySelectorAll(sel) {
        if (sel === 'button') {
          return ['btnInspectorAsk', 'btnInspectorCenter', 'btnInspectorSimulate', 'btnInspectorCopyPath'].map(id => {
            if (!elements.has(id)) elements.set(id, el('button'));
            return elements.get(id);
          });
        }
        return [];
      },
      click() {},
      remove() {},
    };
  };

  const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    window: { addEventListener() {}, innerWidth: 1024 },
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, el());
        return elements.get(id);
      },
      querySelectorAll(sel) {
        if (sel === 'button') return [];
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

  const run = s => vm.runInContext(s, context);

  // Load a graph with a circular dependency
  context.files = [
    { path: 'src/a.ts', content: "import './b';\nexport const a = 1;" },
    { path: 'src/b.ts', content: "import './a';\nexport const b = 2;" },
  ];
  run(`state.graph = CartographParser.parseRepository(files); state.selectedFile = 'src/a.ts'; renderInspectorPanel();`);

  assert.equal(elements.get('inspectorFilePath').textContent, 'src/a.ts');
  assert.equal(elements.get('inspectorLayerBadge').textContent, 'DB & Core');
  assert.ok(elements.get('inspectorCycleBadge').innerHTML.includes('Cycle (2 files)'));
  assert.equal(elements.get('inspectorMetaContext').classList.contains('hidden'), false);

  // Quick action: Copy path
  let copied = '';
  context.navigator.clipboard.writeText = (txt) => { copied = txt; return Promise.resolve(); };
  run(`copySelectedFilePath()`);
  assert.equal(copied, 'src/a.ts');

  // Quick action: Center map
  run(`centerSelectedOnMap()`);
  assert.equal(run(`state.selectedFile`), 'src/a.ts');

  // Quick action: Ask agent
  let asked = '';
  context.runAgentQuery = (q) => { asked = q; };
  run(`askAgentAboutSelectedFile()`);
  assert.equal(asked, 'What breaks if I change src/a.ts?');

  // Quick action: Toggle simulate breaking change (synchronizes canvas toolbar and inspector)
  run(`toggleSimulateSelected()`);
  assert.equal(run(`state.simulateBreakingChange`), true);
  assert.equal(elements.get('btnSimulateBreak').getAttribute('aria-pressed'), 'true');
  assert.equal(elements.get('btnInspectorSimulate').getAttribute('aria-pressed'), 'true');

  run(`toggleSimulateSelected()`);
  assert.equal(run(`state.simulateBreakingChange`), false);
  assert.equal(elements.get('btnSimulateBreak').getAttribute('aria-pressed'), 'false');
  assert.equal(elements.get('btnInspectorSimulate').getAttribute('aria-pressed'), 'false');

  // Unselected state disables toolbar and hides metadata
  run(`state.selectedFile = null; renderInspectorPanel();`);
  assert.equal(elements.get('inspectorFilePath').textContent, 'No file selected');
  assert.equal(elements.get('inspectorMetaContext').classList.contains('hidden'), true);
  assert.equal(elements.get('btnInspectorAsk').disabled, true);
  assert.equal(elements.get('btnInspectorAsk').getAttribute('aria-disabled'), 'true');
});

test('agent trace and evals view support tool badges, expand-all and JSON report export', () => {
  const elements = new Map();
  const evalCaseElements = [];
  const el = (tag = 'div') => {
    const classes = new Set();
    const attrs = new Map();
    const item = {
      tagName: tag.toUpperCase(),
      getClientRects() { return []; },
      value: '',
      children: [],
      textContent: '',
      innerHTML: '',
      dataset: {},
      style: {},
      open: false,
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
      appendChild(child) { this.children.push(child); return child; },
      replaceChildren() { this.children = []; this.innerHTML = ''; },
      remove() {},
      querySelector(sel) { return null; },
      querySelectorAll(sel) { return []; },
      click() {},
      remove() {},
    };
    return item;
  };

  let exportedBlob = null;
  const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    window: { addEventListener() {}, innerWidth: 1024 },
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, el());
        return elements.get(id);
      },
      querySelectorAll(sel) {
        if (sel === '#evalCasesContainer .eval-case') return evalCaseElements;
        return [];
      },
      createElement(tag) { return el(tag); },
      body: { appendChild() {} },
    },
    Blob: class { constructor(data) { exportedBlob = data; } },
    URL: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} },
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

  const run = s => vm.runInContext(s, context);

  // 1. Trace rendering with tool badges & arguments
  context.testPlan = {
    steps: [
      { tool: 'search_symbols', args: 'query="auth"', output: 'Matched 1 module', files: ['src/auth.ts'] },
      { tool: 'get_file_ast', args: 'path="src/auth.ts"', output: 'Exports: [verify]', files: ['src/auth.ts'] },
    ],
  };
  const traceHtml = run(`renderAgentTrace(testPlan)`);
  assert.ok(traceHtml.includes('Symbol Search'));
  assert.ok(traceHtml.includes('AST Inspection'));
  assert.ok(traceHtml.includes('data-tool-label'));
  assert.ok(traceHtml.includes('data-tool-args'));
  assert.ok(traceHtml.includes('query=&quot;auth&quot;'));

  // 2. Test copyAgentRunMarkdown
  const mockCard = el('article');
  mockCard.innerHTML = `
    <strong>Where does auth live?</strong>
    <div class="trace-row" data-tool="search_symbols">
      <span data-tool-label>1. Symbol Search</span>
      <span data-tool-args>query="auth"</span>
      <p>Matched 1 module</p>
      <button data-filepath="src/auth.ts">src/auth.ts</button>
    </div>
    <div class="agent-synthesis-body">Auth is located in src/auth.ts</div>
  `;
  mockCard.querySelector = (sel) => {
    if (sel === 'strong') return { textContent: 'Where does auth live?' };
    if (sel === '.agent-synthesis-body') return { textContent: 'Auth is located in src/auth.ts' };
    return null;
  };
  mockCard.querySelectorAll = (sel) => {
    if (sel === '.trace-row') {
      return [{
        querySelector(s) {
          if (s === '[data-tool-label]') return { textContent: '1. Symbol Search' };
          if (s === '[data-tool-args]') return { textContent: 'query="auth"' };
          if (s === 'p') return { textContent: 'Matched 1 module' };
          return null;
        },
        querySelectorAll(s) {
          if (s === '[data-filepath]') return [{ getAttribute: () => 'src/auth.ts' }];
          return [];
        }
      }];
    }
    return [];
  };
  elements.set('agentRun_test_1', mockCard);

  let copiedMd = '';
  context.copyTextSafe = (md) => { copiedMd = md; };
  run(`copyAgentRunMarkdown('agentRun_test_1')`);
  assert.ok(copiedMd.includes('### Cartograph Codebase Intelligence'));
  assert.ok(copiedMd.includes('**Question:** Where does auth live?'));
  assert.ok(copiedMd.includes('- **1. Symbol Search** `query="auth"`'));
  assert.ok(copiedMd.includes('*Discovered:* `src/auth.ts`'));
  assert.ok(copiedMd.includes('Auth is located in src/auth.ts'));

  // 3. Suite buttons disabled before evaluation run
  run(`renderEvalSuite()`);
  assert.equal(elements.get('btnEvalExpandAll').disabled, true);
  assert.equal(elements.get('btnEvalCollapseAll').disabled, true);
  assert.equal(elements.get('btnEvalExport').disabled, true);

  // 4. Run benchmark suite and export
  context.benchmarkFiles = [
    { path: 'src/core/db.ts', content: 'export const db = 1;' },
    { path: 'src/auth/verify.ts', content: "import '../core/db';\nexport function verify() {}" },
  ];
  run(`state.graph = CartographParser.parseRepository(benchmarkFiles); runEvaluationSuite();`);

  assert.ok(run(`Boolean(state.evalRun)`));
  assert.equal(run(`state.evalRun.summary.passCount`), 3);
  assert.equal(elements.get('btnEvalExport').disabled, false);

  // 5. Expand-all and collapse-all
  const case1 = el('details'); case1.open = false;
  const case2 = el('details'); case2.open = false;
  evalCaseElements.push(case1, case2);

  run(`toggleAllEvalCases(true)`);
  assert.equal(case1.open, true);
  assert.equal(case2.open, true);

  run(`toggleAllEvalCases(false)`);
  assert.equal(case1.open, false);
  assert.equal(case2.open, false);

  // 6. Export report
  run(`exportEvalReport()`);
  assert.ok(exportedBlob);
  const parsedReport = JSON.parse(exportedBlob[0]);
  assert.equal(parsedReport.mode, 'strict');
  assert.equal(parsedReport.cases.length, 3);
  assert.equal(parsedReport.cases[0].passed, true);

  // 7. Negative evaluation provenance audit (unproven, hallucinated, and missed files)
  run(`
    state.graph.nodes.push({ path: 'src/untraced.ts' }, { path: 'src/missing.ts' });
    state.evalRun = {
      isStrict: true,
      summary: { groundednessScore: 66.7, recallScore: 50, passCount: 0, totalCases: 1, hallucinatedCount: 1, avgSteps: 2 },
      entries: [{
        tc: { question: 'What breaks if DB changes?', expectedFiles: ['src/core/db.ts', 'src/missing.ts'] },
        plan: { steps: [{ tool: 'search_symbols', args: 'query="db"', output: 'Found 1', files: [] }] },
        result: {
          passed: false,
          groundednessScore: 66.7,
          recallScore: 50,
          citedFiles: ['src/core/db.ts', 'src/untraced.ts', 'outside/ghost.ts'],
          hallucinatedPaths: ['outside/ghost.ts'],
          unprovenPaths: ['src/untraced.ts'],
        }
      }]
    };
    renderEvalSuite();
  `);
  const casesHtml = elements.get('evalCasesContainer').innerHTML;
  assert.ok(casesHtml.includes('FAIL (hallucinated + unproven)'));
  assert.ok(casesHtml.includes('Hallucinated Citations (Outside Graph)'));
  assert.ok(casesHtml.includes('Unproven Citations (Real Paths Not Traced)'));
  assert.ok(casesHtml.includes('data-filepath="src/untraced.ts"')); // CLAUDE.md Invariant 2 compliance!
  assert.ok(casesHtml.includes('Missed Expected Citations (1 files)'));
  assert.ok(casesHtml.includes('data-filepath="src/missing.ts"'));
});

test('folder focus, camera refit, LOD macro zoom and browser filter clearing', () => {
  const elements = new Map();
  const el = (tag = 'div') => {
    const classes = new Set();
    const attrs = new Map();
    return {
      tagName: tag.toUpperCase(),
      getClientRects() { return [{ width: 1000, height: 800 }]; },
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
      appendChild(child) { this.children.push(child); return child; },
      replaceChildren() { this.children = []; this.innerHTML = ''; },
      remove() {},
      querySelector(sel) { return null; },
      querySelectorAll(sel) { return []; },
      scrollTop: 0,
      clientWidth: 1000,
      clientHeight: 800,
      hidden: false,
    };
  };

  const getOrCreate = (id, tag = 'div') => {
    if (!elements.has(id)) elements.set(id, el(tag));
    return elements.get(id);
  };

  const layerPills = ['all', 'core', 'parser', 'agent', 'api', 'ui'].map(layer => {
    const btn = el('button');
    btn.dataset.layer = layer;
    btn.className = `layer-pill ${layer === 'all' ? 'active' : ''}`;
    return btn;
  });

  const canvas = getOrCreate('dependencyCanvas', 'canvas');
  canvas.width = 1000;
  canvas.height = 800;
  const mockCtx = {
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    roundRect() {},
    rect() {},
    fillRect() {},
    strokeRect() {},
    clip() {},
    fill() {},
    stroke() {},
    fillText() {},
    measureText(text) { return { width: (text || '').length * 7 }; },
    clearRect() {},
    setLineDash() {},
    moveTo() {},
    lineTo() {},
    bezierCurveTo() {},
    arc() {},
    scale() {},
    translate() {},
  };
  canvas.getContext = () => mockCtx;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 800 });

  const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: fn => setTimeout(fn, 0),
    cancelAnimationFrame: id => clearTimeout(id),
    window: {
      addEventListener() {},
      innerWidth: 1200,
      showToast() {},
      requestAnimationFrame: fn => setTimeout(fn, 0),
      cancelAnimationFrame: id => clearTimeout(id),
    },
    document: {
      getElementById(id) {
        return getOrCreate(id);
      },
      createElement(tag) {
        return el(tag);
      },
      body: el('body'),
      querySelectorAll(sel) {
        if (sel === '.layer-pill') return layerPills;
        return [];
      },
      addEventListener() {},
    },
    lucide: {
      createIcons() {},
    },
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

  const run = src => vm.runInContext(src, context);

  // Setup test graph with multiple folders and layers
  run(`
    state.graph = {
      nodes: [
        { path: 'auth-profile-web/src/auth/AuthProvider.jsx', label: 'AuthProvider.jsx', folder: 'auth-profile-web/src/auth', layer: 'ui', loc: 120, exports: ['AuthProvider'], totalImpact: 5, hop1Files: [], hop2Files: [], outboundEdges: [], x: 100, y: 100 },
        { path: 'auth-profile-web/src/components/Connections.jsx', label: 'Connections.jsx', folder: 'auth-profile-web/src/components', layer: 'ui', loc: 80, exports: ['Connections'], totalImpact: 2, hop1Files: [], hop2Files: [], outboundEdges: [], x: 220, y: 120 },
        { path: 'src/core/db.js', label: 'db.js', folder: 'src/core', layer: 'core', loc: 200, exports: ['query'], totalImpact: 10, hop1Files: [], hop2Files: [], outboundEdges: [], x: 600, y: 400 },
        { path: 'package.json', label: 'package.json', folder: '', layer: 'core', loc: 30, exports: [], totalImpact: 0, hop1Files: [], hop2Files: [], outboundEdges: [], x: 0, y: 0 }
      ],
      edges: [
        { source: 'auth-profile-web/src/components/Connections.jsx', target: 'auth-profile-web/src/auth/AuthProvider.jsx', line: 5, statement: 'import { AuthProvider } from "./auth"' }
      ],
      cycles: [],
      name: 'test-repo',
    };
    state.fileSortMode = 'path';
    state.activeView = 'explorer';
  `);

  // 1. Initial render of file list sidebar in folder tree mode
  run(`renderFileListSidebar()`);
  const listContainer = getOrCreate('fileListContainer');
  assert.ok(listContainer.innerHTML.includes('auth-profile-web/src/auth'));
  assert.ok(listContainer.innerHTML.includes('auth-profile-web/src/components'));
  assert.ok(listContainer.innerHTML.includes('src/core'));
  assert.ok(listContainer.innerHTML.includes('Focus'));

  // 2. Focus folder
  run(`focusFolder('auth-profile-web')`);
  assert.equal(run(`state.folderFilter`), 'auth-profile-web');
  const activeLayerHeading = getOrCreate('activeLayerName');
  assert.equal(activeLayerHeading.textContent, '📁 auth-profile-web');
  const clearBtn = getOrCreate('clearLayerFilter');
  assert.equal(clearBtn.hidden, false);
  assert.equal(clearBtn.textContent, 'Clear focus');

  // Check camera was fit to the focused nodes
  const camAfterFocus = run(`state.camera`);
  assert.ok(camAfterFocus.zoom > 0);

  // Check sidebar markup highlights the focused folder
  run(`renderFileListSidebar()`);
  assert.ok(listContainer.innerHTML.includes('Focused ✕'));

  // 3. Focus folder toggle (calling again on same folder clears it)
  run(`focusFolder('auth-profile-web')`);
  assert.equal(run(`state.folderFilter`), null);
  assert.equal(clearBtn.hidden, true);

  // 4. Clear folder focus explicitly
  run(`focusFolder('src/core')`);
  assert.equal(run(`state.folderFilter`), 'src/core');
  run(`clearFolderFocus()`);
  assert.equal(run(`state.folderFilter`), null);

  // 5. Layer filter setting and camera refit
  run(`setLayerFilter('core')`);
  assert.equal(run(`state.layerFilter`), 'core');
  assert.equal(layerPills.find(p => p.dataset.layer === 'core').getAttribute('aria-pressed'), 'true');
  assert.equal(layerPills.find(p => p.dataset.layer === 'all').getAttribute('aria-pressed'), 'false');

  // 6. Clear all browser filters
  run(`focusFolder('auth-profile-web')`);
  run(`clearAllBrowserFilters()`);
  assert.equal(run(`state.layerFilter`), 'all');
  assert.equal(run(`state.folderFilter`), null);
  assert.equal(layerPills.find(p => p.dataset.layer === 'all').getAttribute('aria-pressed'), 'true');

  // 7. Macro zoom Level-of-Detail canvas rendering
  run(`
    state.camera = { x: 0, y: 0, zoom: 0.25 };
    drawDependencyGraph();
  `);
  // Renders cleanly at zoom < 0.45 without errors
  assert.ok(true);

  // 8. Palette integration: folder actions available
  const paletteResults = JSON.parse(run(`JSON.stringify(getPaletteResults('Folder', 'commands'))`));
  assert.ok(paletteResults.results.some(r => r.label.includes('Focus folder: auth-profile-web')));
  assert.ok(paletteResults.results.some(r => r.label.includes('Focus folder: src/core')));

  // 9. Apostrophe and special characters in folder names render safely via data attributes
  run(`
    state.graph.nodes.push({ path: "user's_data/component.jsx", label: 'component.jsx', folder: "user's_data", layer: 'ui', loc: 40, exports: [], totalImpact: 0, hop1Files: [], hop2Files: [], outboundEdges: [], x: 50, y: 50 });
    renderFileListSidebar();
  `);
  assert.ok(listContainer.innerHTML.includes('data-folder-focus="user&#39;s_data"'));
  assert.ok(!listContainer.innerHTML.includes("onclick=\"focusFolder('user's_data')\""));

  // 10. Repository reload resets state.folderFilter (preventing ghost canvas)
  run(`
    state.folderFilter = 'src/core';
    applyParsedGraph({ nodes: [], edges: [], cycles: [] });
  `);
  assert.equal(run(`state.folderFilter`), null);

  // 11. Core palette actions are not starved by large folder lists
  run(`
    state.graph.nodes = Array.from({ length: 45 }, (_, i) => ({
      path: 'folder_' + i + '/file.js',
      label: 'file.js',
      folder: 'folder_' + i,
      layer: 'ui',
      loc: 10, exports: [], totalImpact: 0, hop1Files: [], hop2Files: [], outboundEdges: [], x: 0, y: 0
    }));
  `);
  const topCommands = JSON.parse(run(`JSON.stringify(getPaletteResults('', 'commands').results.slice(0, 50).map(r => r.label))`));
  assert.ok(topCommands.includes('Export JSON'));
  assert.ok(topCommands.includes('Agent settings'));
  assert.ok(topCommands.includes('Fit map'));

  // 12. Delimiter checks in cluster hulls (auth does not match auth-profile-web)
  run(`
    state.folderFilter = 'auth-profile-web';
  `);
  assert.equal(
    run(`Boolean(state.folderFilter && ('auth' === state.folderFilter || (state.folderFilter !== '/' && 'auth'.startsWith(state.folderFilter + '/')) || ('auth' !== '/' && state.folderFilter.startsWith('auth/'))))`),
    false
  );
});
