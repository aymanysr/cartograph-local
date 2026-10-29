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
        const focusBtn = event.target.closest('[data-folder-focus]');
        if (focusBtn) {
          focusFolder(focusBtn.dataset.folderFocus);
        }
        const clearBtn = event.target.closest('[data-folder-clear]');
        if (clearBtn) {
          clearFolderFocus();
        }
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
        if (typeof CartographNavigation !== 'undefined' && CartographNavigation.centerOnNode) {
          CartographNavigation.centerOnNode(filePath);
        } else {
          const canvas = document.getElementById('dependencyCanvas');
          if (canvas) {
            state.camera = CartographCamera.centerOnNode(state.camera, exists, canvas.clientWidth, canvas.clientHeight);
          }
        }
      }

      renderFileListSidebar();
      renderInspectorPanel();
    }

    function focusFolder(folder) {
      if (!folder) return;
      if (state.folderFilter === folder) {
        clearFolderFocus();
        return;
      }
      state.folderFilter = folder;
      if (typeof CartographStore !== 'undefined' && CartographStore.notify) {
        CartographStore.notify({ type: 'filter', updates: { folderFilter: folder } });
      }

      if (typeof fitGraphToCanvas === 'function') {
        fitGraphToCanvas({ top: 60, right: 60, bottom: 60, left: 60 });
      }

      renderFileListSidebar();
      if (typeof showToast === 'function') {
        const matching = state.graph.nodes ? state.graph.nodes.filter(n =>
          folder === '/' ? (!n.folder || n.folder === '/') : (n.folder === folder || n.path.startsWith(folder + '/'))
        ) : [];
        showToast(`Focused folder: ${folder} (${matching.length} files)`);
      }
      if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
      }
    }

    function clearFolderFocus() {
      state.folderFilter = null;
      if (typeof CartographStore !== 'undefined' && CartographStore.notify) {
        CartographStore.notify({ type: 'filter', updates: { folderFilter: null } });
      }
      if (typeof fitGraphToCanvas === 'function') {
        fitGraphToCanvas();
      }
      renderFileListSidebar();
      if (typeof showToast === 'function') {
        showToast('Folder focus cleared');
      }
      if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
      }
    }

    function clearAllBrowserFilters() {
      state.layerFilter = 'all';
      state.folderFilter = null;
      document.querySelectorAll('.layer-pill').forEach(btn => {
        btn.setAttribute('aria-pressed', String(btn.dataset.layer === 'all'));
      });
      if (typeof fitGraphToCanvas === 'function') {
        fitGraphToCanvas();
      }
      renderFileListSidebar();
      if (typeof showToast === 'function') {
        showToast('All filters cleared');
      }
      if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
      }
    }

    function renderFileListSidebar() {
      const container = document.getElementById('fileListContainer');
      if (!container) return;

      const sortBlast = document.getElementById('sortBtnBlast');
      const sortPath = document.getElementById('sortBtnPath');
      if (sortBlast) sortBlast.setAttribute('aria-pressed', String(state.fileSortMode === 'blast'));
      if (sortPath) sortPath.setAttribute('aria-pressed', String(state.fileSortMode === 'path'));
      const scrollTop = container.scrollTop;
      const q = state.searchQuery.trim().toLowerCase();
      let filtered = (state.graph.nodes || []).filter(n => {
        if (state.layerFilter !== 'all' && n.layer !== state.layerFilter) return false;
        if (state.folderFilter) {
          const inFolder = state.folderFilter === '/'
            ? (!n.folder || n.folder === '/')
            : (n.folder === state.folderFilter || n.path.startsWith(state.folderFilter + '/'));
          if (!inFolder) return false;
        }
        if (!q) return true;
        return n.path.toLowerCase().includes(q) || n.exports.some(ex => ex.toLowerCase().includes(q));
      });

      if (state.fileSortMode === 'blast') {
        filtered.sort((a, b) => b.totalImpact - a.totalImpact || a.path.localeCompare(b.path));
      } else {
        filtered.sort((a, b) => a.path.localeCompare(b.path));
      }

      const heading = document.getElementById('activeLayerName');
      if (heading) {
        if (state.folderFilter && state.layerFilter !== 'all') {
          heading.textContent = `📁 ${state.folderFilter} · ${getLayerMeta(state.layerFilter).label}`;
        } else if (state.folderFilter) {
          heading.textContent = `📁 ${state.folderFilter}`;
        } else if (state.layerFilter !== 'all') {
          heading.textContent = getLayerMeta(state.layerFilter).label;
        } else {
          heading.textContent = 'Files';
        }
      }
      const clear = document.getElementById('clearLayerFilter');
      if (clear) {
        const hasFilter = state.layerFilter !== 'all' || Boolean(state.folderFilter);
        clear.hidden = !hasFilter;
        clear.textContent = state.folderFilter ? 'Clear focus' : 'Clear filter';
      }
      if (filtered.length === 0) {
        container.innerHTML = `<div class="p-4 text-center text-xs required-muted">No files match "${escapeHtml(state.searchQuery)}"</div>`;
        return;
      }

      let previousFolder = null;
      container.innerHTML = filtered.map(node => {
        const folder = node.folder || '/';
        let group = '';
        if (state.fileSortMode === 'path' && folder !== previousFolder) {
          const isFocused = state.folderFilter && (
            folder === state.folderFilter ||
            (state.folderFilter !== '/' && folder.startsWith(state.folderFilter + '/'))
          );
          const folderNodes = (state.graph.nodes || []).filter(n =>
            folder === '/' ? (!n.folder || n.folder === '/') : (n.folder === folder || n.path.startsWith(folder + '/'))
          );
          const count = folderNodes.length;
          group = `
            <div class="folder-heading flex items-center justify-between group/f ${isFocused ? 'folder-heading-focused' : ''}">
              <button type="button" data-folder-focus="${escapeHtml(folder)}" class="folder-title-btn flex items-center gap-1.5 min-w-0 text-left hover:text-white transition-colors flex-1" aria-pressed="${isFocused ? 'true' : 'false'}" aria-label="${isFocused ? 'Clear focus on ' + escapeHtml(folder) : 'Focus folder ' + escapeHtml(folder) + ' (' + count + ' files)'}">
                <i data-lucide="${isFocused ? 'folder-open' : 'folder'}" class="w-3.5 h-3.5 shrink-0 ${isFocused ? 'text-sky-400' : 'text-slate-400'}"></i>
                <span class="truncate font-mono">${escapeHtml(folder)}</span>
                <span class="text-[10px] text-slate-400 font-mono shrink-0">(${count})</span>
              </button>
              <button type="button" ${isFocused ? 'data-folder-clear="true"' : `data-folder-focus="${escapeHtml(folder)}"`} class="folder-focus-pill text-[10px] font-mono px-2 py-0.5 rounded cursor-pointer transition-all shrink-0 ml-1.5 ${isFocused ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'}" aria-hidden="true" tabindex="-1">
                ${isFocused ? 'Focused ✕' : 'Focus'}
              </button>
            </div>
          `;
          previousFolder = folder;
        }
        return `${group}<button type="button" data-filepath="${escapeHtml(node.path)}" title="${escapeHtml(node.path)}" aria-label="${escapeHtml(node.path)}" aria-current="${node.path === state.selectedFile ? 'true' : 'false'}" class="file-row"><span>${escapeHtml(node.label)}</span><span class="file-impact ${node.totalImpact ? 'nonzero' : ''}">${node.totalImpact}</span></button>`;
      }).join('');
      container.scrollTop = scrollTop;

      if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
      }
    }

    function buildGroundedModuleExplanationHtml(node) {
      const exports = node.exports.slice(0,4).map(symbol => `<code>${escapeHtml(symbol)}</code>`).join(', ');
      const omitted = node.exports.length > 4 ? ` and ${node.exports.length - 4} more (see All exports below)` : '';
      const cycle = state.graph.cycles.find(paths => paths.includes(node.path));
      const membership = cycle ? ` It belongs to a circular dependency group: ${cycle.map(makeFileChipHtml).join(', ')}. Every member can reach every other through import paths; this does not mean every pair imports directly.` : '';
      return `${makeFileChipHtml(node.path)} is a ${escapeHtml(getLayerMeta(node.layer).label)} module with ${node.loc} lines${exports ? `, exporting ${exports}${omitted}` : ' and no parsed exports'}. Its parsed imports and dependents are listed below; changing its exported contract may affect ${node.totalImpact} files within two hops.${membership}`;
    }

    function copySelectedFilePath() {
      if (!state.selectedFile) return;
      if (typeof copyTextSafe === 'function') {
        copyTextSafe(state.selectedFile, `Copied path: ${state.selectedFile}`);
      } else if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(state.selectedFile).then(() => {
          showToast(`Copied path: ${state.selectedFile}`);
        }).catch(() => {
          showToast(`Selected file: ${state.selectedFile}`);
        });
      } else {
        showToast(`Selected file: ${state.selectedFile}`);
      }
    }

    function centerSelectedOnMap() {
      if (!state.selectedFile) return;
      if (state.activeView !== 'explorer' && typeof switchMainView === 'function') {
        switchMainView('explorer');
      }
      if (typeof CartographNavigation !== 'undefined' && CartographNavigation.centerOnNode) {
        CartographNavigation.centerOnNode(state.selectedFile);
      } else {
        const node = state.graph.nodes ? state.graph.nodes.find(n => n.path === state.selectedFile) : null;
        const canvas = document.getElementById('dependencyCanvas');
        if (node && canvas && typeof CartographCamera !== 'undefined') {
          state.camera = CartographCamera.centerOnNode(state.camera, node, canvas.clientWidth, canvas.clientHeight);
        }
      }
      showToast(`Centered on ${state.selectedFile.split('/').pop()}`);
    }

    function toggleSimulateSelected() {
      if (!state.selectedFile) return;
      if (typeof toggleBreakSimulation === 'function') {
        toggleBreakSimulation();
      } else {
        state.simulateBreakingChange = !state.simulateBreakingChange;
        if (typeof syncCanvasToggleState === 'function') syncCanvasToggleState();
      }
    }

    function renderInspectorPanel() {
      const node = state.graph.nodes ? state.graph.nodes.find(n => n.path === state.selectedFile) : null;
      const actionToolbar = document.getElementById('inspectorActionToolbar');
      const cycleBadge = document.getElementById('inspectorCycleBadge');
      const metaContext = document.getElementById('inspectorMetaContext');

      if (!node) {
        ['inspectorLayerBadge','inspectorLocBadge','inspectorImpactPercent','inspectorHop1Count','inspectorHop2Count','inspectorOutboundCount','hop1HeaderBadge','hop2HeaderBadge','outboundHeaderBadge'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.textContent = '—';
        });
        const pathEl = document.getElementById('inspectorFilePath');
        if (pathEl) pathEl.textContent = 'No file selected';
        const captionEl = document.getElementById('inspectorImpactCaption');
        if (captionEl) captionEl.textContent = '';
        if (cycleBadge) {
          cycleBadge.classList.add('hidden');
          cycleBadge.textContent = '';
        }
        if (metaContext) metaContext.classList.add('hidden');
        if (actionToolbar) {
          actionToolbar.style.opacity = '0.35';
          actionToolbar.querySelectorAll('button').forEach(btn => {
            btn.disabled = true;
            btn.setAttribute('aria-disabled', 'true');
          });
        }
        ['inspectorExportsList','inspectorSourceCode','hop1ListContainer','hop2ListContainer','outboundListContainer'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.replaceChildren();
        });
        const expEl = document.getElementById('inspectorExplanationText');
        if (expEl) expEl.textContent = 'Open a folder or drop a repository snapshot to explore its files.';
        return;
      }

      if (metaContext) metaContext.classList.remove('hidden');
      if (actionToolbar) {
        actionToolbar.style.opacity = '1';
        actionToolbar.querySelectorAll('button').forEach(btn => {
          btn.disabled = false;
          btn.removeAttribute('aria-disabled');
        });
      }
      const inspSimBtn = document.getElementById('btnInspectorSimulate');
      if (inspSimBtn) inspSimBtn.setAttribute('aria-pressed', String(Boolean(state.simulateBreakingChange)));

      const layerMeta = getLayerMeta(node.layer);
      const totalFiles = state.graph.nodes.length;
      const pct = totalFiles > 0 ? ((node.totalImpact / totalFiles) * 100).toFixed(1) : 0;

      const layerBadge = document.getElementById('inspectorLayerBadge');
      if (layerBadge) layerBadge.textContent = layerMeta.label;
      const locBadge = document.getElementById('inspectorLocBadge');
      if (locBadge) locBadge.textContent = `${node.loc} lines`;
      const pathEl = document.getElementById('inspectorFilePath');
      if (pathEl) pathEl.textContent = node.path;

      // Circular dependency warning badge in inspector
      const cycle = state.graph.cycles.find(paths => paths.includes(node.path));
      if (cycleBadge) {
        if (cycle) {
          cycleBadge.classList.remove('hidden');
          const otherFiles = cycle.filter(p => p !== node.path);
          cycleBadge.innerHTML = ` · <span class="text-rose-400 font-medium" title="Cycle with ${escapeHtml(otherFiles.join(', '))}">↺ Cycle (${cycle.length} files)</span>`;
        } else {
          cycleBadge.classList.add('hidden');
          cycleBadge.textContent = '';
        }
      }

      const exportsList = document.getElementById('inspectorExportsList');
      if (exportsList) {
        exportsList.innerHTML = node.exports.map(sym =>
          `<span class="export-symbol">${escapeHtml(sym)}</span>`
        ).join('');
      }

      const impactPct = document.getElementById('inspectorImpactPercent');
      if (impactPct) impactPct.textContent = `${node.totalImpact} / ${totalFiles} files`;
      const impactCap = document.getElementById('inspectorImpactCaption');
      if (impactCap) impactCap.textContent = `in the 2-level blast radius (${pct}%)`;

      const hop1Count = document.getElementById('inspectorHop1Count');
      if (hop1Count) hop1Count.textContent = String(node.hop1Files.length);
      const hop2Count = document.getElementById('inspectorHop2Count');
      if (hop2Count) hop2Count.textContent = String(node.hop2Files.length);
      const outCount = document.getElementById('inspectorOutboundCount');
      if (outCount) outCount.textContent = String(node.outboundEdges.length);

      ['inspectorHop1Count','inspectorHop2Count','inspectorOutboundCount'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.dataset.zero = String(el.textContent === '0');
      });

      const explanationEl = document.getElementById('inspectorExplanationText');
      if (explanationEl) explanationEl.innerHTML = buildGroundedModuleExplanationHtml(node);

      const hop1Badge = document.getElementById('hop1HeaderBadge');
      if (hop1Badge) hop1Badge.textContent = `${node.hop1Files.length} file${node.hop1Files.length === 1 ? '' : 's'}`;
      const hop1Container = document.getElementById('hop1ListContainer');
      if (hop1Container) {
        if (node.hop1Edges.length === 0) {
          hop1Container.innerHTML = `<div class="p-3 text-xs required-muted">No files directly import this module.</div>`;
        } else {
          hop1Container.innerHTML = node.hop1Edges.map(edge => `
            <div class="p-2.5 hover:bg-slate-800/50 flex items-start justify-between gap-2 border-b border-slate-800/40 last:border-b-0">
              <div class="min-w-0">
                <div>${makeFileChipHtml(edge.source)}</div>
                <div class="font-mono text-[10px] text-slate-400 truncate mt-1" title="${escapeHtml(edge.statement)}">
                  <span class="text-rose-400 font-semibold">L${edge.line}</span>: ${escapeHtml(edge.statement)}
                </div>
              </div>
              <span data-badge class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 shrink-0">1-Hop</span>
            </div>
          `).join('');
        }
      }

      const hop2Badge = document.getElementById('hop2HeaderBadge');
      if (hop2Badge) hop2Badge.textContent = `${node.hop2Files.length} file${node.hop2Files.length === 1 ? '' : 's'}`;
      const hop2Container = document.getElementById('hop2ListContainer');
      if (hop2Container) {
        if (node.hop2Details.length === 0) {
          hop2Container.innerHTML = `<div class="p-3 text-xs required-muted">No secondary 2-hop transitive dependents.</div>`;
        } else {
          hop2Container.innerHTML = node.hop2Details.map(det => `
            <div class="p-2.5 hover:bg-slate-800/50 flex items-start justify-between gap-2 border-b border-slate-800/40 last:border-b-0">
              <div class="min-w-0">
                <div class="flex items-center flex-wrap gap-1 text-[11px] text-slate-400">
                  ${makeFileChipHtml(det.file)}
                  <span class="text-slate-500">→ via</span>
                  ${makeFileChipHtml(det.via)}
                </div>
                <div class="font-mono text-[10px] text-slate-400 truncate mt-1">
                  <span class="text-amber-400 font-semibold">L${det.line}</span>: ${escapeHtml(det.statement)}
                </div>
              </div>
              <span data-badge class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 shrink-0">2-Hop</span>
            </div>
          `).join('');
        }
      }

      const outBadge = document.getElementById('outboundHeaderBadge');
      if (outBadge) outBadge.textContent = `${node.outboundEdges.length} file${node.outboundEdges.length === 1 ? '' : 's'}`;
      const outboundContainer = document.getElementById('outboundListContainer');
      if (outboundContainer) {
        if (node.outboundEdges.length === 0) {
          outboundContainer.innerHTML = `<div class="p-3 text-xs required-muted">Zero internal imports (foundational module).</div>`;
        } else {
          outboundContainer.innerHTML = node.outboundEdges.map(edge => `
            <div class="p-2.5 hover:bg-slate-800/50 flex items-start justify-between gap-2 border-b border-slate-800/40 last:border-b-0">
              <div class="min-w-0">
                <div>${makeFileChipHtml(edge.target)}</div>
                <div class="font-mono text-[10px] text-slate-400 truncate mt-1">
                  <span class="text-cyan-400 font-semibold">L${edge.line}</span>: ${escapeHtml(edge.statement)}
                </div>
              </div>
              <span data-badge class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 shrink-0">Imports</span>
            </div>
          `).join('');
        }
      }

      const codeLines = (node.content || '').split('\n').map((line, i) => {
        const ln = String(i + 1).padStart(2, ' ');
        const isImportLine = node.outboundEdges.some(e => e.line === i + 1);
        const rowClass = isImportLine ? 'source-row source-import' : 'source-row';
        return `<span class="${rowClass}"><span class="source-line-number">${ln}</span>${escapeHtml(line)}</span>`;
      }).join('');
      const sourceCodeEl = document.getElementById('inspectorSourceCode');
      if (sourceCodeEl) sourceCodeEl.innerHTML = codeLines;

      if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
      }
    }

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

