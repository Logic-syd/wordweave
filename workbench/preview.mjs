import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,readdirSync} from 'node:fs';
import './build.mjs';

const {default:worker}=await import('./dist/server/index.js');
mkdirSync('.wordweave',{recursive:true});
const sqlite=new DatabaseSync('.wordweave/study.sqlite');
sqlite.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');
for (const name of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()) {
  if (sqlite.prepare('SELECT 1 FROM local_migrations WHERE name=?').get(name)) continue;
  sqlite.exec('BEGIN');
  try {
    sqlite.exec(readFileSync('drizzle/'+name,'utf8'));
    sqlite.prepare('INSERT INTO local_migrations(name) VALUES(?)').run(name);
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
}
const DB={prepare(sql){
  const statement=sqlite.prepare(sql);
  return {bind(...args){return {
    all:()=>({results:statement.all(...args)}),
    first:()=>statement.get(...args)??null,
    run:()=>statement.run(...args)
  };}};
}};
const flag = process.argv.indexOf('--port');
const port=Number(flag>=0?process.argv[flag+1]:process.env.PORT??3001);
const runtime={DB,OPENAI_API_KEY:process.env.OPENAI_API_KEY,OPENAI_MODEL:process.env.OPENAI_MODEL};
createServer(async (incoming,outgoing)=>{
  try {
    const headers=new Headers(incoming.headers);
    headers.set('oai-authenticated-user-id','local-preview');
    const chunks=[];
    for await(const chunk of incoming) chunks.push(chunk);
    const request=new Request('http://'+incoming.headers.host+incoming.url,{headers,method:incoming.method,body:chunks.length?Buffer.concat(chunks):undefined});
    const response=await worker.fetch(request,runtime);
    outgoing.writeHead(response.status,Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {outgoing.writeHead(500).end();}
}).listen(port,'127.0.0.1');
