'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseRepository } = require('../lib/cartograph-parser.js');
const CartographAgent = require('../lib/cartograph-agent.js');
const {
  evaluateSuite,
  buildBenchmarkCases,
  collectTraceFiles,
  scoreCase,
  computeSuiteSummary,
} = require('../lib/cartograph-evals.js');

const SERVER = 'src/lib/db/supabase.ts';
const VERIFY = 'src/lib/auth/verify.ts';
const ROUTES = 'src/app/api/routes.ts';
const PAGE = 'src/app/page.tsx';
const GHOST = 'src/fake/ghost.ts';

function chip(path) {
  return `<chip>${path.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")}</chip>`;
}

function buildFixtureGraph() {
  return parseRepository(
    [
      { path: SERVER, content: 'export const dbClient = {};' },
      {
        path: VERIFY,
        content:
          "import { dbClient } from '../db/supabase';\n\nexport function verifyToken() {\n  return dbClient;\n}",
      },
      {
        path: ROUTES,
        content:
          "import { verifyToken } from '../../lib/auth/verify';\n\nexport const routes = verifyToken;",
      },
      {
        path: PAGE,
        content:
          "import { routes } from './api/routes';\n\nexport default function Page() {}",
      },
    ],
    { repoName: 'eval-fixture' }
  );
}

test('buildBenchmarkCases produces three graph-derived cases that route into real branches', () => {
  const graph = buildFixtureGraph();
  const cases = buildBenchmarkCases(graph);

  assert.equal(cases.length, 3);
  assert.deepEqual(cases.map((c) => c.id), ['eval-1', 'eval-2', 'eval-3']);

  // Top hub is src/lib/db/supabase.ts (3 dependents: verify, layout... in this
  // fixture verify/routes/page chain makes verify the... verify has hop1=routes
  // hop2=page => 3; supabase has hop1=verify hop2=routes => 2. Top hub: verify.
  const topHub = [...graph.nodes].sort((a, b) => b.totalImpact - a.totalImpact)[0];
  assert.ok(cases[0].question.includes(topHub.path));
  assert.ok(cases[0].question.includes('change'));
  assert.deepEqual(cases[0].expectedFiles, [topHub.path, ...topHub.hop1Files, ...topHub.hop2Files]);

  assert.ok(cases[1].question.includes('authentication'));
  const authNode = CartographAgent.findAuthNodes(graph.nodes)[0] || graph.nodes[0];
  assert.deepEqual(cases[1].expectedFiles, [authNode.path, ...authNode.hop1Files]);

  assert.ok(cases[2].question.includes('break'), 'case 3 routes through the blast branch');
  assert.ok(cases[2].question.includes('import'), 'case 3 asks about outbound imports');
});

test('naive benchmark lists include invented paths while case questions are real', () => {
  const graph = buildFixtureGraph();
  const cases = buildBenchmarkCases(graph);
  const known = new Set(graph.nodes.map((n) => n.path));

  for (const tc of cases) {
    assert.ok(
      tc.naiveCited.some((f) => !known.has(f)),
      `naive case ${tc.id} must contain at least one invented path`
    );
    for (const f of tc.naiveCited) {
      if (known.has(f)) continue;
      assert.ok(!/[\n\r]/.test(f), 'invented paths are plain paths');
    }
  }
});

test('strict runs pass all cases: grounded, proven, full recall', () => {
  const graph = buildFixtureGraph();
  for (const {tc,plan,result} of evaluateSuite(graph,'strict',chip).entries) {

    assert.equal(result.passed, true, `strict case ${tc.id} should PASS (grounded + proven + full recall)`);
    assert.equal(result.hallucinatedPaths.length, 0);
    assert.equal(result.unprovenPaths.length, 0);
    assert.equal(result.groundednessScore, 100);
    assert.equal(result.recallScore, 100);
    assert.ok(plan.steps.length > 0, 'each strict case ran the agent');
  }
});

test('the provenance rule fails a case when a real path was never traced', () => {
  const graph = buildFixtureGraph();

  const result = scoreCase({
    graph,
    expectedFiles: [VERIFY],
    citedFiles: [VERIFY, ROUTES],
    traceFiles: [VERIFY],
    requireProvenance: true,
  });

  assert.deepEqual(result.unprovenPaths, [ROUTES]);
  assert.equal(result.hallucinatedPaths.length, 0, 'a real path is not a hallucination');
  assert.equal(result.groundednessScore, 50, 'cited-but-untraced halves groundedness');
  assert.equal(result.recallScore, 100);
  assert.equal(result.passed, false);
});

test('hallucinated citations are paths outside the graph and fail the case', () => {
  const graph = buildFixtureGraph();

  const result = scoreCase({
    graph,
    expectedFiles: [VERIFY],
    citedFiles: [VERIFY, GHOST],
    traceFiles: [VERIFY],
    requireProvenance: false,
  });

  assert.deepEqual(result.hallucinatedPaths, [GHOST]);
  assert.equal(result.unprovenPaths.length, 0, 'outside-the-graph citations are not unproven');
  assert.equal(result.groundednessScore, 50);
  assert.equal(result.passed, false);
});

test('naive mode grounds by existence only (no trace provenance)', () => {
  const graph = buildFixtureGraph();

  const result = scoreCase({
    graph,
    expectedFiles: [VERIFY],
    citedFiles: [VERIFY, ROUTES],
    traceFiles: [],
    requireProvenance: false,
  });

  assert.deepEqual(result.unprovenPaths, []);
  assert.equal(result.groundednessScore, 100);
  assert.equal(result.passed, true, 'existence-only mode lets proven-but-real citations pass');


});

test('recall measures expected coverage, independently of grounding', () => {
  const graph = buildFixtureGraph();

  const result = scoreCase({
    graph,
    expectedFiles: [VERIFY, ROUTES],
    citedFiles: [VERIFY],
    traceFiles: [VERIFY],
    requireProvenance: true,
  });

  assert.equal(result.recallScore, 50);
  assert.equal(result.groundednessScore, 100);
  assert.equal(result.passed, false);
});

test('collectTraceFiles unions step files in order and dedupes', () => {
  const graph = buildFixtureGraph();
  const plan = CartographAgent.buildAgentPlan(
    `What breaks if ${VERIFY} changes and which modules does it import?`,
    graph,
    chip
  );
  const trace = collectTraceFiles(plan);

  const seen = new Set();
  for (const step of plan.steps) {
    for (const f of step.files) {
      assert.ok(!seen.has(f), 'collectTraceFiles removes duplicates');
      seen.add(f);
      assert.ok(trace.includes(f));
    }
  }
  assert.equal(trace.length, seen.size, 'trace contains exactly the union of step files');
});

test('computeSuiteSummary weights totals rather than averaging case percentages',()=>{
  const graph=buildFixtureGraph();
  const results=[scoreCase({graph,expectedFiles:[VERIFY],citedFiles:[VERIFY],traceFiles:[VERIFY],requireProvenance:true}),scoreCase({graph,expectedFiles:[VERIFY,ROUTES,PAGE],citedFiles:[VERIFY,GHOST],traceFiles:[VERIFY],requireProvenance:true})];
  const summary=computeSuiteSummary(results,[{steps:[{},{}]},{steps:[{}]}]);
  assert.equal(summary.totalCases,2);assert.equal(summary.passCount,1);
  assert.equal(summary.groundednessScore,66.7);assert.equal(summary.recallScore,50);
  assert.equal(summary.hallucinatedCount,1);assert.equal(summary.unprovenCount,0);
  assert.equal(summary.avgSteps,1.5);
});

test('scoreCase guards against empty citations and empty expectations', () => {
  const graph = buildFixtureGraph();

  const noCited = scoreCase({
    graph,
    expectedFiles: [VERIFY],
    citedFiles: [],
    traceFiles: [VERIFY],
    requireProvenance: true,
  });
  assert.equal(noCited.groundednessScore, 100);
  assert.equal(noCited.recallScore, 0);
  assert.equal(noCited.passed, false);

  const noExpected = scoreCase({
    graph,
    expectedFiles: [],
    citedFiles: [VERIFY],
    traceFiles: [VERIFY],
    requireProvenance: true,
  });
  assert.equal(noExpected.recallScore, 100);
  assert.equal(noExpected.groundednessScore, 100);
  assert.equal(noExpected.passed, true);
});

// These assertions exercise the complete production run, rather than assembling
// a second suite runner in the test.
test('evaluateSuite executes real strict plans, trace provenance and weighted totals deterministically', () => {
  const graph = buildFixtureGraph(), before = JSON.stringify(graph);
  const run = evaluateSuite(graph, 'strict', chip);
  assert.deepEqual(Object.keys(run), ['isStrict','cases','entries','summary']);
  assert.equal(run.isStrict, true);
  assert.equal(run.entries.length, 3);
  for (const {tc,plan,result} of run.entries) {
    assert.deepEqual(plan, CartographAgent.buildAgentPlan(tc.question,graph,chip));
    assert.ok(plan.steps.length > 0);
    assert.deepEqual(result, scoreCase({graph,expectedFiles:tc.expectedFiles,citedFiles:plan.citedFiles,traceFiles:collectTraceFiles(plan),requireProvenance:true}));
    assert.equal(result.passed,true);
  }
  assert.deepEqual(run.summary, computeSuiteSummary(run.entries.map(e=>e.result),run.entries.map(e=>e.plan)));
  assert.deepEqual(evaluateSuite(graph,'strict',chip),run);
  assert.equal(JSON.stringify(graph),before);
});
test('evaluateSuite naive uses existence-only weighted scoring with no planner or formatter', () => {
  const graph=buildFixtureGraph(), original=CartographAgent.buildAgentPlan;
  CartographAgent.buildAgentPlan=()=>{throw Error('planner must not run')};
  try {
    const run=evaluateSuite(graph,'naive',()=>{throw Error('formatter must not run')});
    assert.equal(run.isStrict,false);
    assert.equal(run.summary.avgSteps,0);
    assert.equal(run.summary.groundednessScore,Math.round(run.summary.groundedCount/run.summary.totalCited*1000)/10);
    assert.ok(run.summary.hallucinatedCount>0);
    for(const {tc,plan,result} of run.entries) {
      assert.equal(plan,null);
      assert.deepEqual(result,scoreCase({graph,expectedFiles:tc.expectedFiles,citedFiles:tc.naiveCited,traceFiles:[],requireProvenance:false}));
    }
    const realFake=parseRepository(['src/lib/db/connection-pool.ts','src/services/legacy-cache.ts','src/middleware/session-cookie.ts','src/utils/file-reader.ts'].map(path=>({path,content:'export const a=1;'})));
    assert.equal(evaluateSuite(realFake,'naive',chip).summary.hallucinatedCount,0);
  } finally {CartographAgent.buildAgentPlan=original}
});
test('evaluateSuite empty graph retains aggregate semantics; invalid mode rejects before graph access',()=>{
  for(const mode of ['strict','naive']) {
    const run=evaluateSuite({nodes:[]},mode,chip);
    assert.deepEqual(run.entries,[]);assert.deepEqual(run.cases,[]);
    assert.deepEqual(run.summary,computeSuiteSummary([],[]));
  }
  for(const mode of [undefined,'STRICT','',null]) assert.throws(()=>evaluateSuite({get nodes(){throw Error('graph accessed')}},mode,chip),/mode/i);
});
test('evaluateSuite forwards raw special paths through caller safe formatter',()=>{
  const path='src/odd<&"\'.js', graph=parseRepository([{path,content:'export const a=1;'}]);
  const seen=[];const run=evaluateSuite(graph,'strict',p=>{seen.push(p);return chip(p)});
  assert.ok(seen.includes(path));
  assert.ok(run.entries.every(e=>e.plan.answerHtml.includes(chip(path))));
  assert.ok(run.entries.every(e=>e.result.citedFiles.includes(path)));
});
