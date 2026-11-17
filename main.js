/* TaskFlow — editable source and release entry point. No build step required. */
const {Plugin, ItemView, Modal, Notice, PluginSettingTab, parseYaml, stringifyYaml, normalizePath, setIcon} = require('obsidian');
const VIEW = 'taskflow-board';
const STATES=translatedLabels({open:'Offen', progress:'In Arbeit', delayed:'Verzögert', done:'Erledigt'});
const PRIORITIES=translatedLabels({high:'Hoch',normal:'Normal',low:'Niedrig'});
const localDay=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const today=()=>localDay(new Date());
function completionDay(value){if(!value)return '';const d=new Date(value);return Number.isNaN(d.getTime())?'':localDay(d);}
function duePresentation(task){
  if(task.meta.status==='done')return {kind:'closed',label:tr('Abgeschlossen')};
  const due=dateValue(task.meta.due);
  if(!due)return {kind:'none',label:tr('Kein Termin')};
  if(due<today())return {kind:'late',label:tr('Überfällig · ')+due};
  if(due===today())return {kind:'today',label:tr('Heute · ')+due};
  return {kind:'future',label:due};
}
function moveFrames(from,to,shadow){
  const dx=from.left-to.left,dy=from.top-to.top;
  return [{transform:`translate(${dx}px, ${dy}px) scale(1)`},{transform:`translate(${dx*.45}px, ${dy*.45-12}px) scale(1.025)`,boxShadow:shadow,offset:.52},{transform:'translate(0, 0) scale(1)'}];
}
// Calendar-day aggregation keeps DST changes and the selected local day consistent.
function calendarDays(count,now=new Date()){
  const days=[];
  for(let i=count-1;i>=0;i--){const date=new Date(now);date.setHours(12,0,0,0);date.setDate(date.getDate()-i);days.push({key:localDay(date),count:0});}
  return days;
}
function analytics(tasks,period=14,now=new Date()){
  const days=calendarDays(period,now),byDay=new Map(days.map(d=>[d.key,d]));
  const summary=summarize(tasks),current=localDay(now),soon=new Date(now);soon.setDate(soon.getDate()+7);
  const due={late:0,today:0,week:0,later:0,none:0},priority={high:0,normal:0,low:0},tags=new Map();let missingCompletion=0;
  for(const task of tasks){
    const done=task.meta.status==='done';
    if(done){const day=completionDay(task.meta.completed);if(!day)missingCompletion++;if(byDay.has(day))byDay.get(day).count++;}
    else{
      const date=dateValue(task.meta.due);
      if(!date)due.none++;else if(date<current)due.late++;else if(date===current)due.today++;else if(date<=localDay(soon))due.week++;else due.later++;
      priority[Object.hasOwn(PRIORITIES,task.meta.priority)?task.meta.priority:'normal']++;
    }
    for(const tag of new Set(task.meta.tags||[])){
      if(!tags.has(tag))tags.set(tag,{tag,total:0,done:0});const row=tags.get(tag);row.total++;if(done)row.done++;
    }
  }
  summary.overdue=due.late;
  // Long ranges use seven-day bins, retaining every day including a final partial week.
  const step=period>30?7:1,bins=[];
  for(let i=0;i<days.length;i+=step){const group=days.slice(i,i+step);bins.push({start:group[0].key,end:group[group.length-1].key,count:group.reduce((s,d)=>s+d.count,0)});}
  return {summary,active:summary.total-summary.done,rate:summary.total?Math.round(summary.done/summary.total*100):0,days,bins,completed:days.reduce((s,d)=>s+d.count,0),due,priority,missingCompletion,tags:[...tags.values()].sort((a,b)=>b.total-a.total||a.tag.localeCompare(b.tag))};
}
const DUE_FILTERS=translatedLabels({'':'Alle Termine',overdue:'Überfällig',today:'Heute',week:'Nächste 7 Tage',none:'Ohne Termin'});
function searchText(value){return String(value).normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase().replace(/ß/g,'ss');}
function filterTasks(tasks,filters={},reference=today(),index=new WeakMap()){
  const terms=searchText(filters.query||'').trim().split(/\s+/).filter(Boolean),end=shiftDay(reference,6);
  return tasks.filter(task=>{
    const meta=task.meta,priority=Object.hasOwn(PRIORITIES,meta.priority)?meta.priority:'normal';
    if(filters.tag&&!(meta.tags||[]).includes(filters.tag)||filters.status&&meta.status!==filters.status||filters.priority&&priority!==filters.priority)return false;
    if(filters.project&&(filters.project==='__none__'?!!meta.taskflowProject:meta.taskflowProject!==filters.project))return false;
    const date=dateValue(meta.due),due=validDay(date)?date:'';
    if(filters.due==='overdue'&&(!due||due>=reference||meta.status==='done')||filters.due==='today'&&due!==reference||filters.due==='week'&&(!due||due<reference||due>end)||filters.due==='none'&&due)return false;
    if(!terms.length)return true;
    let text=index.get(task);
    if(text===undefined){text=searchText([meta.title,task.body,(meta.tags||[]).map(tag=>'#'+tag).join(' '),dateValue(meta.due),dateValue(meta.scheduled)].join(' '));index.set(task,text);}
    return terms.every(term=>text.includes(term));
  });
}
function filterSnapshot(values={}){
  return {project:typeof values.project==='string'?values.project:'',query:typeof values.query==='string'?values.query:'',tag:typeof values.tag==='string'?values.tag:'',status:Object.hasOwn(STATES,values.status)?values.status:'',priority:Object.hasOwn(PRIORITIES,values.priority)?values.priority:'',due:Object.hasOwn(DUE_FILTERS,values.due)?values.due:''};
}
function savedFilters(settings){return Array.isArray(settings.savedFilters)?settings.savedFilters.filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string'&&p.name.trim()).map(p=>({...p,filters:filterSnapshot(p.filters)})):[];}
// Project IDs remain stable across renames; foreign `projects` metadata is untouched.
function projects(settings){
  const seen=new Set();return (Array.isArray(settings.projects)?settings.projects:[]).filter(p=>p&&typeof p.id==='string'&&p.id&&typeof p.name==='string'&&p.name.trim()&&!seen.has(p.id)&&seen.add(p.id)).map(p=>({...p,name:p.name.trim(),description:typeof p.description==='string'?p.description:'',note:typeof p.note==='string'?p.note:'',archived:!!p.archived}));
}
function projectTasks(tasks,id){return tasks.filter(t=>t.meta.taskflowProject===id&&!t.meta.trashed&&!t.meta.recurrenceSkipped&&!t.meta.recurrenceSuperseded&&(!t.meta.archived||t.meta.status==='done'));}
function projectSummary(tasks,id){const list=projectTasks(tasks,id),done=list.filter(t=>t.meta.status==='done').length;return {total:list.length,done,active:list.length-done,overdue:list.filter(overdue).length,percent:list.length?Math.round(done/list.length*100):0};}
function projectInput(data,existing,id){
  const name=String(data.name||'').trim(),description=String(data.description||'').trim(),note=String(data.note||'').trim();
  if(!name||name.length>80)throw new Error('Bitte einen Projektnamen mit 1–80 Zeichen eingeben.');
  if(existing.some(p=>p.id!==id&&searchText(p.name)===searchText(name)))throw new Error('Ein Projekt mit diesem Namen existiert bereits.');
  if(description.length>2000||note.length>500)throw new Error('Beschreibung oder Notizlink ist zu lang.');
  if(note&&(/^[a-z][a-z0-9+.-]*:/i.test(note)||note.startsWith('/')||note.split('/').includes('..')))throw new Error('Bitte einen relativen Notizpfad im Vault verwenden.');
  return {name,description,note,archived:!!data.archived};
}
const NAVIGATION={board:'Board',planner:'Tagesplaner',stats:'Statistik',archive:'Archiv',tags:'Tags',favorites:'Filterfavoriten'};
function hiddenNavigation(settings){return Array.isArray(settings.hiddenNavigation)?settings.hiddenNavigation.filter(key=>Object.hasOwn(NAVIGATION,key)):[];}
function startView(settings){const value=settings.preferences?.startView||settings.startView;return ['home','board','planner','stats','projects'].includes(value)?value:'home';}
const HOME_DESTINATIONS={
  settings:{label:'Settings',icon:'settings',description:'Design & Schrift'},
  projects:{label:'Projekte',icon:'folder-kanban',description:'Aufgaben bündeln und Fortschritt sehen',mode:'projects'},
  board:{label:'Board',icon:'kanban-square',description:'Einzelaufgaben im Überblick',mode:'board'},
  planner:{label:'Tagesplaner',icon:'list-todo',description:'Den Arbeitstag planen',mode:'planner'},
  calendar:{label:'Kalender',icon:'calendar-days',description:'Termine und Zeitblöcke',mode:'planner',plannerMode:'calendar'},
  series:{label:'Wiederholtermine',icon:'repeat',description:'Serien zentral bearbeiten',mode:'board',boardMode:'series'},
  stats:{label:'Statistik',icon:'chart-column',description:'Abschlüsse und Fortschritt',mode:'stats'},
  archive:{label:'Archiv',icon:'archive',description:'Erledigtes wiederfinden',mode:'board',showArchive:true},
  trash:{label:'Papierkorb',icon:'trash-2',description:'Wiederherstellen und verwalten',mode:'board',showArchive:true,archiveMode:'trash'}
};
function homeDestination(key){
  if(!Object.hasOwn(HOME_DESTINATIONS,key))throw new Error('Unbekannter Schnellzugriff.');
  const {mode,boardMode='tasks',plannerMode='agenda',showArchive=false,archiveMode='tasks'}=HOME_DESTINATIONS[key];
  return {mode,boardMode,plannerMode,showArchive,archiveMode};
}
function canCreateTasks(mode,archive=false){return mode==='board'&&!archive;}
function isSeriesTask(task){return !!(task.meta.recurrence||task.meta.recurrenceSeries);}
function trashPlan(tasks,selected,scope,batch,deletedAt){
  if(selected.meta.trashed)throw new Error('Diese Aufgabe liegt bereits im Papierkorb.');
  const seriesId=selected.meta.recurrence?selected.meta.id:selected.meta.recurrenceSeries;
  if(selected.meta.recurrence&&scope!=='series')throw new Error('Der erste Termin enthält die Serienregel. Bitte die ganze Serie löschen.');
  if(scope==='series'&&!seriesId)throw new Error('Die Serienkennung fehlt.');
  const targets=scope==='series'?tasks.filter(t=>!t.meta.trashed&&(t.meta.id===seriesId||t.meta.recurrenceSeries===seriesId)):[selected];
  const changes=targets.map(task=>({task,meta:{...structuredClone(task.meta),trashed:true,taskflowTrash:{batch,scope,deletedAt}},body:task.body}));
  if(scope!=='series'&&selected.meta.recurrenceSeries){
    const source=tasks.find(t=>t.meta.id===seriesId&&t.meta.recurrence),day=dateValue(selected.meta.recurrenceDate);
    if(source&&validDay(day)&&!(source.meta.recurrence.skipped||[]).map(dateValue).includes(day)){
      const meta=structuredClone(source.meta);meta.recurrence.skipped=[...(meta.recurrence.skipped||[]),day];
      changes.push({task:source,meta,body:source.body});changes[0].meta.taskflowTrash.skipAdded=true;
    }
  }
  return changes;
}
function restoreTrashPlan(tasks,selected){
  if(!selected.meta.trashed)throw new Error('Diese Aufgabe liegt nicht mehr im Papierkorb.');
  const info=selected.meta.taskflowTrash||{},targets=info.scope==='series'&&info.batch?tasks.filter(t=>t.meta.trashed&&t.meta.taskflowTrash?.batch===info.batch):[selected];
  const changes=targets.map(task=>{const meta=structuredClone(task.meta);delete meta.trashed;delete meta.taskflowTrash;return {task,meta,body:task.body};});
  if(info.skipAdded){
    const day=dateValue(selected.meta.recurrenceDate),source=tasks.find(t=>t.meta.id===selected.meta.recurrenceSeries&&t.meta.recurrence);
    if(source&&!tasks.some(t=>t.file.path!==selected.file.path&&t.meta.trashed&&t.meta.recurrenceSeries===selected.meta.recurrenceSeries&&dateValue(t.meta.recurrenceDate)===day)){
      const meta=structuredClone(source.meta);meta.recurrence.skipped=(meta.recurrence.skipped||[]).filter(value=>dateValue(value)!==day);changes.push({task:source,meta,body:source.body});
    }
  }
  return changes;
}
function trashGroups(tasks){
  const groups=new Map();for(const task of tasks.filter(t=>t.meta.trashed)){const info=task.meta.taskflowTrash||{},key=info.scope==='series'&&info.batch?info.batch:task.file.path;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(task);}
  return [...groups.values()].map(items=>({task:items.find(t=>t.meta.recurrence)||items[0],count:items.length}));
}
function seriesOverview(tasks,reference=today()){
  tasks=tasks.filter(t=>!t.meta.trashed);
  const groups=new Map();
  for(const task of tasks)if(task.meta.recurrence&&task.meta.id)groups.set(task.meta.id,{id:task.meta.id,source:task,terms:[task]});
  for(const task of tasks){if(task.meta.recurrence||!task.meta.recurrenceSeries)continue;const id=task.meta.recurrenceSeries;if(!groups.has(id))groups.set(id,{id,source:null,terms:[]});groups.get(id).terms.push(task);}
  return [...groups.values()].map(group=>{
    const day=t=>dateValue(t.meta.scheduled)||dateValue(t.meta.due)||dateValue(t.meta.recurrenceDate);
    group.terms.sort((a,b)=>(day(a)||'9999').localeCompare(day(b)||'9999')||a.file.path.localeCompare(b.file.path));
    const upcoming=group.terms.filter(t=>!t.meta.archived&&t.meta.status!=='done'&&!t.meta.recurrenceSuperseded&&validDay(day(t))&&day(t)>=reference);
    const rule=group.source?.meta.recurrence;
    return {...group,title:(group.source||group.terms[0]).meta.title,next:upcoming[0]||null,editTask:upcoming.find(t=>!t.meta.recurrenceException)||group.source||null,state:!rule?'Quelle fehlt':rule.enabled===false?'Pausiert':rule.until&&rule.until<reference?'Beendet':'Aktiv',open:group.terms.filter(t=>!t.meta.archived&&t.meta.status!=='done').length};
  }).sort((a,b)=>a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
}
// Keep the files and generation intact; only ordinary active task lists hide series.
function tasksForView(tasks,mode,plannerMode='agenda',archive=false){
  if(tasks.some(t=>t.meta.trashed))tasks=tasks.filter(t=>!t.meta.trashed);
  return !archive&&(mode==='board'||mode==='planner'&&plannerMode!=='calendar')?tasks.filter(task=>!isSeriesTask(task)):tasks;
}
// A read-only projection: neither visiting home nor choosing a section schedules tasks.
function homeOverview(tasks,reference=today()){
  const active=tasks.filter(t=>!t.meta.trashed&&!t.meta.archived&&t.meta.status!=='done'),end=shiftDay(reference,7);
  const day=value=>{const d=dateValue(value);return validDay(d)?d:'';};
  const compare=(a,b)=>a.meta.title.localeCompare(b.meta.title)||String(a.file?.path||a.meta.id||'').localeCompare(String(b.file?.path||b.meta.id||''));
  const current=active.filter(t=>day(t.meta.scheduled)===reference||day(t.meta.due)===reference).sort((a,b)=>{
    const time=t=>day(t.meta.scheduled)===reference&&timeMinutes(t.meta.scheduledTime)!==null?t.meta.scheduledTime:'99:99';
    return time(a).localeCompare(time(b))||compare(a,b);
  });
  const late=active.filter(t=>day(t.meta.due)&&day(t.meta.due)<reference).sort((a,b)=>day(a.meta.due).localeCompare(day(b.meta.due))||compare(a,b));
  const next=active.flatMap(task=>{
    const dates=[day(task.meta.due),day(task.meta.scheduled)].filter(d=>d>reference&&d<=end).sort();
    return dates.length?[{task,day:dates[0]}]:[];
  }).sort((a,b)=>a.day.localeCompare(b.day)||compare(a.task,b.task)).map(row=>row.task);
  const inbox=active.filter(t=>!day(t.meta.scheduled)).sort(compare);
  return {today:current,overdue:late,upcoming:next,inbox,active:active.length};
}
// Daily cohort includes archived completions; each file counts once even with two matching dates.
function dailyInsight(tasks,reference=today()){
  const eligible=tasks.filter(t=>!t.meta.trashed&&!t.meta.recurrenceSkipped&&!t.meta.recurrenceSuperseded&&(!t.meta.archived||t.meta.status==='done'));
  const completed=t=>t.meta.status==='done'?completionDay(t.meta.completed):'';
  const cohort=eligible.filter(t=>dateValue(t.meta.scheduled)===reference||dateValue(t.meta.due)===reference||completed(t)===reference),summary=summarize(cohort);
  const days=calendarDays(7,new Date(reference+'T12:00:00')),byDay=new Map(days.map(d=>[d.key,d]));
  for(const task of eligible){const day=completed(task);if(byDay.has(day))byDay.get(day).count++;}
  const timed=eligible.filter(t=>dateValue(t.meta.scheduled)===reference&&timeMinutes(t.meta.scheduledTime)!==null);
  return {summary,percent:summary.total?Math.round(summary.done/summary.total*100):0,completedToday:eligible.filter(t=>completed(t)===reference).length,remaining:summary.total-summary.done,timed:timed.length,plannedMinutes:timed.reduce((sum,t)=>sum+durationMinutes(t.meta),0),days};
}
function filterName(value,presets,id=''){
  const name=String(value).trim();if(!name||name.length>80)throw new Error('Bitte einen Filternamen mit 1–80 Zeichen eingeben.');
  if(presets.some(p=>p.id!==id&&searchText(p.name)===searchText(name)))throw new Error('Dieser Filtername ist bereits vergeben.');return name;
}
function svgElement(parent,name,attributes={}){
  const el=parent.ownerDocument.createElementNS('http://www.w3.org/2000/svg',name);
  for(const [key,value]of Object.entries(attributes))el.setAttribute(key,String(value));parent.appendChild(el);return el;
}
function dateValue(v) { return v instanceof Date ? (Number.isNaN(v.getTime())?'':v.toISOString().slice(0,10)) : typeof v === 'string' ? v.slice(0,10) : ''; }
function decode(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!m) throw new Error('TaskFlow-Metadaten fehlen.');
  const meta = parseYaml(m[1]);
  if (!meta || meta.taskflow !== 1) throw new Error('Keine TaskFlow-Aufgabe.');
  return {meta, body:raw.slice(m[0].length)};
}
const encode = (meta, body) => `---\n${stringifyYaml(meta).trimEnd()}\n---\n${body}`;
function overdue(t) { return t.meta.status !== 'done' && !!dateValue(t.meta.due) && dateValue(t.meta.due) < today(); }
function summarize(tasks) {
  const s = {total:tasks.length, open:0, progress:0, delayed:0, done:0, overdue:0};
  for (const t of tasks) { s[Object.hasOwn(STATES,t.meta.status) ? t.meta.status : 'open']++; if(overdue(t)) s.overdue++; }
  return s;
}
// Only actual Markdown task lines are editable; fenced examples remain literal text.
function mapTaskLines(body,transform){
  let fence=null;
  return body.split(/(\r?\n)/).map((line,index)=>{
    if(index%2)return line;
    const mark=line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if(fence){if(mark&&mark[1][0]===fence.char&&mark[1].length>=fence.length&&!mark[2].trim())fence=null;return line;}
    if(mark){fence={char:mark[1][0],length:mark[1].length};return line;}
    return transform(line);
  }).join('');
}
function subtasks(body){const result=[];mapTaskLines(body,line=>{const match=line.match(/^[ \t]*[-*+] \[([ xX])\] (.*)$/);if(match)result.push(match);return line;});return result;}
function toggleSubtask(body,index){let n=0;return mapTaskLines(body,line=>line.replace(/^([ \t]*[-*+] \[)([ xX])(\] .*)$/,(all,a,b,c)=>n++===index?a+(b===' '?'x':' ')+c:all));}
// Keep original checkbox locations and formatting unless the note text is edited.
function editorSubtasks(body){
  const items=[];
  let notes=mapTaskLines(body,line=>line.replace(/^([ \t]*[-*+] \[)([ xX])(\] )([^\r\n]*)(\r?)$/,(raw,prefix,mark,suffix,text,cr)=>{items.push({id:items.length,text,done:mark!==' ',prefix,mark,suffix,cr,raw});return '';}));
  notes=notes.replace(/^##[ \t]+Teilaufgaben[ \t]*\r?\n(?=[ \t\r\n]*$)/m,'');
  return {notes,items};
}
function editorBody(original,notes,items){
  const parsed=editorSubtasks(original),kept=new Map(items.filter(x=>x.id!==null).map(x=>[x.id,x]));
  const line=item=>'- ['+(item.done?'x':' ')+'] '+item.text.trim();
  let body,extra;
  if(notes.replace(/\r\n/g,'\n')===parsed.notes.replace(/\r\n/g,'\n')){let index=0;body=mapTaskLines(original,line=>line.replace(/^([ \t]*[-*+] \[)([ xX])(\] )([^\r\n]*)(\r?)$/,(raw,prefix,mark,suffix,text,cr)=>{const item=kept.get(index++);if(!item)return '';if(item.text===text&&item.done===(mark!==' '))return raw;return prefix+(item.done?(mark==='X'?'X':'x'):' ')+suffix+item.text.trim()+cr;}));extra=items.filter(x=>x.id===null);}
  else{body=notes;extra=items;}
  if(extra.length){body=body.trimEnd()+'\n\n'+(/^##[ \t]+Teilaufgaben[ \t]*$/m.test(body)?'':'## Teilaufgaben\n\n')+extra.map(line).join('\n')+'\n';}
  return body;
}
function noteField(body){
  const parsed=editorSubtasks(body),heading=parsed.notes.match(/^##[ \t]+Notizen[ \t]*\r?\n(?:\r?\n)?/);
  const prefix=heading?heading[0]:'';
  return {notes:parsed.notes,prefix,value:parsed.notes.slice(prefix.length).trimEnd()};
}
function patchNoteBody(body,expectedNotes,newNotes){
  const parsed=editorSubtasks(body),normalize=value=>value.replace(/\r\n/g,'\n');
  if(normalize(parsed.notes)!==normalize(expectedNotes))throw new Error('Die Notiz wurde zwischenzeitlich geändert. Bitte prüfe die aktuelle Notiz im Editor. Dein Entwurf bleibt im Textfeld erhalten.');
  return editorBody(body,newNotes,parsed.items);
}
function validDay(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(value+'T12:00:00');return !Number.isNaN(date.getTime())&&localDay(date)===value;
}
function shiftDay(value,offset){const date=new Date(value+'T12:00:00');date.setDate(date.getDate()+offset);return localDay(date);}
function plannerWeek(value,first=1){const date=new Date(value+'T12:00:00'),monday=shiftDay(value,-((date.getDay()-first+7)%7));return Array.from({length:7},(_,i)=>shiftDay(monday,i));}
function timeMinutes(value){if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))return null;return Number(value.slice(0,2))*60+Number(value.slice(3));}
function durationMinutes(meta){const n=Number(meta.durationMinutes);return Number.isInteger(n)&&n>=5&&n<=720?n:30;}
function clockTime(minutes){return String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');}
function validatePlanning(meta){
  if(meta.due&&!validDay(dateValue(meta.due)))throw new Error('Bitte ein gültiges Fälligkeitsdatum eingeben.');
  const day=dateValue(meta.scheduled);
  if(meta.scheduled&&!validDay(day))throw new Error('Bitte ein gültiges Planungsdatum eingeben.');
  if(meta.scheduledTime){const start=timeMinutes(meta.scheduledTime);if(!day||start===null)throw new Error('Eine Startzeit benötigt ein Planungsdatum und die Form HH:MM.');if(start+durationMinutes(meta)>1440)throw new Error('Der Zeitblock muss innerhalb eines Tages enden. Bitte Startzeit oder Dauer anpassen.');}
  if(meta.durationMinutes!==undefined&&(!Number.isInteger(Number(meta.durationMinutes))||Number(meta.durationMinutes)<5||Number(meta.durationMinutes)>720))throw new Error('Die Dauer muss zwischen 5 und 720 ganzen Minuten liegen.');
}
function assignDay(meta,day){
  if(day&&!validDay(day))throw new Error('Ungültiges Planungsdatum.');
  if(day)meta.scheduled=day;else{delete meta.scheduled;delete meta.scheduledTime;}
}
function dayPlan(tasks,day){
  const planned=tasks.filter(t=>!t.meta.archived&&dateValue(t.meta.scheduled)===day);
  const timed=planned.filter(t=>timeMinutes(t.meta.scheduledTime)!==null).sort((a,b)=>timeMinutes(a.meta.scheduledTime)-timeMinutes(b.meta.scheduledTime)||a.meta.title.localeCompare(b.meta.title));
  const flexible=planned.filter(t=>timeMinutes(t.meta.scheduledTime)===null);
  const conflicts=new Set();
  for(let i=0;i<timed.length;i++){if(timed[i].meta.status==='done')continue;const end=timeMinutes(timed[i].meta.scheduledTime)+durationMinutes(timed[i].meta);for(let j=i+1;j<timed.length&&timeMinutes(timed[j].meta.scheduledTime)<end;j++){if(timed[j].meta.status!=='done'){conflicts.add(timed[i].file.path);conflicts.add(timed[j].file.path);}}}
  const pool=tasks.filter(t=>!t.meta.archived&&t.meta.status!=='done'&&dateValue(t.meta.scheduled)!==day).sort((a,b)=>(dateValue(a.meta.scheduled)||dateValue(a.meta.due)||'9999').localeCompare(dateValue(b.meta.scheduled)||dateValue(b.meta.due)||'9999'));
  return {planned,timed,flexible,pool,conflicts,done:planned.filter(t=>t.meta.status==='done').length,minutes:planned.reduce((sum,t)=>sum+durationMinutes(t.meta),0)};
}
const CALENDAR_PIXELS_PER_MINUTE=1.4;
function calendarDropMinute(clientY,columnTop,start,offset=0){return Math.max(0,Math.round(((clientY-columnTop)/CALENDAR_PIXELS_PER_MINUTE+start-offset)/15)*15);}
function calendarMove(meta,day,start){
  if(!validDay(day))throw new Error('Bitte einen gültigen Kalendertag wählen.');
  if(start!==null&&(!Number.isInteger(start)||start<0||start+durationMinutes(meta)>1440))throw new Error('Der Zeitblock passt nicht in diesen Tag. Bitte eine frühere Uhrzeit wählen.');
  assignDay(meta,day);if(start===null)delete meta.scheduledTime;else meta.scheduledTime=clockTime(start);validatePlanning(meta);
}
// Project deadlines into the calendar without writing planning metadata to task files.
function calendarTasks(tasks){
  return tasks.flatMap(task=>{
    if(task.meta.archived||task.meta.trashed)return [];
    if(validDay(dateValue(task.meta.scheduled)))return [task];
    const due=dateValue(task.meta.due);
    if(!['open','progress'].includes(task.meta.status)||!validDay(due))return [];
    const meta={...task.meta,scheduled:due};delete meta.scheduledTime;
    return [{...task,meta,calendarAutomatic:true,originalTask:task}];
  });
}
function calendarEvents(tasks,day){
  const timed=tasks.filter(t=>!t.meta.archived&&dateValue(t.meta.scheduled)===day&&timeMinutes(t.meta.scheduledTime)!==null).map(task=>({task,start:timeMinutes(task.meta.scheduledTime),duration:durationMinutes(task.meta)})).sort((a,b)=>a.start-b.start||b.duration-a.duration||a.task.file.path.localeCompare(b.task.file.path));
  const result=[];let group=[],ends=[],groupEnd=-1;
  const flush=()=>{for(const event of group){event.columns=ends.length;result.push(event);}group=[];ends=[];groupEnd=-1;};
  for(const event of timed){
    if(group.length&&event.start>=groupEnd)flush();
    let lane=ends.findIndex(end=>end<=event.start);if(lane<0)lane=ends.length;
    event.lane=lane;event.displayDuration=Math.max(30,event.duration);ends[lane]=event.start+event.displayDuration;groupEnd=Math.max(groupEnd,ends[lane]);group.push(event);
  }
  flush();return result;
}
function calendarBounds(tasks,days,options={}){
  const p=preferences({preferences:options});let start=p.calendarStart*60,end=p.calendarEnd*60;
  for(const task of tasks){const minute=timeMinutes(task.meta.scheduledTime);if(!task.meta.archived&&days.includes(dateValue(task.meta.scheduled))&&minute!==null){start=Math.min(start,Math.floor(minute/60)*60);end=Math.max(end,Math.min(1440,Math.ceil((minute+Math.max(30,durationMinutes(task.meta)))/60)*60));}}
  return {start,end};
}
const RECURRENCES=translatedLabels({daily:'Täglich',weekly:'Wöchentlich',monthly:'Monatlich'});
function validateRecurrence(rule){
  if(!rule||rule.enabled===false)return;
  if(rule.monthDay!==undefined&&(!Number.isInteger(rule.monthDay)||rule.monthDay<1||rule.monthDay>31))throw new Error('Bitte einen Monatstag von 1 bis 31 wählen.');
  if(rule.revision!==undefined&&(typeof rule.revision!=='string'||!/^[a-zA-Z0-9_-]+$/.test(rule.revision)))throw new Error('Ungültige Serienkennung.');
  if(rule.skipped!==undefined&&(!Array.isArray(rule.skipped)||rule.skipped.some(day=>!validDay(dateValue(day)))))throw new Error('Ungültige Ausnahmen der Serie.');
  if(!Object.hasOwn(RECURRENCES,rule.frequency)||!Number.isInteger(rule.interval)||rule.interval<1||rule.interval>365)throw new Error('Bitte einen gültigen Wiederholungsrhythmus wählen (1–365).');
  if(!validDay(rule.start)||rule.until&&(!validDay(rule.until)||rule.until<rule.start))throw new Error('Bitte gültige Seriendaten eingeben; das Ende darf nicht vor dem ersten Termin liegen.');
  validatePlanning({scheduled:rule.start,scheduledTime:rule.time||'',durationMinutes:rule.durationMinutes});
}
function recurrenceDates(rule,reference=today()){
  validateRecurrence(rule);if(!rule||rule.enabled===false)return [];
  const lower=shiftDay(reference,-30),upper=rule.until&&rule.until<shiftDay(reference,90)?rule.until:shiftDay(reference,90);
  if(upper<lower||rule.start>upper)return [];
  const start=new Date(rule.start+'T12:00:00'),low=new Date(lower+'T12:00:00');
  const step=rule.interval*(rule.frequency==='weekly'?7:1),monthly=rule.frequency==='monthly';
  const elapsed=monthly?(low.getFullYear()-start.getFullYear())*12+low.getMonth()-start.getMonth():Math.round((Date.UTC(low.getFullYear(),low.getMonth(),low.getDate())-Date.UTC(start.getFullYear(),start.getMonth(),start.getDate()))/86400000);
  let index=Math.max(1,Math.floor(elapsed/(monthly?rule.interval:step))-1);const result=[];
  for(;;index++){
    let date;
    if(monthly){const first=new Date(start.getFullYear(),start.getMonth()+index*rule.interval,1,12);const last=new Date(first.getFullYear(),first.getMonth()+1,0,12).getDate();first.setDate(Math.min(rule.monthDay||start.getDate(),last));date=localDay(first);}
    else date=shiftDay(rule.start,index*step);
    if(date>upper)break;if(date>=lower&&!(Array.isArray(rule.skipped)?rule.skipped.map(dateValue):[]).includes(date))result.push(date);
  }
  return result;
}
function recurrenceOccurrence(source,day){
  const rule=source.meta.recurrence,meta=structuredClone(source.meta);if(source.meta.recurrenceTemplate?.meta){Object.assign(meta,structuredClone(source.meta.recurrenceTemplate.meta));meta.taskflowProject=source.meta.recurrenceTemplate.meta.taskflowProject||'';}
  delete meta.trashed;delete meta.taskflowTrash;delete meta.recurrence;delete meta.completed;delete meta.archived;delete meta.updated;delete meta.recurrenceTemplate;delete meta.recurrenceException;delete meta.recurrenceSkipped;delete meta.recurrenceSuperseded;
  meta.id=(rule.revision?'tf--'+rule.revision:source.meta.id)+'--'+day;meta.recurrenceSeries=source.meta.id;meta.recurrenceDate=day;if(rule.revision)meta.recurrenceRevision=rule.revision;else delete meta.recurrenceRevision;
  meta.status='open';meta.due=day;meta.scheduled=day;meta.durationMinutes=rule.durationMinutes||30;
  if(rule.time)meta.scheduledTime=rule.time;else delete meta.scheduledTime;
  meta.created=new Date().toISOString();
  const body=mapTaskLines(typeof source.meta.recurrenceTemplate?.body==='string'?source.meta.recurrenceTemplate.body:source.body,line=>line.replace(/^([ \t]*[-*+] \[)[xX](\] )/,'$1 $2'));
  return {meta,body};
}
function recurrenceLabel(meta){
  if(meta.recurrenceSkipped)return tr('↻ Termin übersprungen');if(meta.recurrenceSuperseded)return tr('↻ Ersetzter Serientermin');
  if(meta.recurrence)return meta.recurrence.enabled===false?tr('↻ Serie pausiert'):'↻ '+(RECURRENCES[meta.recurrence.frequency]||tr('Serie'))+(meta.recurrence.interval>1?tr(' · alle ')+meta.recurrence.interval:'');
  return meta.recurrenceSeries?tr('↻ Serientermin'):'';
}
function recurrenceKey(meta){return meta.recurrenceSeries+'|'+(meta.recurrenceRevision||'')+'|'+dateValue(meta.recurrenceDate);}
function seriesSnapshot(task){return {meta:{title:task.meta.title,priority:task.meta.priority||'normal',taskflowProject:task.meta.taskflowProject||'',tags:structuredClone(task.meta.tags||[])},body:task.body};}
function protectOccurrence(meta,task){if(meta.recurrence&&!meta.recurrenceTemplate)meta.recurrenceTemplate=seriesSnapshot(task);if(meta.recurrence||meta.recurrenceSeries)meta.recurrenceException=true;}
function mergeSeriesBody(template,body){
  const completed=new Map();for(const sub of subtasks(body)){const key=sub[2].trim();if(!completed.has(key))completed.set(key,[]);completed.get(key).push(sub[1]!==' ');}
  return mapTaskLines(template,line=>line.replace(/^([ \t]*[-*+] \[)([ xX])(\] )(.*)$/,(all,a,mark,c,text)=>{const flags=completed.get(text.trim()),done=flags?.shift()||false;return a+(done?'x':' ')+c+text;}));
}
function seriesPlan(tasks,selected,data,body,rule,revision,reference=today()){
  const source=selected.meta.recurrence?selected:tasks.find(t=>t.meta.id===selected.meta.recurrenceSeries&&t.meta.recurrence);
  if(!source)throw new Error('Die ursprüngliche Serienaufgabe fehlt. Dieser Termin kann nur einzeln bearbeitet werden.');
  const boundary=dateValue(selected.meta.recurrenceDate)||source.meta.recurrence.start;
  if(!validDay(boundary)||!validDay(rule.start))throw new Error('Ungültiger Serientermin.');validateRecurrence(rule);
  const changes=[],next=structuredClone(data),nextRule={...structuredClone(rule),revision};
  if(nextRule.frequency==='monthly'&&!nextRule.monthDay)nextRule.monthDay=source.meta.recurrence.frequency==='monthly'?(source.meta.recurrence.monthDay||Number(source.meta.recurrence.start.slice(8,10))):Number(nextRule.start.slice(8,10));
  for(const key of ['recurrenceSeries','recurrenceDate','recurrenceRevision','recurrenceException','recurrenceTemplate','recurrenceSkipped','recurrenceSuperseded'])delete next[key];
  next.recurrence=nextRule;next.id=selected.meta.id;
  const following=tasks.filter(t=>t.file.path!==selected.file.path&&t.meta.recurrenceSeries===source.meta.id&&dateValue(t.meta.recurrenceDate)>=boundary&&!t.meta.recurrenceSuperseded);
  const protectedTasks=following.filter(t=>t.meta.status==='done'||t.meta.archived||t.meta.trashed||t.meta.recurrenceException||t.meta.recurrenceSkipped);
  nextRule.skipped=[...new Set([...(Array.isArray(rule.skipped)?rule.skipped.map(dateValue):[]),...protectedTasks.map(t=>dateValue(t.meta.recurrenceDate))])].filter(day=>validDay(day)&&day>nextRule.start);
  if(protectedTasks.some(t=>dateValue(t.meta.recurrenceDate)===nextRule.start))throw new Error('Am neuen ersten Termin existiert bereits ein geschützter Serientermin. Bitte ein anderes Datum wählen oder diesen einzeln bearbeiten.');
  if(source.file.path!==selected.file.path){const prior=structuredClone(source.meta),end=shiftDay(boundary,-1);prior.recurrence={...prior.recurrence,until:prior.recurrence.until&&prior.recurrence.until<end?prior.recurrence.until:end};if(end<prior.recurrence.start)prior.recurrence.enabled=false;changes.push({task:source,meta:prior,body:source.body});}
  changes.push({task:selected,meta:next,body});
  const dates=new Set(recurrenceDates(nextRule,reference));
  for(const task of following){
    if(protectedTasks.includes(task))continue;
    const day=dateValue(task.meta.recurrenceDate),meta=structuredClone(task.meta);
    if(dates.has(day)){
      const occurrence=recurrenceOccurrence({meta:next,body},day);for(const key of ['title','priority','tags','taskflowProject','due','scheduled','durationMinutes','recurrenceSeries','recurrenceDate','recurrenceRevision'])meta[key]=structuredClone(key==='taskflowProject'?(occurrence.meta[key]||''):occurrence.meta[key]);
      if(occurrence.meta.scheduledTime)meta.scheduledTime=occurrence.meta.scheduledTime;else delete meta.scheduledTime;
      changes.push({task,meta,body:mergeSeriesBody(occurrence.body,task.body)});
    }else{meta.archived=true;meta.recurrenceSuperseded=true;changes.push({task,meta,body:task.body});}
  }
  return changes;
}
function button(parent, text, action, cls='') { const b=parent.createEl('button',{text,cls}); b.addEventListener('click',action); return b; }
function validateTaskFields(meta){
  if(!Object.hasOwn(STATES,meta.status)||typeof meta.title!=='string'||!meta.title.trim()||meta.tags!==undefined&&(!Array.isArray(meta.tags)||meta.tags.some(t=>typeof t!=='string')))throw new Error('Ungültige Aufgabenfelder. Bitte Titel, Status und Tags prüfen.');
}
function report(e) { console.error('TaskFlow',e); new Notice(`TaskFlow: ${e.message || e}`); }
const ENGLISH={"Allgemein":"General","Design & Schrift":"Appearance & typography","Farben im Detail":"Detailed colors","Layout & Karten":"Layout & cards","Kalender & Aufgaben":"Calendar & tasks","Sichern & Zurücksetzen":"Backup & reset","Änderungen werden live vorgeschaut. Erst Speichern übernimmt sie dauerhaft.":"Changes are previewed live. Save to keep them permanently.","Sprache":"Language","Deutsch":"German","Startansicht":"Start view","Mein Tag":"My day","Tagesplaner":"Day planner","Statistik":"Statistics","Projekte":"Projects","Filterfavoriten anzeigen":"Show saved filters","Sanfte Animationen":"Smooth animations","Reduzierte Bewegung des Betriebssystems wird immer berücksichtigt. Aufgabentitel, Notizen und Projektinhalte werden nicht übersetzt.":"Your system's reduced-motion preference is always respected. Task titles, notes and project content are not translated.","Farbmodus":"Color mode","Obsidian folgen":"Follow Obsidian","Hell":"Light","Dunkel":"Dark","Schriftart":"Font family","Obsidian-Schrift":"Obsidian font","Grundschriftgröße":"Base font size","Seitenüberschriften":"Page headings","Aufgabentitel-Größe":"Task title size","Detailtext-Größe":"Detail text size","Kalendertext-Größe":"Calendar text size","Kacheltext-Größe":"Tile text size","Zeilenhöhe":"Line height","Alle Größen in Pixeln; Zeilenhöhe als Faktor. Der Farbmodus gilt nur für TaskFlow.":"Sizes are in pixels; line height is a multiplier. Color mode applies only to TaskFlow.","Palette bearbeiten":"Edit palette","Jede Farbe hat eine eigene Einstellung. Standard erbt im Modus „Obsidian folgen“ dein Obsidian-Design.":"Each color can be configured separately. Default inherits your theme when following Obsidian.","Standard":"Default","Bitte eine Farbe im Format #RRGGBB eingeben.":"Please enter a color as #RRGGBB.","Kontrast prüfen":"Check contrast","Textkontrast":"Text contrast","Gut lesbar":"Good readability","Mehr Kontrast empfohlen":"More contrast recommended","Abstände":"Spacing","Kompakt":"Compact","Normal":"Normal","Großzügig":"Spacious","Minimale Boardspalten-Breite":"Minimum board column width","Kartenecken":"Card corner radius","Kachelhöhe":"Tile height","Maximale Inhaltsbreite (0 = volle Breite)":"Maximum content width (0 = full width)","Notizfelder auf Karten":"Note fields on cards","Tags auf Karten":"Tags on cards","Termine auf Karten":"Dates on cards","Projektname auf Karten":"Project names on cards","Farblegende anzeigen":"Show color legend","Ausgeblendete Details bleiben gespeichert und im Aufgabeneditor erreichbar.":"Hidden details remain saved and accessible in the task editor.","Standard-Kalenderansicht":"Default calendar view","Woche":"Week","Tag":"Tag","Wochenbeginn":"Week starts on","Montag":"Monday","Sonntag":"Sunday","Kalenderbeginn (Stunde)":"Calendar start hour","Kalenderende (Stunde)":"Calendar end hour","Standardstatus neuer Aufgaben":"Default task status","Standardpriorität":"Default priority","Standarddauer (Minuten)":"Default duration (minutes)","Aufgabensortierung":"Task sorting","Bisherige Reihenfolge":"Existing order","Fälligkeit":"Due date","Priorität":"Priority","Titel":"Title","Erstellungsdatum":"Created date","Erledigte Aufgaben automatisch archivieren":"Automatically archive completed tasks","Termine außerhalb des Zeitfensters bleiben sichtbar. Standards gelten für neue Aufgaben; vorhandene Aufgaben werden nicht umgeschrieben.":"Events outside the time window remain visible. Defaults apply to new tasks; existing tasks are not rewritten.","Export und Import enthalten nur diese Einstellungen, keine Aufgaben, Projekte, Notizen oder Zugangsdaten.":"Export and import include only these preferences, without tasks, projects, notes or credentials.","Einstellungen JSON":"Preferences JSON","Einstellungen exportieren":"Export preferences","Einstellungen importieren":"Import preferences","Ungültiges Einstellungsformat.":"Invalid preferences format.","Import als Vorschau geladen. Zum Übernehmen speichern.":"Import loaded as preview. Save to apply.","Import fehlgeschlagen":"Import failed","Design und Optionen zurücksetzen":"Reset design and options","Zurücksetzen betrifft nur diese Optionen und wird erst mit Speichern dauerhaft. Vollständiges Backup: Aufgabenordner und TaskFlow-Pluginordner sichern.":"Reset affects only these preferences and becomes permanent after saving. For a full backup, save your task folder and TaskFlow plugin folder.","Einstellungen wurden inzwischen geändert. Bitte erneut öffnen.":"Preferences have changed since opening. Please reopen Settings.","Abbrechen":"Cancel","Speichern":"Save","Seitenhintergrund":"Page background","Formularflächen":"Form surfaces","Aufgabenkarte":"Task card","Kartenrahmen":"Card borders","Schaltflächen":"Buttons","Hover-Flächen":"Hover surfaces","Trennlinien":"Dividers","Haupttext":"Main text","Sekundärtext":"Secondary text","Überschriften":"Headings","Aufgabentitel":"Task title","Notizfeld":"Note field","Notiztext":"Note text","Tag-Hintergrund":"Tag background","Tag-Text":"Tag text","Menükacheln":"Menu tiles","Kachelsymbole":"Tile icons","Kalenderlinien":"Calendar lines","Kalenderblöcke":"Calendar events","Fortschrittsbalken":"Progress bars","Status · Offen":"Status · Open","Status · In Arbeit":"Status · In progress","Status · Verzögert":"Status · Delayed","Status · Erledigt":"Status · Done","Priorität · Hoch":"Priority · High","Priorität · Normal":"Priority · Normal","Priorität · Niedrig":"Priority · Low","Offen":"Open","In Arbeit":"In progress","Verzögert":"Delayed","Erledigt":"Done","Hoch":"High","Niedrig":"Low","Täglich":"Daily","Wöchentlich":"Weekly","Monatlich":"Monthly","Abgeschlossen":"Completed","Kein Termin":"No due date","Überfällig · ":"Overdue · ","Heute · ":"Today · ","Alle Termine":"All dates","Überfällig":"Overdue","Heute":"Today","Nächste 7 Tage":"Next 7 days","Ohne Termin":"No due date","Kalender":"Calendar","Wiederholtermine":"Recurring tasks","Archiv":"Archive","Papierkorb":"Trash","Einzelaufgaben im Überblick":"Overview of individual tasks","Den Arbeitstag planen":"Plan your working day","Termine und Zeitblöcke":"Dates and time blocks","Serien zentral bearbeiten":"Manage recurring tasks","Abschlüsse und Fortschritt":"Completions and progress","Erledigtes wiederfinden":"Find completed tasks","Wiederherstellen und verwalten":"Restore and manage","Aufgaben bündeln und Fortschritt sehen":"Group tasks and track progress","← Zum Hauptmenü":"← Main menu","Hauptmenü":"Main menu","Meine Aufgaben":"My tasks","Analyse & Statistik":"Analysis & statistics","Archiv · Statistik":"Archive · Statistics","+ Neue Aufgabe":"+ New task","+ Neue Wiederholung":"+ Recurring task","+ Neues Projekt":"+ New project","+ Teilaufgabe":"+ Subtask","Boardansicht":"Board view","Aufgaben":"Tasks","Archivansicht":"Archive view","Archivierte Aufgaben":"Archived tasks","Heute im Fokus":"Today's focus","Keine Aufgaben heute fällig":"No tasks due today","FOKUS FÜR DEN TAG · ÜBERBLICK FÜR DIE WOCHE":"FOCUS ON TODAY · OVERVIEW OF THE WEEK","STATISTIK":"STATISTICS","KANBAN / ":"KANBAN / ","ARCHIV":"ARCHIVE","ALLE AUFGABEN":"ALL TASKS","Todos durchsuchen …":"Search tasks …","Aufgaben suchen":"Search tasks","Titel, Notizen, Teilaufgaben, Tags und Daten durchsuchen · mehrere Begriffe kombinieren":"Search titles, notes, subtasks, tags and dates · combine multiple terms","Alle Tags":"All tags","Alle Projekte":"All projects","Ohne Projekt":"No project","Alle Status":"All statuses","Alle Prioritäten":"All priorities","Filter speichern":"Save filter","Filter umbenennen":"Rename filter","Filtername":"Filter name","Name":"Name","Zum Beispiel: Arbeit diese Woche":"For example: Work this week","Umbenennen":"Rename","Gespeicherten Filter löschen":"Delete saved filter","Zurücksetzen":"Reset","Keine passenden Aufgaben. Ändere die Suche oder setze die Filter zurück.":"No matching tasks. Change your search or reset the filters.","Serientermine findest du auf der Startseite und im Kalender.":"Find recurring tasks on the home page and calendar.","Kalender öffnen":"Open calendar","Tag planen →":"Plan your day →","Dein Tag":"Your day","Für heute ist noch nichts geplant oder fällig. Plane vorhandene Aufgaben über den Tagesplaner ein.":"Nothing is planned or due today. Schedule existing tasks in the day planner.","Alle Aufgaben öffnen →":"Open all tasks →","Schnellzugriff":"Quick access","Filterfavoriten":"Saved filters","Weitere Aufgaben":"More tasks","Anstehende Planung und Fälligkeiten ab morgen.":"Upcoming plans and due dates from tomorrow.","Keine überfälligen Aufgaben.":"No overdue tasks.","Keine anstehenden Termine in den nächsten sieben Tagen.":"No upcoming events in the next seven days.","Eingang":"Inbox","Ohne Planungsdatum; eine Deadline kann bereits gesetzt sein.":"No planned date; a deadline may already be set.","Alle offenen Aufgaben haben ein Planungsdatum.":"All open tasks have a planned date.","Weniger anzeigen":"Show less","Planen":"Plan","Geplant ":"Planned ","Fällig ":"Due ","Neue Aufgabe":"New task","Aufgabe bearbeiten":"Edit task","Ein klarer nächster Schritt. Details und Teilaufgaben ergänzt du darunter.":"A clear next step. Add details and subtasks below.","Was möchtest du erledigen?":"What would you like to get done?","Fällig am":"Due on","arbeit, privat, projekt":"work, personal, project","Projekt":"Project","Unbekanntes Projekt":"Unknown project","Unbekanntes Projekt · ":"Unknown project · ","Projekt · ":"Project · ","Tagesplanung · optional":"Daily planning · optional","Plane einen Arbeitstag und bei Bedarf einen Zeitblock. Die Fälligkeit bleibt eine eigene Deadline.":"Plan a working day and an optional time block. The due date remains a separate deadline.","Geplant am":"Scheduled for","Startzeit":"Start time","Dauer in Minuten":"Duration in minutes","Wiederholen":"Repeat","Keine Wiederholung":"No recurrence","Serie ab hier beenden":"End series from here","Alle … Tage / Wochen / Monate":"Every … days / weeks / months","Erster Termin":"First occurrence","Monatstag (1–31)":"Day of month (1–31)","Uhrzeit je Termin (optional)":"Time per occurrence (optional)","Termindauer in Minuten":"Event duration in minutes","Letzter Termin (optional)":"Last occurrence (optional)","Änderungen anwenden auf":"Apply changes to","Nur diesen Termin":"Only this occurrence","Diesen und folgende Termine":"This and future occurrences","Notizen":"Notes","Gedanken, Links oder weitere Details …":"Thoughts, links or further details …","Teilaufgaben":"Subtasks","Nächster Schritt …":"Next step …","Noch keine Teilaufgaben. Füge den ersten Schritt mit + hinzu.":"No subtasks yet. Add your first step with +.","Bitte gib deiner Aufgabe einen Titel.":"Please enter a task title.","Bitte fülle die leere Teilaufgabe aus oder entferne sie.":"Please fill in or remove the empty subtask.","Änderungen speichern":"Save changes","Aufgabe erstellen":"Create task","Diesen Termin überspringen":"Skip this occurrence","Löschen":"Delete","Notiz":"Note","Notiz zur Aufgabe …":"Note for this task …","Wird gespeichert …":"Saving …","Ungespeichert":"Unsaved","Verwerfen":"Discard","In Obsidian öffnen":"Open in Obsidian","Wiederherstellen":"Restore","Archivieren":"Archive","Keine Aufgaben":"No tasks","In den Papierkorb verschieben":"Move to trash","Löschen anwenden auf":"Apply deletion to","Gesamte Serie / Serienabschnitt":"Entire series / segment","Papierkorb endgültig leeren?":"Permanently empty trash?","Papierkorb leeren":"Empty trash","Endgültig leeren":"Delete permanently","Schließen und Papierkorb prüfen":"Close and review trash","Der Papierkorb ist leer.":"Trash is empty.","Serie wiederherstellen":"Restore series","Unbekannt":"Unknown","Wiederholtermine suchen …":"Search recurring tasks …","Wiederholtermine suchen":"Search recurring tasks","Keine passenden Wiederholtermine.":"No matching recurring tasks.","Noch keine Wiederholtermine. Lege über „Neue Wiederholung“ eine Serie an.":"No recurring tasks yet. Create a series using New recurring task.","Serie bearbeiten":"Edit series","Termine ausblenden":"Hide occurrences","Termine anzeigen":"Show occurrences","Einzeltermin bearbeiten":"Edit occurrence","Übersprungen":"Skipped","Ersetzt":"Replaced","Archiviert":"Archived","Individuell geändert":"Individually edited","Aktiv":"Active","Pausiert":"Paused","Beendet":"Ended","Quelle fehlt":"Source missing","Projekt bearbeiten":"Edit project","Neues Projekt":"New project","Projektname":"Project name","Beschreibung":"Description","Projektnotiz":"Project note","Zum Beispiel: Website":"For example: Website","Ziel und nächste Schritte":"Goal and next steps","Zum Beispiel: Projekte/Website.md":"For example: Projects/Website.md","Projekt archiviert":"Archived project","Projekt speichern":"Save project","← Alle Projekte":"← All projects","Projektnotiz öffnen":"Open project note","Aufgaben im Board":"Tasks on board","Termine im Kalender":"Events in calendar","Dieses Projekt ist nicht mehr verfügbar.":"This project is no longer available.","Aktive Projekte":"Active projects","Archivierte Projekte":"Archived projects","Keine archivierten Projekte.":"No archived projects.","Noch keine Projekte. Lege dein erstes Projekt an.":"No projects yet. Create your first project.","Projekt öffnen →":"Open project →","Erledigt · Archiv":"Done · Archive","Noch keine Aufgaben zugeordnet. Öffne im Board eine Aufgabe und wähle dieses Projekt.":"No tasks assigned yet. Open a task on the board and choose this project.","Vorherige Woche":"Previous week","Vorheriger Tag":"Previous day","Nächste Woche":"Next week","Nächster Tag":"Next day","Planungstag":"Planning date","Wochenübersicht":"Week overview","Tagesansicht":"Daily view","Tagesablauf":"Agenda","Prioritäten":"Priorities","Wochenkalender":"Weekly calendar","Tageskalender":"Daily calendar","Kalenderzeitraum":"Calendar range","Zeit":"Time","Flexibel":"Flexible","Fällig":"Due","Aufgaben einplanen":"Schedule tasks","Auf diesen Tag verschieben":"Move to this day","Aus Tagesplan nehmen":"Remove from day plan","Keine weiteren aktiven Aufgaben in dieser Auswahl.":"No other active tasks in this selection.","Vorhandene Aufgaben auf den gewählten Tag legen. Fälligkeiten bleiben erhalten.":"Schedule existing tasks for the selected day. Due dates remain unchanged.","Dein Tag ist noch frei. Plane eine vorhandene Aufgabe ein. Neue Aufgaben erfasst du im Board.":"Your day is free. Schedule an existing task. Create new tasks on the board.","Aktueller Aufgabenstand und deine Abschlüsse im Zeitverlauf. Suche und Tags gelten für alle Diagramme.":"Current task status and completions over time. Search and tags apply to all charts.","Abschlusszeitraum":"Completion period","Aktive Aufgaben":"Active tasks","Abschlussquote":"Completion rate","Aufgabenstatus":"Task status","Aufgaben nach Tags":"Tasks by tag","Abschlüsse pro Tag":"Completions per day","Abschlüsse je Sieben-Tage-Abschnitt":"Completions per seven-day period","Ohne Daten":"No data","Keine Daten":"No data","Keine Abschlüsse im gewählten Zeitraum.":"No completions in this period.","Keine Tags vorhanden.":"No tags available.","Fälligkeiten aktiver Aufgaben":"Due dates of active tasks","Prioritäten aktiver Aufgaben":"Priorities of active tasks","Aktuelle Verteilung":"Current distribution","Bereits abgeschlossen":"Already completed","Ohne Fälligkeit":"No due date","Später":"Later","Nächste 7 Tage inkl. heute":"Next 7 days including today","Aktive Aufgaben mit vergangenem Termin":"Active tasks past their due date","Keine überfälligen Aufgaben":"No overdue tasks","Verzögerte Aufgaben":"Delayed tasks","Lokal im Vault":"Local to your vault","Dashboard öffnen":"Open dashboard","Startseite öffnen":"Open home page","Tagesplaner öffnen":"Open day planner","Neue Aufgabe im Board":"New task on board","Kartenrand: Priorität":"Card border: priority","Farbige Kennzeichnung: Status · Kartenrand und Prioritätslabel: Priorität":"Color labels: status · Card border and priority label: priority"," Aufgaben":" tasks"," Aufgaben anzeigen":" tasks"," Aufgaben insgesamt":" tasks total"," Kalendertage inkl. heute":" calendar days including today"," Prozent":" percent"," Tage":" days"," Termine erfasst":" occurrences recorded"," aktiv":" active"," aktiven Aufgaben":" active tasks"," als erledigt markieren":" mark as done"," am ":" on "," bearbeiten · ":" edit · "," bis ":" to "," einplanen":" schedule"," entfernen":" remove"," erledigen":" complete"," erledigt":" done"," erledigt · ":" done · "," gelöschte Aufgaben":" deleted tasks"," geplante Aufgaben":" scheduled tasks"," hinzufügen":" add"," offen · ":" open · "," planen und bearbeiten":" schedule and edit"," von ":" of "," wieder öffnen":" reopen"," · Gelöscht: ":" · Deleted: "," · Mein Arbeitsbereich":" · My workspace"," · Priorität: ":" · Priority: "," · alle ":" · every "," · archiviert":" · archived"," · bis ":" · until "," · flexibel":" · flexible"," öffnen":" open"," überfällig":" overdue","Ab ":"From ","Aktueller Stand · ":"Current status · ","Alle ":"All ","Aufgabe":"Task","Aufgabe in ":"Add task to ","Archivieren blendet das Projekt aus der aktiven Projektübersicht aus. Aufgaben behalten ihren Status und ihre Termine.":"Archiving hides the project from the active overview. Tasks keep their status and dates.","Automatisch am Fälligkeitstag angezeigt · noch keine feste Tagesplanung":"Shown automatically on the due date · not yet scheduled","Balkenlänge: Anzahl Aufgaben · Erledigt und aktiv je Schlagwort. Aufgaben mit mehreren Tags zählen in jeder zugehörigen Zeile.":"Bar length: task count · Done and active by tag. Tasks with multiple tags count in each corresponding row.","Bisher geplant: ":"Currently scheduled: ","Blöcke ziehen: Zeit oder Tag ändern. Titel anklicken: bearbeiten. Kreis anklicken: erledigen. Neue Aufgaben erfasst du im Board.":"Drag blocks to change their date or time. Click a title to edit or a circle to complete. Create new tasks on the board.","Bündle Aufgaben nach Vorhaben. Die Fortschrittsanzeige zählt aktive Aufgaben und archivierte Abschlüsse; gelöschte und übersprungene Termine bleiben ausgeschlossen.":"Group tasks by project. Progress includes active tasks and archived completions, excluding deleted and skipped occurrences.","Datum":"Date","Der erste Termin bestimmt den Rhythmus. Bei „Diesen und folgende“ werden offene Folgetermine angepasst. Erledigte, archivierte, übersprungene und einzeln geänderte Folgetermine bleiben erhalten. Nicht mehr passende offene Termine kommen ins Archiv. Status gilt nur für den gewählten Termin.":"The first occurrence defines the schedule. This and future occurrences updates open future events while protecting completed, archived, skipped and individually edited events. Open events outside the new schedule are archived. Status applies only to the selected event.","Die Diagramme zeigen den aktuellen Aufgabenstand und das letzte Abschlussdatum. Wieder geöffnete Aufgaben zählen nicht als erledigt. Erledigte Aufgaben sind einschließlich der archivierten Abschlüsse enthalten; Archiv → Statistik wertet nur das Archiv aus.":"Charts show current task status and the latest completion date. Reopened tasks are not counted as done. Completed tasks include archived completions; Archive statistics include only archived tasks.","Die ursprüngliche Serie fehlt. Änderungen gelten nur für diesen Termin.":"The original series is missing. Changes apply only to this event.","Die ursprüngliche Serienaufgabe fehlt. Vorhandene Termine kannst du einzeln bearbeiten; eine Serienänderung ist ohne Quelle nicht möglich.":"The original series is missing. Existing events can be edited individually; editing the series requires its source.","Dieser erste Termin enthält die Serienregel. Die gesamte Serie mit ihren erfassten Terminen wird in den Papierkorb verschoben und erzeugt keine weiteren Termine. Du kannst sie dort wiederherstellen.":"This first event contains the recurrence rule. The entire series and its recorded occurrences will move to trash and stop generating events. You can restore them there.","Eine Zeile je Serie bzw. geändertem Serienabschnitt. „Serie bearbeiten“ beginnt beim nächsten offenen, nicht individuell geschützten Termin. Erledigte und individuell geänderte Folgetermine bleiben geschützt. Beendete Serien bleiben hier auffindbar.":"One row per series or edited segment. Edit series begins with the next open, unprotected event. Completed and individually edited future events remain protected. Ended series remain available here.","Einplanen":"Schedule","Einzelaufgabe / einzelner Termin":"Individual task / event","Erledigt im Zeitraum":"Completed in period","Erledigte Aufgaben":"Completed tasks","Flexibel · ohne Uhrzeit":"Flexible · no time set","Fälligkeiten":"Due dates","Gelöschte Aufgaben erscheinen nicht im Board, Kalender, auf der Startseite oder in Statistiken. Wiederherstellen behält den bisherigen Status und Archivzustand.":"Deleted tasks are excluded from the board, calendar, home page and statistics. Restoring preserves the previous status and archive state.","Hier ablegen":"Drop here","In Papierkorb verschieben":"Move to trash","Kalender mit Aufgabenblöcken":"Calendar with task blocks","Kein zukünftiger offener Termin erfasst":"No open future events recorded","Letzte ":"Last ","Noch keine Abschlüsse in diesem Zeitraum.":"No completions in this period.","Noch keine Aufgaben für diese Auswahl.":"No tasks for this selection.","Noch keine Tags in dieser Auswahl.":"No tags in this selection.","Noch nicht eingeplant":"Not scheduled yet","Notiz für ":"Note for ","Notizen und Teilaufgaben bleiben bis zum endgültigen Leeren im Papierkorb erhalten. Nicht gespeicherte Änderungen im Editor werden nicht übernommen.":"Notes and subtasks remain in trash until permanently deleted. Unsaved editor changes are not included.","Nur aktive Aufgaben · nächste 7 Tage ab morgen":"Active tasks only · next 7 days from tomorrow","Nächste 7 Tage: heute bis einschließlich ":"Next 7 days: today through ","Nächster offen: ":"Next open: ","Offen, in Arbeit und verzögert":"Open, in progress and delayed","Offene Aufgaben mit überschrittener Deadline.":"Open tasks past their deadline.","Ohne Datum":"No date","Planungsdatum und Uhrzeit sind dein Arbeitsplan, die Fälligkeit ist die Deadline. Erledigte Aufgaben werden automatisch archiviert.":"Scheduled date and time are your work plan; the due date is the deadline. Completed tasks are archived according to Settings.","Priorität: ":"Priority: ","Projektfortschritt: ":"Project progress: ","Projektnotiz: optionaler Pfad zu einer vorhandenen Notiz im Vault. Aufgaben ordnest du im Aufgabeneditor zu.":"Project note: optional path to an existing note in your vault. Assign tasks using the task editor.","Serie":"Series","Serie / Serienabschnitt · ":"Series / segment · ","Serientermine werden im Fortschritt einzeln gezählt. Das Board zeigt weiterhin nur Einzelaufgaben; alle datierten Aufgaben findest du im Kalender.":"Progress counts recurring events individually. The board shows individual tasks; find all dated tasks on the calendar.","Status für ":"Status for ","Tageskalender für ":"Daily calendar for ","Teilaufgabe ":"Subtask ","Verteilung deiner ":"Distribution of your ","Werte als Tabelle":"Values as table","Zeit & Planung":"Time & planning","Zeitblock":"Time block","Zeitblöcke":"Time blocks","Zeitblöcke basieren auf Planungsdatum, Startzeit und Dauer. Kleine Aufgaben werden für die Bedienbarkeit mindestens als halbstündiger Block dargestellt; die Beschriftung zeigt ihre tatsächliche Dauer. Offene Aufgaben und Aufgaben in Arbeit mit Fälligkeitsdatum erscheinen automatisch am Termin unter „Flexibel“ mit dem Hinweis „Fällig“. Ein manuelles Planungsdatum hat Vorrang. Ohne Datum erfolgt kein automatischer Eintrag. Beim Erledigen bleibt das Planungsdatum erhalten; die Aufgabe wechselt sofort ins Archiv. Fälligkeiten werden beim Verschieben nicht geändert.":"Blocks use scheduled date, start time and duration. Short tasks display as at least half-hour blocks; labels show the actual duration. Open and in-progress tasks with a due date appear automatically under Flexible as Due. A scheduled date takes precedence. Undated tasks are not added automatically. Completing keeps the planned date; archiving follows Settings. Moving blocks does not change due dates.","Zeitraum":"Period","Zeitüberschneidung":"Time conflict","Zerlege die Aufgabe in kleine, konkrete Schritte.":"Break the task into small, concrete steps.","in Arbeit":"in progress","verzögert":"delayed","↻ Ersetzter Serientermin":"↻ Replaced occurrence","↻ Serie pausiert":"↻ Series paused","↻ Serientermin":"↻ Recurring event","↻ Termin übersprungen":"↻ Skipped occurrence","{0} Aufgabendateien mit Notizen und Teilaufgaben werden dauerhaft gelöscht. Das kann in TaskFlow nicht rückgängig gemacht werden.":"{0} task files including notes and subtasks will be permanently deleted. TaskFlow cannot undo this.","{0} archivierte Aufgaben":"{0} archived tasks","{0} überfällig":"{0} overdue","{0} von {1} Serienabschnitten":"{0} of {1} series segments","{0} {1} für heute · {2} {3}":"{0} {1} for today · {2} {3}","Alle {0} anzeigen":"Show all {0}","Weitere Aufgaben · {0} überfällig · {1} ohne Planung":"More tasks · {0} overdue · {1} unscheduled"," Teilaufgaben · {0}/{1}":" Subtasks · {0}/{1}","{0} geplant · {1} erledigt · {2} h {3} min geschätzt":"{0} scheduled · {1} done · {2} h {3} min estimated","{0} aktive Aufgaben überschneiden sich zeitlich. Du kannst die Zeitblöcke über „Zeit & Planung“ anpassen.":"{0} active tasks overlap. Adjust their blocks using Time & planning.","{0} Aufgaben in den letzten {1} Tagen erledigt. {2}":"{0} tasks completed in the last {1} days. {2}","{0}: {1} erledigt, {2} aktiv":"{0}: {1} done, {2} active"," {0} erledigte Aufgabe(n) ohne gültiges Abschlussdatum sind im Status enthalten, aber nicht im Zeitverlauf.":" {0} completed tasks with no valid completion date are included in status totals, but not in the timeline.","{0} Datei(en) endgültig gelöscht. Verbleibende Dateien bleiben im Papierkorb. {1}":"{0} files permanently deleted. Remaining files are still in trash. {1}","{0} Datei(en) im TaskFlow-Ordner konnten nicht gelesen werden. Details in der Entwicklerkonsole.":"{0} files in the TaskFlow folder could not be read. See the developer console for details.","gesamt":"total","offen":"open","erledigt":"done","Gesamt":"Total","Im Zeitraum":"In period","Ein Projekt mit diesem Namen existiert bereits.":"A project with this name already exists.","Das Projekt wurde inzwischen geändert. Bitte erneut öffnen.":"The project has changed. Please reopen it.","Bitte einen Projektnamen mit 1–80 Zeichen eingeben.":"Please enter a project name of 1–80 characters.","Bitte einen Filternamen mit 1–80 Zeichen eingeben.":"Please enter a filter name of 1–80 characters.","Bitte einen relativen Notizpfad im Vault verwenden.":"Please use a relative note path inside your vault.","Beschreibung oder Notizlink ist zu lang.":"The description or note path is too long.","Dieser Filtername ist bereits vergeben.":"This filter name is already in use.","Der gespeicherte Filter existiert nicht mehr.":"This saved filter no longer exists.","Aufgabe wurde zwischenzeitlich geändert. Bitte erneut öffnen.":"The task has changed. Please reopen it.","Aufgabe wurde zwischenzeitlich geändert. Bitte erneut öffnen; deine Eingabe bleibt hier erhalten.":"The task has changed. Please reopen it; your input remains here.","Die Aufgabe wurde inzwischen geändert. Bitte erneut öffnen.":"The task has changed. Please reopen it.","Der Termin wurde inzwischen geändert. Bitte erneut öffnen.":"The event has changed. Please reopen it.","Die Aufgabe liegt im Papierkorb.":"The task is in trash.","Die Aufgabe liegt im Papierkorb. Bitte zuerst wiederherstellen.":"The task is in trash. Please restore it first.","Eine Aufgabenänderung läuft bereits. Bitte kurz warten.":"A task update is in progress. Please wait.","Eine Serienänderung wird bereits gespeichert. Bitte kurz warten.":"A series update is in progress. Please wait.","Der gewählte Termin wurde zwischenzeitlich geändert. Bitte erneut öffnen.":"The selected event has changed. Please reopen it.","Die Serie wurde zwischenzeitlich geändert. Bitte erneut öffnen.":"The series has changed. Please reopen it.","Ein betroffener Termin wurde zwischenzeitlich geändert. Bitte erneut öffnen.":"An affected event has changed. Please reopen it.","Eine betroffene Aufgabe wurde inzwischen geändert.":"An affected task has changed.","Der Papierkorb wurde inzwischen geändert. Bitte neu öffnen und prüfen.":"Trash has changed. Please reopen and review it.","Eine Aufgabe wurde während des Leerens geändert.":"A task changed while emptying trash.","Bitte ein gültiges Fälligkeitsdatum eingeben.":"Please enter a valid due date.","Bitte ein gültiges Planungsdatum eingeben.":"Please enter a valid scheduled date.","Bitte einen gültigen Kalendertag wählen.":"Please select a valid calendar date.","Die Dauer muss zwischen 5 und 720 ganzen Minuten liegen.":"Duration must be between 5 and 720 whole minutes.","Eine Startzeit benötigt ein Planungsdatum und die Form HH:MM.":"A start time requires a scheduled date and the format HH:MM.","Der Zeitblock muss innerhalb eines Tages enden. Bitte Startzeit oder Dauer anpassen.":"The time block must end within one day. Please adjust its start or duration.","Der Zeitblock passt nicht in diesen Tag. Bitte eine frühere Uhrzeit wählen.":"The block does not fit within this day. Please choose an earlier time.","Bitte einen Monatstag von 1 bis 31 wählen.":"Please choose a day of the month from 1 to 31.","Bitte einen gültigen ersten Termin eingeben.":"Please enter a valid first occurrence date.","Bitte einen gültigen Wiederholungsrhythmus wählen (1–365).":"Please choose a valid recurrence interval (1–365).","Bitte gültige Seriendaten eingeben; das Ende darf nicht vor dem ersten Termin liegen.":"Please enter valid recurrence dates; the end cannot precede the first event.","Ungültige Serienkennung.":"Invalid recurrence ID.","Ungültige Ausnahmen der Serie.":"Invalid series exceptions.","Ungültiger Serientermin.":"Invalid recurring event.","Ungültiges Planungsdatum.":"Invalid scheduled date.","Ungültige Aufgabenfelder. Bitte Titel, Status und Tags prüfen.":"Invalid task fields. Please check the title, status and tags.","Die ursprüngliche Serienaufgabe fehlt. Dieser Termin kann nur einzeln bearbeitet werden.":"The source series is missing. This event can only be edited individually.","Am neuen ersten Termin existiert bereits ein geschützter Serientermin. Bitte ein anderes Datum wählen oder diesen einzeln bearbeiten.":"A protected event already exists on the new first date. Please choose another date or edit that event individually.","Die Notiz wurde zwischenzeitlich geändert. Bitte prüfe die aktuelle Notiz im Editor. Dein Entwurf bleibt im Textfeld erhalten.":"The note has changed. Please review it in the editor. Your draft remains in the text field.","Diese Aufgabe liegt bereits im Papierkorb.":"This task is already in trash.","Diese Aufgabe liegt nicht mehr im Papierkorb.":"This task is no longer in trash.","Der erste Termin enthält die Serienregel. Bitte die ganze Serie löschen.":"The first event contains the recurrence rule. Please delete the entire series.","Die Serienkennung fehlt.":"The series ID is missing.","Ein Serientermin ist nicht gegen Neuerzeugung geschützt. Bitte erst wiederherstellen und erneut löschen.":"A recurring event is not protected against regeneration. Please restore it and delete it again.","Der Dateiname für einen Serientermin ist bereits belegt.":"The filename for a recurring event is already in use.","Serienaufgabe benötigt eine gültige ID. Bitte im Editor speichern.":"The series requires a valid ID. Please save it in the editor.","Dies ist kein Serientermin.":"This is not a recurring event.","Unbekannter Schnellzugriff.":"Unknown shortcut.","Keine TaskFlow-Aufgabe.":"Not a TaskFlow task.","Änderung unvollständig: Gleichzeitig bearbeitete Dateien wurden nicht überschrieben. Bitte den Papierkorb und die betroffenen Aufgaben prüfen.":"Update incomplete: concurrent changes were not overwritten. Please review trash and the affected tasks.","Serienänderung unvollständig: Gleichzeitig bearbeitete Dateien wurden nicht überschrieben. Bitte prüfe die betroffenen Termine.":"Series update incomplete: concurrent changes were not overwritten. Please review the affected events.","Dein Tagesüberblick":"Your day at a glance","{0} von {1} Tagesaufgaben erledigt · {2} Prozent":"{0} of {1} daily tasks done · {2} percent","{0} von {1} Tagesaufgaben erledigt":"{0} of {1} daily tasks done","Tagesfortschritt":"Daily progress","Heute abgeschlossen":"Completed today","Noch für heute offen":"Still open today","Geplante Zeitblöcke":"Scheduled time blocks","Geplante Blockdauer: {0} h {1} min":"Planned block duration: {0} h {1} min","Abschlüsse · letzte 7 Tage":"Completions · last 7 days","Tagesaufgaben: heute fällig, heute geplant oder heute abgeschlossen. Abschlüsse im Archiv zählen mit.":"Daily tasks: due today, scheduled today or completed today. Archived completions are included.","Dein Tag ist noch frei. Plane vorhandene Aufgaben im Tagesplaner ein.":"Your day is still free. Schedule existing tasks in the day planner.","Gesamte Statistik öffnen →":"Open full statistics →","Details ausblenden":"Hide details","Details anzeigen":"Show details","Bearbeiten":"Edit","Noch keine Notiz vorhanden.":"No note yet."};
function tr(text){return uiLanguage==='en'?(ENGLISH[text]||text):text;}
function tfmt(key,...values){return tr(key).replace(/\{(\d+)\}/g,(_,i)=>String(values[Number(i)]??''));}
function translatedLabels(labels){return Object.defineProperties({},Object.fromEntries(Object.entries(labels).map(([key,value])=>[key,{enumerable:true,get:()=>tr(value)}])));}
// Appearance is scoped to TaskFlow, never to Obsidian's global theme.
const COLOR_FIELDS={canvas:'Seitenhintergrund',surface:'Formularflächen',card:'Aufgabenkarte',cardBorder:'Kartenrahmen',control:'Schaltflächen',hover:'Hover-Flächen',border:'Trennlinien',text:'Haupttext',muted:'Sekundärtext',heading:'Überschriften',taskTitle:'Aufgabentitel',noteBackground:'Notizfeld',noteText:'Notiztext',tagBackground:'Tag-Hintergrund',tagText:'Tag-Text',tile:'Menükacheln',tileIcon:'Kachelsymbole',calendarGrid:'Kalenderlinien',calendarEvent:'Kalenderblöcke',progress:'Fortschrittsbalken',open:'Status · Offen',progressStatus:'Status · In Arbeit',delayed:'Status · Verzögert',done:'Status · Erledigt',high:'Priorität · Hoch',normal:'Priorität · Normal',low:'Priorität · Niedrig'};
const COLOR_VARS={canvas:'--tf-canvas',surface:'--tf-surface',card:'--tf-card-bg',cardBorder:'--tf-card-border',control:'--tf-control-soft',hover:'--tf-control',border:'--tf-line',text:'--tf-ink',muted:'--tf-quiet',heading:'--tf-heading',taskTitle:'--tf-task-title',noteBackground:'--tf-note-background',noteText:'--tf-note-text',tagBackground:'--tf-tag-background',tagText:'--tf-tag-text',tile:'--tf-tile',tileIcon:'--tf-tile-icon',calendarGrid:'--tf-calendar-grid-color',calendarEvent:'--tf-calendar-event-color',progress:'--tf-progress',open:'--tf-status-open',progressStatus:'--tf-status-progress',delayed:'--tf-status-delayed',done:'--tf-status-done',high:'--tf-priority-high',normal:'--tf-priority-normal',low:'--tf-priority-low'};
const PALETTES={light:{canvas:'#ffffff',surface:'#f5f5f5',card:'#f2f2f2',cardBorder:'#d3d3d3',control:'#eeeeee',hover:'#e0e0e0',border:'#d0d0d0',text:'#252525',muted:'#666666',heading:'#252525',taskTitle:'#252525',noteBackground:'#f8f8f8',noteText:'#252525',tagBackground:'#e0e0e0',tagText:'#303030',tile:'#eeeeee',tileIcon:'#666666',calendarGrid:'#d0d0d0',calendarEvent:'#f2f2f2',progress:'#777777',open:'#2466a8',progressStatus:'#865b00',delayed:'#7653b4',done:'#287344',high:'#aa3748',normal:'#88551d',low:'#286c7b'},dark:{canvas:'#1e1e1e',surface:'#252525',card:'#282828',cardBorder:'#414141',control:'#2b2b2b',hover:'#383838',border:'#3c3c3c',text:'#e0e0e0',muted:'#aaaaaa',heading:'#eeeeee',taskTitle:'#eeeeee',noteBackground:'#252525',noteText:'#dddddd',tagBackground:'#383838',tagText:'#dddddd',tile:'#2b2b2b',tileIcon:'#aaaaaa',calendarGrid:'#3c3c3c',calendarEvent:'#282828',progress:'#aaaaaa',open:'#8cbbef',progressStatus:'#e4c16a',delayed:'#c2a5ed',done:'#91d1a5',high:'#f0a1ac',normal:'#e5bb89',low:'#93cbd6'}};
const PREFERENCE_DEFAULTS={language:'de',theme:'obsidian',fontFamily:'inherit',fontSize:14,titleSize:28,taskFontSize:16,smallFontSize:12,calendarFontSize:12,tileFontSize:18,lineHeight:1.5,density:'comfortable',columnWidth:280,cardRadius:8,tileHeight:174,contentWidth:0,startView:'home',calendarView:'week',weekStart:1,calendarStart:7,calendarEnd:20,defaultStatus:'open',defaultPriority:'normal',defaultDuration:30,sort:'none',animations:true,showNotes:true,showTags:true,showDates:true,showProject:true,showLegend:true,showFavorites:true,autoArchive:true,colors:{light:{},dark:{}}};
const PREF_ENUMS={language:['de','en'],theme:['obsidian','light','dark'],fontFamily:['inherit','sans','serif','mono'],density:['compact','comfortable','spacious'],startView:['home','board','planner','stats','projects'],calendarView:['week','day'],defaultStatus:['open','progress','delayed'],defaultPriority:['high','normal','low'],sort:['none','due','priority','title','created']};
const PREF_NUMBERS={fontSize:[11,24],titleSize:[20,48],taskFontSize:[12,28],smallFontSize:[10,20],calendarFontSize:[10,22],tileFontSize:[14,30],lineHeight:[1.2,2],columnWidth:[220,620],cardRadius:[0,24],tileHeight:[120,320],contentWidth:[0,2400],weekStart:[0,1],calendarStart:[0,23],calendarEnd:[1,24],defaultDuration:[5,720]};
function preferences(settings={}){
  const input=settings.preferences||{},out=structuredClone(PREFERENCE_DEFAULTS);
  if(!input.startView&&settings.startView)out.startView=startView({...settings,preferences:null});
  if(!Object.hasOwn(input,'showFavorites')&&Array.isArray(settings.hiddenNavigation))out.showFavorites=!settings.hiddenNavigation.includes('favorites');
  for(const [key,values]of Object.entries(PREF_ENUMS))if(values.includes(input[key]))out[key]=input[key];
  for(const [key,[min,max]]of Object.entries(PREF_NUMBERS)){const value=input[key];if(typeof value==='number'&&Number.isFinite(value))out[key]=Math.min(max,Math.max(min,key==='lineHeight'?Math.round(value*10)/10:Math.round(value)));}
  if(out.calendarEnd<=out.calendarStart)out.calendarEnd=out.calendarStart+1;
  for(const [key,value]of Object.entries(PREFERENCE_DEFAULTS))if(typeof value==='boolean'&&typeof input[key]==='boolean')out[key]=input[key];
  for(const mode of ['light','dark'])for(const key of Object.keys(COLOR_FIELDS)){const color=input.colors?.[mode]?.[key];if(typeof color==='string'&&/^#[0-9a-f]{6}$/i.test(color))out.colors[mode][key]=color.toLowerCase();}
  return out;
}
function contrastRatio(a,b){const luminance=hex=>{const rgb=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
function sortedTasks(tasks,sort){if(sort==='none')return tasks;const ranks={high:0,normal:1,low:2};return [...tasks].sort((a,b)=>{if(sort==='priority')return (ranks[a.meta.priority]??1)-(ranks[b.meta.priority]??1);const value=t=>sort==='due'?dateValue(t.meta.due)||'9999':sort==='created'?t.meta.created||'9999':searchText(t.meta.title);return value(a).localeCompare(value(b));});}
let uiLanguage='de';
function uiLocale(){return uiLanguage==='en'?'en-GB':'de-CH';}
function effectivePreferences(plugin){return plugin?.previewPreferences||preferences(plugin?.settings);}
function applyPreferences(root,plugin){
  const p=effectivePreferences(plugin);uiLanguage=p.language;root.classList.add('tf-customized');root.dataset.tfDensity=p.density;root.dataset.tfTheme=p.theme;root.dataset.tfAnimation=String(p.animations);
  for(const key of ['Notes','Tags','Dates','Project','Legend'])root.dataset['tfShow'+key]=String(p['show'+key]);
  const dark=p.theme==='dark'||p.theme==='obsidian'&&root.ownerDocument.body.classList.contains('theme-dark'),mode=dark?'dark':'light';root.style.colorScheme=mode;
  for(const key of Object.keys(COLOR_FIELDS))root.style.removeProperty(COLOR_VARS[key]);
  // In follow mode untouched colors inherit the active Obsidian theme.
  const colors=p.theme==='obsidian'?p.colors[mode]:{...PALETTES[mode],...p.colors[mode]};for(const [key,color]of Object.entries(colors))root.style.setProperty(COLOR_VARS[key],color);
  root.style.setProperty('--tf-control-ink','var(--tf-ink)');root.style.setProperty('--background-primary','var(--tf-canvas)');root.style.setProperty('--text-normal','var(--tf-ink)');root.style.setProperty('--text-muted','var(--tf-quiet)');root.style.setProperty('--background-modifier-border','var(--tf-line)');
  // Avoid a variable cycle while following Obsidian's canvas and text variables.
  if(p.theme==='obsidian'){for(const [key,variable]of Object.entries({canvas:'--background-primary',text:'--text-normal',muted:'--text-muted',border:'--background-modifier-border'}))if(!p.colors[mode][key])root.style.removeProperty(variable);}
  const fonts={inherit:'var(--font-interface,system-ui)',sans:'system-ui,sans-serif',serif:'Georgia,serif',mono:'var(--font-monospace,monospace)'};root.style.setProperty('--tf-font-family',fonts[p.fontFamily]);
  for(const [key,variable]of Object.entries({fontSize:'font-size',titleSize:'heading-size',taskFontSize:'task-size',smallFontSize:'small-size',calendarFontSize:'calendar-size',tileFontSize:'tile-size',columnWidth:'column-width',cardRadius:'radius',tileHeight:'tile-height'}))root.style.setProperty('--tf-'+variable,p[key]+'px');
  root.style.setProperty('--tf-line-height',String(p.lineHeight));root.style.setProperty('--tf-content-width',p.contentWidth?p.contentWidth+'px':'none');
}
class SettingsModal extends Modal{
  constructor(plugin){super(plugin.app);this.plugin=plugin;this.draft=preferences(plugin.settings);this.original=JSON.stringify(this.draft);this.section='general';this.colorMode='dark';this.opened=false;}
  onOpen(){this.opened=true;this.modalEl.addClass('tf-settings-modal');this.render();}
  preview(){this.plugin.previewPreferences=structuredClone(this.draft);this.plugin.refreshPreferences();applyPreferences(this.contentEl,this.plugin);}
  render(){
    const c=this.contentEl;c.empty();c.addClass('tf-editor-modal');applyPreferences(c,this.plugin);c.createEl('h2',{text:'Settings'});c.createEl('p',{text:tr('Änderungen werden live vorgeschaut. Erst Speichern übernimmt sie dauerhaft.'),cls:'tf-muted'});
    const tabs=c.createDiv({cls:'tf-settings-tabs',attr:{role:'tablist','aria-label':'Settings'}}),body=c.createDiv({cls:'tf-settings-body'});
    for(const [key,name]of Object.entries({general:tr('Allgemein'),appearance:tr('Design & Schrift'),colors:tr('Farben im Detail'),layout:tr('Layout & Karten'),calendar:tr('Kalender & Aufgaben'),data:tr('Sichern & Zurücksetzen')})){const tab=button(tabs,tr(name),()=>{this.section=key;this.render();},'tf-settings-tab');tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(this.section===key));tab.onkeydown=e=>{if(['ArrowRight','ArrowLeft','Home','End'].includes(e.key)){e.preventDefault();const keys=['general','appearance','colors','layout','calendar','data'],at=keys.indexOf(key);this.section=keys[e.key==='Home'?0:e.key==='End'?keys.length-1:(at+(e.key==='ArrowRight'?1:-1)+keys.length)%keys.length];this.render();this.contentEl.querySelector('[role="tab"][aria-selected="true"]')?.focus();}};}
    const change=(key,value)=>{this.draft[key]=value;this.draft=preferences({preferences:this.draft});this.preview();};
    const row=(key,label,kind,options)=>{
      const group=body.createEl('label',{cls:'tf-setting-row'});group.createSpan({text:tr(label)});let input;
      if(kind==='select'){input=group.createEl('select');for(const [value,text]of Object.entries(options))input.createEl('option',{value,text:tr(text)});input.value=String(this.draft[key]);input.onchange=()=>change(key,['weekStart'].includes(key)?Number(input.value):input.value);}
      else{input=group.createEl('input',{type:kind==='boolean'?'checkbox':'number'});if(kind==='boolean'){input.checked=this.draft[key];input.onchange=()=>change(key,input.checked);}else{const [min,max]=PREF_NUMBERS[key];input.min=String(min);input.max=String(max);input.step=key==='lineHeight'?'.1':'1';input.value=String(this.draft[key]);input.onchange=()=>{if(!input.checkValidity()||input.value===''){input.value=String(this.draft[key]);return;}change(key,Number(input.value));input.value=String(this.draft[key]);};}}
      input.setAttribute('aria-label',tr(label));return input;
    };
    if(this.section==='general'){
      row('language',tr('Sprache'),'select',{de:tr('Deutsch'),en:'English'}).onchange=e=>{change('language',e.target.value);this.render();};
      row('startView',tr('Startansicht'),'select',{home:tr('Mein Tag'),board:'Board',planner:tr('Tagesplaner'),stats:tr('Statistik'),projects:tr('Projekte')});row('showFavorites',tr('Filterfavoriten anzeigen'),'boolean');row('animations',tr('Sanfte Animationen'),'boolean');
      body.createEl('p',{text:tr('Reduzierte Bewegung des Betriebssystems wird immer berücksichtigt. Aufgabentitel, Notizen und Projektinhalte werden nicht übersetzt.'),cls:'tf-muted'});
    }else if(this.section==='appearance'){
      row('theme',tr('Farbmodus'),'select',{obsidian:tr('Obsidian folgen'),light:tr('Hell'),dark:tr('Dunkel')});row('fontFamily',tr('Schriftart'),'select',{inherit:tr('Obsidian-Schrift'),sans:'System Sans',serif:'Serif',mono:'Monospace'});
      for(const [key,label]of Object.entries({fontSize:tr('Grundschriftgröße'),titleSize:tr('Seitenüberschriften'),taskFontSize:tr('Aufgabentitel-Größe'),smallFontSize:tr('Detailtext-Größe'),calendarFontSize:tr('Kalendertext-Größe'),tileFontSize:tr('Kacheltext-Größe'),lineHeight:tr('Zeilenhöhe')}))row(key,label,'number');
      body.createEl('p',{text:tr('Alle Größen in Pixeln; Zeilenhöhe als Faktor. Der Farbmodus gilt nur für TaskFlow.'),cls:'tf-muted'});
    }else if(this.section==='colors'){
      const selector=body.createEl('label',{cls:'tf-setting-row'});selector.createSpan({text:tr('Palette bearbeiten')});const select=selector.createEl('select',{attr:{'aria-label':tr('Palette bearbeiten')}});for(const [value,text]of Object.entries({light:tr('Hell'),dark:tr('Dunkel')}))select.createEl('option',{value,text:tr(text)});select.value=this.colorMode;select.onchange=()=>{this.colorMode=select.value;this.render();};
      body.createEl('p',{text:tr('Jede Farbe hat eine eigene Einstellung. Standard erbt im Modus „Obsidian folgen“ dein Obsidian-Design.'),cls:'tf-muted'});
      const grid=body.createDiv({cls:'tf-color-grid'});for(const [key,label]of Object.entries(COLOR_FIELDS)){
        const group=grid.createEl('div',{cls:'tf-color-row'});group.createSpan({text:tr(label)});const overridden=this.draft.colors[this.colorMode][key],value=overridden||PALETTES[this.colorMode][key];const picker=group.createEl('input',{type:'color',value,attr:{'aria-label':tr(label)}});const hex=group.createEl('input',{type:'text',value:overridden||'',placeholder:tr('Standard'),attr:{'aria-label':tr(label)+' HEX'}});hex.maxLength=7;
        const update=value=>{if(!/^#[0-9a-f]{6}$/i.test(value))return;this.contentEl.querySelector('.tf-settings-sample')?.style.setProperty(COLOR_VARS[key],value);this.draft.colors[this.colorMode][key]=value.toLowerCase();picker.value=value;hex.value=value;this.preview();};picker.oninput=()=>update(picker.value);hex.onchange=()=>{if(!hex.value.trim()){delete this.draft.colors[this.colorMode][key];this.preview();picker.value=PALETTES[this.colorMode][key];this.contentEl.querySelector('.tf-settings-sample')?.style.setProperty(COLOR_VARS[key],picker.value);}else if(/^#[0-9a-f]{6}$/i.test(hex.value))update(hex.value);else{hex.value=this.draft.colors[this.colorMode][key]||'';new Notice(tr('Bitte eine Farbe im Format #RRGGBB eingeben.'));}};
        button(group,tr('Standard'),()=>{delete this.draft.colors[this.colorMode][key];this.preview();this.render();},'tf-text-button');
      }
      button(body,tr('Kontrast prüfen'),()=>{const palette={...PALETTES[this.colorMode],...this.draft.colors[this.colorMode]},ratio=contrastRatio(palette.text,palette.canvas);new Notice(tr('Textkontrast')+': '+ratio.toFixed(2)+':1 · '+(ratio>=4.5?tr('Gut lesbar'):tr('Mehr Kontrast empfohlen')));},'tf-primary');
    }else if(this.section==='layout'){
      row('density',tr('Abstände'),'select',{compact:tr('Kompakt'),comfortable:tr('Normal'),spacious:tr('Großzügig')});for(const [key,label]of Object.entries({columnWidth:tr('Minimale Boardspalten-Breite'),cardRadius:tr('Kartenecken'),tileHeight:tr('Kachelhöhe'),contentWidth:tr('Maximale Inhaltsbreite (0 = volle Breite)')}))row(key,label,'number');
      for(const [key,label]of Object.entries({showNotes:tr('Notizfelder auf Karten'),showTags:tr('Tags auf Karten'),showDates:tr('Termine auf Karten'),showProject:tr('Projektname auf Karten'),showLegend:tr('Farblegende anzeigen')}))row(key,label,'boolean');
      body.createEl('p',{text:tr('Ausgeblendete Details bleiben gespeichert und im Aufgabeneditor erreichbar.'),cls:'tf-muted'});
    }else if(this.section==='calendar'){
      row('calendarView',tr('Standard-Kalenderansicht'),'select',{week:tr('Woche'),day:(uiLanguage==='en'?'Day':tr('Tag'))});row('weekStart',tr('Wochenbeginn'),'select',{1:tr('Montag'),0:tr('Sonntag')});row('calendarStart',tr('Kalenderbeginn (Stunde)'),'number');row('calendarEnd',tr('Kalenderende (Stunde)'),'number');row('defaultStatus',tr('Standardstatus neuer Aufgaben'),'select',{open:tr('Offen'),progress:tr('In Arbeit'),delayed:tr('Verzögert')});row('defaultPriority',tr('Standardpriorität'),'select',PRIORITIES);row('defaultDuration',tr('Standarddauer (Minuten)'),'number');row('sort',tr('Aufgabensortierung'),'select',{none:tr('Bisherige Reihenfolge'),due:tr('Fälligkeit'),priority:tr('Priorität'),title:tr('Titel'),created:tr('Erstellungsdatum')});row('autoArchive',tr('Erledigte Aufgaben automatisch archivieren'),'boolean');body.createEl('p',{text:tr('Termine außerhalb des Zeitfensters bleiben sichtbar. Standards gelten für neue Aufgaben; vorhandene Aufgaben werden nicht umgeschrieben.'),cls:'tf-muted'});
    }else{
      body.createEl('p',{text:tr('Export und Import enthalten nur diese Einstellungen, keine Aufgaben, Projekte, Notizen oder Zugangsdaten.'),cls:'tf-muted'});
      const json=body.createEl('textarea',{cls:'tf-settings-json',attr:{'aria-label':tr('Einstellungen JSON')}});json.rows=8;
      button(body,tr('Einstellungen exportieren'),()=>{json.value=JSON.stringify({taskflowPreferences:1,preferences:this.draft},null,2);json.focus();json.select();},'tf-primary');
      button(body,tr('Einstellungen importieren'),()=>{try{const data=JSON.parse(json.value);if(data.taskflowPreferences!==1||!data.preferences||typeof data.preferences!=='object'||Array.isArray(data.preferences))throw new Error(tr('Ungültiges Einstellungsformat.'));this.draft=preferences({preferences:data.preferences});this.preview();this.render();new Notice(tr('Import als Vorschau geladen. Zum Übernehmen speichern.'));}catch(e){new Notice(tr('Import fehlgeschlagen')+': '+e.message);}},'tf-primary');
      button(body,tr('Design und Optionen zurücksetzen'),()=>{this.draft=structuredClone(PREFERENCE_DEFAULTS);this.preview();this.render();},'tf-primary');body.createEl('p',{text:tr('Zurücksetzen betrifft nur diese Optionen und wird erst mit Speichern dauerhaft. Vollständiges Backup: Aufgabenordner und TaskFlow-Pluginordner sichern.'),cls:'tf-muted'});
    }
    if(['appearance','colors','layout'].includes(this.section)){
      const sample=body.createDiv({cls:'tf-settings-sample'});if(this.section==='colors')for(const [key,color]of Object.entries({...PALETTES[this.colorMode],...this.draft.colors[this.colorMode]}))sample.style.setProperty(COLOR_VARS[key],color);
      sample.createEl('strong',{text:uiLanguage==='en'?'Preview task':'Beispielaufgabe',cls:'tf-settings-sample-title'});sample.createEl('p',{text:uiLanguage==='en'?'Your notes and task details appear here.':'Hier stehen deine Notizen und Aufgabendetails.',cls:'tf-settings-sample-note'});
      const chips=sample.createDiv({cls:'tf-settings-sample-chips'});for(const [key,label]of Object.entries(STATES)){const chip=chips.createSpan({text:label});chip.style.color='var(--tf-status-'+key+')';}
      for(const [key,label]of Object.entries(PRIORITIES)){const chip=chips.createSpan({text:label});chip.style.color='var(--tf-priority-'+key+')';}
    }
    const error=c.createDiv({cls:'tf-form-error',attr:{role:'alert'}});error.hidden=true;const footer=c.createDiv({cls:'tf-settings-footer'});button(footer,tr('Abbrechen'),()=>this.close(),'tf-editor-cancel');const save=button(footer,tr('Speichern'),async()=>{save.disabled=true;try{await this.plugin.savePreferences(this.draft,this.original);this.close();}catch(e){error.setText(tr(e.message));error.hidden=false;save.disabled=false;}},'tf-editor-save');
  }
  onClose(){this.opened=false;delete this.plugin.previewPreferences;this.plugin.refreshPreferences();this.contentEl.empty();}
}

class FilterNameModal extends Modal{
  constructor(view,preset=null){super(view.app);this.view=view;this.preset=preset;}
  onOpen(){
    const c=this.contentEl;c.addClass('tf-editor-modal');applyPreferences(c,this.plugin||this.view.plugin);this.modalEl.addClass('tf-task-modal');
    const box=c.createDiv({cls:'tf-preset-dialog'});box.createEl('h2',{text:this.preset?tr('Filter umbenennen'):tr('Filter speichern')});
    const form=box.createEl('form'),label=form.createEl('label',{cls:'tf-form-field'});label.createSpan({text:tr('Name')});const input=label.createEl('input',{type:'text',value:this.preset?.name||'',placeholder:tr('Zum Beispiel: Arbeit diese Woche')});input.setAttribute('aria-label',tr('Filtername'));input.maxLength=80;
    const error=form.createDiv({cls:'tf-form-error',attr:{role:'alert'}});error.hidden=true;
    const actions=form.createDiv({cls:'tf-editor-footer'});const cancel=button(actions,tr('Abbrechen'),()=>this.close(),'tf-editor-cancel');cancel.type='button';const save=actions.createEl('button',{type:'submit',text:tr('Speichern'),cls:'tf-editor-save'});
    form.onsubmit=async event=>{event.preventDefault();save.disabled=true;error.hidden=true;try{const id=await this.view.plugin.storeFilter(input.value,this.preset?null:this.view.filterValues(),this.preset?.id);this.view.currentPreset=id;this.view.render();this.close();}catch(e){error.setText(tr(e.message));error.hidden=false;save.disabled=false;}};input.focus();
  }
  onClose(){this.contentEl.empty();}
}
class TrashModal extends Modal{
  constructor(plugin,task,onSuccess){super(plugin.app);this.plugin=plugin;this.task=task;this.onSuccess=onSuccess;}
  onOpen(){
    const c=this.contentEl;c.addClass('tf-editor-modal');applyPreferences(c,this.plugin||this.view.plugin);c.createEl('h2',{text:tr('In den Papierkorb verschieben')});
    c.createEl('p',{text:this.task.meta.title});let scope=this.task.meta.recurrence?'series':'single';
    if(isSeriesTask(this.task)){
      if(this.task.meta.recurrence)c.createEl('p',{text:tr('Dieser erste Termin enthält die Serienregel. Die gesamte Serie mit ihren erfassten Terminen wird in den Papierkorb verschoben und erzeugt keine weiteren Termine. Du kannst sie dort wiederherstellen.')});
      else{const label=c.createEl('label',{cls:'tf-form-field'});label.createSpan({text:tr('Löschen anwenden auf')});const select=label.createEl('select',{attr:{'aria-label':tr('Löschen anwenden auf')}});select.createEl('option',{value:'single',text:tr('Nur diesen Termin')});select.createEl('option',{value:'series',text:tr('Gesamte Serie / Serienabschnitt')});select.onchange=()=>scope=select.value;}
    }
    c.createEl('p',{text:tr('Notizen und Teilaufgaben bleiben bis zum endgültigen Leeren im Papierkorb erhalten. Nicht gespeicherte Änderungen im Editor werden nicht übernommen.'),cls:'tf-muted'});
    const error=c.createDiv({cls:'tf-form-error',attr:{role:'alert'}});error.hidden=true;const actions=c.createDiv({cls:'tf-editor-footer'}),cancel=button(actions,tr('Abbrechen'),()=>this.close(),'tf-editor-cancel');
    const confirm=button(actions,tr('In Papierkorb verschieben'),async()=>{confirm.disabled=true;cancel.disabled=true;try{await this.plugin.moveToTrash(this.task,scope);this.close();this.onSuccess();}catch(e){error.setText(tr(e.message));error.hidden=false;confirm.disabled=false;cancel.disabled=false;}},'tf-editor-save');
  }
  onClose(){this.contentEl.empty();}
}
class EmptyTrashModal extends Modal{
  constructor(plugin){super(plugin.app);this.plugin=plugin;this.snapshot=plugin.tasks.filter(t=>t.meta.trashed);}
  onOpen(){
    const c=this.contentEl;c.addClass('tf-editor-modal');applyPreferences(c,this.plugin||this.view.plugin);c.createEl('h2',{text:tr('Papierkorb endgültig leeren?')});
    c.createEl('p',{text:tfmt(tr("{0} Aufgabendateien mit Notizen und Teilaufgaben werden dauerhaft gelöscht. Das kann in TaskFlow nicht rückgängig gemacht werden."),this.snapshot.length)});
    const error=c.createDiv({cls:'tf-form-error',attr:{role:'alert'}});error.hidden=true;const actions=c.createDiv({cls:'tf-editor-footer'}),cancel=button(actions,tr('Abbrechen'),()=>this.close(),'tf-editor-cancel');
    const confirm=button(actions,tr('Endgültig leeren'),async()=>{confirm.disabled=true;cancel.disabled=true;try{await this.plugin.emptyTrash(this.snapshot);this.close();}catch(e){error.setText(tr(e.message));error.hidden=false;confirm.disabled=true;cancel.disabled=false;cancel.setText(tr('Schließen und Papierkorb prüfen'));}},'tf-editor-save');
    cancel.focus();
  }
  onClose(){this.contentEl.empty();}
}
class ProjectEditor extends Modal{
  constructor(plugin,project=null){super(plugin.app);this.plugin=plugin;this.project=project;}
  onOpen(){
    const c=this.contentEl;c.addClass('tf-editor-modal');applyPreferences(c,this.plugin||this.view.plugin);this.modalEl.addClass('tf-task-modal');c.createEl('h2',{text:this.project?tr('Projekt bearbeiten'):tr('Neues Projekt')});
    const form=c.createEl('form'),data=this.project?structuredClone(this.project):{name:'',description:'',note:'',archived:false};
    for(const [key,label,placeholder]of [['name',tr('Projektname'),tr('Zum Beispiel: Website')],['description',tr('Beschreibung'),tr('Ziel und nächste Schritte')],['note',tr('Projektnotiz'),tr('Zum Beispiel: Projekte/Website.md')]]){
      const row=form.createEl('label',{cls:'tf-form-field'});row.createSpan({text:label});const input=row.createEl(key==='description'?'textarea':'input',{attr:{'aria-label':label},placeholder});input.value=data[key];input.maxLength=key==='name'?80:key==='note'?500:2000;if(key==='description')input.rows=4;input.oninput=()=>data[key]=input.value;
    }
    form.createEl('p',{text:tr('Projektnotiz: optionaler Pfad zu einer vorhandenen Notiz im Vault. Aufgaben ordnest du im Aufgabeneditor zu.'),cls:'tf-muted'});
    const row=form.createEl('label',{cls:'tf-form-field'});row.createSpan({text:tr('Projekt archiviert')});const archived=row.createEl('input',{type:'checkbox',attr:{'aria-label':tr('Projekt archiviert')}});archived.checked=data.archived;archived.onchange=()=>data.archived=archived.checked;
    form.createEl('p',{text:tr('Archivieren blendet das Projekt aus der aktiven Projektübersicht aus. Aufgaben behalten ihren Status und ihre Termine.'),cls:'tf-muted'});
    const error=form.createDiv({cls:'tf-form-error',attr:{role:'alert'}});error.hidden=true;const actions=form.createDiv({cls:'tf-editor-footer'});const cancel=button(actions,tr('Abbrechen'),()=>this.close(),'tf-editor-cancel');cancel.type='button';const save=actions.createEl('button',{type:'submit',text:tr('Projekt speichern'),cls:'tf-editor-save'});
    form.onsubmit=async event=>{event.preventDefault();save.disabled=true;try{await this.plugin.storeProject(data,this.project);this.close();}catch(e){error.setText(tr(e.message));error.hidden=false;save.disabled=false;}};
  }
  onClose(){this.contentEl.empty();}
}
class TaskEditor extends Modal {
  constructor(plugin,task,status=null,scheduled='',priority=null,initialTime='',options={}){super(plugin.app);this.plugin=plugin;this.task=task;this.initialStatus=status;this.initialScheduled=scheduled;this.initialPriority=priority;this.initialTime=initialTime;this.options=options;}
  onOpen(){
    const c=this.contentEl;c.addClass('tf-editor-modal');applyPreferences(c,this.plugin||this.view.plugin);this.modalEl.addClass('tf-task-modal');
    const data=this.task?structuredClone(this.task.meta):{taskflow:1,title:'',status:this.initialStatus||effectivePreferences(this.plugin).defaultStatus,priority:this.initialPriority||effectivePreferences(this.plugin).defaultPriority,durationMinutes:effectivePreferences(this.plugin).defaultDuration,tags:[],due:'',scheduled:this.initialScheduled,scheduledTime:this.initialTime,created:new Date().toISOString()};
    const seriesSource=this.task?(data.recurrence?this.task:this.plugin.tasks.find(t=>t.meta.id===data.recurrenceSeries&&t.meta.recurrence)):null;let scope=seriesSource&&this.options.scope==='future'?'future':'single';
    const original=this.task?.body||'',parsed=editorSubtasks(original);let items=parsed.items.map(x=>({...x}));
    const header=c.createDiv({cls:'tf-editor-header'});header.createEl('h2',{text:this.task?tr('Aufgabe bearbeiten'):tr('Neue Aufgabe')});header.createEl('p',{text:tr('Ein klarer nächster Schritt. Details und Teilaufgaben ergänzt du darunter.')});
    const form=c.createEl('form',{cls:'tf-task-form'});form.noValidate=true;
    const field=(parent,name,type,value,change,placeholder='')=>{
      const label=parent.createEl('label',{cls:'tf-form-field'});label.createSpan({text:name});const input=label.createEl('input',{type,value:String(value??''),placeholder});input.setAttribute('aria-label',name);input.oninput=()=>change(input.value);return input;
    };
    if(seriesSource){const label=form.createEl('label',{cls:'tf-form-field'});label.createSpan({text:tr('Änderungen anwenden auf')});const choice=label.createEl('select');choice.setAttribute('aria-label',tr('Änderungen anwenden auf'));choice.createEl('option',{value:'single',text:tr('Nur diesen Termin')});choice.createEl('option',{value:'future',text:tr('Diesen und folgende Termine')});choice.value=scope;choice.onchange=()=>{scope=choice.value;this.updateSeriesScope?.(scope);};}
    const title=field(form,tr('Aufgabentitel'),'text',data.title,v=>data.title=v,tr('Was möchtest du erledigen?'));title.addClass('tf-task-title-input');
    const details=form.createDiv({cls:'tf-form-grid'});
    const dropdown=(name,values,value,change)=>{const label=details.createEl('label',{cls:'tf-form-field'});label.createSpan({text:name});const select=label.createEl('select');select.setAttribute('aria-label',name);for(const [key,text]of Object.entries(values))select.createEl('option',{value:key,text});select.value=value;select.onchange=()=>change(select.value);};
    dropdown('Status',STATES,data.status,v=>data.status=v);dropdown(tr('Priorität'),PRIORITIES,data.priority||'normal',v=>data.priority=v);
    const dueInput=field(details,tr('Fällig am'),'date',dateValue(data.due),v=>data.due=v);
    field(details,'Tags','text',(data.tags||[]).join(', '),v=>data.tags=[...new Set(v.split(',').map(t=>t.trim().replace(/^#/, '')).filter(Boolean))],tr('arbeit, privat, projekt'));
    const projectRow=form.createEl('label',{cls:'tf-form-field'});projectRow.createSpan({text:tr('Projekt')});const projectSelect=projectRow.createEl('select',{attr:{'aria-label':tr('Projekt')}});projectSelect.createEl('option',{value:'',text:tr('Ohne Projekt')});
    const knownProjects=projects(this.plugin.settings);for(const project of knownProjects.filter(p=>!p.archived||p.id===data.taskflowProject))projectSelect.createEl('option',{value:project.id,text:project.name+(project.archived?tr(' · archiviert'):'')});
    if(data.taskflowProject&&!knownProjects.some(p=>p.id===data.taskflowProject))projectSelect.createEl('option',{value:data.taskflowProject,text:tr('Unbekanntes Projekt · ')+data.taskflowProject});
    projectSelect.value=data.taskflowProject||'';projectSelect.onchange=()=>data.taskflowProject=projectSelect.value;
    const planning=form.createEl('details',{cls:'tf-form-planning'});planning.open=!!dateValue(data.scheduled);planning.createEl('summary',{text:tr('Tagesplanung · optional')});
    planning.createEl('p',{text:tr('Plane einen Arbeitstag und bei Bedarf einen Zeitblock. Die Fälligkeit bleibt eine eigene Deadline.')});
    const planFields=planning.createDiv({cls:'tf-planning-fields'});
    field(planFields,tr('Geplant am'),'date',dateValue(data.scheduled),v=>{data.scheduled=v;if(!v){data.scheduledTime='';time.value='';}});
    const time=field(planFields,tr('Startzeit'),'time',data.scheduledTime||'',v=>data.scheduledTime=v);
    const duration=field(planFields,tr('Dauer in Minuten'),'number',durationMinutes(data),v=>data.durationMinutes=v===''?30:Number(v));duration.min='5';duration.max='720';duration.step='5';
    const repeat=form.createDiv({cls:'tf-form-section tf-recurrence'});
    if(data.recurrenceSeries&&!seriesSource){repeat.createEl('p',{text:tr('Die ursprüngliche Serie fehlt. Änderungen gelten nur für diesen Termin.'),cls:'tf-muted'});}
    else{
      const existing=seriesSource?.meta.recurrence||data.recurrence,rule=existing?structuredClone(existing):{enabled:true,frequency:'weekly',interval:1,start:dateValue(data.scheduled)||dateValue(data.due)||today(),time:data.scheduledTime||'',durationMinutes:durationMinutes(data),until:''};
      if(seriesSource){rule.start=dateValue(data.scheduled)||dateValue(data.due)||dateValue(data.recurrenceDate)||rule.start;rule.time=data.scheduledTime||'';rule.durationMinutes=durationMinutes(data);if(rule.until&&rule.until<rule.start)rule.until='';repeat.hidden=true;}
      const label=repeat.createEl('label',{cls:'tf-form-field'});label.createSpan({text:tr('Wiederholen')});const select=label.createEl('select');select.setAttribute('aria-label',tr('Wiederholen'));
      for(const [key,text]of Object.entries({none:seriesSource?tr('Serie ab hier beenden'):tr('Keine Wiederholung'),...RECURRENCES}))select.createEl('option',{value:key,text});select.value=existing&&existing.enabled!==false?rule.frequency:this.options.repeat&&!this.task?'weekly':'none';
      const repeatFields=repeat.createDiv({cls:'tf-recurrence-fields'});repeatFields.hidden=select.value==='none';
      const interval=field(repeatFields,tr('Alle … Tage / Wochen / Monate'),'number',rule.interval,v=>rule.interval=Number(v));interval.min='1';interval.max='365';interval.step='1';
      field(repeatFields,tr('Erster Termin'),'date',rule.start,v=>{rule.start=v;if(validDay(v)){rule.monthDay=Number(v.slice(8,10));month.value=String(rule.monthDay);}});
      const month=field(repeatFields,tr('Monatstag (1–31)'),'number',existing?.frequency==='monthly'?(existing.monthDay||Number(existing.start.slice(8,10))):Number(rule.start.slice(8,10)),v=>rule.monthDay=Number(v));month.min='1';month.max='31';month.step='1';month.parentElement.hidden=select.value!=='monthly';
      field(repeatFields,tr('Uhrzeit je Termin (optional)'),'time',rule.time,v=>rule.time=v);
      const length=field(repeatFields,tr('Termindauer in Minuten'),'number',rule.durationMinutes,v=>rule.durationMinutes=Number(v));length.min='5';length.max='720';length.step='5';
      field(repeatFields,tr('Letzter Termin (optional)'),'date',rule.until||'',v=>rule.until=v);
      repeatFields.createEl('p',{text:tr('Der erste Termin bestimmt den Rhythmus. Bei „Diesen und folgende“ werden offene Folgetermine angepasst. Erledigte, archivierte, übersprungene und einzeln geänderte Folgetermine bleiben erhalten. Nicht mehr passende offene Termine kommen ins Archiv. Status gilt nur für den gewählten Termin.'),cls:'tf-muted'});
      select.onchange=()=>{repeatFields.hidden=select.value==='none';month.parentElement.hidden=select.value!=='monthly';};this.updateSeriesScope=value=>{repeat.hidden=value!=='future';planning.hidden=value==='future';dueInput.parentElement.hidden=value==='future';};if(seriesSource)this.updateSeriesScope(scope);
      this.readRecurrence=()=>{
        if(seriesSource&&scope==='single')return;
        rule.enabled=select.value!=='none';if(rule.enabled)rule.frequency=select.value;if(rule.frequency==='monthly')rule.monthDay=Number(month.value);else delete rule.monthDay;
        if(!validDay(rule.start))throw new Error(tr('Bitte einen gültigen ersten Termin eingeben.'));validateRecurrence(rule);
        if(seriesSource)this.pendingSeriesRule=structuredClone(rule);
        else if(rule.enabled)data.recurrence=rule;else delete data.recurrence;
        if(rule.enabled&&!seriesSource){data.due=rule.start;data.scheduled=rule.start;data.scheduledTime=rule.time||'';data.durationMinutes=rule.durationMinutes;}
      };
    }
    const notesSection=form.createDiv({cls:'tf-form-section'});notesSection.createEl('h3',{text:tr('Notizen')});
    const notes=notesSection.createEl('textarea',{cls:'tf-note-editor',placeholder:tr('Gedanken, Links oder weitere Details …')});notes.value=parsed.notes;notes.rows=5;notes.setAttribute('aria-label',tr('Notizen'));
    const subSection=form.createDiv({cls:'tf-form-section'}),subHeader=subSection.createDiv({cls:'tf-subtask-editor-header'});subHeader.createEl('h3',{text:tr('Teilaufgaben')});const count=subHeader.createSpan({cls:'tf-muted'});
    const rows=subSection.createDiv({cls:'tf-subtask-editor-rows'});
    const addItem=()=>{items.push({id:null,text:'',done:false});renderRows(items.length-1);};
    const add=button(subHeader,tr('+ Teilaufgabe'),addItem,'tf-add-subtask');add.type='button';
    function renderRows(focusIndex){
      rows.empty();count.setText(items.filter(x=>x.done).length+'/'+items.length);
      if(!items.length)rows.createDiv({text:tr('Zerlege die Aufgabe in kleine, konkrete Schritte.'),cls:'tf-subtask-editor-empty'});
      items.forEach((item,index)=>{
        const row=rows.createDiv({cls:'tf-subtask-editor-row'}),check=row.createEl('input',{type:'checkbox'});check.checked=item.done;check.setAttribute('aria-label',tr('Teilaufgabe ')+(index+1)+tr(' erledigt'));check.onchange=()=>{item.done=check.checked;count.setText(items.filter(x=>x.done).length+'/'+items.length);};
        const input=row.createEl('input',{type:'text',value:item.text,placeholder:tr('Nächster Schritt …')});input.setAttribute('aria-label',tr('Teilaufgabe ')+(index+1));input.oninput=()=>item.text=input.value;
        input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();items.splice(index+1,0,{id:null,text:'',done:false});renderRows(index+1);}};
        const remove=button(row,'×',()=>{items.splice(index,1);renderRows(Math.min(index,items.length-1));},'tf-remove-subtask');remove.type='button';remove.setAttribute('aria-label',tr('Teilaufgabe ')+(index+1)+tr(' entfernen'));
        if(index===focusIndex)input.focus();
      });
    }
    renderRows();
    let busy=false;const error=form.createDiv({cls:'tf-form-error',attr:{role:'alert'}});error.hidden=true;
    const footer=form.createDiv({cls:'tf-editor-footer'});const cancel=button(footer,tr('Abbrechen'),()=>this.close(),'tf-editor-cancel');cancel.type='button';const save=footer.createEl('button',{text:this.task?tr('Änderungen speichern'):tr('Aufgabe erstellen'),type:'submit',cls:'tf-editor-save'});
    form.onsubmit=async event=>{
      event.preventDefault();if(busy)return;error.hidden=true;
      if(!data.title.trim()){error.setText(tr('Bitte gib deiner Aufgabe einen Titel.'));error.hidden=false;title.focus();return;}
      const blank=items.findIndex(x=>!x.text.trim()||/[\r\n]/.test(x.text));
      if(blank>=0){error.setText(tr('Bitte fülle die leere Teilaufgabe aus oder entferne sie.'));error.hidden=false;rows.querySelectorAll('input[type="text"]')[blank]?.focus();return;}
      let payload;try{this.readRecurrence?.();payload=structuredClone(data);if(scope==='future'&&this.pendingSeriesRule){const rule=this.pendingSeriesRule;payload.due=rule.start;payload.scheduled=rule.start;payload.scheduledTime=rule.time||'';payload.durationMinutes=rule.durationMinutes;}validatePlanning(payload);}catch(e){error.setText(tr(e.message));error.hidden=false;planning.open=true;return;}
      busy=true;save.disabled=true;cancel.disabled=true;
      try{payload.title=payload.title.trim();await this.plugin.saveScopedTask(this.task,payload,editorBody(original,notes.value,items),scope,this.pendingSeriesRule,seriesSource);this.close();}
      catch(e){busy=false;error.setText(tr(e.message||String(e)));error.hidden=false;save.disabled=false;cancel.disabled=false;}
    };
    if(this.task&&(seriesSource||data.recurrenceSeries)){const skip=button(footer,tr('Diesen Termin überspringen'),async()=>{if(busy)return;busy=true;skip.disabled=true;save.disabled=true;cancel.disabled=true;try{await this.plugin.skipOccurrence(this.task);this.close();}catch(e){busy=false;error.setText(tr(e.message));error.hidden=false;skip.disabled=false;save.disabled=false;cancel.disabled=false;}},'tf-editor-cancel');skip.type='button';}
    if(this.task&&!this.task.meta.trashed){const remove=button(footer,tr('Löschen'),()=>{if(!busy)new TrashModal(this.plugin,this.task,()=>this.close()).open();},'tf-editor-cancel');remove.type='button';}
    form.onkeydown=e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();form.requestSubmit();}};
    title.focus();
  }
  onClose(){this.contentEl.empty();}
}
class TaskView extends ItemView {
  constructor(leaf,plugin){super(leaf);this.plugin=plugin;this.projectFilter='';this.projectId='';this.projectArchive=false;this.projectExpanded=false;this.query='';this.tag='';this.statusFilter='';this.priorityFilter='';this.dueFilter='';this.filtersOpen=false;this.currentPreset='';this.searchIndex=new WeakMap();this.mode=startView(plugin.settings);this.homeExpanded=new Set();this.homeTaskDetails=new Set();this.boardMode='tasks';this.seriesQuery='';this.expandedSeries=new Set();this.plannerDate=today();this.plannerMode='agenda';this.calendarSpan=preferences(plugin.settings).calendarView;this.showArchive=false;this.archiveMode='tasks';this.statsDays=14;this.expandedTasks=new Set();this.noteDrafts=new Map();this.animations=new Set();this.closed=false;}
  getViewType(){return VIEW;} getDisplayText(){return 'TaskFlow';} getIcon(){return 'kanban-square';}
  async onOpen(){this.closed=false;this.render();}
  async onClose(){clearTimeout(this.searchTimer);this.calendarPointerCleanup?.();this.closed=true;for(const a of this.animations)a.cancel();this.animations.clear();}
  captureCards(){
    const cards=new Map();
    for(const el of this.contentEl.querySelectorAll('.tf-card'))cards.set(el.dataset.path,{rect:el.getBoundingClientRect(),status:el.dataset.status});
    return cards;
  }
  animateMoves(previous){
    const win=this.contentEl.ownerDocument.defaultView;
    if(!effectivePreferences(this.plugin).animations||win.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    for(const el of this.contentEl.querySelectorAll('.tf-card')){
      const old=previous.get(el.dataset.path);
      if(!old||old.status===el.dataset.status||typeof el.animate!=='function')continue;
      const next=el.getBoundingClientRect();
      if(Math.abs(old.rect.left-next.left)+Math.abs(old.rect.top-next.top)<1)continue;
      const shadow=win.getComputedStyle(el).getPropertyValue('--tf-lift-shadow').trim();
      el.addClass('tf-in-flight');
      const animation=el.animate(moveFrames(old.rect,next,shadow),{duration:430,easing:'cubic-bezier(.22,.65,.28,1)'});
      this.animations.add(animation);
      const finish=()=>{el.removeClass('tf-in-flight');this.animations.delete(animation);};
      animation.finished.then(finish,finish);
    }
  }
  render(){
    clearTimeout(this.searchTimer);if(this.closed)return;
    this.calendarPointerCleanup?.();
    const c=this.contentEl;
    // End an interrupted movement before measuring the stable board positions.
    for(const a of this.animations)a.cancel();this.animations.clear();
    const previous=this.captureCards();
    const active=c.ownerDocument.activeElement;
    const focus=active&&c.contains(active)&&active.dataset.tfFocus?{key:active.dataset.tfFocus,start:active.selectionStart,end:active.selectionEnd}:null;
    const scroll=c.scrollTop;
    c.empty();c.addClass('tf-root');applyPreferences(c,this.plugin);
    const all=tasksForView(this.plugin.tasks.filter(t=>this.mode==='stats'&&!this.showArchive?(!t.meta.archived||t.meta.status==='done'):!!t.meta.archived===this.showArchive),this.mode,this.plannerMode,this.showArchive),s=summarize(all);
    const shell=c.createDiv({cls:'tf-shell'});
    const workspace=shell.createDiv({cls:'tf-workspace'});
    const tags=[...new Set(all.flatMap(t=>t.meta.tags||[]))].sort();
    const presets=savedFilters(this.plugin.settings);
    const main=workspace.createDiv({cls:'tf-main'});
    const navigation=main.createDiv({cls:'tf-home-navigation'});
    button(navigation,'Settings',()=>new SettingsModal(this.plugin).open(),'tf-home-return tf-open-settings');
    const homeButton=button(navigation,this.mode==='home'&&!this.showArchive?tr('Hauptmenü'):tr('← Zum Hauptmenü'),()=>this.goHome(),'tf-home-return');
    if(this.mode==='home'&&!this.showArchive){homeButton.disabled=true;homeButton.setAttribute('aria-current','page');}
    const header=main.createDiv({cls:'tf-header'}),title=header.createDiv();
    title.createEl('h1',{text:this.showArchive?(this.archiveMode==='trash'?tr('Papierkorb'):this.mode==='stats'?tr('Archiv · Statistik'):tr('Archiv')):this.mode==='home'?tr('Mein Tag'):this.mode==='projects'?tr('Projekte'):this.mode==='stats'?tr('Analyse & Statistik'):this.mode==='planner'?tr('Tagesplaner'):this.boardMode==='series'?tr('Wiederholtermine'):tr('Meine Aufgaben')});
    title.createEl('p',{text:new Date().toLocaleDateString(uiLocale(),{weekday:'long',day:'numeric',month:'long'})+tr(' · Mein Arbeitsbereich'),cls:'tf-muted tf-subtitle'});
    const managingSeries=this.mode==='board'&&!this.showArchive&&this.boardMode==='series';
    if(canCreateTasks(this.mode,this.showArchive))button(header,managingSeries?tr('+ Neue Wiederholung'):tr('+ Neue Aufgabe'),()=>new TaskEditor(this.plugin,null,effectivePreferences(this.plugin).defaultStatus,managingSeries?today():'',effectivePreferences(this.plugin).defaultPriority,'',{repeat:managingSeries}).open(),'tf-primary');
    if(this.mode==='board'&&!this.showArchive){const tabs=main.createDiv({cls:'tf-planner-modes',attr:{'aria-label':tr('Boardansicht')}});for(const [key,label]of Object.entries({tasks:tr('Aufgaben'),series:tr('Wiederholtermine')})){const b=button(tabs,label,()=>{this.boardMode=key;this.render();},'tf-planner-mode'+(this.boardMode===key?' is-active':''));b.setAttribute('aria-pressed',String(this.boardMode===key));}}
    if(this.showArchive){const tabs=main.createDiv({cls:'tf-planner-modes',attr:{'aria-label':tr('Archivansicht')}});for(const [key,label]of Object.entries({tasks:tr('Archivierte Aufgaben'),trash:tr('Papierkorb')})){const b=button(tabs,label,()=>{this.archiveMode=key;this.render();},'tf-planner-mode'+(this.archiveMode===key?' is-active':''));b.setAttribute('aria-pressed',String(this.archiveMode===key));}}
    if(this.mode==='board'&&!managingSeries&&!(this.showArchive&&this.archiveMode==='trash')){
    const summary=main.createDiv({cls:'tf-summary'});
    for(const [key,label]of Object.entries({total:tr('gesamt'),open:tr('offen'),progress:tr('in Arbeit'),delayed:tr('verzögert'),done:tr('erledigt')})){
      const item=summary.createSpan();item.createEl('strong',{text:String(s[key])});item.appendText(' '+label);
    }
    const focusBar=main.createDiv({cls:'tf-focusbar'});
    const dueToday=all.filter(t=>t.meta.status!=='done'&&dateValue(t.meta.due)===today());
    focusBar.createEl('strong',{text:this.showArchive?tr('Archiv'): tr('Heute im Fokus')});
    focusBar.createSpan({text:this.showArchive?tfmt(tr("{0} archivierte Aufgaben"),all.length):dueToday.length?dueToday.map(t=>t.meta.title).slice(0,2).join(' · '):tr('Keine Aufgaben heute fällig'),cls:'tf-focus-text'});
    focusBar.createSpan({text:s.overdue?tfmt(tr("{0} überfällig"),s.overdue):tr('Keine überfälligen Aufgaben'),cls:s.overdue?'tf-due tf-due-late':'tf-muted'});
    }
    if(this.mode==='projects'){this.renderProjects(main);}else if(this.showArchive&&this.archiveMode==='trash'){this.renderTrash(main);}else if(this.mode==='home'&&!this.showArchive){this.renderHome(main,all,presets);}else if(managingSeries){this.renderSeries(main);}else{
    const toolbar=main.createDiv({cls:'tf-toolbar'});
    toolbar.createSpan({text:this.mode==='planner'?tr('FOKUS FÜR DEN TAG · ÜBERBLICK FÜR DIE WOCHE'):this.mode==='stats'?tr('STATISTIK'):tr('KANBAN / ')+(this.showArchive?tr('ARCHIV'):tr('ALLE AUFGABEN')),cls:'tf-eyebrow'});
    if(this.showArchive)button(toolbar,this.mode==='stats'?'Kanban':tr('Statistik'),()=>{this.mode=this.mode==='stats'?'board':'stats';this.render();},'tf-text-button');
    const filters=toolbar.createDiv({cls:'tf-filters'});
    const search=filters.createEl('input',{type:'search',placeholder:tr('Todos durchsuchen …'),cls:'tf-search'});search.value=this.query;search.dataset.tfFocus='search';search.setAttribute('aria-label',tr('Aufgaben suchen'));search.setAttribute('title',tr('Titel, Notizen, Teilaufgaben, Tags und Daten durchsuchen · mehrere Begriffe kombinieren'));
    const activeCount=[this.projectFilter,this.tag,this.statusFilter,this.priorityFilter,this.dueFilter].filter(Boolean).length;
    const toggle=button(filters,'Filter'+(activeCount?' · '+activeCount:''),()=>{this.filtersOpen=!this.filtersOpen;fields.hidden=!this.filtersOpen;toggle.setAttribute('aria-expanded',String(this.filtersOpen));},'tf-filter-toggle');toggle.setAttribute('aria-expanded',String(this.filtersOpen));
    const fields=filters.createDiv({cls:'tf-filter-fields'});fields.hidden=!this.filtersOpen;
    const dropdown=(name,values,key)=>{
      const label=fields.createEl('label');label.createSpan({text:name});const select=label.createEl('select');select.setAttribute('aria-label',name);select.dataset.tfFocus=key;
      for(const [value,text]of Object.entries(values))select.createEl('option',{value,text});select.value=this[key];select.onchange=()=>{this.currentPreset='';this[key]=select.value;this.filtersOpen=true;this.render();};return select;
    };
    if(this.tag&&!tags.includes(this.tag))tags.push(this.tag);
    dropdown(tr('Tag'),{'':tr('Alle Tags'),...Object.fromEntries(tags.map(tag=>[tag,'#'+tag]))},'tag');
    dropdown(tr('Projekt'),{'':tr('Alle Projekte'),__none__:tr('Ohne Projekt'),...Object.fromEntries(projects(this.plugin.settings).map(p=>[p.id,p.name+(p.archived?tr(' · archiviert'):'')]))},'projectFilter');
    dropdown('Status',{'':tr('Alle Status'),...STATES},'statusFilter');
    dropdown(tr('Priorität'),{'':tr('Alle Prioritäten'),...PRIORITIES},'priorityFilter');
    dropdown(tr('Fälligkeit'),DUE_FILTERS,'dueFilter').setAttribute('title',tr('Nächste 7 Tage: heute bis einschließlich ')+shiftDay(today(),6));
    const presetActions=fields.createDiv({cls:'tf-preset-actions'});
    button(presetActions,tr('Filter speichern'),()=>new FilterNameModal(this).open(),'tf-text-button');
    const current=presets.find(p=>p.id===this.currentPreset);
    if(current){button(presetActions,tr('Umbenennen'),()=>new FilterNameModal(this,current).open(),'tf-text-button');button(presetActions,tr('Gespeicherten Filter löschen'),async()=>{try{await this.plugin.deleteFilter(current.id);this.currentPreset='';this.render();}catch(e){report(e);}},'tf-text-button');}
    const results=main.createDiv({cls:'tf-results'});
    search.oninput=event=>{this.currentPreset='';this.query=search.value;clearTimeout(this.searchTimer);if(event.isComposing)return;this.searchTimer=setTimeout(()=>{if(!this.closed&&results.isConnected)this.render();},120);};
    search.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();this.currentPreset='';this.query='';this.render();this.contentEl.querySelector('[data-tf-focus="search"]')?.focus();}};
    this.renderResults(results,all);
    }
    const footer=main.createDiv({cls:'tf-footer'});footer.createSpan({text:this.plugin.settings.folder});footer.createSpan({text:'TaskFlow '+this.plugin.manifest.version});
    c.scrollTop=scroll;
    if(focus){const target=c.querySelector(`[data-tf-focus="${focus.key}"]`);if(target){target.focus({preventScroll:true});if((target.type==='search'||target.tagName==='TEXTAREA')&&Number.isInteger(focus.start))target.setSelectionRange(focus.start,focus.end);}}
    this.animateMoves(previous);
  }
  renderProjects(c){
    const list=projects(this.plugin.settings),selected=list.find(p=>p.id===this.projectId),toolbar=c.createDiv({cls:'tf-toolbar'});
    if(selected){
      button(toolbar,tr('← Alle Projekte'),()=>{this.projectId='';this.projectExpanded=false;this.render();},'tf-text-button');
      button(toolbar,tr('Projekt bearbeiten'),()=>new ProjectEditor(this.plugin,selected).open(),'tf-primary');
      c.createEl('h2',{text:selected.name,cls:'tf-project-heading'});if(selected.description)c.createEl('p',{text:selected.description,cls:'tf-project-description'});
      if(selected.note)button(c,tr('Projektnotiz öffnen'),()=>this.app.workspace.openLinkText(selected.note,'',false),'tf-primary');
      const summary=projectSummary(this.plugin.tasks,selected.id);this.projectProgress(c,summary);
      const actions=c.createDiv({cls:'tf-preset-actions'});button(actions,tr('Aufgaben im Board'),()=>{Object.assign(this,homeDestination('board'));this.resetFilters();this.projectFilter=selected.id;this.render();},'tf-text-button');button(actions,tr('Termine im Kalender'),()=>{Object.assign(this,homeDestination('calendar'));this.resetFilters();this.projectFilter=selected.id;this.render();},'tf-text-button');
      c.createEl('p',{text:tr('Serientermine werden im Fortschritt einzeln gezählt. Das Board zeigt weiterhin nur Einzelaufgaben; alle datierten Aufgaben findest du im Kalender.'),cls:'tf-muted'});
      const tasks=projectTasks(this.plugin.tasks,selected.id).sort((a,b)=>Number(a.meta.status==='done')-Number(b.meta.status==='done')||(dateValue(a.meta.due)||'9999').localeCompare(dateValue(b.meta.due)||'9999')||a.file.path.localeCompare(b.file.path));
      if(!tasks.length)c.createDiv({text:tr('Noch keine Aufgaben zugeordnet. Öffne im Board eine Aufgabe und wähle dieses Projekt.'),cls:'tf-filter-empty'});
      for(const task of this.projectExpanded?tasks:tasks.slice(0,20)){
        if(task.meta.status!=='done')this.homeTask(c,task);else{const row=c.createDiv({cls:'tf-project-completed'});button(row,task.meta.title,()=>new TaskEditor(this.plugin,task).open(),'tf-text-button');row.createSpan({text:tr('Erledigt · Archiv'),cls:'tf-muted'});}
      }
      if(tasks.length>20)button(c,this.projectExpanded?tr('Weniger anzeigen'):tr('Alle ')+tasks.length+tr(' Aufgaben anzeigen'),()=>{this.projectExpanded=!this.projectExpanded;this.render();},'tf-text-button');return;
    }
    if(this.projectId){this.projectId='';c.createEl('p',{text:tr('Dieses Projekt ist nicht mehr verfügbar.'),cls:'tf-muted'});}
    button(toolbar,tr('+ Neues Projekt'),()=>new ProjectEditor(this.plugin).open(),'tf-primary');const toggle=button(toolbar,this.projectArchive?tr('Aktive Projekte'):tr('Archivierte Projekte'),()=>{this.projectArchive=!this.projectArchive;this.render();},'tf-text-button');toggle.setAttribute('aria-pressed',String(!!this.projectArchive));
    c.createEl('p',{text:tr('Bündle Aufgaben nach Vorhaben. Die Fortschrittsanzeige zählt aktive Aufgaben und archivierte Abschlüsse; gelöschte und übersprungene Termine bleiben ausgeschlossen.'),cls:'tf-muted'});
    const visible=list.filter(p=>p.archived===!!this.projectArchive).sort((a,b)=>a.name.localeCompare(b.name)),grid=c.createDiv({cls:'tf-project-grid'});
    if(!visible.length)grid.createDiv({text:this.projectArchive?tr('Keine archivierten Projekte.'):tr('Noch keine Projekte. Lege dein erstes Projekt an.'),cls:'tf-filter-empty'});
    for(const project of visible){const card=grid.createEl('section',{cls:'tf-project-card'});button(card,project.name,()=>{this.projectId=project.id;this.projectExpanded=false;this.render();},'tf-project-title');if(project.description)card.createEl('p',{text:project.description,cls:'tf-project-description'});this.projectProgress(card,projectSummary(this.plugin.tasks,project.id));button(card,tr('Projekt öffnen →'),()=>{this.projectId=project.id;this.projectExpanded=false;this.render();},'tf-text-button');}
  }
  projectProgress(c,summary){
    const box=c.createDiv({cls:'tf-project-progress'});box.createEl('p',{text:summary.done+tr(' von ')+summary.total+tr(' erledigt · ')+summary.active+tr(' aktiv')+(summary.overdue?' · '+summary.overdue+tr(' überfällig'):'')});
    const progress=box.createEl('progress',{attr:{max:'100',value:String(summary.percent),'aria-label':tr('Projektfortschritt: ')+summary.percent+tr(' Prozent')}});progress.value=summary.percent;box.createSpan({text:summary.percent+' %',cls:'tf-muted'});
  }
  renderTrash(c){
    const trash=this.plugin.tasks.filter(t=>t.meta.trashed),header=c.createDiv({cls:'tf-toolbar'});header.createSpan({text:trash.length+tr(' gelöschte Aufgaben'),attr:{role:'status','aria-live':'polite'}});
    const empty=button(header,tr('Papierkorb leeren'),()=>new EmptyTrashModal(this.plugin).open(),'tf-primary');empty.disabled=!trash.length;
    c.createEl('p',{text:tr('Gelöschte Aufgaben erscheinen nicht im Board, Kalender, auf der Startseite oder in Statistiken. Wiederherstellen behält den bisherigen Status und Archivzustand.'),cls:'tf-muted'});
    if(!trash.length){c.createDiv({text:tr('Der Papierkorb ist leer.'),cls:'tf-filter-empty'});return;}
    for(const group of trashGroups(trash)){
      const task=group.task,section=c.createEl('section',{cls:'tf-series-row'});section.createEl('h2',{text:task.meta.title});
      const deleted=new Date(task.meta.taskflowTrash?.deletedAt||'');
      section.createEl('p',{text:(task.meta.taskflowTrash?.scope==='series'?tr('Serie / Serienabschnitt · ')+group.count+tr(' Aufgaben'):tr('Einzelaufgabe / einzelner Termin'))+tr(' · Gelöscht: ')+(Number.isNaN(deleted.getTime())?tr('Unbekannt'):deleted.toLocaleString(uiLocale())),cls:'tf-muted'});
      const restore=button(section,task.meta.taskflowTrash?.scope==='series'?tr('Serie wiederherstellen'):tr('Wiederherstellen'),async()=>{restore.disabled=true;try{await this.plugin.restoreTrash(task);}catch(e){report(e);restore.disabled=false;}},'tf-primary');
    }
  }
  renderSeries(c){
    const all=seriesOverview(this.plugin.tasks),terms=searchText(this.seriesQuery).trim().split(/\s+/).filter(Boolean);
    const groups=all.filter(group=>{const text=searchText([group.title,group.state,group.id,group.source?recurrenceLabel(group.source.meta):'',...(group.source?.meta.tags||[])].join(' '));return terms.every(term=>text.includes(term));});
    const toolbar=c.createDiv({cls:'tf-toolbar'});toolbar.createSpan({text:tfmt(tr("{0} von {1} Serienabschnitten"),groups.length,all.length),cls:'tf-muted',attr:{role:'status','aria-live':'polite'}});
    const search=toolbar.createEl('input',{type:'search',cls:'tf-search',placeholder:tr('Wiederholtermine suchen …'),attr:{'aria-label':tr('Wiederholtermine suchen')}});search.value=this.seriesQuery;search.dataset.tfFocus='series-search';
    search.oninput=event=>{this.seriesQuery=search.value;clearTimeout(this.searchTimer);if(!event.isComposing)this.searchTimer=setTimeout(()=>{if(!this.closed)this.render();},120);};
    search.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();this.seriesQuery='';this.render();}};
    c.createEl('p',{text:tr('Eine Zeile je Serie bzw. geändertem Serienabschnitt. „Serie bearbeiten“ beginnt beim nächsten offenen, nicht individuell geschützten Termin. Erledigte und individuell geänderte Folgetermine bleiben geschützt. Beendete Serien bleiben hier auffindbar.'),cls:'tf-muted'});
    if(!groups.length){c.createDiv({text:all.length?tr('Keine passenden Wiederholtermine.'):tr('Noch keine Wiederholtermine. Lege über „Neue Wiederholung“ eine Serie an.'),cls:'tf-filter-empty'});return;}
    for(const group of groups){
      const section=c.createEl('section',{cls:'tf-series-row',attr:{'aria-label':group.title}}),head=section.createDiv({cls:'tf-series-heading'});
      head.createEl('h2',{text:group.title});head.createSpan({text:group.state,cls:'tf-muted'});
      const details=section.createDiv({cls:'tf-series-details'}),rule=group.source?.meta.recurrence;
      if(rule){details.createSpan({text:recurrenceLabel(group.source.meta)});details.createSpan({text:tr('Ab ')+rule.start+(rule.until?tr(' · bis ')+rule.until:'')});if(rule.time)details.createSpan({text:rule.time+' · '+durationMinutes({durationMinutes:rule.durationMinutes})+' min'});}
      details.createSpan({text:group.next?tr('Nächster offen: ')+(dateValue(group.next.meta.scheduled)||dateValue(group.next.meta.due)): tr('Kein zukünftiger offener Termin erfasst')});
      details.createSpan({text:group.open+tr(' offen · ')+group.terms.length+tr(' Termine erfasst')});
      const actions=section.createDiv({cls:'tf-preset-actions'});
      if(group.source&&group.editTask)button(actions,tr('Serie bearbeiten'),()=>new TaskEditor(this.plugin,group.editTask,'open','','normal','',{scope:'future'}).open(),'tf-primary');
      if(!group.source)section.createEl('p',{text:tr('Die ursprüngliche Serienaufgabe fehlt. Vorhandene Termine kannst du einzeln bearbeiten; eine Serienänderung ist ohne Quelle nicht möglich.'),cls:'tf-muted'});
      const expanded=this.expandedSeries.has(group.id),toggle=button(actions,expanded?tr('Termine ausblenden'):tr('Termine anzeigen'),()=>{if(expanded)this.expandedSeries.delete(group.id);else this.expandedSeries.add(group.id);this.render();},'tf-text-button');toggle.setAttribute('aria-expanded',String(expanded));
      if(expanded){const list=section.createDiv({cls:'tf-series-terms'});for(const task of group.terms){const row=list.createDiv({cls:'tf-series-term'});row.createSpan({text:(dateValue(task.meta.scheduled)||dateValue(task.meta.due)||tr('Ohne Datum'))+(task.meta.scheduledTime?' · '+task.meta.scheduledTime:'')});row.createSpan({text:task.meta.recurrenceSkipped?tr('Übersprungen'):task.meta.recurrenceSuperseded?tr('Ersetzt'):task.meta.archived?tr('Archiviert'):STATES[task.meta.status]});if(task.meta.recurrenceException)row.createSpan({text:tr('Individuell geändert')});button(row,tr('Einzeltermin bearbeiten'),()=>new TaskEditor(this.plugin,task).open(),'tf-text-button');}}
    }
  }
  filterValues(){return filterSnapshot({project:this.projectFilter,query:this.query,tag:this.tag,status:this.statusFilter,priority:this.priorityFilter,due:this.dueFilter});}
  applyFilter(preset){this.boardMode='tasks';const f=filterSnapshot(preset.filters);this.query=f.query;this.projectFilter=f.project;this.tag=f.tag;this.statusFilter=f.status;this.priorityFilter=f.priority;this.dueFilter=f.due;this.currentPreset=preset.id;if(this.mode==='home')this.mode='board';this.render();}
  renderHome(c,tasks,presets){
    const overview=homeOverview(tasks),summary=c.createDiv({cls:'tf-day-summary'});
    const timed=overview.today.filter(t=>dateValue(t.meta.scheduled)===today()&&timeMinutes(t.meta.scheduledTime)!==null).length;
    summary.createSpan({text:tfmt(tr("{0} {1} für heute · {2} {3}"),overview.today.length,overview.today.length===1?tr('Aufgabe'):tr('Aufgaben'),timed,timed===1?tr('Zeitblock'):tr('Zeitblöcke')),attr:{role:'status','aria-live':'polite'}});
    button(summary,tr('Tag planen →'),()=>this.openHomeDestination('planner'),'tf-text-button');
    const layout=c.createDiv({cls:'tf-day-layout'}),focus=layout.createEl('section',{cls:'tf-day-main',attr:{'aria-label':tr('Dein Tag')}});
    focus.createEl('h2',{text:tr('Dein Tag'),cls:'tf-day-heading'});
    if(!overview.today.length)focus.createDiv({text:tr('Für heute ist noch nichts geplant oder fällig. Plane vorhandene Aufgaben über den Tagesplaner ein.'),cls:'tf-home-empty'});
    const expanded=this.homeExpanded.has('today');for(const task of expanded?overview.today:overview.today.slice(0,5))this.homeTask(focus,task);
    if(overview.today.length>5){const more=button(focus,expanded?tr('Weniger anzeigen'):tfmt(tr("Alle {0} anzeigen"),overview.today.length),()=>{if(expanded)this.homeExpanded.delete('today');else this.homeExpanded.add('today');this.render();},'tf-text-button');more.setAttribute('aria-expanded',String(expanded));}
    button(focus,tr('Alle Aufgaben öffnen →'),()=>this.openHomeDestination('board'),'tf-text-button');
    this.renderDayInsight(layout);
    const shortcuts=layout.createEl('section',{cls:'tf-day-shortcuts',attr:{'aria-label':tr('Schnellzugriff')}});shortcuts.createEl('h2',{text:tr('Schnellzugriff'),cls:'tf-day-heading'});
    const tiles=shortcuts.createDiv({cls:'tf-day-tile-grid'});
    for(const key of ['board','calendar','projects','series','stats','archive','trash','settings']){
      const destination=HOME_DESTINATIONS[key],tile=button(tiles,'',()=>this.openHomeDestination(key),'tf-day-tile');tile.setAttribute('aria-label',(uiLanguage==='en'?'Open '+tr(destination.label):destination.label+tr(' öffnen')));
      const icon=tile.createSpan({cls:'tf-day-tile-icon',attr:{'aria-hidden':'true'}});if(typeof setIcon==='function')setIcon(icon,destination.icon);
      tile.createSpan({text:tr(destination.label),cls:'tf-day-tile-title'});tile.createSpan({text:tr(destination.description),cls:'tf-day-tile-description'});
    }
    if(presets.length&&effectivePreferences(this.plugin).showFavorites){
      const favorites=c.createDiv({cls:'tf-home-favorites'});favorites.createEl('h2',{text:tr('Filterfavoriten')});const boardTasks=tasksForView(tasks,'board');
      for(const preset of presets){const count=filterTasks(boardTasks,preset.filters,today(),this.searchIndex).length;button(favorites,preset.name+' · '+count,()=>this.applyFilter(preset),'tf-home-favorite');}
    }
    const details=c.createEl('details',{cls:'tf-day-more'});details.open=!!this.homeDetailsOpen;details.ontoggle=()=>this.homeDetailsOpen=details.open;
    details.createEl('summary',{text:tfmt(tr("Weitere Aufgaben · {0} überfällig · {1} ohne Planung"),overview.overdue.length,overview.inbox.length)});
    const grid=details.createDiv({cls:'tf-home-grid'});
    const sections={overdue:[tr('Überfällig'),tr('Offene Aufgaben mit überschrittener Deadline.'),tr('Keine überfälligen Aufgaben.')],upcoming:[tr('Nächste 7 Tage'),tr('Anstehende Planung und Fälligkeiten ab morgen.'),tr('Keine anstehenden Termine in den nächsten sieben Tagen.')],inbox:[tr('Eingang'),tr('Ohne Planungsdatum; eine Deadline kann bereits gesetzt sein.'),tr('Alle offenen Aufgaben haben ein Planungsdatum.')]};
    for(const [key,[label,description,empty]]of Object.entries(sections)){
      const list=overview[key],section=grid.createEl('section',{cls:'tf-home-section',attr:{'aria-label':label}}),head=section.createDiv({cls:'tf-home-heading'});
      head.createEl('h2',{text:label});head.createSpan({text:String(list.length),cls:'tf-count'});
      section.createEl('p',{text:description,cls:'tf-muted tf-home-description'});
      if(!list.length)section.createDiv({text:empty,cls:'tf-home-empty'});
      const expanded=this.homeExpanded.has(key);
      for(const task of expanded?list:list.slice(0,5))this.homeTask(section,task);
      if(list.length>5){const more=button(section,expanded?tr('Weniger anzeigen'):tfmt(tr("Alle {0} anzeigen"),list.length),()=>{if(expanded)this.homeExpanded.delete(key);else this.homeExpanded.add(key);this.render();},'tf-text-button');more.setAttribute('aria-expanded',String(expanded));}
    }
  }
  goHome(){this.mode='home';this.showArchive=false;this.archiveMode='tasks';this.boardMode='tasks';this.plannerMode='agenda';this.seriesQuery='';this.resetFilters();this.contentEl.scrollTop=0;}
  openHomeDestination(key){if(key==='settings'){new SettingsModal(this.plugin).open();return;}Object.assign(this,homeDestination(key));if(this.mode==='planner'){this.plannerDate=today();this.calendarSpan=effectivePreferences(this.plugin).calendarView;}if(this.mode==='projects'){this.projectId='';this.projectArchive=false;this.projectExpanded=false;}this.resetFilters();if(this.contentEl)this.contentEl.scrollTop=0;}
  renderDayInsight(layout){
    const data=dailyInsight(this.plugin.tasks),section=layout.createEl('section',{cls:'tf-day-insight',attr:{'aria-label':tr('Dein Tagesüberblick')}});
    section.createEl('h2',{text:tr('Dein Tagesüberblick'),cls:'tf-day-heading'});
    const panel=section.createDiv({cls:'tf-day-insight-panel'}),ring=panel.createDiv({cls:'tf-day-ring'});
    const chart=svgElement(ring,'svg',{viewBox:'0 0 200 200',role:'img','aria-label':tfmt('{0} von {1} Tagesaufgaben erledigt · {2} Prozent',data.summary.done,data.summary.total,data.percent)});
    svgElement(chart,'circle',{cx:100,cy:100,r:77,fill:'none',stroke:'var(--tf-line)','stroke-width':13});
    let offset=0;for(const key of Object.keys(STATES)){const share=data.summary.total?data.summary[key]/data.summary.total*100:0;if(share){svgElement(chart,'circle',{cx:100,cy:100,r:77,fill:'none',stroke:'var(--tf-status-'+key+')','stroke-width':13,pathLength:100,'stroke-dasharray':share+' '+(100-share),'stroke-dashoffset':-offset,transform:'rotate(-90 100 100)'});offset+=share;}}
    const center=ring.createDiv({cls:'tf-day-ring-label',attr:{'aria-hidden':'true'}});center.createEl('strong',{text:data.percent+' %'});center.createSpan({text:tr('Tagesfortschritt')});
    panel.createEl('p',{text:tfmt('{0} von {1} Tagesaufgaben erledigt',data.summary.done,data.summary.total),cls:'tf-day-progress-caption'});
    const statuses=panel.createDiv({cls:'tf-day-status-grid'});for(const [key,label]of Object.entries(STATES)){const row=statuses.createDiv({cls:'tf-status-'+key});row.createSpan({cls:'tf-status-dot',attr:{'aria-hidden':'true'}});row.createSpan({text:label});row.createEl('strong',{text:String(data.summary[key])});}
    const metrics=panel.createDiv({cls:'tf-day-metrics'});for(const [value,label]of [[data.completedToday,tr('Heute abgeschlossen')],[data.remaining,tr('Noch für heute offen')],[data.timed,tr('Geplante Zeitblöcke')]]){const metric=metrics.createDiv();metric.createEl('strong',{text:String(value)});metric.createSpan({text:label});}
    if(data.plannedMinutes)panel.createEl('p',{text:tfmt('Geplante Blockdauer: {0} h {1} min',Math.floor(data.plannedMinutes/60),data.plannedMinutes%60),cls:'tf-day-insight-note'});
    panel.createEl('h3',{text:tr('Abschlüsse · letzte 7 Tage'),cls:'tf-day-trend-heading'});
    const trend=panel.createDiv({cls:'tf-day-trend',attr:{role:'img','aria-label':tr('Abschlüsse · letzte 7 Tage')+': '+data.days.map(d=>d.key+': '+d.count).join('; ')}}),max=Math.max(1,...data.days.map(d=>d.count));
    for(const day of data.days){const col=trend.createDiv({cls:'tf-day-trend-col'+(day.key===today()?' is-today':'')});col.createSpan({text:String(day.count),cls:'tf-day-trend-count'});const track=col.createDiv({cls:'tf-day-trend-track'}),bar=track.createDiv({cls:'tf-day-trend-bar'});bar.style.height=(day.count/max*100)+'%';col.createSpan({text:new Date(day.key+'T12:00:00').toLocaleDateString(uiLocale(),{weekday:'short'}),cls:'tf-day-trend-label'});col.setAttribute('aria-hidden','true');}
    panel.createEl('p',{text:tr('Tagesaufgaben: heute fällig, heute geplant oder heute abgeschlossen. Abschlüsse im Archiv zählen mit.'),cls:'tf-day-insight-note'});
    if(!data.summary.total)panel.createEl('p',{text:tr('Dein Tag ist noch frei. Plane vorhandene Aufgaben im Tagesplaner ein.'),cls:'tf-day-insight-note'});
    button(panel,tr('Gesamte Statistik öffnen →'),()=>this.openHomeDestination('stats'),'tf-text-button');
  }
  homeTask(parent,task){
    const priority=Object.hasOwn(PRIORITIES,task.meta.priority)?task.meta.priority:'normal';
    const row=parent.createEl('article',{cls:`tf-home-task tf-status-${task.meta.status} tf-priority-${priority}`,attr:{'aria-label':task.meta.title}});
    const check=row.createEl('input',{type:'checkbox',attr:{'aria-label':task.meta.title+tr(' als erledigt markieren')}});check.disabled=!!this.pendingPath;
    check.onchange=async()=>{check.disabled=true;await this.setStatus(task,'done');if(row.isConnected){check.checked=false;check.disabled=!!this.pendingPath;}};
    const content=row.createDiv({cls:'tf-home-task-content'}),badges=content.createDiv({cls:'tf-home-task-badges'}),status=badges.createSpan({cls:'tf-status-label'});status.createSpan({cls:'tf-status-dot',attr:{'aria-hidden':'true'}});status.appendText(STATES[task.meta.status]);
    badges.createSpan({text:PRIORITIES[priority],cls:'tf-priority-label',attr:{'aria-label':tr('Priorität: ')+PRIORITIES[priority]}});
    button(content,task.meta.title,()=>new TaskEditor(this.plugin,task).open(),'tf-home-title');
    const dates=content.createDiv({cls:'tf-home-task-details'});
    if(validDay(dateValue(task.meta.scheduled)))dates.createSpan({text:tr('Geplant ')+dateValue(task.meta.scheduled)+(task.meta.scheduledTime?' · '+task.meta.scheduledTime:'')});
    const due=duePresentation(task);dates.createSpan({text:due.label});
    const subs=subtasks(task.body);if(subs.length)dates.createSpan({text:tr('Teilaufgaben')+' · '+subs.filter(s=>s[1]!==' ').length+'/'+subs.length});
    const actions=content.createDiv({cls:'tf-home-task-actions'}),expanded=this.homeTaskDetails.has(task.file.path),panelId='tf-home-details-'+crypto.randomUUID();
    const toggle=button(actions,expanded?tr('Details ausblenden'):tr('Details anzeigen'),()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));toggle.setText(open?tr('Details ausblenden'):tr('Details anzeigen'));toggle.setAttribute('aria-label',task.meta.title+' · '+(open?tr('Details ausblenden'):tr('Details anzeigen')));panel.hidden=!open;if(open)this.homeTaskDetails.add(task.file.path);else this.homeTaskDetails.delete(task.file.path);},'tf-home-details-toggle');toggle.setAttribute('aria-expanded',String(expanded));toggle.setAttribute('aria-controls',panelId);toggle.setAttribute('aria-label',task.meta.title+' · '+(expanded?tr('Details ausblenden'):tr('Details anzeigen')));
    const plan=button(actions,tr('Bearbeiten'),()=>new TaskEditor(this.plugin,task).open(),'tf-text-button');plan.setAttribute('aria-label',task.meta.title+tr(' planen und bearbeiten'));
    const panel=content.createDiv({cls:'tf-home-task-expanded'});panel.id=panelId;panel.hidden=!expanded;
    panel.createEl('h3',{text:tr('Notizen')});panel.createEl('p',{text:noteField(task.body).value||tr('Noch keine Notiz vorhanden.'),cls:'tf-home-note-preview'});
    if(task.meta.taskflowProject){const project=projects(this.plugin.settings).find(p=>p.id===task.meta.taskflowProject);panel.createDiv({text:tr('Projekt · ')+(project?.name||tr('Unbekanntes Projekt')),cls:'tf-muted'});}
    if((task.meta.tags||[]).length)panel.createDiv({text:task.meta.tags.map(t=>'#'+t).join(' · '),cls:'tf-muted'});
    if(subs.length){panel.createEl('h3',{text:tr('Teilaufgaben')});for(const [index,sub]of subs.entries()){const label=panel.createEl('label',{cls:'tf-home-subtask'}),input=label.createEl('input',{type:'checkbox'});input.checked=sub[1]!==' ';input.setAttribute('aria-label',sub[2]);label.createSpan({text:sub[2]});input.onchange=async()=>{input.disabled=true;try{await this.plugin.change(task,()=>{},body=>toggleSubtask(body,index),task.raw);}catch(e){report(e);this.render();}};}}
    button(panel,tr('In Obsidian öffnen'),()=>this.app.workspace.getLeaf(false).openFile(task.file),'tf-text-button');
  }
  resetFilters(){this.projectFilter='';this.currentPreset='';this.query='';this.tag='';this.statusFilter='';this.priorityFilter='';this.dueFilter='';this.filtersOpen=false;this.render();}
  renderResults(c,all){
    this.calendarPointerCleanup?.();c.empty();
    all=tasksForView(all,this.mode,this.plannerMode,this.showArchive);
    if(this.mode==='board'&&!this.showArchive&&this.plugin.tasks.some(t=>!t.meta.trashed&&!t.meta.archived&&isSeriesTask(t))){
      const note=c.createDiv({cls:'tf-filter-info'});note.createSpan({text:tr('Serientermine findest du auf der Startseite und im Kalender.')});
      button(note,tr('Kalender öffnen'),()=>{this.mode='planner';this.plannerMode='calendar';this.plannerDate=today();this.render();},'tf-text-button');
    }
    const tasks=filterTasks(all,{project:this.projectFilter,query:this.query,tag:this.tag,status:this.statusFilter,priority:this.priorityFilter,due:this.dueFilter},today(),this.searchIndex);
    const active=!!(this.projectFilter||this.query.trim()||this.tag||this.statusFilter||this.priorityFilter||this.dueFilter);
    const info=c.createDiv({cls:'tf-filter-info'});
    const labels=[this.projectFilter==='__none__'?tr('Ohne Projekt'):projects(this.plugin.settings).find(p=>p.id===this.projectFilter)?.name,this.tag?'#'+this.tag:'',STATES[this.statusFilter],PRIORITIES[this.priorityFilter],this.dueFilter?DUE_FILTERS[this.dueFilter]:''].filter(Boolean);
    info.createSpan({text:tasks.length+tr(' von ')+all.length+tr(' Aufgaben')+(labels.length?' · '+labels.join(' · '):''),attr:{role:'status','aria-live':'polite'}});
    if(active)button(info,tr('Zurücksetzen'),()=>this.resetFilters(),'tf-text-button');
    if(active&&!tasks.length){c.createDiv({text:tr('Keine passenden Aufgaben. Ändere die Suche oder setze die Filter zurück.'),cls:'tf-filter-empty'});if(this.mode==='board')return;}
    if(this.mode==='stats'){this.renderStats(c,tasks);return;}
    if(this.mode==='planner'){this.renderPlanner(c,tasks);return;}
    this.renderBoard(c,tasks);
  }
  renderBoard(c,tasks,groupBy='status'){
    tasks=sortedTasks(tasksForView(tasks,'board',this.plannerMode,this.showArchive),effectivePreferences(this.plugin).sort);
    const board=c.createDiv({cls:'tf-board'+(groupBy==='priority'?' tf-board-priority':'')});
    for(const [status,label]of Object.entries(groupBy==='priority'?PRIORITIES:STATES)){
      const col=board.createDiv({cls:'tf-column '+(groupBy==='priority'?'tf-priority-'+status:'tf-status-'+status)});col.dataset.status=status;
      const list=tasks.filter(t=>(groupBy==='priority'?(Object.hasOwn(PRIORITIES,t.meta.priority)?t.meta.priority:'normal'):t.meta.status)===status).sort((a,b)=>(dateValue(a.meta.due)||'9999').localeCompare(dateValue(b.meta.due)||'9999'));
      const heading=col.createDiv({cls:'tf-column-heading'});heading.createSpan({cls:'tf-status-dot',attr:{'aria-hidden':'true'}});heading.createEl('h2',{text:label});heading.createSpan({text:String(list.length),cls:'tf-count'});
      if(canCreateTasks(this.mode,this.showArchive)){const add=button(heading,'+',()=>new TaskEditor(this.plugin,null,groupBy==='status'?status:'open',this.mode==='planner'?this.plannerDate:'',groupBy==='priority'?status:effectivePreferences(this.plugin).defaultPriority).open(),'tf-column-add');add.setAttribute('aria-label',tr('Aufgabe in ')+label+tr(' hinzufügen'));}
      const stack=col.createDiv({cls:'tf-card-stack'});
      for(const task of list){if(this.mode==='planner')this.plannerCard(stack,task);else this.card(stack,task);}
      if(!list.length)stack.createDiv({text:tr('Keine Aufgaben'),cls:'tf-empty'});
      const drop=col.createDiv({text:tr('Hier ablegen'),cls:'tf-drop-hint'});drop.setAttribute('aria-hidden','true');
      col.ondragover=e=>{if(!this.dragPath)return;e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='move';for(const other of board.children)other.removeClass('tf-drag-target');col.addClass('tf-drag-target');};
      col.ondragleave=e=>{if(!col.contains(e.relatedTarget))col.removeClass('tf-drag-target');};
      col.ondrop=e=>{e.preventDefault();col.removeClass('tf-drag-target');const path=e.dataTransfer?.getData('text/taskflow');if(path!==this.dragPath)return;this.dragPath=null;const task=this.plugin.tasks.find(t=>t.file.path===path);if(task){if(groupBy==='priority'){if(task.meta.priority!==status)this.plugin.change(task,m=>m.priority=status).catch(report);}else if(task.meta.status!==status)this.setStatus(task,status);}};
    }
    const legend=c.createDiv({cls:'tf-legend'});
    legend.createSpan({text:tr('Kartenrand: Priorität')});
    for(const [key,label]of Object.entries(PRIORITIES)){
      const item=legend.createSpan({cls:'tf-priority-'+key});item.createSpan({cls:'tf-priority-swatch',attr:{'aria-hidden':'true'}});item.appendText(label);
    }
    legend.createSpan({text:tr('Farbige Kennzeichnung: Status · Kartenrand und Prioritätslabel: Priorität'),cls:'tf-legend-note'});
    const live=c.createDiv({cls:'tf-live',attr:{'aria-live':'polite','role':'status'}});if(this.lastMove)live.setText(this.lastMove);
  }
  async setStatus(task,status){
    if(this.pendingPath)return;
    this.pendingPath=task.file.path;this.contentEl.setAttribute('aria-busy','true');
    try{await this.plugin.change(task.originalTask||task,m=>{if(task.calendarAutomatic&&status==='done'&&!validDay(dateValue(m.scheduled))){assignDay(m,dateValue(task.meta.scheduled));delete m.scheduledTime;}m.status=status;});this.lastMove=task.meta.title+' → '+STATES[status];const live=this.contentEl.querySelector('.tf-live');if(live)live.setText(this.lastMove);}
    catch(e){report(e);this.render();}
    finally{this.pendingPath=null;this.contentEl.removeAttribute('aria-busy');for(const check of this.contentEl.querySelectorAll('.tf-home-task>input[type="checkbox"]'))check.disabled=false;}
  }
  card(col,t){
    const priority=Object.hasOwn(PRIORITIES,t.meta.priority)?t.meta.priority:'normal';
    const card=col.createDiv({cls:`tf-card tf-priority-${priority} tf-status-${t.meta.status}`});card.dataset.path=t.file.path;card.dataset.status=t.meta.status;card.draggable=true;
    card.ondragstart=e=>{if(this.pendingPath||e.target.closest('input,select,textarea')){e.preventDefault();return;}this.dragPath=t.file.path;e.dataTransfer.setData('text/taskflow',t.file.path);e.dataTransfer.effectAllowed='move';card.addClass('tf-dragging');};
    card.ondragend=()=>{this.dragPath=null;card.removeClass('tf-dragging');for(const el of this.contentEl.querySelectorAll('.tf-drag-target'))el.removeClass('tf-drag-target');};
    const top=card.createDiv({cls:'tf-card-top'}),status=top.createSpan({cls:'tf-status-label'});status.createSpan({cls:'tf-status-dot',attr:{'aria-hidden':'true'}});status.appendText(STATES[t.meta.status]);
    top.createSpan({text:(priority==='high'?'↑ ':priority==='low'?'↓ ':'– ')+PRIORITIES[priority],cls:'tf-priority-label',attr:{'aria-label':tr('Priorität: ')+PRIORITIES[priority]}});
    button(card,t.meta.title,()=>new TaskEditor(this.plugin,t).open(),'tf-title');
    if(t.meta.taskflowProject){const project=projects(this.plugin.settings).find(p=>p.id===t.meta.taskflowProject);card.createDiv({text:tr('Projekt · ')+(project?.name||tr('Unbekanntes Projekt')),cls:'tf-muted tf-card-project'});}
    if((t.meta.tags||[]).length){const tags=card.createDiv({cls:'tf-tags'});for(const tag of t.meta.tags)tags.createSpan({text:'#'+tag});}
    const due=duePresentation(t);card.createDiv({text:due.label,cls:'tf-due tf-due-'+due.kind});
    const repeatLabel=recurrenceLabel(t.meta);if(repeatLabel)card.createDiv({text:repeatLabel,cls:'tf-recurrence-label'});
    this.cardNote(card,t);
    const subs=subtasks(t.body);
    if(subs.length){
      const panelId='tf-subtasks-'+crypto.randomUUID(),expanded=this.expandedTasks.has(t.file.path);
      const toggle=button(card,(expanded?'▾':'▸')+tfmt(tr(" Teilaufgaben · {0}/{1}"),subs.filter(x=>x[1]!==' ').length,subs.length),()=>{
        const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));panel.hidden=!open;toggle.setText((open?'▾':'▸')+tfmt(tr(" Teilaufgaben · {0}/{1}"),subs.filter(x=>x[1]!==' ').length,subs.length));if(open)this.expandedTasks.add(t.file.path);else this.expandedTasks.delete(t.file.path);
      },'tf-subtasks-toggle');toggle.setAttribute('aria-expanded',String(expanded));toggle.setAttribute('aria-controls',panelId);
      const panel=card.createDiv({cls:'tf-subtasks-panel'});panel.id=panelId;panel.hidden=!expanded;
      subs.forEach((sub,index)=>{const label=panel.createEl('label',{cls:'tf-subtask'}),check=label.createEl('input',{type:'checkbox'});check.checked=sub[1]!==' ';label.createSpan({text:sub[2]});check.onchange=async()=>{check.disabled=true;try{await this.plugin.change(t,()=>{},body=>toggleSubtask(body,index),t.raw);}catch(e){report(e);this.render();}};});
    }
    const controls=card.createDiv({cls:'tf-card-actions'});const select=controls.createEl('select');select.setAttribute('aria-label',tr('Status für ')+t.meta.title);
    for(const [value,text]of Object.entries(STATES))select.createEl('option',{value,text});select.value=t.meta.status;
    select.onchange=()=>{if(this.pendingPath){select.value=t.meta.status;return;}select.disabled=true;this.setStatus(t,select.value);};
    button(controls,tr('In Obsidian öffnen'),()=>this.app.workspace.getLeaf(false).openFile(t.file),'tf-text-button');
    button(controls,t.meta.archived?tr('Wiederherstellen'):tr('Archivieren'),async()=>{try{await this.plugin.change(t,m=>{m.archived=!m.archived;if(!m.archived){delete m.recurrenceSkipped;if(m.status==='done')m.status='open';}});}catch(e){report(e);}},'tf-text-button');
    return card;
  }
  cardNote(card,task){
    const field=noteField(task.body),draft=this.noteDrafts.get(task.file.path);
    const group=card.createDiv({cls:'tf-card-note'}),label=group.createEl('label');label.createSpan({text:tr('Notiz'),cls:'tf-card-note-label'});
    const input=label.createEl('textarea',{cls:'tf-card-note-input',placeholder:tr('Notiz zur Aufgabe …')});input.rows=3;input.value=draft?draft.value:field.value;input.dataset.tfFocus='note-'+encodeURIComponent(task.file.path);input.setAttribute('aria-label',tr('Notiz für ')+task.meta.title);input.disabled=!!draft?.saving;
    const actions=group.createDiv({cls:'tf-card-note-actions'}),status=actions.createSpan({cls:'tf-card-note-status',attr:{'aria-live':'polite'}});
    const error=group.createDiv({cls:'tf-card-note-error',attr:{role:'alert'}});error.hidden=!draft?.error;if(draft?.error)error.setText(draft.error);
    const save=button(actions,tr('Speichern'),async()=>{
      const pending=this.noteDrafts.get(task.file.path);if(!pending||pending.saving)return;
      pending.saving=true;pending.error='';input.disabled=true;save.disabled=true;discard.disabled=true;status.setText(tr('Wird gespeichert …'));error.hidden=true;
      try{await this.plugin.updateNotes(task,pending.baseNotes,pending.prefix+pending.value);this.noteDrafts.delete(task.file.path);this.render();}
      catch(e){pending.saving=false;pending.error=e.message||String(e);this.render();}
    },'tf-note-save');
    const discard=button(actions,tr('Verwerfen'),()=>{this.noteDrafts.delete(task.file.path);this.render();},'tf-text-button');
    const refresh=()=>{const current=this.noteDrafts.get(task.file.path);save.hidden=!current;discard.hidden=!current;save.disabled=!!current?.saving;discard.disabled=!!current?.saving;status.setText(current?.saving?tr('Wird gespeichert …'):current?tr('Ungespeichert'):'');};
    input.oninput=()=>{
      const current=this.noteDrafts.get(task.file.path);
      if(!current)this.noteDrafts.set(task.file.path,{value:input.value,baseNotes:field.notes,prefix:field.prefix,initial:field.value,saving:false,error:''});
      else{current.value=input.value;current.error='';}
      const next=this.noteDrafts.get(task.file.path);if(next.value===next.initial)this.noteDrafts.delete(task.file.path);
      error.hidden=true;refresh();
    };
    input.onkeydown=e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();save.click();}};
    refresh();
  }
  async planTask(task,day){
    try{await this.plugin.change(task,meta=>{assignDay(meta,day);validatePlanning(meta);});}
    catch(e){report(e);this.render();}
  }
  plannerCard(parent,task){
    const card=this.card(parent,task),actions=card.createDiv({cls:'tf-planning-actions'});
    button(actions,tr('Zeit & Planung'),()=>new TaskEditor(this.plugin,task).open(),'tf-text-button');
    button(actions,tr('Aus Tagesplan nehmen'),()=>this.planTask(task,''),'tf-text-button');return card;
  }
  renderPlanner(c,tasks){
    const day=validDay(this.plannerDate)?this.plannerDate:today();this.plannerDate=day;
    const displayed=this.plannerMode==='calendar'?calendarTasks(tasks):tasksForView(tasks,'planner',this.plannerMode);
    const plan=dayPlan(displayed,day),plannedPaths=new Set(plan.planned.map(t=>t.file.path)),poolTasks=plan.pool.filter(t=>!plannedPaths.has(t.file.path)&&!isSeriesTask(t)).map(t=>t.originalTask||t),planner=c.createDiv({cls:'tf-planner'});
    const controls=planner.createDiv({cls:'tf-planner-controls'});
    const previous=button(controls,'‹',()=>{this.plannerDate=shiftDay(day,this.plannerMode==='calendar'&&this.calendarSpan==='week'?-7:-1);this.render();},'tf-planner-step');previous.setAttribute('aria-label',this.plannerMode==='calendar'&&this.calendarSpan==='week'?tr('Vorherige Woche'):tr('Vorheriger Tag'));
    const date=controls.createEl('input',{type:'date'});date.value=day;date.setAttribute('aria-label',tr('Planungstag'));date.dataset.tfFocus='planner-date';date.onchange=()=>{if(validDay(date.value)){this.plannerDate=date.value;this.render();}};
    const next=button(controls,'›',()=>{this.plannerDate=shiftDay(day,this.plannerMode==='calendar'&&this.calendarSpan==='week'?7:1);this.render();},'tf-planner-step');next.setAttribute('aria-label',this.plannerMode==='calendar'&&this.calendarSpan==='week'?tr('Nächste Woche'):tr('Nächster Tag'));
    button(controls,tr('Heute'),()=>{this.plannerDate=today();this.render();},'tf-text-button');
    controls.createSpan({text:tfmt(tr("{0} geplant · {1} erledigt · {2} h {3} min geschätzt"),plan.planned.length,plan.done,Math.floor(plan.minutes/60),plan.minutes%60),cls:'tf-planner-day-summary'});
    const week=planner.createDiv({cls:'tf-week-strip',attr:{'aria-label':tr('Wochenübersicht')}});
    for(const key of plannerWeek(day,effectivePreferences(this.plugin).weekStart)){
      const count=displayed.filter(t=>!t.meta.archived&&dateValue(t.meta.scheduled)===key).length;
      const b=button(week,'',()=>{this.plannerDate=key;this.render();},'tf-week-day'+(key===day?' is-selected':'')+(key===today()?' is-today':''));b.setAttribute('aria-pressed',String(key===day));b.setAttribute('aria-label',key+', '+count+tr(' geplante Aufgaben'));
      b.createSpan({text:new Date(key+'T12:00:00').toLocaleDateString(uiLocale(),{weekday:'short'}),cls:'tf-week-label'});b.createEl('strong',{text:key.slice(8,10)});b.createSpan({text:count+tr(' Aufgaben'),cls:'tf-week-count'});
    }
    const modes=planner.createDiv({cls:'tf-planner-modes',attr:{'aria-label':tr('Tagesansicht')}});
    for(const [key,label]of Object.entries({agenda:tr('Tagesablauf'),calendar:tr('Kalender'),status:'Status',priority:tr('Prioritäten')})){
      const b=button(modes,label,()=>{this.plannerMode=key;this.render();},'tf-planner-mode'+(this.plannerMode===key?' is-active':''));b.setAttribute('aria-pressed',String(this.plannerMode===key));
    }
    if(plan.conflicts.size)planner.createDiv({text:tfmt(tr("{0} aktive Aufgaben überschneiden sich zeitlich. Du kannst die Zeitblöcke über „Zeit & Planung“ anpassen."),plan.conflicts.size),cls:'tf-planner-warning',attr:{role:'status'}});
    const workspace=planner.createDiv({cls:'tf-planner-layout'+(this.plannerMode!=='agenda'?' tf-planner-layout-board':'')});
    const content=workspace.createDiv({cls:'tf-planner-content'});
    if(this.plannerMode==='calendar'){this.renderCalendar(content,tasks);}
    else if(this.plannerMode!=='agenda'){
      this.renderBoard(content,plan.planned,this.plannerMode==='priority'?'priority':'status');
    }else{
      content.createEl('h2',{text:new Date(day+'T12:00:00').toLocaleDateString(uiLocale(),{weekday:'long',day:'numeric',month:'long'}),cls:'tf-planner-heading'});
      if(!plan.planned.length)content.createDiv({text:tr('Dein Tag ist noch frei. Plane eine vorhandene Aufgabe ein. Neue Aufgaben erfasst du im Board.'),cls:'tf-planner-empty'});
      for(const task of plan.timed){
        const row=content.createDiv({cls:'tf-agenda-row'+(plan.conflicts.has(task.file.path)?' tf-time-conflict':'')});
        const time=row.createDiv({cls:'tf-agenda-time'});time.createEl('strong',{text:task.meta.scheduledTime});time.createSpan({text:clockTime(timeMinutes(task.meta.scheduledTime)+durationMinutes(task.meta))});
        const card=this.plannerCard(row,task);if(plan.conflicts.has(task.file.path))card.createDiv({text:tr('Zeitüberschneidung'),cls:'tf-conflict-label'});
      }
      if(plan.flexible.length){content.createEl('h3',{text:tr('Flexibel · ohne Uhrzeit'),cls:'tf-planner-subheading'});const flexible=content.createDiv({cls:'tf-flexible-grid'});for(const task of plan.flexible)this.plannerCard(flexible,task);}
    }
    const pool=workspace.createEl('aside',{cls:'tf-planner-pool'});pool.createEl('h2',{text:tr('Aufgaben einplanen'),cls:'tf-planner-heading'});pool.createEl('p',{text:tr('Vorhandene Aufgaben auf den gewählten Tag legen. Fälligkeiten bleiben erhalten.'),cls:'tf-muted'});
    if(!poolTasks.length)pool.createDiv({text:tr('Keine weiteren aktiven Aufgaben in dieser Auswahl.'),cls:'tf-planner-empty'});
    for(const task of poolTasks){
      const item=pool.createDiv({cls:'tf-pool-task tf-priority-'+(Object.hasOwn(PRIORITIES,task.meta.priority)?task.meta.priority:'normal')});
      if(this.plannerMode==='calendar'){item.draggable=false;item.onpointerdown=e=>this.calendarPointerStart(e,item,task);}
      button(item,task.meta.title,()=>new TaskEditor(this.plugin,task).open(),'tf-title');
      const old=dateValue(task.meta.scheduled);item.createDiv({text:old?tr('Bisher geplant: ')+old:tr('Noch nicht eingeplant'),cls:'tf-pool-meta'});
      const due=duePresentation(task);item.createSpan({text:due.label,cls:'tf-due tf-due-'+due.kind});
      const add=button(item,old?tr('Auf diesen Tag verschieben'):tr('Einplanen'),async()=>{add.disabled=true;await this.planTask(task,day);if(add.isConnected)add.disabled=false;},'tf-text-button');
      add.setAttribute('aria-label',task.meta.title+tr(' am ')+day+tr(' einplanen'));
    }
    planner.createEl('p',{text:tr('Planungsdatum und Uhrzeit sind dein Arbeitsplan, die Fälligkeit ist die Deadline. Erledigte Aufgaben werden automatisch archiviert.'),cls:'tf-planner-note'});
  }
  calendarPointerStart(event,element,task){
    if(event.button!==0||event.target.closest('.tf-calendar-check'))return;
    const doc=element.ownerDocument,origin={x:event.clientX,y:event.clientY},pointerId=event.pointerId;
    let moving=false;
    const hitTarget=e=>doc.elementFromPoint(e.clientX,e.clientY)?.closest('.tf-calendar-day-column,.tf-calendar-flex-cell');
    const cleanup=()=>{doc.removeEventListener('pointermove',move);doc.removeEventListener('pointerup',up);doc.removeEventListener('pointercancel',cancel);element.style.pointerEvents='';this.clearCalendarDrag();this.calendarPointerCleanup=null;};
    const move=e=>{
      if(e.pointerId!==pointerId)return;
      if(!moving&&Math.hypot(e.clientX-origin.x,e.clientY-origin.y)<6)return;
      if(!moving){moving=true;this.calendarDragPath=task.file.path;this.calendarDragOffset=timeMinutes(task.meta.scheduledTime)===null?0:Math.max(0,Math.min(durationMinutes(task.meta)-1,Math.round((origin.y-element.getBoundingClientRect().top)/CALENDAR_PIXELS_PER_MINUTE/15)*15));element.addClass('tf-calendar-dragging');element.style.pointerEvents='none';}
      e.preventDefault();
      for(const preview of this.contentEl.querySelectorAll('.tf-calendar-drop-preview'))preview.hidden=true;
      for(const cell of this.contentEl.querySelectorAll('.tf-calendar-drop-active'))cell.removeClass('tf-calendar-drop-active');
      const target=hitTarget(e);if(!target||!this.contentEl.contains(target))return;
      if(target.classList.contains('tf-calendar-flex-cell'))target.addClass('tf-calendar-drop-active');
      else{const minute=calendarDropMinute(e.clientY,target.getBoundingClientRect().top,Number(target.dataset.startMinute),this.calendarDragOffset),preview=target.querySelector('.tf-calendar-drop-preview');if(preview){preview.hidden=false;preview.setText(clockTime(Math.min(minute,1439)));preview.style.top=((minute-Number(target.dataset.startMinute))*CALENDAR_PIXELS_PER_MINUTE)+'px';}}
    };
    const up=e=>{
      if(e.pointerId!==pointerId)return;
      const target=moving?hitTarget(e):null,offset=this.calendarDragOffset||0;
      if(moving){e.preventDefault();this.calendarIgnoreClickUntil=Date.now()+350;}
      const day=target?.dataset.day,start=target?.classList.contains('tf-calendar-day-column')?calendarDropMinute(e.clientY,target.getBoundingClientRect().top,Number(target.dataset.startMinute),offset):null;
      cleanup();if(moving&&target&&this.contentEl.contains(target)&&day)this.moveCalendarTask(task.file.path,day,start);
    };
    const cancel=()=>cleanup();
    this.calendarPointerCleanup?.();this.calendarPointerCleanup=cleanup;
    doc.addEventListener('pointermove',move,{passive:false});doc.addEventListener('pointerup',up);doc.addEventListener('pointercancel',cancel);
  }
  clearCalendarDrag(){
    this.calendarDragPath=null;this.calendarDragOffset=0;
    for(const el of this.contentEl.querySelectorAll('.tf-calendar-dragging,.tf-calendar-drop-active'))el.removeClass('tf-calendar-dragging','tf-calendar-drop-active');
    for(const el of this.contentEl.querySelectorAll('.tf-calendar-drop-preview'))el.hidden=true;
  }
  async moveCalendarTask(path,day,start){
    const task=this.plugin.tasks.find(t=>t.file.path===path);if(!task)return;
    try{await this.plugin.change(task,meta=>calendarMove(meta,day,start));this.calendarMessage=task.meta.title+' → '+day+(start===null?tr(' · flexibel'):' · '+clockTime(start));const live=this.contentEl.querySelector('.tf-calendar-live');if(live)live.setText(this.calendarMessage);}
    catch(e){report(e);}
  }
  calendarEvent(parent,task,compact=false){
    const event=parent.createDiv({cls:'tf-calendar-event tf-priority-'+(Object.hasOwn(PRIORITIES,task.meta.priority)?task.meta.priority:'normal')+' tf-status-'+task.meta.status+(task.meta.status==='done'?' is-done':'')+(compact?' tf-calendar-flex-event':'')});
    event.dataset.path=task.file.path;event.draggable=false;event.onpointerdown=e=>this.calendarPointerStart(e,event,task);
    const done=button(event,task.meta.status==='done'?'✓':'○',e=>{e.stopPropagation();this.setStatus(task,task.meta.status==='done'?'open':'done');},'tf-calendar-check');done.setAttribute('aria-label',task.meta.title+(task.meta.status==='done'?tr(' wieder öffnen'):tr(' erledigen')));
    const edit=button(event,'',()=>{if(Date.now()<(this.calendarIgnoreClickUntil||0))return;new TaskEditor(this.plugin,task.originalTask||task).open();},'tf-calendar-edit');
    const start=timeMinutes(task.meta.scheduledTime);const time=start===null?tr('Flexibel'):task.meta.scheduledTime+'–'+clockTime(start+durationMinutes(task.meta));
    edit.setAttribute('aria-label',task.meta.title+tr(' bearbeiten · ')+dateValue(task.meta.scheduled)+' · '+time);edit.setAttribute('title',task.meta.title+' · '+time+' · '+STATES[task.meta.status]+tr(' · Priorität: ')+PRIORITIES[task.meta.priority||'normal']);
    done.setAttribute('title','Status: '+STATES[task.meta.status]);
    event.setAttribute('aria-label',STATES[task.meta.status]+tr(' · Priorität: ')+(PRIORITIES[task.meta.priority]||PRIORITIES.normal));
    if(!compact)edit.createSpan({text:time,cls:'tf-calendar-event-time'});
    edit.createSpan({text:task.meta.title,cls:'tf-calendar-event-title'});if(recurrenceLabel(task.meta))edit.createSpan({text:'↻',cls:'tf-calendar-event-time',attr:{title:recurrenceLabel(task.meta)}});
    if(task.calendarAutomatic)edit.createSpan({text:tr('Fällig'),cls:'tf-calendar-event-time',attr:{title:tr('Automatisch am Fälligkeitstag angezeigt · noch keine feste Tagesplanung')}});return event;
  }
  renderCalendar(c,tasks){
    tasks=calendarTasks(tasks);
    const days=this.calendarSpan==='day'?[this.plannerDate]:plannerWeek(this.plannerDate,effectivePreferences(this.plugin).weekStart),bounds=calendarBounds(tasks,days,effectivePreferences(this.plugin)),scale=CALENDAR_PIXELS_PER_MINUTE;
    const calendar=c.createDiv({cls:'tf-calendar'});
    const toolbar=calendar.createDiv({cls:'tf-calendar-toolbar'});toolbar.createEl('h2',{text:this.calendarSpan==='day'?tr('Tageskalender'):tr('Wochenkalender'),cls:'tf-planner-heading'});
    const chooser=toolbar.createDiv({cls:'tf-calendar-span',attr:{'aria-label':tr('Kalenderzeitraum')}});
    for(const [key,label]of Object.entries({week:tr('Woche'),day:(uiLanguage==='en'?'Day':tr('Tag'))})){const b=button(chooser,label,()=>{this.calendarSpan=key;this.render();},'tf-calendar-span-button'+(this.calendarSpan===key?' is-active':''));b.setAttribute('aria-pressed',String(this.calendarSpan===key));}
    calendar.createEl('p',{text:tr('Blöcke ziehen: Zeit oder Tag ändern. Titel anklicken: bearbeiten. Kreis anklicken: erledigen. Neue Aufgaben erfasst du im Board.'),cls:'tf-calendar-help'});
    const scroll=calendar.createDiv({cls:'tf-calendar-scroll',attr:{'aria-label':tr('Kalender mit Aufgabenblöcken')}});
    const sheet=scroll.createDiv({cls:'tf-calendar-sheet'+(days.length===1?' tf-calendar-single':'')});sheet.style.setProperty('--tf-calendar-days',String(days.length));
    const header=sheet.createDiv({cls:'tf-calendar-header'});header.createSpan({text:tr('Zeit'),cls:'tf-calendar-corner'});
    for(const day of days){const b=button(header,'',()=>{this.plannerDate=day;this.calendarSpan='day';this.render();},'tf-calendar-day-heading'+(day===today()?' is-today':'')+(day===this.plannerDate?' is-selected':''));b.createSpan({text:new Date(day+'T12:00:00').toLocaleDateString(uiLocale(),{weekday:'short'})});b.createEl('strong',{text:day.slice(8,10)+'.'+day.slice(5,7)+'.'});b.setAttribute('aria-label',tr('Tageskalender für ')+day+tr(' öffnen'));}
    const flexible=sheet.createDiv({cls:'tf-calendar-flex-row'});flexible.createSpan({text:tr('Flexibel'),cls:'tf-calendar-corner'});
    for(const day of days){
      const cell=flexible.createDiv({cls:'tf-calendar-flex-cell'});cell.dataset.day=day;
      const list=tasks.filter(t=>!t.meta.archived&&dateValue(t.meta.scheduled)===day&&timeMinutes(t.meta.scheduledTime)===null);for(const task of list)this.calendarEvent(cell,task,true);
    }
    const body=sheet.createDiv({cls:'tf-calendar-body'}),axis=body.createDiv({cls:'tf-calendar-axis'});axis.style.height=((bounds.end-bounds.start)*scale)+'px';
    for(let minute=bounds.start;minute<=bounds.end;minute+=60){axis.createSpan({text:clockTime(minute),cls:'tf-calendar-hour'}).style.top=((minute-bounds.start)*scale)+'px';}
    for(const day of days){
      const column=body.createDiv({cls:'tf-calendar-day-column'+(day===today()?' is-today':'')});column.dataset.day=day;column.dataset.startMinute=String(bounds.start);column.style.height=((bounds.end-bounds.start)*scale)+'px';

      for(const item of calendarEvents(tasks,day)){const event=this.calendarEvent(column,item.task);event.style.top=((item.start-bounds.start)*scale)+'px';event.style.height=(item.displayDuration*scale-3)+'px';event.style.left=`calc(${item.lane/item.columns*100}% + 3px)`;event.style.width=`calc(${100/item.columns}% - 6px)`;}
      const preview=column.createDiv({cls:'tf-calendar-drop-preview'});preview.hidden=true;preview.setAttribute('aria-hidden','true');
    }
    calendar.createDiv({text:this.calendarMessage||'',cls:'tf-calendar-live',attr:{role:'status','aria-live':'polite'}});
    calendar.createEl('p',{text:tr('Zeitblöcke basieren auf Planungsdatum, Startzeit und Dauer. Kleine Aufgaben werden für die Bedienbarkeit mindestens als halbstündiger Block dargestellt; die Beschriftung zeigt ihre tatsächliche Dauer. Offene Aufgaben und Aufgaben in Arbeit mit Fälligkeitsdatum erscheinen automatisch am Termin unter „Flexibel“ mit dem Hinweis „Fällig“. Ein manuelles Planungsdatum hat Vorrang. Ohne Datum erfolgt kein automatischer Eintrag. Beim Erledigen bleibt das Planungsdatum erhalten; die Aufgabe wechselt sofort ins Archiv. Fälligkeiten werden beim Verschieben nicht geändert.'),cls:'tf-calendar-footnote'});
  }
  renderStats(c,tasks){
    const period=[7,14,30,90].includes(this.statsDays)?this.statsDays:14;
    const data=analytics(tasks,period),s=data.summary,panel=c.createDiv({cls:'tf-statistics'});
    const top=panel.createDiv({cls:'tf-analytics-toolbar'});
    top.createEl('p',{text:tr('Aktueller Aufgabenstand und deine Abschlüsse im Zeitverlauf. Suche und Tags gelten für alle Diagramme.'),cls:'tf-muted'});
    const field=top.createEl('label',{cls:'tf-period-label'});field.createSpan({text:tr('Abschlusszeitraum')});
    const select=field.createEl('select');select.setAttribute('aria-label',tr('Abschlusszeitraum'));select.dataset.tfFocus='period';
    for(const n of [7,14,30,90])select.createEl('option',{value:String(n),text:n+tr(' Tage')});select.value=String(period);
    select.onchange=()=>{this.statsDays=Number(select.value);panel.remove();this.renderStats(c,tasks);};
    const metrics=panel.createDiv({cls:'tf-metrics'});
    for(const [value,label,detail]of [
      [data.active,tr('Aktive Aufgaben'),tr('Offen, in Arbeit und verzögert')],
      [data.completed,tr('Erledigt im Zeitraum'),tr('Letzte ')+period+tr(' Kalendertage inkl. heute')],
      [data.due.late,tr('Überfällig'),tr('Aktive Aufgaben mit vergangenem Termin')],
      [data.rate+' %',tr('Abschlussquote'),s.done+tr(' von ')+s.total+tr(' Aufgaben insgesamt')]
    ]){const metric=metrics.createDiv({cls:'tf-metric'});metric.createSpan({text:label,cls:'tf-metric-label'});metric.createEl('strong',{text:String(value),cls:'tf-metric-value'});metric.createSpan({text:detail,cls:'tf-metric-note'});}
    const grid=panel.createDiv({cls:'tf-analytics-grid'});
    const activity=grid.createEl('section',{cls:'tf-chart-section tf-chart-wide'});
    activity.createEl('h2',{text:tr('Erledigte Aufgaben')});
    activity.createEl('p',{text:period>30?tr('Abschlüsse je Sieben-Tage-Abschnitt'):tr('Abschlüsse pro Tag'),cls:'tf-chart-caption'});
    const chart=activity.createDiv({cls:'tf-activity-chart',attr:{role:'img','aria-label':tfmt(tr("{0} Aufgaben in den letzten {1} Tagen erledigt. {2}"),data.completed,period,data.bins.map(b=>b.start+(b.end!==b.start?tr(' bis ')+b.end:'')+': '+b.count).join('; '))}});
    const max=Math.max(1,...data.bins.map(d=>d.count));
    const y=chart.createDiv({cls:'tf-activity-y',attr:{'aria-hidden':'true'}});y.createSpan({text:String(max)});y.createSpan({text:'0'});
    const plot=chart.createDiv({cls:'tf-activity-plot',attr:{'aria-hidden':'true'}});plot.style.setProperty('--tf-bin-count',String(data.bins.length));
    data.bins.forEach((bin,index)=>{
      const column=plot.createDiv({cls:'tf-activity-column'});column.setAttribute('title',bin.start+(bin.end!==bin.start?' – '+bin.end:'')+': '+bin.count+tr(' erledigt'));
      const track=column.createDiv({cls:'tf-activity-track'});const bar=track.createDiv({cls:'tf-activity-bar'});bar.style.height=(bin.count/max*100)+'%';
      const show=index===0||index===data.bins.length-1||index===Math.floor(data.bins.length/2);
      const label=column.createSpan({text:show?bin.start.slice(8,10)+'.'+bin.start.slice(5,7)+'.':'',cls:'tf-activity-x'});if(!show)label.setAttribute('aria-hidden','true');
    });
    if(!data.completed)activity.createEl('p',{text:tr('Noch keine Abschlüsse in diesem Zeitraum.'),cls:'tf-chart-empty'});
    const activityDetails=activity.createEl('details',{cls:'tf-chart-details'});activityDetails.createEl('summary',{text:tr('Werte als Tabelle')});
    const activityTable=activityDetails.createEl('table',{cls:'tf-data-table'}),thead=activityTable.createEl('thead').createEl('tr');thead.createEl('th',{text:period>30?tr('Zeitraum'):tr('Datum'),attr:{scope:'col'}});thead.createEl('th',{text:tr('Erledigt'),attr:{scope:'col'}});
    const tbody=activityTable.createEl('tbody');for(const bin of data.bins){const row=tbody.createEl('tr');row.createEl('th',{text:bin.start+(bin.end!==bin.start?' – '+bin.end:''),attr:{scope:'row'}});row.createEl('td',{text:String(bin.count)});}
    const status=grid.createEl('section',{cls:'tf-chart-section'});status.createEl('h2',{text:tr('Aufgabenstatus')});status.createEl('p',{text:tr('Aktueller Stand · ')+s.total+tr(' Aufgaben'),cls:'tf-chart-caption'});
    const ring=status.createDiv({cls:'tf-donut-wrap'});
    const svg=svgElement(ring,'svg',{viewBox:'0 0 180 180',role:'img','aria-label':Object.entries(STATES).map(([key,label])=>label+': '+s[key]).join(', '),class:'tf-donut'});
    svgElement(svg,'circle',{cx:90,cy:90,r:64,fill:'none',class:'tf-donut-track','stroke-width':16});
    let offset=0;for(const [key]of Object.entries(STATES)){const percent=s.total?s[key]/s.total*100:0;if(percent){svgElement(svg,'circle',{cx:90,cy:90,r:64,fill:'none',pathLength:100,'stroke-width':16,'stroke-dasharray':`${percent} ${100-percent}`,'stroke-dashoffset':-offset,transform:'rotate(-90 90 90)',class:'tf-donut-segment tf-status-'+key});offset+=percent;}}
    const center=ring.createDiv({cls:'tf-donut-center',attr:{'aria-hidden':'true'}});center.createEl('strong',{text:String(s.total)});center.createSpan({text:tr('Aufgaben')});
    const statusLegend=status.createDiv({cls:'tf-status-legend'});
    for(const [key,label]of Object.entries(STATES)){const row=statusLegend.createDiv({cls:'tf-status-legend-row tf-status-'+key});row.createSpan({cls:'tf-status-dot',attr:{'aria-hidden':'true'}});row.createSpan({text:label});row.createEl('strong',{text:String(s[key])});row.createSpan({text:(s.total?Math.round(s[key]/s.total*100):0)+' %',cls:'tf-muted'});}
    if(!s.total)status.createEl('p',{text:tr('Noch keine Aufgaben für diese Auswahl.'),cls:'tf-chart-empty'});
    const deadlines=grid.createEl('section',{cls:'tf-chart-section'});deadlines.createEl('h2',{text:tr('Fälligkeiten')});deadlines.createEl('p',{text:tr('Nur aktive Aufgaben · nächste 7 Tage ab morgen'),cls:'tf-chart-caption'});
    const horizontal=(parent,entries,maxValue)=>{for(const entry of entries){const row=parent.createDiv({cls:'tf-hbar-row '+entry.cls});row.createSpan({text:entry.label,cls:'tf-hbar-label'});const track=row.createDiv({cls:'tf-hbar-track',attr:{role:'img','aria-label':entry.label+': '+entry.value}});track.createDiv({cls:'tf-hbar-fill'}).style.width=(maxValue?entry.value/maxValue*100:0)+'%';row.createEl('strong',{text:String(entry.value)});}};
    horizontal(deadlines,[{label:tr('Überfällig'),value:data.due.late,cls:'tf-bar-late'},{label:tr('Heute'),value:data.due.today,cls:'tf-bar-today'},{label:tr('Nächste 7 Tage'),value:data.due.week,cls:'tf-bar-future'},{label:tr('Später'),value:data.due.later,cls:'tf-bar-future'},{label:tr('Ohne Termin'),value:data.due.none,cls:'tf-bar-neutral'}],data.active);
    const priorities=grid.createEl('section',{cls:'tf-chart-section'});priorities.createEl('h2',{text:tr('Prioritäten')});priorities.createEl('p',{text:tr('Verteilung deiner ')+data.active+tr(' aktiven Aufgaben'),cls:'tf-chart-caption'});
    horizontal(priorities,Object.entries(PRIORITIES).map(([key,label])=>({label,value:data.priority[key],cls:'tf-bar-priority tf-priority-'+key})),data.active);
    const tags=panel.createEl('section',{cls:'tf-chart-section tf-tag-chart'});tags.createEl('h2',{text:tr('Aufgaben nach Tags')});tags.createEl('p',{text:tr('Balkenlänge: Anzahl Aufgaben · Erledigt und aktiv je Schlagwort. Aufgaben mit mehreren Tags zählen in jeder zugehörigen Zeile.'),cls:'tf-chart-caption'});
    if(!data.tags.length)tags.createEl('p',{text:tr('Noch keine Tags in dieser Auswahl.'),cls:'tf-chart-empty'});
    const tagMax=Math.max(1,...data.tags.map(t=>t.total));
    for(const tag of data.tags){const row=tags.createDiv({cls:'tf-tag-row'});row.createSpan({text:'#'+tag.tag});const stack=row.createDiv({cls:'tf-tag-stack',attr:{role:'img','aria-label':tfmt(tr("{0}: {1} erledigt, {2} aktiv"),tag.tag,tag.done,tag.total-tag.done)}});if(tag.done)stack.createDiv({cls:'tf-tag-done'}).style.width=(tag.done/tagMax*100)+'%';if(tag.total-tag.done)stack.createDiv({cls:'tf-tag-active'}).style.width=((tag.total-tag.done)/tagMax*100)+'%';row.createSpan({text:tag.done+' / '+tag.total+tr(' erledigt')});}
    if(data.tags.length){const legend=tags.createDiv({cls:'tf-tag-key'});legend.createSpan({text:tr('Erledigt'),cls:'tf-tag-key-done'});legend.createSpan({text:tr('Aktiv'),cls:'tf-tag-key-active'});}
    const note=panel.createEl('p',{cls:'tf-analytics-note'});note.setText(tr('Die Diagramme zeigen den aktuellen Aufgabenstand und das letzte Abschlussdatum. Wieder geöffnete Aufgaben zählen nicht als erledigt. Erledigte Aufgaben sind einschließlich der archivierten Abschlüsse enthalten; Archiv → Statistik wertet nur das Archiv aus.')+(data.missingCompletion?tfmt(tr(" {0} erledigte Aufgabe(n) ohne gültiges Abschlussdatum sind im Status enthalten, aber nicht im Zeitverlauf."),data.missingCompletion):''));
  }
}
class TaskFlow extends Plugin {
  async onload(){
    this.settings=Object.assign({folder:'TaskFlow/Aufgaben'},await this.loadData());uiLanguage=preferences(this.settings).language;this.tasks=[];this.scanVersion=0;this.stopped=false;
    this.registerView(VIEW,leaf=>new TaskView(leaf,this));this.addRibbonIcon('kanban-square','TaskFlow öffnen',()=>this.open());
    this.addCommand({id:'open',name:tr('Dashboard öffnen'),callback:()=>this.open()});this.addCommand({id:'home',name:tr('Startseite öffnen'),callback:async()=>{await this.open();const leaf=this.app.workspace.getLeavesOfType(VIEW)[0];if(leaf){leaf.view.goHome();}}});this.addCommand({id:'planner',name:tr('Tagesplaner öffnen'),callback:async()=>{await this.open();const leaf=this.app.workspace.getLeavesOfType(VIEW)[0];if(leaf){leaf.view.mode='planner';leaf.view.showArchive=false;leaf.view.render();}}});this.addCommand({id:'new',name:tr('Neue Aufgabe im Board'),callback:async()=>{await this.open();const leaf=this.app.workspace.getLeavesOfType(VIEW)[0];if(leaf){leaf.view.openHomeDestination('board');new TaskEditor(this).open();}}});
    this.addSettingTab(new class extends PluginSettingTab{display(){const c=this.containerEl;c.empty();c.createEl('h2',{text:'TaskFlow Settings'});button(c,'Settings',()=>new SettingsModal(this.plugin).open(),'mod-cta');}}(this.app,this));
    this.addCommand({id:'settings',name:'Settings',callback:()=>new SettingsModal(this).open()});
    uiLanguage=preferences(this.settings).language;
    const observer=new MutationObserver(()=>this.refreshPreferences());observer.observe(document.body,{attributes:true,attributeFilter:['class']});this.register(()=>observer.disconnect());
    const refresh=()=>{clearTimeout(this.timer);this.timer=setTimeout(()=>this.scan().catch(report),180);};
    for(const event of ['create','modify','delete','rename'])this.registerEvent(this.app.vault.on(event,refresh));
    this.register(()=>{this.stopped=true;this.scanVersion++;clearTimeout(this.timer);});this.registerInterval(window.setInterval(()=>this.scan().catch(report),60000));this.app.workspace.onLayoutReady(()=>this.scan().catch(report));
  }
  refreshPreferences(){uiLanguage=effectivePreferences(this).language;for(const leaf of this.app.workspace.getLeavesOfType(VIEW))leaf.view.render();for(const root of document.querySelectorAll('.modal .tf-editor-modal'))applyPreferences(root,this);}
  async savePreferences(draft,expected){
    const next=preferences({preferences:draft});await this.updateSettings(settings=>{if(JSON.stringify(preferences(settings))!==expected)throw new Error(tr('Einstellungen wurden inzwischen geändert. Bitte erneut öffnen.'));settings.preferences=next;});
  }
  async updateSettings(mutate){
    const run=(this.settingsQueue||Promise.resolve()).catch(()=>{}).then(async()=>{const next=structuredClone(this.settings);const result=mutate(next);await this.saveData(next);this.settings=next;for(const leaf of this.app.workspace.getLeavesOfType(VIEW))leaf.view.render();return result;});this.settingsQueue=run;return run;
  }
  async storeProject(data,original=null){
    return this.updateSettings(settings=>{
      const list=projects(settings),current=original?list.find(p=>p.id===original.id):null;
      if(original&&(!current||JSON.stringify(current)!==JSON.stringify(original)))throw new Error(tr('Das Projekt wurde inzwischen geändert. Bitte erneut öffnen.'));
      const fields=projectInput(data,list,original?.id),id=original?.id||crypto.randomUUID();
      if(current)Object.assign(current,fields);else list.push({id,...fields});settings.projects=list;return id;
    });
  }
  async storeFilter(name,filters,id){
    return this.updateSettings(settings=>{const presets=savedFilters(settings),title=filterName(name,presets,id);if(id){const found=presets.find(p=>p.id===id);if(!found)throw new Error(tr('Der gespeicherte Filter existiert nicht mehr.'));found.name=title;}
      else{ id=crypto.randomUUID();presets.push({id,name:title,filters:filterSnapshot(filters)});}settings.savedFilters=presets;return id;});
  }
  async deleteFilter(id){return this.updateSettings(settings=>{settings.savedFilters=savedFilters(settings).filter(p=>p.id!==id);});}
  async readTaskFiles(){
    const tasks=[];for(const file of this.app.vault.getMarkdownFiles().filter(f=>f.path.startsWith(this.settings.folder+'/'))){const raw=await this.app.vault.read(file);try{const parsed=decode(raw);validateTaskFields(parsed.meta);tasks.push({file,raw,...parsed});}catch(_){/* Other Markdown files are never deletion targets. */}}return tasks;
  }
  async trashTransaction(task,plan){
    if(this.seriesEditing)throw new Error(tr('Eine Aufgabenänderung läuft bereits. Bitte kurz warten.'));
    this.seriesEditing=true;this.scanVersion++;const written=[];
    try{
      if(this.recurrenceRun)await this.recurrenceRun;
      const tasks=await this.readTaskFiles(),selected=tasks.find(t=>t.file.path===task.file.path);
      if(!selected||selected.raw!==task.raw)throw new Error(tr('Die Aufgabe wurde inzwischen geändert. Bitte erneut öffnen.'));
      const changes=plan(tasks,selected);
      for(const change of changes){if(await this.app.vault.read(change.task.file)!==change.task.raw)throw new Error(tr('Eine betroffene Aufgabe wurde inzwischen geändert.'));}
      for(const change of changes){const next=encode(change.meta,change.body);await this.app.vault.process(change.task.file,raw=>{if(raw!==change.task.raw)throw new Error(tr('Eine betroffene Aufgabe wurde inzwischen geändert.'));return next;});written.push({...change,next});}
    }catch(e){
      let conflict=false;for(const change of written.reverse()){try{await this.app.vault.process(change.task.file,raw=>{if(raw!==change.next)throw new Error('Konflikt');return change.task.raw;});}catch(_){conflict=true;}}
      if(conflict)throw new Error(tr('Änderung unvollständig: Gleichzeitig bearbeitete Dateien wurden nicht überschrieben. Bitte den Papierkorb und die betroffenen Aufgaben prüfen.'));throw e;
    }finally{this.seriesEditing=false;await this.scan();}
  }
  async moveToTrash(task,scope='single'){return this.trashTransaction(task,(tasks,selected)=>trashPlan(tasks,selected,scope,crypto.randomUUID(),new Date().toISOString()));}
  async restoreTrash(task){return this.trashTransaction(task,(tasks,selected)=>restoreTrashPlan(tasks,selected));}
  async emptyTrash(snapshot){
    if(this.seriesEditing)throw new Error(tr('Eine Aufgabenänderung läuft bereits. Bitte kurz warten.'));
    this.seriesEditing=true;this.scanVersion++;let removed=0;
    try{
      if(this.recurrenceRun)await this.recurrenceRun;
      const current=await this.readTaskFiles(),targets=snapshot.map(task=>{const found=current.find(t=>t.file.path===task.file.path);if(!found||!found.meta.trashed||found.raw!==task.raw)throw new Error(tr('Der Papierkorb wurde inzwischen geändert. Bitte neu öffnen und prüfen.'));return found;});
      // Permanently purging a generated term is safe only with its source-side skip.
      for(const task of targets){if(!task.meta.recurrenceSeries)continue;const source=current.find(t=>t.meta.id===task.meta.recurrenceSeries&&t.meta.recurrence);if(source&&!source.meta.trashed&&!(source.meta.recurrence.skipped||[]).map(dateValue).includes(dateValue(task.meta.recurrenceDate)))throw new Error(tr('Ein Serientermin ist nicht gegen Neuerzeugung geschützt. Bitte erst wiederherstellen und erneut löschen.'));}
      targets.sort((a,b)=>Number(!!a.meta.recurrence)-Number(!!b.meta.recurrence));
      for(const task of targets){const raw=await this.app.vault.read(task.file);if(raw!==task.raw||!decode(raw).meta.trashed)throw new Error(tr('Eine Aufgabe wurde während des Leerens geändert.'));await this.app.vault.delete(task.file);removed++;}
    }catch(e){throw new Error(tfmt(tr("{0} Datei(en) endgültig gelöscht. Verbleibende Dateien bleiben im Papierkorb. {1}"),removed,e.message));}
    finally{this.seriesEditing=false;await this.scan();}
  }
  async open(){let leaf=this.app.workspace.getLeavesOfType(VIEW)[0];if(!leaf){leaf=this.app.workspace.getLeaf('tab');await leaf.setViewState({type:VIEW,active:true});}this.app.workspace.revealLeaf(leaf);}
  async scan(){
    if(this.stopped||this.seriesEditing)return;
    const version=++this.scanVersion;const tasks=[];let invalid=0;
    const files=this.app.vault.getMarkdownFiles().filter(f=>f.path.startsWith(this.settings.folder+'/'));
    // Bound parallel reads so a large series does not serialize every disk access.
    for(let i=0;i<files.length;i+=16){
      const batch=await Promise.all(files.slice(i,i+16).map(async file=>{
        try{const raw=await this.app.vault.read(file),{meta,body}=decode(raw);validateTaskFields(meta);return {file,raw,meta,body};}
        catch(e){invalid++;console.warn('TaskFlow überspringt',file.path,e);return null;}
      }));
      tasks.push(...batch.filter(Boolean));if(version!==this.scanVersion||this.stopped)return;
    }
    if(version!==this.scanVersion)return;
    if(await this.ensureRecurrences(tasks))return this.scan();
    if(version!==this.scanVersion)return;const signature=JSON.stringify([today(),tasks.map(t=>[t.file.path,t.raw]).sort((a,b)=>a[0].localeCompare(b[0]))]);const changed=signature!==this.scanSignature;this.scanSignature=signature;this.tasks=tasks;if(changed)for(const leaf of this.app.workspace.getLeavesOfType(VIEW))leaf.view.render();if(invalid!==this.invalidCount&&invalid)new Notice(tfmt(tr("{0} Datei(en) im TaskFlow-Ordner konnten nicht gelesen werden. Details in der Entwicklerkonsole."),invalid));this.invalidCount=invalid;
  }
  async ensureRecurrences(tasks,reference=today()){
    if(this.seriesEditing)return 0;
    if(this.recurrenceRun)return this.recurrenceRun;
    this.recurrenceRun=(async()=>{
      let created=0;const known=new Set(tasks.filter(t=>t.meta.recurrenceSeries&&t.meta.recurrenceDate).map(t=>recurrenceKey(t.meta)));
      for(const source of tasks){
        if(source.meta.trashed||!source.meta.recurrence||source.meta.recurrence.enabled===false||source.meta.recurrenceSeries)continue;
        try{
          if(typeof source.meta.id!=='string'||!/^[a-zA-Z0-9_-]+$/.test(source.meta.id))throw new Error(tr('Serienaufgabe benötigt eine gültige ID. Bitte im Editor speichern.'));
          for(const day of recurrenceDates(source.meta.recurrence,reference)){
            if(this.stopped)return created;
            const key=source.meta.id+'|'+(source.meta.recurrence.revision||'')+'|'+day;if(known.has(key))continue;
            const occurrence=recurrenceOccurrence(source,day);validateTaskFields(occurrence.meta);validatePlanning(occurrence.meta);const path=normalizePath(this.settings.folder+'/'+occurrence.meta.id+'.md');
            const existing=this.app.vault.getAbstractFileByPath(path);if(existing){const parsed=decode(await this.app.vault.read(existing));if(recurrenceKey(parsed.meta)!==key)throw new Error(tr('Der Dateiname für einen Serientermin ist bereits belegt.'));continue;}
            try{await this.app.vault.create(path,encode(occurrence.meta,occurrence.body));created++;known.add(key);}
            catch(e){if(!this.app.vault.getAbstractFileByPath(path))throw e;}
          }
        }catch(e){console.error('TaskFlow Serie',source.file.path,e);const message=source.file.path+': '+e.message;if(this.recurrenceError!==message){new Notice('TaskFlow Wiederholung: '+message);this.recurrenceError=message;}}
      }
      return created;
    })();
    try{return await this.recurrenceRun;}finally{this.recurrenceRun=null;}
  }
  stamp(meta,previous){
    meta.updated=new Date().toISOString();
    if(meta.status==='done'){if(previous!=='done')meta.completed=meta.updated;if(preferences(this.settings).autoArchive)meta.archived=true;}
    else{delete meta.completed;if(previous==='done')meta.archived=false;}
  }
  async change(task,mutate,bodyFn=body=>body,expected){
    await this.app.vault.process(task.file,raw=>{if(expected!==undefined&&raw!==expected)throw new Error(tr('Aufgabe wurde zwischenzeitlich geändert. Bitte erneut öffnen.'));const {meta,body}=decode(raw);if(meta.trashed)throw new Error(tr('Die Aufgabe liegt im Papierkorb. Bitte zuerst wiederherstellen.'));const previous=meta.status,before=JSON.stringify([meta.title,meta.priority,meta.tags,meta.taskflowProject,meta.due,meta.scheduled,meta.scheduledTime,meta.durationMinutes]),prior=structuredClone(meta);mutate(meta);if(before!==JSON.stringify([meta.title,meta.priority,meta.tags,meta.taskflowProject,meta.due,meta.scheduled,meta.scheduledTime,meta.durationMinutes]))protectOccurrence(meta,{meta:prior,body});validateTaskFields(meta);validatePlanning(meta);this.stamp(meta,previous);return encode(meta,bodyFn(body));});await this.scan();
  }
  async updateNotes(task,expectedNotes,newNotes){
    await this.app.vault.process(task.file,raw=>{const {meta,body}=decode(raw);if(meta.trashed)throw new Error(tr('Die Aufgabe liegt im Papierkorb. Bitte zuerst wiederherstellen.'));const updated=patchNoteBody(body,expectedNotes,newNotes);protectOccurrence(meta,{meta:structuredClone(meta),body});this.stamp(meta,meta.status);return encode(meta,updated);});
    await this.scan();
  }
  async skipOccurrence(task){
    await this.app.vault.process(task.file,raw=>{if(raw!==task.raw)throw new Error(tr('Der Termin wurde inzwischen geändert. Bitte erneut öffnen.'));const {meta,body}=decode(raw);if(meta.trashed)throw new Error(tr('Die Aufgabe liegt im Papierkorb.'));if(!meta.recurrence&&!meta.recurrenceSeries)throw new Error(tr('Dies ist kein Serientermin.'));if(meta.recurrence&&!meta.recurrenceTemplate)meta.recurrenceTemplate=seriesSnapshot({meta,body});meta.recurrenceSkipped=true;meta.archived=true;this.stamp(meta,meta.status);return encode(meta,body);});await this.scan();
  }
  async saveScopedTask(task,meta,body,scope='single',rule,expectedSource){
    if(!task)return this.saveTask(null,meta,body);
    if(scope!=='future'){if(task.meta.recurrence||task.meta.recurrenceSeries){protectOccurrence(meta,task);if(task.meta.recurrence)meta.recurrence=structuredClone(task.meta.recurrence);}return this.saveTask(task,meta,body);}
    if(this.seriesEditing)throw new Error(tr('Eine Serienänderung wird bereits gespeichert. Bitte kurz warten.'));
    this.seriesEditing=true;this.scanVersion++;
    const written=[];
    try{
      if(this.recurrenceRun)await this.recurrenceRun;
      const tasks=[],files=this.app.vault.getMarkdownFiles().filter(file=>file.path.startsWith(this.settings.folder+'/'));
      for(let i=0;i<files.length;i+=16){const batch=await Promise.all(files.slice(i,i+16).map(async file=>{const raw=await this.app.vault.read(file);try{const parsed=decode(raw);validateTaskFields(parsed.meta);return {file,raw,...parsed};}catch(_){return null;}}));tasks.push(...batch.filter(Boolean));}
      const current=tasks.find(t=>t.file.path===task.file.path);if(!current||current.raw!==task.raw)throw new Error(tr('Der gewählte Termin wurde zwischenzeitlich geändert. Bitte erneut öffnen.'));
      if(expectedSource&&!tasks.some(t=>t.file.path===expectedSource.file.path&&t.raw===expectedSource.raw))throw new Error(tr('Die Serie wurde zwischenzeitlich geändert. Bitte erneut öffnen.'));
      const changes=seriesPlan(tasks,current,meta,body,rule,crypto.randomUUID());
      for(const change of changes){validateTaskFields(change.meta);validatePlanning(change.meta);validateRecurrence(change.meta.recurrence);if(await this.app.vault.read(change.task.file)!==change.task.raw)throw new Error(tr('Ein betroffener Termin wurde zwischenzeitlich geändert. Bitte erneut öffnen.'));}
      for(const change of changes){if(this.stopped)throw new Error('TaskFlow wurde deaktiviert.');this.stamp(change.meta,change.task.meta.status);const next=encode(change.meta,change.body);await this.app.vault.process(change.task.file,raw=>{if(raw!==change.task.raw)throw new Error(tr('Ein betroffener Termin wurde zwischenzeitlich geändert. Bitte erneut öffnen.'));return next;});written.push({...change,next});}
    }catch(e){
      let conflict=false;for(const change of written.reverse()){try{await this.app.vault.process(change.task.file,raw=>{if(raw!==change.next)throw new Error('Konflikt');return change.task.raw;});}catch(_){conflict=true;}}
      if(conflict)throw new Error(tr('Serienänderung unvollständig: Gleichzeitig bearbeitete Dateien wurden nicht überschrieben. Bitte prüfe die betroffenen Termine.'));throw e;
    }finally{this.seriesEditing=false;await this.scan();}
  }
  async saveTask(task,meta,body){
    validateTaskFields(meta);validatePlanning(meta);validateRecurrence(meta.recurrence);if(meta.recurrence&&!meta.id)meta.id=crypto.randomUUID();
    if(task){await this.app.vault.process(task.file,raw=>{if(raw!==task.raw)throw new Error(tr('Aufgabe wurde zwischenzeitlich geändert. Bitte erneut öffnen; deine Eingabe bleibt hier erhalten.'));this.stamp(meta,decode(raw).meta.status);return encode(meta,body);});}
    else{const folder=normalizePath(this.settings.folder);let current='';for(const part of folder.split('/')){current=current?current+'/'+part:part;if(!this.app.vault.getAbstractFileByPath(current))await this.app.vault.createFolder(current);}meta.id=crypto.randomUUID();this.stamp(meta,null);await this.app.vault.create(`${folder}/${meta.id}.md`,encode(meta,body));}
    await this.scan();
  }
}
module.exports=TaskFlow;
module.exports.testing={dailyInsight,tfmt,tr,translatedLabels,preferences,contrastRatio,sortedTasks,PREFERENCE_DEFAULTS,PALETTES,COLOR_FIELDS,applyPreferences,SettingsModal,projects,projectInput,projectTasks,projectSummary,ProjectEditor,today,dateValue,decode,encode,overdue,summarize,subtasks,toggleSubtask,STATES,PRIORITIES,duePresentation,completionDay,moveFrames,TaskView,analytics,calendarDays,editorSubtasks,editorBody,validDay,shiftDay,plannerWeek,timeMinutes,durationMinutes,clockTime,validatePlanning,assignDay,dayPlan,noteField,patchNoteBody,calendarMove,calendarEvents,calendarBounds,calendarDropMinute,calendarTasks,validateRecurrence,recurrenceDates,recurrenceOccurrence,recurrenceLabel,validateTaskFields,filterTasks,searchText,filterSnapshot,savedFilters,filterName,seriesPlan,seriesSnapshot,recurrenceKey,mergeSeriesBody,homeOverview,startView,hiddenNavigation,isSeriesTask,tasksForView,seriesOverview,TaskEditor,trashPlan,restoreTrashPlan,trashGroups,TrashModal,EmptyTrashModal,homeDestination,canCreateTasks};
