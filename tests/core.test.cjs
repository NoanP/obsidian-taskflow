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
test('due labels distinguish overdue, today, future and no date',()=>{
 assert.equal(core.duePresentation(task('open','2000-01-01')).kind,'late');
 assert.equal(core.duePresentation(task('progress',core.today())).kind,'today');
 assert.equal(core.duePresentation(task('delayed','2099-12-31')).kind,'future');
 assert.equal(core.duePresentation(task('open','')).kind,'none');
});
test('completed tasks never show an overdue warning',()=>{
 const due=core.duePresentation(task('done','2000-01-01'));
 assert.equal(due.kind,'closed');assert.equal(due.label,'Abgeschlossen');
});
test('completion day uses local calendar date rather than UTC prefix',()=>{
 const date=new Date(2026,10,12,0,15);
 assert.equal(core.completionDay(date.toISOString()),'2026-11-12');
 assert.equal(core.completionDay('invalid'),'');
});
test('movement begins at old position and ends at destination',()=>{
 const frames=core.moveFrames({left:100,top:200},{left:500,top:210},'shadow');
 assert.equal(frames[0].transform,'translate(-400px, -10px) scale(1)');
 assert.equal(frames[2].transform,'translate(0, 0) scale(1)');
 assert.equal(frames[1].offset,.52);
});
test('unchanged scans do not redraw; changed content or path does',async()=>{
 const p=new Plugin();let raw=core.encode({taskflow:1,title:'Task',status:'open'},'notes'),renders=0;
 const file={path:'TaskFlow/Aufgaben/test.md'};
 p.tasks=[];p.scanVersion=0;p.settings={folder:'TaskFlow/Aufgaben'};
 p.app={vault:{getMarkdownFiles:()=>[file],read:async()=>raw},workspace:{getLeavesOfType:()=>[{view:{render:()=>renders++}}]}};
 await p.scan();await p.scan();assert.equal(renders,1);
 raw=core.encode({taskflow:1,title:'Task',status:'delayed'},'notes');await p.scan();assert.equal(renders,2);
 file.path='TaskFlow/Aufgaben/renamed.md';await p.scan();assert.equal(renders,3);
});
test('analytics counts snapshot, due buckets and completions separately',()=>{
 const now=new Date(2026,10,12,12),items=[
  {...task('open','2026-11-11'),meta:{taskflow:1,title:'A',status:'open',due:'2026-11-11',priority:'high',tags:['arbeit','arbeit']}},
  {...task('progress','2026-11-12'),meta:{status:'progress',due:'2026-11-12',priority:'low',tags:['privat']}},
  {meta:{status:'delayed',due:'2026-11-19',tags:[]}},
  {meta:{status:'open',due:'2026-11-20',tags:[]}},
  {meta:{status:'open',due:'',tags:[]}},
  {meta:{status:'done',due:'2026-11-01',completed:new Date(2026,10,11,12).toISOString(),tags:['arbeit']}},
  {meta:{status:'done',completed:new Date(2026,9,1,12).toISOString(),tags:[]}},
  {meta:{status:'done',completed:null,tags:[]}}
 ];
 const a=core.analytics(items,7,now);
 assert.equal(a.active,5);assert.equal(a.completed,1);assert.equal(a.rate,38);
 for(const key of ['late','today','week','later','none'])assert.equal(a.due[key],1,key);
 assert.equal(a.priority.high,1);assert.equal(a.priority.low,1);assert.equal(a.priority.normal,3);
 assert.equal(a.missingCompletion,1);assert.equal(a.tags.find(x=>x.tag==='arbeit').total,2);
 assert.equal(a.days[0].key,'2026-11-06');assert.equal(a.days[6].key,'2026-11-12');
});
test('90-day chart bins retain all days, last partial bin and total',()=>{
 const now=new Date(2026,10,12,12),days=core.calendarDays(90,now);
 const items=days.map(d=>({meta:{status:'done',completed:d.key+'T12:00:00',tags:[]}}));
 const a=core.analytics(items,90,now);
 assert.equal(a.days.length,90);assert.equal(a.bins.length,13);assert.equal(a.bins[12].count,6);
 assert.equal(a.completed,90);assert.equal(a.bins.reduce((sum,b)=>sum+b.count,0),90);
 assert.equal(a.bins[12].end,'2026-11-12');
});
test('empty analytics has finite zeros and no phantom chart values',()=>{
 const a=core.analytics([],14,new Date(2026,10,12,12));
 assert.equal(a.rate,0);assert.equal(a.completed,0);assert.equal(a.active,0);
 assert.equal(a.bins.every(b=>b.count===0),true);assert.equal(a.tags.length,0);
});
