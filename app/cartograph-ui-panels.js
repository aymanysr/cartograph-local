// Moved verbatim from cartograph.html (split preserved original file order).
// ui-panels: see cartograph.html; loads as a classic script after the lib/ files.
    function makeFileChipHtml(filePath) {
      if (!state.graph.nodes.some(node => node.path === filePath)) return escapeHtml(filePath);
      return `<button type="button" data-filepath="${escapeHtml(filePath)}" class="file-chip" title="${escapeHtml(filePath)}" aria-label="${escapeHtml(filePath)}">${escapeHtml(filePath.split('/').pop())}</button>`;
    }

    function initFilePathDelegation() {
      document.addEventListener('click', event => {
        const chip = event.target.closest('[data-filepath]');
        if (chip) selectFileFromUi(chip.dataset.filepath);
      });
    }

    function updateHeaderMetrics() {
      const nodes = state.graph.nodes;
      const edges = state.graph.edges;
      const cycles = state.graph.cycles;

      document.getElementById('metricTotalFiles').textContent = String(nodes.length);
      document.getElementById('metricTotalEdges').textContent = String(edges.length);

      const freshness = document.getElementById('repositoryFreshness');
      if (freshness) freshness.textContent = state.repositoryProvenance.kind === 'sample' ? 'Built-in sample' : state.repositoryProvenance.scannedAt ? `Scanned ${new Date(state.repositoryProvenance.scannedAt).toLocaleString()}` : 'Snapshot loaded';
      const hotspot = document.getElementById('metricTopHotspotBtn');
      hotspot.textContent = '—';
      delete hotspot.dataset.hotspot;
      if (nodes.length > 0) {
        const top = [...nodes].sort((a, b) => b.totalImpact - a.totalImpact)[0];
        const btn = document.getElementById('metricTopHotspotBtn');
        btn.textContent = `${top.path} (${top.totalImpact} files)`;
        btn.dataset.hotspot = top.path;
      }

      const cycleBadge = document.getElementById('metricCycleBadge');
      cycleBadge.className = '';
      cycleBadge.textContent = `${cycles.length} cycles`;
    }

    function handleCycleBadgeClick() {
      if (state.graph.cycles.length > 0) {
        selectFileFromUi(state.graph.cycles[0][0], true);
      } else {
        showToast('Zero circular dependencies detected in this repository');
      }
    }

    function selectTopHotspot() {
      const btn = document.getElementById('metricTopHotspotBtn');
      if (btn && btn.dataset.hotspot) {
        selectFileFromUi(btn.dataset.hotspot, true);
      }
    }

    function selectFileNode(filePath, panToNode = false) {
      const exists = state.graph.nodes.find(n => n.path === filePath);
      if (!exists) return;

      state.selectedFile = filePath;
      if (state.simulateBreakingChange) {
        const bannerText = document.getElementById('canvasAlertText');
        bannerText.textContent = `Simulated signature change in ${exists.path} (${exists.exports[0] || 'default'}): ${exists.hop1Files.length} direct files and ${exists.hop2Files.length} transitive files will break!`;
      }

      if (panToNode) {
        const canvas = document.getElementById('dependencyCanvas');
        if (canvas) {
          const cx = canvas.clientWidth / 2;
          const cy = canvas.clientHeight / 2;
          state.camera.x = cx - exists.x * state.camera.zoom;
          state.camera.y = cy - exists.y * state.camera.zoom;
        }
      }

      renderFileListSidebar();
      renderInspectorPanel();
    }

    function renderFileListSidebar() {
      const container = document.getElementById('fileListContainer');
      if (!container) return;

      document.getElementById('sortBtnBlast').setAttribute('aria-pressed', String(state.fileSortMode === 'blast'));
      document.getElementById('sortBtnPath').setAttribute('aria-pressed', String(state.fileSortMode === 'path'));
      const scrollTop = container.scrollTop;
      const q = state.searchQuery.trim().toLowerCase();
      let filtered = state.graph.nodes.filter(n => {
        if (state.layerFilter !== 'all' && n.layer !== state.layerFilter) return false;
        if (!q) return true;
        return n.path.toLowerCase().includes(q) || n.exports.some(ex => ex.toLowerCase().includes(q));
      });

      if (state.fileSortMode === 'blast') {
        filtered.sort((a, b) => b.totalImpact - a.totalImpact || a.path.localeCompare(b.path));
      } else {
        filtered.sort((a, b) => a.path.localeCompare(b.path));
      }

      const heading = document.getElementById('activeLayerName');
      if (heading) heading.textContent = state.layerFilter === 'all' ? 'Files' : getLayerMeta(state.layerFilter).label;
      const clear = document.getElementById('clearLayerFilter');
      if (clear) clear.hidden = state.layerFilter === 'all';
      if (filtered.length === 0) {
        container.innerHTML = `<div class="p-4 text-center text-xs required-muted">No files match "${escapeHtml(state.searchQuery)}"</div>`;
        return;
      }

      let previousFolder = null;
      container.innerHTML = filtered.map(node => {
        const folder = node.folder || '/';
        const group = state.fileSortMode === 'path' && folder !== previousFolder ? `<div class="folder-heading">${escapeHtml(folder)}</div>` : '';
        previousFolder = folder;
        return `${group}<button type="button" data-filepath="${escapeHtml(node.path)}" title="${escapeHtml(node.path)}" aria-label="${escapeHtml(node.path)}" aria-current="${node.path === state.selectedFile ? 'true' : 'false'}" class="file-row"><span>${escapeHtml(node.label)}</span><span class="file-impact ${node.totalImpact ? 'nonzero' : ''}">${node.totalImpact}</span></button>`;
      }).join('');
      container.scrollTop = scrollTop;
    }

    function buildGroundedModuleExplanationHtml(node) {
      const exports = node.exports.slice(0,4).map(symbol => `<code>${escapeHtml(symbol)}</code>`).join(', ');
      const omitted = node.exports.length > 4 ? ` and ${node.exports.length - 4} more (see All exports below)` : '';
      const cycle = state.graph.cycles.find(paths => paths.includes(node.path));
      const membership = cycle ? ` It belongs to a circular dependency group: ${cycle.map(makeFileChipHtml).join(', ')}. Every member can reach every other through import paths; this does not mean every pair imports directly.` : '';
      return `${makeFileChipHtml(node.path)} is a ${escapeHtml(getLayerMeta(node.layer).label)} module with ${node.loc} lines${exports ? `, exporting ${exports}${omitted}` : ' and no parsed exports'}. Its parsed imports and dependents are listed below; changing its exported contract may affect ${node.totalImpact} files within two hops.${membership}`;
    }

    function renderInspectorPanel() {
      const node = state.graph.nodes.find(n => n.path === state.selectedFile);
      if (!node) {
        ['inspectorLayerBadge','inspectorLocBadge','inspectorImpactPercent','inspectorHop1Count','inspectorHop2Count','inspectorOutboundCount','hop1HeaderBadge','hop2HeaderBadge','outboundHeaderBadge'].forEach(id => { document.getElementById(id).textContent = '—'; });
        document.getElementById('inspectorFilePath').textContent = 'No file selected';
        document.getElementById('inspectorImpactCaption').textContent = '';
        ['inspectorExportsList','inspectorSourceCode','hop1ListContainer','hop2ListContainer','outboundListContainer'].forEach(id => document.getElementById(id).replaceChildren());
        document.getElementById('inspectorExplanationText').textContent = 'Open a folder or drop a repository snapshot to explore its files.';
        return;
      }

      const layerMeta = getLayerMeta(node.layer);
      const totalFiles = state.graph.nodes.length;
      const pct = totalFiles > 0 ? ((node.totalImpact / totalFiles) * 100).toFixed(1) : 0;

      document.getElementById('inspectorLayerBadge').textContent = layerMeta.label;
      document.getElementById('inspectorLocBadge').textContent = `${node.loc} lines`;
      document.getElementById('inspectorFilePath').textContent = node.path;

      document.getElementById('inspectorExportsList').innerHTML = node.exports.map(sym =>
        `<span class="export-symbol">${escapeHtml(sym)}</span>`
      ).join('');

      document.getElementById('inspectorImpactPercent').textContent = `${node.totalImpact} / ${totalFiles} files`;
      document.getElementById('inspectorImpactCaption').textContent = `in the 2-level blast radius (${pct}%)`;
      document.getElementById('inspectorHop1Count').textContent = String(node.hop1Files.length);
      document.getElementById('inspectorHop2Count').textContent = String(node.hop2Files.length);
      document.getElementById('inspectorOutboundCount').textContent = String(node.outboundEdges.length);

      ['inspectorHop1Count','inspectorHop2Count','inspectorOutboundCount'].forEach(id => {
        document.getElementById(id).dataset.zero = String(document.getElementById(id).textContent === '0');
      });
      document.getElementById('inspectorExplanationText').innerHTML = buildGroundedModuleExplanationHtml(node);

      document.getElementById('hop1HeaderBadge').textContent = `${node.hop1Files.length} file${node.hop1Files.length === 1 ? '' : 's'}`;
      const hop1Container = document.getElementById('hop1ListContainer');
      if (node.hop1Edges.length === 0) {
        hop1Container.innerHTML = `<div class="p-3 text-xs required-muted">No files directly import this module.</div>`;
      } else {
        hop1Container.innerHTML = node.hop1Edges.map(edge => `
          <div class="p-2.5 hover:bg-slate-800/50 flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div>${makeFileChipHtml(edge.source)}</div>
              <div class="font-mono text-[10px] text-slate-400 truncate mt-1" title="${escapeHtml(edge.statement)}">L${edge.line}: ${escapeHtml(edge.statement)}</div>
            </div>
            <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 shrink-0">1-Hop</span>
          </div>
        `).join('');
      }

      document.getElementById('hop2HeaderBadge').textContent = `${node.hop2Files.length} file${node.hop2Files.length === 1 ? '' : 's'}`;
      const hop2Container = document.getElementById('hop2ListContainer');
      if (node.hop2Details.length === 0) {
        hop2Container.innerHTML = `<div class="p-3 text-xs required-muted">No secondary 2-hop transitive dependents.</div>`;
      } else {
        hop2Container.innerHTML = node.hop2Details.map(det => `
          <div class="p-2.5 hover:bg-slate-800/50 flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="flex items-center flex-wrap gap-1 text-[11px] text-slate-400">
                ${makeFileChipHtml(det.file)}
                <span>→ via</span>
                ${makeFileChipHtml(det.via)}
              </div>
              <div class="font-mono text-[10px] text-slate-400 truncate mt-1">L${det.line}: ${escapeHtml(det.statement)}</div>
            </div>
            <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 shrink-0">2-Hop</span>
          </div>
        `).join('');
      }

      document.getElementById('outboundHeaderBadge').textContent = `${node.outboundEdges.length} file${node.outboundEdges.length === 1 ? '' : 's'}`;
      const outboundContainer = document.getElementById('outboundListContainer');
      if (node.outboundEdges.length === 0) {
        outboundContainer.innerHTML = `<div class="p-3 text-xs required-muted">Zero internal imports (foundational module).</div>`;
      } else {
        outboundContainer.innerHTML = node.outboundEdges.map(edge => `
          <div class="p-2.5 hover:bg-slate-800/50 flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div>${makeFileChipHtml(edge.target)}</div>
              <div class="font-mono text-[10px] text-slate-400 truncate mt-1">L${edge.line}: ${escapeHtml(edge.statement)}</div>
            </div>
            <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 shrink-0">Imports</span>
          </div>
        `).join('');
      }

      const codeLines = node.content.split('\n').map((line, i) => {
        const ln = String(i + 1).padStart(2, ' ');
        const isImportLine = node.outboundEdges.some(e => e.line === i + 1);
        const rowClass = isImportLine ? 'source-row source-import' : 'source-row';
        return `<span class="${rowClass}"><span class="source-line-number">${ln}</span>${escapeHtml(line)}</span>`;
      }).join('');
      document.getElementById('inspectorSourceCode').innerHTML = codeLines;
    }

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

