const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
// The Obsidian YAML adapter is mocked with JSON (a YAML subset).
// Storage transformations are tested independently of the host parser.
const sandbox={module:{exports:{}},console,Date,structuredClone,require:()=>({Plugin:class{},ItemView:class{},Modal:class{},PluginSettingTab:class{},parseYaml:JSON.parse,stringifyYaml:JSON.stringify})};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../main.js'),'utf8'),sandbox);
const Plugin=sandbox.module.exports, core=Plugin.testing;
const task=(status,due)=>({meta:{taskflow:1,title:'Test',status,due},body:''});
test('all states, overdue excludes done and today',()=>{
 const tasks=[task('open','2000-01-01'),task('progress',core.today()),task('delayed',''),task('done','2000-01-01')];
 const s=core.summarize(tasks); assert.equal(s.total,4);for(const status of Object.keys(core.STATES))assert.equal(s[status],1);assert.equal(s.overdue,1);
});
test('Markdown roundtrip preserves unknown metadata and full notes',()=>{
 const meta={taskflow:1,title:'Umlaute ä, YAML: #',status:'open',custom:{nested:1},tags:['a/b']};const body='## Notizen\n[[Projekt]]\n- [ ] Teil A\n- [x] Teil B\n';
 const decoded=core.decode(core.encode(meta,body));assert.equal(JSON.stringify(decoded.meta),JSON.stringify(meta));assert.equal(decoded.body,body);assert.throws(()=>core.decode('plain text'));
});
test('subtask toggle targets one checkbox and preserves notes',()=>{
 const body='Notiz\n- [ ] A\n  - [X] B\n* [ ] C\n';assert.equal(core.subtasks(body).length,3);assert.equal(core.toggleSubtask(body,1),'Notiz\n- [ ] A\n  - [ ] B\n* [ ] C\n');
});
test('status completion timestamps reset on reopening',()=>{
 const p=new Plugin(),meta={status:'done'};p.stamp(meta,'open');assert.ok(meta.completed);const completed=meta.completed;p.stamp(meta,'done');assert.equal(meta.completed,completed);meta.status='open';p.stamp(meta,'done');assert.equal(meta.completed,undefined);
});
test('concurrent note edits reject stale editor save',async()=>{
 const p=new Plugin();const raw=core.encode({taskflow:1,title:'Changed',status:'open'},'new notes');p.app={vault:{process:async(file,fn)=>fn(raw)}};
 await assert.rejects(()=>p.saveTask({file:{},raw:'stale'}, {title:'old'},'old notes'),/zwischenzeitlich/);
});
test('status mutation preserves latest body and metadata',async()=>{
 const p=new Plugin();let raw=core.encode({taskflow:1,title:'Task',status:'open',custom:42},'latest notes');p.app={vault:{process:async(file,fn)=>{raw=fn(raw)}}};p.scan=async()=>{};
 await p.change({file:{}},m=>m.status='done');const decoded=core.decode(raw);assert.equal(decoded.body,'latest notes');assert.equal(decoded.meta.custom,42);assert.equal(decoded.meta.status,'done');assert.ok(decoded.meta.completed);
});
