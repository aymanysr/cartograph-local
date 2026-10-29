const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function harness(){
 const elements=new Map();
 const el=()=>({getClientRects(){return []},value:'sample',children:[],textContent:'',innerHTML:'',classList:{add(){},toggle(){}},setAttribute(){},appendChild(){},replaceChildren(){},querySelector(){return null}});
 const c=vm.createContext({console,setTimeout,document:{querySelectorAll(){return []},getElementById(id){if(!elements.has(id))elements.set(id,el());return elements.get(id)},createElement:el},window:{innerWidth:1440,addEventListener(){}},lucide:{createIcons(){}},fetch(){throw Error('eval fetched')}});
 for(const f of ['lib/cartograph-parser.js','lib/cartograph-agent.js','lib/cartograph-evals.js','app/cartograph-graph-state.js','app/cartograph-ui-panels.js','app/cartograph-agent-evals.js','app/cartograph-app-shell.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
 const run=s=>vm.runInContext(s,c);
 run(`globalThis.s=state;globalThis.suiteCalls=0;globalThis.plannerCalls=0;const evaluate=CartographEvals.evaluateSuite;CartographEvals.evaluateSuite=(...args)=>{suiteCalls++;return evaluate(...args)};const planner=CartographAgent.buildAgentPlan;CartographAgent.buildAgentPlan=(...args)=>{plannerCalls++;return planner(...args)};for(const name of ['syncCanvasToggleState','computeGraphNodePositions','updateHeaderMetrics','renderFileListSidebar','renderInspectorPanel','regenerateSpecDocs','syncResponsiveShell','showToast'])globalThis[name]=()=>{};globalThis.g=CartographParser.parseRepository([{path:'src/auth.js',content:'export const auth=1;'}]);applyParsedGraph(g);`);
 return {c,run,s:c.s,e:elements};
}
test('production Evals executes shared suite only on explicit Run, preserves same mode, clears real mode changes',()=>{
 const h=harness();h.run(`renderEvalSuite();switchMainView('evals');switchMainView('explorer');switchMainView('evals')`);
 assert.equal(h.c.plannerCalls,0);assert.equal(h.c.suiteCalls,0);assert.equal(h.s.evalRun,null);
 const selected=h.s.selectedFile,walked=h.s.agentWalkedFiles,edges=h.s.agentActiveEdges;
 h.run('runEvaluationSuite()');assert.equal(h.c.suiteCalls,1);assert.equal(h.c.plannerCalls,3);assert.equal(h.s.evalRun.summary.passCount,3);
 assert.equal(h.s.selectedFile,selected);assert.equal(h.s.agentWalkedFiles,walked);assert.equal(h.s.agentActiveEdges,edges);
 const run=h.s.evalRun;h.run(`renderEvalSuite();setEvalPromptMode('strict')`);assert.equal(h.s.evalRun,run);assert.equal(h.c.suiteCalls,1);
 h.run(`setEvalPromptMode('naive')`);assert.equal(h.s.evalRun,null);assert.equal(h.e.get('evalActiveModeTag').textContent,'Not run');
 h.run('runEvaluationSuite()');assert.equal(h.c.suiteCalls,2);assert.equal(h.c.plannerCalls,3);assert.equal(h.s.evalRun.summary.avgSteps,0);
});
test('production adoption clears results for same-size graph and empty Run remains Not run',()=>{
 const h=harness();h.run(`runEvaluationSuite();applyParsedGraph(CartographParser.parseRepository([{path:'new.js',content:''}]))`);
 assert.equal(h.s.evalRun,null);assert.equal(h.c.suiteCalls,1);assert.equal(h.c.plannerCalls,3);
 h.run(`runEvaluationSuite();applyParsedGraph(CartographParser.parseRepository([]));runEvaluationSuite()`);
 assert.equal(h.s.evalRun,null);assert.equal(h.c.suiteCalls,2);assert.equal(h.e.get('evalActiveModeTag').textContent,'Not run');
});
