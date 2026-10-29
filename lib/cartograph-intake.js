/* Shared repository intake policy. No I/O, DOM, parser or snapshot handling. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CartographIntake = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const excluded = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', '__pycache__', 'venv', 'vendor', 'target']);
  const supported = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'go', 'css', 'json']);
  function parts(path) { return String(path).replace(/\\/g, '/').split('/').filter(Boolean); }
  function decision(reason = null, skippedPath = null) { return { include: reason === null, reason, skippedPath }; }
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
  return { checkDirectory, checkFile };
});
