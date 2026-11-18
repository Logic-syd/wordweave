import {samples,topics} from './content.js';
import {gradeDictation,pointCounts,selfCheckPoints} from './assessment.js';

const paths = {
  brand:'<path d="M3 5.5c5 0 8 1 9 4 1-3 4-4 9-4v12c-5 0-8 1-9 3-1-2-4-3-9-3zM12 9.5v11M6.5 9c1.2 0 2 .3 3 .8m-3 3c1.2 0 2 .3 3 .8m8-4.6c-1.2 0-2 .3-3 .8m3 3c-1.2 0-2 .3-3 .8"/>',
  home:'<path d="m3 10 9-7 9 7v10h-6v-6H9v6H3z"/>',
  book:'<path d="M3 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-3H3zm18 0h-6a3 3 0 0 0-3 3v14a4 4 0 0 1 4-3h5z"/>',
  repeat:'<path d="m17 2 4 4-4 4M3 10V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14 0v2a2 2 0 0 1-2 2H3"/>',
  chart:'<path d="M4 3v17h17M9 15v-4m5 4V7m5 8V4"/>',
  audio:'<path d="M3 9v6h4l5 4V5L7 9zm12 0a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12"/>',
  play:'<path d="m8 4 12 8-12 8z" fill="currentColor" stroke="none"/>',
  stop:'<path d="M6 6h12v12H6z" fill="currentColor" stroke="none"/>',
  arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  check:'<path d="m5 12 4 4 10-10"/>'
};
const icon = name => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[name]+'</svg>';
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));

const main = document.querySelector('#main');
const dialog = document.querySelector('#dialog');
const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateKey = (date=new Date()) => new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
const shift = (day,n) => { const date = new Date(day+'T12:00:00Z'); date.setUTCDate(date.getUTCDate()+n); return dateKey(date); };
const uid = () => crypto.randomUUID();
const read = (key,fallback) => {try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const write = (key,value) => {try{localStorage.setItem(key,JSON.stringify(value));}catch{return false;}return true;};
const data = read('ww-data-v1',{});
const pending = read('ww-pending-v1',{});
let mode = read('ww-mode',5) === 20 ? 20 : 5;
let bilingual = read('ww-bilingual',true);
let taskOverride = null;
let reviewQueue = null;
let revealed = false;
let played = false;
let speaking = false;
let languageFilter = '';
let topicFilter = '';
let toastTimer;
let draftTimer;
let syncing = false;
let storageAvailable = true;
let activeDraft = null;
let aiConfigured = null;
const checking = new Set();
const gradingErrors = new Map();
const generatedForms = new WeakMap();
const key = (kind,id) => kind+':'+id;
const get = (kind,id) => data[key(kind,id)]?.value;
const list = kind => Object.values(data).filter(x=>x.kind===kind).map(x=>x.value);
const byRecent = (a,b) => (b.at??0)-(a.at??0);
const setStatus = message => document.querySelector('#sync').textContent=message;
function toast(message) {
  document.querySelector('#toast').textContent=message;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>document.querySelector('#toast').textContent='',3800);
}
function persist(kind,id,value,flush=true) {
  const entry={kind,id,value};
  data[key(kind,id)]=entry;
  pending[key(kind,id)]=entry;
  storageAvailable=write('ww-pending-v1',pending) && write('ww-data-v1',data);
  setStatus('有更改待同步');
  if(flush) void sync();
}
async function sync() {
  if(syncing) return;
  syncing=true;
  try {
    for(const [id,item] of Object.entries(pending)) {
      const reply=await fetch('/api/study',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(item)});
      if(!reply.ok) throw Error('sync');
      if(pending[id]===item) delete pending[id];
      write('ww-pending-v1',pending);
    }
    setStatus(Object.keys(pending).length?'有更改待同步':'已同步');
    if(Object.keys(pending).length) setTimeout(sync,100);
  } catch {
    setStatus(storageAvailable?'待同步 · 已暂存':'同步失败 · 请保持页面打开');
  } finally { syncing=false; }
}
async function hydrate() {
  try {
    const reply=await fetch('/api/study');
    if(!reply.ok) throw Error('sync');
    for(const item of await reply.json()) {
      const id=key(item.kind,item.id);
      if(!pending[id]) data[id]=item;
    }
    write('ww-data-v1',data);
    if(!main.contains(document.activeElement) && !dialog.open) render();
    await sync();
  } catch {setStatus('暂无法连接 · 浏览器暂存');}
}
const materials = () => [...list('materials').sort(byRecent),...samples].filter((x,i,all)=>all.findIndex(y=>y.id===x.id)===i);
const material = id => get('materials',id)??samples.find(x=>x.id===id);
const tasks = {
  listen:{label:'听力',title:'先听，再写下你听到的重点',tip:'先听一遍，用自己的话写下重点。英语尽量直接用英文；德语可以用中文概括。'},
  understand:{label:'理解',title:'读一段，回答一个问题',tip:'读完后用一句话回答，可以随时展开中文辅助。'},
  shadow:{label:'跟读',title:'听一句，跟读两遍',tip:'第一遍跟上节奏，第二遍留意重音。可以记下卡住的词或贴录音链接。'},
  dictation:{label:'听写',title:'把听到的句子写下来',tip:'先整句听，再按短语听。写完后展开原文对照。'},
  retell:{label:'复述',title:'合上原文，用自己的话复述',tip:'先读或听一遍，再收起原文。用一两句话讲清楚意思。'},
  oral:{label:'口语回答',title:'把它说成你自己的话',tip:'先直接开口说两句，再记下你的回答或贴录音链接。'}
};
const sequence=['understand','shadow','dictation','retell','oral'];
const markTypes=['生词','自然表达','漏听','卡句'];
const spaced=[1,3,7,14,30,60];
function daily() {
  const day=dateKey();
  const existing=get('sessions',day);
  if(existing && material(existing.material)) return existing;
  const custom=list('materials').filter(x=>!samples.some(y=>y.id===x.id)).sort(byRecent);
  const dayNumber=Math.round((Date.parse(day)-Date.parse('2026-11-12'))/86400000);
  const schedule=custom.length && dayNumber%3!==2 ? custom : samples;
  const index=((dayNumber%schedule.length)+schedule.length)%schedule.length;
  return {id:day,material:schedule[index].id,index:Math.floor(Math.abs(dayNumber)/schedule.length)};
}
function activity() {
  const session=daily();
  const m=material(taskOverride?.mid??session.material);
  const index=taskOverride?.index??session.index;
  const p=m.paragraphs[index%m.paragraphs.length];
  const step=taskOverride?0:mode===20?sequence.findIndex(type=>!completed(m,p,type)):0;
  const type=taskOverride?.type??(mode===20?(sequence[step]??'oral'):'listen');
  return {session,m,p,type,step,id:draftId(m,p,type)};
}
const draftId = (m,p,type) => m.id+'/'+p.id+'/'+type;
const completed = (m,p,type) => list('history').some(h=>h.day===dateKey()&&h.mid===m.id&&h.pid===p.id&&h.type===type&&!h.extra);
const sentence = p => p.text.match(/[^.!?。！？]+[.!?。！？]+(?=\s|$)|[^.!?。！？]+$/u)?.[0].trim()??p.text;
const target = (type,p) => ['shadow','dictation'].includes(type)?sentence(p):p.text;
function question(m,p,type) {
  if(type==='understand' && p.question) return p.question;
  if(type==='oral' && p.oral) return p.oral;
  const first=p.id===m.paragraphs[0].id;
  if(type==='understand') return first&&m.question ? m.question : m.lang==='de'?'Worum geht es in diesem Absatz? Nenne ein Detail.':'What is the main point of this paragraph? Give one detail from the text.';
  if(type==='oral') return m.oral || (m.lang==='de'?'Was würdest du in einer ähnlichen Situation sagen?':'How would you explain this point to someone who hasn’t read the text? Give a concrete example.');
  return '';
}
const button = (action,label,cls='secondary',attrs='') => '<button type="button" class="'+cls+'" data-action="'+action+'" '+attrs+'>'+label+'</button>';
const badge = label => '<span class="badge">'+icon('audio')+escape(label)+'</span>';
const intro = (title,description,actions='') => '<div class="intro row between"><div><h1>'+title+'</h1><p>'+description+'</p></div>'+actions+'</div>';
const empty = message => '<p class="empty">'+message+'</p>';
const bilingualButton = () => button('bilingual',bilingual?'隐藏中文':'显示中文','quiet','aria-pressed="'+bilingual+'"');
function speak(text,lang,slow=false) {
  if(!window.speechSynthesis) {toast('当前浏览器不支持朗读。可以展开原文继续。');return;}
  const synth=window.speechSynthesis;
  if(speaking) {synth.cancel(); speaking=false;setPlay(false);return;}
  const utterance=new SpeechSynthesisUtterance(text);
  utterance.lang=lang==='de'?'de-DE':'en-GB';
  utterance.rate=slow?.76:.94;
  const voices=synth.getVoices().filter(v=>v.lang.toLowerCase().startsWith(lang));
  utterance.voice=voices.find(v=>v.lang===utterance.lang)??voices[0]??null;
  utterance.onstart=()=>{speaking=true;played=true;setPlay(true);};
  utterance.onend=()=>{speaking=false;setPlay(false);};
  utterance.onerror=e=>{speaking=false;setPlay(false);if(!['canceled','interrupted'].includes(e.error)) toast('朗读不可用，请检查系统语音设置或展开原文。');};
  synth.speak(utterance);
}
function setPlay(on) {
  const btn=main.querySelector('.play');
  if(btn){btn.innerHTML=icon(on?'stop':'play');btn.setAttribute('aria-label',on?'停止朗读':'播放朗读');}
  const text=main.querySelector('#play-status');
  if(text) text.textContent=on?'正在播放 · 系统朗读':played?'可以重听，也可以继续作答':'先听一遍，可以重播';
}
function showToday() {
  const {m,p,type,step,id}=activity();
  const t=tasks[type];
  const date=new Intl.DateTimeFormat('zh-CN',{timeZone:'Europe/Berlin',month:'long',day:'numeric',weekday:'long'}).format(new Date());
  const isDone=mode===20?step===-1:completed(m,p,type);
  const draft=get('drafts',id)??{};
  const prior=list('history').filter(h=>h.mid===m.id&&h.pid===p.id&&h.type===type&&h.answer).sort(byRecent)[0];
  const needsReading=type==='understand';
  const q=question(m,p,type);
  return '<div class="top"><span class="date">'+date+'</span><div class="modes" aria-label="练习时长">'+[5,20].map(min=>button('mode',min+' 分钟','','data-mode="'+min+'" aria-pressed="'+(min===mode)+'"')).join('')+'</div></div>'+
    intro(taskOverride?'材料练习':'今日练习',taskOverride?escape(m.title):'工作英语听说 · A1–B1 德语阅读')+
    (!taskOverride&&isDone ? '<section class="card">'+badge('今日已完成')+'<h2 class="section">今天的 '+mode+' 分钟练完了</h2><p class="prompt">答案和已有的批改结果都在练习记录里。</p><div class="row"><a class="primary" href="#review">查看到期表达 '+icon('arrow')+'</a><a class="secondary" href="#history">练习记录</a></div></section>' :
    '<section class="card"><div class="card-meta">'+badge(t.label)+'<span>'+escape(m.topic)+' · '+(m.lang==='de'?'德语 '+m.level:'英语')+'</span></div>'+
    (mode===20&&!taskOverride?'<div class="progress p'+(step+1)*20+'" role="progressbar" aria-label="任务进度" aria-valuenow="'+(step+1)+'" aria-valuemin="0" aria-valuemax="5"><span></span></div>':'')+
    '<h2>'+t.title+'</h2><p class="prompt">'+t.tip+'</p>'+
    (needsReading||revealed?'<div class="readback"><div class="original">'+escape(target(type,p))+'</div>'+(bilingual&&p.zh?'<div class="chinese">'+escape(p.zh)+'</div>':'')+'</div><div class="row">'+bilingualButton()+(!needsReading?button('reveal','收起原文','quiet'):'')+button('mark','添加标记','quiet','data-mid="'+escape(m.id)+'" data-pid="'+escape(p.id)+'"')+'</div>':'')+
    (!needsReading?'<div class="audio"><button class="play" type="button" aria-label="播放朗读" data-action="play">'+icon('play')+'</button><div class="audio-label"><strong>'+escape(m.title)+'</strong><small id="play-status">'+(played?'可以重听，也可以继续作答':'先听一遍，可以重播')+'</small></div>'+button('slow','慢速','quiet')+'</div>':'')+
    (q?'<p class="readback" lang="'+m.lang+'">'+escape(q)+'</p>':'')+
    '<form id="answer-form"><label class="field">'+(type==='shadow'?'跟读笔记（可选）':type==='dictation'?'听写结果':'我的回答')+'<textarea id="answer" class="answer" maxlength="8000" placeholder="'+(m.lang==='de'?'写下你理解或想表达的内容…':'Write what you understood or what you would say…')+'">'+escape(draft.answer)+'</textarea></label>'+
    '<details class="details" '+(draft.link?'open':'')+'><summary>添加录音或视频链接</summary><label class="field">链接<input id="answer-link" type="url" pattern="https?://.+" maxlength="2000" placeholder="https://" value="'+escape(draft.link)+'"></label></details>'+
    (prior?'<div class="row">'+button('reuse','复用上次回答','quiet','data-id="'+escape(prior.id)+'"')+'</div>':'')+
    '<div class="row between actions"><button class="primary" type="submit">'+(type==='shadow'?'完成跟读':'提交并查看反馈')+' '+icon('arrow')+'</button>'+(!needsReading&&!revealed?button('reveal','查看原文','quiet'):'')+'</div></form></section>')+
    (!taskOverride?'<div class="section row between"><p class="meta">'+(mode===20?'依次练习理解、跟读、听写、复述和口语回答。':'今天只做这一题。')+'</p><a class="quiet" href="#library">去看材料 '+icon('arrow')+'</a></div>':'');
}
const options = (items,current) => items.map(x=>'<option '+(x===current?'selected':'')+'>'+escape(x)+'</option>').join('');
const markList = () => list('marks').filter(m=>!m.deleted);
function highlighted(p,marks) {
  const terms=[...new Set(marks.map(m=>m.text).filter(Boolean))].sort((a,b)=>b.length-a.length);
  if(!terms.length) return escape(p.text);
  const regex=new RegExp(terms.map(t=>t.replace(/[.*+?^$${}()|[\]\\]/g,'\\$&')).join('|'),'giu');
  let end=0;
  let html='';
  for(const match of p.text.matchAll(regex)) {
    html+=escape(p.text.slice(end,match.index))+'<mark class="mark">'+escape(match[0])+'</mark>';
    end=match.index+match[0].length;
  }
  return html+escape(p.text.slice(end));
}
function showLibrary(id) {
  const m=id&&material(id);
  if(m) return '<div class="top"><a class="quiet" href="#library">← 我的材料</a><div class="row">'+bilingualButton()+button('edit','编辑材料','secondary','data-id="'+escape(id)+'"')+'</div></div>'+
    intro(escape(m.title),escape(m.topic)+' · '+(m.lang==='de'?'德语 '+escape(m.level):'英语'))+
    '<section class="card">'+m.paragraphs.map((p,i)=>{
      const marks=markList().filter(x=>x.mid===id&&x.pid===p.id);
      return '<article class="paragraph"><p class="original" lang="'+m.lang+'">'+highlighted(p,marks)+'</p>'+
        (bilingual?'<p class="chinese">'+(escape(p.zh)||'这段还没有中文辅助，可在「编辑材料」中补充。')+'</p>':'')+
        '<div class="row">'+button('mark','标记选中文字','quiet','data-mid="'+escape(id)+'" data-pid="'+escape(p.id)+'"')+
        button('paragraph-play','朗读','quiet','data-mid="'+escape(id)+'" data-pid="'+escape(p.id)+'"')+
        '<label class="meta">练这一段 <select aria-label="选择段落练习" data-paragraph-task="'+escape(id)+'" data-index="'+i+'"><option value="">选择任务</option>'+Object.entries(tasks).map(([type,t])=>'<option value="'+type+'">'+t.label+'</option>').join('')+'</select></label></div>'+
        (marks.length?'<div class="row">'+marks.map(x=>button('edit-mark',escape(x.type)+' · '+escape(x.text), 'mark-chip secondary','data-id="'+escape(x.id)+'"')).join('')+'</div>':'')+'</article>';
    }).join('')+
    (m.phrase?'<div class="section row">'+button('sample-mark','收藏表达「'+escape(m.phrase)+'」','secondary','data-mid="'+escape(id)+'"')+'</div>':'')+'</section>';
  const filtered=materials().filter(x=>(!languageFilter||x.lang===languageFilter)&&(!topicFilter||x.topic===topicFilter));
  return intro('我的材料','粘贴或导入文本，保留原来的分段。',button('import',icon('plus')+' 导入材料','primary'))+
    '<div class="row filters"><select aria-label="语言筛选" id="language-filter"><option value="">所有语言</option><option value="en" '+(languageFilter==='en'?'selected':'')+'>英语</option><option value="de" '+(languageFilter==='de'?'selected':'')+'>德语</option></select>'+
    '<select aria-label="主题筛选" id="topic-filter"><option value="">所有主题</option>'+options(topics,topicFilter)+'</select></div>'+
    '<div class="stack">'+(filtered.map(x=>'<a class="card mini row between" href="#material/'+encodeURIComponent(x.id)+'"><div><h3>'+escape(x.title)+'</h3><p class="meta">'+escape(x.topic)+' · '+(x.lang==='de'?'德语 '+escape(x.level):'英语')+' · '+x.paragraphs.length+' 段</p></div>'+icon('arrow')+'</a>').join('')||empty('没有匹配的材料。'))+'</div>';
}
function dueMarks() {
  const today=dateKey();
  return markList().filter(x=>x.due<=today).sort((a,b)=>a.due.localeCompare(b.due)||a.stage-b.stage||byRecent(a,b));
}
function showReview() {
  const due=dueMarks();
  if(reviewQueue) {
    const x=get('marks',reviewQueue[0]);
    if(x&&!x.deleted) {
      const m=material(x.mid);
      const context=m?.paragraphs.find(p=>p.id===x.pid);
      return intro('间隔复习','先回想意思，或者用这个表达造一句话。')+
        '<section class="card"><div class="card-meta">'+badge(x.type)+'<span>还剩 '+reviewQueue.length+' 条</span></div><h2>'+escape(x.text)+'</h2>'+
        (revealed?'<div class="readback">'+escape(x.note||'这条标记还没有释义。')+(context?'<p class="chinese">'+escape(context.text)+'</p>':'')+'</div><div class="row actions">'+button('rate','再练一次','secondary','data-rating="again"')+button('rate','记住了 '+icon('check'),'primary','data-rating="known"')+'</div>':
        '<div class="row actions">'+button('reveal','查看释义与上下文','primary')+'</div>')+'</section>';
    }
  }
  const recent=markList().filter(x=>x.reviewedAt).sort((a,b)=>b.reviewedAt-a.reviewedAt).slice(0,5);
  const upcoming=markList().filter(x=>x.due>dateKey()).sort((a,b)=>a.due.localeCompare(b.due)).slice(0,3);
  const markRows=entries=>entries.map(x=>'<div class="card mini row between"><div><h3>'+escape(x.text)+'</h3><p class="meta">'+escape(x.type)+' · 下次 '+escape(x.due)+'</p></div>'+button('edit-mark','查看标记','quiet','data-id="'+escape(x.id)+'"')+'</div>').join('');
  return intro('间隔复习','每轮最多复习三条，优先安排到期和容易忘的表达。')+
    '<section class="card"><h2>'+ (due.length?'今天有 '+due.length+' 条到期':'今天没有到期表达')+'</h2><p class="prompt">'+(due.length?'先复习 '+Math.min(3,due.length)+' 条。':'在材料或练习原文中添加标记，就会排进复习。')+'</p>'+
    (due.length?button('start-review','开始复习 '+icon('arrow'),'primary'):'<a class="secondary" href="#library">打开材料</a>')+'</section>'+
    (upcoming.length?'<div class="section"><h2>接下来复习</h2><div class="stack">'+markRows(upcoming)+'</div></div>':'')+
    '<div class="section"><h2>最近复习</h2><div class="stack">'+(markRows(recent)||empty('完成一轮后，最近复习会出现在这里。'))+'</div></div>';
}
function makeReference(m,p,type) {
  const cues=type==='understand' && p.answerGuide ? [p.answerGuide] : ['listen','retell'].includes(type)?p.points:null;
  return {source:target(type,p),lang:m.lang,question:question(m,p,type),cues:cues??[]};
}
function referenceOf(h) {
  if(!h)return null;
  if(h.reference)return h.reference;
  const m=material(h.mid);
  const p=m?.paragraphs.find(p=>p.id===h.pid);
  return p?{...makeReference(m,p,h.type),currentVersion:true}:null;
}
const canGradeMeaning = h=>Boolean(h?.answer) && ['listen','retell','understand','oral'].includes(h.type);
const stateLabels={met:'已表达',partial:'部分表达',missed:'遗漏'};
function historyGradeLabel(h) {
  const g=h.grade;
  if(g?.method==='dictation')return '逐词准确率 '+g.score+'%';
  if(g?.points?.length){
    const n=pointCounts(g.points);
    return (g.method==='self'?'自评':'AI 批改')+' · '+n.met+'/'+n.total+' 项完整';
  }
  if(h.type==='shadow'||!h.answer)return '查看练习记录';
  return '查看反馈或补批';
}
async function checkConnection(){
  try {
    const res=await fetch('/api/ai/status');
    if(!res.ok)return;
    aiConfigured=(await res.json()).configured;
    if(route()[0]==='result'&&!main.contains(document.activeElement)) render();
  } catch { /* Offline practice still reads the saved attempts. */ }
}
async function aiRequest(action,input) {
  const response=await fetch('/api/ai/'+action,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)
  });
  const body=await response.json();
  if(!response.ok){
    if(body.code==='not_configured')aiConfigured=false;
    throw new Error(body.error||'暂时无法取得结果，可稍后重试。');
  }
  aiConfigured=true;
  return body;
}
function collectCorrections(entry) {
  const grade=entry.grade;
  const suggestions=grade.method==='dictation' ? grade.differences
    .filter(d=>d.expected).map(d=>({text:d.expected,reason:d.actual?'这次写成了 '+d.actual:'这次漏写了这个表达。'})) : grade.review || [];
  suggestions.slice(0,2).forEach((term,i)=>{
    const id='feedback-'+entry.id+'-'+i;
    if(get('marks',id)||markList().some(m=>m.mid===entry.mid&&m.pid===entry.pid&&m.text.toLowerCase()===term.text.toLowerCase()))return;
    persist('marks',id,{id,mid:entry.mid,pid:entry.pid,text:term.text,note:term.reason,
      type:['dictation','listen'].includes(entry.type)?'漏听':'卡句',due:dateKey(),stage:0,at:Date.now()});
  });
}
async function checkMeaning(id) {
  const h=get('history',id);
  const ref=referenceOf(h);
  if(!canGradeMeaning(h)||!ref||checking.has(id)||h.grade?.method==='openai')return;
  const refresh=()=>{if(route()[0]==='result'&&route()[1]===id)render();};
  checking.add(id);gradingErrors.delete(id);refresh();
  try {
    const grade=await aiRequest('grade',{source:ref.source,question:ref.question,lang:ref.lang,answer:h.answer,type:h.type});
    const entry={...h,reference:ref,grade};
    persist('history',id,entry);
    collectCorrections(entry);
  } catch (e) {
    gradingErrors.set(id,e instanceof TypeError?'网络暂时不可用，回答已保存。':e.message);
  } finally {checking.delete(id);refresh();}
}
function dictationView(g) {
  const rows=g.differences.map(x=>'<li><strong>'+escape(x.expected||'多写')+'</strong><span>'+
    escape(x.actual?'你写了 '+x.actual:'这处漏写了')+'</span></li>').join('');
  return '<h2>逐词准确率 '+g.score+'%</h2><p class="prompt">原文 '+g.total+' 词，写对 '+g.correct+' 词。替换 '+g.substitutions+' 处，漏写 '+g.missing+' 词，多写 '+g.extra+' 词。</p>'+
    (rows?'<ul class="feedback-list">'+rows+'</ul>':'<p>用词与原句一致。</p>')+
    (g.groupCount>g.differences.length?'<p class="meta">显示前 '+g.differences.length+' 组差异。</p>':'')+
    '<details class="details"><summary>分数怎么算</summary><p>每处替换、漏词和多词各扣一个词，再除以原文词数计算准确率，最低为零。忽略大小写和标点。</p></details>';
}
function meaningView(g) {
  const n=pointCounts(g.points);
  return '<p class="meta">'+(g.method==='self'?'对照自评':'AI 文字批改')+'</p><h2>完整表达 '+n.met+' / '+n.total+' 项</h2>'+
    (n.partial?'<p class="sub">另有 '+n.partial+' 项部分表达。</p>':'')+
    '<ul class="feedback-list">'+g.points.map(p=>'<li><strong>'+escape(stateLabels[p.status])+' · '+escape(p.label)+'</strong>'+
      (p.explanation?'<span>'+escape(p.explanation)+'</span>':'')+'</li>').join('')+'</ul>'+
    (g.correction?'<p class="note">'+escape(g.correction)+'</p>':'')+
    (g.example?'<div class="readback"><span class="meta">一种自然的说法</span><p>'+escape(g.example)+'</p></div>':'')+
    (g.review?.length?'<p class="note">建议复习 '+g.review.map(t=>'「'+escape(t.text)+'」').join('、')+'。可在间隔复习中查看。</p>':'');
}
function selfCheckView(h,ref) {
  const points=selfCheckPoints(h.type,ref.source,ref.lang,ref.cues);
  return '<details class="details"><summary>对照要点自评</summary><form id="self-form" data-id="'+escape(h.id)+'">'+
    points.map((p,i)=>'<label class="field">'+escape(p)+'<select name="point'+i+'" required><option value="">选择覆盖情况</option><option value="met">已表达</option><option value="partial">部分表达</option><option value="missed">遗漏</option></select></label>').join('')+
    '<div class="actions"><button class="secondary" type="submit">记录自评</button></div></form></details>';
}
function saveSelfCheck(form) {
  const h=get('history',form.dataset.id);
  const ref=referenceOf(h);
  if(!ref||checking.has(h.id)||h.grade?.method==='openai')return;
  const rubric=selfCheckPoints(h.type,ref.source,ref.lang,ref.cues);
  const values=new FormData(form);
  const points=rubric.map((label,i)=>({label,status:values.get('point'+i)}));
  if(points.some(p=>!Object.hasOwn(stateLabels,p.status)))return;
  persist('history',h.id,{...h,reference:ref,grade:{method:'self',points}});
  render();
}
function showResult(id) {
  const h=get('history',id);
  if(!h)return intro('练习反馈','正在查找这条记录。','<a class="secondary" href="#history">练习记录</a>');
  const ref=referenceOf(h);
  const grade=h.grade;
  const active=checking.has(id);
  const error=gradingErrors.get(id);
  let report;
  if(grade?.method==='dictation')report=dictationView(grade);
  else if(grade?.points)report=meaningView(grade);
  else if(h.type==='shadow'||!h.answer)report='<h2>练习已记录</h2><p class="prompt">'+(h.type==='shadow'?'跟读笔记和录音链接随记录保存。':'这条记录只有媒体链接。文字批改需要一份书面回答。')+'</p>';
  else if(!ref)report='<h2>缺少当时的原文</h2><p class="prompt">这份旧答案仍可查看。</p>';
  else if(h.type==='dictation')report='<h2>这次听写还没有分数</h2>'+button('check-dictation','对照原文补批','primary','data-id="'+escape(id)+'"');
  else report='<h2>'+(active?'正在核对你的回答':'答案已保存')+'</h2>';
  if(canGradeMeaning(h)&&ref&&grade?.method!=='openai'){
    if(active)report+='<p class="prompt" role="status">正在逐项检查意思和表达。</p>';
    else {
      if(error||aiConfigured===false)report+='<p class="note">'+escape(error||'工作台尚未连接 OpenAI。')+'</p>';
      report+='<div class="row actions">'+button('check-meaning',error?'重新批改':'批改这份回答','secondary','data-id="'+escape(id)+'"')+'</div>';
      if(!grade)report+=selfCheckView(h,ref);
    }
  }
  const canContinue=!h.extra&&h.mode===20&&h.day===dateKey();
  const home=canContinue?'<a class="primary" data-continue-mode="20" href="#today">回到今日练习 '+icon('arrow')+'</a>':'<a class="primary" href="#history">查看练习记录 '+icon('arrow')+'</a>';
  return intro('练习反馈',escape(h.title)+' · '+escape(tasks[h.type]?.label)+' · '+escape(h.day))+
    '<section class="card feedback">'+report+
    (ref?.currentVersion?'<p class="note">这条旧记录没有原文快照，补批使用材料的当前版本。</p>':'')+
    '<div class="section"><h3>我的回答</h3><p class="answer-copy">'+escape(h.answer||'已记录练习')+'</p>'+
    (safeLink(h.link)?'<a class="link" href="'+escape(safeLink(h.link))+'" target="_blank" rel="noopener noreferrer">打开录音或视频</a>':'')+'</div>'+
    (ref?'<details class="details"><summary>查看练习原文</summary><p class="readback">'+escape(ref.source)+'</p>'+(ref.question?'<p>'+escape(ref.question)+'</p>':'')+'</details>':'')+
    '<div class="actions">'+home+'</div></section>';
}
async function prepareMaterial(form,btn) {
  const note=form.querySelector('#translation-note');
  const source=form.elements.text.value;
  const lang=form.elements.lang.value==='德语'?'de':'en';
  const level=form.elements.level.value;
  const paragraphs=split(source);
  if(!paragraphs.length){note.textContent='请先粘贴原文。';return;}
  const batches=[];
  let batch=[],size=0;
  for(const p of paragraphs){
    if(batch.length&&(batch.length===6||size+p.length>6500)){batches.push(batch);batch=[];size=0;}
    batch.push(p);size+=p.length;
  }
  batches.push(batch);
  btn.disabled=true;
  const submit=form.querySelector('button[type=submit]');
  submit.disabled=true;
  try {
    const generated=[];
    for(let i=0;i<batches.length;i++){
      if(!form.isConnected || !dialog.open)return;
      note.textContent='正在生成中文和练习 · '+(i+1)+' / '+batches.length;
      const result=await aiRequest('material',{lang,level,paragraphs:batches[i]});
      generated.push(...result.paragraphs);
    }
    if(!form.isConnected || !dialog.open)return;
    if(form.elements.text.value!==source || (form.elements.lang.value==='德语'?'de':'en')!==lang || form.elements.level.value!==level){
      note.textContent='原文、语言或级别已变动，请为当前内容重新生成。';return;
    }
    const translations=split(form.elements.zh.value);
    if(translations.length>paragraphs.length){note.textContent='已有中文段落多于原文，请先校对段落顺序。';return;}
    form.elements.zh.value=generated.map((p,i)=>translations[i]&&translations[i]!=='—'?translations[i]:p.zh.replace(/\n\s*\n/g,'\n')).join('\n\n');
    generatedForms.set(form,{lang,level,source,paragraphs:generated});
    note.textContent='已按原段落配好中文和练习，保存后即可使用。';
  } catch (e) {note.textContent=e instanceof TypeError?'网络暂时不可用，可重试或直接保存材料。':e.message;}
  finally {btn.disabled=false;submit.disabled=false;}
}

function safeLink(link) {
  try {const url=new URL(link);return ['http:','https:'].includes(url.protocol)?url.href:'';}catch{return '';}
}
function showHistory() {
  const history=list('history').sort(byRecent);
  const days=new Set(history.map(x=>x.day));
  let date=days.has(dateKey())?dateKey():shift(dateKey(),-1);
  let streak=0;
  while(days.has(date)){streak++;date=shift(date,-1);}
  const weak=markList().filter(x=>['漏听','卡句'].includes(x.type)||x.lapses).sort((a,b)=>(b.lapses??0)-(a.lapses??0)||byRecent(a,b)).slice(0,5);
  return intro('练习记录','查看完成情况，回用写过的答案。')+
    '<div class="stats">'+[[streak,'连续练习天数'],[days.size,'累计练习天数'],[history.length,'完成任务']].map(([n,l])=>'<div class="card mini stat"><strong>'+n+'</strong><span class="meta">'+l+'</span></div>').join('')+'</div>'+
    '<div class="section"><h2>薄弱点</h2><div class="stack">'+(weak.map(x=>'<div class="card mini row between"><span>'+escape(x.text)+'</span>'+button('edit-mark',escape(x.type),'quiet','data-id="'+escape(x.id)+'"')+'</div>').join('')||empty('标记漏听、卡句或在复习中选「再练一次」，这里就会出现对应的条目。'))+'</div></div>'+
    '<div class="section"><h2>历史答案</h2><div class="stack">'+(history.map(h=>'<details class="card mini"><summary><strong>'+escape(h.title)+'</strong> <span class="meta">'+escape(h.day)+' · '+tasks[h.type]?.label+'</span></summary><p class="answer-copy">'+(escape(h.answer)||'已完成练习')+'</p>'+
    (safeLink(h.link)?'<p><a class="link" href="'+escape(safeLink(h.link))+'" target="_blank" rel="noopener noreferrer">打开录音或视频</a></p>':'')+
    '<div class="row"><a class="secondary" href="#result/'+escape(h.id)+'">'+escape(historyGradeLabel(h))+'</a></div>'+
    (h.answer&&material(h.mid)?.paragraphs.some(p=>p.id===h.pid)?button('retry','用这份回答再练','quiet','data-id="'+escape(h.id)+'"'):'')+'</details>').join('')||empty('完成第一道练习后，答案会保存在这里。'))+'</div></div>';
}
function route() {return location.hash.slice(1).split('/');}
function render() {
  const [page,id]=route();
  const current=['library','material'].includes(page)?'library':page==='result'?'history':['history','review'].includes(page)?page:'today';
  document.querySelectorAll('[data-nav]').forEach(a=>{
    if(a.dataset.nav===current)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  });
  main.innerHTML=page==='result'?showResult(id):current==='today'?showToday():current==='library'?showLibrary(page==='material'?id:''):current==='review'?showReview():showHistory();
  if(speaking) setPlay(true);
}
function resetStep() {
  if(window.speechSynthesis) window.speechSynthesis.cancel();
  speaking=false; played=false; revealed=false;
}
function advanceFocus() {
  main.querySelector('.card h2')?.setAttribute('tabindex','-1');
  (main.querySelector('.card h2')??main).focus();
}
function saveDraft(flush=true) {
  if(!activeDraft) return;
  const {id,answer,link}=activeDraft;
  activeDraft=null;
  persist('drafts',id,{answer,link},flush);
}
function openDialog(title,body) {
  dialog.innerHTML='<div class="row between"><h2>'+title+'</h2>'+button('close','关闭','quiet')+'</div>'+body;
  dialog.showModal();
}
function editMaterial(m) {
  const title=m?'编辑材料':'导入材料';
  openDialog(title,'<form id="material-form" data-id="'+escape(m?.id)+'">'+
    (!m?'<label class="field">导入 .txt 或 .md（可选）<input type="file" id="text-file" accept=".txt,.md,text/plain,text/markdown"></label>':'')+
    '<label class="field">标题<input name="title" maxlength="100" required value="'+escape(m?.title)+'"></label>'+
    '<div class="row"><label class="field">语言<select name="lang">'+options(['英语','德语'],m?.lang==='de'?'德语':'英语')+'</select></label>'+
    '<label class="field">德语级别<select name="level">'+options(['A1','A2','B1'],m?.level??'A1')+'</select></label>'+
    '<label class="field">主题<select name="topic">'+options(topics,m?.topic??'前端开发')+'</select></label></div>'+
    '<label class="field">原文（用空行分段，段内换行会保留）<textarea name="text" rows="7" maxlength="16000" required>'+escape(m?.paragraphs.map(p=>p.text).join('\n\n'))+'</textarea></label>'+
    '<label class="field">中文辅助（可选，逐段对应）<textarea name="zh" rows="4" maxlength="16000" placeholder="按原文顺序填写。用空行分段，用一行「—」跳过一段。">'+escape(m?.paragraphs.map(p=>p.zh||'—').join('\n\n'))+'</textarea></label>'+
    '<p class="note" id="translation-note">可生成逐段中文、理解题和口语题，已有中文会保留。</p><div class="row actions">'+button('prepare-material','生成中文与练习')+(globalThis.Translator?button('translate','设备翻译','quiet'):'')+'<button class="primary" type="submit">保存材料 '+icon('check')+'</button></div></form>');
}
const split = s => s.replace(/\r\n?/g,'\n').trim().split(/\n[^\S\n]*\n(?:[^\S\n]*\n)*/).filter(p=>p.trim());
function saveMaterial(form) {
  const values=new FormData(form);
  const texts=split(values.get('text'));
  if(!texts.length) {toast('请粘贴一段原文。');return;}
  const zh=split(values.get('zh'));
  if(zh.length>texts.length) {toast('中文段落数多于原文，请检查对应关系。');return;}
  const title=values.get('title').trim();
  if(!title){toast('请填写材料标题。');return;}
  const previous=material(form.dataset.id);
  const lang=values.get('lang')==='德语'?'de':'en';
  const id=previous?.id??uid();
  const old=previous?.paragraphs??[];
  const used=new Set();
  const matches=texts.map(text=>{
    const match=old.find(p=>p.text===text&&!used.has(p.id));
    if(match) used.add(match.id);
    return match;
  });
  const remaining=old.filter(p=>!used.has(p.id));
  const prepared=generatedForms.get(form);
  const generated=prepared?.source===values.get('text') && prepared.lang===lang &&
    (lang==='en'||prepared.level===values.get('level')) ? prepared.paragraphs : null;
  const paragraphs=texts.map((text,i)=>{
    const match=matches[i];
    const generatedPart=generated?.[i];
    const original=match && previous?.lang===lang ? match : {};
    const metadata=generatedPart || original;
    return {id:(match??(texts.length===old.length?remaining.shift():null))?.id??uid(),
      text,zh:zh[i]==='—'?'':zh[i]??'',question:metadata.question,oral:metadata.oral,
      points:metadata.points,answerGuide:metadata.answerGuide};
  });
  const edited=previous&&(lang!==previous.lang||texts.join('\n\n')!==old.map(p=>p.text).join('\n\n'));
  const authored=previous&&!edited?previous:{};
  persist('materials',id,{...authored,id,title,topic:values.get('topic'),lang,level:lang==='de'?values.get('level'):'',paragraphs,at:Date.now()});
  dialog.close();
  if(location.hash==='#material/'+id) render();else location.hash='#material/'+id;
  toast('材料已保存');
}
async function translate(form,btn) {
  const note=form.querySelector('#translation-note');
  const paragraphs=split(form.elements.text.value);
  if(!paragraphs.length){note.textContent='请先粘贴原文。';return;}
  if(!globalThis.Translator){note.textContent='当前浏览器没有可用的设备翻译。可以在下面保存前粘贴中文辅助。';return;}
  if(form.elements.zh.value.trim()&&!confirm('翻译会替换现有中文辅助。继续吗？')) return;
  btn.disabled=true;
  note.textContent='正在准备设备翻译，首次可能需要下载语言包。';
  let translator;
  try {
    translator=await Translator.create({sourceLanguage:form.elements.lang.value==='德语'?'de':'en',targetLanguage:'zh'});
    const results=[];
    for(const paragraph of paragraphs) results.push((await translator.translate(paragraph)).replace(/\n\s*\n/g,'\n'));
    form.elements.zh.value=results.join('\n\n');
    note.textContent='翻译已填入，可以继续编辑。';
  } catch {note.textContent='设备翻译暂不可用。可手动粘贴中文辅助。';}
  finally {translator?.destroy();btn.disabled=false;}
}
function editMark(mid,pid,existing=null,initial='') {
  const m=material(mid);
  if(!m)return;
  openDialog(existing?'编辑标记':'添加标记','<form id="mark-form" data-mid="'+escape(mid)+'" data-pid="'+escape(pid)+'" data-id="'+escape(existing?.id)+'">'+
    '<label class="field">类型<select name="type">'+options(markTypes,existing?.type??'自然表达')+'</select></label>'+
    '<label class="field">词、表达或句子<textarea name="text" maxlength="1000" required>'+escape(existing?.text??initial)+'</textarea></label>'+
    '<label class="field">中文释义或卡住的原因<textarea name="note" maxlength="2000">'+escape(existing?.note)+'</textarea></label>'+
    '<div class="row actions"><button class="primary" type="submit">保存标记</button>'+(existing?button('delete-mark','删除标记','quiet','data-id="'+escape(existing.id)+'"'):'')+'</div></form>');
}
function saveMark(form) {
  const v=new FormData(form);
  const text=v.get('text').trim();
  if(!text){toast('请填写要复习的词或句子。');return;}
  const {mid,pid}=form.dataset;
  const existing=get('marks',form.dataset.id)??markList().find(x=>x.mid===mid&&x.pid===pid&&x.text===text&&x.type===v.get('type'));
  const id=existing?.id??uid();
  persist('marks',id,{stage:0,due:dateKey(),...existing,id,mid,pid,text,type:v.get('type'),note:v.get('note').trim(),at:Date.now()});
  dialog.close();render();toast('标记已保存');
}
function collectPhrase(m) {
  if(!m.phrase)return;
  const id='phrase-'+m.id;
  if(get('marks',id))return;
  persist('marks',id,{id,mid:m.id,pid:m.paragraphs[0].id,text:m.phrase,note:m.meaning,type:'自然表达',due:shift(dateKey(),1),stage:0,at:Date.now()},false);
}
function saveAnswer() {
  const {session,m,p,type,id}=activity();
  const answer=main.querySelector('#answer').value.trim();
  const link=safeLink(main.querySelector('#answer-link').value.trim());
  if(!answer&&!link&&type!=='shadow'){toast('写下一句回答，或添加录音或视频链接。');main.querySelector('#answer').focus();return;}
  clearTimeout(draftTimer);activeDraft=null;
  if(!taskOverride)persist('sessions',session.id,session,false);
  const at=Date.now();
  const entry={id:uid(),mid:m.id,pid:p.id,title:m.title,day:dateKey(),type,answer,link,at,extra:!!taskOverride,mode,
    reference:makeReference(m,p,type)};
  if(type==='dictation' && answer) entry.grade=gradeDictation(entry.reference.source,answer);
  persist('history',entry.id,entry,false);
  if(answer || link) persist('drafts',id,{answer,link},false);
  collectPhrase(m);
  void sync();
  if(entry.grade) collectCorrections(entry);
  taskOverride=null;
  resetStep();
  location.hash='#result/'+entry.id;
  if (canGradeMeaning(entry)) void checkMeaning(entry.id);
  toast('练习已记录');
}
function startExtra(mid,index,type,previous) {
  taskOverride={mid,index,type};
  resetStep();
  if(previous) {
    const m=material(mid);
    const p=m.paragraphs[index];
    persist('drafts',draftId(m,p,type),{answer:previous.answer,link:previous.link});
  }
  if(route()[0]==='exercise')render();else location.hash='#exercise';
}
document.addEventListener('click',event=>{
  if(event.target.closest('[data-continue-mode]')){mode=20;write('ww-mode',20);}
  const btn=event.target.closest('[data-action]');
  if(!btn)return;
  const {action,id,mid,pid}=btn.dataset;
  if(action==='close'){dialog.close();return;}
  if(action==='mode'){mode=Number(btn.dataset.mode);write('ww-mode',mode);resetStep();render();return;}
  if(action==='bilingual'){bilingual=!bilingual;write('ww-bilingual',bilingual);render();return;}
  if(action==='reveal'){revealed=!revealed;render();return;}
  if(action==='play'||action==='slow'){
    const {m,p,type}=activity();
    speak(target(type,p),m.lang,action==='slow');return;
  }
  if(action==='paragraph-play'){const m=material(mid);speak(m.paragraphs.find(x=>x.id===pid).text,m.lang);return;}
  if(action==='import'||action==='edit'){editMaterial(material(id));return;}
  if(action==='translate'){void translate(btn.form,btn);return;}
  if(action==='prepare-material'){void prepareMaterial(btn.form,btn);return;}
  if(action==='check-meaning'){void checkMeaning(id);return;}
  if(action==='check-dictation'){
    const h=get('history',id);
    const ref=referenceOf(h);
    if(h?.answer && ref) {
      const entry={...h,reference:ref,grade:gradeDictation(ref.source,h.answer)};
      persist('history',id,entry);collectCorrections(entry);render();
    }
    return;
  }
  if(action==='mark'){
    const selection=window.getSelection();
    const source=selection?.anchorNode?.parentElement?.closest('.paragraph,.readback');
    const initial=source&&main.contains(source)?selection.toString().trim().slice(0,1000):'';
    editMark(mid,pid,null,initial);return;
  }
  if(action==='edit-mark'){const m=get('marks',id);editMark(m.mid,m.pid,m);return;}
  if(action==='delete-mark'){
    if(!confirm('删除这个标记和它的复习安排？'))return;
    persist('marks',id,{...get('marks',id),deleted:true});dialog.close();render();return;
  }
  if(action==='sample-mark'){collectPhrase(material(mid));void sync();toast('表达已加入复习安排');return;}
  if(action==='start-review'){reviewQueue=dueMarks().slice(0,3).map(x=>x.id);revealed=false;render();advanceFocus();return;}
  if(action==='rate'){
    const entry=get('marks',reviewQueue.shift());
    const again=btn.dataset.rating==='again';
    const stage=again?0:Math.min(entry.stage+1,spaced.length);
    const interval=again?1:spaced[stage-1];
    persist('marks',entry.id,{...entry,stage,due:shift(dateKey(),interval),reviewedAt:Date.now(),lapses:(entry.lapses??0)+Number(again)});
    if(!reviewQueue.length){reviewQueue=null;toast('这轮复习完成');}
    revealed=false;render();advanceFocus();return;
  }
  if(action==='reuse'){
    const entry=get('history',id);
    const input=main.querySelector('#answer');
    if(input.value.trim()&&input.value!==entry.answer&&!confirm('用上次回答替换当前草稿？')) return;
    input.value=entry.answer;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();return;
  }
  if(action==='retry'){
    const entry=get('history',id);
    const index=material(entry.mid).paragraphs.findIndex(p=>p.id===entry.pid);
    startExtra(entry.mid,index,entry.type,entry);
  }
});
document.addEventListener('submit',event=>{
  event.preventDefault();
  if(event.target.id==='answer-form') saveAnswer();
  if(event.target.id==='self-form') saveSelfCheck(event.target);
  if(event.target.id==='material-form') saveMaterial(event.target);
  if(event.target.id==='mark-form') saveMark(event.target);
});
document.addEventListener('input',event=>{
  if(!['answer','answer-link'].includes(event.target.id))return;
  const {id}=activity();
  activeDraft={id,answer:main.querySelector('#answer').value,link:main.querySelector('#answer-link').value};
  persist('drafts',id,{answer:activeDraft.answer,link:activeDraft.link},false);
  clearTimeout(draftTimer);
  draftTimer=setTimeout(saveDraft,800);
});
document.addEventListener('change',async event=>{
  const el=event.target;
  if(el.id==='language-filter'){languageFilter=el.value;render();document.querySelector('#language-filter').focus();}
  if(el.id==='topic-filter'){topicFilter=el.value;render();document.querySelector('#topic-filter').focus();}
  if(el.dataset.paragraphTask&&el.value) startExtra(el.dataset.paragraphTask,Number(el.dataset.index),el.value);
  if(el.id==='text-file'&&el.files[0]){
    const file=el.files[0];
    if(file.size>64000){toast('请选择小于 64 KB 的文本文件。');return;}
    try {
      const text=await file.text();
      if(text.length>16000){toast('文件超过 16000 字，请拆成多篇导入。');return;}
      el.form.elements.text.value=text;
      if(!el.form.elements.title.value)el.form.elements.title.value=file.name.replace(/\.[^.]+$/,'').slice(0,100);
    } catch {toast('文件读取失败，请尝试粘贴文本。');}
  }
});
window.addEventListener('hashchange',()=>{
  if(route()[0]!=='exercise')taskOverride=null;
  reviewQueue=null;resetStep();render();main.focus();
});
window.addEventListener('online',hydrate);
window.addEventListener('focus',()=>{if(Object.keys(pending).length)void sync();});
render();
void hydrate();
void checkConnection();
