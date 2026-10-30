/**
 * Cartograph Shell Coordinator — Pure state and event coordinator for shell actions,
 * command palette navigation, keyboard shortcuts, and responsive layouts.
 *
 * Zero DOM dependencies. Fully testable in pure Node.js environments.
 * Shared between web app shell (app/cartograph-app-shell.js) and test suites.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CartographShellCoordinator = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function computeActionRegistry(state, runners = {}) {
    const s = state || {};
    const graph = s.graph || { nodes: [], edges: [], cycles: [] };
    const nodes = graph.nodes || [];
    const hasNodes = nodes.length > 0;
    const selected = hasNodes && nodes.some(node => node.path === s.selectedFile);
    const actions = [];

    const add = (id, label, run, available = true, reason = '') => {
      actions.push({
        id,
        label,
        run: runners[id] || run || (() => {}),
        available,
        reason: available ? '' : reason,
      });
    };

    // Views
    [
      ['explorer', 'Map'],
      ['evals', 'Evals'],
      ['specs', 'Docs']
    ].forEach(([view, label]) => {
      add('view-' + view, 'Open ' + label, () => runners.switchMainView && runners.switchMainView(view));
    });

    // Layers
    [
      ['all', 'All'],
      ['entry', 'Entry Points'],
      ['core', 'DB & Core'],
      ['parser', 'Parser'],
      ['agent', 'Agent'],
      ['api', 'Routes'],
      ['ui', 'UI']
    ].forEach(([layer, label]) => {
      const isCur = s.layerFilter === layer;
      add('layer-' + layer, 'Layer: ' + label + (isCur ? ' (current)' : ''), () => runners.setLayerFilter && runners.setLayerFilter(layer));
    });

    add('entry-points', 'Filter: Entry Points (roots with 0 callers)', () => runners.setLayerFilter && runners.setLayerFilter('entry'), hasNodes, 'Load files to find entry points');

    if (graph.cycles && graph.cycles.length > 0) {
      const count = graph.cycles.length;
      add('cycle-guide', `Circular Dependency Fixer Guide (${count} cycle${count === 1 ? '' : 's'})`, () => runners.openCycleFixerModal && runners.openCycleFixerModal());
    }

    // Layouts
    const isCurLayout = mode => (mode === 'dag-lr' && (s.graphLayout === 'dag' || s.graphLayout === 'dag-lr'))
      || (mode === 'dag-tb' && s.graphLayout === 'dag-tb')
      || (mode === 'cluster' && (s.graphLayout === 'force' || s.graphLayout === 'cluster'));

    [
      ['dag-lr', 'Pipeline (Left-to-Right)'],
      ['dag-tb', 'Tree (Top-to-Bottom)'],
      ['cluster', 'Directory Clusters']
    ].forEach(([layout, label]) => {
      add('layout-' + layout, 'Layout: ' + label + (isCurLayout(layout) ? ' (current)' : ''), () => runners.setGraphLayout && runners.setGraphLayout(layout), hasNodes, 'Load files to change layout');
    });

    // Actions
    add('isolate', 'Isolate impact (' + (s.isolateBlastRadius ? 'on' : 'off') + ')', () => runners.toggleIsolateBlastRadius && runners.toggleIsolateBlastRadius(), selected, 'Select a file first');
    add('simulate', 'Simulate breaking change (' + (s.simulateBreakingChange ? 'on' : 'off') + ')', () => runners.toggleBreakSimulation && runners.toggleBreakSimulation(), selected, 'Select a file first');
    add('highest-impact', 'Go to highest-impact file', () => runners.selectTopHotspot && runners.selectTopHotspot(), hasNodes, 'Load files to find the highest-impact file');
    add('fit', 'Fit map', () => runners.resetGraphView && runners.resetGraphView(), hasNodes, 'Load files to fit the map');
    add('zoom-out', 'Zoom out', () => runners.zoomGraph && runners.zoomGraph(0.83), hasNodes, 'Load files to zoom');
    add('zoom-in', 'Zoom in', () => runners.zoomGraph && runners.zoomGraph(1.2), hasNodes, 'Load files to zoom');
    add('export', 'Export JSON', () => runners.exportGraphSnapshot && runners.exportGraphSnapshot());
    add('folder', 'Open folder', () => runners.triggerFolderUpload && runners.triggerFolderUpload());
    add('add-file', 'Add file', () => runners.openAddFileModal && runners.openAddFileModal());
    add('settings', 'Agent settings', () => runners.openSettingsModal && runners.openSettingsModal());
    add('files', 'Find file', () => runners.openCommandPalette && runners.openCommandPalette('files'));
    add('help', 'Help: map controls', () => runners.showToast && runners.showToast('Arrows point from importing file to imported file. Drag a card to move it; drag the background to pan. Scroll to zoom. Use Fit to show all files.'));
    add('clear-folder-focus', 'Clear folder focus' + (s.folderFilter ? ' (' + s.folderFilter + ')' : ''), () => runners.clearFolderFocus && runners.clearFolderFocus(), Boolean(s.folderFilter), 'No folder is currently focused');

    if (hasNodes) {
      const folders = Array.from(new Set(nodes.map(n => n.folder || '/'))).sort();
      folders.forEach(f => {
        const isFoc = s.folderFilter === f;
        add('focus-folder-' + f, (isFoc ? 'Unfocus folder: ' : 'Focus folder: ') + f, () => runners.focusFolder && runners.focusFolder(f));
      });
    }

    return actions;
  }

  function computePaletteNavigation(results, currentIndex, key) {
    if (!results || !results.length) return -1;
    const available = [];
    for (let i = 0; i < results.length; i++) {
      if (results[i] && results[i].available) {
        available.push(i);
      }
    }
    if (!available.length) return -1;

    const currentPos = available.indexOf(currentIndex);
    if (key === 'ArrowDown') {
      if (currentPos === -1) return available[0];
      return available[(currentPos + 1) % available.length];
    } else if (key === 'ArrowUp') {
      if (currentPos === -1) return available[available.length - 1];
      return available[(currentPos - 1 + available.length) % available.length];
    }
    return currentIndex;
  }

  function parseKeyboardShortcut(event) {
    if (!event || event.isComposing || event.keyCode === 229) return null;
    const key = String(event.key || '').toLowerCase();
    const isModifier = Boolean(event.metaKey || event.ctrlKey);
    if (isModifier && key === 'k') return 'commands';
    if (isModifier && key === 'p') return 'files';
    return null;
  }

  function computeResponsiveLayout(width, opts = {}) {
    const w = typeof width === 'number' ? width : 1200;
    const phone = w <= 640;
    const desktop = w > 1100;
    const activeView = opts.activeView || 'explorer';
    const isExplorer = activeView === 'explorer';
    const phonePane = opts.phonePane || 'map';
    const inspectorCollapsed = Boolean(opts.inspectorCollapsed);
    const hasSelection = Boolean(opts.hasSelection);

    return {
      phone,
      desktop,
      showCompactMapTools: isExplorer && !phone && !desktop,
      showPhonePaneTabs: isExplorer && phone,
      fileBrowserVisible: phonePane === 'files',
      mapRegionVisible: phonePane === 'map',
      inspectorRegionVisible: phonePane === 'impact' || phonePane === 'ask',
      inspectorDisplay: desktop && inspectorCollapsed ? 'none' : '',
      btnSimulateDisabled: !hasSelection,
      btnToggleIsolateDisabled: !hasSelection,
      metricCycleBadgeDisabled: phone,
    };
  }

  return {
    computeActionRegistry,
    computePaletteNavigation,
    parseKeyboardShortcut,
    computeResponsiveLayout,
  };
});
