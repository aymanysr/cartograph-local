'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseRepository,
} = require('../lib/cartograph-parser.js');
const {
  buildAgentPlan,
  findAuthNodes,
  createModelClient,
  queryAgent,
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

// ---------------------------------------------------------------------------
// Ticket 04: the deterministic agent becomes a real tool executor.
// ---------------------------------------------------------------------------

const { TOOLS } = require('../lib/cartograph-agent.js');

function buildCyclicGraph() {
  return parseRepository(
    [
      {
        path: 'src/a/alpha.ts',
        content: "import { b } from '../b/beta';\n\nexport const alpha = b;",
      },
      {
        path: 'src/b/beta.ts',
        content: "import { alpha } from '../a/alpha';\n\nexport const beta = alpha;",
      },
      {
        path: 'src/c/gamma.ts',
        content: "import { beta } from '../b/beta';\n\nexport const gamma = beta;",
      },
    ],
    { repoName: 'cyclic-app' }
  );
}

test('TOOLS exposes the six deterministic tool handlers', () => {
  assert.deepEqual(
    Object.keys(TOOLS).sort(),
    [
      'detect_cycles_and_hubs',
      'find_entry_points',
      'get_file_ast',
      'search_symbols',
      'trace_dependency_path',
      'walk_dependents',
    ]
  );
});

test('search_symbols derives matched modules from path and export tokens', () => {
  const graph = GRAPH;
  const res = TOOLS.search_symbols.run({ query: 'auth | requireAuth | verify' }, graph);

  const tokens = ['auth', 'requireauth', 'verify'];
  const expected = graph.nodes
    .filter((n) =>
      tokens.some(
        (t) => n.path.toLowerCase().includes(t) || n.exports.some((e) => e.toLowerCase().includes(t))
      )
    )
    .map((n) => n.path);

  assert.ok(expected.includes(VERIFY), 'the fixture graph has an auth node');
  assert.deepEqual(res.files, expected, 'matched files are exactly the graph-derived token matches');
  assert.ok(res.output.includes(expected[0]), 'output names the matched graph path');

  const none = TOOLS.search_symbols.run({ query: 'zzz-unknown-symbol' }, graph);
  assert.deepEqual(none.files, []);
  assert.ok(none.output.includes('Matched 0'));
});

test('get_file_ast derives exports, outbound imports, and LOC from the node', () => {
  const graph = GRAPH;
  const node = graph.nodes.find((n) => n.path === VERIFY);
  const outboundTargets = node.outboundEdges.map((e) => e.target);

  const plain = TOOLS.get_file_ast.run({ path: VERIFY }, graph);
  assert.ok(plain.output.includes('verifyToken()'), 'output carries the real export label');
  assert.ok(plain.output.includes(SERVER), 'output carries the real outbound import');
  assert.deepEqual(plain.files, [VERIFY, ...outboundTargets]);

  const verified = TOOLS.get_file_ast.run({ path: VERIFY, verified: true }, graph);
  assert.match(verified.output, new RegExp(`\\(${node.loc} LOC\\)`));
  assert.deepEqual(verified.files, [VERIFY]);

  const missing = TOOLS.get_file_ast.run({ path: 'src/ghost.ts' }, graph);
  assert.deepEqual(missing.files, []);
  assert.ok(missing.output.includes('No graph node'));
});

test('walk_dependents derives the exact hop sets and counts the graph computed', () => {
  const graph = GRAPH;
  const node = graph.nodes.find((n) => n.path === SERVER);

  const d1 = TOOLS.walk_dependents.run({ path: SERVER, depth: 1 }, graph);
  assert.deepEqual(d1.files, node.hop1Files);
  assert.ok(d1.output.includes(`${node.hop1Files.length} direct 1-hop dependents`));

  const d2 = TOOLS.walk_dependents.run({ path: SERVER, depth: 2 }, graph);
  assert.deepEqual(d2.files, node.hop2Files);
  assert.ok(d2.output.includes(`${node.hop2Files.length} transitive 2-hop dependents`));

  const combined = TOOLS.walk_dependents.run(
    { path: SERVER, depth: 2, framing: 'enforcement' },
    graph
  );
  assert.deepEqual(combined.files, [...node.hop1Files, ...node.hop2Files]);
  assert.ok(
    combined.output.includes(`1-Hop enforcement callers (${node.hop1Files.length})`) &&
      combined.output.includes(`2-Hop upstream (${node.hop2Files.length})`)
  );
});

test('trace_dependency_path traces real chains and reports honest dead ends', () => {
  const graph = GRAPH;

  const chain = TOOLS.trace_dependency_path.run({ from: ROUTES, to: SERVER }, graph);
  assert.deepEqual(chain.files, [ROUTES, VERIFY, SERVER], 'the chain is the real parsed route');
  assert.ok(chain.output.includes(`${ROUTES} -> ${VERIFY} -> ${SERVER}`));
  assert.ok(chain.output.includes('2 hops'));

  const outbound = TOOLS.trace_dependency_path.run({ from: VERIFY }, graph);
  assert.deepEqual(outbound.files, [SERVER]);
  assert.equal(
    outbound.output,
    `Traced 1 outbound import(s): [${SERVER}]`,
    'outbound listing keeps the legacy wording, derived from the node'
  );

  const dead = TOOLS.trace_dependency_path.run({ from: SERVER, to: ROUTES }, graph);
  assert.deepEqual(dead.files, []);
  assert.ok(dead.output.includes('No outbound dependency chain'));
});

test('find_entry_points returns the real zero-incoming nodes', () => {
  const graph = GRAPH;
  const expected = graph.nodes.filter((n) => n.inDegree === 0).map((n) => n.path);

  assert.ok(expected.length > 0, 'the fixture has un-imported files');
  const res = TOOLS.find_entry_points.run({}, graph);
  assert.deepEqual(res.files, expected);
  assert.ok(res.output.includes('Entry points'), 'output names the derived entry points');
});

test('detect_cycles_and_hubs finds real cycles and ranks real hubs', () => {
  const cyclic = buildCyclicGraph();
  const cyclicNodes = cyclic.nodes;
  const expectedHubs = [...cyclicNodes]
    .sort((a, b) => b.totalImpact - a.totalImpact)
    .slice(0, 2)
    .map((n) => n.path);

  const cycRes = TOOLS.detect_cycles_and_hubs.run({}, cyclic);
  assert.equal(cyclic.cycles.length, 1);
  assert.ok(cycRes.output.includes('Circular dependencies: 1'));
  for (const member of cyclic.cycles[0]) {
    assert.ok(cycRes.files.includes(member), `cycle member traced: ${member}`);
  }
  for (const hub of expectedHubs) {
    assert.ok(cycRes.files.includes(hub), `hub traced: ${hub}`);
  }
  assert.match(cycRes.output, /Top hub: .+\((\d+) dependents\)/);

  const acyclicRes = TOOLS.detect_cycles_and_hubs.run({}, GRAPH);
  const acyclicHubs = [...GRAPH.nodes]
    .sort((a, b) => b.totalImpact - a.totalImpact)
    .slice(0, 2)
    .map((n) => n.path);
  assert.ok(acyclicRes.output.includes('Circular dependencies: 0'));
  assert.deepEqual(acyclicRes.files, acyclicHubs, 'files are the two ranked hubs when no cycle exists');
});

test('plan steps are produced by tool executes, not precomputed strings', () => {
  const planA = buildAgentPlan('Where is authentication enforced and which modules call it directly?', GRAPH, chip);
  assert.deepEqual(planA.steps.map((s) => s.tool), ['search_symbols', 'get_file_ast', 'walk_dependents']);
  assert.ok(planA.steps[0].output.includes('Matched'), 'search step output is real matcher text');

  // Two different repositories must produce different, graph-specific outputs
  // for the same question shape — outputs cannot be literals.
  const other = parseRepository(
    [
      {
        path: 'src/lib/auth/guard.ts',
        content:
          "import { tunnel } from '../../lib/db/tunnel';\n\nexport function verifyToken() {\n  return tunnel;\n}",
      },
      { path: 'src/lib/db/tunnel.ts', content: 'export const tunnel = 1;' },
    ],
    { repoName: 'other-app' }
  );
  const planB = buildAgentPlan('Where is authentication enforced and which modules call it directly?', other, chip);

  const targetA = planA.steps.find((s) => s.tool === 'get_file_ast');
  const targetB = planB.steps.find((s) => s.tool === 'get_file_ast');
  assert.equal(targetA.files[0], VERIFY);
  assert.equal(targetB.files[0], 'src/lib/auth/guard.ts');
  assert.notEqual(targetA.output, targetB.output, 'same question, different graph -> different derived output');
  assert.ok(targetA.output.includes(SERVER));
  assert.ok(targetB.output.includes('src/lib/db/tunnel.ts'));
});

// ---------------------------------------------------------------------------
// Ticket 05: one canonical tool-name spelling across spec, docs, and UI copy.
// The registry keys in `TOOLS` are the canonical names; every user-facing
// surface must agree (acceptance: a single spelling per tool across specs/,
// PROJECT.md, and cartograph.html user-facing text).
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const nodePath = require('node:path');

const REPO_ROOT = nodePath.join(__dirname, '..');
const CANONICAL_TOOL_NAMES = Object.keys(TOOLS).sort();

// `detect_cycles` is a substring of `detect_cycles_and_hubs`, so the legacy
// matcher needs a word boundary that cannot sit inside the canonical name
// (`_` keeps `detect_cycles_and_hubs` one word, making the lookahead a
// belt-and-braces guard).
const LEGACY_TOOL_NAME = /\btrace_path\b|\bdetect_cycles\b(?!_and_hubs)/;

function readRepoFile(relativePath) {
  return fs.readFileSync(nodePath.join(REPO_ROOT, relativePath), 'utf8');
}

function assertNoLegacyToolNames(source, fileLabel) {
  const lines = source.split('\n');
  lines.forEach((line, index) => {
    assert.ok(
      !LEGACY_TOOL_NAME.test(line),
      `${fileLabel}:${index + 1} uses a legacy tool spelling: ${line.trim().slice(0, 90)}`
    );
  });
}

test('spec, docs, and UI copy never use the legacy tool spellings', () => {
  assertNoLegacyToolNames(readRepoFile('specs/phase-03-agent-evals.md'), 'specs/phase-03-agent-evals.md');
  assertNoLegacyToolNames(readRepoFile('specs/README.md'), 'specs/README.md');
  assertNoLegacyToolNames(readRepoFile('PROJECT.md'), 'PROJECT.md');
  assertNoLegacyToolNames(readRepoFile('README.md'), 'README.md');
  // The split moved UI copy into app/*.js; the scan follows it.
  for (const [fileLabel, source] of readUiSources()) {
    assertNoLegacyToolNames(source, fileLabel);
  }
});

test('phase-03 spec lists every canonical handler name', () => {
  const spec = readRepoFile('specs/phase-03-agent-evals.md');
  for (const name of CANONICAL_TOOL_NAMES) {
    assert.ok(spec.includes(name), `phase-03 spec names the canonical tool ${name}`);
  }
});

// The app's UI copy lives in cartograph.html's head/markup and the
// app/cartograph-*.js classic scripts (split out 2026-10-27, verbatim,
// original order). Contract checks scan all of them so the split never
// loosens what the tests guarantee.
function readUiSources() {
  const files = [
    'cartograph.html',
    ...fs.readdirSync(nodePath.join(REPO_ROOT, 'app'))
      .filter(f => f.endsWith('.js'))
      .sort()
      .map(f => `app/${f}`),
  ];
  return files.map(f => [f, readRepoFile(f)]);
}

test('the UI AGENT_TOOLS sample lists every canonical handler name', () => {
  const sources = readUiSources();
  const [fileLabel, source] = sources.find(([, s]) => s.includes('export const AGENT_TOOLS = [')) || [null, ''];
  assert.ok(source, `the AGENT_TOOLS sample block exists (searched: ${sources.map(([f]) => f).join(', ')})`);

  const blockStart = source.indexOf('export const AGENT_TOOLS = [');
  const blockEnd = source.indexOf('] as const', blockStart);
  assert.ok(blockEnd !== -1, `${fileLabel}: the AGENT_TOOLS sample block is terminated`);
  const sampleBlock = source.slice(blockStart, blockEnd);

  for (const name of CANONICAL_TOOL_NAMES) {
    assert.ok(
      sampleBlock.includes(`'${name}'`),
      `AGENT_TOOLS sample lists the canonical tool ${name}`
    );
  }
});

test('createModelClient supports OpenAI and Ollama formats with Bearer auth', async () => {
  let capturedUrl = null;
  let capturedHeaders = null;
  let capturedBody = null;

  const mockOpenAiFetch = async (url, init) => {
    capturedUrl = url;
    capturedHeaders = init.headers;
    capturedBody = JSON.parse(init.body);
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [{ message: { content: 'Analysis based on src/lib/db/supabase.ts.' } }],
        };
      },
    };
  };

  const client = createModelClient(
    {
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o',
      apiKey: 'secret-token-xyz',
    },
    mockOpenAiFetch
  );

  const text = await client.complete({ systemPrompt: 'System', userPrompt: 'User' });
  assert.equal(text, 'Analysis based on src/lib/db/supabase.ts.');
  assert.equal(capturedUrl, 'https://api.openai.com/v1/chat/completions');
  assert.equal(capturedHeaders.Authorization, 'Bearer secret-token-xyz');
  assert.equal(capturedBody.model, 'gpt-4o');
  assert.equal(capturedBody.messages[0].content, 'System');

  // Ollama response format
  const mockOllamaFetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        message: { content: 'Ollama response for src/lib/auth/verify.ts.' },
      };
    },
  });

  const ollamaClient = createModelClient(
    { endpoint: 'http://localhost:11434/api/chat', model: 'qwen2.5-coder:7b' },
    mockOllamaFetch
  );
  const ollamaText = await ollamaClient.complete({ systemPrompt: 'Sys', userPrompt: 'Usr' });
  assert.equal(ollamaText, 'Ollama response for src/lib/auth/verify.ts.');

  // Error on non-ok status
  const mockErrorFetch = async () => ({
    ok: false,
    status: 502,
  });
  const errorClient = createModelClient({ endpoint: 'http://localhost:11434/api/chat' }, mockErrorFetch);
  await assert.rejects(
    async () => errorClient.complete({ systemPrompt: '', userPrompt: '' }),
    /Endpoint returned 502/
  );
});

test('queryAgent executes deterministic planning and model synthesis validation', async () => {
  const graph = buildFixtureGraph();

  // 1. Deterministic mode returns pure AST plan
  const deterministicResult = await queryAgent(
    'Where is authentication enforced?',
    graph,
    { chipFormatter: chip, config: { engine: 'deterministic' } }
  );
  assert.equal(deterministicResult.source, 'deterministic');
  assert.equal(deterministicResult.primaryFocus, VERIFY);
  assert.ok(deterministicResult.visitedFiles.includes(VERIFY));

  // 2. Model client with grounded citations accepted
  const groundedClient = {
    async complete() {
      return `Authentication is verified in ${VERIFY} and imported by ${ROUTES}.`;
    },
  };
  const acceptedResult = await queryAgent(
    'Where is authentication enforced?',
    graph,
    { chipFormatter: chip, modelClient: groundedClient }
  );
  assert.equal(acceptedResult.source, 'model');
  assert.ok(acceptedResult.validation.accepted);
  assert.deepEqual(acceptedResult.validation.unknownPaths, []);

  // 3. Model client with hallucinated paths rejected with deterministic fallback
  const hallucinatedClient = {
    async complete() {
      return `Authentication is handled in src/services/fake_auth.ts and ${VERIFY}.`;
    },
  };
  const rejectedResult = await queryAgent(
    'Where is authentication enforced?',
    graph,
    { chipFormatter: chip, modelClient: hallucinatedClient }
  );
  assert.equal(rejectedResult.source, 'deterministic');
  assert.equal(rejectedResult.rejected, true);
  assert.ok(rejectedResult.rejectedPaths.includes('src/services/fake_auth.ts'));
});

test('buildAgentPlan and queryAgent return structured domain models without relying on HTML parsing or mock formatters', async () => {
  const graph = buildFixtureGraph();

  // Test structured plan without any formatter passed (verifying Spec line 205)
  const plan = buildAgentPlan('Where is authentication enforced?', graph);
  assert.equal(plan.question, 'Where is authentication enforced?');
  assert.ok(plan.target, 'target must be populated on structured plan');
  assert.equal(plan.target.path, VERIFY);
  assert.ok(plan.blastRadius, 'blastRadius must be populated');
  assert.deepEqual(plan.blastRadius.hop1Files, [ROUTES]);
  assert.ok(plan.narrative, 'narrative must be populated');
  assert.equal(plan.narrative.headline, `Authentication is enforced in ${VERIFY}`);

  const queryResult = await queryAgent('Where is authentication enforced?', graph);
  assert.equal(queryResult.question, 'Where is authentication enforced?');
  assert.ok(queryResult.target);
  assert.equal(queryResult.target.path, VERIFY);
  assert.ok(queryResult.blastRadius);
  assert.ok(queryResult.narrative);

  // Cycle branch structured plan
  const cyclePlan = buildAgentPlan('detect circular dependencies and bottlenecks', graph);
  assert.equal(cyclePlan.question, 'detect circular dependencies and bottlenecks');
  assert.ok(cyclePlan.target);
  assert.ok(cyclePlan.blastRadius);
  assert.ok(cyclePlan.narrative);
  assert.ok(cyclePlan.narrative.headline);

  // Generic walk structured plan for open questions
  const genericPlan = buildAgentPlan('how does this codebase work', graph);
  assert.equal(genericPlan.question, 'how does this codebase work');
  assert.ok(genericPlan.target);
  assert.ok(genericPlan.blastRadius);
  assert.ok(genericPlan.narrative);
  assert.ok(genericPlan.narrative.headline);
});
