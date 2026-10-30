const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const CartographSpecs = require('../lib/cartograph-specs.js');
const CartographParser = require('../lib/cartograph-parser.js');

test('CartographSpecs exports public API and default layer configuration', () => {
  assert.equal(typeof CartographSpecs.generateProjectSpec, 'function');
  assert.equal(typeof CartographSpecs.generateClaudeRules, 'function');
  assert.equal(typeof CartographSpecs.generateCliSnippet, 'function');
  assert.equal(typeof CartographSpecs.generateSpecDocs, 'function');
  assert.ok(CartographSpecs.DEFAULT_LAYER_LABELS);
  assert.equal(CartographSpecs.DEFAULT_LAYER_LABELS.core, 'DB & Core');
  assert.equal(CartographSpecs.DEFAULT_LAYER_LABELS.ui, 'UI & Entry');
});

test('generateProjectSpec formats metrics, layers, and top hotspots deterministically', () => {
  const files = [
    { path: 'src/db.ts', content: 'export const db = 1;' },
    { path: 'src/auth.ts', content: "import { db } from './db'; export const auth = 2;" },
    { path: 'src/app.ts', content: "import { auth } from './auth'; export const app = 3;" },
  ];
  const graph = CartographParser.parseRepository(files, { repoName: 'test-repo', repoDescription: 'Test Repo Description' });

  const spec = CartographSpecs.generateProjectSpec(graph, { repoName: 'test-repo', repoDescription: 'Test Repo Description' });
  assert.match(spec, /# PROJECT\.md — test-repo \(Architecture & Context Spec\)/);
  assert.match(spec, /Test Repo Description/);
  assert.match(spec, /- \*\*Parsed Source Files\*\*: 3/);
  assert.match(spec, /- \*\*Verified Internal Import Edges\*\*: 2/);
  assert.match(spec, /- \*\*Circular Dependencies\*\*: 0/);
  assert.match(spec, /High-Blast-Radius Hotspots/);
  assert.match(spec, /`src\/db\.ts`/);
  assert.match(spec, /No Unverified AI Connections/);
});

test('generateClaudeRules reports active tech debt on cycles and DAG invariant on acyclic graphs', () => {
  const acyclicFiles = [
    { path: 'src/a.ts', content: 'export const a = 1;' },
    { path: 'src/b.ts', content: "import { a } from './a'; export const b = 2;" },
  ];
  const acyclicGraph = CartographParser.parseRepository(acyclicFiles, { repoName: 'acyclic-repo' });
  const acyclicRules = CartographSpecs.generateClaudeRules(acyclicGraph, { repoName: 'acyclic-repo' });
  assert.match(acyclicRules, /# CLAUDE\.md — Agent Engineering Rules for acyclic-repo/);
  assert.match(acyclicRules, /- \*\*DAG Invariant\*\*: Keep Circular Dependencies at 0\./);

  const cyclicFiles = [
    { path: 'src/c1.ts', content: "import { c2 } from './c2'; export const c1 = 1;" },
    { path: 'src/c2.ts', content: "import { c1 } from './c1'; export const c2 = 2;" },
  ];
  const cyclicGraph = CartographParser.parseRepository(cyclicFiles, { repoName: 'cyclic-repo' });
  const cyclicRules = CartographSpecs.generateClaudeRules(cyclicGraph, { repoName: 'cyclic-repo' });
  assert.match(cyclicRules, /Active Tech Debt Alert/);
  assert.match(cyclicRules, /Resolve the circular dependency between `src\/c1\.ts` and `src\/c2\.ts`/);
});

test('generateCliSnippet returns valid standalone scanner script', () => {
  const snippet = CartographSpecs.generateCliSnippet();
  assert.match(snippet, /^#!\/usr\/bin\/env node/);
  assert.match(snippet, /CartographParser\.parseRepository/);
  assert.match(snippet, /scanLocalRepo/);
});

test('generateSpecDocs returns all three documents in dictionary', () => {
  const files = [
    { path: 'src/main.ts', content: 'export const main = 1;' }
  ];
  const graph = CartographParser.parseRepository(files, { repoName: 'sample' });
  const docs = CartographSpecs.generateSpecDocs(graph, { repoName: 'sample' });

  assert.ok(docs['PROJECT.md']);
  assert.ok(docs['CLAUDE.md']);
  assert.ok(docs['cartograph-scan.mjs']);
  assert.match(docs['PROJECT.md'], /sample/);
  assert.match(docs['CLAUDE.md'], /sample/);
});

test('generateProjectSpec and generateClaudeRules tolerate empty or degenerate graphs', () => {
  const emptyGraph = { nodes: [], edges: [], cycles: [] };
  const spec = CartographSpecs.generateProjectSpec(emptyGraph);
  const rules = CartographSpecs.generateClaudeRules(emptyGraph);

  assert.match(spec, /# PROJECT\.md — repository/);
  assert.match(spec, /- \*\*Parsed Source Files\*\*: 0/);
  assert.match(rules, /# CLAUDE\.md — Agent Engineering Rules for repository/);
  assert.match(rules, /- \*\*DAG Invariant\*\*: Keep Circular Dependencies at 0\./);
});

test('CLI supports --specs flag to write PROJECT.md and CLAUDE.md', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cartograph-specs-test-'));
  const specsOutDir = path.join(tmpDir, 'specs-output');
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  fs.writeFileSync(path.join(tmpDir, 'core.ts'), 'export const core = 1;');
  fs.writeFileSync(path.join(tmpDir, 'service.ts'), "import { core } from './core'; export const service = 2;");

  const snapshotOut = path.join(tmpDir, 'snapshot.json');
  const cli = spawnSync(
    process.execPath,
    ['cli/cartograph-scan.mjs', tmpDir, '--out', snapshotOut, '--specs', specsOutDir],
    { encoding: 'utf8' }
  );

  assert.equal(cli.status, 0, cli.stderr);
  assert.ok(fs.existsSync(path.join(specsOutDir, 'PROJECT.md')));
  assert.ok(fs.existsSync(path.join(specsOutDir, 'CLAUDE.md')));

  const projectContent = fs.readFileSync(path.join(specsOutDir, 'PROJECT.md'), 'utf8');
  assert.match(projectContent, /# PROJECT\.md/);
  assert.match(projectContent, /core\.ts/);

  const claudeContent = fs.readFileSync(path.join(specsOutDir, 'CLAUDE.md'), 'utf8');
  assert.match(claudeContent, /# CLAUDE\.md/);
});
