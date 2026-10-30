// Moved verbatim from cartograph.html (split preserved original file order).
// ui-panels: see cartograph.html; loads as a classic script after the lib/ files.
    function makeFileChipHtml(filePath) {
      if (!(typeof state.graph.hasNode === 'function' ? state.graph.hasNode(filePath) : state.graph.nodes.some(node => node.path === filePath))) return escapeHtml(filePath);
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
      const m = (typeof CartographViewModel !== 'undefined')
        ? CartographViewModel.computeHeaderMetrics(state.graph, state.repositoryProvenance)
        : {
            totalFiles: state.graph.nodes.length,
            totalEdges: state.graph.edges.length,
            cyclesCount: state.graph.cycles.length,
            topHotspot: (state.graph.nodes.length > 0 && typeof state.graph.getTopHubs === 'function') ? state.graph.getTopHubs(1)[0] : null,
            freshnessLabel: state.repositoryProvenance.kind === 'sample' ? 'Built-in sample' : state.repositoryProvenance.scannedAt ? `Scanned ${new Date(state.repositoryProvenance.scannedAt).toLocaleString()}` : 'Snapshot loaded',
          };

      document.getElementById('metricTotalFiles').textContent = String(m.totalFiles);
      document.getElementById('metricTotalEdges').textContent = String(m.totalEdges);

      const freshness = document.getElementById('repositoryFreshness');
      if (freshness) freshness.textContent = m.freshnessLabel;
      const hotspot = document.getElementById('metricTopHotspotBtn');
      hotspot.textContent = '-';
      delete hotspot.dataset.hotspot;
      if (m.topHotspot) {
        hotspot.textContent = `${m.topHotspot.path} (${m.topHotspot.totalImpact} files)`;
        hotspot.dataset.hotspot = m.topHotspot.path;
      }

      const cycleBadge = document.getElementById('metricCycleBadge');
      cycleBadge.className = '';
      cycleBadge.textContent = `${m.cyclesCount} cycles`;
    }

    function handleCycleBadgeClick() {
      if (state.graph.cycles.length > 0) {
        if (typeof openCycleFixerModal === 'function') {
          openCycleFixerModal(state.graph.cycles[0]);
        } else {
          selectFileFromUi(state.graph.cycles[0][0], true);
        }
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
      const exists = (typeof state.graph.getNode === 'function')
        ? state.graph.getNode(filePath)
        : (state.graph?.nodes?.find(n => n.path === filePath));
      if (!exists) return;

      state.selectedFile = filePath;
      if (typeof CartographStore !== 'undefined' && CartographStore.notify) {
        CartographStore.notify({ type: 'selectFile', filePath, pan: panToNode });
      }
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

      const vm = (typeof CartographViewModel !== 'undefined')
        ? CartographViewModel.computeFileListViewModel(state.graph, {
            layerFilter: state.layerFilter,
            folderFilter: state.folderFilter,
            searchQuery: state.searchQuery,
            fileSortMode: state.fileSortMode,
            selectedFile: state.selectedFile,
          })
        : null;

      const heading = document.getElementById('activeLayerName');
      if (heading && vm) {
        heading.textContent = vm.activeHeading;
      }
      const clear = document.getElementById('clearLayerFilter');
      if (clear && vm) {
        clear.hidden = !vm.hasFilter;
        clear.textContent = state.folderFilter ? 'Clear focus' : 'Clear filter';
      }
      if (vm && vm.isEmpty) {
        container.innerHTML = `<div class="p-4 text-center text-xs required-muted">${escapeHtml(vm.emptyMessage)}</div>`;
        return;
      }

      let previousFolder = null;
      const nodes = vm ? vm.filteredNodes : (state.graph.nodes || []);
      container.innerHTML = nodes.map(node => {
        const folder = node.folder || '/';
        let group = '';
        if (state.fileSortMode === 'path' && folder !== previousFolder) {
          const fg = vm ? vm.folderGroups.find(g => g.folder === folder) : null;
          const isFocused = fg ? fg.isFocused : Boolean(state.folderFilter && (folder === state.folderFilter || (state.folderFilter !== '/' && folder.startsWith(state.folderFilter + '/'))));
          const count = fg ? fg.count : (state.graph.nodes || []).filter(n => folder === '/' ? (!n.folder || n.folder === '/') : (n.folder === folder || n.path.startsWith(folder + '/'))).length;
          group = `
            <div class="folder-heading flex items-center justify-between group/f ${isFocused ? 'folder-heading-focused' : ''}">
              <button type="button" data-folder-focus="${escapeHtml(folder)}" class="folder-title-btn flex items-center gap-1.5 min-w-0 text-left hover:text-white transition-colors flex-1" aria-pressed="${isFocused ? 'true' : 'false'}" aria-label="${isFocused ? 'Clear focus on ' + escapeHtml(folder) : 'Focus folder ' + escapeHtml(folder) + ' (' + count + ' files)'}">
                <i data-lucide="${isFocused ? 'folder-open' : 'folder'}" class="w-3.5 h-3.5 shrink-0 ${isFocused ? 'text-sky-400' : 'text-slate-400'}"></i>
                <span class="truncate">${escapeHtml(folder)}</span>
                <span class="text-[11px] text-slate-400 shrink-0">(${count})</span>
              </button>
              <button type="button" ${isFocused ? 'data-folder-clear="true"' : `data-folder-focus="${escapeHtml(folder)}"`} class="folder-focus-pill text-[11px] px-2 py-0.5 rounded cursor-pointer transition-colors shrink-0 ml-1.5 ${isFocused ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'}" aria-hidden="true" tabindex="-1">
                ${isFocused ? 'Focused ✕' : 'Focus'} <!-- taste-skill-ignore -->
              </button>
            </div>
          `;
          previousFolder = folder;
        }
        const isEntry = (node.inDegree || 0) === 0 || node.isEntry;
        const entryBadge = isEntry ? ' <span class="text-[11px] px-1 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 font-medium ml-1 shrink-0" title="Entry Point: No internal files import this module">ENTRY</span>' : '';
        const isSel = node.isSelected !== undefined ? node.isSelected : (node.path === state.selectedFile);
        return `${group}<button type="button" data-filepath="${escapeHtml(node.path)}" title="${escapeHtml(node.path)}" aria-label="${escapeHtml(node.path)}" aria-current="${isSel ? 'true' : 'false'}" class="file-row"><span>${escapeHtml(node.label)}${entryBadge}</span><span class="file-impact ${node.totalImpact ? 'nonzero' : ''}">${node.totalImpact}</span></button>`;
      }).join('');
      container.scrollTop = scrollTop;
      container.scrollTop = scrollTop;

      if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
      }
    }

    function scrollToInspectorSection(containerId) {
      const el = document.getElementById(containerId);
      if (!el) return;
      const section = el.closest ? (el.closest('section') || el.closest('details') || el) : el;
      if (section && section.tagName === 'DETAILS') {
        section.open = true;
      }
      if (typeof section.scrollIntoView === 'function') {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    function buildGroundedModuleExplanationHtml(node) {
      const vm = (typeof CartographViewModel !== 'undefined')
        ? CartographViewModel.computeInspectorViewModel(node, state.graph)
        : null;

      const exports = node.exports.slice(0, 4).map(symbol => `<code>${escapeHtml(symbol)}</code>`).join(', ');
      const omitted = node.exports.length > 4 ? ` and ${node.exports.length - 4} more (see All exports below)` : '';
      const cycle = vm ? vm.cycle : state.graph.cycles.find(paths => paths.includes(node.path));

      let roleBadgeHtml = '';
      if (vm) {
        const bg = vm.role === 'entry' ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
                 : vm.role === 'leaf' ? 'bg-cyan-950/40 border-cyan-800/50 text-cyan-300'
                 : vm.role === 'cycle' ? 'bg-rose-950/40 border-rose-800/50 text-rose-300'
                 : 'bg-sky-950/40 border-sky-800/50 text-sky-300';
        const dotBg = vm.role === 'entry' ? 'bg-emerald-400'
                    : vm.role === 'leaf' ? 'bg-cyan-400'
                    : vm.role === 'cycle' ? 'bg-rose-400'
                    : 'bg-sky-400';
        const prefix = `<span class="inline-block w-1.5 h-1.5 rounded-full ${dotBg} mr-1.5 align-middle"></span>`;
        const fixBtn = vm.isCycle ? ` <button type="button" class="underline text-rose-200 font-medium ml-1 cursor-pointer" onclick="openCycleFixerModal()">Fix Guide →</button>` : '';
        roleBadgeHtml = `<div class="mb-2 p-2.5 rounded ${bg} border text-xs">${prefix}<strong>${escapeHtml(vm.roleTitle)}</strong>: ${escapeHtml(vm.roleDescription)}${fixBtn}</div>`;
      } else {
        const isEntry = (node.inDegree || 0) === 0;
        const isLeaf = (node.outboundEdges || []).length === 0;
        if (isEntry) {
          roleBadgeHtml = '<div class="mb-2 p-2.5 rounded bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 text-xs"><span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 align-middle"></span><strong>Execution Entry Point</strong>: No other files in the project import this module. Execution begins here.</div>';
        } else if (isLeaf) {
          roleBadgeHtml = '<div class="mb-2 p-2.5 rounded bg-cyan-950/40 border border-cyan-800/50 text-cyan-300 text-xs"><span class="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 mr-1.5 align-middle"></span><strong>Foundational Leaf Module</strong>: Self-contained module with zero internal imports. Safe to import anywhere.</div>';
        } else if (cycle) {
          roleBadgeHtml = `<div class="mb-2 p-2.5 rounded bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs"><span class="inline-block w-1.5 h-1.5 rounded-full bg-rose-400 mr-1.5 align-middle"></span><strong>Circular Dependency</strong>: Belongs to an import cycle (${cycle.length} files). Causes runtime undefined loading bugs. <button type="button" class="underline text-rose-200 font-medium ml-1 cursor-pointer" onclick="openCycleFixerModal()">Fix Guide →</button></div>`;
        } else {
          roleBadgeHtml = `<div class="mb-2 p-2.5 rounded bg-sky-950/40 border border-sky-800/50 text-sky-300 text-xs"><span class="inline-block w-1.5 h-1.5 rounded-full bg-sky-400 mr-1.5 align-middle"></span><strong>Internal Engine Module</strong>: Connects ${node.outboundEdges.length} dependencies with ${node.hop1Files.length} direct callers.</div>`;
        }
      }

      const flowCardHtml = `
        <div class="my-2.5 p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-[11px] flex items-center justify-between gap-1 text-slate-300">
          <div class="text-center flex-1 min-w-0 cursor-pointer hover:bg-slate-800/80 p-1 rounded transition-colors" onclick="scrollToInspectorSection('outboundListContainer')" title="Jump to imports">
            <span class="text-cyan-400 font-bold text-sm block">${node.outboundEdges.length}</span>
            <span class="text-[11px] text-slate-400 truncate block">Imports</span>
          </div>
          <span class="text-slate-500 font-bold px-1 select-none" aria-hidden="true">&rarr;</span>
          <div class="text-center flex-1 min-w-0 bg-sky-950/40 py-1 px-1 rounded border border-sky-800/40">
            <span class="text-sky-300 font-bold truncate block" title="${escapeHtml(node.path)}">${escapeHtml(node.label)}</span>
            <span class="text-[11px] text-sky-400 block">Current</span>
          </div>
          <span class="text-slate-500 font-bold px-1 select-none" aria-hidden="true">&rarr;</span>
          <div class="text-center flex-1 min-w-0 cursor-pointer hover:bg-slate-800/80 p-1 rounded transition-colors" onclick="scrollToInspectorSection('hop1ListContainer')" title="Jump to direct callers">
            <span class="text-rose-400 font-bold text-sm block">${node.hop1Files.length}</span>
            <span class="text-[11px] text-slate-400 truncate block">Callers</span>
          </div>
          <span class="text-slate-500 font-bold px-1 select-none" aria-hidden="true">&rarr;</span>
          <div class="text-center flex-1 min-w-0 cursor-pointer hover:bg-slate-800/80 p-1 rounded transition-colors" onclick="scrollToInspectorSection('hop2ListContainer')" title="Jump to downstream dependents">
            <span class="text-amber-400 font-bold text-sm block">${node.hop2Files.length}</span>
            <span class="text-[11px] text-slate-400 truncate block">Downstream</span>
          </div>
        </div>
      `;

      const membership = cycle ? ` It belongs to a circular dependency group: ${cycle.map(makeFileChipHtml).join(', ')}. Every member can reach every other through import paths; this does not mean every pair imports directly. <button type="button" class="underline text-rose-300 font-medium ml-1 cursor-pointer" onclick="openCycleFixerModal()">Fix Guide →</button>` : '';

      return `${roleBadgeHtml}${flowCardHtml}<p class="mt-2 text-slate-300 leading-relaxed">${makeFileChipHtml(node.path)} is a ${escapeHtml(getLayerMeta(node.layer).label)} module with ${node.loc} lines${exports ? `, exporting ${exports}${omitted}` : ' and no parsed exports'}. ${node.totalImpact} files in the project depend on this module directly or indirectly.${membership}</p>`;
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
        const node = (state.graph && typeof state.graph.getNode === 'function')
          ? state.graph.getNode(state.selectedFile)
          : (state.graph?.nodes ? state.graph.nodes.find(n => n.path === state.selectedFile) : null);
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
      const node = (state.graph && typeof state.graph.getNode === 'function')
        ? state.graph.getNode(state.selectedFile)
        : (state.graph?.nodes ? state.graph.nodes.find(n => n.path === state.selectedFile) : null);
      const actionToolbar = document.getElementById('inspectorActionToolbar');
      const cycleBadge = document.getElementById('inspectorCycleBadge');
      const metaContext = document.getElementById('inspectorMetaContext');

      if (!node) {
        ['inspectorLayerBadge','inspectorLocBadge','inspectorImpactPercent','inspectorHop1Count','inspectorHop2Count','inspectorOutboundCount','hop1HeaderBadge','hop2HeaderBadge','outboundHeaderBadge'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.textContent = '-';
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

      const vm = (typeof CartographViewModel !== 'undefined')
        ? CartographViewModel.computeInspectorViewModel(node, state.graph, { simulateBreakingChange: state.simulateBreakingChange })
        : null;

      const layerBadge = document.getElementById('inspectorLayerBadge');
      if (layerBadge) layerBadge.textContent = vm ? vm.layerLabel : getLayerMeta(node.layer).label;
      const locBadge = document.getElementById('inspectorLocBadge');
      if (locBadge) locBadge.textContent = `${node.loc} lines`;
      const pathEl = document.getElementById('inspectorFilePath');
      if (pathEl) pathEl.textContent = node.path;

      // Circular dependency warning badge in inspector
      const cycle = vm ? vm.cycle : state.graph.cycles.find(paths => paths.includes(node.path));
      if (cycleBadge) {
        if (cycle) {
          cycleBadge.classList.remove('hidden');
          const otherFiles = cycle.filter(p => p !== node.path);
          cycleBadge.innerHTML = ` · <span class="text-rose-400 font-medium cursor-pointer underline" onclick="openCycleFixerModal()" title="Cycle with ${escapeHtml(otherFiles.join(', '))}">Cycle (${cycle.length} files) · Fix Guide →</span>`;
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
      if (impactPct) impactPct.textContent = `${node.totalImpact} / ${state.graph.nodes.length} modules`;
      const impactCap = document.getElementById('inspectorImpactCaption');
      if (impactCap) impactCap.textContent = `depend on this module directly or indirectly (${vm ? vm.impactPercent : 0}%)`;

      const hop1Count = document.getElementById('inspectorHop1Count');
      if (hop1Count) hop1Count.textContent = String(vm ? vm.hop1Count : node.hop1Files.length);
      const hop2Count = document.getElementById('inspectorHop2Count');
      if (hop2Count) hop2Count.textContent = String(vm ? vm.hop2Count : node.hop2Files.length);
      const outCount = document.getElementById('inspectorOutboundCount');
      if (outCount) outCount.textContent = String(vm ? vm.outboundCount : node.outboundEdges.length);

      ['inspectorHop1Count','inspectorHop2Count','inspectorOutboundCount'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.dataset.zero = String(el.textContent === '0');
      });

      const explanationEl = document.getElementById('inspectorExplanationText');
      if (explanationEl) explanationEl.innerHTML = buildGroundedModuleExplanationHtml(node);

      const hop1Badge = document.getElementById('hop1HeaderBadge');
      if (hop1Badge) hop1Badge.textContent = `${node.hop1Files.length} caller${node.hop1Files.length === 1 ? '' : 's'}`;
      const hop1Container = document.getElementById('hop1ListContainer');
      if (hop1Container) {
        if (node.hop1Edges.length === 0) {
          hop1Container.innerHTML = `<div class="p-3 text-xs required-muted">No files directly import this module (entry point or top-level file).</div>`;
        } else {
          hop1Container.innerHTML = node.hop1Edges.map(edge => `
            <div class="p-2.5 hover:bg-slate-800/50 flex items-start justify-between gap-2 border-b border-slate-800/40 last:border-b-0">
              <div class="min-w-0">
                <div>${makeFileChipHtml(edge.source)}</div>
                <div class="text-[11px] text-slate-400 truncate mt-1" title="${escapeHtml(edge.statement)}">
                  <code><span class="text-rose-400 font-semibold font-mono">L${edge.line}</span>: ${escapeHtml(edge.statement)}</code>
                </div>
              </div>
              <span data-badge class="text-[11px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 shrink-0">Direct</span>
            </div>
          `).join('');
        }
      }

      const hop2Badge = document.getElementById('hop2HeaderBadge');
      if (hop2Badge) hop2Badge.textContent = `${node.hop2Files.length} module${node.hop2Files.length === 1 ? '' : 's'}`;
      const hop2Container = document.getElementById('hop2ListContainer');
      if (hop2Container) {
        if (node.hop2Details.length === 0) {
          hop2Container.innerHTML = `<div class="p-3 text-xs required-muted">No secondary downstream modules depend on this file.</div>`;
        } else {
          hop2Container.innerHTML = node.hop2Details.map(det => `
            <div class="p-2.5 hover:bg-slate-800/50 flex items-start justify-between gap-2 border-b border-slate-800/40 last:border-b-0">
              <div class="min-w-0">
                <div class="flex items-center flex-wrap gap-1 text-[11px] text-slate-400">
                  ${makeFileChipHtml(det.file)}
                  <span class="text-slate-500">&rarr; via</span>
                  ${makeFileChipHtml(det.via)}
                </div>
                <div class="text-[11px] text-slate-400 truncate mt-1">
                  <code><span class="text-amber-400 font-semibold font-mono">L${det.line}</span>: ${escapeHtml(det.statement)}</code>
                </div>
              </div>
              <span data-badge class="text-[11px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 shrink-0">Transitive</span>
            </div>
          `).join('');
        }
      }

      const outBadge = document.getElementById('outboundHeaderBadge');
      if (outBadge) outBadge.textContent = `${node.outboundEdges.length} import${node.outboundEdges.length === 1 ? '' : 's'}`;
      const outboundContainer = document.getElementById('outboundListContainer');
      if (outboundContainer) {
        if (node.outboundEdges.length === 0) {
          outboundContainer.innerHTML = `<div class="p-3 text-xs required-muted">Zero internal imports (foundational leaf module).</div>`;
        } else {
          outboundContainer.innerHTML = node.outboundEdges.map(edge => `
            <div class="p-2.5 hover:bg-slate-800/50 flex items-start justify-between gap-2 border-b border-slate-800/40 last:border-b-0">
              <div class="min-w-0">
                <div>${makeFileChipHtml(edge.target)}</div>
                <div class="text-[11px] text-slate-400 truncate mt-1">
                  <code><span class="text-cyan-400 font-semibold font-mono">L${edge.line}</span>: ${escapeHtml(edge.statement)}</code>
                </div>
              </div>
              <span data-badge class="text-[11px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 shrink-0">Imports</span>
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

    function openCycleFixerModal(targetCycle) {
      const cycle = targetCycle || (state.graph?.cycles ? (state.graph.cycles.find(paths => paths.includes(state.selectedFile)) || state.graph.cycles[0]) : null);
      const modal = document.getElementById('modalCycleFixer');
      const container = document.getElementById('cycleFixerContent');
      if (!modal || !container) return;

      if (!cycle || !cycle.length) {
        container.innerHTML = `
          <div class="p-4 rounded-lg bg-emerald-950/30 border border-emerald-800/40 text-emerald-300">
            <strong>No Circular Dependencies</strong>
            <p class="text-xs text-emerald-400/80 mt-1">This repository is an acyclic dependency graph (DAG). All imports flow in a clean direction.</p>
          </div>
        `;
      } else {
        const cycleChainHtml = cycle.map(p => makeFileChipHtml(p)).join(' <span class="text-rose-400 font-bold mx-1">&rarr;</span> ') + ` <span class="text-rose-400 font-bold mx-1">&rarr;</span> ` + makeFileChipHtml(cycle[0]);

        container.innerHTML = `
          <div class="p-3.5 rounded-lg bg-rose-950/40 border border-rose-800/50 space-y-2">
            <div class="text-xs font-semibold text-rose-300 flex items-center gap-1.5">
              <i data-lucide="alert-circle" class="w-4 h-4 text-rose-400"></i> Detected Import Cycle (${cycle.length} files)
            </div>
            <div class="text-xs text-slate-200 bg-slate-950/70 p-2.5 rounded border border-rose-900/50 flex flex-wrap items-center gap-1">
              ${cycleChainHtml}
            </div>
          </div>

          <div class="space-y-2 text-xs">
            <h3 class="font-semibold text-slate-200 text-sm">Why this causes bugs in your code:</h3>
            <p class="text-slate-300 leading-relaxed">
              When <strong>Module A</strong> imports <strong>Module B</strong> while Module B imports Module A, the runtime (Node.js, Python, or the bundler) encounters a recursive loop. The second module is evaluated before the first finishes loading, receiving an <code>undefined</code> or empty object.
            </p>
            <p class="text-rose-300/90 leading-relaxed text-[11px] bg-slate-900/90 p-2 rounded border border-slate-800">
              Common symptom: <code>"TypeError: (0, func) is not a function"</code> or <code>"ImportError: cannot import name"</code> at startup.
            </p>
          </div>

          <div class="space-y-2.5 text-xs">
            <h3 class="font-semibold text-slate-200 text-sm">3-Step Recipe to Break the Cycle:</h3>
            <ol class="space-y-2 list-decimal list-inside text-slate-300 leading-relaxed pl-1">
              <li>
                <strong class="text-sky-300">Find the Shared Concept</strong>: Check what functions, interfaces, or types ${makeFileChipHtml(cycle[0])} and ${makeFileChipHtml(cycle[1] || cycle[0])} are importing from each other.
              </li>
              <li>
                <strong class="text-sky-300">Extract to a New Seam</strong>: Create a separate, standalone file (e.g. <code>src/types/</code> or <code>src/shared/</code>) that does not import either file. Move the shared interfaces or helper functions into it.
              </li>
              <li>
                <strong class="text-sky-300">Invert the Imports</strong>: Update both files to import the shared concept from the new standalone file. The circular dependency is now broken!
              </li>
            </ol>
          </div>

          <div class="pt-2 flex justify-end gap-2">
            <button type="button" onclick="closeCycleFixerModal()" class="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs">Got it</button>
            <button type="button" onclick="closeCycleFixerModal(); selectFileFromUi('${escapeHtml(cycle[0])}', true);" class="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium">Inspect ${escapeHtml(cycle[0].split('/').pop())}</button>
          </div>
        `;
      }

      if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
      }
      modal.showModal();
    }

    function closeCycleFixerModal() {
      const modal = document.getElementById('modalCycleFixer');
      if (modal) modal.close();
    }

