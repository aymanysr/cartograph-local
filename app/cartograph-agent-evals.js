// Moved verbatim from cartograph.html (split preserved original file order).
// agent-evals: see cartograph.html; loads as a classic script after the lib/ files.
    function buildDeterministicAgentPlan(question) {
      // Delegates to the shared DOM-free planner (lib/cartograph-agent.js),
      // which is exercised by test/agent.test.js. Returns
      // { steps, visitedFiles[], activeEdges[], answerHtml, primaryFocus,
      //   citedFiles[] }.
      return CartographAgent.buildAgentPlan(question, state.graph, makeFileChipHtml);
    }

    async function runAgentQuery(questionText) {
      if (!questionText || !questionText.trim()) return;
      switchRightPanelTab('agent');
      if (typeof window !== 'undefined' && window.innerWidth <= 640 && typeof setPhonePane === 'function') {
        setPhonePane('ask');
      }

      const stream = document.getElementById('agentConversationStream');
      if (!stream) return;
      const question = questionText.trim();
      const graph = state.graph;
      const config = { ...state.agentConfig };
      const agentLib = typeof CartographAgent !== 'undefined' ? CartographAgent : null;
      const modelClient = config.engine !== 'deterministic'
        ? (agentLib ? agentLib.createModelClient(config, typeof fetch !== 'undefined' ? fetch : null) : {
            async complete({ systemPrompt, userPrompt, signal } = {}) {
              const resp = await fetch(config.endpoint, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {})
                },
                body: JSON.stringify({
                  model: config.model,
                  stream: false,
                  messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                  ]
                }),
                signal
              });
              if (!resp.ok) throw new Error("Endpoint returned " + resp.status);
              const data = await resp.json();
              return (data.message && data.message.content) || (data.choices && data.choices[0]?.message?.content) || '';
            }
          })
        : null;

      // 1. Initial fast deterministic render
      const plan = buildDeterministicAgentPlan(question);
      state.agentWalkedFiles = new Set(plan.visitedFiles);
      state.agentActiveEdges = new Set(plan.activeEdges);
      if (plan.primaryFocus) {
        selectFileNode(plan.primaryFocus, false);
      }

      const stepsHtml = renderAgentTrace(plan);
      const cardId = 'agentRun_' + Date.now() + '_' + stream.children.length;
      const narrativeBadge = plan.narrative && plan.narrative.headline
        ? `<span class="agent-narrative-tag">${escapeHtml(plan.narrative.headline)}</span>`
        : '';
      const cardHtml = `<article id="${cardId}" class="agent-run">
        <header class="flex items-center justify-between gap-2 flex-wrap">
          <div class="flex items-center gap-2 min-w-0">
            <strong>${escapeHtml(question)}</strong>
            <span>${plan.steps.length} tool steps</span>
            ${narrativeBadge}
          </div>
          <button type="button" onclick="copyAgentRunMarkdown('${cardId}')" class="text-xs font-mono px-2.5 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 hover:text-white cursor-pointer transition-colors" title="Copy question, trace, and answer as Markdown">Copy Markdown</button>
        </header>
        <div class="agent-trace"><h3>Tool trace</h3>${stepsHtml}</div>
        <section class="agent-answer"><h3>Answer</h3><div class="agent-synthesis-body">${plan.answerHtml}</div></section>
      </article>`;

      stream.insertAdjacentHTML('afterbegin', cardHtml);
      if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
      }

      // 2. Query model client through CartographAgent if configured
      if (modelClient) {
        try {
          if (agentLib && typeof agentLib.queryAgent === 'function') {
            const outcome = await agentLib.queryAgent(question, graph, {
              plan,
              chipFormatter: makeFileChipHtml,
              modelClient,
              config,
            });
            if (state.graph !== graph) return;

            if (outcome.source === 'model' && outcome.rawText) {
              const enriched = renderGroundedText(outcome.rawText, graph);
              const cardEl = document.getElementById(cardId);
              if (cardEl) {
                cardEl.querySelector('.agent-synthesis-body').innerHTML = enriched;
              }
            } else if (outcome.rejected) {
              const rejected = (outcome.rejectedPaths || []).slice(0, 3).join(', ');
              showToast(`Rejected ${config.model || 'LLM'} answer — ungrounded path(s): ${rejected}`, 'warn');
            }
          } else {
            const allowedPaths = Array.from(plan.visitedFiles);
            const sysPrompt = `You are the Cartograph Codebase Agent. You are ONLY allowed to cite files from this verified AST tool output list: ${JSON.stringify(allowedPaths)}. Explain the answer concisely in 3-4 sentences.`;
            const userPrompt = `Question: ${question}\nVerified Tool Trace: ${JSON.stringify(plan.steps)}`;
            const rawText = await modelClient.complete({ systemPrompt: sysPrompt, userPrompt });
            if (state.graph !== graph) return;
            if (rawText) {
              const cardEl = document.getElementById(cardId);
              if (cardEl) cardEl.querySelector('.agent-synthesis-body').textContent = rawText;
            }
          }
        } catch (err) {
          if (state.graph !== graph) return;
          showToast('Local LLM endpoint unreachable — showing deterministic AST synthesis');
        }
      }
    }

    function handleAgentFormSubmit(e) {
      e.preventDefault();
      const input = document.getElementById('agentQuestionInput');
      if (!input.value.trim()) return;
      runAgentQuery(input.value.trim());
      input.value = '';
    }

    function askAgentAboutSelectedFile() {
      if (!state.selectedFile) return;
      if (typeof window !== 'undefined' && window.innerWidth <= 640 && typeof setPhonePane === 'function') {
        setPhonePane('ask');
      }
      const sel = state.selectedFile;
      runAgentQuery(`What breaks if I change ${sel}?`);
    }

    function renderGroundedText(text, graph) {
      const paths = graph.nodes.map(n => n.path).sort((a,b) => b.length-a.length);
      if (!paths.length) return escapeHtml(text);
      const pattern = new RegExp(paths.map(path => path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
      let output = '', offset = 0;
      for (const match of text.matchAll(pattern)) {
        output += escapeHtml(text.slice(offset, match.index)) + makeFileChipHtml(match[0]);
        offset = match.index + match[0].length;
      }
      return output + escapeHtml(text.slice(offset));
    }

    const TOOL_META = {
      search_symbols: { icon: 'search', label: 'Symbol Search', tagClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' },
      get_file_ast: { icon: 'file-text', label: 'AST Inspection', tagClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
      walk_dependents: { icon: 'git-fork', label: 'Dependent Walk', tagClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
      trace_dependency_path: { icon: 'link-2', label: 'Path Trace', tagClass: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
      find_entry_points: { icon: 'log-in', label: 'Entry Points', tagClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
      detect_cycles_and_hubs: { icon: 'refresh-cw', label: 'Cycles & Hubs', tagClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
    };

    function copyAgentRunMarkdown(cardId) {
      const card = document.getElementById(cardId);
      if (!card) return;
      const question = card.querySelector('strong')?.textContent?.trim() || 'Cartograph Agent Query';
      const steps = Array.from(card.querySelectorAll('.trace-row')).map(row => {
        const toolBadge = row.querySelector('[data-tool-label]')?.textContent?.trim()
          || row.querySelector('.font-mono')?.textContent?.trim() || 'Tool';
        const toolArgs = row.querySelector('[data-tool-args]')?.textContent?.trim() || '';
        const outputText = row.querySelector('p')?.textContent?.trim() || '';
        const discoveredChips = Array.from(row.querySelectorAll('[data-filepath]'))
          .map(el => '`' + el.getAttribute('data-filepath') + '`').join(', ');
        const discoveredLine = discoveredChips ? `\n  - *Discovered:* ${discoveredChips}` : '';

        return `- **${toolBadge}** ${toolArgs ? '`' + toolArgs + '`' : ''}\n  ${outputText}${discoveredLine}`;
      }).join('\n');
      const answer = card.querySelector('.agent-synthesis-body')?.textContent?.trim() || '';

      const md = `### Cartograph Codebase Intelligence\n\n**Question:** ${question}\n\n**Tool Trace:**\n${steps}\n\n**Answer:**\n${answer}\n`;
      if (typeof copyTextSafe === 'function') {
        copyTextSafe(md, 'Copied agent trace to clipboard as Markdown');
      } else if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(md).then(() => {
          showToast('Copied agent trace to clipboard as Markdown');
        }).catch(() => {
          showToast('Failed to copy trace to clipboard', 'warn');
        });
      } else {
        showToast('Clipboard API unavailable', 'warn');
      }
    }

    function renderAgentTrace(plan) {
      if (!plan || !plan.steps || !plan.steps.length) {
        return '<p class="text-xs text-slate-400">No tool trace recorded.</p>';
      }
      return plan.steps.map((step, index) => {
        const meta = TOOL_META[step.tool] || { icon: 'terminal', label: step.tool, tagClass: 'bg-slate-700/50 text-slate-300 border-slate-600' };
        const files = step.files || [];
        const filesHtml = files.length > 0
          ? `<div class="mt-2 flex flex-wrap gap-1 items-center">
               <span class="text-xs text-slate-400 font-mono">Discovered (${files.length}):</span>
               ${files.map(makeFileChipHtml).join(' ')}
             </div>`
          : '';

        const argsText = step.args ? escapeHtml(step.args) : '';
        const argsSpan = argsText ? `<span data-tool-args class="text-xs text-slate-400 font-mono">${argsText}</span>` : '';

        return `
          <div class="trace-row" data-tool="${escapeHtml(step.tool)}">
            <div class="flex items-center justify-between gap-2 mb-1 flex-wrap">
              <span data-tool-label class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono border ${meta.tagClass}">
                <i data-lucide="${meta.icon}" class="w-3 h-3"></i>
                <span>${index + 1}. ${escapeHtml(meta.label || step.tool)}</span>
              </span>
              ${argsSpan}
            </div>
            <p class="text-xs text-slate-300 mt-1 font-mono">${step.output ? escapeHtml(step.output) : ''}</p>
            ${filesHtml}
          </div>
        `;
      }).join('');
    }

    function toggleAllEvalCases(expand = true) {
      const cases = document.querySelectorAll('#evalCasesContainer .eval-case');
      cases.forEach(el => { el.open = expand; });
    }

    function exportEvalReport() {
      if (!state.evalRun) {
        showToast('No benchmark run to export. Run the suite first.');
        return;
      }
      const run = state.evalRun;
      const payload = {
        mode: state.evalPromptMode,
        timestamp: new Date().toISOString(),
        summary: run.summary,
        cases: run.entries.map(({ tc, plan, result }, index) => ({
          index: index + 1,
          question: tc.question,
          passed: result.passed,
          groundednessScore: result.groundednessScore,
          recallScore: result.recallScore,
          toolSteps: plan ? plan.steps.length : 0,
          citedFiles: result.citedFiles,
          provenFiles: result.citedFiles.filter(p => !result.hallucinatedPaths.includes(p) && !result.unprovenPaths.includes(p)),
          unprovenFiles: result.unprovenPaths,
          hallucinatedFiles: result.hallucinatedPaths,
        })),
      };
      if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof document !== 'undefined') {
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cartograph-evals-${state.evalPromptMode}-${Date.now()}.json`;
        if (document.body && document.body.appendChild) {
          document.body.appendChild(a);
          a.click();
          a.remove();
        } else {
          a.click();
        }
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast('Exported benchmark report JSON');
      } else {
        showToast('Export generated');
      }
    }

    function setEvalPromptMode(mode) {
      if (!['strict', 'naive'].includes(mode)) return;
      if (state.evalPromptMode !== mode) state.evalRun = null;
      state.evalPromptMode = mode;
      renderEvalSuite();
    }

    function runEvaluationSuite() {
      state.evalRun = state.graph.nodes.length ? CartographEvals.evaluateSuite(state.graph, state.evalPromptMode, makeFileChipHtml) : null;
      renderEvalSuite();
      if (state.evalRun) showToast(`Benchmark complete · ${state.evalRun.summary.passCount}/${state.evalRun.summary.totalCases} cases passed`);
    }

    function renderEvalSuite() {
      const evaluation = state.evalRun;
      const summary = evaluation?.summary;

      ['btnEvalExpandAll', 'btnEvalCollapseAll', 'btnEvalExport'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
          btn.disabled = !evaluation;
          btn.setAttribute('aria-disabled', String(!evaluation));
          if (btn.style) {
            btn.style.opacity = evaluation ? '1' : '0.4';
            btn.style.cursor = evaluation ? 'pointer' : 'not-allowed';
          }
        }
      });

      ['strict','naive'].forEach(mode => {
        const btn = document.getElementById(mode === 'strict' ? 'evalModeStrictBtn' : 'evalModeNaiveBtn');
        if (btn) btn.setAttribute('aria-pressed', String(state.evalPromptMode === mode));
      });
      const values = {
        evalScoreGroundedness: summary ? summary.groundednessScore.toFixed(1)+'%' : '—',
        evalScoreRecall: summary ? summary.recallScore.toFixed(1)+'%' : '—',
        evalScoreHallucinations: summary ? String(summary.hallucinatedCount) : '—',
        evalScoreLatency: summary ? (evaluation.isStrict ? summary.avgSteps.toFixed(1)+' steps' : '0 steps') : '—'
      };
      Object.entries(values).forEach(([id,value]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
      });
      if (summary) {
        const latEl = document.getElementById('evalScoreLatency');
        if (latEl) latEl.innerHTML = `${evaluation.isStrict ? summary.avgSteps.toFixed(1) : '0'} <small>steps</small>`;
      }
      const scoreBadge = document.getElementById('headerEvalScoreBadge');
      if (scoreBadge) scoreBadge.textContent = summary ? summary.groundednessScore.toFixed(1)+'%' : '—';
      const activeModeTag = document.getElementById('evalActiveModeTag');
      if (activeModeTag) activeModeTag.textContent = evaluation ? `${evaluation.isStrict ? 'Strict' : 'Naive'} · ${summary.passCount}/${summary.totalCases} passed` : 'Not run';

      const casesContainer = document.getElementById('evalCasesContainer');
      if (!casesContainer) return;

      if (!evaluation) {
        casesContainer.innerHTML = '<p class="eval-empty">Not run. Run the suite to inspect citation evidence for this graph.</p>';
        return;
      }

      casesContainer.innerHTML = evaluation.entries.map(({tc,plan,result}, index) => {
        let failReason = 'failed';
        if (result.hallucinatedPaths.length && result.unprovenPaths.length) {
          failReason = 'hallucinated + unproven';
        } else if (result.hallucinatedPaths.length) {
          failReason = 'hallucinated';
        } else if (result.unprovenPaths.length) {
          failReason = 'unproven';
        } else if (result.recallScore < 100) {
          failReason = 'incomplete recall';
        }

        const passPill = result.passed
          ? `<span class="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" role="status" aria-label="Passed">✓ PASS</span>`
          : `<span class="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40" role="status" aria-label="Failed: ${failReason}">✗ FAIL (${failReason})</span>`;

        const provenCitations = result.citedFiles.filter(path => !result.hallucinatedPaths.includes(path) && !result.unprovenPaths.includes(path));

        const hallucinatedSection = result.hallucinatedPaths.length > 0
          ? `<div class="p-3 rounded bg-rose-950/20 border border-rose-500/30 my-2">
               <h4 class="text-xs font-semibold text-rose-300 flex items-center gap-1.5 mb-1">
                 <i data-lucide="alert-circle" class="w-3.5 h-3.5 text-rose-400"></i>
                 <span>Hallucinated Citations (Outside Graph)</span>
               </h4>
               <p class="text-xs font-mono text-rose-200">${result.hallucinatedPaths.map(escapeHtml).join(', ')}</p>
             </div>`
          : '';

        const unprovenSection = result.unprovenPaths.length > 0
          ? `<div class="p-3 rounded bg-amber-950/20 border border-amber-500/30 my-2">
               <h4 class="text-xs font-semibold text-amber-300 flex items-center gap-1.5 mb-1">
                 <i data-lucide="help-circle" class="w-3.5 h-3.5 text-amber-400"></i>
                 <span>Unproven Citations (Real Paths Not Traced)</span>
               </h4>
               <div class="flex flex-wrap gap-1.5">${result.unprovenPaths.map(makeFileChipHtml).join(' ')}</div>
             </div>`
          : '';

        const missingFiles = (tc.expectedFiles || []).filter(path => !result.citedFiles.includes(path));
        const missingSection = missingFiles.length > 0
          ? `<div class="p-3 rounded bg-amber-950/20 border border-amber-500/30 my-2">
               <h4 class="text-xs font-semibold text-amber-300 flex items-center gap-1.5 mb-1">
                 <i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-amber-400"></i>
                 <span>Missed Expected Citations (${missingFiles.length} files)</span>
               </h4>
               <div class="flex flex-wrap gap-1.5">${missingFiles.map(makeFileChipHtml).join(' ')}</div>
             </div>`
          : '';

        return `
          <details class="eval-case" open>
            <summary class="flex items-center justify-between gap-3 py-3 cursor-pointer hover:text-white">
              <span class="font-medium text-xs text-slate-200 flex-1">${index + 1}. ${escapeHtml(tc.question)}</span>
              <div class="flex items-center gap-2 case-metrics shrink-0">
                ${passPill}
                <span class="${result.groundednessScore === 100 ? 'text-emerald-300' : 'text-rose-400'} font-mono text-xs">Grounded: ${result.groundednessScore.toFixed(1)}%</span>
                <span class="${result.recallScore === 100 ? 'text-emerald-300' : 'text-amber-400'} font-mono text-xs">Recall: ${result.recallScore.toFixed(1)}%</span>
                <span class="text-slate-500 font-mono text-xs">${plan?.steps.length || 0} steps</span>
              </div>
            </summary>
            <div class="case-evidence pt-2 pb-4 border-t border-slate-800/60">
              <h3 class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Verified Tool Trace</h3>
              <div class="space-y-1">${plan ? renderAgentTrace(plan) : '<p class="text-xs text-slate-500">No tool trace — naive prompt.</p>'}</div>

              <h3 class="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-4 mb-2">Synthesized Answer</h3>
              <div class="text-xs leading-relaxed text-slate-300 bg-slate-900/60 p-3 rounded border border-slate-800/60">${plan ? plan.answerHtml : renderGroundedText(tc.naiveAnswer, state.graph)}</div>

              <h3 class="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-4 mb-2">Provenance Citation Audit</h3>
              <div class="space-y-2">
                <div class="p-2.5 rounded bg-slate-900/40 border border-slate-800/80">
                  <span class="text-[11px] text-slate-400 block mb-1">${evaluation.isStrict ? 'AST-Traced &amp; Proven Citations:' : 'Grounded Citations (Present in Graph):'}</span>
                  <div class="flex flex-wrap gap-1.5">${provenCitations.map(makeFileChipHtml).join(' ') || '<span class="text-xs text-slate-500">—</span>'}</div>
                </div>
                ${unprovenSection}
                ${hallucinatedSection}
                ${missingSection}
              </div>
            </div>
          </details>
        `;
      }).join('');

      if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
      }
    }
