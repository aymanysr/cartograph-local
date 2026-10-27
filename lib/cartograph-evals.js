/**
 * Cartograph eval scorer — shared by the browser Evals tab and Node tests.
 *
 * Zero dependencies. No DOM access. Depends on `CartographAgent` (browser) or
 * `./cartograph-agent.js` (Node) only for the auth-node selector so benchmark
 * cases and the agent agree on which file the auth question targets.
 *
 * Scoring semantics (strict = trace provenance on):
 * - hallucinated  = cited path does NOT exist in the parsed graph.
 * - unproven      = cited path exists in the graph but never appeared in an
 *                   agent tool step (strict mode only).
 * - grounded      = cited and neither hallucinated nor unproven.
 * - Groundedness% = grounded / total cited   (0 cited counts as 100).
 * - Recall%       = |expected ∩ cited| / |expected| (0 expected counts as 100).
 * - Case PASS     = 0 hallucinated, 0 unproven, recall exactly 100%.
 * Naive/blind runs have no trace, so they score existence-only and only catch
 * invented paths.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./cartograph-agent.js'));
  } else {
    root.CartographEvals = factory(root.CartographAgent);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (CartographAgent) {
  'use strict';

  // Deliberately fake paths used by the naive "blind LLM" demo cases. They are
  // not in the built-in sample graphs, so naive mode visibly fails on them.
  const NAIVE_FAKE_PATHS = [
    'src/lib/db/connection-pool.ts',
    'src/services/legacy-cache.ts',
    'src/middleware/session-cookie.ts',
    'src/utils/file-reader.ts',
  ];

  function round1(value) {
    return Math.round(value * 10) / 10;
  }

  function pickTopHub(nodes) {
    return [...nodes].sort((a, b) => b.totalImpact - a.totalImpact)[0];
  }

  function buildBenchmarkCases(graph) {
    const nodes = graph.nodes || [];
    if (!nodes.length) return [];

    const topHub = pickTopHub(nodes);
    const authNode = CartographAgent.findAuthNodes(nodes)[0] || nodes[0];
    const parserNode = nodes.find((n) => n.layer === 'parser') || nodes[Math.min(1, nodes.length - 1)];

    return [
      {
        id: 'eval-1',
        question: `What is the complete 2-hop blast radius if ${topHub.path} changes?`,
        expectedFiles: [topHub.path, ...topHub.hop1Files, ...topHub.hop2Files],
        naiveCited: [topHub.path, ...topHub.hop1Files.slice(0, 2), NAIVE_FAKE_PATHS[0], NAIVE_FAKE_PATHS[1]],
        naiveAnswer: `Changing ${topHub.path} will mainly affect ${NAIVE_FAKE_PATHS[0]} and ${NAIVE_FAKE_PATHS[1]} along with a couple of API routes.`,
      },
      {
        id: 'eval-2',
        question: 'Where is authentication enforced and which modules call it directly?',
        expectedFiles: [authNode.path, ...authNode.hop1Files],
        naiveCited: [authNode.path, NAIVE_FAKE_PATHS[2]],
        naiveAnswer: `Authentication is handled via ${authNode.path} and ${NAIVE_FAKE_PATHS[2]} across all endpoints.`,
      },
      {
        id: 'eval-3',
        question: `What breaks if ${parserNode.path} changes and which modules does it import?`,
        expectedFiles: [parserNode.path, ...parserNode.outboundEdges.map((e) => e.target), ...parserNode.hop1Files],
        naiveCited: [parserNode.path, NAIVE_FAKE_PATHS[3]],
        naiveAnswer: `${parserNode.path} reads files using ${NAIVE_FAKE_PATHS[3]} and passes them to the UI.`,
      },
    ];
  }

  function collectTraceFiles(plan) {
    const traceFiles = [];
    const seen = new Set();
    for (const step of (plan.steps || [])) {
      for (const filePath of step.files || []) {
        if (!seen.has(filePath)) {
          seen.add(filePath);
          traceFiles.push(filePath);
        }
      }
    }
    return traceFiles;
  }

  function scoreCase({ graph, expectedFiles, citedFiles, traceFiles, requireProvenance }) {
    const knownPaths = new Set((graph.nodes || []).map((n) => n.path));
    const traceSet = new Set(traceFiles || []);
    const cited = citedFiles || [];
    const expected = expectedFiles || [];

    const hallucinatedPaths = cited.filter((f) => !knownPaths.has(f));
    const unprovenPaths = requireProvenance
      ? cited.filter((f) => knownPaths.has(f) && !traceSet.has(f))
      : [];
    const groundedCount = cited.length - hallucinatedPaths.length - unprovenPaths.length;

    const recalledFiles = expected.filter((f) => cited.includes(f));

    const totalCited = cited.length;
    const totalExpected = expected.length;
    const groundednessScore = totalCited > 0 ? round1((groundedCount / totalCited) * 100) : 100;
    const recallScore = totalExpected > 0 ? round1((recalledFiles.length / totalExpected) * 100) : 100;

    const passed =
      hallucinatedPaths.length === 0 &&
      unprovenPaths.length === 0 &&
      recalledFiles.length === totalExpected;

    return {
      citedFiles: cited,
      hallucinatedPaths,
      unprovenPaths,
      groundedCount,
      totalCited,
      recalledCount: recalledFiles.length,
      totalExpected,
      groundednessScore,
      recallScore,
      passed,
    };
  }

  function computeSuiteSummary(caseResults, plans) {
    const results = caseResults || [];
    const planList = plans || [];

    const totalCited = results.reduce((sum, r) => sum + r.totalCited, 0);
    const groundedCount = results.reduce((sum, r) => sum + r.groundedCount, 0);
    const totalExpected = results.reduce((sum, r) => sum + r.totalExpected, 0);
    const recalledCount = results.reduce((sum, r) => sum + r.recalledCount, 0);
    const stepsTotal = planList.reduce((sum, p) => sum + (p.steps ? p.steps.length : 0), 0);

    return {
      totalCases: results.length,
      passCount: results.filter((r) => r.passed).length,
      totalCited,
      groundedCount,
      hallucinatedCount: results.reduce((sum, r) => sum + r.hallucinatedPaths.length, 0),
      unprovenCount: results.reduce((sum, r) => sum + r.unprovenPaths.length, 0),
      groundednessScore: totalCited > 0 ? round1((groundedCount / totalCited) * 100) : 100,
      recallScore: totalExpected > 0 ? round1((recalledCount / totalExpected) * 100) : 100,
      avgSteps: planList.length > 0 ? round1(stepsTotal / planList.length) : 0,
    };
  }

  return {
    buildBenchmarkCases,
    collectTraceFiles,
    scoreCase,
    computeSuiteSummary,
  };
});
