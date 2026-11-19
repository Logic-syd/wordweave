export function sentenceUnits(text,lang='en') {
  const clean=text.replace(/\r\n?/g,'\n').trim();
  if(!clean)return [];
  if(globalThis.Intl?.Segmenter)return [...new Intl.Segmenter(lang,{granularity:'sentence'}).segment(clean)].map(x=>x.segment.trim()).filter(Boolean);
  return clean.match(/[^.!?。！？]+(?:[.!?。！？]+(?:["”’']+)?|$)/gu)?.map(x=>x.trim()).filter(Boolean)??[clean];
}
export function groupUnits(units,groups) {
  let next=0;
  if(!Array.isArray(groups)||!groups.length)throw Error('分段结果不完整，请重试。');
  const result=groups.map(g=>{
    if(!Number.isInteger(g.start)||!Number.isInteger(g.end)||g.start!==next||g.end<g.start||g.end>=units.length)throw Error('分段未完整对应原文，请重试。');
    next=g.end+1;return units.slice(g.start,next).join(' ');
  });
  if(next!==units.length)throw Error('分段遗漏了原文，请重试。');
  return result;
}
export function pastedSource(text) {
  const markdown=text.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);
  const raw=text.trim().match(/^https?:\/\/\S+$/);
  return markdown?{title:markdown[1],url:markdown[2]}:raw?{title:'',url:raw[0]}:null;
}
