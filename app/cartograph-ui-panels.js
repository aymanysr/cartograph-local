// Moved verbatim from cartograph.html (split preserved original file order).
// ui-panels: see cartograph.html; loads as a classic script after the lib/ files.
    function makeFileChipHtml(filePath) {
      const shortName = filePath.split('/').pop();
      return `<button type="button" data-filepath="${escapeHtml(filePath)}" onclick="selectFileNode('${filePath}', true)" class="file-chip" title="${filePath}">${shortName}</button>`;
    }

    function updateHeaderMetrics() {
      const nodes = state.graph.nodes;
      const edges = state.graph.edges;
      const cycles = state.graph.cycles;

      document.getElementById('metricTotalFiles').textContent = String(nodes.length);
      document.getElementById('metricTotalEdges').textContent = String(edges.length);

      if (nodes.length > 0) {
        const top = [...nodes].sort((a, b) => b.totalImpact - a.totalImpact)[0];
        const btn = document.getElementById('metricTopHotspotBtn');
        btn.textContent = `${top.path} (${top.totalImpact} files)`;
        btn.dataset.hotspot = top.path;
      }

      const cycleBadge = document.getElementById('metricCycleBadge');
      if (cycles.length > 0) {
        cycleBadge.className = 'px-2 py-0.5 rounded text-[11px] font-mono bg-rose-500/20 text-rose-300 border border-rose-500/40 cursor-pointer';
        cycleBadge.textContent = `${cycles.length} Circular Dependency (${cycles[0][0].split('/').pop()} ↔ ${cycles[0][1].split('/').pop()})`;
      } else {
        cycleBadge.className = 'px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/20';
        cycleBadge.textContent = '0 Circular Dependencies';
      }
    }

    function handleCycleBadgeClick() {
      if (state.graph.cycles.length > 0) {
        selectFileNode(state.graph.cycles[0][0], true);
      } else {
        showToast('Zero circular dependencies detected in this repository');
      }
    }

    function selectTopHotspot() {
      const btn = document.getElementById('metricTopHotspotBtn');
      if (btn && btn.dataset.hotspot) {
        selectFileNode(btn.dataset.hotspot, true);
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

      if (filtered.length === 0) {
        container.innerHTML = `<div class="p-4 text-center text-xs text-slate-500">No files match "${escapeHtml(state.searchQuery)}"</div>`;
        return;
      }

      container.innerHTML = filtered.map(node => {
        const isSelected = node.path === state.selectedFile;
        const role = getNodeVisualRole(node.path);
        const layerMeta = getLayerMeta(node.layer);

        const impactBadgeClass = node.totalImpact >= 6
          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
          : node.totalImpact >= 2
          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
          : 'bg-slate-800 text-slate-400 border-slate-700';

        const roleDot = role === 'hop1'
          ? '<span class="w-2 h-2 rounded-full bg-rose-500 shrink-0" title="1-Hop Direct Dependent"></span>'
          : role === 'hop2'
          ? '<span class="w-2 h-2 rounded-full bg-amber-500 shrink-0" title="2-Hop Transitive Dependent"></span>'
          : `<span class="w-2 h-2 rounded-full shrink-0" style="background:${layerMeta.color}"></span>`;

        return `
          <button type="button" onclick="selectFileNode('${node.path}', false)" class="w-full text-left px-2.5 py-2 rounded-lg transition-all flex items-center justify-between gap-2 ${isSelected ? 'bg-indigo-600/25 border border-indigo-500/50 text-white' : 'hover:bg-slate-800/70 text-slate-300 border border-transparent'}">
            <div class="min-w-0 flex items-center gap-2">
              ${roleDot}
              <div class="min-w-0">
                <div class="font-mono text-xs font-medium truncate">${node.label}</div>
                <div class="font-mono text-[10px] text-slate-400 truncate">${node.folder || '/'}</div>
              </div>
            </div>
            <span class="px-1.5 py-0.5 rounded text-[10px] font-mono border shrink-0 ${impactBadgeClass}" title="${node.hop1Files.length} direct + ${node.hop2Files.length} transitive dependents">
              ${node.totalImpact} dep
            </span>
          </button>
        `;
      }).join('');
    }

    function buildGroundedModuleExplanationHtml(node) {
      const layerMeta = getLayerMeta(node.layer);
      const exportsList = node.exports.slice(0, 4).map(e => `<code class="text-indigo-300 font-mono">${e}</code>`).join(', ');
      const totalNodes = state.graph.nodes.length;
      const pct = totalNodes > 0 ? Math.round((node.totalImpact / totalNodes) * 100) : 0;

      const parts = [];
      parts.push(`${makeFileChipHtml(node.path)} is a <strong class="text-white">${layerMeta.label}</strong> module (${node.loc} lines) that exports ${exportsList || 'internal helpers'}.`);

      if (node.outboundEdges.length > 0) {
        const outChips = node.outboundEdges.map(e => `${makeFileChipHtml(e.target)} <span class="text-slate-500 font-mono text-[10px]">(L${e.line})</span>`).join(', ');
        parts.push(`It directly imports from ${outChips}.`);
      } else {
        parts.push(`It has <strong class="text-cyan-300">0 internal dependencies</strong> (making it a foundational leaf module in the repository).`);
      }

      if (node.hop1Files.length > 0) {
        const hop1Chips = node.hop1Files.map(f => makeFileChipHtml(f)).join(' ');
        parts.push(`<br/><br/><strong class="text-rose-300">Blast Radius Warning:</strong> Modifying its exported contract immediately impacts <strong class="text-white">${node.hop1Files.length} direct dependent${node.hop1Files.length === 1 ? '' : 's'}</strong> (${hop1Chips})`);
        if (node.hop2Files.length > 0) {
          const hop2Chips = node.hop2Files.map(f => makeFileChipHtml(f)).join(' ');
          parts.push(`and cascades two hops out to <strong class="text-amber-300">${node.hop2Files.length} upstream module${node.hop2Files.length === 1 ? '' : 's'}</strong> (${hop2Chips}) — affecting <strong class="text-white">${pct}% of the codebase</strong>.`);
        } else {
          parts.push(`with no secondary 2-hop cascade.`);
        }
      } else {
        parts.push(`<br/><br/><strong class="text-emerald-300">Low Blast Radius:</strong> No other files in the repository import ${makeFileChipHtml(node.path)}, so changes here are isolated to this entry point.`);
      }

      const cycle = state.graph.cycles.find(c => c.includes(node.path));
      if (cycle) {
        const other = cycle.find(p => p !== node.path) || node.path;
        parts.push(`<br/><br/><span class="text-rose-400 font-semibold">Circular Dependency Detected:</span> ${makeFileChipHtml(node.path)} and ${makeFileChipHtml(other)} mutually import one another.`);
      }

      return parts.join(' ');
    }

    function renderInspectorPanel() {
      const node = state.graph.nodes.find(n => n.path === state.selectedFile);
      if (!node) return;

      const layerMeta = getLayerMeta(node.layer);
      const totalFiles = state.graph.nodes.length;
      const pct = totalFiles > 0 ? Math.round((node.totalImpact / totalFiles) * 100) : 0;

      document.getElementById('inspectorLayerBadge').textContent = layerMeta.label.toUpperCase();
      document.getElementById('inspectorLocBadge').textContent = `${node.loc} lines`;
      document.getElementById('inspectorFilePath').textContent = node.path;

      document.getElementById('inspectorExportsList').innerHTML = node.exports.map(sym =>
        `<span class="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[11px] text-indigo-200">${sym}</span>`
      ).join('');

      document.getElementById('inspectorImpactPercent').textContent = `${node.totalImpact} of ${totalFiles} files (${pct}%)`;
      document.getElementById('inspectorHop1Count').textContent = String(node.hop1Files.length);
      document.getElementById('inspectorHop2Count').textContent = String(node.hop2Files.length);
      document.getElementById('inspectorOutboundCount').textContent = String(node.outboundEdges.length);

      document.getElementById('inspectorExplanationText').innerHTML = buildGroundedModuleExplanationHtml(node);

      document.getElementById('hop1HeaderBadge').textContent = `${node.hop1Files.length} file${node.hop1Files.length === 1 ? '' : 's'}`;
      const hop1Container = document.getElementById('hop1ListContainer');
      if (node.hop1Edges.length === 0) {
        hop1Container.innerHTML = `<div class="p-3 text-xs text-slate-500">No files directly import this module.</div>`;
      } else {
        hop1Container.innerHTML = node.hop1Edges.map(edge => `
          <div class="p-2.5 hover:bg-slate-800/50 flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div>${makeFileChipHtml(edge.source)}</div>
              <div class="font-mono text-[10px] text-slate-400 truncate mt-1" title="${edge.statement.replace(/"/g, '&quot;')}">L${edge.line}: ${escapeHtml(edge.statement)}</div>
            </div>
            <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 shrink-0">1-Hop</span>
          </div>
        `).join('');
      }

      document.getElementById('hop2HeaderBadge').textContent = `${node.hop2Files.length} file${node.hop2Files.length === 1 ? '' : 's'}`;
      const hop2Container = document.getElementById('hop2ListContainer');
      if (node.hop2Details.length === 0) {
        hop2Container.innerHTML = `<div class="p-3 text-xs text-slate-500">No secondary 2-hop transitive dependents.</div>`;
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
        outboundContainer.innerHTML = `<div class="p-3 text-xs text-slate-500">Zero internal imports (foundational module).</div>`;
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
        const rowClass = isImportLine ? 'bg-indigo-500/15 text-indigo-200 block -mx-3 px-3 border-l-2 border-indigo-400' : '';
        return `<span class="${rowClass}"><span class="text-slate-600 select-none mr-3">${ln}</span>${escapeHtml(line)}</span>`;
      }).join('\n');
      document.getElementById('inspectorSourceCode').innerHTML = codeLines;
    }

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

