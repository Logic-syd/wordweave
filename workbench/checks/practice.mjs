import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {gradeDictation,pointCounts,isAiGrade} from '../web/assessment.js';
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
const settings={LLM_API_KEY:'test-placeholder',LLM_BASE_URL:'https://model.example/v1',LLM_MODEL:'test-configured-model'};
const runtime = overrides=>({DB:database(),...settings,...overrides});
const result = value=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]});

test('a checked answer is cached across retries, isolated per learner, and retained through history reload', async t=>{
  const env=runtime();
  let calls=0;
  t.mock.method(globalThis,'fetch',async (url,opts)=>{
    assert.equal(url,settings.LLM_BASE_URL+'/chat/completions');
    assert.equal(opts.headers.Authorization,'Bearer '+settings.LLM_API_KEY);
    assert.equal(opts.redirect,'error');
    const body=JSON.parse(opts.body);
    assert.equal(body.model,settings.LLM_MODEL);
    assert.deepEqual(body.response_format,{type:'json_object'});
    assert.equal(body.thinking,undefined);
    assert.equal(body.messages[0].role,'system');
    assert.match(body.messages[0].content,/JSON/);
    assert.equal(body.messages[1].role,'user');
    assert.equal(JSON.parse(body.messages[1].content).mediaLink,undefined);
    assert.equal(opts.body.includes(settings.LLM_API_KEY),false);
    calls++;return result(grade);
  });
  const unauthed=await call(env,'ai/grade',payload,{'oai-authenticated-user-id':''});
  assert.equal(unauthed.status,401);
  assert.equal((await call(env,'ai/grade',payload,{Origin:'https://unrelated.example'})).status,403);
  assert.equal(calls,0);
  const first=await (await call(env,'ai/grade',{...payload,mediaLink:'https://example.org/recording'})).json();
  assert.equal(first.method,'ai');
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
  const env=runtime();
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

test('configuration is complete, server-only, and rejects unsafe API destinations',async t=>{
  const fetch=t.mock.method(globalThis,'fetch',()=>{throw Error('No provider call expected');});
  assert.deepEqual(await (await call(runtime(),'ai/status')).json(),{configured:true});
  for(const overrides of [
    {LLM_API_KEY:''},{LLM_BASE_URL:''},{LLM_MODEL:''},
    {LLM_BASE_URL:'http://public.example/v1'},
    {LLM_BASE_URL:'https://user:secret@model.example/v1'},
    {LLM_BASE_URL:'https://model.example/v1?key=secret'},
    {LLM_BASE_URL:'https://model.example/v1#secret'},
    {LLM_THINKING:'unknown'},{LLM_MAX_OUTPUT_TOKENS:'NaN'}
  ]) {
    const env=runtime(overrides);
    assert.deepEqual(await (await call(env,'ai/status')).json(),{configured:false});
    const response=await call(env,'ai/grade',payload);
    assert.equal(response.status,503);
    const body=await response.json();
    assert.equal(body.code,'not_configured');
    assert.equal(JSON.stringify(body).includes(settings.LLM_API_KEY),false);
  }
  assert.equal(fetch.mock.callCount(),0);
});

test('the configured provider, model and thinking settings control requests and cache reuse',async t=>{
  const env=runtime({LLM_BASE_URL:'https://api.deepseek.com/v1/'});
  const requests=[];
  t.mock.method(globalThis,'fetch',async (url,options)=>{
    requests.push({url,body:JSON.parse(options.body)});return result(grade);
  });
  assert.equal((await call(env,'ai/grade',payload)).status,200);
  assert.deepEqual(requests[0].body.thinking,{type:'disabled'});
  assert.equal(requests[0].url,'https://api.deepseek.com/v1/chat/completions');
  await call(env,'ai/grade',payload);
  assert.equal(requests.length,1);
  await call({...env,LLM_BASE_URL:'https://other.example/api'},'ai/grade',payload);
  assert.equal(requests.length,2);
  assert.equal(requests[1].body.thinking,undefined);
  await call({...env,LLM_MODEL:'another-model'},'ai/grade',payload);
  assert.equal(requests.length,3);
  await call({...env,LLM_THINKING:'enabled',LLM_MAX_OUTPUT_TOKENS:'512'},'ai/grade',payload);
  assert.deepEqual(requests[3].body.thinking,{type:'enabled'});
  assert.equal(requests[3].body.max_tokens,512);
});

test('duplicate in-flight requests share a lease and do not spend twice',async t=>{
  const env=runtime();
  const started=Promise.withResolvers(), finish=Promise.withResolvers();
  let calls=0;
  t.mock.method(globalThis,'fetch',async ()=>{calls++;started.resolve();await finish.promise;return result(grade);});
  const first=call(env,'ai/grade',payload);
  await started.promise;
  try {
    const second=await call(env,'ai/grade',payload);
    assert.equal(second.status,409);
    assert.equal((await second.json()).code,'in_progress');
    assert.equal(calls,1);
  } finally {finish.resolve();}
  assert.equal((await first).status,200);
  assert.equal((await call(env,'ai/grade',payload)).status,200);
  assert.equal(calls,1);
});

test('invalid, truncated, oversized and failed responses release the lease for a manual retry',async t=>{
  const env=runtime({LLM_MAX_RESPONSE_BYTES:'16384'});
  const responses=[
    new Response('rate limited',{status:429}),
    new Response('bad credentials',{status:401}),
    new Response('no balance',{status:402}),
    new Response('not json'),
    Response.json({choices:[{finish_reason:'length',message:{content:'{}'}}]}),
    result({points:[]}),
    result({...grade,correction:'x'.repeat(20000)}),
    result(grade)
  ];
  t.mock.method(globalThis,'fetch',async ()=>responses.shift());
  for(const status of [429,502,429,502,502,502,502,200]) {
    assert.equal((await call(env,'ai/grade',payload)).status,status);
  }
  assert.equal(responses.length,0);
});

test('unconfigured demos remain available and old AI grades remain recognized',async ()=>{
  const env=runtime({LLM_API_KEY:''});
  const page=await worker.fetch(new Request(origin),env);
  assert.equal(page.status,200);
  assert.match(await page.text(),/语境听说工作台/);
  assert.equal((await call(env,'study')).status,200);
  assert.equal(isAiGrade({method:'openai'}),true);
  assert.equal(isAiGrade({method:'ai'}),true);
  assert.equal(isAiGrade({method:'self'}),false);
  assert.equal(isAiGrade(undefined),false);
});
