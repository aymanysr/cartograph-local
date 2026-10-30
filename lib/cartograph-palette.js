/**
 * Cartograph Command Palette Engine (lib/cartograph-palette.js)
 *
 * Zero dependencies. No DOM or CLI I/O.
 * Shared pure engine for fuzzy command & file searching, ranking,
 * Unicode codepoint tie-breaking, and keyboard selection navigation.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CartographPalette = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_MAX_RESULTS = 50;

  /**
   * Compare paths deterministically by Unicode code points.
   */
  function comparePalettePaths(a, b) {
    const left = Array.from(String(a || ''));
    const right = Array.from(String(b || ''));
    for (let i = 0; i < Math.min(left.length, right.length); i++) {
      const difference = left[i].codePointAt(0) - right[i].codePointAt(0);
      if (difference) return difference;
    }
    return left.length - right.length;
  }

  /**
   * Rank a file path against a search needle:
   * 0: exact match
   * 1: basename starts with needle
   * 2: full path substring match
   * 3: subsequence match (including supplementary Unicode)
   * -1: no match
   */
  function rankFilePath(needle, path) {
    const target = String(path || '');
    const cleanNeedle = String(needle || '').trim().toLowerCase();
    if (!cleanNeedle) return 2; // match all when needle is empty
    const lower = target.toLowerCase();
    if (lower === cleanNeedle) return 0;
    if (lower.split('/').pop().startsWith(cleanNeedle)) return 1;
    if (lower.includes(cleanNeedle)) return 2;

    const characters = Array.from(cleanNeedle);
    let index = 0;
    for (const character of Array.from(lower)) {
      if (character === characters[index]) index++;
      if (index === characters.length) break;
    }
    return index === characters.length ? 3 : -1;
  }

  /**
   * Query palette items (actions and files) with deterministic ranking.
   */
  function queryPalette(query, mode, options = {}) {
    const needle = String(query || '').trim().toLowerCase();
    const max = typeof options.maxResults === 'number' ? options.maxResults : DEFAULT_MAX_RESULTS;

    const filesSource = typeof options.getFiles === 'function'
      ? options.getFiles()
      : (Array.isArray(options.files) ? options.files : []);

    const actionsSource = (mode === 'files')
      ? []
      : (typeof options.getActions === 'function'
          ? options.getActions()
          : (Array.isArray(options.actions) ? options.actions : []));

    const actions = actionsSource
      .filter(action => !needle || action.label.toLowerCase().includes(needle))
      .map(({ id, label, available, reason, run }) => ({
        id,
        kind: 'action',
        label,
        available: Boolean(available),
        reason: available ? '' : (reason || ''),
        run,
      }));

    const files = filesSource
      .map(entry => {
        const path = typeof entry === 'string' ? entry : entry.path;
        return { path, rank: rankFilePath(needle, path) };
      })
      .filter(item => item.rank >= 0)
      .sort((a, b) => a.rank - b.rank || comparePalettePaths(a.path, b.path))
      .map(item => ({
        id: 'file-' + item.path,
        kind: 'file',
        label: item.path,
        path: item.path,
        available: true,
        reason: '',
      }));

    const all = actions.concat(files);
    return {
      results: all.slice(0, max),
      matchCount: all.length,
    };
  }

  /**
   * State machine engine managing search query, mode, results, and active selection.
   */
  function createPaletteEngine(config = {}) {
    let mode = 'commands';
    let query = '';
    let results = [];
    let matchCount = 0;
    let activeIndex = -1;

    function search(newQuery = query, newMode = mode) {
      query = newQuery;
      mode = newMode === 'files' ? 'files' : 'commands';
      const queried = queryPalette(query, mode, config);
      results = queried.results;
      matchCount = queried.matchCount;

      const available = getAvailableIndices();
      if (!results[activeIndex]?.available) {
        activeIndex = available.length ? available[0] : -1;
      }
      return { results, matchCount, activeIndex };
    }

    function getAvailableIndices() {
      return results
        .map((item, idx) => (item.available ? idx : -1))
        .filter(idx => idx >= 0);
    }

    function navigate(direction) {
      const available = getAvailableIndices();
      if (!available.length) {
        activeIndex = -1;
        return activeIndex;
      }
      const currentPos = available.indexOf(activeIndex);
      const delta = (direction === 'ArrowUp' || direction === 'up') ? -1 : 1;
      const nextPos = (currentPos + delta + available.length) % available.length;
      activeIndex = available[nextPos];
      return activeIndex;
    }

    function getActiveItem() {
      return (activeIndex >= 0 && activeIndex < results.length) ? results[activeIndex] : null;
    }

    return {
      search,
      navigate,
      getActiveItem,
      getResults: () => results,
      getMatchCount: () => matchCount,
      getActiveIndex: () => activeIndex,
      setActiveIndex: (idx) => { activeIndex = idx; },
      getMode: () => mode,
      setMode: (m) => { mode = m; },
      getQuery: () => query,
      setQuery: (q) => { query = q; },
      comparePalettePaths,
      rankFilePath,
    };
  }

  return {
    DEFAULT_MAX_RESULTS,
    comparePalettePaths,
    rankFilePath,
    queryPalette,
    createPaletteEngine,
  };
});
