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
import CartographIntake from '../lib/cartograph-intake.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function walkDir(rootDir, skipped) {
  const files = [], seen = new Set();
  function walk(currentDir, relative = '') {
    let entries;
    try {
      if (!fs.lstatSync(currentDir).isDirectory()) throw new Error('Root must be a directory, not a file or symlink');
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (error) {
      if (!relative) throw new Error(`Cannot scan repository "${rootDir}": ${error.message}`);
      skipped.push({ path: relative.replace(/\\/g, '/'), reason: 'unreadable' });
      return;
    }
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      // Keep literal filesystem names for I/O; graph/report paths use normalized separators.
      const filesystemRelative = relative ? `${relative}/${entry.name}` : entry.name;
      const relPath = filesystemRelative.replace(/\\/g, '/').split('/').filter(Boolean).join('/');
      if (entry.isSymbolicLink()) { skipped.push({ path: relPath, reason: 'symlink' }); continue; }
      const decision = entry.isDirectory() ? CartographIntake.checkDirectory(relPath) : CartographIntake.checkFile(relPath, 0);
      if (!decision.include) { skipped.push({ path: decision.skippedPath, reason: decision.reason }); continue; }
      if (entry.isDirectory()) { walk(fullPath, filesystemRelative); continue; }
      if (!entry.isFile()) { skipped.push({ path: relPath, reason: 'unsupported' }); continue; }
      if (seen.has(relPath)) { skipped.push({ path: relPath, reason: 'duplicate' }); continue; }
      seen.add(relPath);
      let descriptor;
      try {
        // O_NOFOLLOW also rejects a file replaced by a symlink after readdir.
        descriptor = fs.openSync(fullPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        const stat = fs.fstatSync(descriptor);
        if (!stat.isFile()) throw new Error('Not a regular file');
        let decision = CartographIntake.checkFile(relPath, stat.size);
        if (decision.include) {
          const bytes = fs.readFileSync(descriptor);
          decision = CartographIntake.checkFile(relPath, bytes.length);
          if (decision.include) files.push({ path: relPath, content: bytes.toString('utf8') });
        }
        if (!decision.include) skipped.push({ path: decision.skippedPath, reason: decision.reason });
      } catch {
        skipped.push({ path: relPath, reason: 'unreadable' });
      } finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
    }
  }
  walk(rootDir);
  return files;
}

function printIntakeReport(files, skipped) {
  const counts = {};
  for (const entry of skipped) counts[entry.reason] = (counts[entry.reason] || 0) + 1;
  console.log(`[Cartograph CLI] Intake: ${files.length} included, ${skipped.length} skipped entries`);
  if (skipped.length) {
    console.log(`  Reasons: ${Object.entries(counts).map(([reason, count]) => `${reason}: ${count}`).join(', ')}`);
    for (const entry of skipped.slice(0, 100)) console.log(`  - ${entry.path} (${entry.reason})`);
    if (skipped.length > 100) console.log(`  … ${skipped.length - 100} more skipped entries not displayed`);
    console.log('  Excluded directories count as one entry; their contents were not scanned.');
  }
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

function printBlastRadiusReport(graph, focusFile, topN = 10) {
  const ranked = [...graph.nodes].sort(
    (a, b) => b.totalImpact - a.totalImpact || b.inDegree - a.inDegree || a.path.localeCompare(b.path)
  );

  console.log('\nTop blast-radius hotspots:');
  const top = ranked.slice(0, Math.min(topN, ranked.length));
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
  // Classic scripts the app loads from disk. Served dynamically so adding
  // a lib/app file never requires touching this route again; the pattern
  // rejects path traversal (no dots or slashes inside the remainder).
  const scriptPattern = /^\/((?:lib|app)\/[A-Za-z0-9_-]+\.js)$/;

  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];

    if (url === '/api/local-repo') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(payload));
      return;
    }
    const scriptMatch = url.match(scriptPattern);
    if (scriptMatch) {
      const fullPath = path.resolve(__dirname, '..', scriptMatch[1]);
      if (fs.existsSync(fullPath)) {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(fs.readFileSync(fullPath));
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
      }
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
  const skipped = [];
  let files;
  try { files = walkDir(args.targetDir, skipped); }
  catch (error) { console.error(`[Cartograph CLI] ${error.message}`); process.exitCode = 1; return; }
  printIntakeReport(files, skipped);
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

  printBlastRadiusReport(graph, args.focusFile, args.top);

  console.log(
    `\n[Cartograph CLI] Tip: drag-and-drop ${path.basename(outPath)} into cartograph.html, ` +
      'or use --serve to open the UI with this graph pre-loaded.'
  );

  if (args.servePort) {
    serveApp(args.servePort, payload);
  }
}

main();
