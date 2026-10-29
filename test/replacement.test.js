const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function harness() {
 const elements = new Map();
 function element(){return {value:'old',textContent:'',hidden:false,children:[],classList:{add(){},toggle(){}},replaceChildren(){},setAttribute(){},appendChild(){},prepend(x){this.children.push(x)},querySelector(){return this.children[0]||null}}}
 const listeners={};
 const c=vm.createContext({console,TextEncoder, setTimeout, document:{getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id)},createElement:element},window:{addEventListener(k,f){listeners[k]=f}},localStorage:{getItem(){return null}},lucide:{createIcons(){}},fetch:()=>new Promise((resolve,reject)=>{c.resolveFetch=resolve;c.rejectFetch=reject})});
 for(const f of ['lib/cartograph-parser.js','lib/cartograph-intake.js','app/cartograph-graph-state.js','app/cartograph-app-shell.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);
 vm.runInContext(`globalThis.s=state;globalThis.calls=[];for(const name of ['syncCanvasToggleState','computeGraphNodePositions','updateHeaderMetrics','renderFileListSidebar','renderInspectorPanel','regenerateSpecDocs','renderEvalSuite','syncResponsiveShell','initResponsiveShell','initCanvasInteractions','initGlobalDragAndDrop','startCanvasAnimationLoop','closeAddFileModal','showToast'])globalThis[name]=()=>{};runAgentQuery=()=>calls.push('demo');switchRightPanelTab=()=>calls.push('tab');selectFileNode=(p,pan)=>calls.push([p,pan]);`,c);
 return {c,s:c.s,e:elements,run:x=>vm.runInContext(x,c),start:()=>listeners.DOMContentLoaded()};
}
const graph=(paths=['keep.js','hot.js'])=>({name:'repo',nodes:paths.map((path,i)=>({path,content:'export const a=1;',totalImpact:i})),edges:[],cycles:[],unresolved:[]});
test('replacement resolves selection once, resets drag/pan, and preserves preferences',()=>{
 const h=harness();h.c.g=graph();h.run('applyParsedGraph(g)');h.s.selectedFile='keep.js';h.s.draggingNode=h.s.graph.nodes[0];h.s.panningCanvas=true;h.s.activeView='evals';h.s.searchQuery='needle';h.s.evalRun={};h.s.agentWalkedFiles.add('keep.js');const old=h.s.graph;
 h.run('applyParsedGraph(g, undefined, {selection:"hotspot",customLabel:"new label"})');
 assert.equal(h.s.selectedFile,'hot.js');assert.equal(h.s.draggingNode,null);assert.equal(h.s.panningCanvas,false);assert.notEqual(h.s.graph,old);assert.equal(h.s.evalRun,null);assert.equal(h.s.agentWalkedFiles.size,0);assert.equal(h.s.activeView,'evals');assert.equal(h.s.searchQuery,'needle');assert.equal(h.e.get('repoPresetSelect').children[0].textContent,'new label');
 h.s.selectedFile='keep.js';h.run('applyParsedGraph(g)');assert.equal(h.s.selectedFile,'keep.js');h.c.empty=graph([]);h.run('applyParsedGraph(empty)');assert.equal(h.s.selectedFile,null);
});
test('custom adoption selects inserted path and pans after adoption',()=>{const h=harness();h.e.set('customFilePathInput',{value:'insert.js'});h.e.set('customFileCodeInput',{value:'export const x=1;'});h.run('submitCustomFile()');assert.equal(h.s.selectedFile,'insert.js');assert.equal(h.c.calls.length,0);});
for(const handler of ['preset','folder','custom'])test('parser exception preserves prior adoption through '+handler,async()=>{
 const h=harness();h.c.g=graph();h.run('applyParsedGraph(g)');h.s.selectedFile='keep.js';const before={graph:h.s.graph,raw:h.s.rawFiles,provenance:h.s.repositoryProvenance,selection:h.s.selectedFile};h.run('CartographParser.parseRepository=()=>{throw Error("parse failed")};globalThis.PRESET_REPOS={sample:{files:[],name:"sample"}}');
 h.e.set('customFilePathInput',{value:'insert.js'});h.e.set('customFileCodeInput',{value:''});
 if(handler==='folder'){h.c.files=[{name:'x.js',size:0,text:async()=>''}];await assert.rejects(h.run('ingestUploadedFileObjects(files)'),/parse failed/)}else assert.throws(()=>h.run(handler==='preset'?'handlePresetChange("sample")':'submitCustomFile()'),/parse failed/);
 assert.equal(h.s.graph,before.graph);assert.equal(h.s.rawFiles,before.raw);assert.equal(h.s.repositoryProvenance,before.provenance);assert.equal(h.s.selectedFile,before.selection);assert.equal(h.e.get('repoPresetSelect')?.children.length||0,0);
});
for(const failure of [false,true])test('stale startup '+(failure?'failure':'success')+' preserves user graph and initializes animation',async()=>{
 const h=harness();h.run('startCanvasAnimationLoop=()=>calls.push("animation")');const pending=h.start();h.c.g=graph(['user.js']);h.run('applyParsedGraph(g)');const current=h.s.graph;
 if(failure)h.c.rejectFetch(Error('offline'));else h.c.resolveFetch({ok:true,json:async()=>({graph:graph(['server.js'])})});await pending;
 assert.equal(h.s.graph,current);assert.deepEqual(JSON.parse(JSON.stringify(h.c.calls)),['animation']);
});

for(const failure of [false,true])test('delayed model '+(failure?'failure':'success')+' cannot affect replacement',async()=>{
 const h=harness();h.c.g=graph();h.run('applyParsedGraph(g)');
 vm.runInContext(fs.readFileSync('app/cartograph-agent-evals.js','utf8'),h.c);
 h.run(`buildDeterministicAgentPlan=()=>({visitedFiles:[],activeEdges:[],steps:[],answerHtml:'old'});renderAgentTrace=()=>'';escapeHtml=x=>x;document.getElementById('agentConversationStream').insertAdjacentHTML=()=>{};state.agentConfig.engine='ollama';showToast=()=>calls.push('toast');`);
 const pending=h.run('runAgentQuery("question")');h.run('applyParsedGraph(g)');
 if(failure)h.c.rejectFetch(Error('offline'));else h.c.resolveFetch({ok:true,json:async()=>({message:{content:'old answer'}})});
 await pending;assert.equal(h.c.calls.includes('toast'),false);assert.equal(h.s.agentWalkedFiles.size,0);
});
test('graph and files snapshots retain current raw files, provenance and custom labels',async()=>{
 const h=harness();for(const payload of [{name:'saved',scannedAt:'2026-01-01T00:00:00Z',graph:graph(['snapshot.js'])},{name:'saved',files:[{path:'snapshot.js',content:'export const x=1;'}]}]){
 h.c.files=[{name:'saved.json',text:async()=>JSON.stringify(payload)}];await h.run('ingestUploadedFileObjects(files)');assert.equal(h.s.rawFiles[0].path,'snapshot.js');assert.equal(h.s.repositoryProvenance.kind,'snapshot');assert.equal(h.e.get('repoPresetSelect').children[0].textContent,'snapshot: saved');
 }
});

for(const initial of ['native','custom-local'])test('native change parser failure restores adopted '+initial+' dropdown',()=>{
 const h=harness();h.e.set('repoPresetSelect',{value:initial,children:[{value:initial,textContent:'prior label'}],querySelector(){return this.children[0]}});h.c.g=graph();h.run('applyParsedGraph(g)');const old=h.s.graph;
 h.run('globalThis.PRESET_REPOS={attempt:{files:[],name:"attempt"}};CartographParser.parseRepository=()=>{throw Error("original parser failure")};document.getElementById("repoPresetSelect").value="attempt"');
 assert.throws(()=>h.run('handlePresetChange("attempt")'),/original parser failure/);assert.equal(h.e.get('repoPresetSelect').value,initial);assert.equal(h.e.get('repoPresetSelect').children[0].textContent,'prior label');assert.equal(h.s.graph,old);
});
test('custom adoption uses positioned nodes and renders production selection panels once',()=>{
 const h=harness();vm.runInContext(fs.readFileSync('app/cartograph-ui-panels.js','utf8'),h.c);
 h.run(`updateHeaderMetrics=()=>{};renderFileListSidebar=()=>calls.push('sidebar');renderInspectorPanel=()=>calls.push('inspector');computeGraphNodePositions=()=>{state.graph.nodes.forEach(n=>{n.x=30;n.y=40});state.camera.zoom=2};`);
 h.e.set('dependencyCanvas',{clientWidth:800,clientHeight:600});h.e.set('customFilePathInput',{value:'insert.js'});h.e.set('customFileCodeInput',{value:'export const x=1;'});h.run('submitCustomFile()');
 assert.deepEqual(JSON.parse(JSON.stringify(h.c.calls)),['sidebar','inspector']);assert.equal(h.s.camera.x,340);assert.equal(h.s.camera.y,220);assert.equal(h.s.selectedFile,'insert.js');
});
