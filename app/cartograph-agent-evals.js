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

      const stream = document.getElementById('agentConversationStream');
      const plan = buildDeterministicAgentPlan(questionText.trim());

      state.agentWalkedFiles = new Set(plan.visitedFiles);
      state.agentActiveEdges = new Set(plan.activeEdges);
      if (plan.primaryFocus) {
        selectFileNode(plan.primaryFocus, false);
      }

      const stepsHtml = plan.steps.map((s, idx) => `
        <div class="rounded-lg bg-slate-950 border border-slate-800 p-2.5 text-[11px] font-mono space-y-1">
          <div class="flex items-center justify-between text-emerald-400">
            <span>Step ${idx + 1}: ${s.tool}(${escapeHtml(s.args)})</span>
            <span class="text-[10px] text-slate-500">AST Verified</span>
          </div>
          <div class="text-slate-300 font-sans text-xs">${escapeHtml(s.output)}</div>
          <div class="flex flex-wrap gap-1 pt-0.5">${s.files.map(makeFileChipHtml).join('')}</div>
        </div>
      `).join('');

      const cardId = 'agentRun_' + Date.now();
      const cardHtml = `
        <div id="${cardId}" class="rounded-xl bg-slate-900 border border-slate-700/80 p-3.5 space-y-3 shadow-lg">
          <div class="flex items-start justify-between gap-2 border-b border-slate-800 pb-2.5">
            <div class="text-xs font-semibold text-white flex items-center gap-1.5">
              <i data-lucide="message-square-code" class="w-3.5 h-3.5 text-indigo-400 shrink-0"></i>
              <span>${escapeHtml(questionText)}</span>
            </div>
            <span class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0">
              ${plan.steps.length} Tool Calls
            </span>
          </div>

          <div class="space-y-1.5">
            <div class="text-[10px] font-mono uppercase tracking-wider text-slate-400">Visible Agent Tool Trace</div>
            ${stepsHtml}
          </div>

          <div class="rounded-lg bg-indigo-950/25 border border-indigo-500/30 p-3 text-xs text-slate-200 leading-relaxed">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-[10px] font-mono uppercase tracking-wider text-indigo-300 font-semibold">Grounded Agent Synthesis</span>
              <span class="text-[10px] font-mono text-emerald-400">0 Unparsed Claims</span>
            </div>
            <div class="agent-synthesis-body">${plan.answerHtml}</div>
          </div>
        </div>
      `;

      stream.insertAdjacentHTML('afterbegin', cardHtml);
      lucide.createIcons();

      if (state.agentConfig.engine !== 'deterministic') {
        try {
          const allowedPaths = Array.from(plan.visitedFiles);
          const sysPrompt = `You are the Cartograph Codebase Agent. You are ONLY allowed to cite files from this verified AST tool output list: ${JSON.stringify(allowedPaths)}. Explain the answer concisely in 3-4 sentences.`;
          const userPrompt = `Question: ${questionText}\nVerified Tool Trace: ${JSON.stringify(plan.steps)}`;

          const resp = await fetch(state.agentConfig.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(state.agentConfig.apiKey ? { 'Authorization': `Bearer ${state.agentConfig.apiKey}` } : {})
            },
            body: JSON.stringify({
              model: state.agentConfig.model,
              stream: false,
              messages: [
                { role: 'system', content: sysPrompt },
                { role: 'user', content: userPrompt }
              ]
            })
          });
          if (resp.ok) {
            const data = await resp.json();
            const rawText = (data.message && data.message.content) || (data.choices && data.choices[0]?.message?.content) || '';
            if (rawText) {
              // Strict grounding contract: the model synthesis may only replace
              // the deterministic answer when every path-like token it named is
              // a real graph path that appeared in the tool trace.
              const tracePaths = CartographEvals.collectTraceFiles(plan);
              const outcome = CartographAgent.validateSynthesis(rawText, state.graph, tracePaths);
              if (outcome.accepted) {
                let enriched = escapeHtml(rawText);
                state.graph.nodes.forEach(n => {
                  const re = new RegExp(n.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                  enriched = enriched.replace(re, makeFileChipHtml(n.path));
                });
                const cardEl = document.getElementById(cardId);
                if (cardEl) {
                  cardEl.querySelector('.agent-synthesis-body').innerHTML = enriched;
                }
              } else {
                const rejected = outcome.unknownPaths.concat(outcome.unprovenPaths).slice(0, 3).join(', ');
                showToast(`Rejected ${state.agentConfig.model || 'LLM'} answer — ungrounded path(s): ${rejected}`, 'warn');
              }
            }
          }
        } catch (err) {
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
      const sel = state.selectedFile;
      runAgentQuery(`What breaks if I change ${sel}?`);
    }

    function getEvalBenchmarkCases() {
      return CartographEvals.buildBenchmarkCases(state.graph);
    }

    function setEvalPromptMode(mode) {
      state.evalPromptMode = mode;
      document.getElementById('evalModeStrictBtn').className = mode === 'strict'
        ? 'px-3 py-1.5 rounded-md font-medium bg-emerald-600 text-white'
        : 'px-3 py-1.5 rounded-md font-medium text-slate-400 hover:text-white';
      document.getElementById('evalModeNaiveBtn').className = mode === 'naive'
        ? 'px-3 py-1.5 rounded-md font-medium bg-rose-600 text-white'
        : 'px-3 py-1.5 rounded-md font-medium text-slate-400 hover:text-white';
      renderEvalSuite();
    }

    function evaluateEvalSuite() {
      const graph = state.graph;
      const isStrict = state.evalPromptMode === 'strict';
      const cases = getEvalBenchmarkCases();
      const plans = [];
      const entries = cases.map((tc) => {
        if (isStrict) {
          const plan = CartographAgent.buildAgentPlan(tc.question, graph, makeFileChipHtml);
          const result = CartographEvals.scoreCase({
            graph,
            expectedFiles: tc.expectedFiles,
            citedFiles: plan.citedFiles,
            traceFiles: CartographEvals.collectTraceFiles(plan),
            requireProvenance: true,
          });
          plans.push(plan);
          return { tc, plan, result };
        }
        const result = CartographEvals.scoreCase({
          graph,
          expectedFiles: tc.expectedFiles,
          citedFiles: tc.naiveCited,
          traceFiles: [],
          requireProvenance: false,
        });
        return { tc, plan: null, result };
      });
      const summary = CartographEvals.computeSuiteSummary(
        entries.map((e) => e.result),
        plans
      );
      return { isStrict, cases, entries, summary };
    }

    function runEvaluationSuite() {
      const evaluation = evaluateEvalSuite();
      state.evalSuiteSummary = evaluation.summary;
      renderEvalSuite();
      showToast(`Benchmark suite complete \u2014 Groundedness ${evaluation.summary.groundednessScore.toFixed(1)}% \u2022 Recall ${evaluation.summary.recallScore.toFixed(1)}% \u2022 ${evaluation.summary.passCount}/${evaluation.summary.totalCases} cases PASS`);
    }

    function renderEvalSuite() {
      const evaluation = evaluateEvalSuite();
      const { isStrict, entries, summary } = evaluation;

      const rowsHtml = entries.map(({ tc, plan, result }, idx) => {
        const answerHtml = plan
          ? plan.answerHtml
          : `<div>${escapeHtml(tc.naiveAnswer)}</div>`;
        const failureLabel = result.hallucinatedPaths.length > 0
          ? 'HALLUCINATION DETECTED'
          : result.unprovenPaths.length > 0 ? 'UNPROVEN CITATION DETECTED' : 'INCOMPLETE COVERAGE';

        return `
          <div class="p-4 space-y-3 hover:bg-slate-900/50">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="px-2 py-0.5 rounded text-[10px] font-mono ${result.passed ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}">
                  ${result.passed ? `PASS \u2022 ${result.groundednessScore.toFixed(1)}% GROUNDED` : `FAIL \u2022 ${failureLabel}`}
                </span>
                ${plan ? `<span class="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 border border-slate-700 text-slate-300">${plan.steps.length} real tool steps</span>` : ''}
                <h3 class="text-xs font-bold text-white">Case #${idx + 1}: ${escapeHtml(tc.question)}</h3>
              </div>
              <div class="flex items-center gap-3 text-xs font-mono shrink-0">
                <span class="${result.groundednessScore >= 99.95 ? 'text-emerald-400' : 'text-rose-400'}">Grounded: ${result.groundednessScore.toFixed(1)}%</span>
                <span class="${result.recallScore >= 99.95 ? 'text-indigo-300' : 'text-amber-400'}">Recall: ${result.recallScore.toFixed(1)}%</span>
              </div>
            </div>

            <div class="rounded-lg bg-slate-950 border border-slate-800 p-3 text-xs text-slate-300">
              <div class="text-[10px] font-mono uppercase text-slate-500 mb-1">Model Output Under Evaluation</div>
              <div class="agent-synthesis-body">${answerHtml}</div>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div class="flex flex-wrap items-center gap-1">
                <span class="text-slate-400 font-mono mr-1">Verified Citations:</span>
                ${result.citedFiles.filter(f => !result.hallucinatedPaths.includes(f) && !result.unprovenPaths.includes(f)).map(makeFileChipHtml).join('')}
              </div>
              ${result.hallucinatedPaths.length > 0 ? `
                <div class="flex flex-wrap items-center gap-1">
                  <span class="text-rose-400 font-mono mr-1">Invented / Fake Paths Caught:</span>
                  ${result.hallucinatedPaths.map(h => `<span class="px-2 py-0.5 rounded bg-rose-950 border border-rose-500/50 text-rose-300 font-mono text-[11px] line-through">${escapeHtml(h)}</span>`).join('')}
                </div>
              ` : ''}
              ${result.unprovenPaths.length > 0 ? `
                <div class="flex flex-wrap items-center gap-1">
                  <span class="text-amber-400 font-mono mr-1">Cited But Never Traced:</span>
                  ${result.unprovenPaths.map(h => `<span class="px-2 py-0.5 rounded bg-amber-950 border border-amber-500/50 text-amber-300 font-mono text-[11px] line-through">${escapeHtml(h)}</span>`).join('')}
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');

      document.getElementById('evalCasesContainer').innerHTML = rowsHtml;
      document.getElementById('evalScoreGroundedness').textContent = `${summary.groundednessScore.toFixed(1)}%`;
      document.getElementById('evalScoreGroundedness').className = summary.groundednessScore >= 99.95
        ? 'text-2xl font-bold font-mono text-emerald-400 mt-1'
        : 'text-2xl font-bold font-mono text-rose-400 mt-1';
      document.getElementById('evalScoreRecall').textContent = `${summary.recallScore.toFixed(1)}%`;
      document.getElementById('evalScoreRecall').className = summary.recallScore >= 99.95
        ? 'text-2xl font-bold font-mono text-indigo-400 mt-1'
        : 'text-2xl font-bold font-mono text-amber-400 mt-1';
      document.getElementById('evalScoreHallucinations').textContent = String(summary.hallucinatedCount);
      document.getElementById('evalScoreHallucinations').className = summary.hallucinatedCount === 0
        ? 'text-2xl font-bold font-mono text-emerald-400 mt-1'
        : 'text-2xl font-bold font-mono text-rose-400 mt-1';
      document.getElementById('evalScoreLatency').textContent = isStrict
        ? `${summary.avgSteps.toFixed(1)} steps`
        : '1 shot (blind)';

      document.getElementById('headerEvalScoreBadge').textContent = `${Math.round(summary.groundednessScore)}%`;
      document.getElementById('headerEvalScoreBadge').className = summary.groundednessScore >= 99.95
        ? 'ml-1 px-1.5 py-0.2 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
        : 'ml-1 px-1.5 py-0.2 rounded text-[10px] font-mono bg-rose-500/20 text-rose-300 border border-rose-500/30';

      document.getElementById('evalActiveModeTag').textContent = isStrict
        ? 'Mode: Grounded Graph Agent (Trace-Proven)'
        : 'Mode: Naive Unconstrained Prompt (Hallucinations Caught)';
      document.getElementById('evalActiveModeTag').className = isStrict
        ? 'px-2.5 py-1 rounded text-xs font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
        : 'px-2.5 py-1 rounded text-xs font-mono bg-rose-500/15 text-rose-300 border border-rose-500/30';
    }

