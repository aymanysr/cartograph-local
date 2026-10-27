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
        el.className = k === docName
          ? 'w-full text-left p-3 rounded-xl border border-indigo-500/50 bg-indigo-950/30 transition-all'
          : 'w-full text-left p-3 rounded-xl border border-slate-800 bg-slate-900/70 hover:bg-slate-900 transition-all';
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

    async function ingestUploadedFileObjects(fileList) {
      const ignoredSegments = ['node_modules/', '.git/', '.next/', 'dist/', 'build/', '__pycache__/', '.venv/'];
      const validExts = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.py', '.go', '.json'];

      if (fileList.length === 1 && fileList[0].name.endsWith('.json')) {
        try {
          const text = await fileList[0].text();
          const parsed = JSON.parse(text);
          if (parsed && parsed.graph && Array.isArray(parsed.graph.nodes)) {
            applyParsedGraph(parsed.graph);
            showToast(`Loaded ${parsed.graph.nodes.length} parsed nodes from ${fileList[0].name}`);
            return;
          }
          if (parsed && Array.isArray(parsed.files)) {
            parseRepositoryIntoGraph(parsed.files, parsed.name || 'imported-snapshot', 'Imported from Cartograph JSON snapshot');
            showToast(`Loaded ${parsed.files.length} files from ${fileList[0].name}`);
            return;
          }
        } catch (err) {}
      }

      const collected = [];
      let rootFolder = 'local-project';

      for (const file of fileList) {
        const rawRel = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
        if (ignoredSegments.some(seg => rawRel.includes(seg))) continue;
        const ext = '.' + rawRel.split('.').pop().toLowerCase();
        if (!validExts.includes(ext)) continue;
        if (file.size > 350000) continue;

        const parts = rawRel.split('/');
        if (parts.length > 1) rootFolder = parts[0];
        const normalizedPath = parts.length > 1 ? parts.slice(1).join('/') : rawRel;

        try {
          const content = await file.text();
          collected.push({ path: normalizedPath, content });
        } catch (e) {}
      }

      if (collected.length === 0) {
        showToast('No supported code files (.ts, .tsx, .js, .py, .go) found in selection', 'warn');
        return;
      }

      markPresetSelectCustom(`local: ${rootFolder} (${collected.length} files)`);

      parseRepositoryIntoGraph(collected, rootFolder, `Local folder loaded directly from disk (${collected.length} files)`);
      showToast(`Parsed ${collected.length} local files from "${rootFolder}"`);
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
      document.getElementById('modalAddFile').classList.remove('hidden');
    }

    function closeAddFileModal() {
      document.getElementById('modalAddFile').classList.add('hidden');
    }

    function submitCustomFile() {
      const pathInput = document.getElementById('customFilePathInput').value.trim();
      const codeInput = document.getElementById('customFileCodeInput').value;
      if (!pathInput) {
        showToast('Please enter a relative file path', 'warn');
        return;
      }

      const updatedFiles = [...state.rawFiles.filter(f => f.path !== pathInput), { path: pathInput, content: codeInput }];
      parseRepositoryIntoGraph(updatedFiles, state.repoName, state.repoDescription);
      selectFileNode(pathInput, true);
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
      state.activeView = view;
      document.getElementById('viewExplorer').classList.toggle('hidden', view !== 'explorer');
      document.getElementById('viewEvals').classList.toggle('hidden', view !== 'evals');
      document.getElementById('viewSpecs').classList.toggle('hidden', view !== 'specs');

      const tabMap = {
        explorer: 'navTabExplorer',
        evals: 'navTabEvals',
        specs: 'navTabSpecs'
      };
      Object.entries(tabMap).forEach(([k, id]) => {
        const btn = document.getElementById(id);
        btn.className = k === view
          ? 'px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all bg-indigo-600 text-white shadow-sm'
          : 'px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all text-slate-300 hover:text-white';
      });

      if (view === 'explorer') {
        setTimeout(() => drawDependencyGraph(), 20);
      }
    }

    function switchRightPanelTab(tab) {
      state.rightPanelTab = tab;
      document.getElementById('panelInspectorContent').classList.toggle('hidden', tab !== 'inspector');
      document.getElementById('panelAgentContent').classList.toggle('hidden', tab !== 'agent');

      document.getElementById('rightTabInspector').className = tab === 'inspector'
        ? 'flex-1 py-2 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all bg-slate-800 text-white shadow-sm border border-slate-700/70'
        : 'flex-1 py-2 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all text-slate-400 hover:text-slate-200';

      document.getElementById('rightTabAgent').className = tab === 'agent'
        ? 'flex-1 py-2 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all bg-slate-800 text-white shadow-sm border border-slate-700/70'
        : 'flex-1 py-2 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all text-slate-400 hover:text-slate-200';
    }

    function handlePresetChange(presetKey) {
      const preset = PRESET_REPOS[presetKey];
      if (!preset) return;
      state.selectedFile = '';
      parseRepositoryIntoGraph(preset.files, preset.name, preset.description);
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
        btn.className = isMatch
          ? 'layer-pill px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-600 text-white'
          : 'layer-pill px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300 hover:bg-slate-700';
      });
      renderFileListSidebar();
    }

    function setFileSortMode(mode) {
      state.fileSortMode = mode;
      document.getElementById('sortBtnBlast').className = mode === 'blast'
        ? 'px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-rose-300'
        : 'px-2 py-0.5 rounded text-[10px] font-medium text-slate-400 hover:text-slate-200';
      document.getElementById('sortBtnPath').className = mode === 'path'
        ? 'px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-indigo-300'
        : 'px-2 py-0.5 rounded text-[10px] font-medium text-slate-400 hover:text-slate-200';
      renderFileListSidebar();
    }

    function openSettingsModal() {
      document.getElementById('modalSettings').classList.remove('hidden');
    }

    function closeSettingsModal() {
      document.getElementById('modalSettings').classList.add('hidden');
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
      const borderColor = type === 'warn' ? 'border-amber-500/50 text-amber-200' : 'border-indigo-500/50 text-slate-100';
      el.className = `glass-panel ${borderColor} px-3.5 py-2 rounded-lg text-xs font-medium shadow-xl transition-all duration-200`;
      el.textContent = msg;
      container.appendChild(el);
      setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 220);
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

      initCanvasInteractions();
      initGlobalDragAndDrop();

      let loadedFromServer = false;
      try {
        const response = await fetch('/api/local-repo');
        if (response.ok) {
          const payload = await response.json();
          if (payload && payload.graph && Array.isArray(payload.graph.nodes)) {
            applyParsedGraph(payload.graph);
            markPresetSelectCustom(`local: ${payload.name || payload.graph.name || 'local repository'} (${(payload.graph.nodes || []).length} files)`);
            loadedFromServer = true;
            showToast(`Loaded scanned repository: ${payload.name || payload.graph.name || 'local'}`);
          }
        }
      } catch (e) {
        // Opened directly from disk (file://) — fall back to the bundled sample repo.
      }

      if (!loadedFromServer) {
        const initialPreset = PRESET_REPOS['cartograph-saas'];
        parseRepositoryIntoGraph(initialPreset.files, initialPreset.name, initialPreset.description);
      }

      runAgentQuery('Where does auth get enforced across the repository?');
      switchRightPanelTab('inspector');
      if (state.graph.nodes.some(n => n.path === 'src/lib/db/supabase.ts')) {
        selectFileNode('src/lib/db/supabase.ts', false);
      }

      window.addEventListener('resize', () => {
        computeGraphNodePositions();
      });

      startCanvasAnimationLoop();
      lucide.createIcons();
    });
