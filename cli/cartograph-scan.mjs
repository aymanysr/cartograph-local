#!/usr/bin/env node
/**
 * Cartograph Local CLI Scanner (Zero-Dependency Node.js Script)
 * Usage:
 *   node cli/cartograph-scan.mjs [path/to/repo] [--out cartograph-snapshot.json] [--serve 4173]
 *   node cli/cartograph-scan.mjs [path/to/repo] --file src/lib/db.ts
 *
 * Scans any local directory with the same deterministic parser the browser app
 * uses (`lib/cartograph-parser.js`), writes a Cartograph graph snapshot, prints
 * a terminal blast-radius report, and optionally serves the local Cartograph
 * web app with your repository pre-loaded.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import CartographParser from '../lib/cartograph-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'out', 'coverage',
  '.turbo', '.vercel', '__pycache__', '.venv', 'venv', 'vendor', 'target'
]);

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.css', '.json'
]);

function walkDir(rootDir, currentDir = rootDir, files = []) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
    const fullPath = path.join(currentDir, entry.name);
    const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        walkDir(rootDir, fullPath, files);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (CODE_EXTENSIONS.has(ext)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (content.length <= 500_000) {
            files.push({ path: relPath, content });
          }
        } catch {
          // Skip unreadable binary/locked files
        }
      }
    }
  }
  return files;
}

function parseArgs(argv) {
  const args = {
    targetDir: process.cwd(),
    outFile: 'cartograph-snapshot.json',
    servePort: null,
    focusFile: null,
    top: 10,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out' && argv[i + 1]) {
      args.outFile = argv[++i];
    } else if (arg === '--serve') {
      const port = parseInt(argv[i + 1] || '4173', 10);
      if (!Number.isNaN(port)) {
        args.servePort = port;
        i++;
      } else {
        args.servePort = 4173;
      }
    } else if (arg === '--file' && argv[i + 1]) {
      args.focusFile = argv[++i];
    } else if (arg === '--top' && argv[i + 1]) {
      const top = parseInt(argv[++i], 10);
      if (!Number.isNaN(top) && top > 0) args.top = top;
    } else if (!arg.startsWith('--')) {
      args.targetDir = path.resolve(arg);
    }
  }
  return args;
}

function printBlastRadiusReport(graph, focusFile) {
  const ranked = [...graph.nodes].sort(
    (a, b) => b.totalImpact - a.totalImpact || b.inDegree - a.inDegree || a.path.localeCompare(b.path)
  );

  console.log('\nTop blast-radius hotspots:');
  const top = ranked.slice(0, Math.min(10, ranked.length));
  if (top.length === 0) {
    console.log('  (no files scanned)');
  }
  top.forEach((node, index) => {
    const direct = node.hop1Files.length;
    const twoHop = node.hop2Files.length;
    console.log(
      `  ${String(index + 1).padStart(2)}. ${node.path} — ${node.totalImpact} affected (${direct} direct, ${twoHop} two-hop)`
    );
  });

  if (graph.cycles.length > 0) {
    console.log('\nCircular dependencies:');
    for (const cycle of graph.cycles) {
      console.log(`  - ${cycle.join(' -> ')}`);
    }
  } else {
    console.log('\nCircular dependencies: none');
  }

  const internalUnresolved = graph.unresolved.filter((item) => item.kind === 'internal-unresolved');
  const externalUnresolved = graph.unresolved.length - internalUnresolved.length;
  console.log(
    `\nUnresolved imports: ${externalUnresolved} external package(s), ${internalUnresolved.length} internal`
  );
  for (const item of internalUnresolved.slice(0, 5)) {
    console.log(`  - ${item.source}:${item.line} '${item.specifier}'`);
  }
  if (internalUnresolved.length > 5) {
    console.log(`  ...and ${internalUnresolved.length - 5} more`);
  }

  if (focusFile) {
    const node =
      graph.nodes.find((candidate) => candidate.path === focusFile) ||
      graph.nodes.find((candidate) => candidate.path.endsWith('/' + focusFile)) ||
      graph.nodes.find((candidate) => candidate.path.endsWith(focusFile));

    if (!node) {
      console.log(`\n[Cartograph CLI] File not found in graph: ${focusFile}`);
      return;
    }

    console.log(`\nBlast radius for ${node.path}`);
    console.log(`  Direct dependents (${node.hop1Edges.length} edge${node.hop1Edges.length === 1 ? '' : 's'}):`);
    for (const edge of node.hop1Edges) {
      console.log(`    - ${edge.source} (line ${edge.line}: ${edge.statement})`);
    }
    if (node.hop1Edges.length === 0) console.log('    (none)');

    console.log(`  Two-hop dependents (${node.hop2Files.length}):`);
    for (const detail of node.hop2Details) {
      console.log(`    - ${detail.file} (via ${detail.via}, line ${detail.line})`);
    }
    if (node.hop2Details.length === 0) console.log('    (none)');

    console.log(`  Outbound imports (${node.outboundEdges.length}):`);
    for (const edge of node.outboundEdges) {
      console.log(`    - ${edge.target} (line ${edge.line}: ${edge.statement})`);
    }
    if (node.outboundEdges.length === 0) console.log('    (none)');
  }
}

function serveApp(port, payload) {
  const htmlPath = path.resolve(__dirname, '..', 'cartograph.html');
  const parserPath = path.resolve(__dirname, '..', 'lib', 'cartograph-parser.js');

  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];

    if (url === '/api/local-repo') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(payload));
      return;
    }
    if (url === '/lib/cartograph-parser.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(parserPath));
      return;
    }
    if (url === '/' || url === '/cartograph.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(htmlPath));
      return;
    }
    if (url === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  });

  server.listen(port, () => {
    console.log(`\n[Cartograph CLI] Local UI running at http://localhost:${port}`);
    console.log('[Cartograph CLI] The scanned repository is served at /api/local-repo');
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log(`\n[Cartograph CLI] Scanning repository: ${args.targetDir}`);
  const files = walkDir(args.targetDir);
  const graph = CartographParser.parseRepository(files, {
    repoName: path.basename(args.targetDir) || 'local-repository',
    repoDescription: `Deterministic scan of ${args.targetDir}`,
  });

  const payload = {
    name: graph.name,
    scannedAt: new Date().toISOString(),
    graph,
  };

  const outPath = path.resolve(process.cwd(), args.outFile);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');

  console.log(
    `[Cartograph CLI] Scanned ${files.length} files -> ${graph.nodes.length} nodes, ${graph.edges.length} edges ` +
      `(${graph.cycles.length} cycles, ${graph.unresolved.length} unresolved imports)`
  );
  console.log(`[Cartograph CLI] Snapshot written to ${outPath}`);

  printBlastRadiusReport(graph, args.focusFile);

  console.log(
    `\n[Cartograph CLI] Tip: drag-and-drop ${path.basename(outPath)} into cartograph.html, ` +
      'or use --serve to open the UI with this graph pre-loaded.'
  );

  if (args.servePort) {
    serveApp(args.servePort, payload);
  }
}

main();
