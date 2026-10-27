'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseRepository } = require('../lib/cartograph-parser.js');
const CartographAgent = require('../lib/cartograph-agent.js');
const {
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
  return `<chip>${path}</chip>`;
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

function runStrictCase(graph, question, expectedFiles) {
  const plan = CartographAgent.buildAgentPlan(question, graph, chip);
  const result = scoreCase({
    graph,
    expectedFiles,
    citedFiles: plan.citedFiles,
    traceFiles: collectTraceFiles(plan),
    requireProvenance: true,
  });
  return { plan, result };
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
  const cases = buildBenchmarkCases(graph);

  for (const tc of cases) {
    const { plan, result } = runStrictCase(graph, tc.question, tc.expectedFiles);

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

  // ...but the naive demo fallbacks still fail because they cite invented paths.
  const cases = buildBenchmarkCases(graph);
  for (const tc of cases) {
    const naive = scoreCase({
      graph,
      expectedFiles: tc.expectedFiles,
      citedFiles: tc.naiveCited,
      traceFiles: [],
      requireProvenance: false,
    });
    assert.equal(naive.passed, false, `naive case ${tc.id} should FAIL`);
    assert.ok(naive.hallucinatedPaths.length > 0, `naive case ${tc.id} should catch hallucinations`);
  }
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

test('computeSuiteSummary aggregates real percentages and average step latency', () => {
  const graph = buildFixtureGraph();
  const cases = buildBenchmarkCases(graph);
  const plans = [];
  const results = cases.map((tc) => {
    const { plan, result } = runStrictCase(graph, tc.question, tc.expectedFiles);
    plans.push(plan);
    return result;
  });

  const summary = computeSuiteSummary(results, plans);

  assert.equal(summary.totalCases, 3);
  assert.equal(summary.passCount, 3);
  assert.equal(summary.groundednessScore, 100);
  assert.equal(summary.recallScore, 100);
  assert.equal(summary.hallucinatedCount, 0);
  assert.equal(summary.unprovenCount, 0);

  const rawAvgSteps = plans.reduce((sum, p) => sum + p.steps.length, 0) / plans.length;
  assert.equal(summary.avgSteps, Math.round(rawAvgSteps * 10) / 10, 'avgSteps is rounded to one decimal');
  assert.equal(Number.isFinite(summary.avgSteps), true);
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
