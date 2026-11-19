import {groupUnits} from './learning.js';
import {importLinks,isLinkInput,pasteArticleParts} from './readalong-import.js';
const $=id=>document.getElementById(id), synth=window.speechSynthesis;
let sourceUrl='',prepared=null,busy=false;
let centerFrame=0;
const vocabularyPending=new Set();
let hiddenArticles=new Set();try{hiddenArticles=new Set(JSON.parse(localStorage.getItem('readalong.hidden')||'[]'))}catch{}
let articles=[], current=null, sentences=[], index=0, playing=false, timer=null, token=0, voices=[], utterance=null;
try{articles=JSON.parse(localStorage.getItem('readalong.articles')||'[]');if(!Array.isArray(articles))articles=[]}catch{}
function save(){try{localStorage.setItem('readalong.articles',JSON.stringify(articles))}catch{$('status').textContent='存储空间不足，请导出备份。'}}
function split(text){return text.replace(/\*{1,2}([^*\n]+)\*{1,2}/g,'$1').split(/\n+/).flatMap(p=>{if(Intl.Segmenter)return [...new Intl.Segmenter('en',{granularity:'sentence'}).segment(p)].map(s=>s.segment.trim());return p.match(/[^.!?]+[.!?]+["”’']*|[^.!?]+$/g)||[]}).map(s=>s.trim()).filter(s=>/[\p{L}\p{N}]/u.test(s))}
function stop(){playing=false;token++;clearTimeout(timer);if(synth)synth.cancel();$('play').textContent='开始跟读'}
function render(){
  const root=$('sentences');root.replaceChildren();
  const remaining=new Set((current?.vocabulary||[]).slice(0,5).filter(t=>typeof t?.text==='string'&&t.text&&typeof t.meaning==='string'));
  sentences.forEach((s,i)=>{
    const row=document.createElement('div');row.className='sentence';
    const n=document.createElement('span');n.className='sentence-number';n.textContent=String(i+1).padStart(2,'0');
    const content=document.createElement('span');content.className='sentence-content';
    let cursor=0;const matches=[];
    for(const term of remaining){let at=s.indexOf(term.text);while(at>=0){const before=s[at-1]||'',after=s[at+term.text.length]||'';if(!/[\p{L}\p{N}]/u.test(before)&&!/[\p{L}\p{N}]/u.test(after)){matches.push({at,term});break}at=s.indexOf(term.text,at+1)}}
    matches.sort((a,b)=>a.at-b.at||b.term.text.length-a.term.text.length);
    for(const {at,term} of matches){if(at<cursor)continue;content.append(document.createTextNode(s.slice(cursor,at)));const wrap=document.createElement('span'),button=document.createElement('button'),meaning=document.createElement('span');wrap.className='term-wrap';wrap.onclick=e=>e.stopPropagation();button.className='gloss-term';button.textContent=term.text;button.type='button';button.setAttribute('aria-expanded','false');meaning.className='term-meaning';meaning.id='meaning-'+i+'-'+at;meaning.textContent=term.meaning;meaning.hidden=true;button.setAttribute('aria-controls',meaning.id);button.onclick=e=>{e.stopPropagation();const open=meaning.hidden;root.querySelectorAll('.term-meaning').forEach(x=>x.hidden=true);root.querySelectorAll('.gloss-term').forEach(x=>x.setAttribute('aria-expanded','false'));meaning.hidden=!open;button.setAttribute('aria-expanded',String(open))};wrap.append(button,meaning);content.append(wrap);cursor=at+term.text.length;remaining.delete(term)}
    content.append(document.createTextNode(s.slice(cursor)));
    const play=document.createElement('button');play.className='sentence-trigger';play.textContent='播放';play.setAttribute('aria-label','播放第 '+(i+1)+' 句');row.append(n,content,play);row.onclick=()=>{stop();index=i;highlight();start()};root.append(row);
  });
  $('count').textContent=sentences.length+' 句';updateVocabularyStatus();highlight();
}
function updateVocabularyStatus(message){
  const pending=current&&vocabularyPending.has(current.id),count=current?.vocabulary?.length||0;
  $('vocabulary').disabled=!current||pending||count>0;
  $('vocabulary').textContent=pending?'正在精选…':count?'已标注 '+count+' 个重点词':'AI 标注重点词';
  $('vocabulary-status').textContent=message||(count?'点击原文标记看中文释义':'每篇 3–5 个 · 点击原文标记看释义');
}
// Scroll only the article pane; never move the surrounding page or controls.
function centerCurrentSentence(){
  cancelAnimationFrame(centerFrame);
  centerFrame=requestAnimationFrame(()=>{
    const root=$('sentences'),row=root.children[index];
    if(!row||!sentences.length)return;
    const pane=root.getBoundingClientRect(),sentence=row.getBoundingClientRect();
    const toolbar=document.querySelector('.practice-toolbar').getBoundingClientRect();
    const top=Math.max(pane.top+root.clientTop,toolbar.bottom,0);
    const bottom=Math.min(pane.top+root.clientTop+root.clientHeight,window.innerHeight);
    if(bottom<=top)return;
    // Oversized sentences start at the top; first/last sentences stop at the boundaries.
    const offset=sentence.height>bottom-top?sentence.top-top:(sentence.top+sentence.bottom-top-bottom)/2;
    const target=Math.max(0,Math.min(root.scrollHeight-root.clientHeight,root.scrollTop+offset));
    root.scrollTo({top:target,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  });
}
function highlight(){
  [...$('sentences').children].forEach((b,i)=>b.classList.toggle('active',i===index));
  $('progress').max=sentences.length||1;$('progress').value=index;
  if(current){current.index=index;save()}
  centerCurrentSentence();
}
function library(){let root=$('library');root.replaceChildren();if(!articles.length){root.textContent='保存的文章会出现在这里。';return}articles.forEach(a=>{let row=document.createElement('div');row.className='library-row';let open=document.createElement('button');open.textContent=a.title;open.onclick=()=>load(a);let del=document.createElement('button');del.textContent='×';del.setAttribute('aria-label','删除 '+a.title);del.onclick=()=>{if(!confirm('删除这篇文章？'))return;hiddenArticles.add(a.id);try{localStorage.setItem('readalong.hidden',JSON.stringify([...hiddenArticles]))}catch{}articles=articles.filter(x=>x.id!==a.id);if(current?.id===a.id){stop();current=null;$('status').textContent='文章已从收藏删除。'}save();library()};row.append(open,del);root.append(row)})}
function load(a){stop();$('import-status').textContent='';$('ai-status').textContent='';current=a;$('title').value=a.title;$('text').value=a.text;sourceUrl=a.source||'';prepared=a.help?{text:a.text,paragraphs:a.help}:null;showHelp(a.help);refreshLinks();sentences=split(a.text);index=Math.min(a.index||0,Math.max(0,sentences.length-1));$('practiceTitle').textContent=a.title;render();$('status').textContent='已准备好，点击开始跟读。'}
function start(){if(!sentences.length){$('status').textContent='请先粘贴文章并生成练习。';return}if(!synth||!voices.length){$('status').textContent='没有可用英语声音，请在设备设置中安装英语语音，或更换浏览器。';return}playing=true;$('play').textContent='停止 / 休息';speak(token)}
function speak(run){if(!playing||run!==token)return;highlight();utterance=new SpeechSynthesisUtterance(sentences[index]);utterance.voice=voices.find(v=>v.voiceURI===$('voice').value)||voices[0];utterance.lang=utterance.voice.lang;utterance.rate=Number($('rate').value);let startTime=performance.now();$('status').textContent=`正在听 · 第 ${index+1} / ${sentences.length} 句`;utterance.onend=()=>{if(!playing||run!==token)return;const mode=$('mode').value;const gap=mode==='listen'?350:Math.max(2000,(performance.now()-startTime)*Number($('gap').value));$('status').textContent=mode==='listen'?'准备下一句…':'轮到你了 · 跟着说一遍';timer=setTimeout(()=>{if(run!==token||!playing)return;if(mode!=='loop')index++;if(index>=sentences.length){index=0;stop();$('progress').value=sentences.length;$('status').textContent='这一篇练完了。再读一轮，或换一篇。';if(current){current.index=0;save()}return}speak(run)},gap)};utterance.onerror=e=>{if(run!==token)return;stop();$('status').textContent='朗读未完成，请重试或切换声音。'};synth.speak(utterance)}
function getVoices(){if(!synth){$('status').textContent='此浏览器不支持朗读，请使用支持语音合成的浏览器。';return}const old=$('voice').value;voices=synth.getVoices().filter(v=>/^en([_-]|$)/i.test(v.lang));$('voice').replaceChildren();voices.forEach(v=>{let o=document.createElement('option');o.value=v.voiceURI;o.textContent=v.name+' · '+v.lang;$('voice').append(o)});if(voices.some(v=>v.voiceURI===old))$('voice').value=old;if(!voices.length){let o=document.createElement('option');o.textContent='暂无英语声音';$('voice').append(o)}}
function generate(){let text=$('text').value.trim();if(!text){$('status').textContent='请先粘贴英文正文。';$('text').focus();return}let title=$('title').value.trim()||'未命名文章 · '+new Date().toLocaleDateString();let a={id:current?.id||Date.now().toString(),title,text,index:0,source:sourceUrl,help:prepared?.text===text?prepared.paragraphs:null,vocabulary:current?.text===text?current.vocabulary:null};articles=articles.filter(x=>x.id!==a.id);articles.unshift(a);save();library();load(a)};
$('play').onclick=()=>{if(playing){stop();$('status').textContent='已停止，再次开始将重读当前句。'}else start()};
for(const [id,delta] of [['prev',-1],['next',1]])$(id).onclick=()=>{stop();if(!sentences.length)return;index=Math.max(0,Math.min(sentences.length-1,index+delta));highlight();$('status').textContent=`已选择第 ${index+1} 句`};
for(const id of ['voice','rate','mode','gap'])$(id).onchange=()=>{if(playing){stop();start()}};
$('new').onclick=()=>{stop();current=null;sentences=[];index=0;$('title').value='';$('text').value='';sourceUrl='';prepared=null;showHelp(null);refreshLinks();$('import-status').textContent='';$('ai-status').textContent='';$('practiceTitle').textContent='新的一篇';render();$('status').textContent='粘贴正文，开始新的练习。';$('text').focus()};
$('demo').onclick=()=>{current=null;$('title').value='A small pause in the day';$('text').value="I stopped by a small coffee shop on my way home. The barista asked how my day was going, and we ended up chatting about the neighbourhood.\nI had been staring at a screen all afternoon, so it felt good to slow down for a moment. I ordered a flat white and found a seat by the window.\nSometimes a short conversation is all it takes to make an ordinary day feel a little different.";$('generate').click()};
$('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(articles,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='read-along-articles.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
window.addEventListener('beforeunload',()=>{if(synth)synth.cancel()});getVoices();if(synth)synth.addEventListener('voiceschanged',getVoices);library();if(articles.length)load(articles[0]);

function showHelp(paragraphs){
  const root=$('article-help-body');root.replaceChildren();$('article-help').hidden=!paragraphs?.length;
  for(const p of paragraphs||[]){
    const section=document.createElement('section');section.className='help-paragraph';
    const translation=document.createElement('p');translation.textContent=p.zh;section.append(translation);
    root.append(section);
  }
}
function refreshLinks(){
  const raw=$('text').value,links=isLinkInput(raw)?importLinks(raw):[];
  $('link-choice').hidden=links.length<2;
  const choice=$('source-choice'),previous=choice.value;choice.replaceChildren();
  for(const link of links){const option=document.createElement('option');option.value=link.url;option.textContent=link.title;choice.append(option)}
  if(links.some(l=>l.url===previous))choice.value=previous;
  $('fetch-source').hidden=!links.length;
  return links;
}
function setBusy(value){
  busy=value;
  for(const id of ['generate','fetch-source','ai-segment','ai-translate','new','text-file','text','title','source-choice'])$(id).disabled=value;
  $('library').querySelectorAll('button').forEach(b=>b.disabled=value);
}
async function requestJson(path,body){
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const value=await response.json();if(!response.ok)throw Error(value.error||'暂时无法处理，请稍后重试。');return value;
}
async function extract(){
  const links=refreshLinks();if(!links.length)return false;
  const selected=links.find(l=>l.url===$('source-choice').value)||links[0];
  const result=await requestJson('/api/import',{url:selected.url});
  current=null;sourceUrl=result.url;prepared=null;
  $('text').value=result.text;$('title').value=result.title||selected.title;refreshLinks();
  $('import-status').textContent='正文已提取，可以直接生成跟读练习。';return true;
}
$('fetch-source').onclick=async()=>{
  if(busy)return;setBusy(true);$('import-status').textContent='正在提取正文…';
  try{await extract()}catch(e){$('import-status').textContent=(e.message||'提取失败')+' 可以直接粘贴正文，原内容仍保留。'}finally{setBusy(false)}
};
$('generate').onclick=async()=>{
  if(busy)return;
  const fromLink=isLinkInput($('text').value);
  if(fromLink){
    setBusy(true);$('import-status').textContent='正在提取正文…';
    try{await extract()}catch(e){$('import-status').textContent=(e.message||'提取失败')+' 请改为粘贴正文。';return}finally{setBusy(false)}
  }
  generate();
  if(fromLink)$('import-status').textContent='正文已提取，跟读练习已生成。';
};
function acceptPaste(raw){
  if(busy)return;
  if(raw.length>16000){$('import-status').textContent='正文超过 16000 字，请拆成小篇再粘贴。';return}
  const parsed=pasteArticleParts(raw);
  stop();current=null;sourceUrl='';prepared=null;showHelp(null);$('ai-status').textContent='';
  $('text').value=parsed.text;$('title').value=parsed.title;
  const links=refreshLinks();
  $('import-status').textContent=links.length>1?'检测到多篇推荐，请选一篇再生成跟读练习。':links.length?'已识别文章链接，点击「生成跟读练习」即可提取正文。':'正文已填入，点击「生成跟读练习」。';
}
$('text').addEventListener('paste',event=>{
  const field=$('text');
  if(field.value&&!(field.selectionStart===0&&field.selectionEnd===field.value.length))return;
  let raw=event.clipboardData.getData('text/plain');
  if(!importLinks(raw).length){
    const html=event.clipboardData.getData('text/html');
    if(html){const doc=new DOMParser().parseFromString(html,'text/html');const anchors=[...doc.querySelectorAll('a[href]')].filter(a=>/^https:\/\//.test(a.getAttribute('href')));
      // A copied linked title keeps its URL even if the clipboard's plain text omits it.
      if(anchors.length===1&&raw.trim()===anchors[0].textContent.trim())raw='['+raw.trim()+']('+anchors[0].getAttribute('href')+')';
    }
  }
  if(raw){event.preventDefault();acceptPaste(raw)}
});
$('text').addEventListener('input',()=>{prepared=null;refreshLinks();$('ai-status').textContent=''});
async function readFile(file){
  if(!file||busy)return;
  if(file.size>1000000){$('import-status').textContent='文件太大，请拆成小篇再导入。';return}
  try{
    const raw=await file.text();
    if(file.name.endsWith('.json')){
      const values=JSON.parse(raw);if(!Array.isArray(values)||!values.length||values.some(a=>typeof a.title!=='string'||typeof a.text!=='string'||a.text.length>16000))throw Error('备份格式不正确');
      for(const a of values){const duplicate=articles.find(x=>x.text===a.text);if(!duplicate)articles.unshift({...a,id:crypto.randomUUID(),index:0})}
      save();library();load(articles[0]);$('import-status').textContent='文章备份已导入。';
    }else{if(raw.length>16000)throw Error('正文超过 16000 字，请拆成小篇');acceptPaste(raw);if(!$('title').value)$('title').value=file.name.replace(/\.[^.]+$/,'')}
  }catch(e){$('import-status').textContent=e.message||'文件读取失败，请粘贴正文。'}finally{$('text-file').value=''}
}
$('text-file').onchange=()=>readFile($('text-file').files[0]);
$('text').addEventListener('dragover',e=>{e.preventDefault();$('text').classList.add('drop-active')});
$('text').addEventListener('dragleave',()=>$('text').classList.remove('drop-active'));
$('text').addEventListener('drop',e=>{e.preventDefault();$('text').classList.remove('drop-active');if(e.dataTransfer.files.length)void readFile(e.dataTransfer.files[0]);else acceptPaste(e.dataTransfer.getData('text/plain'))});
async function prepare(action){
  if(busy)return;
  const raw=$('text').value.trim();if(!raw||isLinkInput(raw)){$('ai-status').textContent='请先粘贴正文，或点击「提取正文」。';return}
  const editingId=current?.id;
  setBusy(true);$('ai-status').textContent=action==='segment'?'正在整理段落…':'正在生成中文参考…';
  try{
    if(action==='segment'){
      const units=split(raw);if(units.length>160)throw Error('文章较长，请拆成两篇处理');
      const result=await requestJson('/api/ai/segment',{lang:'en',paragraphs:units});
      $('text').value=groupUnits(units,result.groups).join('\n\n');prepared=null;
      $('ai-status').textContent='分段已整理，原句保留。点击「生成跟读练习」应用。';
    }else{
      const paragraphs=raw.split(/\n\s*\n/).filter(Boolean),help=[];
      for(let i=0;i<paragraphs.length;i+=6){const result=await requestJson('/api/ai/reading',{lang:'en',paragraphs:paragraphs.slice(i,i+6)});help.push(...result.paragraphs)}
      prepared={text:raw,paragraphs:help};
      if(editingId&&current?.id===editingId&&current.text===raw){current.help=help;save();showHelp(help);$('article-help').open=true}
      $('ai-status').textContent='中文参考已准备好，可在正文下方展开。';
    }
  }catch(e){$('ai-status').textContent=(e.message||'处理失败')+' 原文仍保留，可直接跟读。'}finally{setBusy(false)}
}
$('ai-segment').onclick=()=>prepare('segment');$('ai-translate').onclick=()=>prepare('material');
refreshLinks();

// Preserve access to articles already saved in the previous workbench.
async function restoreSavedArticles(){
  try{
    const response=await fetch('/api/study');if(!response.ok)return;
    const values=await response.json();let added=false;
    for(const item of values){
      const m=item.value;if(item.kind!=='materials'||m.deleted||hiddenArticles.has(m.id)||!Array.isArray(m.paragraphs)||articles.some(a=>a.id===m.id))continue;
      const text=m.paragraphs.map(p=>p.text).join('\n\n');
      if(!text||articles.some(a=>a.text===text))continue;
      articles.push({id:m.id,title:m.title,text,source:m.source,index:0,help:m.paragraphs.some(p=>p.zh)?m.paragraphs:null});added=true;
    }
    if(added){save();library();if(!current&&!$('text').value.trim()&&!busy)load(articles[0])}
  }catch{}
}
void restoreSavedArticles();

$('vocabulary').onclick=async()=>{
  const article=current;if(!article||vocabularyPending.has(article.id)||article.vocabulary?.length)return;
  vocabularyPending.add(article.id);updateVocabularyStatus('精选整篇中的难词和实用词组…');
  try{
    const result=await requestJson('/api/ai/vocabulary',{lang:'en',paragraphs:[article.text]});
    const saved=articles.find(a=>a.id===article.id&&a.text===article.text);
    if(saved){saved.vocabulary=result.terms;save()}
    if(current===article){article.vocabulary=result.terms;render()}
  }catch(e){if(current===article)updateVocabularyStatus(e.message||'暂时无法标注，可以重试。')}
  finally{vocabularyPending.delete(article.id);if(current===article){const message=$('vocabulary-status').textContent;updateVocabularyStatus(article.vocabulary?.length?null:message)}}
};
document.addEventListener('keydown',event=>{if(event.key==='Escape'){$('sentences').querySelectorAll('.term-meaning').forEach(x=>x.hidden=true);$('sentences').querySelectorAll('.gloss-term').forEach(x=>x.setAttribute('aria-expanded','false'));document.querySelector('.playback-options').open=false}});
updateVocabularyStatus();
