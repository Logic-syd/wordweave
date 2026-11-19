const articleHosts=new Set(['www.theguardian.com','theguardian.com','cupofjo.com','www.cupofjo.com']);
function articleUrl(value){
  try {const u=new URL(value);return u.protocol==='https:'&&articleHosts.has(u.hostname)&&!u.port&&!u.username&&!u.password?u:null;}catch{return null;}
}
function decodeHtml(s){
  const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“',ndash:'–',mdash:'—',hellip:'…'};
  return s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi,(all,key)=>{
    if(key[0]==='#'){const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):parseInt(key.slice(1),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):all;}
    return entities[key]??all;
  });
}
export function extractArticle(html){
  let title=decodeHtml((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]??'').replace(/<[^>]+>/g,''));
  title=title.replace(/\s*[|–]\s*(The Guardian|Cup of Jo).*$/i,'').trim();
  // Use only the visible article container, never hidden subscription data.
  const clean=html.replace(/<(script|style|noscript|aside|nav|footer)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
  const start=/<(div|section)\b[^>]*(?:id=["']article-body[^"']*["']|class=["'][^"']*(?:article-body-viewer|entry-content)[^"']*["'])[^>]*>/i.exec(clean);
  if(!start)return null;
  let depth=1,end=start.index+start[0].length;
  const tags=new RegExp('<\\/?'+start[1]+'\\b[^>]*>','gi');tags.lastIndex=end;
  for(let t;(t=tags.exec(clean));){depth+=t[0][1]==='/'?-1:1;if(depth===0){end=t.index;break;}}
  if(depth!==0)return null;
  const body=clean.slice(start.index+start[0].length,end);
  const paragraphs=[...body.matchAll(/<(p|h2|h3)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(m=>decodeHtml(m[2].replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]+>/g,'')).trim()).filter(Boolean);
  const text=paragraphs.join('\n\n');
  return text.length>=120&&text.length<=16000?{title:title.slice(0,100),text}:null;
}
export async function handleImport(request){
  if(request.method!=='POST')return Response.json({}, {status:405});
  if(request.headers.get('Origin')!==new URL(request.url).origin)return Response.json({}, {status:403});
  try{
    const raw=await request.text();if(raw.length>4000)return Response.json({}, {status:413});
    const url=articleUrl(JSON.parse(raw).url);
    if(!url)return Response.json({error:'目前支持 Guardian 和 Cup of Jo 的公开文章；其他来源可粘贴正文或导入文本文件。'}, {status:400});
    const res=await fetch(url.href,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{Accept:'text/html'}});
    if(!res.ok||!res.headers.get('content-type')?.includes('text/html'))throw Error();
    const reader=res.body.getReader();let size=0,html='';const decoder=new TextDecoder();
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2000000)throw Error();html+=decoder.decode(value,{stream:true});}}finally{await reader.cancel();}
    html+=decoder.decode();
    const article=extractArticle(html);if(!article)throw Error();
    return Response.json({...article,url:url.href},{headers:{'Cache-Control':'no-store'}});
  }catch{return Response.json({error:'没能提取这篇文章。可以打开原文，复制正文后粘贴；付费或登录内容请手动处理。'}, {status:422});}
}
