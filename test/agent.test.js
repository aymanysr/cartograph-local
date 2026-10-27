'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseRepository,
} = require('../lib/cartograph-parser.js');
const {
  buildAgentPlan,
  findAuthNodes,
} = require('../lib/cartograph-agent.js');

const SERVER = 'src/lib/db/supabase.ts';
const VERIFY = 'src/lib/auth/verify.ts';
const ROUTES = 'src/app/api/routes.ts';
const PAGE = 'src/app/page.tsx';
const LAYOUT = 'src/app/layout.tsx';
const SYNC = 'src/jobs/sync.ts';

function buildFixtureGraph() {
  return parseRepository(
    [
      {
        path: SERVER,
        content: 'export const dbClient = {};\nexport function query() {}',
      },
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
      {
        path: LAYOUT,
        content:
          "import { dbClient } from '../lib/db/supabase';\n\nexport const layout = dbClient;",
      },
      {
        path: SYNC,
        content:
          "import { dbClient } from '../lib/db/supabase';\n\nexport const sync = dbClient;",
      },
    ],
    { repoName: 'fixture-app' }
  );
}

function chip(path) {
  return `<chip>${path}</chip>`;
}

test('planner routes auth questions through the auth branch', () => {
  const graph = buildFixtureGraph();
  const plan = buildAgentPlan('Where is authentication enforced and which modules call it directly?', graph, chip);

  assert.equal(plan.primaryFocus, VERIFY);
  assert.deepEqual(
    plan.steps.map((s) => s.tool),
    ['search_symbols', 'get_file_ast', 'walk_dependents']
  );
  for (const step of plan.steps) {
    assert.ok(Array.isArray(step.files), 'each step reports verified files');
  }

  const visited = new Set(plan.visitedFiles);
  for (const expected of [VERIFY, ROUTES, PAGE, SERVER]) {
    assert.ok(visited.has(expected), `visited files should include ${expected}`);
  }

  assert.ok(plan.activeEdges.includes(`${ROUTES}->${VERIFY}`));
  assert.ok(plan.activeEdges.includes(`${VERIFY}->${SERVER}`));
});

test('planner routes blast questions by full path and traces outbound imports', () => {
  const graph = buildFixtureGraph();
  const plan = buildAgentPlan(
    `What breaks if ${VERIFY} changes and which modules does it import?`,
    graph,
    chip
  );

  assert.equal(plan.primaryFocus, VERIFY, 'full path in the question selects the exact node');

  const tools = plan.steps.map((s) => s.tool);
  assert.deepEqual(tools, ['get_file_ast', 'walk_dependents', 'walk_dependents', 'trace_dependency_path']);

  const outboundStep = plan.steps[3];
  assert.deepEqual(outboundStep.files, [SERVER], 'outbound import step names the verified outbound targets');
  assert.deepEqual(outboundStep.args, `from="${VERIFY}"`);

  const visited = new Set(plan.visitedFiles);
  for (const expected of [VERIFY, ROUTES, PAGE, SERVER]) {
    assert.ok(visited.has(expected), `visited files should include ${expected}`);
  }
  assert.ok(plan.activeEdges.includes(`${VERIFY}->${SERVER}`), 'outbound edges are highlighted');
});

test('planner blast route cites its 1-hop and 2-hop dependents and outbound targets', () => {
  const graph = buildFixtureGraph();
  const plan = buildAgentPlan(
    `What breaks if ${VERIFY} changes and which modules does it import?`,
    graph,
    chip
  );

  for (const expected of [VERIFY, ROUTES, PAGE, SERVER]) {
    assert.ok(plan.citedFiles.includes(expected), `cited files should include ${expected}`);
  }
  const visited = new Set(plan.visitedFiles);
  for (const cited of plan.citedFiles) {
    assert.ok(
      visited.has(cited) || plan.steps.some((s) => s.files.includes(cited)),
      `every cited file must appear in the tool trace: ${cited}`
    );
  }
});

test('planner blast route matches by full path before the label fallback', () => {
  const graph = parseRepository(
    [
      {
        path: 'src/orders/repo.ts',
        content: "import { repo } from '../billing/repo';\n\nexport const orders = repo;",
      },
      {
        path: 'src/billing/repo.ts',
        content: 'export const repo = 1;',
      },
    ],
    { repoName: 'label-collision' }
  );

  const plan = buildAgentPlan('What breaks if src/billing/repo.ts changes?', graph, chip);

  assert.equal(plan.primaryFocus, 'src/billing/repo.ts');
  assert.ok(
    !plan.primaryFocus.includes('src/orders/repo.ts'),
    'a shared label must not divert the blast target'
  );
  assert.ok(plan.citedFiles.includes('src/orders/repo.ts'), 'dependents of the right target are cited');
});

test('planner falls back to the generic parser-to-UI walk for open questions', () => {
  const graph = buildFixtureGraph();
  const plan = buildAgentPlan('Explain the overall module flow.', graph, chip);

  assert.deepEqual(plan.steps.map((s) => s.tool), ['search_symbols', 'trace_dependency_path']);
  assert.equal(plan.primaryFocus, SERVER);
  const visited = new Set(plan.visitedFiles);
  for (const cited of plan.citedFiles) {
    assert.ok(visited.has(cited), `cited file must be visited: ${cited}`);
  }
});

test('planner is pure: identical inputs produce identical plans', () => {
  const graph = buildFixtureGraph();
  const question = `What breaks if ${VERIFY} changes?`;
  const first = buildAgentPlan(question, graph, chip);
  const second = buildAgentPlan(question, graph, chip);

  assert.equal(JSON.stringify(first.steps), JSON.stringify(second.steps));
  assert.deepEqual(first.visitedFiles, second.visitedFiles);
  assert.deepEqual(first.activeEdges, second.activeEdges);
  assert.deepEqual(first.citedFiles, second.citedFiles);
  assert.deepEqual(first.answerHtml, second.answerHtml);
});

test('planner reports no state mutation across repeated runs', () => {
  const graph = buildFixtureGraph();
  const before = JSON.stringify(graph.nodes.map((n) => n.hop1Files));
  buildAgentPlan('What breaks if src/lib/db/supabase.ts changes?', graph, chip);
  const after = JSON.stringify(graph.nodes.map((n) => n.hop1Files));

  assert.equal(after, before, 'the planner must not mutate the graph');
});

test('findAuthNodes matches auth paths and exports, in node order', () => {
  const graph = buildFixtureGraph();
  assert.deepEqual(findAuthNodes(graph.nodes).map((n) => n.path), [VERIFY]);

  const plain = parseRepository(
    [{ path: 'src/plain.ts', content: 'export const plain = 1;' }],
    { repoName: 'no-auth' }
  );
  assert.deepEqual(findAuthNodes(plain.nodes), []);
});

const {
  validateSynthesis,
} = require('../lib/cartograph-agent.js');

const OTHER = 'src/app/api/other.ts';
const GRAPH = buildFixtureGraph();
const TRACE = [VERIFY, SERVER];

function acceptGraph() {
  return GRAPH;
}

function synthesis(text, tracePaths) {
  return validateSynthesis(text, acceptGraph(), tracePaths || TRACE);
}

test('validateSynthesis accepts answers that only cite traced paths', () => {
  const outcome = synthesis(
    `Authentication is enforced in ${VERIFY}, backed by ${SERVER}.`,
    TRACE
  );
  assert.equal(outcome.accepted, true);
  assert.deepEqual(outcome.citedPaths, [VERIFY, SERVER]);
  assert.deepEqual(outcome.unknownPaths, []);
  assert.deepEqual(outcome.unprovenPaths, []);
});

test('validateSynthesis rejects invented paths outside the graph', () => {
  const outcome = synthesis(
    'Auth uses src/middleware/session-cookie.ts and src/middleware/session-cookie.ts for tokens.',
    TRACE
  );
  assert.equal(outcome.accepted, false);
  assert.deepEqual(outcome.unknownPaths, ['src/middleware/session-cookie.ts'], 'duplicate mentions are deduped');
  assert.deepEqual(outcome.unprovenPaths, []);
});

test('validateSynthesis rejects real paths that were never traced', () => {
  const outcome = synthesis(`It also relates to ${ROUTES} nearby.`, TRACE);
  assert.equal(outcome.accepted, false);
  assert.deepEqual(outcome.citedPaths, [ROUTES]);
  assert.deepEqual(outcome.unprovenPaths, [ROUTES]);
  assert.deepEqual(outcome.unknownPaths, []);
});

test('validateSynthesis accepts real paths once they appear in the trace', () => {
  const outcome = synthesis(`It also relates to ${ROUTES} nearby.`, [...TRACE, ROUTES]);
  assert.equal(outcome.accepted, true);
  assert.deepEqual(outcome.unprovenPaths, []);
});

test('validateSynthesis strips URLs and treats slash prose as non-paths', () => {
  const outcome = synthesis(
    'See https://example.com/docs/api/chat.ts?page=1. The cost/benefit and/or input/output tradeoffs apply.',
    TRACE
  );
  assert.equal(outcome.accepted, true, 'URLs and extension-less slash words are not file citations');
  assert.deepEqual(outcome.unknownPaths, []);
});

test('validateSynthesis reports a graph-less trace as unproven (provenance on)', () => {
  const outcome = synthesis(`Answers ${VERIFY}.`, []);
  assert.equal(outcome.accepted, false);
  assert.deepEqual(outcome.unprovenPaths, [VERIFY]);
});

test('validateSynthesis passes prose without any path-like token', () => {
  const outcome = synthesis('Auth is handled across two modules with 3 checks.');
  assert.equal(outcome.accepted, true);
  assert.deepEqual(outcome.citedPaths, []);
});

test('validateSynthesis tolerates empty text and an empty graph', () => {
  assert.equal(validateSynthesis('', GRAPH, TRACE).accepted, true);

  const emptyGraph = { nodes: [] };
  const outcome = validateSynthesis('Cites src/ghost.ts here.', emptyGraph, TRACE);
  assert.equal(outcome.accepted, false);
  assert.deepEqual(outcome.unknownPaths, ['src/ghost.ts']);
});
