function words(text) {
  return text.normalize('NFKC').replace(/[’‘]/g, "'").match(/[\p{L}\p{N}\p{M}]+(?:'[\p{L}\p{N}\p{M}]+)*/gu) || [];
}

// Word error rate uses the minimum number of substitutions, insertions and deletions.
export function gradeDictation(reference, answer) {
  const source = words(reference);
  const typed = words(answer);
  if (!source.length) return null;
  const expected = source.map(word => word.toLowerCase());
  const actual = typed.map(word => word.toLowerCase());
  const width = actual.length + 1;
  const directions = new Uint8Array((source.length + 1) * width);
  let previous = Uint16Array.from({length:width}, (_, i) => i);
  let current = new Uint16Array(width);
  for (let i = 1; i <= source.length; i++) {
    current[0] = i;
    for (let j = 1; j < width; j++) {
      const diagonal = previous[j - 1] + Number(expected[i - 1] !== actual[j - 1]);
      const deletion = previous[j] + 1;
      const insertion = current[j - 1] + 1;
      const least = Math.min(diagonal, deletion, insertion);
      current[j] = least;
      directions[i * width + j] = least === diagonal ? 0 : least === deletion ? 1 : 2;
    }
    [previous, current] = [current, previous];
  }
  const steps = [];
  let missing = 0, extra = 0, substitutions = 0;
  let i = source.length, j = typed.length;
  while (i || j) {
    const direction = !j ? 1 : !i ? 2 : directions[i * width + j];
    if (direction === 1) {
      steps.push({expected:source[--i]}); missing++;
    } else if (direction === 2) {
      steps.push({actual:typed[--j]}); extra++;
    } else {
      i--; j--;
      if (expected[i] === actual[j]) steps.push(null);
      else { steps.push({expected:source[i], actual:typed[j]}); substitutions++; }
    }
  }
  const groups = [];
  let group;
  for (const step of steps.reverse()) {
    if (!step) { group = null; continue; }
    if (!group) { group = {expected:[], actual:[]}; groups.push(group); }
    if (step.expected) group.expected.push(step.expected);
    if (step.actual) group.actual.push(step.actual);
  }
  const errors = missing + extra + substitutions;
  return {
    method:'dictation', score:Math.max(0,Math.round(100 * (1 - errors / source.length))),
    total:source.length, correct:source.length - missing - substitutions,
    missing, extra, substitutions, groupCount:groups.length,
    differences:groups.slice(0,12).map(item=>({
      expected:item.expected.join(' ').slice(0,220), actual:item.actual.join(' ').slice(0,220)
    }))
  };
}
export function pointCounts(points) {
  return {
    met:points.filter(p=>p.status==='met').length,
    partial:points.filter(p=>p.status==='partial').length,
    total:points.length
  };
}
// Keep previously saved OpenAI feedback valid after switching model providers.
export const isAiGrade = grade => ['ai','openai'].includes(grade?.method);

export function selfCheckPoints(type, source, lang, cues) {
  if (type==='oral') return ['我回应了问题里的具体情境。','我用自己的话给出了一个相关细节。'];
  if (cues?.length) return cues;
  if (type==='understand') return ['我的回答直接回应了题目。','我能在原文中指出支持答案的细节。'];
  if (typeof Intl.Segmenter==='function') {
    return Array.from(new Intl.Segmenter(lang,{granularity:'sentence'}).segment(source),x=>x.segment.trim()).filter(Boolean).slice(0,4);
  }
  return (source.match(/[^.!?。！？]+[.!?。！？]*\s*/gu) || [source]).map(x=>x.trim()).slice(0,4);
}
