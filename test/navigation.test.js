const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Dispatch the production listeners in capture/target/bubble order. This boundary
// models DOM replacement; native dialog close timing is covered in the browser.
function harness(width=1440) {
 const elements=new Map(), documentListeners={}, windowListeners={};
 let document;
 function element(id='') {return {id,dataset:{},children:[],style:{},isConnected:true,disabled:false,hidden:false,scrollTop:0,clientWidth:800,clientHeight:600,
  listeners:{},addEventListener(type,fn){(this.listeners[type]??=[]).push(fn)},
  getClientRects(){return this.isConnected&&!this.hidden?[{}]:[]},getBoundingClientRect(){return {left:0,top:0}},
  focus(){document.activeElement=this},matches(){return !!this.dataset.filepath||this.id==='commandsLauncher'},setAttribute(){},removeAttribute(){},scrollIntoView(){},
  replaceChildren(){this.children.forEach(x=>x.isConnected=false);this.children=[]},appendChild(x){this.children.push(x);x.parentElement=this;return x},
  querySelectorAll(){return this.children},closest(selector){return selector.includes('[data-filepath]')&&this.dataset.filepath?this:null},classList:{add(){},remove(){},toggle(){}}};}
 document={activeElement:null,body:element('body'),getElementById(id){if(!elements.has(id))elements.set(id,element(id));return elements.get(id)},createElement:()=>element(),
 querySelectorAll(selector){return selector==='[data-filepath]'?[...elements.values()].flatMap(e=>e.children).filter(e=>e.isConnected&&e.dataset.filepath):[]},querySelector(){return null},
 addEventListener(type,fn,capture){(documentListeners[type]??=[]).push({fn,capture:!!capture})}};
 const c=vm.createContext({console,document,setTimeout,clearTimeout,queueMicrotask:()=>{},requestAnimationFrame:()=>{},ResizeObserver:class{observe(){}},window:{innerWidth:width,addEventListener(type,fn){(windowListeners[type]??=[]).push(fn)}}});
 if(fs.existsSync('lib/cartograph-fit.js'))vm.runInContext(fs.readFileSync('lib/cartograph-fit.js','utf8'),c);
 for(const file of ['app/cartograph-graph-state.js','app/cartograph-canvas-render.js','app/cartograph-ui-panels.js','app/cartograph-app-shell.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c,{filename:file});
 const run=source=>vm.runInContext(source,c);
 run(`globalThis.s=state;globalThis.selections=[];state.graph.nodes=[{path:'src/a.js',x:20,y:20}];state.camera={x:0,y:0,zoom:1};syncResponsiveShell=()=>{};switchMainView=(view)=>{state.activeView=view};selectFileNode=(p,pan)=>{selections.push([p,pan]);state.selectedFile=p};updateShellZoom=()=>{};initResponsiveShell();initFilePathDelegation();initCanvasInteractions();`);
 return {c,run,s:c.s,e:elements,el:element,document,click(target){document.activeElement=target;const event={target};for(const l of documentListeners.click||[])if(l.capture)l.fn(event);for(const fn of target.listeners.click||[])fn(event);for(const l of documentListeners.click||[])if(!l.capture)l.fn(event)},mouse(type,x,y){const e={clientX:x,clientY:y,target:document.getElementById('dependencyCanvas')};for(const fn of (type==='mousedown'?e.target.listeners:windowListeners)[type]||[])fn(e)}};
}
test('palette pointer and Enter each navigate once through registered production routes',()=>{
 const h=harness();h.run(`state.ui.paletteMode="files";renderCommandPalette();`);const row=h.e.get('paletteResults').children[0];h.click(row);assert.equal(h.c.selections.length,1);h.run(`handlePaletteKeydown({key:'Enter',preventDefault(){}})`);assert.equal(h.c.selections.length,2);
});
test('stale delegated file on phone has no pane, selection, overlay or focus side effects',()=>{
 const h=harness(390),row=h.el();row.dataset.filepath='gone.js';h.s.ui.phonePane='files';h.s.ui.overlay='files';h.run(`setPhonePane=()=>{state.ui.phonePane='impact'};closeUiOverlay=()=>{state.ui.overlay=null}`);h.click(row);assert.equal(h.s.ui.phonePane,'files');assert.equal(h.s.ui.overlay,'files');assert.equal(h.c.selections.length,0);assert.equal(h.document.activeElement,row);
});
for(const view of ['explorer','evals','specs'])test('desktop '+view+' file navigation focuses visible equivalent or Map after redraw',()=>{
 const h=harness(),source=h.el();source.dataset.filepath='src/a.js';h.s.activeView=view;h.e.get('fileListContainer')?.children.push(source);
 const list=h.document.getElementById('fileListContainer');list.appendChild(source);h.c.source=source;h.run(`selectFileNode=(p,pan)=>{selections.push([p,pan]);source.isConnected=false};`);h.click(source);assert.equal(h.document.activeElement.id,'mapRegion');assert.ok(h.document.activeElement.getClientRects().length);
});
test('desktop redraw restores equivalent file control using raw path',()=>{
 const h=harness(),source=h.el();source.dataset.filepath='src/a.js';const list=h.document.getElementById('fileListContainer');list.appendChild(source);h.c.source=source;h.c.replacement=h.el();h.c.replacement.dataset.filepath='src/a.js';h.run(`selectFileNode=()=>{source.isConnected=false;document.getElementById('fileListContainer').children=[replacement]}`);h.click(source);assert.equal(h.document.activeElement,h.c.replacement);
});
test('canvas click selects without pan but drag away then back never selects',()=>{
 const h=harness();h.mouse('mousedown',20,20);h.mouse('mouseup',20,20);assert.deepEqual(JSON.parse(JSON.stringify(h.c.selections)),[['src/a.js',false]]);h.mouse('mousedown',20,20);h.mouse('mousemove',60,60);h.mouse('mousemove',20,20);h.mouse('mouseup',20,20);assert.equal(h.c.selections.length,1);
});

test('file sheet records live scroll before native close can reset it',()=>{
 const h=harness(768);h.s.ui.overlay='files';h.document.getElementById('fileListContainer').scrollTop=600;h.run(`closeUiOverlay=()=>{state.ui.overlay=null;document.getElementById('fileListContainer').scrollTop=0};selectFileFromUi('src/a.js')`);assert.equal(h.s.ui.fileListScrollTop,600);
});

test('desktop canvas origin with body active falls back to Map without making body focusable',()=>{
 const h=harness();h.document.activeElement=h.document.body;h.mouse('mousedown',20,20);h.mouse('mouseup',20,20);assert.equal(h.c.selections.length,1);assert.equal(h.document.activeElement,h.document.getElementById('mapRegion'));assert.equal(h.document.body.tabIndex,undefined);
});
test('desktop navigation retains a surviving focused control',()=>{
 const h=harness(),button=h.document.getElementById('commandsLauncher');h.document.activeElement=button;h.mouse('mousedown',20,20);h.mouse('mouseup',20,20);assert.equal(h.document.activeElement,button);
});

test('CartographNavigation navigateTo centralizes file selection and rejects unknown paths', () => {
 const h = harness();
 const success = h.run("CartographNavigation.navigateTo('src/a.js', { pan: true })");
 assert.equal(success, true);
 assert.equal(h.s.selectedFile, 'src/a.js');

 const failure = h.run("CartographNavigation.navigateTo('src/unknown.js')");
 assert.equal(failure, false);
});
