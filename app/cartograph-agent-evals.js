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
        <header>
          <strong>${escapeHtml(question)}</strong>
          <span>${plan.steps.length} tool steps</span>
          ${narrativeBadge}
        </header>
        <div class="agent-trace"><h3>Tool trace</h3>${stepsHtml}</div>
        <section class="agent-answer"><h3>Answer</h3><div class="agent-synthesis-body">${plan.answerHtml}</div></section>
      </article>`;

      stream.insertAdjacentHTML('afterbegin', cardHtml);
      lucide.createIcons();

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

    function renderAgentTrace(plan) {
      return plan.steps.map((step, index) => `<div class="trace-row"><div>${index+1}. ${escapeHtml(step.tool)}(${escapeHtml(step.args)})</div><p>${escapeHtml(step.output)}</p><div>${step.files.map(makeFileChipHtml).join(' ')}</div></div>`).join('');
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
      ['strict','naive'].forEach(mode => document.getElementById(mode === 'strict' ? 'evalModeStrictBtn' : 'evalModeNaiveBtn').setAttribute('aria-pressed', String(state.evalPromptMode === mode)));
      const values = {evalScoreGroundedness: summary ? summary.groundednessScore.toFixed(1)+'%' : '—', evalScoreRecall: summary ? summary.recallScore.toFixed(1)+'%' : '—', evalScoreHallucinations: summary ? String(summary.hallucinatedCount) : '—', evalScoreLatency: summary ? (evaluation.isStrict ? summary.avgSteps.toFixed(1)+' steps' : '0 steps') : '—'};
      Object.entries(values).forEach(([id,value]) => document.getElementById(id).textContent = value);
      if (summary) document.getElementById('evalScoreLatency').innerHTML = `${evaluation.isStrict ? summary.avgSteps.toFixed(1) : '0'} <small>steps</small>`;
      document.getElementById('headerEvalScoreBadge').textContent = summary ? summary.groundednessScore.toFixed(1)+'%' : '—';
      document.getElementById('evalActiveModeTag').textContent = evaluation ? `${evaluation.isStrict ? 'Strict' : 'Naive'} · ${summary.passCount}/${summary.totalCases} passed` : 'Not run';
      document.getElementById('evalCasesContainer').innerHTML = !evaluation ? '<p class="eval-empty">Not run. Run the suite to inspect citation evidence for this graph.</p>' : evaluation.entries.map(({tc,plan,result},index) => `<details class="eval-case"><summary><span>${index+1}. ${escapeHtml(tc.question)}</span><span class="case-metrics">${result.passed ? 'Pass' : 'Fail'} · Grounded ${result.groundednessScore.toFixed(1)}% · Recall ${result.recallScore.toFixed(1)}% · ${plan?.steps.length || 0} steps</span></summary><div class="case-evidence"><h3>Tool trace</h3>${plan ? renderAgentTrace(plan) : '<p>No tool trace — naive prompt.</p>'}<h3>Answer</h3><div>${plan ? plan.answerHtml : renderGroundedText(tc.naiveAnswer,state.graph)}</div><h3>Verified citations</h3><div>${result.citedFiles.filter(path => !result.hallucinatedPaths.includes(path) && !result.unprovenPaths.includes(path)).map(makeFileChipHtml).join(' ') || '—'}</div><h3>Rejected paths</h3><p class="rejected-paths">${result.hallucinatedPaths.map(escapeHtml).join(', ') || 'None'}</p><h3>Unproven citations</h3><p>${result.unprovenPaths.map(escapeHtml).join(', ') || 'None'}</p></div></details>`).join('');
    }
