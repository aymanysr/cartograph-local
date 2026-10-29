/* Shared repository intake policy and workspace pipeline. No DOM or CLI I/O. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CartographIntake = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const excluded = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', '__pycache__', 'venv', 'vendor', 'target']);
  const supported = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'go', 'css', 'json']);

  function parts(path) {
    return String(path).replace(/\\/g, '/').split('/').filter(Boolean);
  }

  function decision(reason = null, skippedPath = null) {
    return { include: reason === null, reason, skippedPath };
  }

  function checkDirectory(path) {
    const segments = parts(path);
    for (let i = 0; i < segments.length; i++) {
      const prefix = segments.slice(0, i + 1).join('/');
      if (segments[i].startsWith('.')) return decision('hidden', prefix);
      if (excluded.has(segments[i])) return decision('excluded-directory', prefix);
    }
    return decision();
  }

  function checkFile(path, byteLength) {
    const segments = parts(path);
    const directory = checkDirectory(segments.slice(0, -1).join('/'));
    if (!directory.include) return directory;
    const normalized = segments.join('/');
    const name = segments[segments.length - 1] || '';
    if (name.startsWith('.')) return decision('hidden', normalized);
    const dot = name.lastIndexOf('.');
    if (dot < 0 || !supported.has(name.slice(dot + 1).toLowerCase())) return decision('unsupported', normalized);
    if (byteLength > 500000) return decision('too-large', normalized);
    return decision();
  }

  /**
   * Discriminate and parse Cartograph snapshot formats.
   * Recognizes:
   * 1. Direct parsed graph snapshot: `{ graph: { nodes, edges, ... } }`
   * 2. Raw files snapshot: `{ files: [ { path, content }, ... ] }`
   * Returns null if unparseable or not a Cartograph snapshot.
   */
  function parseSnapshot(data) {
    let parsed = data;
    if (typeof data === 'string') {
      try {
        parsed = JSON.parse(data);
      } catch {
        return null;
      }
    }
    if (!parsed || typeof parsed !== 'object') return null;

    if (parsed.graph && Array.isArray(parsed.graph.nodes)) {
      return {
        type: 'graph',
        name: parsed.name || parsed.graph.name || 'snapshot',
        graph: parsed.graph,
        count: parsed.graph.nodes.length,
        provenance: {
          kind: 'snapshot',
          scannedAt: parsed.scannedAt || (parsed.graph && parsed.graph.scannedAt) || null,
        },
      };
    }

    if (Array.isArray(parsed.files)) {
      return {
        type: 'files',
        name: parsed.name || 'imported-snapshot',
        files: parsed.files,
        count: parsed.files.length,
        provenance: {
          kind: 'snapshot',
          scannedAt: parsed.scannedAt || null,
        },
      };
    }

    return null;
  }

  /**
   * Detect whether an array of relative paths share a single common root folder.
   */
  function detectSharedRoot(relativePaths) {
    if (!relativePaths || !relativePaths.length) {
      return { sharedRoot: false, rootFolder: 'local-project', root: '' };
    }
    const cleanPaths = relativePaths.map((p) => String(p || '').replace(/\\/g, '/'));
    const firstSlash = cleanPaths[0].indexOf('/');
    const root = firstSlash >= 0 ? cleanPaths[0].slice(0, firstSlash) : '';
    const sharedRoot =
      !!root &&
      cleanPaths.every((p) => p.includes('/') && p.slice(0, p.indexOf('/')) === root);
    const rootFolder = sharedRoot ? root : 'local-project';
    return { sharedRoot, rootFolder, root };
  }

  /**
   * Encapsulate intake state: skip deduplication, duplicate tracking,
   * excluded-directory collapsing, and summary counts.
   */
  function createIntakeSession() {
    const included = [];
    const skipped = [];
    const seen = new Set();
    const reported = new Set();

    function skip(path, reason, isDirectory = false) {
      const key = `${reason}:${path}`;
      if (!isDirectory || !reported.has(key)) {
        skipped.push({ path, reason });
        reported.add(key);
      }
    }

    function checkAndInclude(normalizedPath, policyPath, size, reportPrefix = '') {
      const decision = checkFile(policyPath, size);
      if (!decision.include) {
        skip(
          reportPrefix + decision.skippedPath,
          decision.reason,
          decision.skippedPath !== policyPath
        );
        return { included: false, reason: decision.reason };
      }
      if (seen.has(normalizedPath)) {
        skip(normalizedPath, 'duplicate');
        return { included: false, reason: 'duplicate' };
      }
      seen.add(normalizedPath);
      return { included: true, path: normalizedPath };
    }

    function recordSkipped(path, reason, isDirectory = false) {
      skip(path, reason, isDirectory);
    }

    function recordIncluded(entry) {
      included.push(entry);
    }

    function getSummary() {
      const counts = {};
      for (const entry of skipped) {
        counts[entry.reason] = (counts[entry.reason] || 0) + 1;
      }
      return {
        included,
        skipped,
        counts,
        includedCount: included.length,
        skippedCount: skipped.length,
      };
    }

    return {
      checkAndInclude,
      recordSkipped,
      recordIncluded,
      getSummary,
      seen,
      skipped,
      included,
    };
  }

  return {
    parts,
    checkDirectory,
    checkFile,
    parseSnapshot,
    detectSharedRoot,
    createIntakeSession,
  };
});
