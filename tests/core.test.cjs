const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
// The Obsidian YAML adapter is mocked with JSON (a YAML subset).
// Storage transformations are tested independently of the host parser.
const sandbox={module:{exports:{}},console,Date,structuredClone,crypto:require('node:crypto').webcrypto,require:()=>({Plugin:class{},ItemView:class{},Modal:class{},PluginSettingTab:class{},parseYaml:JSON.parse,stringifyYaml:JSON.stringify,normalizePath:s=>s,Notice:class{}})};
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
 await assert.rejects(()=>p.saveTask({file:{},raw:'stale'}, {title:'old',status:'open'},'old notes'),/zwischenzeitlich/);
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
test('weekly recurrence keeps weekday and wall clock across DST and includes end date',()=>{
 const rule={frequency:'weekly',interval:1,start:'2026-03-20',time:'09:00',durationMinutes:60,until:'2026-04-10'};
 assert.equal(JSON.stringify(core.recurrenceDates(rule,'2026-03-20')),JSON.stringify(['2026-03-27','2026-04-03','2026-04-10']));
 const occurrence=core.recurrenceOccurrence({meta:{id:'weekly',recurrence:rule},body:''},'2026-04-03');assert.equal(occurrence.meta.scheduledTime,'09:00');assert.equal(occurrence.meta.scheduled,'2026-04-03');assert.equal(occurrence.meta.due,'2026-04-03');
});
test('monthly recurrence clamps month-end without drifting from anchor',()=>{
 const rule={frequency:'monthly',interval:1,start:'2028-01-31',durationMinutes:30,until:'2028-04-30'};
 assert.equal(JSON.stringify(core.recurrenceDates(rule,'2028-02-01')),JSON.stringify(['2028-02-29','2028-03-31','2028-04-30']));
 rule.interval=2;assert.equal(JSON.stringify(core.recurrenceDates(rule,'2028-02-01')),JSON.stringify(['2028-03-31']));
});
test('daily recurrence uses bounded catchup, inclusive horizon and original anchor',()=>{
 const dates=core.recurrenceDates({frequency:'daily',interval:1,start:'2000-01-01'},'2026-11-13');assert.equal(dates.length,121);assert.equal(dates[0],core.shiftDay('2026-11-13',-30));assert.equal(dates.at(-1),core.shiftDay('2026-11-13',90));
 assert.equal(core.recurrenceDates({frequency:'daily',interval:1,start:'2027-11-13'},'2026-11-13').length,0);
 assert.equal(core.recurrenceDates({enabled:false},'2026-11-13').length,0);
});
test('recurrence validation rejects malformed rules and impossible times',()=>{
 const rule={frequency:'weekly',interval:1,start:'2026-11-13'};
 for(const change of [{frequency:'yearly'},{interval:0},{interval:1.5},{interval:366},{start:'2026-02-30'},{until:'2026-11-12'},{time:'25:00'},{time:'23:45',durationMinutes:60}])assert.throws(()=>core.validateRecurrence({...rule,...change}));
});
test('occurrences reset status and subtasks but retain notes, tags and custom metadata',()=>{
 const source={meta:{id:'source',title:'Meeting',status:'done',completed:'yesterday',archived:true,tags:['work'],custom:{value:2},recurrence:{frequency:'weekly',interval:1,start:'2026-11-13',time:'10:00',durationMinutes:45}},body:'Notes\n- [x] A\n  * [X] B\n- [ ] C\n'};const before=JSON.stringify(source);
 const occurrence=core.recurrenceOccurrence(source,'2026-11-20');assert.equal(occurrence.meta.status,'open');assert.equal(occurrence.meta.completed,undefined);assert.equal(occurrence.meta.archived,undefined);assert.equal(occurrence.meta.recurrence,undefined);assert.equal(occurrence.meta.recurrenceSeries,'source');assert.equal(occurrence.meta.recurrenceDate,'2026-11-20');assert.equal(occurrence.meta.custom.value,2);assert.equal(occurrence.meta.tags[0],'work');assert.equal(occurrence.body,'Notes\n- [ ] A\n  * [ ] B\n- [ ] C\n');assert.equal(JSON.stringify(source),before);
});
test('recurrence generation is idempotent across concurrent scans, renames and completions',async()=>{
 const p=new Plugin();p.settings={folder:'Tasks'};const files=new Map();let writes=0;
 p.app={vault:{getAbstractFileByPath:path=>files.has(path)?{path}:null,read:async file=>files.get(file.path),create:async(path,raw)=>{assert.ok(!files.has(path));writes++;files.set(path,raw)}}};
 const source={file:{path:'Tasks/source.md'},meta:{taskflow:1,id:'source',title:'Meeting',status:'done',recurrence:{frequency:'weekly',interval:1,start:'2026-11-13',time:'09:00',until:'2026-12-04'}},body:'Notes\n- [x] A\n'};
 const counts=await Promise.all([p.ensureRecurrences([source],'2026-11-13'),p.ensureRecurrences([source],'2026-11-13')]);assert.equal(writes,3);assert.equal(counts[0],3);assert.equal(counts[1],3);
 assert.equal(await p.ensureRecurrences([source],'2026-11-13'),0);assert.equal(writes,3);
 const decoded=core.decode(files.get('Tasks/source--2026-11-20.md'));decoded.meta.status='done';decoded.meta.archived=true;files.delete('Tasks/source--2026-11-20.md');files.set('Tasks/renamed.md',core.encode(decoded.meta,decoded.body));
 assert.equal(await p.ensureRecurrences([source,{file:{path:'Tasks/renamed.md'},...decoded}],'2026-11-13'),0);assert.equal(writes,3);
 source.meta.recurrence.enabled=false;files.clear();assert.equal(await p.ensureRecurrences([source],'2026-11-13'),0);
});
test('scan creates dated calendar occurrences and refreshes without duplicates',async()=>{
 const p=new Plugin();p.settings={folder:'Tasks'};p.scanVersion=0;let renders=0;const files=new Map();const now=core.today();
 files.set('Tasks/source.md',core.encode({taskflow:1,id:'source',title:'Meeting',status:'open',scheduled:now,recurrence:{frequency:'weekly',interval:1,start:now,time:'09:00',until:core.shiftDay(now,14)}},'Notes'));
 p.app={vault:{getMarkdownFiles:()=>[...files.keys()].map(path=>({path})),read:async file=>files.get(file.path),getAbstractFileByPath:path=>files.has(path),create:async(path,raw)=>files.set(path,raw)},workspace:{getLeavesOfType:()=>[{view:{render:()=>renders++}}]}};
 await p.scan();assert.equal(p.tasks.length,3);assert.equal(core.calendarEvents(core.calendarTasks(p.tasks),core.shiftDay(now,7)).length,1);assert.equal(renders,1);await p.scan();assert.equal(files.size,3);assert.equal(renders,1);
});
test('task editing and recurrence leave fenced Markdown examples untouched',()=>{
 const body='Notes\r\n```md\r\n- [x] Example\r\n```\r\n~~~\r\n+ [ ] Another example\r\n~~~\r\n+ [X] Actual task\r\n';
 assert.equal(core.subtasks(body).length,1);assert.equal(core.subtasks(body)[0][2],'Actual task');assert.equal(core.toggleSubtask(body,0),body.replace('+ [X] Actual task','+ [ ] Actual task'));
 const parsed=core.editorSubtasks(body);assert.equal(parsed.items.length,1);assert.equal(core.editorBody(body,parsed.notes,parsed.items),body);
 parsed.items[0].text='Changed';assert.equal(core.editorBody(body,parsed.notes,parsed.items),body.replace('Actual task','Changed'));
 const child=core.recurrenceOccurrence({meta:{id:'series',recurrence:{time:'09:00'}},body},'2026-11-20');assert.equal(child.body,body.replace('+ [X] Actual task','+ [ ] Actual task'));
});
test('invalid status, empty title and invalid due dates are rejected before saving',async()=>{
 for(const status of ['constructor','toString','__proto__','unknown'])assert.throws(()=>core.validateTaskFields({status,title:'Test'}));
 assert.throws(()=>core.validateTaskFields({status:'open',title:'  '}));assert.throws(()=>core.validateTaskFields({status:'open',title:'Test',tags:[1]}));
 assert.throws(()=>core.validatePlanning({due:'2026-02-30'}));assert.equal(core.dateValue(new Date('bad')), '');
 const p=new Plugin();let writes=0;p.app={vault:{process:async()=>{writes++}}};await assert.rejects(()=>p.saveTask({}, {title:'Test',status:'constructor'},'Notes'));assert.equal(writes,0);
});
test('calendar range includes display height for a five-minute late appointment',()=>{
 const bounds=core.calendarBounds([{meta:{scheduled:'2026-11-13',scheduledTime:'20:55',durationMinutes:5}}],['2026-11-13']);assert.equal(bounds.end,1320);
});
test('bounded parallel scans preserve all tasks and ignore prototype status names',async()=>{
 const p=new Plugin();p.settings={folder:'Tasks'};p.scanVersion=0;let active=0,peak=0,renders=0;
 const files=Array.from({length:40},(_,i)=>({path:'Tasks/'+i+'.md'}));
 p.app={vault:{getMarkdownFiles:()=>files,read:async file=>{active++;peak=Math.max(peak,active);await Promise.resolve();active--;return core.encode({taskflow:1,title:file.path,status:'open'},'Notes')}},workspace:{getLeavesOfType:()=>[{view:{render:()=>renders++}}]}};
 await p.scan();assert.equal(p.tasks.length,40);assert.ok(peak>1&&peak<=16);assert.equal(renders,1);
 p.stopped=true;await p.scan();assert.equal(renders,1);
});
test('unloaded plugin cannot create additional recurring tasks',async()=>{
 const p=new Plugin();p.stopped=true;p.settings={folder:'Tasks'};let writes=0;p.app={vault:{create:async()=>writes++,getAbstractFileByPath:()=>false}};
 assert.equal(await p.ensureRecurrences([{file:{path:'Tasks/source.md'},meta:{id:'source',recurrence:{frequency:'daily',interval:1,start:'2026-11-13'}},body:''}],'2026-11-13'),0);assert.equal(writes,0);
});
test('search combines terms across title, notes, subtasks, tags and dates',()=>{
 const items=[{meta:{title:'Überprüfung Straße',status:'open',tags:['Arbeit'],due:'2026-11-13'},body:'Notiz\n- [ ] Agenda vorbereiten'},task('open','')];
 assert.equal(core.filterTasks(items,{query:'UBERPRUFUNG strasse #arbeit agenda 2026-11-13'}).length,1);
 assert.equal(core.filterTasks(items,{query:'agenda fehlt'}).length,0);assert.equal(core.filterTasks(items,{query:'  \n  '}).length,2);
});
test('status, priority, tag and query intersect without modifying tasks',()=>{
 const items=[{meta:{title:'Meeting',status:'progress',priority:'high',tags:['team'],due:'2026-11-13'},body:'Agenda'}, {meta:{title:'Meeting',status:'open',priority:'high',tags:['team']},body:'Agenda'}, {meta:{title:'Meeting',status:'progress',priority:'low',tags:['team']},body:'Agenda'}];
 const before=JSON.stringify(items),filtered=core.filterTasks(items,{query:'agenda',tag:'team',status:'progress',priority:'high',due:'today'},'2026-11-13');assert.equal(filtered.length,1);assert.equal(filtered[0],items[0]);assert.equal(JSON.stringify(items),before);assert.equal(core.filterTasks(items,{tag:'Team'}).length,0);
});
test('due filters respect date boundaries and overdue excludes done',()=>{
 const items=[task('open','2026-11-12'),task('done','2026-11-12'),task('progress','2026-11-13'),task('delayed','2026-11-19'),task('open','2026-11-20'),task('open',''),task('open','2026-02-30')];
 const filter=due=>core.filterTasks(items,{due},'2026-11-13');assert.equal(filter('overdue').length,1);assert.equal(filter('today').length,1);assert.equal(filter('week').length,2);assert.equal(filter('none').length,2);
 assert.equal(core.filterTasks([task('open','2027-01-01')],{due:'week'},'2026-12-28').length,1);
});
test('search cache reuses immutable scan objects and new scans use refreshed content',()=>{
 const cache=new WeakMap(),item={meta:{title:'Original',status:'open'},body:'Notiz'};assert.equal(core.filterTasks([item],{query:'Original'},'2026-11-13',cache).length,1);assert.ok(cache.has(item));
 assert.equal(core.filterTasks([item],{query:'Notiz'},'2026-11-13',cache).length,1);
 const updated={...item,meta:{...item.meta,title:'Geändert'}};assert.equal(core.filterTasks([updated],{query:'Original'},'2026-11-13',cache).length,0);assert.equal(core.filterTasks([updated],{query:'geandert'},'2026-11-13',cache).length,1);
 assert.equal(core.filterTasks([item],{priority:'normal'}).length,1);
});
function seriesFixture(base='2026-11-13'){
 const source={file:{path:'Tasks/series.md'},meta:{taskflow:1,id:'series',title:'Meeting',status:'open',priority:'normal',tags:['team'],due:base,scheduled:base,scheduledTime:'09:00',durationMinutes:30,recurrence:{frequency:'weekly',interval:1,start:base,time:'09:00',durationMinutes:30,until:core.shiftDay(base,35)}},body:'Template\n- [ ] Agenda\n'};
 const tasks=[source];for(const offset of [7,14,21,28,35]){const day=core.shiftDay(base,offset),child=core.recurrenceOccurrence(source,day);tasks.push({file:{path:'Tasks/'+child.meta.id+'.md'},...child});}
 for(const item of tasks)item.raw=core.encode(item.meta,item.body);return tasks;
}
function memoryPlugin(items){
 const p=new Plugin();p.settings={folder:'Tasks',customSetting:42};p.tasks=items;p.scanVersion=0;const files=new Map(items.map(t=>[t.file.path,t.raw]));
 p.app={vault:{getMarkdownFiles:()=>[...files.keys()].map(path=>({path})),read:async f=>files.get(f.path),process:async(f,fn)=>{files.set(f.path,fn(files.get(f.path)))},getAbstractFileByPath:path=>files.has(path),create:async(path,raw)=>{if(files.has(path))throw new Error('exists');files.set(path,raw)}},workspace:{getLeavesOfType:()=>[]}};
 return {p,files};
}
test('saved filter names and payloads are validated and normalized',()=>{
 assert.equal(core.filterName('  Arbeit  ',[]),'Arbeit');assert.throws(()=>core.filterName(' ',[]));assert.throws(()=>core.filterName('a'.repeat(81),[]));assert.throws(()=>core.filterName('Arbeit',[{id:'a',name:'arbeit'}]));assert.equal(core.filterName('Arbeit',[{id:'a',name:'arbeit'}],'a'),'Arbeit');
 const f=core.filterSnapshot({query:'test',tag:'work',status:'constructor',priority:'high',due:'today',unknown:42});assert.equal(f.status,'');assert.equal(f.priority,'high');assert.equal(f.unknown,undefined);assert.equal(core.savedFilters({savedFilters:[null,{}, {id:'a',name:'Arbeit',filters:{status:'open'}}]}).length,1);
});
test('saved filters survive serialization, rename, delete and concurrent saves without losing settings',async()=>{
 const {p}=memoryPlugin([]);let stored;p.saveData=async next=>{stored=JSON.parse(JSON.stringify(next))};
 const ids=await Promise.all([p.storeFilter('Arbeit',{status:'open',tag:'work'}),p.storeFilter('Heute',{due:'today'})]);assert.equal(p.settings.savedFilters.length,2);assert.equal(stored.customSetting,42);
 await p.storeFilter('Büro',null,ids[0]);assert.equal(p.settings.savedFilters[0].filters.tag,'work');assert.equal(p.settings.savedFilters[0].name,'Büro');
 const reload=JSON.parse(JSON.stringify(stored));assert.equal(core.savedFilters(reload)[1].filters.due,'today');await p.deleteFilter(ids[0]);assert.equal(p.settings.savedFilters.length,1);
 p.saveData=async()=>{throw new Error('disk full')};await assert.rejects(()=>p.storeFilter('Fehler',{status:'open'}),/disk full/);assert.equal(p.settings.savedFilters.length,1);
});
test('single source edit preserves the future template and single child edits become exceptions',async()=>{
 const tasks=seriesFixture(),{p,files}=memoryPlugin(tasks);p.scan=async()=>{};
 await p.saveScopedTask(tasks[0],{...tasks[0].meta,title:'Only this'},'Personal notes\n- [x] Agenda\n','single');const saved=core.decode(files.get(tasks[0].file.path));
 assert.equal(saved.meta.title,'Only this');const next=core.recurrenceOccurrence(saved,'2026-11-20');assert.equal(next.meta.title,'Meeting');assert.equal(next.body,'Template\n- [ ] Agenda\n');assert.equal(next.meta.recurrenceTemplate,undefined);
 await p.saveScopedTask(tasks[1],{...tasks[1].meta,title:'One exception'},'Own notes','single');assert.equal(core.decode(files.get(tasks[1].file.path)).meta.recurrenceException,true);
});
test('future series edits split the rule and preserve completed, skipped and individual exceptions',()=>{
 const tasks=seriesFixture(),selected=tasks[1];tasks[2].meta.status='progress';tasks[2].meta.custom=42;tasks[2].body='Template\n- [x] Agenda\n';tasks[3].meta.status='done';tasks[4].meta.recurrenceException=true;tasks[5].meta.archived=true;tasks[5].meta.recurrenceSkipped=true;
 const rule={...tasks[0].meta.recurrence,start:'2026-11-20',time:'10:00',durationMinutes:45};const data={...selected.meta,title:'New meeting',scheduledTime:'10:00',durationMinutes:45};
 const changes=core.seriesPlan(tasks,selected,data,'New notes\n- [ ] Agenda\n',rule,'revision','2026-11-13');assert.equal(changes.length,3);
 const source=changes.find(c=>c.task===tasks[0]),next=changes.find(c=>c.task===selected),future=changes.find(c=>c.task===tasks[2]);assert.equal(source.meta.recurrence.until,'2026-11-19');assert.equal(next.meta.recurrenceSeries,undefined);assert.equal(next.meta.recurrence.revision,'revision');assert.equal(next.meta.id,selected.meta.id);assert.equal(next.meta.recurrence.skipped.length,3);
 assert.equal(future.meta.status,'progress');assert.equal(future.meta.custom,42);assert.equal(future.meta.title,'New meeting');assert.equal(future.meta.scheduledTime,'10:00');assert.ok(future.body.includes('- [x] Agenda'));assert.ok(future.body.startsWith('New notes'));
});
test('changed cadence retires unmatched pending instances and uses a new generation revision',()=>{
 const tasks=seriesFixture(),rule={...tasks[0].meta.recurrence,interval:2};const changes=core.seriesPlan(tasks,tasks[0],tasks[0].meta,tasks[0].body,rule,'new','2026-11-13');
 assert.equal(changes.filter(c=>c.meta.recurrenceSuperseded).length,3);const retained=changes.find(c=>c.task===tasks[2]);assert.equal(retained.meta.recurrenceRevision,'new');assert.equal(retained.meta.archived,undefined);
 const source=changes.find(c=>c.task===tasks[0]);const occurrence=core.recurrenceOccurrence(source,'2026-11-27');assert.ok(occurrence.meta.id.includes('--new--'));assert.notEqual(core.recurrenceKey(occurrence.meta),core.recurrenceKey(tasks[2].meta));
});
test('skipping source or child preserves recurrence and never fabricates a completion',async()=>{
 const tasks=seriesFixture(),{p,files}=memoryPlugin(tasks);p.scan=async()=>{};
 for(const task of [tasks[0],tasks[1]]){await p.skipOccurrence(task);const saved=core.decode(files.get(task.file.path));assert.equal(saved.meta.archived,true);assert.equal(saved.meta.recurrenceSkipped,true);assert.equal(saved.meta.completed,undefined);assert.equal(saved.meta.status,'open');}
 const source=core.decode(files.get(tasks[0].file.path));assert.equal(source.meta.recurrence.enabled,undefined);assert.equal(core.recurrenceOccurrence(source,'2026-11-27').meta.recurrenceSkipped,undefined);
});
test('future edit rolls back previously written files on a later failure',async()=>{
 const tasks=seriesFixture(core.today()),{p,files}=memoryPlugin(tasks),before=new Map(files);p.scan=async()=>{};const process=p.app.vault.process;let writes=0;p.app.vault.process=async(f,fn)=>{writes++;if(writes===2)throw new Error('simulated disk error');return process(f,fn)};
 await assert.rejects(()=>p.saveScopedTask(tasks[1],{...tasks[1].meta,title:'New'},'New notes','future',{...tasks[0].meta.recurrence,start:core.shiftDay(core.today(),7)}),/disk error/);for(const [path,raw]of before)assert.equal(files.get(path),raw);assert.equal(p.seriesEditing,false);
});
test('future edit rejects stale editor source and leaves every file unchanged',async()=>{
 const tasks=seriesFixture(core.today()),{p,files}=memoryPlugin(tasks);p.scan=async()=>{};files.set(tasks[0].file.path,core.encode({...tasks[0].meta,title:'External edit'},tasks[0].body));const before=new Map(files);
 await assert.rejects(()=>p.saveScopedTask(tasks[1],tasks[1].meta,tasks[1].body,'future',{...tasks[0].meta.recurrence,start:core.shiftDay(core.today(),7)},tasks[0]),/Serie wurde zwischenzeitlich/);for(const [path,raw]of before)assert.equal(files.get(path),raw);
});
test('full future edit and subsequent scans generate exactly one occurrence per new date',async()=>{
 const tasks=seriesFixture(core.today()),{p,files}=memoryPlugin(tasks),rule={...tasks[0].meta.recurrence,interval:2,time:'10:00'};
 await p.saveScopedTask(tasks[0],{...tasks[0].meta,title:'Updated',scheduledTime:'10:00'},'Updated notes','future',rule,tasks[0]);const size=files.size;await p.scan();assert.equal(files.size,size);
 const active=p.tasks.filter(t=>!t.meta.archived),dates=active.map(t=>t.meta.scheduled);assert.equal(active.length,3);assert.equal(new Set(dates).size,3);assert.ok(active.every(t=>t.meta.title==='Updated'));
});
test('ending a series retires pending future occurrences while retaining completed history',()=>{
 const tasks=seriesFixture();tasks[3].meta.status='done';const rule={...tasks[0].meta.recurrence,enabled:false,start:'2026-11-20'};
 const changes=core.seriesPlan(tasks,tasks[1],tasks[1].meta,tasks[1].body,rule,'stop','2026-11-13');assert.equal(changes.filter(c=>c.meta.recurrenceSuperseded).length,3);assert.ok(!changes.some(c=>c.task===tasks[3]));assert.equal(changes.find(c=>c.task===tasks[1]).meta.recurrence.enabled,false);
});
test('series revision identifiers cannot escape the task directory and skipped dates are validated',()=>{
 const rule={frequency:'weekly',interval:1,start:'2026-11-13'};assert.throws(()=>core.validateRecurrence({...rule,revision:'../../outside'}));assert.throws(()=>core.validateRecurrence({...rule,skipped:['bad']}));assert.throws(()=>core.validateRecurrence({...rule,skipped:'2026-11-20'}));assert.equal(core.recurrenceDates({...rule,until:'2026-11-27',skipped:['2026-11-20']},'2026-11-13').length,1);
});
test('repeated series splits keep generated filenames bounded and prune obsolete skips',()=>{
 const tasks=seriesFixture(),rule={...tasks[0].meta.recurrence,revision:'a'.repeat(36),skipped:['2026-11-20','2026-12-04']};const source={meta:{...tasks[0].meta,id:'old-'.repeat(80),recurrence:rule},body:tasks[0].body};const occurrence=core.recurrenceOccurrence(source,'2026-11-27');assert.ok(occurrence.meta.id.length<100);
 const changes=core.seriesPlan(tasks,tasks[2],tasks[2].meta,tasks[2].body,{...rule,start:'2026-11-27'},'new','2026-11-13');const next=changes.find(c=>c.task===tasks[2]);assert.equal(JSON.stringify(next.meta.recurrence.skipped),JSON.stringify(['2026-12-04']));
});
test('monthly series split at a clamped February occurrence retains the original 31st',()=>{
 const source={file:{path:'Tasks/month.md'},meta:{taskflow:1,id:'month',title:'Monthly',status:'open',priority:'normal',tags:[],scheduled:'2027-01-31',recurrence:{frequency:'monthly',interval:1,start:'2027-01-31',until:'2027-05-31'}},body:''};const selected={file:{path:'Tasks/feb.md'},...core.recurrenceOccurrence(source,'2027-02-28')};
 const changes=core.seriesPlan([source,selected],selected,selected.meta,'',{...source.meta.recurrence,start:'2027-02-28'},'next','2027-02-28');const next=changes.find(c=>c.task===selected);assert.equal(next.meta.recurrence.monthDay,31);assert.equal(JSON.stringify(core.recurrenceDates(next.meta.recurrence,'2027-03-02')),JSON.stringify(['2027-03-31','2027-04-30','2027-05-31']));assert.throws(()=>core.validateRecurrence({...next.meta.recurrence,monthDay:32}));
});
