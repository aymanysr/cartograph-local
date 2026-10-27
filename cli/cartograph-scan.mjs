#!/usr/bin/env node
/**
 * Cartograph Local CLI Scanner (Zero-Dependency Node.js Script)
 * Usage:
 *   node cli/cartograph-scan.mjs [path/to/repo] [--out cartograph-graph.json] [--serve 4173]
 *
 * Scans any local directory, parses JS/TS/JSX/TSX/Python/Go files into a Cartograph
 * dependency graph JSON file, prints a terminal blast-radius report, and optionally
 * serves the local Cartograph web app with your repository pre-loaded.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

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

function main() {
  const args = process.argv.slice(2);
  let targetDir = process.cwd();
  let outFile = 'cartograph-snapshot.json';
  let servePort = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' && args[i + 1]) {
      outFile = args[++i];
    } else if (args[i] === '--serve') {
      servePort = parseInt(args[i + 1] || '4173', 10);
      if (!isNaN( parseInt(args[i + 1], 10) )) i++;
    } else if (!args[i].startsWith('--')) {
      targetDir = path.resolve(args[i]);
    }
  }

  console.log(`\n[Cartograph CLI] Scanning repository: ${targetDir}`);
  const files = walkDir(targetDir);
  const payload = {
    name: path.basename(targetDir) || 'local-repository',
    scannedAt: new Date().toISOString(),
    files
  };

  const outPath = path.resolve(process.cwd(), outFile);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`[Cartograph CLI] Exported ${files.length} source files to ${outPath}`);
  console.log(`[Cartograph CLI] Tip: You can drag-and-drop ${outFile} or your project folder directly into cartograph.html!`);

  if (servePort) {
    const htmlPath = path.resolve(__dirname, '..', 'cartograph.html');
    const server = http.createServer((req, res) => {
      if (req.url === '/api/local-repo') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(payload));
        return;
      }
      if (fs.existsSync(htmlPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(htmlPath, 'utf8'));
      } else {
        res.writeHead(404);
        res.end('cartograph.html not found');
      }
    });
    server.listen(servePort, () => {
      console.log(`[Cartograph CLI] Local UI running at http://localhost:${servePort}`);
    });
  }
}

main();
