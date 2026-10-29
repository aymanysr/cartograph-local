/* Shared repository intake policy and workspace pipeline. No DOM or CLI I/O. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CartographIntake = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const excluded = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', '__pycache__', 'venv', 'vendor', 'target']);
  const supported = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'go', 'css', 'json']);
  const MAX_FILE_BYTES = 500000;

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
    if (byteLength > MAX_FILE_BYTES) return decision('too-large', normalized);
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

    if (parsed.graph && Array.isArray(parsed.graph.nodes) && Array.isArray(parsed.graph.edges)) {
      return {
        type: 'graph',
        name: parsed.name || (parsed.graph && parsed.graph.name) || 'snapshot',
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

  /**
   * Deepened intake pipeline: process batches of file descriptors uniformly
   * across CLI and Browser adapters.
   */
  function processBatch(entries, options = {}) {
    const list = Array.isArray(entries) ? entries : [];
    const maxBytes = (options && typeof options.maxBytes === 'number') ? options.maxBytes : MAX_FILE_BYTES;
    if (!list.length) {
      return {
        included: [],
        skipped: [],
        summary: { includedCount: 0, skippedCount: 0, countsByReason: {}, displaySkipped: [], omittedCount: 0 },
        sharedRoot: false,
        rootFolder: 'local-project',
        snapshot: null,
      };
    }

    // Single-file JSON snapshot check (Finding F2)
    if (list.length === 1 && String(list[0].path || list[0].name || '').toLowerCase().endsWith('.json')) {
      const snapshot = parseSnapshot(list[0].content);
      if (snapshot) {
        return {
          included: snapshot.type === 'files' ? snapshot.files : [],
          skipped: [],
          summary: { includedCount: snapshot.count, skippedCount: 0, countsByReason: {}, displaySkipped: [], omittedCount: 0 },
          sharedRoot: false,
          rootFolder: snapshot.name,
          snapshot,
        };
      }
    }

    const rawPaths = list.map((e) => (e.webkitRelativePath || e.path || e.name || '').replace(/\\/g, '/'));
    const { sharedRoot, rootFolder, root } = detectSharedRoot(rawPaths);
    const session = createIntakeSession();

    for (let index = 0; index < list.length; index++) {
      const file = list[index];
      const rawPath = rawPaths[index];
      const normalizedPath = (sharedRoot ? rawPath.slice(root.length + 1) : rawPath).split('/').filter(Boolean).join('/');
      const hasSelectedRoot = rawPaths[index].includes('/');
      const policyPath = hasSelectedRoot ? rawPath.slice(rawPath.indexOf('/') + 1) : normalizedPath;
      const reportPrefix = hasSelectedRoot && !sharedRoot ? rawPath.slice(0, rawPath.indexOf('/') + 1) : '';

      const fileSize = Number.isFinite(file.size) ? file.size : 0;
      if (fileSize > maxBytes) {
        session.recordSkipped(reportPrefix + policyPath, 'too-large');
        continue;
      }

      const check = session.checkAndInclude(normalizedPath, policyPath, fileSize, reportPrefix);
      if (check.included) {
        let content = '';
        try {
          content = typeof file.content === 'function' ? file.content() : (file.content || '');
        } catch {
          session.recordSkipped(normalizedPath, 'unreadable');
          continue;
        }
        session.recordIncluded({
          path: normalizedPath,
          content,
        });
      }
    }

    const report = session.getSummary();
    const displaySkipped = report.skipped.slice(0, 100);
    const omittedCount = Math.max(0, report.skipped.length - 100);

    return {
      included: report.included,
      skipped: report.skipped,
      summary: {
        includedCount: report.includedCount,
        skippedCount: report.skippedCount,
        countsByReason: report.counts,
        displaySkipped,
        omittedCount,
      },
      sharedRoot,
      rootFolder,
      snapshot: null,
    };
  }

  /**
   * Discriminate arbitrary input (JSON string or object) into snapshot or raw files.
   */
  function discriminate(content) {
    if (!content) return null;
    const snapshot = parseSnapshot(content);
    if (snapshot) {
      return {
        isSnapshot: true,
        type: snapshot.type,
        payload: snapshot[snapshot.type] || snapshot.graph || snapshot.files || snapshot,
        count: snapshot.count,
        provenance: snapshot.provenance,
      };
    }
    return null;
  }

  return {
    parts,
    checkDirectory,
    checkFile,
    parseSnapshot,
    detectSharedRoot,
    createIntakeSession,
    processBatch,
    discriminate,
  };
});
