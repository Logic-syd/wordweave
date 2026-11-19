export function importLinks(raw){
  const result=[];
  const labels=new Map([...raw.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g)].map(m=>[m[2],m[1].replace(/[*_]/g,'')]));
  for(const m of raw.matchAll(/https?:\/\/[^\s<>"）]+/g)){
    const value=m[0].replace(/[),.;\]。]+$/g,'');
    try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password)continue;
      if(!result.some(x=>x.url===u.href))result.push({url:u.href,title:labels.get(value)||u.hostname+u.pathname});
    }catch{}
  }
  return result;
}
export function isLinkInput(raw){
  const text=raw.trim();
  return importLinks(text).length>0 && (/^https:\/\/\S+$/.test(text)||/^\s*\[[^\]]+\]\(https:\/\/[^)]+\)\s*$/.test(text)||(/[\u3400-\u9fff]/u.test(text)&&text.replace(/https?:\/\/\S+/g,'').split(/\s+/).length<180)||/^\|.*https:\/\//m.test(text));
}
export function pasteArticleParts(raw){
  const text=raw.replace(/\r\n?/g,'\n').trim();
  if(isLinkInput(text))return {text,title:'',links:importLinks(text)};
  const lines=text.split('\n'),first=lines[0].replace(/^#{1,6}\s+/,'').trim();
  if(lines.length>1&&first.length>0&&first.length<=150&&!/[.!?。！？]$/.test(first)&&lines.slice(1).join('').length>first.length){
    return {title:first,text:lines.slice(1).join('\n').trim(),links:[]};
  }
  return {title:'',text,links:[]};
}
