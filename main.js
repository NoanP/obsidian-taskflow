/* TaskFlow — editable source and release entry point. No build step required. */
const {Plugin, ItemView, Modal, Setting, Notice, PluginSettingTab, parseYaml, stringifyYaml, normalizePath} = require('obsidian');
const VIEW = 'taskflow-board';
const STATES = {open:'Offen', progress:'In Arbeit', delayed:'Verzögert', done:'Erledigt'};
const PRIORITIES={high:'Hoch',normal:'Normal',low:'Niedrig'};
const localDay=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const today=()=>localDay(new Date());
function completionDay(value){if(!value)return '';const d=new Date(value);return Number.isNaN(d.getTime())?'':localDay(d);}
function duePresentation(task){
  if(task.meta.status==='done')return {kind:'closed',label:'Abgeschlossen'};
  const due=dateValue(task.meta.due);
  if(!due)return {kind:'none',label:'Kein Termin'};
  if(due<today())return {kind:'late',label:'Überfällig · '+due};
  if(due===today())return {kind:'today',label:'Heute · '+due};
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
function svgElement(parent,name,attributes={}){
  const el=parent.ownerDocument.createElementNS('http://www.w3.org/2000/svg',name);
  for(const [key,value]of Object.entries(attributes))el.setAttribute(key,String(value));parent.appendChild(el);return el;
}
function dateValue(v) { return v instanceof Date ? v.toISOString().slice(0,10) : typeof v === 'string' ? v.slice(0,10) : ''; }
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
  for (const t of tasks) { s[t.meta.status in STATES ? t.meta.status : 'open']++; if(overdue(t)) s.overdue++; }
  return s;
}
function subtasks(body) { return [...body.matchAll(/^\s*[-*] \[([ xX])\] (.*)$/gm)]; }
function toggleSubtask(body, index) { let n=0; return body.replace(/^(\s*[-*] \[)([ xX])(\] .*)$/gm,(all,a,b,c)=>n++===index ? a+(b===' '?'x':' ')+c:all); }
// Keep original checkbox locations and formatting unless the note text is edited.
function editorSubtasks(body){
  const items=[];
  let notes=body.replace(/^([ \t]*[-*] \[)([ xX])(\] )([^\r\n]*)(\r?)$/gm,(raw,prefix,mark,suffix,text,cr)=>{items.push({id:items.length,text,done:mark!==' ',prefix,mark,suffix,cr,raw});return '';});
  notes=notes.replace(/^##[ \t]+Teilaufgaben[ \t]*\r?\n(?=[ \t\r\n]*$)/m,'');
  return {notes,items};
}
function editorBody(original,notes,items){
  const parsed=editorSubtasks(original),kept=new Map(items.filter(x=>x.id!==null).map(x=>[x.id,x]));
  const line=item=>'- ['+(item.done?'x':' ')+'] '+item.text.trim();
  let body,extra;
  if(notes.replace(/\r\n/g,'\n')===parsed.notes.replace(/\r\n/g,'\n')){let index=0;body=original.replace(/^([ \t]*[-*] \[)([ xX])(\] )([^\r\n]*)(\r?)$/gm,(raw,prefix,mark,suffix,text,cr)=>{const item=kept.get(index++);if(!item)return '';if(item.text===text&&item.done===(mark!==' '))return raw;return prefix+(item.done?(mark==='X'?'X':'x'):' ')+suffix+item.text.trim()+cr;});extra=items.filter(x=>x.id===null);}
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
function plannerWeek(value){const date=new Date(value+'T12:00:00'),monday=shiftDay(value,-((date.getDay()+6)%7));return Array.from({length:7},(_,i)=>shiftDay(monday,i));}
function timeMinutes(value){if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))return null;return Number(value.slice(0,2))*60+Number(value.slice(3));}
function durationMinutes(meta){const n=Number(meta.durationMinutes);return Number.isInteger(n)&&n>=5&&n<=720?n:30;}
function clockTime(minutes){return String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');}
function validatePlanning(meta){
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
    if(task.meta.archived)return [];
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
function calendarBounds(tasks,days){
  let start=7*60,end=20*60;
  for(const task of tasks){const minute=timeMinutes(task.meta.scheduledTime);if(!task.meta.archived&&days.includes(dateValue(task.meta.scheduled))&&minute!==null){start=Math.min(start,Math.floor(minute/60)*60);end=Math.max(end,Math.min(1440,Math.ceil((minute+durationMinutes(task.meta))/60)*60));}}
  return {start,end};
}
const RECURRENCES={daily:'Täglich',weekly:'Wöchentlich',monthly:'Monatlich'};
function validateRecurrence(rule){
  if(!rule||rule.enabled===false)return;
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
    if(monthly){const first=new Date(start.getFullYear(),start.getMonth()+index*rule.interval,1,12);const last=new Date(first.getFullYear(),first.getMonth()+1,0,12).getDate();first.setDate(Math.min(start.getDate(),last));date=localDay(first);}
    else date=shiftDay(rule.start,index*step);
    if(date>upper)break;if(date>=lower)result.push(date);
  }
  return result;
}
function recurrenceOccurrence(source,day){
  const rule=source.meta.recurrence,meta=structuredClone(source.meta);
  delete meta.recurrence;delete meta.completed;delete meta.archived;delete meta.updated;
  meta.id=source.meta.id+'--'+day;meta.recurrenceSeries=source.meta.id;meta.recurrenceDate=day;
  meta.status='open';meta.due=day;meta.scheduled=day;meta.durationMinutes=rule.durationMinutes||30;
  if(rule.time)meta.scheduledTime=rule.time;else delete meta.scheduledTime;
  meta.created=new Date().toISOString();
  const body=source.body.replace(/^(\s*[-*+] \[)[xX](\] )/gm,'$1 $2');
  return {meta,body};
}
function recurrenceLabel(meta){
  if(meta.recurrence)return meta.recurrence.enabled===false?'↻ Serie pausiert':'↻ '+(RECURRENCES[meta.recurrence.frequency]||'Serie')+(meta.recurrence.interval>1?' · alle '+meta.recurrence.interval:'');
  return meta.recurrenceSeries?'↻ Serientermin':'';
}
function button(parent, text, action, cls='') { const b=parent.createEl('button',{text,cls}); b.addEventListener('click',action); return b; }
function report(e) { console.error('TaskFlow',e); new Notice(`TaskFlow: ${e.message || e}`); }
class TaskEditor extends Modal {
  constructor(plugin,task,status='open',scheduled='',priority='normal',initialTime=''){super(plugin.app);this.plugin=plugin;this.task=task;this.initialStatus=status;this.initialScheduled=scheduled;this.initialPriority=priority;this.initialTime=initialTime;}
  onOpen(){
    const c=this.contentEl;c.addClass('tf-editor-modal');this.modalEl.addClass('tf-task-modal');
    const data=this.task?structuredClone(this.task.meta):{taskflow:1,title:'',status:this.initialStatus,priority:this.initialPriority,tags:[],due:'',scheduled:this.initialScheduled,scheduledTime:this.initialTime,created:new Date().toISOString()};
    const original=this.task?.body||'',parsed=editorSubtasks(original);let items=parsed.items.map(x=>({...x}));
    const header=c.createDiv({cls:'tf-editor-header'});header.createEl('h2',{text:this.task?'Aufgabe bearbeiten':'Neue Aufgabe'});header.createEl('p',{text:'Ein klarer nächster Schritt. Details und Teilaufgaben ergänzt du darunter.'});
    const form=c.createEl('form',{cls:'tf-task-form'});form.noValidate=true;
    const field=(parent,name,type,value,change,placeholder='')=>{
      const label=parent.createEl('label',{cls:'tf-form-field'});label.createSpan({text:name});const input=label.createEl('input',{type,value:String(value??''),placeholder});input.setAttribute('aria-label',name);input.oninput=()=>change(input.value);return input;
    };
    const title=field(form,'Aufgabentitel','text',data.title,v=>data.title=v,'Was möchtest du erledigen?');title.addClass('tf-task-title-input');
    const details=form.createDiv({cls:'tf-form-grid'});
    const dropdown=(name,values,value,change)=>{const label=details.createEl('label',{cls:'tf-form-field'});label.createSpan({text:name});const select=label.createEl('select');select.setAttribute('aria-label',name);for(const [key,text]of Object.entries(values))select.createEl('option',{value:key,text});select.value=value;select.onchange=()=>change(select.value);};
    dropdown('Status',STATES,data.status,v=>data.status=v);dropdown('Priorität',PRIORITIES,data.priority||'normal',v=>data.priority=v);
    field(details,'Fällig am','date',dateValue(data.due),v=>data.due=v);
    field(details,'Tags','text',(data.tags||[]).join(', '),v=>data.tags=[...new Set(v.split(',').map(t=>t.trim().replace(/^#/, '')).filter(Boolean))],'arbeit, privat, projekt');
    const planning=form.createEl('details',{cls:'tf-form-planning'});planning.open=!!dateValue(data.scheduled);planning.createEl('summary',{text:'Tagesplanung · optional'});
    planning.createEl('p',{text:'Plane einen Arbeitstag und bei Bedarf einen Zeitblock. Die Fälligkeit bleibt eine eigene Deadline.'});
    const planFields=planning.createDiv({cls:'tf-planning-fields'});
    field(planFields,'Geplant am','date',dateValue(data.scheduled),v=>{data.scheduled=v;if(!v){data.scheduledTime='';time.value='';}});
    const time=field(planFields,'Startzeit','time',data.scheduledTime||'',v=>data.scheduledTime=v);
    const duration=field(planFields,'Dauer in Minuten','number',durationMinutes(data),v=>data.durationMinutes=v===''?30:Number(v));duration.min='5';duration.max='720';duration.step='5';
    const repeat=form.createDiv({cls:'tf-form-section tf-recurrence'});
    if(data.recurrenceSeries){repeat.createEl('p',{text:'↻ Einzeltermin einer Serie. Änderungen gelten nur für diesen Termin. Die Serie steuerst du über die ursprüngliche Aufgabe.',cls:'tf-muted'});}
    else{
      const existing=data.recurrence,rule=existing?structuredClone(existing):{enabled:true,frequency:'weekly',interval:1,start:dateValue(data.scheduled)||dateValue(data.due)||today(),time:data.scheduledTime||'',durationMinutes:durationMinutes(data),until:''};
      const label=repeat.createEl('label',{cls:'tf-form-field'});label.createSpan({text:'Wiederholen'});const select=label.createEl('select');select.setAttribute('aria-label','Wiederholen');
      for(const [key,text]of Object.entries({none:'Keine Wiederholung',...RECURRENCES}))select.createEl('option',{value:key,text});select.value=existing&&existing.enabled!==false?rule.frequency:'none';
      const repeatFields=repeat.createDiv({cls:'tf-recurrence-fields'});repeatFields.hidden=select.value==='none';
      const interval=field(repeatFields,'Alle … Tage / Wochen / Monate','number',rule.interval,v=>rule.interval=Number(v));interval.min='1';interval.max='365';interval.step='1';
      const start=field(repeatFields,'Erster Termin','date',rule.start,v=>rule.start=v);start.disabled=!!existing;
      field(repeatFields,'Uhrzeit je Termin (optional)','time',rule.time,v=>rule.time=v);
      const length=field(repeatFields,'Termindauer in Minuten','number',rule.durationMinutes,v=>rule.durationMinutes=Number(v));length.min='5';length.max='720';length.step='5';
      field(repeatFields,'Letzter Termin (optional)','date',rule.until||'',v=>rule.until=v);
      repeatFields.createEl('p',{text:'Der erste Termin bestimmt den Wochentag. Weitere Termine entstehen automatisch für die nächsten 90 Tage, jeweils als eigene Aufgabe mit Kalendereintrag. Ohne Uhrzeit stehen sie unter Flexibel. Änderungen der Serie gelten für noch nicht erstellte Termine; bereits angelegte Termine bleiben erhalten.',cls:'tf-muted'});
      select.onchange=()=>{repeatFields.hidden=select.value==='none';};
      this.readRecurrence=()=>{
        if(select.value==='none'){if(existing)data.recurrence={...existing,enabled:false};else delete data.recurrence;return;}
        rule.enabled=true;rule.frequency=select.value;validateRecurrence(rule);data.recurrence=rule;
        if(!existing){data.due=rule.start;data.scheduled=rule.start;data.scheduledTime=rule.time||'';data.durationMinutes=rule.durationMinutes;}
      };
    }
    const notesSection=form.createDiv({cls:'tf-form-section'});notesSection.createEl('h3',{text:'Notizen'});
    const notes=notesSection.createEl('textarea',{cls:'tf-note-editor',placeholder:'Gedanken, Links oder weitere Details …'});notes.value=parsed.notes;notes.rows=5;notes.setAttribute('aria-label','Notizen');
    const subSection=form.createDiv({cls:'tf-form-section'}),subHeader=subSection.createDiv({cls:'tf-subtask-editor-header'});subHeader.createEl('h3',{text:'Teilaufgaben'});const count=subHeader.createSpan({cls:'tf-muted'});
    const rows=subSection.createDiv({cls:'tf-subtask-editor-rows'});
    const addItem=()=>{items.push({id:null,text:'',done:false});renderRows(items.length-1);};
    const add=button(subHeader,'+ Teilaufgabe',addItem,'tf-add-subtask');add.type='button';
    function renderRows(focusIndex){
      rows.empty();count.setText(items.filter(x=>x.done).length+'/'+items.length);
      if(!items.length)rows.createDiv({text:'Zerlege die Aufgabe in kleine, konkrete Schritte.',cls:'tf-subtask-editor-empty'});
      items.forEach((item,index)=>{
        const row=rows.createDiv({cls:'tf-subtask-editor-row'}),check=row.createEl('input',{type:'checkbox'});check.checked=item.done;check.setAttribute('aria-label','Teilaufgabe '+(index+1)+' erledigt');check.onchange=()=>{item.done=check.checked;count.setText(items.filter(x=>x.done).length+'/'+items.length);};
        const input=row.createEl('input',{type:'text',value:item.text,placeholder:'Nächster Schritt …'});input.setAttribute('aria-label','Teilaufgabe '+(index+1));input.oninput=()=>item.text=input.value;
        input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();items.splice(index+1,0,{id:null,text:'',done:false});renderRows(index+1);}};
        const remove=button(row,'×',()=>{items.splice(index,1);renderRows(Math.min(index,items.length-1));},'tf-remove-subtask');remove.type='button';remove.setAttribute('aria-label','Teilaufgabe '+(index+1)+' entfernen');
        if(index===focusIndex)input.focus();
      });
    }
    renderRows();
    const error=form.createDiv({cls:'tf-form-error',attr:{role:'alert'}});error.hidden=true;
    const footer=form.createDiv({cls:'tf-editor-footer'});const cancel=button(footer,'Abbrechen',()=>this.close(),'tf-editor-cancel');cancel.type='button';const save=footer.createEl('button',{text:this.task?'Änderungen speichern':'Aufgabe erstellen',type:'submit',cls:'tf-editor-save'});
    form.onsubmit=async event=>{
      event.preventDefault();error.hidden=true;
      if(!data.title.trim()){error.setText('Bitte gib deiner Aufgabe einen Titel.');error.hidden=false;title.focus();return;}
      const blank=items.findIndex(x=>!x.text.trim()||/[\r\n]/.test(x.text));
      if(blank>=0){error.setText('Bitte fülle die leere Teilaufgabe aus oder entferne sie.');error.hidden=false;rows.querySelectorAll('input[type="text"]')[blank]?.focus();return;}
      try{this.readRecurrence?.();validatePlanning(data);}catch(e){error.setText(e.message);error.hidden=false;planning.open=true;return;}
      save.disabled=true;cancel.disabled=true;
      try{data.title=data.title.trim();await this.plugin.saveTask(this.task,data,editorBody(original,notes.value,items));this.close();}
      catch(e){error.setText(e.message||String(e));error.hidden=false;save.disabled=false;cancel.disabled=false;}
    };
    form.onkeydown=e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();form.requestSubmit();}};
    title.focus();
  }
  onClose(){this.contentEl.empty();}
}
class TaskView extends ItemView {
  constructor(leaf,plugin){super(leaf);this.plugin=plugin;this.query='';this.tag='';this.mode='board';this.plannerDate=today();this.plannerMode='agenda';this.calendarSpan='week';this.showArchive=false;this.statsDays=14;this.expandedTasks=new Set();this.noteDrafts=new Map();this.animations=new Set();this.closed=false;}
  getViewType(){return VIEW;} getDisplayText(){return 'TaskFlow';} getIcon(){return 'kanban-square';}
  async onOpen(){this.closed=false;this.render();}
  async onClose(){this.calendarPointerCleanup?.();this.closed=true;for(const a of this.animations)a.cancel();this.animations.clear();}
  captureCards(){
    const cards=new Map();
    for(const el of this.contentEl.querySelectorAll('.tf-card'))cards.set(el.dataset.path,{rect:el.getBoundingClientRect(),status:el.dataset.status});
    return cards;
  }
  animateMoves(previous){
    const win=this.contentEl.ownerDocument.defaultView;
    if(win.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
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
    if(this.closed)return;
    this.calendarPointerCleanup?.();
    const c=this.contentEl;
    // End an interrupted movement before measuring the stable board positions.
    for(const a of this.animations)a.cancel();this.animations.clear();
    const previous=this.captureCards();
    const active=c.ownerDocument.activeElement;
    const focus=active&&c.contains(active)&&active.dataset.tfFocus?{key:active.dataset.tfFocus,start:active.selectionStart,end:active.selectionEnd}:null;
    const scroll=c.scrollTop;
    c.empty();c.addClass('tf-root');
    const all=this.plugin.tasks.filter(t=>!!t.meta.archived===this.showArchive),s=summarize(all);
    const shell=c.createDiv({cls:'tf-shell'});
    const workspace=shell.createDiv({cls:'tf-workspace'});
    const side=workspace.createEl('nav',{cls:'tf-sidebar',attr:{'aria-label':'TaskFlow Navigation'}});
    side.createDiv({text:'TaskFlow',cls:'tf-side-label'});
    const navigate=(mode,archive)=>{this.mode=mode;this.showArchive=archive;this.render();};
    button(side,'Board',()=>navigate('board',false),'tf-side-item'+(!this.showArchive&&this.mode==='board'?' is-active':''));
    button(side,'Tagesplaner',()=>navigate('planner',false),'tf-side-item'+(!this.showArchive&&this.mode==='planner'?' is-active':''));
    button(side,'Statistik',()=>navigate('stats',false),'tf-side-item'+(!this.showArchive&&this.mode==='stats'?' is-active':''));
    button(side,'Archiv',()=>navigate('board',true),'tf-side-item'+(this.showArchive?' is-active':''));
    side.createDiv({text:'Tags',cls:'tf-side-label'});
    const tags=[...new Set(all.flatMap(t=>t.meta.tags||[]))].sort();
    button(side,'Alle Aufgaben',()=>{this.tag='';this.render();},'tf-side-item'+(!this.tag?' is-tag-active':''));
    for(const tag of tags)button(side,'#'+tag,()=>{this.tag=tag;this.render();},'tf-side-item'+(this.tag===tag?' is-tag-active':''));
    if(!tags.length)side.createDiv({text:'Noch keine Tags',cls:'tf-side-empty'});
    side.createDiv({text:'Lokal im Vault',cls:'tf-side-footer'});
    const main=workspace.createDiv({cls:'tf-main'});
    const header=main.createDiv({cls:'tf-header'}),title=header.createDiv();
    title.createEl('h1',{text:this.showArchive?(this.mode==='stats'?'Archiv · Statistik':'Archiv'):this.mode==='stats'?'Analyse & Statistik':this.mode==='planner'?'Tagesplaner':'Meine Aufgaben'});
    title.createEl('p',{text:new Date().toLocaleDateString('de-CH',{weekday:'long',day:'numeric',month:'long'})+' · Mein Arbeitsbereich',cls:'tf-muted tf-subtitle'});
    button(header,this.mode==='planner'?'+ Tagesaufgabe':'+ Neue Aufgabe',()=>new TaskEditor(this.plugin,null,'open',this.mode==='planner'?this.plannerDate:'').open(),'tf-primary');
    if(this.mode==='board'){
    const summary=main.createDiv({cls:'tf-summary'});
    for(const [key,label]of Object.entries({total:'gesamt',open:'offen',progress:'in Arbeit',delayed:'verzögert',done:'erledigt'})){
      const item=summary.createSpan();item.createEl('strong',{text:String(s[key])});item.appendText(' '+label);
    }
    const focusBar=main.createDiv({cls:'tf-focusbar'});
    const dueToday=all.filter(t=>t.meta.status!=='done'&&dateValue(t.meta.due)===today());
    focusBar.createEl('strong',{text:this.showArchive?'Archiv': 'Heute im Fokus'});
    focusBar.createSpan({text:this.showArchive?`${all.length} archivierte Aufgaben`:dueToday.length?dueToday.map(t=>t.meta.title).slice(0,2).join(' · '):'Keine Aufgaben heute fällig',cls:'tf-focus-text'});
    focusBar.createSpan({text:s.overdue?`${s.overdue} überfällig`:'Keine überfälligen Aufgaben',cls:s.overdue?'tf-due tf-due-late':'tf-muted'});
    }
    const toolbar=main.createDiv({cls:'tf-toolbar'});
    toolbar.createSpan({text:this.mode==='planner'?'FOKUS FÜR DEN TAG · ÜBERBLICK FÜR DIE WOCHE':this.mode==='stats'?'STATISTIK':'KANBAN / '+(this.showArchive?'ARCHIV':'ALLE AUFGABEN'),cls:'tf-eyebrow'});
    if(this.showArchive)button(toolbar,this.mode==='stats'?'Kanban':'Statistik',()=>{this.mode=this.mode==='stats'?'board':'stats';this.render();},'tf-text-button');
    const filters=toolbar.createDiv({cls:'tf-filters'});
    const search=filters.createEl('input',{type:'search',placeholder:'Aufgaben suchen …',cls:'tf-search'});search.value=this.query;search.dataset.tfFocus='search';search.setAttribute('aria-label','Aufgaben suchen');
    const select=filters.createEl('select');select.dataset.tfFocus='tag';select.setAttribute('aria-label','Nach Tag filtern');select.createEl('option',{text:'Alle Tags',value:''});
    // Keep a selected tag visible even when its last task has just been archived.
    if(this.tag&&!tags.includes(this.tag))tags.push(this.tag);
    tags.forEach(tag=>select.createEl('option',{text:'#'+tag,value:tag}));select.value=this.tag;
    const results=main.createDiv({cls:'tf-results'});
    search.oninput=()=>{this.query=search.value;this.renderResults(results,all);};
    select.onchange=()=>{this.tag=select.value;this.render();};
    this.renderResults(results,all);
    const footer=main.createDiv({cls:'tf-footer'});footer.createSpan({text:this.plugin.settings.folder});footer.createSpan({text:'TaskFlow '+this.plugin.manifest.version});
    c.scrollTop=scroll;
    if(focus){const target=c.querySelector(`[data-tf-focus="${focus.key}"]`);if(target){target.focus({preventScroll:true});if((target.type==='search'||target.tagName==='TEXTAREA')&&Number.isInteger(focus.start))target.setSelectionRange(focus.start,focus.end);}}
    this.animateMoves(previous);
  }
  renderResults(c,all){
    c.empty();const q=this.query.toLocaleLowerCase();
    const tasks=all.filter(t=>(!this.tag||(t.meta.tags||[]).includes(this.tag))&&`${t.meta.title} ${t.body} ${(t.meta.tags||[]).join(' ')}`.toLocaleLowerCase().includes(q));
    if(this.mode==='stats'){this.renderStats(c,tasks);return;}
    if(this.mode==='planner'){this.renderPlanner(c,tasks);return;}
    this.renderBoard(c,tasks);
  }
  renderBoard(c,tasks,groupBy='status'){
    const board=c.createDiv({cls:'tf-board'+(groupBy==='priority'?' tf-board-priority':'')});
    for(const [status,label]of Object.entries(groupBy==='priority'?PRIORITIES:STATES)){
      const col=board.createDiv({cls:'tf-column '+(groupBy==='priority'?'tf-priority-'+status:'tf-status-'+status)});col.dataset.status=status;
      const list=tasks.filter(t=>(groupBy==='priority'?(Object.hasOwn(PRIORITIES,t.meta.priority)?t.meta.priority:'normal'):t.meta.status)===status).sort((a,b)=>(dateValue(a.meta.due)||'9999').localeCompare(dateValue(b.meta.due)||'9999'));
      const heading=col.createDiv({cls:'tf-column-heading'});heading.createSpan({cls:'tf-status-dot',attr:{'aria-hidden':'true'}});heading.createEl('h2',{text:label});heading.createSpan({text:String(list.length),cls:'tf-count'});
      const add=button(heading,'+',()=>new TaskEditor(this.plugin,null,groupBy==='status'?status:'open',this.mode==='planner'?this.plannerDate:'',groupBy==='priority'?status:'normal').open(),'tf-column-add');add.setAttribute('aria-label','Aufgabe in '+label+' hinzufügen');
      const stack=col.createDiv({cls:'tf-card-stack'});
      for(const task of list){if(this.mode==='planner')this.plannerCard(stack,task);else this.card(stack,task);}
      if(!list.length)stack.createDiv({text:'Keine Aufgaben',cls:'tf-empty'});
      const drop=col.createDiv({text:'Hier ablegen',cls:'tf-drop-hint'});drop.setAttribute('aria-hidden','true');
      col.ondragover=e=>{if(!this.dragPath)return;e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='move';for(const other of board.children)other.removeClass('tf-drag-target');col.addClass('tf-drag-target');};
      col.ondragleave=e=>{if(!col.contains(e.relatedTarget))col.removeClass('tf-drag-target');};
      col.ondrop=e=>{e.preventDefault();col.removeClass('tf-drag-target');const path=e.dataTransfer?.getData('text/taskflow');if(path!==this.dragPath)return;this.dragPath=null;const task=this.plugin.tasks.find(t=>t.file.path===path);if(task){if(groupBy==='priority'){if(task.meta.priority!==status)this.plugin.change(task,m=>m.priority=status).catch(report);}else if(task.meta.status!==status)this.setStatus(task,status);}};
    }
    const legend=c.createDiv({cls:'tf-legend'});
    legend.createSpan({text:'Kartenrand: Priorität'});
    for(const [key,label]of Object.entries(PRIORITIES)){
      const item=legend.createSpan({cls:'tf-priority-'+key});item.createSpan({cls:'tf-priority-swatch',attr:{'aria-hidden':'true'}});item.appendText(label);
    }
    legend.createSpan({text:'Punkt: Status · Terminlabel: Fälligkeit',cls:'tf-legend-note'});
    const live=c.createDiv({cls:'tf-live',attr:{'aria-live':'polite','role':'status'}});if(this.lastMove)live.setText(this.lastMove);
  }
  async setStatus(task,status){
    if(this.pendingPath)return;
    this.pendingPath=task.file.path;this.contentEl.setAttribute('aria-busy','true');
    try{await this.plugin.change(task.originalTask||task,m=>{if(task.calendarAutomatic&&status==='done'&&!validDay(dateValue(m.scheduled))){assignDay(m,dateValue(task.meta.scheduled));delete m.scheduledTime;}m.status=status;});this.lastMove=task.meta.title+' → '+STATES[status];const live=this.contentEl.querySelector('.tf-live');if(live)live.setText(this.lastMove);}
    catch(e){report(e);this.render();}
    finally{this.pendingPath=null;this.contentEl.removeAttribute('aria-busy');}
  }
  card(col,t){
    const priority=Object.hasOwn(PRIORITIES,t.meta.priority)?t.meta.priority:'normal';
    const card=col.createDiv({cls:`tf-card tf-priority-${priority} tf-status-${t.meta.status}`});card.dataset.path=t.file.path;card.dataset.status=t.meta.status;card.draggable=true;
    card.ondragstart=e=>{if(this.pendingPath||e.target.closest('input,select,textarea')){e.preventDefault();return;}this.dragPath=t.file.path;e.dataTransfer.setData('text/taskflow',t.file.path);e.dataTransfer.effectAllowed='move';card.addClass('tf-dragging');};
    card.ondragend=()=>{this.dragPath=null;card.removeClass('tf-dragging');for(const el of this.contentEl.querySelectorAll('.tf-drag-target'))el.removeClass('tf-drag-target');};
    const top=card.createDiv({cls:'tf-card-top'}),status=top.createSpan({cls:'tf-status-label'});status.createSpan({cls:'tf-status-dot',attr:{'aria-hidden':'true'}});status.appendText(STATES[t.meta.status]);
    top.createSpan({text:(priority==='high'?'↑ ':priority==='low'?'↓ ':'– ')+PRIORITIES[priority],cls:'tf-priority-label'});
    button(card,t.meta.title,()=>new TaskEditor(this.plugin,t).open(),'tf-title');
    if((t.meta.tags||[]).length){const tags=card.createDiv({cls:'tf-tags'});for(const tag of t.meta.tags)tags.createSpan({text:'#'+tag});}
    const due=duePresentation(t);card.createDiv({text:due.label,cls:'tf-due tf-due-'+due.kind});
    const repeatLabel=recurrenceLabel(t.meta);if(repeatLabel)card.createDiv({text:repeatLabel,cls:'tf-recurrence-label'});
    this.cardNote(card,t);
    const subs=subtasks(t.body);
    if(subs.length){
      const panelId='tf-subtasks-'+crypto.randomUUID(),expanded=this.expandedTasks.has(t.file.path);
      const toggle=button(card,(expanded?'▾':'▸')+` Teilaufgaben · ${subs.filter(x=>x[1]!==' ').length}/${subs.length}`,()=>{
        const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));panel.hidden=!open;toggle.setText((open?'▾':'▸')+` Teilaufgaben · ${subs.filter(x=>x[1]!==' ').length}/${subs.length}`);if(open)this.expandedTasks.add(t.file.path);else this.expandedTasks.delete(t.file.path);
      },'tf-subtasks-toggle');toggle.setAttribute('aria-expanded',String(expanded));toggle.setAttribute('aria-controls',panelId);
      const panel=card.createDiv({cls:'tf-subtasks-panel'});panel.id=panelId;panel.hidden=!expanded;
      subs.forEach((sub,index)=>{const label=panel.createEl('label',{cls:'tf-subtask'}),check=label.createEl('input',{type:'checkbox'});check.checked=sub[1]!==' ';label.createSpan({text:sub[2]});check.onchange=async()=>{check.disabled=true;try{await this.plugin.change(t,()=>{},body=>toggleSubtask(body,index),t.raw);}catch(e){report(e);this.render();}};});
    }
    const controls=card.createDiv({cls:'tf-card-actions'});const select=controls.createEl('select');select.setAttribute('aria-label','Status für '+t.meta.title);
    for(const [value,text]of Object.entries(STATES))select.createEl('option',{value,text});select.value=t.meta.status;
    select.onchange=()=>{if(this.pendingPath){select.value=t.meta.status;return;}select.disabled=true;this.setStatus(t,select.value);};
    button(controls,'Notiz',()=>this.app.workspace.getLeaf(false).openFile(t.file),'tf-text-button');
    button(controls,t.meta.archived?'Wiederherstellen':'Archivieren',async()=>{try{await this.plugin.change(t,m=>m.archived=!m.archived);}catch(e){report(e);}},'tf-text-button');
    return card;
  }
  cardNote(card,task){
    const field=noteField(task.body),draft=this.noteDrafts.get(task.file.path);
    const group=card.createDiv({cls:'tf-card-note'}),label=group.createEl('label');label.createSpan({text:'Notiz',cls:'tf-card-note-label'});
    const input=label.createEl('textarea',{cls:'tf-card-note-input',placeholder:'Notiz zur Aufgabe …'});input.rows=3;input.value=draft?draft.value:field.value;input.dataset.tfFocus='note-'+encodeURIComponent(task.file.path);input.setAttribute('aria-label','Notiz für '+task.meta.title);input.disabled=!!draft?.saving;
    const actions=group.createDiv({cls:'tf-card-note-actions'}),status=actions.createSpan({cls:'tf-card-note-status',attr:{'aria-live':'polite'}});
    const error=group.createDiv({cls:'tf-card-note-error',attr:{role:'alert'}});error.hidden=!draft?.error;if(draft?.error)error.setText(draft.error);
    const save=button(actions,'Speichern',async()=>{
      const pending=this.noteDrafts.get(task.file.path);if(!pending||pending.saving)return;
      pending.saving=true;pending.error='';input.disabled=true;save.disabled=true;discard.disabled=true;status.setText('Wird gespeichert …');error.hidden=true;
      try{await this.plugin.updateNotes(task,pending.baseNotes,pending.prefix+pending.value);this.noteDrafts.delete(task.file.path);this.render();}
      catch(e){pending.saving=false;pending.error=e.message||String(e);this.render();}
    },'tf-note-save');
    const discard=button(actions,'Verwerfen',()=>{this.noteDrafts.delete(task.file.path);this.render();},'tf-text-button');
    const refresh=()=>{const current=this.noteDrafts.get(task.file.path);save.hidden=!current;discard.hidden=!current;save.disabled=!!current?.saving;discard.disabled=!!current?.saving;status.setText(current?.saving?'Wird gespeichert …':current?'Ungespeichert':'');};
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
    button(actions,'Zeit & Planung',()=>new TaskEditor(this.plugin,task).open(),'tf-text-button');
    button(actions,'Aus Tagesplan nehmen',()=>this.planTask(task,''),'tf-text-button');return card;
  }
  renderPlanner(c,tasks){
    const day=validDay(this.plannerDate)?this.plannerDate:today();this.plannerDate=day;
    const displayed=this.plannerMode==='calendar'?calendarTasks(tasks):tasks;
    const plan=dayPlan(displayed,day),poolTasks=dayPlan(tasks,day).pool.filter(t=>!plan.planned.some(p=>p.file.path===t.file.path)),planner=c.createDiv({cls:'tf-planner'});
    const controls=planner.createDiv({cls:'tf-planner-controls'});
    const previous=button(controls,'‹',()=>{this.plannerDate=shiftDay(day,this.plannerMode==='calendar'&&this.calendarSpan==='week'?-7:-1);this.render();},'tf-planner-step');previous.setAttribute('aria-label',this.plannerMode==='calendar'&&this.calendarSpan==='week'?'Vorherige Woche':'Vorheriger Tag');
    const date=controls.createEl('input',{type:'date'});date.value=day;date.setAttribute('aria-label','Planungstag');date.dataset.tfFocus='planner-date';date.onchange=()=>{if(validDay(date.value)){this.plannerDate=date.value;this.render();}};
    const next=button(controls,'›',()=>{this.plannerDate=shiftDay(day,this.plannerMode==='calendar'&&this.calendarSpan==='week'?7:1);this.render();},'tf-planner-step');next.setAttribute('aria-label',this.plannerMode==='calendar'&&this.calendarSpan==='week'?'Nächste Woche':'Nächster Tag');
    button(controls,'Heute',()=>{this.plannerDate=today();this.render();},'tf-text-button');
    controls.createSpan({text:`${plan.planned.length} geplant · ${plan.done} erledigt · ${Math.floor(plan.minutes/60)} h ${plan.minutes%60} min geschätzt`,cls:'tf-planner-day-summary'});
    const week=planner.createDiv({cls:'tf-week-strip',attr:{'aria-label':'Wochenübersicht'}});
    for(const key of plannerWeek(day)){
      const count=displayed.filter(t=>!t.meta.archived&&dateValue(t.meta.scheduled)===key).length;
      const b=button(week,'',()=>{this.plannerDate=key;this.render();},'tf-week-day'+(key===day?' is-selected':'')+(key===today()?' is-today':''));b.setAttribute('aria-pressed',String(key===day));b.setAttribute('aria-label',key+', '+count+' geplante Aufgaben');
      b.createSpan({text:new Date(key+'T12:00:00').toLocaleDateString('de-CH',{weekday:'short'}),cls:'tf-week-label'});b.createEl('strong',{text:key.slice(8,10)});b.createSpan({text:count+' Aufgaben',cls:'tf-week-count'});
    }
    const modes=planner.createDiv({cls:'tf-planner-modes',attr:{'aria-label':'Tagesansicht'}});
    for(const [key,label]of Object.entries({agenda:'Tagesablauf',calendar:'Kalender',status:'Status',priority:'Prioritäten'})){
      const b=button(modes,label,()=>{this.plannerMode=key;this.render();},'tf-planner-mode'+(this.plannerMode===key?' is-active':''));b.setAttribute('aria-pressed',String(this.plannerMode===key));
    }
    if(plan.conflicts.size)planner.createDiv({text:`${plan.conflicts.size} aktive Aufgaben überschneiden sich zeitlich. Du kannst die Zeitblöcke über „Zeit & Planung“ anpassen.`,cls:'tf-planner-warning',attr:{role:'status'}});
    const workspace=planner.createDiv({cls:'tf-planner-layout'+(this.plannerMode!=='agenda'?' tf-planner-layout-board':'')});
    const content=workspace.createDiv({cls:'tf-planner-content'});
    if(this.plannerMode==='calendar'){this.renderCalendar(content,tasks);}
    else if(this.plannerMode!=='agenda'){
      this.renderBoard(content,plan.planned,this.plannerMode==='priority'?'priority':'status');
    }else{
      content.createEl('h2',{text:new Date(day+'T12:00:00').toLocaleDateString('de-CH',{weekday:'long',day:'numeric',month:'long'}),cls:'tf-planner-heading'});
      if(!plan.planned.length)content.createDiv({text:'Dein Tag ist noch frei. Plane eine vorhandene Aufgabe ein oder lege eine Tagesaufgabe an.',cls:'tf-planner-empty'});
      for(const task of plan.timed){
        const row=content.createDiv({cls:'tf-agenda-row'+(plan.conflicts.has(task.file.path)?' tf-time-conflict':'')});
        const time=row.createDiv({cls:'tf-agenda-time'});time.createEl('strong',{text:task.meta.scheduledTime});time.createSpan({text:clockTime(timeMinutes(task.meta.scheduledTime)+durationMinutes(task.meta))});
        const card=this.plannerCard(row,task);if(plan.conflicts.has(task.file.path))card.createDiv({text:'Zeitüberschneidung',cls:'tf-conflict-label'});
      }
      if(plan.flexible.length){content.createEl('h3',{text:'Flexibel · ohne Uhrzeit',cls:'tf-planner-subheading'});const flexible=content.createDiv({cls:'tf-flexible-grid'});for(const task of plan.flexible)this.plannerCard(flexible,task);}
    }
    const pool=workspace.createEl('aside',{cls:'tf-planner-pool'});pool.createEl('h2',{text:'Aufgaben einplanen',cls:'tf-planner-heading'});pool.createEl('p',{text:'Vorhandene Aufgaben auf den gewählten Tag legen. Fälligkeiten bleiben erhalten.',cls:'tf-muted'});
    if(!poolTasks.length)pool.createDiv({text:'Keine weiteren aktiven Aufgaben in dieser Auswahl.',cls:'tf-planner-empty'});
    for(const task of poolTasks){
      const item=pool.createDiv({cls:'tf-pool-task tf-priority-'+(Object.hasOwn(PRIORITIES,task.meta.priority)?task.meta.priority:'normal')});
      if(this.plannerMode==='calendar'){item.draggable=false;item.onpointerdown=e=>this.calendarPointerStart(e,item,task);}
      button(item,task.meta.title,()=>new TaskEditor(this.plugin,task).open(),'tf-title');
      const old=dateValue(task.meta.scheduled);item.createDiv({text:old?'Bisher geplant: '+old:'Noch nicht eingeplant',cls:'tf-pool-meta'});
      const due=duePresentation(task);item.createSpan({text:due.label,cls:'tf-due tf-due-'+due.kind});
      const add=button(item,old?'Auf diesen Tag verschieben':'Einplanen',async()=>{add.disabled=true;await this.planTask(task,day);if(add.isConnected)add.disabled=false;},'tf-text-button');
      add.setAttribute('aria-label',task.meta.title+' am '+day+' einplanen');
    }
    planner.createEl('p',{text:'Planungsdatum und Uhrzeit sind dein Arbeitsplan, die Fälligkeit ist die Deadline. Überschneidungen werden markiert; es werden keine Aufgaben automatisch archiviert.',cls:'tf-planner-note'});
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
    try{await this.plugin.change(task,meta=>calendarMove(meta,day,start));this.calendarMessage=task.meta.title+' → '+day+(start===null?' · flexibel':' · '+clockTime(start));const live=this.contentEl.querySelector('.tf-calendar-live');if(live)live.setText(this.calendarMessage);}
    catch(e){report(e);}
  }
  calendarEvent(parent,task,compact=false){
    const event=parent.createDiv({cls:'tf-calendar-event tf-priority-'+(Object.hasOwn(PRIORITIES,task.meta.priority)?task.meta.priority:'normal')+' tf-status-'+task.meta.status+(task.meta.status==='done'?' is-done':'')+(compact?' tf-calendar-flex-event':'')});
    event.dataset.path=task.file.path;event.draggable=false;event.onpointerdown=e=>this.calendarPointerStart(e,event,task);
    const done=button(event,task.meta.status==='done'?'✓':'○',e=>{e.stopPropagation();this.setStatus(task,task.meta.status==='done'?'open':'done');},'tf-calendar-check');done.setAttribute('aria-label',task.meta.title+(task.meta.status==='done'?' wieder öffnen':' erledigen'));
    const edit=button(event,'',()=>{if(Date.now()<(this.calendarIgnoreClickUntil||0))return;new TaskEditor(this.plugin,task.originalTask||task).open();},'tf-calendar-edit');
    const start=timeMinutes(task.meta.scheduledTime);const time=start===null?'Flexibel':task.meta.scheduledTime+'–'+clockTime(start+durationMinutes(task.meta));
    edit.setAttribute('aria-label',task.meta.title+' bearbeiten · '+dateValue(task.meta.scheduled)+' · '+time);edit.setAttribute('title',task.meta.title+' · '+time+' · '+STATES[task.meta.status]);
    if(!compact)edit.createSpan({text:time,cls:'tf-calendar-event-time'});
    edit.createSpan({text:task.meta.title,cls:'tf-calendar-event-title'});if(recurrenceLabel(task.meta))edit.createSpan({text:'↻',cls:'tf-calendar-event-time',attr:{title:recurrenceLabel(task.meta)}});
    if(task.calendarAutomatic)edit.createSpan({text:'Fällig',cls:'tf-calendar-event-time',attr:{title:'Automatisch am Fälligkeitstag angezeigt · noch keine feste Tagesplanung'}});return event;
  }
  renderCalendar(c,tasks){
    tasks=calendarTasks(tasks);
    const days=this.calendarSpan==='day'?[this.plannerDate]:plannerWeek(this.plannerDate),bounds=calendarBounds(tasks,days),scale=CALENDAR_PIXELS_PER_MINUTE;
    const calendar=c.createDiv({cls:'tf-calendar'});
    const toolbar=calendar.createDiv({cls:'tf-calendar-toolbar'});toolbar.createEl('h2',{text:this.calendarSpan==='day'?'Tageskalender':'Wochenkalender',cls:'tf-planner-heading'});
    const chooser=toolbar.createDiv({cls:'tf-calendar-span',attr:{'aria-label':'Kalenderzeitraum'}});
    for(const [key,label]of Object.entries({week:'Woche',day:'Tag'})){const b=button(chooser,label,()=>{this.calendarSpan=key;this.render();},'tf-calendar-span-button'+(this.calendarSpan===key?' is-active':''));b.setAttribute('aria-pressed',String(this.calendarSpan===key));}
    calendar.createEl('p',{text:'Freie Zeit anklicken: Aufgabe anlegen. Blöcke ziehen: Zeit oder Tag ändern. Titel anklicken: bearbeiten. Kreis anklicken: erledigen.',cls:'tf-calendar-help'});
    const scroll=calendar.createDiv({cls:'tf-calendar-scroll',attr:{'aria-label':'Kalender mit Aufgabenblöcken'}});
    const sheet=scroll.createDiv({cls:'tf-calendar-sheet'+(days.length===1?' tf-calendar-single':'')});sheet.style.setProperty('--tf-calendar-days',String(days.length));
    const header=sheet.createDiv({cls:'tf-calendar-header'});header.createSpan({text:'Zeit',cls:'tf-calendar-corner'});
    for(const day of days){const b=button(header,'',()=>{this.plannerDate=day;this.calendarSpan='day';this.render();},'tf-calendar-day-heading'+(day===today()?' is-today':'')+(day===this.plannerDate?' is-selected':''));b.createSpan({text:new Date(day+'T12:00:00').toLocaleDateString('de-CH',{weekday:'short'})});b.createEl('strong',{text:day.slice(8,10)+'.'+day.slice(5,7)+'.'});b.setAttribute('aria-label','Tageskalender für '+day+' öffnen');}
    const flexible=sheet.createDiv({cls:'tf-calendar-flex-row'});flexible.createSpan({text:'Flexibel',cls:'tf-calendar-corner'});
    for(const day of days){
      const cell=flexible.createDiv({cls:'tf-calendar-flex-cell'});cell.dataset.day=day;
      const list=tasks.filter(t=>!t.meta.archived&&dateValue(t.meta.scheduled)===day&&timeMinutes(t.meta.scheduledTime)===null);for(const task of list)this.calendarEvent(cell,task,true);
      const add=button(cell,'+',()=>new TaskEditor(this.plugin,null,'open',day).open(),'tf-calendar-flex-add');add.setAttribute('aria-label','Flexible Aufgabe am '+day+' anlegen');
    }
    const body=sheet.createDiv({cls:'tf-calendar-body'}),axis=body.createDiv({cls:'tf-calendar-axis'});axis.style.height=((bounds.end-bounds.start)*scale)+'px';
    for(let minute=bounds.start;minute<=bounds.end;minute+=60){axis.createSpan({text:clockTime(minute),cls:'tf-calendar-hour'}).style.top=((minute-bounds.start)*scale)+'px';}
    for(const day of days){
      const column=body.createDiv({cls:'tf-calendar-day-column'+(day===today()?' is-today':'')});column.dataset.day=day;column.dataset.startMinute=String(bounds.start);column.style.height=((bounds.end-bounds.start)*scale)+'px';
      for(let minute=bounds.start;minute<bounds.end;minute+=30){const slot=button(column,'',()=>new TaskEditor(this.plugin,null,'open',day,'normal',clockTime(minute)).open(),'tf-calendar-slot');slot.style.top=((minute-bounds.start)*scale)+'px';slot.style.height=(30*scale)+'px';slot.setAttribute('aria-label','Aufgabe am '+day+' um '+clockTime(minute)+' anlegen');slot.setAttribute('title',clockTime(minute)+' · Aufgabe anlegen');}
      for(const item of calendarEvents(tasks,day)){const event=this.calendarEvent(column,item.task);event.style.top=((item.start-bounds.start)*scale)+'px';event.style.height=(item.displayDuration*scale-3)+'px';event.style.left=`calc(${item.lane/item.columns*100}% + 3px)`;event.style.width=`calc(${100/item.columns}% - 6px)`;}
      const preview=column.createDiv({cls:'tf-calendar-drop-preview'});preview.hidden=true;preview.setAttribute('aria-hidden','true');
    }
    calendar.createDiv({text:this.calendarMessage||'',cls:'tf-calendar-live',attr:{role:'status','aria-live':'polite'}});
    calendar.createEl('p',{text:'Zeitblöcke basieren auf Planungsdatum, Startzeit und Dauer. Kleine Aufgaben werden für die Bedienbarkeit mindestens als halbstündiger Block dargestellt; die Beschriftung zeigt ihre tatsächliche Dauer. Offene Aufgaben und Aufgaben in Arbeit mit Fälligkeitsdatum erscheinen automatisch am Termin unter „Flexibel“ mit dem Hinweis „Fällig“. Ein manuelles Planungsdatum hat Vorrang. Ohne Datum erfolgt kein automatischer Eintrag. Beim Erledigen im Kalender bleibt der Eintrag am angezeigten Tag erhalten. Fälligkeiten werden beim Verschieben nicht geändert.',cls:'tf-calendar-footnote'});
  }
  renderStats(c,tasks){
    const period=[7,14,30,90].includes(this.statsDays)?this.statsDays:14;
    const data=analytics(tasks,period),s=data.summary,panel=c.createDiv({cls:'tf-statistics'});
    const top=panel.createDiv({cls:'tf-analytics-toolbar'});
    top.createEl('p',{text:'Aktueller Aufgabenstand und deine Abschlüsse im Zeitverlauf. Suche und Tags gelten für alle Diagramme.',cls:'tf-muted'});
    const field=top.createEl('label',{cls:'tf-period-label'});field.createSpan({text:'Abschlusszeitraum'});
    const select=field.createEl('select');select.setAttribute('aria-label','Abschlusszeitraum');select.dataset.tfFocus='period';
    for(const n of [7,14,30,90])select.createEl('option',{value:String(n),text:n+' Tage'});select.value=String(period);
    select.onchange=()=>{this.statsDays=Number(select.value);panel.remove();this.renderStats(c,tasks);};
    const metrics=panel.createDiv({cls:'tf-metrics'});
    for(const [value,label,detail]of [
      [data.active,'Aktive Aufgaben','Offen, in Arbeit und verzögert'],
      [data.completed,'Erledigt im Zeitraum','Letzte '+period+' Kalendertage inkl. heute'],
      [data.due.late,'Überfällig','Aktive Aufgaben mit vergangenem Termin'],
      [data.rate+' %','Abschlussquote',s.done+' von '+s.total+' Aufgaben insgesamt']
    ]){const metric=metrics.createDiv({cls:'tf-metric'});metric.createSpan({text:label,cls:'tf-metric-label'});metric.createEl('strong',{text:String(value),cls:'tf-metric-value'});metric.createSpan({text:detail,cls:'tf-metric-note'});}
    const grid=panel.createDiv({cls:'tf-analytics-grid'});
    const activity=grid.createEl('section',{cls:'tf-chart-section tf-chart-wide'});
    activity.createEl('h2',{text:'Erledigte Aufgaben'});
    activity.createEl('p',{text:period>30?'Abschlüsse je Sieben-Tage-Abschnitt':'Abschlüsse pro Tag',cls:'tf-chart-caption'});
    const chart=activity.createDiv({cls:'tf-activity-chart',attr:{role:'img','aria-label':`${data.completed} Aufgaben in den letzten ${period} Tagen erledigt. ${data.bins.map(b=>b.start+(b.end!==b.start?' bis '+b.end:'')+': '+b.count).join('; ')}`}});
    const max=Math.max(1,...data.bins.map(d=>d.count));
    const y=chart.createDiv({cls:'tf-activity-y',attr:{'aria-hidden':'true'}});y.createSpan({text:String(max)});y.createSpan({text:'0'});
    const plot=chart.createDiv({cls:'tf-activity-plot',attr:{'aria-hidden':'true'}});plot.style.setProperty('--tf-bin-count',String(data.bins.length));
    data.bins.forEach((bin,index)=>{
      const column=plot.createDiv({cls:'tf-activity-column'});column.setAttribute('title',bin.start+(bin.end!==bin.start?' – '+bin.end:'')+': '+bin.count+' erledigt');
      const track=column.createDiv({cls:'tf-activity-track'});const bar=track.createDiv({cls:'tf-activity-bar'});bar.style.height=(bin.count/max*100)+'%';
      const show=index===0||index===data.bins.length-1||index===Math.floor(data.bins.length/2);
      const label=column.createSpan({text:show?bin.start.slice(8,10)+'.'+bin.start.slice(5,7)+'.':'',cls:'tf-activity-x'});if(!show)label.setAttribute('aria-hidden','true');
    });
    if(!data.completed)activity.createEl('p',{text:'Noch keine Abschlüsse in diesem Zeitraum.',cls:'tf-chart-empty'});
    const activityDetails=activity.createEl('details',{cls:'tf-chart-details'});activityDetails.createEl('summary',{text:'Werte als Tabelle'});
    const activityTable=activityDetails.createEl('table',{cls:'tf-data-table'}),thead=activityTable.createEl('thead').createEl('tr');thead.createEl('th',{text:period>30?'Zeitraum':'Datum',attr:{scope:'col'}});thead.createEl('th',{text:'Erledigt',attr:{scope:'col'}});
    const tbody=activityTable.createEl('tbody');for(const bin of data.bins){const row=tbody.createEl('tr');row.createEl('th',{text:bin.start+(bin.end!==bin.start?' – '+bin.end:''),attr:{scope:'row'}});row.createEl('td',{text:String(bin.count)});}
    const status=grid.createEl('section',{cls:'tf-chart-section'});status.createEl('h2',{text:'Aufgabenstatus'});status.createEl('p',{text:'Aktueller Stand · '+s.total+' Aufgaben',cls:'tf-chart-caption'});
    const ring=status.createDiv({cls:'tf-donut-wrap'});
    const svg=svgElement(ring,'svg',{viewBox:'0 0 180 180',role:'img','aria-label':Object.entries(STATES).map(([key,label])=>label+': '+s[key]).join(', '),class:'tf-donut'});
    svgElement(svg,'circle',{cx:90,cy:90,r:64,fill:'none',class:'tf-donut-track','stroke-width':16});
    let offset=0;for(const [key]of Object.entries(STATES)){const percent=s.total?s[key]/s.total*100:0;if(percent){svgElement(svg,'circle',{cx:90,cy:90,r:64,fill:'none',pathLength:100,'stroke-width':16,'stroke-dasharray':`${percent} ${100-percent}`,'stroke-dashoffset':-offset,transform:'rotate(-90 90 90)',class:'tf-donut-segment tf-status-'+key});offset+=percent;}}
    const center=ring.createDiv({cls:'tf-donut-center',attr:{'aria-hidden':'true'}});center.createEl('strong',{text:String(s.total)});center.createSpan({text:'Aufgaben'});
    const statusLegend=status.createDiv({cls:'tf-status-legend'});
    for(const [key,label]of Object.entries(STATES)){const row=statusLegend.createDiv({cls:'tf-status-legend-row tf-status-'+key});row.createSpan({cls:'tf-status-dot',attr:{'aria-hidden':'true'}});row.createSpan({text:label});row.createEl('strong',{text:String(s[key])});row.createSpan({text:(s.total?Math.round(s[key]/s.total*100):0)+' %',cls:'tf-muted'});}
    if(!s.total)status.createEl('p',{text:'Noch keine Aufgaben für diese Auswahl.',cls:'tf-chart-empty'});
    const deadlines=grid.createEl('section',{cls:'tf-chart-section'});deadlines.createEl('h2',{text:'Fälligkeiten'});deadlines.createEl('p',{text:'Nur aktive Aufgaben · nächste 7 Tage ab morgen',cls:'tf-chart-caption'});
    const horizontal=(parent,entries,maxValue)=>{for(const entry of entries){const row=parent.createDiv({cls:'tf-hbar-row '+entry.cls});row.createSpan({text:entry.label,cls:'tf-hbar-label'});const track=row.createDiv({cls:'tf-hbar-track',attr:{role:'img','aria-label':entry.label+': '+entry.value}});track.createDiv({cls:'tf-hbar-fill'}).style.width=(maxValue?entry.value/maxValue*100:0)+'%';row.createEl('strong',{text:String(entry.value)});}};
    horizontal(deadlines,[{label:'Überfällig',value:data.due.late,cls:'tf-bar-late'},{label:'Heute',value:data.due.today,cls:'tf-bar-today'},{label:'Nächste 7 Tage',value:data.due.week,cls:'tf-bar-future'},{label:'Später',value:data.due.later,cls:'tf-bar-future'},{label:'Ohne Termin',value:data.due.none,cls:'tf-bar-neutral'}],data.active);
    const priorities=grid.createEl('section',{cls:'tf-chart-section'});priorities.createEl('h2',{text:'Prioritäten'});priorities.createEl('p',{text:'Verteilung deiner '+data.active+' aktiven Aufgaben',cls:'tf-chart-caption'});
    horizontal(priorities,Object.entries(PRIORITIES).map(([key,label])=>({label,value:data.priority[key],cls:'tf-bar-priority tf-priority-'+key})),data.active);
    const tags=panel.createEl('section',{cls:'tf-chart-section tf-tag-chart'});tags.createEl('h2',{text:'Aufgaben nach Tags'});tags.createEl('p',{text:'Balkenlänge: Anzahl Aufgaben · Erledigt und aktiv je Schlagwort. Aufgaben mit mehreren Tags zählen in jeder zugehörigen Zeile.',cls:'tf-chart-caption'});
    if(!data.tags.length)tags.createEl('p',{text:'Noch keine Tags in dieser Auswahl.',cls:'tf-chart-empty'});
    const tagMax=Math.max(1,...data.tags.map(t=>t.total));
    for(const tag of data.tags){const row=tags.createDiv({cls:'tf-tag-row'});row.createSpan({text:'#'+tag.tag});const stack=row.createDiv({cls:'tf-tag-stack',attr:{role:'img','aria-label':`${tag.tag}: ${tag.done} erledigt, ${tag.total-tag.done} aktiv`}});if(tag.done)stack.createDiv({cls:'tf-tag-done'}).style.width=(tag.done/tagMax*100)+'%';if(tag.total-tag.done)stack.createDiv({cls:'tf-tag-active'}).style.width=((tag.total-tag.done)/tagMax*100)+'%';row.createSpan({text:tag.done+' / '+tag.total+' erledigt'});}
    if(data.tags.length){const legend=tags.createDiv({cls:'tf-tag-key'});legend.createSpan({text:'Erledigt',cls:'tf-tag-key-done'});legend.createSpan({text:'Aktiv',cls:'tf-tag-key-active'});}
    const note=panel.createEl('p',{cls:'tf-analytics-note'});note.setText('Die Diagramme zeigen den aktuellen Aufgabenstand und das letzte Abschlussdatum. Wieder geöffnete Aufgaben zählen nicht als erledigt. Archivierte Aufgaben kannst du über Archiv → Statistik auswerten.'+(data.missingCompletion?` ${data.missingCompletion} erledigte Aufgabe(n) ohne gültiges Abschlussdatum sind im Status enthalten, aber nicht im Zeitverlauf.`:''));
  }
}
class TaskFlow extends Plugin {
  async onload(){
    this.settings=Object.assign({folder:'TaskFlow/Aufgaben'},await this.loadData());this.tasks=[];this.scanVersion=0;
    this.registerView(VIEW,leaf=>new TaskView(leaf,this));this.addRibbonIcon('kanban-square','TaskFlow öffnen',()=>this.open());
    this.addCommand({id:'open',name:'Dashboard öffnen',callback:()=>this.open()});this.addCommand({id:'planner',name:'Tagesplaner öffnen',callback:async()=>{await this.open();const leaf=this.app.workspace.getLeavesOfType(VIEW)[0];if(leaf){leaf.view.mode='planner';leaf.view.showArchive=false;leaf.view.render();}}});this.addCommand({id:'new',name:'Neue Aufgabe',callback:()=>new TaskEditor(this).open()});
    this.addSettingTab(new class extends PluginSettingTab{display(){this.containerEl.empty();this.containerEl.createEl('h2',{text:'TaskFlow'});this.containerEl.createEl('p',{text:'Aufgaben liegen als Markdown im Ordner '+this.plugin.settings.folder+'. Bestehende Aufgaben anderer Plugins werden nicht automatisch importiert.'});}}(this.app,this));
    const refresh=()=>{clearTimeout(this.timer);this.timer=setTimeout(()=>this.scan().catch(report),180);};
    for(const event of ['create','modify','delete','rename'])this.registerEvent(this.app.vault.on(event,refresh));
    this.register(()=>clearTimeout(this.timer));this.registerInterval(window.setInterval(()=>this.scan().catch(report),60000));this.app.workspace.onLayoutReady(()=>this.scan().catch(report));
  }
  async open(){let leaf=this.app.workspace.getLeavesOfType(VIEW)[0];if(!leaf){leaf=this.app.workspace.getLeaf('tab');await leaf.setViewState({type:VIEW,active:true});}this.app.workspace.revealLeaf(leaf);}
  async scan(){
    const version=++this.scanVersion;const tasks=[];let invalid=0;
    for(const file of this.app.vault.getMarkdownFiles().filter(f=>f.path.startsWith(this.settings.folder+'/'))){try{const raw=await this.app.vault.read(file);const {meta,body}=decode(raw);if(!(meta.status in STATES)||typeof meta.title!=='string'||(meta.tags!==undefined&&(!Array.isArray(meta.tags)||meta.tags.some(t=>typeof t!=='string'))))throw new Error('Ungültige Aufgabenfelder');tasks.push({file,raw,meta,body});}catch(e){invalid++;console.warn('TaskFlow überspringt',file.path,e);}}
    if(version!==this.scanVersion)return;
    if(await this.ensureRecurrences(tasks))return this.scan();
    if(version!==this.scanVersion)return;const signature=JSON.stringify([today(),tasks.map(t=>[t.file.path,t.raw]).sort((a,b)=>a[0].localeCompare(b[0]))]);const changed=signature!==this.scanSignature;this.scanSignature=signature;this.tasks=tasks;if(changed)for(const leaf of this.app.workspace.getLeavesOfType(VIEW))leaf.view.render();if(invalid!==this.invalidCount&&invalid)new Notice(`${invalid} Datei(en) im TaskFlow-Ordner konnten nicht gelesen werden. Details in der Entwicklerkonsole.`);this.invalidCount=invalid;
  }
  async ensureRecurrences(tasks,reference=today()){
    if(this.recurrenceRun)return this.recurrenceRun;
    this.recurrenceRun=(async()=>{
      let created=0;const known=new Set(tasks.filter(t=>t.meta.recurrenceSeries&&t.meta.recurrenceDate).map(t=>t.meta.recurrenceSeries+'|'+dateValue(t.meta.recurrenceDate)));
      for(const source of tasks){
        if(!source.meta.recurrence||source.meta.recurrence.enabled===false||source.meta.recurrenceSeries)continue;
        try{
          if(typeof source.meta.id!=='string'||!/^[a-zA-Z0-9_-]+$/.test(source.meta.id))throw new Error('Serienaufgabe benötigt eine gültige ID. Bitte im Editor speichern.');
          for(const day of recurrenceDates(source.meta.recurrence,reference)){
            const key=source.meta.id+'|'+day;if(known.has(key))continue;
            const path=normalizePath(this.settings.folder+'/'+source.meta.id+'--'+day+'.md');
            if(this.app.vault.getAbstractFileByPath(path))continue;
            const occurrence=recurrenceOccurrence(source,day);
            try{await this.app.vault.create(path,encode(occurrence.meta,occurrence.body));created++;known.add(key);}
            catch(e){if(!this.app.vault.getAbstractFileByPath(path))throw e;}
          }
        }catch(e){console.error('TaskFlow Serie',source.file.path,e);const message=source.file.path+': '+e.message;if(this.recurrenceError!==message){new Notice('TaskFlow Wiederholung: '+message);this.recurrenceError=message;}}
      }
      return created;
    })();
    try{return await this.recurrenceRun;}finally{this.recurrenceRun=null;}
  }
  stamp(meta,previous){meta.updated=new Date().toISOString();if(meta.status==='done'&&previous!=='done')meta.completed=meta.updated;if(meta.status!=='done')delete meta.completed;}
  async change(task,mutate,bodyFn=body=>body,expected){
    await this.app.vault.process(task.file,raw=>{if(expected!==undefined&&raw!==expected)throw new Error('Aufgabe wurde zwischenzeitlich geändert. Bitte erneut öffnen.');const {meta,body}=decode(raw);const previous=meta.status;mutate(meta);this.stamp(meta,previous);return encode(meta,bodyFn(body));});await this.scan();
  }
  async updateNotes(task,expectedNotes,newNotes){
    await this.app.vault.process(task.file,raw=>{const {meta,body}=decode(raw);const updated=patchNoteBody(body,expectedNotes,newNotes);this.stamp(meta,meta.status);return encode(meta,updated);});
    await this.scan();
  }
  async saveTask(task,meta,body){
    validatePlanning(meta);validateRecurrence(meta.recurrence);if(meta.recurrence&&!meta.id)meta.id=crypto.randomUUID();
    if(task){await this.app.vault.process(task.file,raw=>{if(raw!==task.raw)throw new Error('Aufgabe wurde zwischenzeitlich geändert. Bitte erneut öffnen; deine Eingabe bleibt hier erhalten.');this.stamp(meta,decode(raw).meta.status);return encode(meta,body);});}
    else{const folder=normalizePath(this.settings.folder);let current='';for(const part of folder.split('/')){current=current?current+'/'+part:part;if(!this.app.vault.getAbstractFileByPath(current))await this.app.vault.createFolder(current);}meta.id=crypto.randomUUID();this.stamp(meta,null);await this.app.vault.create(`${folder}/${meta.id}.md`,encode(meta,body));}
    await this.scan();
  }
}
module.exports=TaskFlow;
module.exports.testing={today,dateValue,decode,encode,overdue,summarize,subtasks,toggleSubtask,STATES,PRIORITIES,duePresentation,completionDay,moveFrames,TaskView,analytics,calendarDays,editorSubtasks,editorBody,validDay,shiftDay,plannerWeek,timeMinutes,durationMinutes,clockTime,validatePlanning,assignDay,dayPlan,noteField,patchNoteBody,calendarMove,calendarEvents,calendarBounds,calendarDropMinute,calendarTasks,validateRecurrence,recurrenceDates,recurrenceOccurrence,recurrenceLabel};
