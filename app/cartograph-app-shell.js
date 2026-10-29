// Moved verbatim from cartograph.html (split preserved original file order).
// app-shell: see cartograph.html; loads as a classic script after the lib/ files.
    function regenerateSpecDocs() {
      const nodes = state.graph.nodes;
      const edges = state.graph.edges;
      const cycles = state.graph.cycles;
      const sortedHotspots = [...nodes].sort((a, b) => b.totalImpact - a.totalImpact).slice(0, 5);

      const hotspotLines = sortedHotspots.map(n =>
        `- \`${n.path}\` — **${n.totalImpact} total dependents** (${n.hop1Files.length} direct 1-hop, ${n.hop2Files.length} transitive 2-hop) • Exports: \`${n.exports.join(', ')}\``
      ).join('\n');

      const layerBreakdown = ['ui', 'api', 'agent', 'parser', 'core'].map(l => {
        const matching = nodes.filter(n => n.layer === l);
        return `- **${getLayerMeta(l).label}** (${matching.length} files): ${matching.map(m => '`' + m.path + '`').join(', ') || 'None'}`;
      }).join('\n');

      state.specDocs['PROJECT.md'] = `# PROJECT.md — ${state.repoName} (Architecture & Context Spec)

## 1. What This Repository Is
${state.repoDescription || 'Local codebase analyzed by Cartograph AST Engine.'}
- **Parsed Source Files**: ${nodes.length}
- **Verified Internal Import Edges**: ${edges.length}
- **Circular Dependencies**: ${cycles.length}

## 2. Architectural Layers (Verified by AST Parser)
${layerBreakdown}

## 3. High-Blast-Radius Hotspots (Check Before Modifying!)
Changing the exported signatures of these modules will break the largest number of downstream files:
${hotspotLines}

## 4. What We Refuse To Do (Non-Goals & Reasons)
- **No Unverified AI Connections**: Every dependency edge must come from parsing real source imports. A dependency map that is 90% right is worse than no map at all because engineers cannot tell which 10% is hallucinated.
- **No Arbitrary Health Grades**: Never invent subjective "Code Quality Scores". Report only deterministic in-degree, out-degree, 2-hop blast radius counts, and circular dependency cycles.
- **No Silent Alias Fallbacks**: Always resolve \`@/\`, \`./\`, \`../\`, and barrel \`index\` files deterministically so edges never disappear silently.
`;

      state.specDocs['CLAUDE.md'] = `# CLAUDE.md — Agent Engineering Rules for ${state.repoName}

## 1. Mandatory Pre-Flight Check
Before modifying any file in \`${state.repoName}\`:
1. Inspect its **1-Hop Direct Dependents** and **2-Hop Transitive Dependents** in Cartograph.
2. If the target file has \`totalImpact >= 3\` (such as \`${sortedHotspots[0]?.path || 'core modules'}\`), do NOT change exported function signatures or return shapes without updating all 1-hop callers in the same atomic step.

## 2. Architecture Invariants
- **Strict Layer Boundaries**:
  - Core/DB modules must never import from UI or Route handlers.
  - Parser modules must remain 100% standalone and deterministic.
- **Zero Hallucinated Paths**: Never reference a file path unless it exists in the repository file tree.
${cycles.length > 0 ? `- **Active Tech Debt Alert**: Resolve the circular dependency between \`${cycles[0][0]}\` and \`${cycles[0][1]}\` by extracting shared interfaces into \`src/types/\`.` : '- **DAG Invariant**: Keep Circular Dependencies at 0.'}

## 3. Communication Protocol
- When an architectural trade-off arises, stop and ask a concrete **A or B question** with a 1-sentence trade-off and your recommended default.
- No walls of text. State the exact file path and line number when reporting issues.
`;

      state.specDocs['cartograph-scan.mjs'] = `#!/usr/bin/env node
// Run locally: node cli/cartograph-scan.mjs /path/to/repo --serve 4173
import fs from 'node:fs';
import path from 'node:path';
import CartographParser from '../lib/cartograph-parser.js';

const IGNORED = new Set(['node_modules', '.git', '.next', 'dist', 'build', '__pycache__', '.venv']);
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.py', '.go']);

export function scanLocalRepo(rootDir, dir = rootDir, list = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !IGNORED.has(entry.name)) scanLocalRepo(rootDir, full, list);
    else if (entry.isFile() && EXTS.has(path.extname(entry.name))) {
      list.push({ path: path.relative(rootDir, full).replace(/\\\\/g, '/'), content: fs.readFileSync(full, 'utf8') });
    }
  }
  return list;
}

if (import.meta.url === \`file://\${process.argv[1]}\`) {
  const target = path.resolve(process.argv[2] || '.');
  const files = scanLocalRepo(target);
  const graph = CartographParser.parseRepository(files, { repoName: path.basename(target) });
  fs.writeFileSync('cartograph-snapshot.json', JSON.stringify({ name: path.basename(target), graph }, null, 2));
  console.log(\`Scanned \${graph.nodes.length} nodes / \${graph.edges.length} edges into cartograph-snapshot.json\`);
}`;

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
        item.textContent = `${entry.path} — ${entry.reason}`;
        list.appendChild(item);
      }
      document.getElementById('intakeOmitted').textContent = skipped.length > 100
        ? `${skipped.length - 100} more skipped entries not displayed.` : '';
      document.getElementById('intakeReport').hidden = false;
    }

    async function ingestUploadedFileObjects(fileList) {
      if (!fileList.length) return;

      // 1. Snapshot discrimination via CartographIntake
      let singleText;
      if (fileList.length === 1 && fileList[0].name.toLowerCase().endsWith('.json')) {
        try { singleText = await fileList[0].text(); } catch (error) { /* Report via ordinary intake below. */ }
        if (singleText !== undefined) {
          const batch = CartographIntake.processBatch([{ path: fileList[0].name, size: fileList[0].size, content: singleText }]);
          if (batch.snapshot) {
            const snapshot = batch.snapshot;
            if (snapshot.type === 'graph') {
              applyParsedGraph(snapshot.graph, snapshot.provenance, { customLabel: `snapshot: ${snapshot.name || fileList[0].name}` });
              renderIntakeReport(snapshot.count, [], true);
              showToast(`Loaded ${snapshot.count} parsed nodes from ${fileList[0].name}`);
              return;
            }
            if (snapshot.type === 'files') {
              parseRepositoryIntoGraph(snapshot.files, snapshot.name, 'Imported from Cartograph JSON snapshot', snapshot.provenance, { customLabel: `snapshot: ${snapshot.name || fileList[0].name}` });
              renderIntakeReport(snapshot.count, [], true);
              showToast(`Loaded ${snapshot.count} files from ${fileList[0].name}`);
              return;
            }
          }
        }
      }

      // 2. Multi-file directory intake using CartographIntake session & root detector
      const relativePaths = fileList.map(file => (file.webkitRelativePath || file.name || '').replace(/\\/g, '/'));
      const { sharedRoot, rootFolder, root } = CartographIntake.detectSharedRoot(relativePaths);
      const session = CartographIntake.createIntakeSession();

      for (let index = 0; index < fileList.length; index++) {
        const file = fileList[index];
        const rawPath = (file.webkitRelativePath || file.name || '').replace(/\\/g, '/');
        const normalizedPath = (sharedRoot ? rawPath.slice(root.length + 1) : rawPath).split('/').filter(Boolean).join('/');
        const hasSelectedRoot = relativePaths[index].includes('/');
        const policyPath = hasSelectedRoot ? rawPath.slice(rawPath.indexOf('/') + 1) : normalizedPath;
        const reportPrefix = hasSelectedRoot && !sharedRoot ? rawPath.slice(0, rawPath.indexOf('/') + 1) : '';

        const check = session.checkAndInclude(normalizedPath, policyPath, file.size, reportPrefix);
        if (!check.included) continue;
        try {
          const content = index === 0 && singleText !== undefined ? singleText : await file.text();
          session.recordIncluded({ path: normalizedPath, content });
        } catch (error) {
          session.recordSkipped(normalizedPath, 'unreadable');
        }
      }

      const report = session.getSummary();
      renderIntakeReport(report.included.length, report.skipped);
      if (!report.included.length) {
        showToast(`No files included; existing map kept. ${report.skipped.length} entries skipped — open Last intake for reasons.`, 'warn');
        return;
      }
      parseRepositoryIntoGraph(report.included, rootFolder, `Local folder loaded directly from disk (${report.included.length} files)`, undefined, { customLabel: `local: ${rootFolder} (${report.included.length} files)` });
      showToast(`Parsed ${report.included.length} local files from "${rootFolder}"${report.skipped.length ? `; ${report.skipped.length} entries skipped — open Last intake for reasons` : ''}`);
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
        ? 'px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-rose-300'
        : 'px-2 py-0.5 rounded text-[10px] font-medium text-slate-400 hover:text-slate-200';
      document.getElementById('sortBtnPath').className = mode === 'path'
        ? 'px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-200'
        : 'px-2 py-0.5 rounded text-[10px] font-medium text-slate-400 hover:text-slate-200';
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
      const node = state.graph.nodes.find(n => n.path === state.selectedFile);
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
        if (!state.graph.nodes.some(node => node.path === path)) return false;

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
        const node = state.graph.nodes.find(n => n.path === filePath);
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
      const explorer = state.activeView === 'explorer';
      document.getElementById('compactMapTools').style.display = explorer && !phone && !desktop ? 'flex' : 'none';
      document.getElementById('phonePaneTabs').style.display = explorer && phone ? 'flex' : 'none';
      document.getElementById('fileBrowser').dataset.phoneVisible = String(state.ui.phonePane === 'files');
      document.getElementById('mapRegion').dataset.phoneVisible = String(state.ui.phonePane === 'map');
      document.getElementById('inspectorRegion').dataset.phoneVisible = String(['impact','ask'].includes(state.ui.phonePane));
      document.getElementById('inspectorRegion').style.display = desktop && state.ui.inspectorCollapsed ? 'none' : '';
      document.getElementById('mapEmptyState').hidden = state.graph.nodes.length > 0;
      document.getElementById('metricCycleBadge').disabled = phone;
      const hasSelection = state.graph.nodes.some(node => node.path === state.selectedFile);
      ['btnToggleIsolate','btnSimulateBreak'].forEach(id => document.getElementById(id).disabled = !hasSelection);
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

    function initResponsiveShell() {
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
        if (!event.isComposing && event.keyCode !== 229 && (event.metaKey || event.ctrlKey) && ['k','p'].includes(event.key.toLowerCase()) && !['settings','add-file'].includes(state.ui.overlay)) {
          event.preventDefault(); openCommandPalette(event.key.toLowerCase() === 'p' ? 'files' : 'commands');
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
      const hasNodes = state.graph.nodes.length > 0;
      const selected = state.graph.nodes.some(node => node.path === state.selectedFile);
      const actions = [];
      const add = (id, label, run, available = true, reason = '') => actions.push({id,label,run,available,reason:available ? '' : reason});
      const map = run => () => { switchMainView('explorer'); if (window.innerWidth <= 640) setPhonePane('map'); run(); };
      [['explorer','Map'],['evals','Evals'],['specs','Docs']].forEach(([view,label]) => add('view-'+view,'Open '+label,()=>switchMainView(view)));
      [['all','All'],['core','DB & Core'],['parser','Parser'],['agent','Agent'],['api','Routes'],['ui','UI']].forEach(([layer,label]) => add('layer-'+layer,'Layer: '+label+(state.layerFilter===layer?' (current)':''),map(()=>setLayerFilter(layer))));
      const isCurLayout = mode => (mode === 'dag-lr' && (state.graphLayout === 'dag' || state.graphLayout === 'dag-lr')) || (mode === 'dag-tb' && state.graphLayout === 'dag-tb') || (mode === 'cluster' && (state.graphLayout === 'force' || state.graphLayout === 'cluster'));
      [['dag-lr','Pipeline (Left-to-Right)'],['dag-tb','Tree (Top-to-Bottom)'],['cluster','Directory Clusters']].forEach(([layout,label]) => add('layout-'+layout,'Layout: '+label+(isCurLayout(layout)?' (current)':''),map(()=>setGraphLayout(layout)),hasNodes,'Load files to change layout'));
      add('isolate','Isolate impact ('+(state.isolateBlastRadius?'on':'off')+')',map(toggleIsolateBlastRadius),selected,'Select a file first');
      add('simulate','Simulate breaking change ('+(state.simulateBreakingChange?'on':'off')+')',map(toggleBreakSimulation),selected,'Select a file first');
      add('highest-impact','Go to highest-impact file',selectTopHotspot,hasNodes,'Load files to find the highest-impact file');
      add('fit','Fit map',map(resetGraphView),hasNodes,'Load files to fit the map');
      add('zoom-out','Zoom out',map(()=>zoomGraph(.83)),hasNodes,'Load files to zoom');
      add('zoom-in','Zoom in',map(()=>zoomGraph(1.2)),hasNodes,'Load files to zoom');
      add('export','Export JSON',exportGraphSnapshot);
      add('folder','Open folder',triggerFolderUpload);
      add('add-file','Add file',openAddFileModal);
      add('settings','Agent settings',openSettingsModal);
      add('files','Find file',()=>openCommandPalette('files'));
      add('help','Help: map controls',()=>showToast('Arrows point from importing file to imported file. Drag a card to move it; drag the background to pan. Scroll to zoom. Use Fit to show all files.'));
      add('clear-folder-focus','Clear folder focus'+(state.folderFilter ? ' ('+state.folderFilter+')' : ''),map(clearFolderFocus),Boolean(state.folderFilter),'No folder is currently focused');
      if (hasNodes) {
        const folders = Array.from(new Set(state.graph.nodes.map(n => n.folder || '/'))).sort();
        folders.forEach(f => {
          const isFoc = state.folderFilter === f;
          add('focus-folder-'+f,(isFoc ? 'Unfocus folder: ' : 'Focus folder: ')+f,map(()=>focusFolder(f)));
        });
      }
      return actions;
    }

    function comparePalettePaths(a,b) {
      const left=Array.from(a), right=Array.from(b);
      for(let i=0;i<Math.min(left.length,right.length);i++) { const difference=left[i].codePointAt(0)-right[i].codePointAt(0); if(difference) return difference; }
      return left.length-right.length;
    }

    function getPaletteResults(query, mode) {
      const needle=String(query || '').trim().toLowerCase();
      const characters=Array.from(needle);
      const rank=path=>{
        const lower=path.toLowerCase();
        if(lower===needle) return 0;
        if(lower.split('/').pop().startsWith(needle)) return 1;
        if(lower.includes(needle)) return 2;
        let index=0; for(const character of lower) if(character===characters[index]) index++;
        return index===characters.length ? 3 : -1;
      };
      const files=state.graph.nodes.map(node=>({path:node.path,rank:rank(node.path)})).filter(node=>node.rank>=0).sort((a,b)=>a.rank-b.rank||comparePalettePaths(a.path,b.path)).map(node=>({id:'file-'+node.path,kind:'file',label:node.path,path:node.path,available:true,reason:''}));
      const actions=mode==='files'?[]:getPaletteActions().filter(action=>action.label.toLowerCase().includes(needle)).map(({id,label,available,reason})=>({id,kind:'action',label,available,reason}));
      const results=actions.concat(files);
      return {results:results.slice(0,50),matchCount:results.length};
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
      if(event.isComposing || event.keyCode===229)return;
      if(['ArrowDown','ArrowUp'].includes(event.key)){
        event.preventDefault();const results=state.ui.paletteResults||[];const available=results.map((result,index)=>result.available?index:-1).filter(index=>index>=0);
        if(available.length){const current=available.indexOf(state.ui.paletteActiveIndex);state.ui.paletteActiveIndex=available[(current+(event.key==='ArrowDown'?1:-1)+available.length)%available.length];renderCommandPalette();}
      }else if(event.key==='Enter'){event.preventDefault();runPaletteResult((state.ui.paletteResults||[])[state.ui.paletteActiveIndex]);}
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
