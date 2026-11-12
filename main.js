/* TaskFlow — editable source and release entry point. No build step required. */
const {Plugin, ItemView, Modal, Setting, Notice, PluginSettingTab, parseYaml, stringifyYaml, normalizePath} = require('obsidian');
const VIEW = 'taskflow-board';
const STATES = {open:'Offen', progress:'In Arbeit', delayed:'Verzögert', done:'Erledigt'};
const PRIORITIES={high:'Hoch',normal:'Normal',low:'Niedrig'};
const localDay=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const today=()=>localDay(new Date());
function completionDay(value){const d=new Date(value);return Number.isNaN(d.getTime())?'':localDay(d);}
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
function button(parent, text, action, cls='') { const b=parent.createEl('button',{text,cls}); b.addEventListener('click',action); return b; }
function report(e) { console.error('TaskFlow',e); new Notice(`TaskFlow: ${e.message || e}`); }
class TaskEditor extends Modal {
  constructor(plugin, task, status='open') { super(plugin.app); this.plugin=plugin; this.task=task; this.initialStatus=status; }
  onOpen() {
    const {contentEl:c}=this; c.addClass('tf-editor-modal'); c.createEl('h2',{text:this.task?'Aufgabe bearbeiten':'Neue Aufgabe'});
    const data=this.task?structuredClone(this.task.meta):{taskflow:1,title:'',status:this.initialStatus,priority:'normal',tags:[],due:'',created:new Date().toISOString()};
    let body=this.task?.body || '## Notizen\n\n\n## Teilaufgaben\n\n';
    new Setting(c).setName('Titel').addText(x=>x.setValue(data.title||'').onChange(v=>data.title=v));
    new Setting(c).setName('Status').addDropdown(x=>x.addOptions(STATES).setValue(data.status).onChange(v=>data.status=v));
    new Setting(c).setName('Priorität').addDropdown(x=>x.addOptions({low:'Niedrig',normal:'Normal',high:'Hoch'}).setValue(data.priority||'normal').onChange(v=>data.priority=v));
    new Setting(c).setName('Fällig am').addText(x=>{x.inputEl.type='date';x.setValue(dateValue(data.due)).onChange(v=>data.due=v);});
    new Setting(c).setName('Tags').setDesc('Mit Komma trennen, z. B. arbeit, projekt/web').addText(x=>x.setValue((data.tags||[]).join(', ')).onChange(v=>data.tags=[...new Set(v.split(',').map(t=>t.trim().replace(/^#/, '')).filter(Boolean))]));
    c.createEl('label',{text:'Notizen, [[Verknüpfungen]] und Teilaufgaben als Markdown'});
    const area=c.createEl('textarea',{cls:'tf-editor'}); area.value=body; area.setAttribute('aria-label','Notizen und Teilaufgaben');
    const row=c.createDiv({cls:'tf-actions'});
    button(row,'Teilaufgabe hinzufügen',()=>{area.value=area.value.replace(/\s*$/,'')+'\n- [ ] Neue Teilaufgabe\n';area.focus();});
    button(row,'Abbrechen',()=>this.close());
    const save=button(row,'Speichern',async()=>{
      if(!data.title.trim()) return new Notice('Bitte einen Titel eingeben.');
      save.disabled=true;
      try { data.title=data.title.trim(); await this.plugin.saveTask(this.task,data,area.value); this.close(); } catch(e){report(e);save.disabled=false;}
    },'mod-cta');
  }
  onClose(){this.contentEl.empty();}
}
class TaskView extends ItemView {
  constructor(leaf,plugin){super(leaf);this.plugin=plugin;this.query='';this.tag='';this.mode='board';this.showArchive=false;this.animations=new Set();this.closed=false;}
  getViewType(){return VIEW;} getDisplayText(){return 'TaskFlow';} getIcon(){return 'kanban-square';}
  async onOpen(){this.closed=false;this.render();}
  async onClose(){this.closed=true;for(const a of this.animations)a.cancel();this.animations.clear();}
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
    const top=shell.createDiv({cls:'tf-topbar'});top.createSpan({text:'TaskFlow',cls:'tf-brand'});top.createSpan({text:'/ Mein Arbeitsbereich',cls:'tf-top-path'});top.createSpan({text:'Paper Studio',cls:'tf-top-edition'});
    const workspace=shell.createDiv({cls:'tf-workspace'});
    const side=workspace.createEl('nav',{cls:'tf-sidebar',attr:{'aria-label':'TaskFlow Navigation'}});
    side.createDiv({text:'Arbeitsbereich',cls:'tf-side-label'});
    const navigate=(mode,archive)=>{this.mode=mode;this.showArchive=archive;this.render();};
    button(side,'Board',()=>navigate('board',false),'tf-side-item'+(!this.showArchive&&this.mode==='board'?' is-active':''));
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
    title.createEl('h1',{text:this.showArchive?'Dein Aufgabenarchiv.':this.mode==='stats'?'Fortschritt im Blick.':'Raum für das Wesentliche.'});
    title.createEl('p',{text:new Date().toLocaleDateString('de-CH',{weekday:'long',day:'numeric',month:'long'})+' · Mein Arbeitsbereich',cls:'tf-muted tf-subtitle'});
    button(header,'+ Neue Aufgabe',()=>new TaskEditor(this.plugin).open(),'tf-primary');
    const summary=main.createDiv({cls:'tf-summary'});
    for(const [key,label]of Object.entries({total:'gesamt',open:'offen',progress:'in Arbeit',delayed:'verzögert',done:'erledigt'})){
      const item=summary.createSpan();item.createEl('strong',{text:String(s[key])});item.appendText(' '+label);
    }
    const focusBar=main.createDiv({cls:'tf-focusbar'});
    const dueToday=all.filter(t=>t.meta.status!=='done'&&dateValue(t.meta.due)===today());
    focusBar.createEl('strong',{text:this.showArchive?'Archiv': 'Heute im Fokus'});
    focusBar.createSpan({text:this.showArchive?`${all.length} archivierte Aufgaben`:dueToday.length?dueToday.map(t=>t.meta.title).slice(0,2).join(' · '):'Keine Aufgaben heute fällig',cls:'tf-focus-text'});
    focusBar.createSpan({text:s.overdue?`${s.overdue} überfällig`:'Keine überfälligen Aufgaben',cls:s.overdue?'tf-due tf-due-late':'tf-muted'});
    const toolbar=main.createDiv({cls:'tf-toolbar'});
    toolbar.createSpan({text:this.mode==='stats'?'STATISTIK':'KANBAN / '+(this.showArchive?'ARCHIV':'ALLE AUFGABEN'),cls:'tf-eyebrow'});
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
    if(focus){const target=c.querySelector(`[data-tf-focus="${focus.key}"]`);if(target){target.focus({preventScroll:true});if(target.type==='search'&&focus.start!==null)target.setSelectionRange(focus.start,focus.end);}}
    this.animateMoves(previous);
  }
  renderResults(c,all){
    c.empty();const q=this.query.toLocaleLowerCase();
    const tasks=all.filter(t=>(!this.tag||(t.meta.tags||[]).includes(this.tag))&&`${t.meta.title} ${t.body} ${(t.meta.tags||[]).join(' ')}`.toLocaleLowerCase().includes(q));
    if(this.mode==='stats'){this.renderStats(c,tasks);return;}
    const board=c.createDiv({cls:'tf-board'});
    for(const [status,label]of Object.entries(STATES)){
      const col=board.createDiv({cls:'tf-column tf-status-'+status});col.dataset.status=status;
      const list=tasks.filter(t=>t.meta.status===status).sort((a,b)=>(dateValue(a.meta.due)||'9999').localeCompare(dateValue(b.meta.due)||'9999'));
      const heading=col.createDiv({cls:'tf-column-heading'});heading.createSpan({cls:'tf-status-dot',attr:{'aria-hidden':'true'}});heading.createEl('h2',{text:label});heading.createSpan({text:String(list.length),cls:'tf-count'});
      const add=button(heading,'+',()=>new TaskEditor(this.plugin,null,status).open(),'tf-column-add');add.setAttribute('aria-label','Aufgabe in '+label+' hinzufügen');
      const stack=col.createDiv({cls:'tf-card-stack'});
      for(const task of list)this.card(stack,task);
      if(!list.length)stack.createDiv({text:'Keine Aufgaben',cls:'tf-empty'});
      const drop=col.createDiv({text:'Hier ablegen',cls:'tf-drop-hint'});drop.setAttribute('aria-hidden','true');
      col.ondragover=e=>{if(!this.dragPath)return;e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='move';for(const other of board.children)other.removeClass('tf-drag-target');col.addClass('tf-drag-target');};
      col.ondragleave=e=>{if(!col.contains(e.relatedTarget))col.removeClass('tf-drag-target');};
      col.ondrop=e=>{e.preventDefault();col.removeClass('tf-drag-target');const path=e.dataTransfer?.getData('text/taskflow');if(path!==this.dragPath)return;this.dragPath=null;const task=this.plugin.tasks.find(t=>t.file.path===path);if(task&&task.meta.status!==status)this.setStatus(task,status);};
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
    try{await this.plugin.change(task,m=>m.status=status);this.lastMove=task.meta.title+' → '+STATES[status];const live=this.contentEl.querySelector('.tf-live');if(live)live.setText(this.lastMove);}
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
    const subs=subtasks(t.body);
    if(subs.length){card.createDiv({text:`Teilaufgaben: ${subs.filter(x=>x[1]!==' ').length}/${subs.length}`,cls:'tf-subtask-summary'});subs.forEach((sub,index)=>{
      const label=card.createEl('label',{cls:'tf-subtask'});const check=label.createEl('input',{type:'checkbox'});check.checked=sub[1]!==' ';label.createSpan({text:sub[2]});
      check.onchange=async()=>{check.disabled=true;try{await this.plugin.change(t,()=>{},body=>toggleSubtask(body,index),t.raw);}catch(e){report(e);this.render();}};
    });}
    const controls=card.createDiv({cls:'tf-card-actions'});const select=controls.createEl('select');select.setAttribute('aria-label','Status für '+t.meta.title);
    for(const [value,text]of Object.entries(STATES))select.createEl('option',{value,text});select.value=t.meta.status;
    select.onchange=()=>{if(this.pendingPath){select.value=t.meta.status;return;}select.disabled=true;this.setStatus(t,select.value);};
    button(controls,'Notiz',()=>this.app.workspace.getLeaf(false).openFile(t.file),'tf-text-button');
    button(controls,t.meta.archived?'Wiederherstellen':'Archivieren',async()=>{try{await this.plugin.change(t,m=>m.archived=!m.archived);}catch(e){report(e);}},'tf-text-button');
  }
  renderStats(c,tasks){
    const s=summarize(tasks),panel=c.createDiv({cls:'tf-statistics'});
    panel.createEl('h2',{text:'Aufgabenstatistik'});panel.createEl('p',{text:`${s.done} von ${s.total} erledigt · ${s.total?Math.round(s.done/s.total*100):0} % Abschlussquote. Suche und Tagfilter gelten auch hier.`,cls:'tf-muted'});
    const progress=panel.createEl('progress');progress.max=s.total||1;progress.value=s.done;progress.setAttribute('aria-label','Abschlussquote');
    panel.createEl('h3',{text:'Statusverteilung'});
    for(const [key,label]of Object.entries(STATES)){const row=panel.createDiv({cls:'tf-chart-row tf-status-'+key});row.createSpan({text:label});const bar=row.createEl('progress');bar.max=s.total||1;bar.value=s[key];bar.setAttribute('aria-label',label);row.createSpan({text:String(s[key])});}
    panel.createEl('h3',{text:'Erledigt in den letzten 14 Tagen'});
    const days=[];for(let i=13;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const key=localDay(d);days.push({key,count:tasks.filter(t=>t.meta.status==='done'&&completionDay(t.meta.completed)===key).length});}
    const max=Math.max(1,...days.map(d=>d.count));
    for(const day of days){const row=panel.createDiv({cls:'tf-chart-row'});row.createSpan({text:day.key});const bar=row.createEl('progress');bar.max=max;bar.value=day.count;bar.setAttribute('aria-label','Abschlüsse am '+day.key);row.createSpan({text:String(day.count)});}
    panel.createEl('h3',{text:'Nach Tags'});const tags=[...new Set(tasks.flatMap(t=>t.meta.tags||[]))].sort();
    for(const tag of tags){const group=tasks.filter(t=>(t.meta.tags||[]).includes(tag));panel.createEl('p',{text:`#${tag}: ${group.filter(t=>t.meta.status==='done').length} erledigt / ${group.length} gesamt`});}
    if(!tags.length)panel.createEl('p',{text:'Noch keine Tags vergeben.'});
    panel.createEl('p',{text:'Wieder geöffnete Aufgaben zählen nicht als erledigt. Archivierte Aufgaben separat im Archiv anzeigen.',cls:'tf-muted'});
  }
}
class TaskFlow extends Plugin {
  async onload(){
    this.settings=Object.assign({folder:'TaskFlow/Aufgaben'},await this.loadData());this.tasks=[];this.scanVersion=0;
    this.registerView(VIEW,leaf=>new TaskView(leaf,this));this.addRibbonIcon('kanban-square','TaskFlow öffnen',()=>this.open());
    this.addCommand({id:'open',name:'Dashboard öffnen',callback:()=>this.open()});this.addCommand({id:'new',name:'Neue Aufgabe',callback:()=>new TaskEditor(this).open()});
    this.addSettingTab(new class extends PluginSettingTab{display(){this.containerEl.empty();this.containerEl.createEl('h2',{text:'TaskFlow'});this.containerEl.createEl('p',{text:'Aufgaben liegen als Markdown im Ordner '+this.plugin.settings.folder+'. Bestehende Aufgaben anderer Plugins werden nicht automatisch importiert.'});}}(this.app,this));
    const refresh=()=>{clearTimeout(this.timer);this.timer=setTimeout(()=>this.scan(),180);};
    for(const event of ['create','modify','delete','rename'])this.registerEvent(this.app.vault.on(event,refresh));
    this.register(()=>clearTimeout(this.timer));this.registerInterval(window.setInterval(()=>this.scan(),60000));this.app.workspace.onLayoutReady(()=>this.scan());
  }
  async open(){let leaf=this.app.workspace.getLeavesOfType(VIEW)[0];if(!leaf){leaf=this.app.workspace.getLeaf('tab');await leaf.setViewState({type:VIEW,active:true});}this.app.workspace.revealLeaf(leaf);}
  async scan(){
    const version=++this.scanVersion;const tasks=[];let invalid=0;
    for(const file of this.app.vault.getMarkdownFiles().filter(f=>f.path.startsWith(this.settings.folder+'/'))){try{const raw=await this.app.vault.read(file);const {meta,body}=decode(raw);if(!(meta.status in STATES)||typeof meta.title!=='string'||(meta.tags!==undefined&&(!Array.isArray(meta.tags)||meta.tags.some(t=>typeof t!=='string'))))throw new Error('Ungültige Aufgabenfelder');tasks.push({file,raw,meta,body});}catch(e){invalid++;console.warn('TaskFlow überspringt',file.path,e);}}
    if(version!==this.scanVersion)return;const signature=JSON.stringify([today(),tasks.map(t=>[t.file.path,t.raw]).sort((a,b)=>a[0].localeCompare(b[0]))]);const changed=signature!==this.scanSignature;this.scanSignature=signature;this.tasks=tasks;if(changed)for(const leaf of this.app.workspace.getLeavesOfType(VIEW))leaf.view.render();if(invalid!==this.invalidCount&&invalid)new Notice(`${invalid} Datei(en) im TaskFlow-Ordner konnten nicht gelesen werden. Details in der Entwicklerkonsole.`);this.invalidCount=invalid;
  }
  stamp(meta,previous){meta.updated=new Date().toISOString();if(meta.status==='done'&&previous!=='done')meta.completed=meta.updated;if(meta.status!=='done')delete meta.completed;}
  async change(task,mutate,bodyFn=body=>body,expected){
    await this.app.vault.process(task.file,raw=>{if(expected!==undefined&&raw!==expected)throw new Error('Aufgabe wurde zwischenzeitlich geändert. Bitte erneut öffnen.');const {meta,body}=decode(raw);const previous=meta.status;mutate(meta);this.stamp(meta,previous);return encode(meta,bodyFn(body));});await this.scan();
  }
  async saveTask(task,meta,body){
    if(task){await this.app.vault.process(task.file,raw=>{if(raw!==task.raw)throw new Error('Aufgabe wurde zwischenzeitlich geändert. Bitte erneut öffnen; deine Eingabe bleibt hier erhalten.');this.stamp(meta,decode(raw).meta.status);return encode(meta,body);});}
    else{const folder=normalizePath(this.settings.folder);let current='';for(const part of folder.split('/')){current=current?current+'/'+part:part;if(!this.app.vault.getAbstractFileByPath(current))await this.app.vault.createFolder(current);}meta.id=crypto.randomUUID();this.stamp(meta,null);await this.app.vault.create(`${folder}/${meta.id}.md`,encode(meta,body));}
    await this.scan();
  }
}
module.exports=TaskFlow;
module.exports.testing={today,dateValue,decode,encode,overdue,summarize,subtasks,toggleSubtask,STATES,PRIORITIES,duePresentation,completionDay,moveFrames,TaskView};
