import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
const files = {'/':['index.html','text/html'], '/app.css':['app.css','text/css'], '/app.js':['app.js','text/javascript'], '/content.js':['content.js','text/javascript'], '/assessment.js':['assessment.js','text/javascript']};
const assets = Object.fromEntries(Object.entries(files).map(([path,[file,type]]) => [path,[readFileSync('web/'+file,'utf8'),type]]));
mkdirSync('dist/server',{recursive:true});
writeFileSync('dist/server/index.js', 'const assets = '+JSON.stringify(assets)+';\n'+readFileSync('server/ai.mjs','utf8')+'\n'+readFileSync('worker.mjs','utf8'));
