const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const fixtures = [
 ['src/main.js', "import './style.css'; require('./worker.cjs');"],
 ['src/style.css', 'body{}'], ['src/worker.cjs', 'exports.x=1;'],
 ['data.json','{}'], ['UPPER.TS','export const x=1;'],
 ['boundary.js','é'.repeat(250000)], ['over.js','é'.repeat(250001)],
 ['.secret.js',''], ['.cache/x.js',''], ['vendor/x.js',''],
 ['out/x.js',''], ['coverage/x.js',''], ['venv/x.py',''],
 ['target/x.go',''], ['__pycache__/x.py',''], ['node_modules/x.js',''],
 ['dist/x.js',''], ['build/x.js',''], ['notvendor/keep.js',''],
 ['src/mydist/keep.js',''], ['notes.txt','ignored']
];
const accepted = fixtures.filter(([p]) => ['src/main.js','src/style.css','src/worker.cjs','data.json','UPPER.TS','boundary.js','notvendor/keep.js','src/mydist/keep.js'].includes(p)).map(([p])=>p).sort();
function element() { return { hidden:false, children:[], attrs:{}, textContent:'', appendChild(x){this.children.push(x);return x;},replaceChildren(){this.children=[];},setAttribute(k,v){this.attrs[k]=v;} }; }
function browserHarness() {
 const elements = Object.fromEntries(['intakeReasons','intakeReport','intakeStatus','intakeSummary','intakeSkippedList','intakeOmitted'].map(id=>[id,element()]));
 const context=vm.createContext({ console, TextEncoder, state:{graph:{nodes:[{path:'previous.js'}]}}, document:{getElementById(id){return elements[id]||null;},createElement:element}, window:{addEventListener(){}} });
 if(fs.existsSync('lib/cartograph-intake.js'))vm.runInContext(fs.readFileSync('lib/cartograph-intake.js','utf8'),context);
 vm.runInContext(fs.readFileSync('app/cartograph-app-shell.js','utf8'),context);
 vm.runInContext(`showToast=(message)=>{globalThis.message=message};markPresetSelectCustom=()=>{};parseRepositoryIntoGraph=(files)=>{state.graph={nodes:files.map(f=>({path:f.path}))};globalThis.loadedFiles=files;};applyParsedGraph=(graph)=>{state.graph=graph};`,context);
 return {context,elements,async ingest(files){context.input=files;await vm.runInContext('ingestUploadedFileObjects(input)',context);return JSON.parse(vm.runInContext('JSON.stringify(state.graph.nodes.map(n=>n.path).sort())',context));}};
}
function file(p,content='',options={}) {return {name:p.split('/').pop(),webkitRelativePath:'repo/'+p,size:Buffer.byteLength(content),text:async()=>content,...options};}
test('real CLI and browser accept identical supplied files with exact UTF-8 byte limit',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cartograph-intake-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(const [p,c] of fixtures){fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),c);}
 fs.symlinkSync(path.join(root,'src'),path.join(root,'linked'));
 const out=path.join(os.tmpdir(),path.basename(root)+'.json');t.after(()=>fs.rmSync(out,{force:true}));
 const cli=spawnSync(process.execPath,['cli/cartograph-scan.mjs',root,'--out',out],{encoding:'utf8'});
 assert.equal(cli.status,0,cli.stderr);
 const cliPaths=JSON.parse(fs.readFileSync(out)).graph.nodes.map(n=>n.path).sort();
 assert.deepEqual(cliPaths,accepted,'CLI must count actual bytes');
 assert.match(cli.stdout,/too-large/);assert.match(cli.stdout,/excluded-directory/);assert.match(cli.stdout,/symlink/);
 const browser=browserHarness();assert.deepEqual(await browser.ingest(fixtures.map(([p,c])=>file(p,c))),accepted);
 assert.match(browser.elements.intakeStatus.textContent,/skipped/);
});
test('browser handles selected root, mixed roots, duplicate/unreadable files and all-skipped retention',async()=>{
 const b=browserHarness();assert.deepEqual(await b.ingest([file('x.js','',{webkitRelativePath:'vendor/x.js'})]),['x.js']);
 assert.deepEqual(await b.ingest([file('a.js','',{webkitRelativePath:'one/a.js'}),file('b.js','',{webkitRelativePath:'two/b.js'})]),['one/a.js','two/b.js']);
 assert.deepEqual(await b.ingest([file('src/a.js'),file('src/a.js'),file('bad.js','',{text:async()=>{throw Error('locked')}})]),['src/a.js']);
 assert.match(b.elements.intakeStatus.textContent,/duplicate/);assert.match(b.elements.intakeStatus.textContent,/unreadable/);
 assert.deepEqual(await b.ingest([file('over.js','',{size:500001})]),['src/a.js']);
 assert.match(b.context.message,/kept|unchanged|preserv/i);
});
test('both snapshot forms bypass intake; ordinary JSON follows policy',async()=>{
 const b=browserHarness();const recorded=[{path:'.hidden/huge.txt',content:'x'.repeat(500001)},{path:'vendor/keep.js',content:''}];
 const snap=JSON.stringify({files:recorded});assert.deepEqual(await b.ingest([file('snapshot.json',snap,{webkitRelativePath:''})]),recorded.map(f=>f.path).sort());
 const graph={nodes:recorded.map(f=>({path:f.path}))};assert.deepEqual(await b.ingest([file('.snapshot.json',JSON.stringify({graph}),{webkitRelativePath:''})]),recorded.map(f=>f.path).sort());
 assert.deepEqual(await b.ingest([file('plain.json','{"x":1}',{webkitRelativePath:''})]),['plain.json']);
});
test('skip report caps safe text details and collapses excluded directories truthfully',async()=>{
 const b=browserHarness();await b.ingest([...Array.from({length:105},(_,i)=>file('bad'+i+'.txt')),file('vendor/a.js'),file('vendor/b.js'),file('<img>.txt')]);
 assert.equal(b.elements.intakeSkippedList.children.length,100);
 assert.match(b.elements.intakeOmitted.textContent,/7/);
 assert.match(b.elements.intakeStatus.textContent,/107/);
 const html=fs.readFileSync('cartograph.html','utf8');assert.match(html,/<details[^>]*id="intakeReport"/);assert.match(html,/id="intakeStatus"[^>]*aria-live="polite"/);
});
test('CLI bad root is a clear fatal error',()=>{
 const r=spawnSync(process.execPath,['cli/cartograph-scan.mjs','/nonexistent/cartograph-root'],{encoding:'utf8'});assert.notEqual(r.status,0);assert.match(r.stderr,/Cannot scan repository/);
});

test('shared policy is classic/CommonJS and uses whole segments with normalized paths',()=>{
 const policy=require('../lib/cartograph-intake.js');
 assert.equal(policy.checkFile('notvendor\\src\\mydist\\a.CJS',500000).include,true);
 assert.deepEqual(policy.checkFile('vendor\\nested\\a.js',0),{include:false,reason:'excluded-directory',skippedPath:'vendor'});
 assert.deepEqual(policy.checkDirectory('src/.cache/nested'),{include:false,reason:'hidden',skippedPath:'src/.cache'});
 assert.equal(policy.checkFile('x.js',500001).reason,'too-large');
});
test('real CLI continues unreadable siblings and checks bytes after a file grows',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cartograph-intake-io-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'locked'));fs.writeFileSync(path.join(root,'locked','child.js'),'');
 for(const name of ['keep.js','unreadable.js','grow.js','swap.js'])fs.writeFileSync(path.join(root,name),'export const x=1;');
 const preload=path.join(root,'io-hook.mjs');
 fs.writeFileSync(preload,`import fs from 'node:fs';
 const readDir=fs.readdirSync,open=fs.openSync,read=fs.readFileSync,stat=fs.fstatSync;const descriptors=new Map();
 fs.readdirSync=function(p,...args){if(String(p).endsWith('/locked'))throw Error('simulated unreadable directory');return readDir.call(this,p,...args)};
 fs.openSync=function(p,...args){if(String(p).endsWith('/unreadable.js'))throw Error('simulated unreadable file');if(String(p).endsWith('/swap.js')){fs.unlinkSync(p);fs.symlinkSync(String(p).replace('swap.js','keep.js'),p);}const fd=open.call(this,p,...args);descriptors.set(fd,String(p));return fd;};
 fs.fstatSync=function(fd,...args){const result=stat.call(this,fd,...args);if(descriptors.get(fd)?.endsWith('/grow.js'))fs.appendFileSync(descriptors.get(fd),'x'.repeat(500001));return result;};`);
 const out=path.join(root,'snapshot.out');const r=spawnSync(process.execPath,['--import',preload,'cli/cartograph-scan.mjs',root,'--out',out],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(fs.readFileSync(out)).graph.nodes.map(n=>n.path).sort(),['io-hook.mjs','keep.js']);
 assert.match(r.stdout,/locked \(unreadable\)/);assert.match(r.stdout,/unreadable.js \(unreadable\)/);assert.match(r.stdout,/grow.js \(too-large\)/);assert.match(r.stdout,/swap.js \(unreadable\)/);
});

test('each duplicate supplied file is counted while pruned directories count once',async()=>{
 const b=browserHarness();await b.ingest([file('a.js'),file('a.js'),file('a.js'),file('vendor/a.js'),file('vendor/b.js')]);
 assert.match(b.elements.intakeStatus.textContent,/3 skipped/);assert.match(b.elements.intakeStatus.textContent,/duplicate: 2/);assert.match(b.elements.intakeStatus.textContent,/excluded-directory: 1/);
});

test('CLI/browser normalize colliding literal-backslash and nested paths once',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cartograph-intake-collision-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'src'));fs.writeFileSync(path.join(root,'src/a.js'),'export const nested=1;');fs.writeFileSync(path.join(root,'src\\a.js'),'export const literal=1;');
 const out=path.join(root,'snapshot.out');const cli=spawnSync(process.execPath,['cli/cartograph-scan.mjs',root,'--out',out],{encoding:'utf8'});assert.equal(cli.status,0,cli.stderr);
 const cliPaths=JSON.parse(fs.readFileSync(out)).graph.nodes.map(n=>n.path);const b=browserHarness();const browserPaths=await b.ingest([file('src/a.js'),file('src\\a.js')]);
 assert.deepEqual(cliPaths,browserPaths);assert.deepEqual(cliPaths,['src/a.js']);assert.match(cli.stdout,/src\/a.js \(duplicate\)/);
});
test('each mixed selected root is exempt while nested excluded children are reported with prefix',async()=>{
 const b=browserHarness();const paths=await b.ingest([
 file('a.js','',{webkitRelativePath:'vendor/a.js'}),file('b.js','',{webkitRelativePath:'.hidden/b.js'}),file('c.js','',{webkitRelativePath:'other/c.js'}),
 file('nested.js','',{webkitRelativePath:'vendor/vendor/nested.js'}),file('hidden.js','',{webkitRelativePath:'.hidden/.cache/hidden.js'})]);
 assert.deepEqual(paths,['.hidden/b.js','other/c.js','vendor/a.js']);
 assert.match(b.elements.intakeStatus.textContent,/2 skipped/);
 assert.deepEqual(b.elements.intakeSkippedList.children.map(e=>e.textContent),['vendor/vendor — excluded-directory','.hidden/.cache — hidden']);
});
