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
test('structured subtask editor roundtrips note text, nesting and CRLF exactly',()=>{
 const body='## Notizen\r\n\r\n[[Projekt]] bleibt erhalten.\r\n\r\n## Teilaufgaben\r\n- [ ] Erster Schritt\r\n  * [X] Unterpunkt\r\n\r\nWeiterer Absatz.\r\n';
 const parsed=core.editorSubtasks(body);
 assert.equal(parsed.items.length,2);assert.equal(parsed.items[1].done,true);
 assert.equal(core.editorBody(body,parsed.notes,parsed.items),body);
});
test('editing a subtask preserves its position and surrounding notes',()=>{
 const body='Vorher\n- [ ] Alt\nNachher\n';const parsed=core.editorSubtasks(body);parsed.items[0].text='Neu';parsed.items[0].done=true;
 assert.equal(core.editorBody(body,parsed.notes,parsed.items),'Vorher\n- [x] Neu\nNachher\n');
});
test('adding and removing structured rows retains unrelated Markdown',()=>{
 const body='Notiz mit [[Link]]\n- [ ] Entfernen\n## Weiteres\nDetails\n';const parsed=core.editorSubtasks(body);
 const next=core.editorBody(body,parsed.notes,[{id:null,text:'Zusätzlicher Schritt',done:false}]);
 assert.ok(next.includes('Notiz mit [[Link]]'));assert.ok(next.includes('## Weiteres\nDetails'));assert.ok(!next.includes('Entfernen'));assert.equal(core.subtasks(next).length,1);assert.ok(next.includes('- [ ] Zusätzlicher Schritt'));
});
test('editing notes keeps structured subtasks and checked state',()=>{
 const body='Alte Notiz\n- [x] Fertig\n';const parsed=core.editorSubtasks(body);const next=core.editorBody(body,'Neue Notiz',parsed.items);
 assert.ok(next.startsWith('Neue Notiz'));assert.ok(next.includes('- [x] Fertig'));assert.equal(core.subtasks(next).length,1);
});
test('planning date assignment preserves deadlines and clears only planning date/time',()=>{
 const meta={due:'2026-12-01',scheduledTime:'09:00',durationMinutes:45};core.assignDay(meta,'2026-11-13');assert.equal(meta.due,'2026-12-01');assert.equal(meta.scheduled,'2026-11-13');core.assignDay(meta,'');assert.equal(meta.scheduled,undefined);assert.equal(meta.scheduledTime,undefined);assert.equal(meta.durationMinutes,45);assert.equal(meta.due,'2026-12-01');
});
test('planning validation rejects impossible dates and overnight blocks',()=>{
 assert.equal(core.validDay('2026-02-30'),false);assert.equal(core.validDay('2028-02-29'),true);assert.equal(core.timeMinutes('24:00'),null);
 assert.throws(()=>core.validatePlanning({scheduled:'2026-11-13',scheduledTime:'23:45',durationMinutes:30}),/innerhalb/);
 assert.throws(()=>core.validatePlanning({scheduledTime:'09:00'}),/Planungsdatum/);
 assert.throws(()=>core.validatePlanning({durationMinutes:0}),/Dauer/);
 assert.doesNotThrow(()=>core.validatePlanning({scheduled:'2026-11-13',scheduledTime:'23:30',durationMinutes:30}));
});
test('week overview starts Monday and crosses year boundary',()=>{
 const week=core.plannerWeek('2027-01-01');assert.equal(week.length,7);assert.equal(week[0],'2026-12-28');assert.equal(week[6],'2027-01-03');assert.equal(core.shiftDay('2026-03-29',1),'2026-03-30');
});
test('day plan includes flexible tasks and flags only overlapping active blocks',()=>{
 const item=(id,time,status='open',archived=false)=>({file:{path:id},meta:{title:id,status,archived,scheduled:'2026-11-13',scheduledTime:time,durationMinutes:60}});
 const items=[item('a','09:00'),item('b','09:30'),item('c','10:30'),item('d',''),item('done','09:00','done'),item('archive','09:00','open',true),{file:{path:'pool'},meta:{title:'pool',status:'open',due:'2026-11-13'}}];
 const day=core.dayPlan(items,'2026-11-13');assert.equal(day.planned.length,5);assert.equal(day.flexible.length,1);assert.equal(day.conflicts.size,2);assert.ok(day.conflicts.has('a'));assert.ok(day.conflicts.has('b'));assert.equal(day.pool.length,1);assert.equal(day.done,1);assert.equal(day.minutes,300);
});
test('textarea newline normalization does not relocate existing checklist items',()=>{
 const original='Vorher\r\n- [X] Schritt\r\nNachher\r\n';const parsed=core.editorSubtasks(original);
 assert.equal(core.editorBody(original,parsed.notes.replace(/\r\n/g,'\n'),parsed.items),original);
});
test('card note field omits conventional heading and separate checklist',()=>{
 const field=core.noteField('## Notizen\n\nMeine Notiz\n\n## Teilaufgaben\n\n- [ ] A\n');
 assert.equal(field.value,'Meine Notiz');assert.equal(field.prefix,'## Notizen\n\n');assert.ok(!field.value.includes('- [ ]'));
});
test('inline note save keeps the latest checkbox state and unknown metadata',async()=>{
 const p=new Plugin();const initial='## Notizen\n\nAlt\n\n- [ ] A\n';let raw=core.encode({taskflow:1,title:'Task',status:'done',custom:42,completed:'2026-11-01T12:00:00Z'},initial.replace('[ ]','[x]'));
 p.app={vault:{process:async(file,fn)=>{raw=fn(raw)}}};p.scan=async()=>{};
 await p.updateNotes({file:{}},core.noteField(initial).notes,'## Notizen\n\nNeu');
 const saved=core.decode(raw);assert.ok(saved.body.includes('Neu'));assert.ok(saved.body.includes('- [x] A'));assert.equal(saved.meta.custom,42);assert.equal(saved.meta.completed,'2026-11-01T12:00:00Z');
});
test('inline note save rejects a concurrent note edit',()=>{
 const original='Alte Notiz\n- [ ] A\n',current='Andere Notiz\n- [x] A\n';
 assert.throws(()=>core.patchNoteBody(current,core.noteField(original).notes,'Mein Entwurf'),/zwischenzeitlich/);
});
test('calendar movement updates plan without modifying due date, notes or completion',()=>{
 const meta={status:'done',due:'2026-12-01',completed:'2026-11-10T09:00:00Z',durationMinutes:45,custom:7};
 core.calendarMove(meta,'2026-11-16',9*60+15);
 assert.equal(meta.scheduled,'2026-11-16');assert.equal(meta.scheduledTime,'09:15');assert.equal(meta.due,'2026-12-01');assert.equal(meta.status,'done');assert.equal(meta.completed,'2026-11-10T09:00:00Z');assert.equal(meta.custom,7);
 core.calendarMove(meta,'2026-11-17',null);assert.equal(meta.scheduled,'2026-11-17');assert.equal(meta.scheduledTime,undefined);assert.equal(meta.durationMinutes,45);
});
test('calendar rejects out-of-day and fractional drop targets before writing',()=>{
 const meta={scheduled:'2026-11-13',scheduledTime:'09:00',durationMinutes:60,due:'2026-12-01'};const before=JSON.stringify(meta);
 assert.throws(()=>core.calendarMove(meta,'2026-11-16',23*60+30),/passt nicht/);assert.equal(JSON.stringify(meta),before);
 assert.throws(()=>core.calendarMove(meta,'2026-02-30',600),/Kalendertag/);assert.throws(()=>core.calendarMove(meta,'2026-11-16',90.5),/passt nicht/);
});
test('calendar lays overlapping blocks into reusable lanes and resets separate clusters',()=>{
 const item=(id,start,duration)=>({file:{path:id},meta:{title:id,status:'open',scheduled:'2026-11-13',scheduledTime:start,durationMinutes:duration}});
 const events=core.calendarEvents([item('a','09:00',60),item('b','09:30',60),item('c','10:00',30),item('d','12:00',30)],'2026-11-13');
 assert.equal(events.length,4);assert.equal(events[0].columns,2);assert.equal(events[1].columns,2);assert.equal(events[2].lane,0);assert.equal(events[3].columns,1);
});
test('calendar excludes other days and archived tasks and keeps short blocks clickable',()=>{
 const items=[{file:{path:'short'},meta:{scheduled:'2026-11-13',scheduledTime:'09:00',durationMinutes:5}},{file:{path:'archive'},meta:{archived:true,scheduled:'2026-11-13',scheduledTime:'09:00'}},{file:{path:'other'},meta:{scheduled:'2026-11-14',scheduledTime:'09:00'}},{file:{path:'flex'},meta:{scheduled:'2026-11-13'}}];
 const events=core.calendarEvents(items,'2026-11-13');assert.equal(events.length,1);assert.equal(events[0].duration,5);assert.equal(events[0].displayDuration,30);
});
test('calendar bounds include early and late scheduled tasks with default workday range',()=>{
 const days=['2026-11-13'];assert.equal(core.calendarBounds([],days).start,420);assert.equal(core.calendarBounds([],days).end,1200);
 const tasks=[{meta:{scheduled:days[0],scheduledTime:'05:15',durationMinutes:30}},{meta:{scheduled:days[0],scheduledTime:'23:30',durationMinutes:30}}];
 const bounds=core.calendarBounds(tasks,days);assert.equal(bounds.start,300);assert.equal(bounds.end,1440);
});
test('calendar pointer targets snap to fifteen minutes and respect grab offset',()=>{
 assert.equal(core.calendarDropMinute(394,100,420),630);
 assert.equal(core.calendarDropMinute(394,100,420,15),615);
 assert.equal(core.calendarDropMinute(-100,100,0),0);
});
test('dated open and in-progress tasks appear on their exact deadlines without writes',()=>{
 const items=[task('open','2026-11-10'),task('progress','2026-11-20')];items[0].meta.scheduledTime='09:00';const before=JSON.stringify(items);
 const projected=core.calendarTasks(items);assert.equal(projected.length,2);assert.equal(projected[0].meta.scheduled,'2026-11-10');assert.equal(projected[1].meta.scheduled,'2026-11-20');assert.equal(projected[0].meta.scheduledTime,undefined);assert.equal(projected[0].originalTask,items[0]);assert.equal(projected[0].calendarAutomatic,true);assert.equal(JSON.stringify(items),before);
 assert.equal(core.calendarTasks(projected).length,2);
});
test('calendar automatic inclusion excludes undated, invalid, delayed, done and archived tasks',()=>{
 const archived=task('open','2026-11-13');archived.meta.archived=true;
 const items=[task('open',''),task('open','2026-02-30'),task('progress','n/a'),task('delayed','2026-11-13'),task('done','2026-11-13'),archived];assert.equal(core.calendarTasks(items).length,0);
});
test('manual calendar plan overrides deadline and does not duplicate any status',()=>{
 for(const status of ['open','progress','delayed','done']){
  const item=task(status,'2026-11-13');Object.assign(item.meta,{scheduled:'2026-11-16',scheduledTime:'10:30'});
  const projected=core.calendarTasks([item]);assert.equal(projected.length,1);assert.equal(projected[0],item);assert.equal(projected[0].calendarAutomatic,undefined);assert.equal(projected[0].meta.scheduledTime,'10:30');assert.equal(projected[0].meta.scheduled,'2026-11-16');
  core.assignDay(item.meta,'');assert.equal(core.calendarTasks([item]).length,['open','progress'].includes(status)?1:0);
 }
});
test('completing an automatic calendar entry keeps it on its displayed day and preserves file data',async()=>{
 const original={file:{path:'task.md'},...task('progress','2026-11-13')};const projected=core.calendarTasks([original])[0];let raw=core.encode({...original.meta,custom:42},'My notes\n- [ ] Subtask\n');
 const p=new Plugin();p.app={vault:{process:async(file,fn)=>{assert.equal(file,original.file);raw=fn(raw)}}};p.scan=async()=>{};
 const view={plugin:p,contentEl:{setAttribute(){},removeAttribute(){},querySelector(){return null}}};
 await core.TaskView.prototype.setStatus.call(view,projected,'done');const saved=core.decode(raw);assert.equal(saved.meta.status,'done');assert.equal(saved.meta.scheduled,'2026-11-13');assert.equal(saved.meta.due,'2026-11-13');assert.equal(saved.meta.custom,42);assert.ok(saved.meta.completed);assert.equal(saved.body,'My notes\n- [ ] Subtask\n');assert.equal(core.calendarTasks([{file:original.file,...saved}]).length,1);
});
