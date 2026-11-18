import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {gradeDictation,pointCounts} from '../web/assessment.js';
import '../build.mjs';
const {default:worker}=await import('../dist/server/index.js');

test('dictation accepts case, punctuation and typographic apostrophes; extra words reduce the score',()=>{
  assert.equal(gradeDictation("I’ll check, then go.","i'll check then GO!").score,100);
  const g=gradeDictation('I check the page','I only test the page');
  assert.equal(g.score,50); assert.equal(g.extra,1); assert.equal(g.substitutions,1);
  assert.equal(g.correct,3);
  const de=gradeDictation('Ich hätte gern Käsekuchen.','Ich hätte gern');
  assert.equal(de.score,75); assert.deepEqual(de.differences,[{expected:'Käsekuchen',actual:''}]);
  assert.deepEqual(pointCounts([{status:'met'},{status:'partial'},{status:'missed'}]),{met:1,partial:1,total:3});
});

function database() {
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../drizzle/0000_study.sql', import.meta.url),'utf8'));
  return {prepare(sql){const s=db.prepare(sql);return {bind(...args){return {
    all:()=>({results:s.all(...args)}), first:()=>s.get(...args)??null, run:()=>s.run(...args)
  };}};}};
}
const origin='https://workbench.example';
function call(runtime,action,data,extra={}) {
  const method=data?'POST':'GET';
  return worker.fetch(new Request(origin+'/api/'+action,{method,
    headers:{Origin:origin,'oai-authenticated-user-id':'learner-a','Content-Type':'application/json',...extra},
    body:data?JSON.stringify(data):undefined
  }),runtime);
}
const payload={type:'listen',lang:'en',source:'Only the form changes.',question:'',answer:'Everything except the form stays as it was.'};
const grade={points:[{label:'改动范围',status:'met',explanation:'准确表达了只有表单会变。'}],correction:'',example:'Only the form changes.',review:[]};
const result = value=>Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});

test('a checked answer is cached across retries, isolated per learner, and retained through history reload', async t=>{
  const env={DB:database(),OPENAI_API_KEY:'test-placeholder'};
  let calls=0;
  t.mock.method(globalThis,'fetch',async (url,opts)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');
    const body=JSON.parse(opts.body);
    assert.equal(body.store,false);
    assert.equal(JSON.parse(body.input).mediaLink,undefined);
    calls++;return result(grade);
  });
  const unauthed=await call(env,'ai/grade',payload,{'oai-authenticated-user-id':''});
  assert.equal(unauthed.status,401);
  assert.equal((await call(env,'ai/grade',payload,{Origin:'https://unrelated.example'})).status,403);
  assert.equal(calls,0);
  const first=await (await call(env,'ai/grade',{...payload,mediaLink:'https://example.org/recording'})).json();
  assert.equal(first.method,'openai');
  const repeated=await (await call(env,'ai/grade',payload)).json();
  assert.deepEqual(first,repeated); assert.equal(calls,1);
  const record={id:'attempt',answer:payload.answer,reference:{source:payload.source},grade:first};
  assert.equal((await call(env,'study',{kind:'history',id:'attempt',value:record})).status,200);
  const history=await (await call(env,'study')).json();
  assert.equal(history.length,1);assert.deepEqual(history[0].value,record);
  assert.deepEqual(await (await call(env,'study',null,{'oai-authenticated-user-id':'learner-b'})).json(),[]);
  await call(env,'ai/grade',payload,{'oai-authenticated-user-id':'learner-b'});
  assert.equal(calls,2);
});

test('failed requests can retry and reordered translations cannot be applied to the wrong paragraph',async t=>{
  const env={DB:database(),OPENAI_API_KEY:'test-placeholder'};
  const input={lang:'de',level:'A1',paragraphs:['Ein Kaffee, bitte.','Danke!']};
  const paragraphs=input.paragraphs.map((_,index)=>({index,zh:index?'谢谢。':'请来一杯咖啡。',question:'Was sagt die Person?',answerGuide:'回答这一段。',oral:'Was sagst du?',points:['听懂这句话。']}));
  let callNumber=0;
  t.mock.method(globalThis,'fetch',async ()=>{
    callNumber++;
    if(callNumber===1)return Response.json({error:{code:'insufficient_quota'}},{status:429});
    return result({paragraphs:callNumber===2?[...paragraphs].reverse():paragraphs});
  });
  assert.equal((await call(env,'ai/material',input)).status,429);
  assert.equal((await call(env,'ai/material',input)).status,502);
  const ok=await call(env,'ai/material',input);
  assert.equal(ok.status,200);assert.deepEqual((await ok.json()).paragraphs,paragraphs);
});
