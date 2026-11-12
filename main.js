/* TaskFlow — editable source and release entry point. No build step required. */
const {Plugin, ItemView, Modal, Setting, Notice, PluginSettingTab, TFile, parseYaml, stringifyYaml, normalizePath} = require('obsidian');
const VIEW = 'taskflow-board';
const STATES = {open:'Offen', progress:'In Arbeit', delayed:'Verzögert', done:'Erledigt'};
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
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
  constructor(plugin, task) { super(plugin.app); this.plugin=plugin; this.task=task; }
  onOpen() {
    const {contentEl:c}=this; c.createEl('h2',{text:this.task?'Aufgabe bearbeiten':'Neue Aufgabe'});
    const data=this.task?structuredClone(this.task.meta):{taskflow:1,title:'',status:'open',priority:'normal',tags:[],due:'',created:new Date().toISOString()};
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
  constructor(leaf,plugin){super(leaf);this.plugin=plugin;this.query='';this.tag='';this.mode='board';this.showArchive=false;}
  getViewType(){return VIEW;} getDisplayText(){return 'TaskFlow';} getIcon(){return 'kanban-square';}
  async onOpen(){this.render();} async onClose(){}
  render(){
    const c=this.contentEl;c.empty();c.addClass('tf-root');
    const header=c.createDiv({cls:'tf-header'});const title=header.createDiv();title.createEl('h1',{text:'TaskFlow'});title.createEl('p',{text:'Deine Aufgaben. Dein Überblick.',cls:'tf-muted'});
    button(header,'+ Neue Aufgabe',()=>new TaskEditor(this.plugin).open(),'mod-cta');
    const all=this.plugin.tasks.filter(t=>!!t.meta.archived===this.showArchive); const s=summarize(all);
    const stats=c.createDiv({cls:'tf-stats'});
    for(const [key,label] of Object.entries({total:'Gesamt',...STATES,overdue:'Überfällig'})){const tile=stats.createDiv({cls:'tf-stat'});tile.createEl('strong',{text:String(s[key])});tile.createSpan({text:label});}
    const toolbar=c.createDiv({cls:'tf-toolbar'});
    button(toolbar,'Kanban',()=>{this.mode='board';this.render();},this.mode==='board'?'mod-cta':'');
    button(toolbar,'Statistik',()=>{this.mode='stats';this.render();},this.mode==='stats'?'mod-cta':'');
    button(toolbar,this.showArchive?'Aktive Aufgaben':'Archiv',()=>{this.showArchive=!this.showArchive;this.render();});
    const search=toolbar.createEl('input',{type:'search',placeholder:'Titel, Notizen oder Tags suchen …'});search.value=this.query;search.setAttribute('aria-label','Aufgaben suchen');
    search.oninput=()=>{this.query=search.value;this.renderResults(results,all);};
    const select=toolbar.createEl('select');select.setAttribute('aria-label','Nach Tag filtern');select.createEl('option',{text:'Alle Tags',value:''});
    [...new Set(all.flatMap(t=>t.meta.tags||[]))].sort().forEach(tag=>select.createEl('option',{text:'#'+tag,value:tag}));select.value=this.tag;
    select.onchange=()=>{this.tag=select.value;this.renderResults(results,all);};
    const results=c.createDiv();this.renderResults(results,all);
  }
  renderResults(c,all){
    c.empty();const q=this.query.toLocaleLowerCase();const tasks=all.filter(t=>(!this.tag||(t.meta.tags||[]).includes(this.tag))&&`${t.meta.title} ${t.body} ${(t.meta.tags||[]).join(' ')}`.toLocaleLowerCase().includes(q));
    if(this.mode==='stats'){this.renderStats(c,tasks);return;}
    const board=c.createDiv({cls:'tf-board'});
    for(const [status,label] of Object.entries(STATES)){
      const col=board.createDiv({cls:'tf-column'});const list=tasks.filter(t=>t.meta.status===status).sort((a,b)=>(dateValue(a.meta.due)||'9999').localeCompare(dateValue(b.meta.due)||'9999'));
      col.createEl('h3',{text:`${label} · ${list.length}`});
      col.ondragover=e=>{e.preventDefault();};col.ondrop=e=>{e.preventDefault();const path=e.dataTransfer?.getData('text/taskflow');const task=this.plugin.tasks.find(t=>t.file.path===path);if(task)this.plugin.change(task,m=>m.status=status).catch(report);};
      if(!list.length)col.createEl('p',{text:'Keine Aufgaben',cls:'tf-muted'});
      for(const t of list)this.card(col,t);
    }
  }
  card(col,t){
    const card=col.createDiv({cls:'tf-card'+(overdue(t)?' tf-overdue':'')});card.draggable=true;card.ondragstart=e=>e.dataTransfer.setData('text/taskflow',t.file.path);
    button(card,t.meta.title,()=>new TaskEditor(this.plugin,t).open(),'tf-title');
    const badges=card.createDiv({cls:'tf-badges'});if(t.meta.due)badges.createSpan({text:`${overdue(t)?'Überfällig · ':''}${dateValue(t.meta.due)}`});
    if(t.meta.priority==='high')badges.createSpan({text:'Hohe Priorität'});for(const tag of t.meta.tags||[])badges.createSpan({text:'#'+tag});
    const subs=subtasks(t.body);if(subs.length)card.createDiv({text:`Teilaufgaben: ${subs.filter(x=>x[1]!==' ').length}/${subs.length}`,cls:'tf-muted'});
    subs.forEach((sub,index)=>{const label=card.createEl('label',{cls:'tf-subtask'});const check=label.createEl('input',{type:'checkbox'});check.checked=sub[1]!==' ';label.createSpan({text:sub[2]});check.onchange=()=>{check.disabled=true;this.plugin.change(t,()=>{},body=>toggleSubtask(body,index),t.raw).catch(report);};});
    const controls=card.createDiv({cls:'tf-card-actions'});const select=controls.createEl('select');select.setAttribute('aria-label','Status für '+t.meta.title);for(const [value,text]of Object.entries(STATES))select.createEl('option',{value,text});select.value=t.meta.status;
    select.onchange=()=>{select.disabled=true;this.plugin.change(t,m=>m.status=select.value).catch(report);};
    button(controls,'Notiz öffnen',()=>this.app.workspace.getLeaf(false).openFile(t.file));
    button(controls,t.meta.archived?'Wiederherstellen':'Archivieren',()=>this.plugin.change(t,m=>m.archived=!m.archived).catch(report));
  }
  renderStats(c,tasks){
    const s=summarize(tasks);c.createEl('h2',{text:'Aufgabenstatistik'});c.createEl('p',{text:`${s.done} von ${s.total} erledigt · ${s.total?Math.round(s.done/s.total*100):0} % Abschlussquote. Filter gelten auch hier.`});
    const progress=c.createEl('progress');progress.max=s.total||1;progress.value=s.done;progress.setAttribute('aria-label','Abschlussquote');
    c.createEl('h3',{text:'Erledigt in den letzten 14 Tagen'});
    for(let i=13;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;const count=tasks.filter(t=>t.meta.status==='done'&&dateValue(t.meta.completed)===key).length;const row=c.createDiv({cls:'tf-chart-row'});row.createSpan({text:key});const bar=row.createEl('progress');bar.max=Math.max(1,...Array.from({length:14},(_,j)=>{const z=new Date();z.setDate(z.getDate()-j);return tasks.filter(t=>t.meta.status==='done'&&dateValue(t.meta.completed)===`${z.getFullYear()}-${String(z.getMonth()+1).padStart(2,'0')}-${String(z.getDate()).padStart(2,'0')}`).length;}));bar.value=count;row.createSpan({text:String(count)});}
    c.createEl('h3',{text:'Nach Tags'});const tags=[...new Set(tasks.flatMap(t=>t.meta.tags||[]))].sort();for(const tag of tags){const group=tasks.filter(t=>(t.meta.tags||[]).includes(tag));c.createEl('p',{text:`#${tag}: ${group.filter(t=>t.meta.status==='done').length} erledigt / ${group.length} gesamt`});}if(!tags.length)c.createEl('p',{text:'Noch keine Tags vergeben.'});
    c.createEl('p',{text:'Wieder geöffnete Aufgaben zählen nicht als erledigt. Archivierte Aufgaben separat im Archiv anzeigen.',cls:'tf-muted'});
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
    if(version!==this.scanVersion)return;this.tasks=tasks;for(const leaf of this.app.workspace.getLeavesOfType(VIEW))leaf.view.render();if(invalid!==this.invalidCount&&invalid)new Notice(`${invalid} Datei(en) im TaskFlow-Ordner konnten nicht gelesen werden. Details in der Entwicklerkonsole.`);this.invalidCount=invalid;
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
module.exports.testing={today,dateValue,decode,encode,overdue,summarize,subtasks,toggleSubtask,STATES};
