'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseRepository } = require('../lib/cartograph-parser.js');

test('parseRepository resolves relative imports and directory barrels', () => {
  const files = [
    {
      path: 'src/lib/db/index.ts',
      content: 'export const dbClient = {};\nexport function query() {}',
    },
    {
      path: 'src/app/page.tsx',
      content: "import { dbClient } from '../lib/db';\n\nexport default function Page() {}",
    },
    {
      path: 'src/app/other.ts',
      content: "import Page from './page';\n\nexport const other = Page;",
    },
  ];

  const graph = parseRepository(files, { repoName: 'fixture' });

  const pageToDb = graph.edges.find(
    (edge) => edge.source === 'src/app/page.tsx' && edge.target === 'src/lib/db/index.ts'
  );
  assert.ok(pageToDb, 'barrel import ../lib/db should resolve to src/lib/db/index.ts');
  assert.equal(pageToDb.line, 1);
  assert.equal(pageToDb.specifier, '../lib/db');

  const otherToPage = graph.edges.find(
    (edge) => edge.source === 'src/app/other.ts' && edge.target === 'src/app/page.tsx'
  );
  assert.ok(otherToPage, 'implicit extension ./page should resolve to src/app/page.tsx');
  assert.equal(otherToPage.line, 1);
});

test('parseRepository resolves Go package imports and extracts exported symbols', () => {
  const files = [
    {
      path: 'cmd/app/main.go',
      content: [
        'package main',
        '',
        'import (',
        '\t"fmt"',
        '\t"example.com/cartograph/internal/parser"',
        ')',
        '',
        'func main() {}',
      ].join('\n'),
    },
    {
      path: 'internal/cli/cli.go',
      content: 'package cli\n\nimport "example.com/cartograph/internal/parser"\n\nfunc Run() {}',
    },
    {
      path: 'internal/parser/parser.go',
      content: 'package parser\n\nfunc Parse() {}\n\ntype Config struct{}\n\nconst Version = "1"',
    },
    {
      path: 'internal/parser/resolver.go',
      content: 'package parser\n\nfunc Resolve() {}',
    },
    {
      path: 'internal/parser/parser_test.go',
      content: 'package parser\n\nfunc TestParse() {}',
    },
  ];

  const graph = parseRepository(files, { repoName: 'go-fixture' });

  const mainTargets = graph.edges
    .filter((edge) => edge.source === 'cmd/app/main.go')
    .map((edge) => edge.target)
    .sort();
  assert.deepEqual(mainTargets, [
    'internal/parser/parser.go',
    'internal/parser/resolver.go',
  ], 'grouped Go import resolves to production files in the package directory');

  const groupedEdge = graph.edges.find(
    (edge) => edge.source === 'cmd/app/main.go' && edge.target === 'internal/parser/parser.go'
  );
  assert.equal(groupedEdge.line, 5);

  const singleEdge = graph.edges.find(
    (edge) => edge.source === 'internal/cli/cli.go' && edge.target === 'internal/parser/parser.go'
  );
  assert.ok(singleEdge, 'single-line Go import resolves too');
  assert.equal(singleEdge.line, 3);

  const parserNode = graph.nodes.find((node) => node.path === 'internal/parser/parser.go');
  assert.ok(parserNode.exports.includes('Parse()'));
  assert.ok(parserNode.exports.includes('Config'));
  assert.ok(parserNode.exports.includes('Version'));
  assert.ok(
    !graph.edges.some((edge) => edge.target === 'internal/parser/parser_test.go'),
    'package imports do not expand into _test.go files'
  );
});

test('parseRepository detects multi-file dependency cycles, not just 2-cycles', () => {
  const files = [
    { path: 'src/a.ts', content: "import { b } from './b';\nexport const a = 1;" },
    { path: 'src/b.ts', content: "import { c } from './c';\nexport const b = 1;" },
    { path: 'src/c.ts', content: "import { a } from './a';\nexport const c = 1;" },
    { path: 'src/d.ts', content: "import { a } from './a';\nexport const d = 1;" },
    { path: 'src/e.ts', content: "import { f } from './f';\nexport const e = 1;" },
    { path: 'src/f.ts', content: 'export const f = 1;' },
  ];

  const graph = parseRepository(files, { repoName: 'cycle-fixture' });

  assert.equal(graph.cycles.length, 1, 'only the a -> b -> c -> a loop is a cycle');

  const cycle = graph.cycles[0];
  for (const member of ['src/a.ts', 'src/b.ts', 'src/c.ts']) {
    assert.ok(cycle.includes(member), `cycle should include ${member}`);
  }
  assert.ok(!cycle.includes('src/d.ts'), 'a node that only consumes the cycle is not part of it');
  assert.ok(!cycle.includes('src/e.ts'), 'acyclic chains stay out of cycles');
});

test('parseRepository detects 2-cycle loops', () => {
  const files = [
    { path: 'src/x.ts', content: "import { y } from './y';\nexport const x = 1;" },
    { path: 'src/y.ts', content: "import { x } from './x';\nexport const y = 1;" },
  ];

  const graph = parseRepository(files, { repoName: 'two-cycle-fixture' });

  assert.equal(graph.cycles.length, 1);
  assert.deepEqual([...graph.cycles[0]].sort(), ['src/x.ts', 'src/y.ts']);
});

test('parseRepository resolves aliases, tracks unresolved imports, and computes degrees', () => {
  const files = [
    {
      path: 'src/lib/util.ts',
      content: 'export function util() { return 1; }',
    },
    {
      path: 'src/app/uses-alias.ts',
      content: [
        "import { util } from '@/lib/util';",
        "import { util as u2 } from '~/lib/util';",
        "import { util as u3 } from 'src/lib/util';",
        'export const x = util;',
      ].join('\n'),
    },
    {
      path: 'src/app/outside.ts',
      content: ["import React from 'react';", "import { missing } from './missing';", 'export const y = React;'].join('\n'),
    },
  ];

  const graph = parseRepository(files, { repoName: 'alias-fixture' });

  const aliasEdges = graph.edges.filter((edge) => edge.source === 'src/app/uses-alias.ts');
  assert.equal(aliasEdges.length, 3, '@/, ~/, and src/ aliases all resolve');
  assert.ok(aliasEdges.every((edge) => edge.target === 'src/lib/util.ts'));
  assert.deepEqual(aliasEdges.map((edge) => edge.line), [1, 2, 3]);

  assert.deepEqual(
    graph.unresolved.map((item) => [item.specifier, item.kind]).sort(),
    [
      ['./missing', 'internal-unresolved'],
      ['react', 'external-package'],
    ]
  );
  const missing = graph.unresolved.find((item) => item.specifier === './missing');
  assert.equal(missing.source, 'src/app/outside.ts');
  assert.equal(missing.line, 2);

  const utilNode = graph.nodes.find((node) => node.path === 'src/lib/util.ts');
  const aliasNode = graph.nodes.find((node) => node.path === 'src/app/uses-alias.ts');
  assert.equal(utilNode.inDegree, 1, 'in-degree counts unique dependent files');
  assert.equal(utilNode.outDegree, 0);
  assert.equal(aliasNode.inDegree, 0);
  assert.equal(aliasNode.outDegree, 1, 'out-degree counts unique imported files');
});

test('parseRepository resolves Python imports plus dynamic and CommonJS imports', () => {
  const files = [
    {
      path: 'app/db/vector_store.py',
      content: 'class VectorStore:\n    pass\n\nclass _Private:\n    pass\n\nvector_db = VectorStore()',
    },
    {
      path: 'app/api/routes_query.py',
      content: 'from app.db.vector_store import vector_db\n\ndef post_query():\n    return vector_db',
    },
    {
      path: 'app/api/relative.py',
      content: 'from .models import Model\n\ndef use_model():\n    return Model',
    },
    { path: 'src/lazy.ts', content: 'export const lazy = 1;' },
    { path: 'src/legacy.ts', content: 'module.exports = {};' },
    {
      path: 'src/loader.ts',
      content: [
        "const lazy = () => import('./lazy');",
        "const legacy = require('./legacy');",
        'export const loader = { lazy, legacy };',
      ].join('\n'),
    },
  ];

  const graph = parseRepository(files, { repoName: 'mixed-fixture' });

  assert.ok(
    graph.edges.some(
      (edge) => edge.source === 'app/api/routes_query.py' && edge.target === 'app/db/vector_store.py'
    ),
    'dotted Python module path resolves to the .py file'
  );

  const dynamicEdge = graph.edges.find(
    (edge) => edge.source === 'src/loader.ts' && edge.target === 'src/lazy.ts'
  );
  assert.ok(dynamicEdge, 'dynamic import() resolves');
  assert.equal(dynamicEdge.line, 1);

  const requireEdge = graph.edges.find(
    (edge) => edge.source === 'src/loader.ts' && edge.target === 'src/legacy.ts'
  );
  assert.ok(requireEdge, 'CommonJS require() resolves');
  assert.equal(requireEdge.line, 2);

  const relativeUnresolved = graph.unresolved.find(
    (item) => item.source === 'app/api/relative.py' && item.specifier === '.models'
  );
  assert.ok(relativeUnresolved, 'Python relative import is tracked when it cannot resolve');
  assert.equal(relativeUnresolved.kind, 'internal-unresolved');

  const storeNode = graph.nodes.find((node) => node.path === 'app/db/vector_store.py');
  assert.ok(storeNode.exports.includes('VectorStore'));
  assert.ok(!storeNode.exports.includes('_Private'), 'private Python classes are not exports');
});

test('parseRepository applies the 1-hop / 2-hop blast radius definition exactly', () => {
  const files = [
    { path: 'src/core.ts', content: 'export const core = 1;' },
    { path: 'src/direct.ts', content: "import { core } from './core';\nexport const direct = core;" },
    { path: 'src/transitive.ts', content: "import { direct } from './direct';\nexport const transitive = direct;" },
    { path: 'src/far.ts', content: "import { transitive } from './transitive';\nexport const far = transitive;" },
    { path: 'src/outbound.ts', content: "import { core } from './core';\nexport const outbound = core;" },
  ];

  const graph = parseRepository(files, { repoName: 'blast-fixture' });
  const core = graph.nodes.find((node) => node.path === 'src/core.ts');

  assert.deepEqual([...core.hop1Files].sort(), ['src/direct.ts', 'src/outbound.ts']);
  assert.deepEqual(core.hop2Files, ['src/transitive.ts'], '2-hop excludes 1-hop and the selected file');
  assert.equal(core.totalImpact, 3);
  assert.equal(core.inDegree, 2);
  assert.equal(core.outDegree, 0);

  const direct = graph.nodes.find((node) => node.path === 'src/direct.ts');
  assert.deepEqual(direct.hop1Files, ['src/transitive.ts']);
  assert.deepEqual(direct.hop2Files, ['src/far.ts']);
  assert.deepEqual(
    direct.outboundEdges.map((edge) => edge.target),
    ['src/core.ts']
  );
});

test('parseRepository ignores import-like text embedded in string literals', () => {
  const files = [
    { path: 'src/real.ts', content: 'export const real = 1;' },
    {
      path: 'src/snippet.ts',
      content: [
        "const example = \"import { real } from './real';\";",
        "const template = `const x = require('./real')`;",
        'export const snippet = example + template;',
      ].join('\n'),
    },
  ];

  const graph = parseRepository(files, { repoName: 'string-fixture' });

  assert.equal(
    graph.edges.filter((edge) => edge.source === 'src/snippet.ts').length,
    0,
    'quoted code samples are data, not dependencies'
  );
  assert.equal(
    graph.unresolved.filter((item) => item.source === 'src/snippet.ts').length,
    0,
    'quoted code samples are not reported as unresolved imports'
  );
});

test('parseRepository ignores import-like text in block comments and multiline templates', () => {
  const files = [
    { path: 'src/real.ts', content: 'export const real = 1;' },
    {
      path: 'src/commented.ts',
      content: ["/* import { real } from './real'; */", 'export const commented = 1;'].join('\n'),
    },
    {
      path: 'src/multiline.ts',
      content: ["const sample = `", "import { real } from './real';", '`;', 'export const multiline = sample;'].join('\n'),
    },
  ];

  const graph = parseRepository(files, { repoName: 'comment-fixture' });

  assert.equal(graph.edges.filter((edge) => edge.source === 'src/commented.ts').length, 0);
  assert.equal(graph.edges.filter((edge) => edge.source === 'src/multiline.ts').length, 0);
});

test('parseRepository extracts named and default exports', () => {
  const files = [
    { path: 'src/default-fn.ts', content: 'export default function handler() {}' },
    { path: 'src/default-class.ts', content: 'export default class Widget {}' },
    { path: 'src/default-ident.ts', content: 'const thing = 1;\nexport default thing;' },
    { path: 'src/default-anon.ts', content: 'export default () => 1;' },
  ];

  const graph = parseRepository(files, { repoName: 'exports-fixture' });
  const exportsFor = (filePath) => graph.nodes.find((node) => node.path === filePath).exports;

  assert.ok(exportsFor('src/default-fn.ts').includes('handler()'));
  assert.ok(exportsFor('src/default-class.ts').includes('Widget'));
  assert.ok(exportsFor('src/default-ident.ts').includes('thing'));
  assert.ok(exportsFor('src/default-anon.ts').includes('default'));
});

test('CLI scans a folder into a parsed graph and prints a blast-radius report', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { execFileSync } = require('node:child_process');

  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cartograph-cli-'));
  try {
    fs.mkdirSync(path.join(fixtureDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(fixtureDir, 'src', 'db.ts'),
      'export const db = 1;\n'
    );
    fs.writeFileSync(
      path.join(fixtureDir, 'src', 'api.ts'),
      "import { db } from './db';\nexport const api = db;\n"
    );

    const outFile = path.join(fixtureDir, 'snapshot.json');
    const stdout = execFileSync(
      process.execPath,
      [path.join(__dirname, '..', 'cli', 'cartograph-scan.mjs'), fixtureDir, '--out', outFile],
      { encoding: 'utf8' }
    );

    const payload = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    assert.ok(payload.graph, 'snapshot contains a graph');
    assert.ok(
      payload.graph.edges.some(
        (edge) => edge.source === 'src/api.ts' && edge.target === 'src/db.ts'
      ),
      'CLI parses imports, not just file contents'
    );

    const dbNode = payload.graph.nodes.find((node) => node.path === 'src/db.ts');
    assert.equal(dbNode.inDegree, 1);
    assert.equal(dbNode.hop1Files[0], 'src/api.ts');

    assert.match(stdout, /Top blast-radius hotspots/i);
    assert.match(stdout, /src\/db\.ts/);
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('CartographParser returns encapsulated CartographGraph with deep query methods (ADR-006)', () => {
  const files = [
    { path: 'src/core/db.ts', content: 'export const db = 1;' },
    { path: 'src/auth/verify.ts', content: "import { db } from '../core/db';\nexport function verifyToken() {}" },
    { path: 'src/api/routes.ts', content: "import { verifyToken } from '../auth/verify';\nexport function handle() {}" },
    { path: 'src/ui/app.tsx', content: "import { handle } from '../api/routes';\nexport default function App() {}" },
  ];

  const graph = parseRepository(files, { repoName: 'deep-test-repo' });

  // 1. Backward-compatible properties
  assert.equal(graph.name, 'deep-test-repo');
  assert.equal(graph.nodes.length, 4);
  assert.equal(graph.edges.length, 3);
  assert.ok(Array.isArray(graph.cycles));
  assert.ok(Array.isArray(graph.unresolved));

  // 2. getNode and hasNode O(1) lookups
  assert.equal(graph.hasNode('src/core/db.ts'), true);
  assert.equal(graph.hasNode('nonexistent.ts'), false);
  const dbNode = graph.getNode('src/core/db.ts');
  assert.ok(dbNode);
  assert.equal(dbNode.path, 'src/core/db.ts');
  assert.equal(graph.getNode('SRC/CORE/DB.TS')?.path, 'src/core/db.ts', 'Case-insensitive lookup supported');

  // 3. getTopHubs
  const topHubs = graph.getTopHubs(2);
  assert.equal(topHubs.length, 2);
  assert.equal(topHubs[0].path, 'src/core/db.ts'); // Has 3 transitive dependents

  // 4. getBlastRadius (2-hop canonical radius)
  const blast = graph.getBlastRadius('src/core/db.ts');
  assert.equal(blast.totalImpact, 2);
  assert.deepEqual(blast.hop1Files, ['src/auth/verify.ts']);
  assert.deepEqual(blast.hop2Files, ['src/api/routes.ts']);

  // 5. getAuthNodes
  const authNodes = graph.getAuthNodes();
  assert.equal(authNodes.length, 1);
  assert.equal(authNodes[0].path, 'src/auth/verify.ts');

  // 6. findExplicitNode
  assert.equal(graph.findExplicitNode('what happens if db.ts changes')?.path, 'src/core/db.ts');
  assert.equal(graph.findExplicitNode('unrelated text'), null);

  // 7. Layers & Filtering
  assert.ok(graph.getLayers().includes('core'));
  assert.ok(graph.getLayers().includes('api'));
  const coreNodes = graph.getNodesInLayer('core');
  assert.equal(coreNodes.length, 1);
  assert.equal(coreNodes[0].path, 'src/core/db.ts');

  const searchResults = graph.filterByQuery('verify');
  assert.equal(searchResults.length, 1);
  assert.equal(searchResults[0].path, 'src/auth/verify.ts');

  // 8. Summary & Snapshot
  const summary = graph.getSummary();
  assert.equal(summary.nodeCount, 4);
  assert.equal(summary.edgeCount, 3);
  assert.equal(summary.cycleCount, 0);
  assert.equal(summary.topHub?.path, 'src/core/db.ts');

  const snapshot = graph.exportSnapshot();
  assert.equal(snapshot.name, 'deep-test-repo');
  assert.equal(snapshot.graph.nodes.length, 4);
});
