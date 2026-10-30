// Moved verbatim from cartograph.html (split preserved original file order).
// app-shell: see cartograph.html; loads as a classic script after the lib/ files.
    function regenerateSpecDocs() {
      if (typeof CartographSpecs !== 'undefined') {
        const docs = CartographSpecs.generateSpecDocs(state.graph, {
          repoName: state.repoName,
          repoDescription: state.repoDescription,
          layerLabels: {
            core: typeof getLayerMeta === 'function' ? getLayerMeta('core').label : 'DB & Core',
            parser: typeof getLayerMeta === 'function' ? getLayerMeta('parser').label : 'Parser Engine',
            agent: typeof getLayerMeta === 'function' ? getLayerMeta('agent').label : 'Agent & Evals',
            api: typeof getLayerMeta === 'function' ? getLayerMeta('api').label : 'API & Auth',
            ui: typeof getLayerMeta === 'function' ? getLayerMeta('ui').label : 'UI & Entry',
          }
        });
        Object.assign(state.specDocs, docs);
      }

      const textarea = document.getElementById('specDocTextarea');
      if (textarea) {
        textarea.value = state.specDocs[state.activeSpecDoc] || '';
        selectSpecDoc(state.activeSpecDoc);
      }
    }

    function selectSpecDoc(docName) {
      const textarea = document.getElementById('specDocTextarea');
      if (textarea && state.activeSpecDoc) {
        state.specDocs[state.activeSpecDoc] = textarea.value;
      }
      state.activeSpecDoc = docName;
      document.getElementById('activeSpecFilename').textContent = docName;
      textarea.value = state.specDocs[docName] || '';

      const map = { 'PROJECT.md': 'specBtnPROJECT', 'CLAUDE.md': 'specBtnCLAUDE', 'cartograph-scan.mjs': 'specBtnCLI' };
      Object.entries(map).forEach(([k, id]) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.setAttribute('aria-current', String(k === docName));
      });
    }

    function copyActiveSpecDoc() {
      const textarea = document.getElementById('specDocTextarea');
      copyTextSafe(textarea.value, `Copied ${state.activeSpecDoc} to clipboard`);
    }

    function downloadActiveSpecDoc() {
      const textarea = document.getElementById('specDocTextarea');
      const blob = new Blob([textarea.value], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = state.activeSpecDoc;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(`Downloaded ${state.activeSpecDoc}`);
    }

    function triggerFolderUpload() {
      closeUiOverlay(false);
      document.getElementById('localFolderInput').click();
    }

    function triggerMultipleFilesUpload() {
      document.getElementById('localFilesInput').click();
    }

    async function handleLocalFolderUpload(event) {
      const fileList = Array.from(event.target.files || []);
      if (!fileList.length) return;
      await ingestUploadedFileObjects(fileList);
    }

    async function handleLocalFilesUpload(event) {
      const fileList = Array.from(event.target.files || []);
      if (!fileList.length) return;
      await ingestUploadedFileObjects(fileList);
      closeAddFileModal();
    }

    function renderIntakeReport(included, skipped, snapshot = false) {
      const counts = {};
      for (const entry of skipped) counts[entry.reason] = (counts[entry.reason] || 0) + 1;
      const reasons = Object.entries(counts).map(([reason, count]) => `${reason}: ${count}`).join(', ');
      state.lastIntakeReport = { included, skipped, counts, snapshot };
      document.getElementById('intakeStatus').textContent = snapshot
        ? `Snapshot loaded: ${included} recorded files. Repository exclusions were not applied.`
        : `${included} files included; ${skipped.length} skipped entries${reasons ? ` (${reasons})` : ''}. Excluded directories count as one entry; their contents were not scanned.`;
      document.getElementById('intakeReasons').textContent = document.getElementById('intakeStatus').textContent;
      document.getElementById('intakeSummary').textContent = snapshot
        ? `Last intake: ${included} snapshot files`
        : `Last intake: ${included} files · ${skipped.length} skipped`;
      const list = document.getElementById('intakeSkippedList');
      list.replaceChildren();
      for (const entry of skipped.slice(0, 100)) {
        const item = document.createElement('li');
        item.textContent = `${entry.path} — ${entry.reason}`; // taste-skill-ignore: tested by test/intake.test.js
        list.appendChild(item);
      }
      document.getElementById('intakeOmitted').textContent = skipped.length > 100
        ? `${skipped.length - 100} more skipped entries not displayed.` : '';
      document.getElementById('intakeReport').hidden = false;
    }

    async function ingestUploadedFileObjects(fileList) {
      const list = Array.from(fileList || []);
      if (!list.length) return;

      const result = await CartographIntake.ingestEntries(list);
      if (result.snapshot) {
        const snapshot = result.snapshot;
        if (snapshot.type === 'graph') {
          applyParsedGraph(snapshot.graph, snapshot.provenance, { customLabel: `snapshot: ${snapshot.name || list[0].name}` });
          renderIntakeReport(snapshot.count, [], true);
          showToast(`Loaded ${snapshot.count} parsed nodes from ${list[0].name}`);
          return;
        }
        if (snapshot.type === 'files') {
          parseRepositoryIntoGraph(snapshot.files, snapshot.name, 'Imported from Cartograph JSON snapshot', snapshot.provenance, { customLabel: `snapshot: ${snapshot.name || list[0].name}` });
          renderIntakeReport(snapshot.count, [], true);
          showToast(`Loaded ${snapshot.count} files from ${list[0].name}`);
          return;
        }
      }

      renderIntakeReport(result.summary.includedCount, result.skipped);
      if (!result.included.length) {
        showToast(`No files included; existing map kept. ${result.skipped.length} entries skipped: open Last intake for reasons.`, 'warn');
        return;
      }
      parseRepositoryIntoGraph(result.included, result.rootFolder, `Local folder loaded directly from disk (${result.included.length} files)`, undefined, { customLabel: `local: ${result.rootFolder} (${result.included.length} files)` });
      showToast(`Parsed ${result.included.length} local files from "${result.rootFolder}"${result.skipped.length ? `; ${result.skipped.length} entries skipped: open Last intake for reasons` : ''}`);
    }

    // Relabels the preset dropdown with an opt-out "loaded from disk/server"
    // entry so the select reflects what is actually rendered instead of a
    // bundled sample. Used by the local-folder path and the --serve loader.
    function markPresetSelectCustom(label) {
      const select = document.getElementById('repoPresetSelect');
      let customOpt = select.querySelector('option[value="custom-local"]');
      if (!customOpt) {
        customOpt = document.createElement('option');
        customOpt.value = 'custom-local';
        select.prepend(customOpt);
      }
      customOpt.textContent = label;
      select.value = 'custom-local';
    }

    function openAddFileModal() {
      openUiOverlay('add-file');
    }

    function closeAddFileModal() {
      closeUiOverlay();
    }

    function submitCustomFile() {
      const pathInput = document.getElementById('customFilePathInput').value.trim();
      const codeInput = document.getElementById('customFileCodeInput').value;
      if (!pathInput) {
        showToast('Please enter a relative file path', 'warn');
        return;
      }

      const updatedFiles = [...state.rawFiles.filter(f => f.path !== pathInput), { path: pathInput, content: codeInput }];
      parseRepositoryIntoGraph(updatedFiles, state.repoName, state.repoDescription, undefined, { selection: { path: pathInput, pan: true } });
      closeAddFileModal();
      showToast(`Parsed and added ${pathInput} to dependency graph`);
    }

    function exportGraphSnapshot() {
      const payload = {
        name: state.repoName,
        exportedAt: new Date().toISOString(),
        metrics: {
          totalFiles: state.graph.nodes.length,
          totalEdges: state.graph.edges.length,
          circularDependencies: state.graph.cycles.length
        },
        nodes: state.graph.nodes.map(n => ({
          path: n.path,
          layer: n.layer,
          exports: n.exports,
          hop1DirectDependents: n.hop1Files,
          hop2TransitiveDependents: n.hop2Files,
          totalBlastRadius: n.totalImpact
        })),
        edges: state.graph.edges,
        files: state.rawFiles
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${state.repoName}-cartograph-graph.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(`Exported ${state.repoName}-cartograph-graph.json`);
    }

    function switchMainView(view) {
      rememberFileListScroll();
      state.activeView = view;
      document.getElementById('viewExplorer').classList.toggle('hidden', view !== 'explorer');
      document.getElementById('viewEvals').classList.toggle('hidden', view !== 'evals');
      document.getElementById('viewSpecs').classList.toggle('hidden', view !== 'specs');

      document.querySelectorAll('[data-view]').forEach(btn => btn.setAttribute('aria-current', btn.dataset.view === view ? 'page' : 'false'));
      Object.entries({explorer:'navTabExplorer',evals:'navTabEvals',specs:'navTabSpecs'}).forEach(([key,id]) => document.getElementById(id).setAttribute('aria-current', key === view ? 'page' : 'false'));
      document.getElementById('btnOpenLocalFolder').classList.toggle('primary', view === 'explorer');
      const fromNavigation = state.ui.overlay === 'navigation';
      if (fromNavigation) closeUiOverlay(false);
      syncResponsiveShell();
      if (fromNavigation) {
        const explorerRegion = getExplorerFocusRegion();
        const destination = document.getElementById({explorer:explorerRegion,evals:'viewEvals',specs:'viewSpecs'}[view]);
        destination.tabIndex = -1;
        destination.focus();
      }
    }

    function switchRightPanelTab(tab) {
      state.rightPanelTab = tab;
      if (window.innerWidth <= 640 && ['impact','ask'].includes(state.ui.phonePane)) state.ui.phonePane = tab === 'agent' ? 'ask' : 'impact';
      document.getElementById('panelInspectorContent').classList.toggle('hidden', tab !== 'inspector');
      document.getElementById('panelAgentContent').classList.toggle('hidden', tab !== 'agent');
      ['Inspector','Agent'].forEach(name => {
        const button = document.getElementById('rightTab' + name);
        button.className = 'inspector-tab';
        button.setAttribute('role','tab');
        button.setAttribute('aria-selected', String(tab === name.toLowerCase()));
      });
    }

    function handlePresetChange(presetKey) {
      const preset = PRESET_REPOS[presetKey];
      if (!preset) return;
      try {
        parseRepositoryIntoGraph(preset.files, preset.name, preset.description, { kind: 'sample', scannedAt: null }, { selection: 'hotspot' });
      } catch (error) {
        // Native change events update the select before this handler runs.
        document.getElementById('repoPresetSelect').value = adoptedPresetValue;
        throw error;
      }
      showToast(`Loaded repository: ${preset.name} (${preset.files.length} files)`);
    }

    function handleFileSearch(val) {
      state.searchQuery = val;
      document.getElementById('clearSearchBtn').classList.toggle('hidden', !val);
      renderFileListSidebar();
    }

    function clearFileSearch() {
      state.searchQuery = '';
      document.getElementById('fileSearchInput').value = '';
      document.getElementById('clearSearchBtn').classList.add('hidden');
      renderFileListSidebar();
    }

    function setLayerFilter(layer) {
      state.layerFilter = layer;
      document.querySelectorAll('.layer-pill').forEach(btn => {
        const isMatch = btn.dataset.layer === layer;
        btn.setAttribute('aria-pressed', String(isMatch));
        btn.className = isMatch ? 'layer-pill active' : 'layer-pill';
      });

      if (typeof fitGraphToCanvas === 'function') {
        fitGraphToCanvas();
      }

      renderFileListSidebar();
    }

    function setFileSortMode(mode) {
      state.fileSortMode = mode;
      document.getElementById('sortBtnBlast').className = mode === 'blast'
        ? 'px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-rose-300'
        : 'px-2 py-0.5 rounded text-[11px] font-medium text-slate-400 hover:text-slate-200';
      document.getElementById('sortBtnPath').className = mode === 'path'
        ? 'px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-200'
        : 'px-2 py-0.5 rounded text-[11px] font-medium text-slate-400 hover:text-slate-200';
      renderFileListSidebar();
    }

    function openSettingsModal() {
      const config = state.agentConfig;
      document.getElementById('settingsEngineSelect').value = config.engine;
      document.getElementById('settingsEndpointInput').value = config.endpoint;
      document.getElementById('settingsModelInput').value = config.model;
      document.getElementById('settingsApiKeyInput').value = config.apiKey;
      openUiOverlay('settings');
    }

    function closeSettingsModal() {
      closeUiOverlay();
    }

    function handleEngineSelectChange(val) {
      if (val === 'ollama') {
        document.getElementById('settingsEndpointInput').value = 'http://localhost:11434/api/chat';
        document.getElementById('settingsModelInput').value = 'qwen2.5-coder:7b';
      } else if (val === 'openai') {
        document.getElementById('settingsEndpointInput').value = 'http://localhost:1234/v1/chat/completions';
        document.getElementById('settingsModelInput').value = 'local-model';
      }
    }

    function saveAgentSettings() {
      state.agentConfig.engine = document.getElementById('settingsEngineSelect').value;
      state.agentConfig.endpoint = document.getElementById('settingsEndpointInput').value.trim();
      state.agentConfig.model = document.getElementById('settingsModelInput').value.trim();
      state.agentConfig.apiKey = document.getElementById('settingsApiKeyInput').value.trim();

      try {
        localStorage.setItem('cartograph_agent_config', JSON.stringify(state.agentConfig));
      } catch (e) {}

      const label = document.getElementById('llmModeLabel');
      label.textContent = state.agentConfig.engine === 'deterministic'
        ? 'AST Walker (Local)'
        : `${state.agentConfig.engine}: ${state.agentConfig.model}`;

      closeSettingsModal();
      showToast(`Agent engine set to ${label.textContent}`);
    }

    function copySelectedSource() {
      const node = (typeof state.graph.getNode === 'function')
        ? state.graph.getNode(state.selectedFile)
        : (state.graph?.nodes?.find(n => n.path === state.selectedFile));
      if (!node) return;
      copyTextSafe(node.content, `Copied ${node.path} source code`);
    }

    function copyTextSafe(text, message) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(() => showToast(message)).catch(() => fallbackCopy(text, message));
        } else {
          fallbackCopy(text, message);
        }
      } catch (e) {
        fallbackCopy(text, message);
      }
    }

    function fallbackCopy(text, message) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (err) {}
      ta.remove();
      showToast(message);
    }

    function showToast(msg, type = 'info') {
      const container = document.getElementById('toastContainer');
      if (!container) return;
      const el = document.createElement('div');
      el.className = 'quiet-toast';
      el.dataset.kind = type;
      el.textContent = msg;
      container.appendChild(el);
      setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 150);
      }, 2800);
    }

    function initGlobalDragAndDrop() {
      window.addEventListener('dragover', (e) => {
        e.preventDefault();
      });
      window.addEventListener('drop', async (e) => {
        e.preventDefault();
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          await ingestUploadedFileObjects(Array.from(e.dataTransfer.files));
        }
      });
    }

    window.addEventListener('DOMContentLoaded', async () => {
      try {
        const saved = localStorage.getItem('cartograph_agent_config');
        if (saved) Object.assign(state.agentConfig, JSON.parse(saved));
      } catch (e) {}

      initResponsiveShell();
      initCanvasInteractions();
      initGlobalDragAndDrop();

      const startupGraph = state.graph;
      let loadedFromServer = false;
      try {
        const response = await fetch('/api/local-repo');
        if (response.ok) {
          const payload = await response.json();
          if (state.graph === startupGraph && payload && payload.graph && Array.isArray(payload.graph.nodes)) {
            applyParsedGraph(payload.graph, { kind: 'local', scannedAt: payload.scannedAt }, { customLabel: `local: ${payload.name || payload.graph.name || 'local repository'} (${(payload.graph.nodes || []).length} files)` });
            loadedFromServer = true;
            showToast(`Loaded scanned repository: ${payload.name || payload.graph.name || 'local'}`);
          }
        }
      } catch (e) {
        // Opened directly from disk (file://) — fall back to the bundled sample repo.
      }

      const startupStillCurrent = loadedFromServer || state.graph === startupGraph;
      if (startupStillCurrent && !loadedFromServer) {
        const initialPreset = PRESET_REPOS['cartograph-saas'];
        parseRepositoryIntoGraph(initialPreset.files, initialPreset.name, initialPreset.description, { kind: 'sample', scannedAt: null });
      }

      if (startupStillCurrent) {
        runAgentQuery('Where does auth get enforced across the repository?');
        switchRightPanelTab('inspector');
        if (state.graph.nodes.some(n => n.path === 'src/lib/db/supabase.ts')) {
          selectFileNode('src/lib/db/supabase.ts', false);
        }
      }
      window.addEventListener('resize', syncResponsiveShell);
      syncResponsiveShell();

      startCanvasAnimationLoop();
      lucide.createIcons();
    });

    /**
     * Unified navigation coordinator for Cartograph Local.
     * Consolidates file selection, viewport centering, responsive pane switching,
     * overlay dismissal, and accessible focus arbitration.
     */
    const CartographNavigation = {
      navigateTo(path, options = {}) {
        if (!(typeof state.graph.hasNode === 'function' ? state.graph.hasNode(path) : state.graph.nodes.some(node => node.path === path))) return false;

        const pan = options.pan !== undefined ? options.pan : true;
        const fromOverlay = options.fromOverlay !== undefined ? options.fromOverlay : !!state.ui.overlay;
        const source = options.source || (typeof document !== 'undefined' ? document.activeElement : null);
        const sourcePath = source?.dataset?.filepath;

        let sourceRegion = source?.parentElement;
        while (sourceRegion && !sourceRegion.id) sourceRegion = sourceRegion.parentElement;

        const visible = element => element && element.isConnected && !element.disabled && (element.getClientRects ? element.getClientRects().length : true);

        if (typeof rememberFileListScroll === 'function') rememberFileListScroll();
        if (fromOverlay && typeof closeUiOverlay === 'function') closeUiOverlay(false);
        if (typeof switchMainView === 'function') switchMainView('explorer');

        if (typeof selectFileNode === 'function') {
          selectFileNode(path, pan);
        }

        if (typeof window !== 'undefined' && typeof document !== 'undefined') {
          let target;
          if (window.innerWidth <= 640) {
            if (typeof setPhonePane === 'function') setPhonePane('impact');
            target = document.getElementById('panelInspectorContent');
          } else if (window.innerWidth <= 1100) {
            target = document.getElementById('dependencyCanvas');
          } else if (!fromOverlay) {
            if (visible(source) && source !== document.body && source !== document.documentElement
              && source.matches && source.matches('button, input, select, textarea, a[href], [tabindex]')) {
              target = source;
            } else if (sourcePath && sourceRegion?.isConnected) {
              target = Array.from(sourceRegion.querySelectorAll('[data-filepath]'))
                .find(element => element.dataset.filepath === sourcePath && visible(element));
            }
          }
          target = target || document.getElementById('mapRegion');
          if (target && target.matches && !target.matches('button, input, select, textarea, a[href], [tabindex]')) {
            target.tabIndex = -1;
          }
          if (target && typeof target.focus === 'function') {
            target.focus();
          }
        }

        return true;
      },

      centerOnNode(filePath) {
        const node = (typeof state.graph.getNode === 'function')
          ? state.graph.getNode(filePath)
          : (state.graph?.nodes?.find(n => n.path === filePath));
        if (!node) return false;
        const canvas = document.getElementById('dependencyCanvas');
        if (canvas) {
          state.camera = CartographCamera.centerOnNode(state.camera, node, canvas.clientWidth, canvas.clientHeight);
          return true;
        }
        return false;
      }
    };

    if (typeof globalThis !== 'undefined') globalThis.CartographNavigation = CartographNavigation;
    else if (typeof window !== 'undefined') window.CartographNavigation = CartographNavigation;

    // User file jumps share validation, overlay ownership and responsive focus.
    // Internal agent selection intentionally continues to call selectFileNode.
    function selectFileFromUi(path, panToNode = true) {
      return CartographNavigation.navigateTo(path, { pan: panToNode });
    }

    // Responsive regions move into the single native sheet, never clone their IDs or state.
    function setPhonePane(pane) {
      if (!['files', 'map', 'impact', 'ask'].includes(pane)) return;
      rememberFileListScroll();
      state.ui.phonePane = pane;
      if (pane === 'impact' || pane === 'ask') switchRightPanelTab(pane === 'ask' ? 'agent' : 'inspector');
      syncResponsiveShell();
    }

    function toggleInspector() {
      state.ui.inspectorCollapsed = !state.ui.inspectorCollapsed;
      syncResponsiveShell();
    }

    function restoreOverlayRegions() {
      const palette = document.getElementById('commandPalette');
      palette.hidden = true;
      document.body.appendChild(palette);
      const explorer = document.getElementById('viewExplorer');
      rememberFileListScroll();
      const files = document.getElementById('fileBrowser');
      const inspector = document.getElementById('inspectorRegion');
      if (files.parentElement !== explorer) explorer.insertBefore(files, document.getElementById('mapRegion'));
      if (inspector.parentElement !== explorer) explorer.appendChild(inspector);
      const navigation = document.getElementById('navigationContent');
      navigation.hidden = true;
      document.body.appendChild(navigation);
      document.getElementById('repositorySlot').appendChild(document.getElementById('repoPresetSelect'));
    }

    function finishUiOverlay(restoreFocus) {
      const opener = state.ui.overlayOpener;
      restoreOverlayRegions();
      state.ui.overlay = null;
      state.ui.overlayOpener = null;
      syncResponsiveShell();
      if (restoreFocus) {
        const target = [opener, document.getElementById('navigationLauncher'), document.getElementById('commandsLauncher'), document.getElementById('navTabExplorer')]
          .find(element => element && element.isConnected && element.getClientRects().length && !element.disabled);
        if (target) target.focus();
      }
    }

    function closeUiOverlay(restoreFocus = true) {
      if (!state.ui.overlay) return;
      document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
      finishUiOverlay(restoreFocus);
    }

    function openUiOverlay(kind, opener = document.activeElement) {
      if (!['navigation','files','inspector','palette','settings','add-file'].includes(kind)) return;
      // Preserve the persistent launcher when an action transfers between overlays.
      const returnTarget = state.ui.overlay ? state.ui.overlayOpener : opener;
      closeUiOverlay(false);
      state.ui.overlay = kind;
      state.ui.overlayOpener = returnTarget;
      const dialog = document.getElementById(kind === 'settings' ? 'modalSettings' : kind === 'add-file' ? 'modalAddFile' : 'shellOverlay');
      if (dialog.id === 'shellOverlay') {
        const body = document.getElementById('shellOverlayBody');
        body.replaceChildren();
        document.getElementById('shellOverlayTitle').textContent = {navigation:'Navigation',files:'Files',inspector:'Inspector',palette:'Commands'}[kind];
        if (kind === 'navigation') {
          const navigation = document.getElementById('navigationContent');
          navigation.hidden = false;
          body.appendChild(navigation);
          document.getElementById('navigationRepositorySlot').appendChild(document.getElementById('repoPresetSelect'));
        } else if (kind === 'files' || kind === 'inspector') {
          body.appendChild(document.getElementById(kind === 'files' ? 'fileBrowser' : 'inspectorRegion'));
        } else {
          body.appendChild(document.getElementById('commandPalette'));
          document.getElementById('commandPalette').hidden = false;
        }
      }
      dialog.showModal();
      restoreFileListScroll();
    }

    function syncResponsiveShell() {
      const width = window.innerWidth;
      const phone = width <= 640;
      const desktop = width > 1100;
      if ((phone || desktop) && ['files','inspector'].includes(state.ui.overlay)) { closeUiOverlay(false); return; }
      const hasSelection = state.graph.nodes.some(node => node.path === state.selectedFile);

      const layout = (typeof CartographShellCoordinator !== 'undefined')
        ? CartographShellCoordinator.computeResponsiveLayout(width, {
            activeView: state.activeView,
            phonePane: state.ui.phonePane,
            inspectorCollapsed: state.ui.inspectorCollapsed,
            hasNodes: state.graph.nodes.length > 0,
            hasSelection,
          })
        : {
            showCompactMapTools: state.activeView === 'explorer' && !phone && !desktop,
            showPhonePaneTabs: state.activeView === 'explorer' && phone,
            fileBrowserVisible: state.ui.phonePane === 'files',
            mapRegionVisible: state.ui.phonePane === 'map',
            inspectorRegionVisible: ['impact','ask'].includes(state.ui.phonePane),
            inspectorDisplay: desktop && state.ui.inspectorCollapsed ? 'none' : '',
            metricCycleBadgeDisabled: phone,
            btnToggleIsolateDisabled: !hasSelection,
            btnSimulateDisabled: !hasSelection,
          };

      document.getElementById('compactMapTools').style.display = layout.showCompactMapTools ? 'flex' : 'none';
      document.getElementById('phonePaneTabs').style.display = layout.showPhonePaneTabs ? 'flex' : 'none';
      document.getElementById('fileBrowser').dataset.phoneVisible = String(layout.fileBrowserVisible);
      document.getElementById('mapRegion').dataset.phoneVisible = String(layout.mapRegionVisible);
      document.getElementById('inspectorRegion').dataset.phoneVisible = String(layout.inspectorRegionVisible);
      document.getElementById('inspectorRegion').style.display = layout.inspectorDisplay;
      document.getElementById('mapEmptyState').hidden = state.graph.nodes.length > 0;
      document.getElementById('metricCycleBadge').disabled = layout.metricCycleBadgeDisabled;
      document.getElementById('btnToggleIsolate').disabled = layout.btnToggleIsolateDisabled;
      document.getElementById('btnSimulateBreak').disabled = layout.btnSimulateDisabled;
      const toggle = document.getElementById('toggleInspectorBtn');
      toggle.textContent = state.ui.inspectorCollapsed ? 'Show inspector' : 'Hide inspector';
      toggle.setAttribute('aria-expanded', String(!state.ui.inspectorCollapsed));
      document.querySelectorAll('[data-pane]').forEach(button => {
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', String(button.dataset.pane === state.ui.phonePane));
      });
      restoreFileListScroll();
      const canvas = document.getElementById('dependencyCanvas');
      const visible = canvas.getClientRects().length && canvas.clientWidth && canvas.clientHeight;
      if (!visible) { state.ui.pendingFit = true; return; }
      const dimensions = `${canvas.clientWidth}x${canvas.clientHeight}`;
      if (state.ui.canvasDimensions !== dimensions || state.ui.pendingFit) {
        state.ui.canvasDimensions = dimensions;
        state.ui.pendingFit = false;
        requestAnimationFrame(() => {
          if (!canvas.getClientRects().length) { state.ui.pendingFit = true; return; }
          if (typeof fitGraphToViewport === 'function') fitGraphToViewport();
          else computeGraphNodePositions();
          drawDependencyGraph();
          updateShellZoom();
        });
      }
    }

    function initDeveloperMode() {
      try {
        if (typeof window === 'undefined' || !window.location || !window.location.search) return;
        const params = new URLSearchParams(window.location.search);
        const isDev = params.get('mode') === 'dev' || params.get('dev') === 'true';
        if (isDev) {
          state.developerMode = true;
          ['navTabEvals', 'btnSimulateBreak', 'btnInspectorSimulate', 'inspectorTabSwitcher', 'btnInspectorAsk'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.removeAttribute('hidden');
          });
          document.querySelectorAll('[data-view="evals"]').forEach(el => el.removeAttribute('hidden'));
        }
      } catch (e) {}
    }

    function initResponsiveShell() {
      initDeveloperMode();
      document.querySelectorAll('dialog').forEach(dialog => {
        dialog.addEventListener('click', event => {
          const box = dialog.getBoundingClientRect();
          if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) closeUiOverlay();
        });
        dialog.addEventListener('close', () => {
          if (state.ui.overlay && !document.querySelector('dialog[open]')) finishUiOverlay(true);
        });
      });
      document.addEventListener('click', () => queueMicrotask(updateShellZoom));
      document.getElementById('dependencyCanvas').addEventListener('wheel', () => queueMicrotask(updateShellZoom));
      document.addEventListener('keydown', event => {
        // Chromium can send Tab to browser chrome at native-dialog boundaries.
        if (state.ui.overlay === 'palette' && event.key === 'Tab') {
          const controls = Array.from(document.getElementById('shellOverlay').querySelectorAll('button:not([tabindex="-1"]), input')).filter(element => !element.disabled && element.getClientRects().length);
          const first = controls[0], last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
        const shortcut = (typeof CartographShellCoordinator !== 'undefined')
          ? CartographShellCoordinator.parseKeyboardShortcut(event)
          : (!event.isComposing && event.keyCode !== 229 && (event.metaKey || event.ctrlKey) && ['k','p'].includes(event.key.toLowerCase()) ? (event.key.toLowerCase() === 'p' ? 'files' : 'commands') : null);
        if (shortcut && !['settings','add-file'].includes(state.ui.overlay)) {
          event.preventDefault(); openCommandPalette(shortcut);
        }
      });
      // ResizeObserver reacts to actual canvas dimensions after sheet/pane transitions.
      new ResizeObserver(() => syncResponsiveShell()).observe(document.getElementById('mapRegion'));
      switchMainView(state.activeView);
    }

    function rememberFileListScroll() {
      const list = document.getElementById('fileListContainer');
      if (list.getClientRects().length) state.ui.fileListScrollTop = list.scrollTop;
    }

    function restoreFileListScroll() {
      const list = document.getElementById('fileListContainer');
      if (list.getClientRects().length && state.ui.fileListScrollTop != null) list.scrollTop = state.ui.fileListScrollTop;
    }

    function updateShellZoom() {
      document.getElementById('shellZoom').textContent = `${Math.round(state.camera.zoom * 100)}%`;
    }

    function getPaletteActions() {
      const map = run => () => { switchMainView('explorer'); if (window.innerWidth <= 640) setPhonePane('map'); run(); };
      const runners = {
        switchMainView,
        setLayerFilter: l => map(() => setLayerFilter(l))(),
        openCycleFixerModal,
        setGraphLayout: l => map(() => setGraphLayout(l))(),
        toggleIsolateBlastRadius: map(toggleIsolateBlastRadius),
        toggleBreakSimulation: map(toggleBreakSimulation),
        selectTopHotspot,
        resetGraphView: map(resetGraphView),
        zoomGraph: factor => map(() => zoomGraph(factor))(),
        exportGraphSnapshot,
        triggerFolderUpload,
        openAddFileModal,
        openSettingsModal,
        openCommandPalette,
        showToast,
        clearFolderFocus: map(clearFolderFocus),
        focusFolder: f => map(() => focusFolder(f))(),
      };
      if (typeof CartographShellCoordinator !== 'undefined') {
        return CartographShellCoordinator.computeActionRegistry(state, runners);
      }
      return [];
    }

    function comparePalettePaths(a, b) {
      if (typeof CartographPalette !== 'undefined' && typeof CartographPalette.comparePalettePaths === 'function') {
        return CartographPalette.comparePalettePaths(a, b);
      }
      const left = Array.from(a), right = Array.from(b);
      for (let i = 0; i < Math.min(left.length, right.length); i++) {
        const difference = left[i].codePointAt(0) - right[i].codePointAt(0);
        if (difference) return difference;
      }
      return left.length - right.length;
    }

    function getPaletteResults(query, mode) {
      if (typeof CartographPalette !== 'undefined' && typeof CartographPalette.queryPalette === 'function') {
        return CartographPalette.queryPalette(query, mode, {
          getActions: getPaletteActions,
          getFiles: () => (state.graph?.nodes || []),
        });
      }
      const needle = String(query || '').trim().toLowerCase();
      const characters = Array.from(needle);
      const rank = path => {
        const lower = path.toLowerCase();
        if (lower === needle) return 0;
        if (lower.split('/').pop().startsWith(needle)) return 1;
        if (lower.includes(needle)) return 2;
        let index = 0; for (const character of lower) if (character === characters[index]) index++;
        return index === characters.length ? 3 : -1;
      };
      const files = state.graph.nodes.map(node => ({ path: node.path, rank: rank(node.path) })).filter(node => node.rank >= 0).sort((a, b) => a.rank - b.rank || comparePalettePaths(a.path, b.path)).map(node => ({ id: 'file-' + node.path, kind: 'file', label: node.path, path: node.path, available: true, reason: '' }));
      const actions = mode === 'files' ? [] : getPaletteActions().filter(action => action.label.toLowerCase().includes(needle)).map(({ id, label, available, reason }) => ({ id, kind: 'action', label, available, reason }));
      const results = actions.concat(files);
      return { results: results.slice(0, 50), matchCount: results.length };
    }

    function openCommandPalette(mode = 'commands') {
      state.ui.paletteMode=mode==='files'?'files':'commands';
      state.ui.paletteQuery='';state.ui.paletteActiveIndex=-1;
      openUiOverlay('palette');
      const input=document.getElementById('paletteInput');input.value='';
      renderCommandPalette();input.focus();
    }

    function setPaletteMode(mode) {
      state.ui.paletteMode=mode;state.ui.paletteActiveIndex=-1;
      renderCommandPalette();document.getElementById('paletteInput').focus();
    }

    function renderCommandPalette() {
      const {results,matchCount}=getPaletteResults(state.ui.paletteQuery,state.ui.paletteMode);
      state.ui.paletteResults=results;
      if(!results[state.ui.paletteActiveIndex]?.available) state.ui.paletteActiveIndex=results.findIndex(result=>result.available);
      document.getElementById('shellOverlayTitle').textContent=state.ui.paletteMode==='files'?'Find file':'Commands';
      document.querySelectorAll('[data-palette-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.paletteMode===state.ui.paletteMode)));
      const list=document.getElementById('paletteResults');list.replaceChildren();
      results.forEach((result,index)=>{
        const row=document.createElement('button');row.type='button';row.id='palette-option-'+encodeURIComponent(result.id);row.setAttribute('role','option');row.setAttribute('aria-selected',String(index===state.ui.paletteActiveIndex));row.setAttribute('aria-disabled',String(!result.available));row.tabIndex=-1;
        row.textContent=result.label;if(result.path)row.dataset.filepath=result.path;
        if(result.reason){const reason=document.createElement('small');reason.textContent=result.reason;row.appendChild(reason);}
        if(result.kind==='action')row.addEventListener('click',()=>runPaletteResult(result));
        list.appendChild(row);
      });
      const input=document.getElementById('paletteInput');
      input.setAttribute('aria-label',state.ui.paletteMode==='files'?'Find file':'Search commands and files');
      const active=list.children[state.ui.paletteActiveIndex];
      if(active){input.setAttribute('aria-activedescendant',active.id);active.scrollIntoView({block:'nearest'});}else input.removeAttribute('aria-activedescendant');
      document.getElementById('paletteCount').textContent=matchCount ? `${matchCount} matches${matchCount>50?' · showing 50':''}` : 'No results';
    }

    function handlePaletteKeydown(event) {
      if (event.isComposing || event.keyCode === 229) return;
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        const nextIndex = (typeof CartographShellCoordinator !== 'undefined')
          ? CartographShellCoordinator.computePaletteNavigation(state.ui.paletteResults || [], state.ui.paletteActiveIndex, event.key)
          : -1;
        if (nextIndex !== -1) {
          state.ui.paletteActiveIndex = nextIndex;
          renderCommandPalette();
        }
      } else if (event.key === 'Enter') {
        event.preventDefault();
        runPaletteResult((state.ui.paletteResults || [])[state.ui.paletteActiveIndex]);
      }
    }

    function runPaletteResult(result) {
      if(!result)return;
      if(result.kind==='file'){
        selectFileFromUi(result.path);return;
      }
      const action=getPaletteActions().find(action=>action.id===result.id);
      if(!action?.available)return;
      // Preserve the original launcher when transferring into another native modal.
      if(['settings','add-file','files'].includes(action.id)){action.run();return;}
      closeUiOverlay(false);action.run();
      if(!state.ui.overlay){
        const region=document.getElementById(state.activeView==='evals'?'viewEvals':state.activeView==='specs'?'viewSpecs':getExplorerFocusRegion());
        region.tabIndex=-1;region.focus();
      }
    }

    function getExplorerFocusRegion() {
      return window.innerWidth <= 640
        ? { files: 'fileBrowser', map: 'mapRegion', impact: 'panelInspectorContent', ask: 'panelAgentContent' }[state.ui.phonePane]
        : 'mapRegion';
    }
