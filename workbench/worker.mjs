const kinds = new Set(['materials','marks','history','drafts','sessions']);
const response = (body, status=200) => Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const asset = assets[url.pathname];
    if (asset && request.method === 'GET') return new Response(asset[0],{headers:{
      'Content-Type':asset[1]+'; charset=utf-8',
      'Cache-Control':'no-cache',
      'X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'"
    }});
    const aiRoute = url.pathname.match(/^\/api\/ai\/(status|grade|material)$/);
    if (url.pathname !== '/api/study' && !aiRoute) return response({},404);
    const owner = request.headers.get('oai-authenticated-user-id');
    if (!owner) return response({error:'请登录后同步'},401);
    try {
      if (aiRoute) return await handleAi(request,env,owner,aiRoute[1]);
      if (request.method === 'GET') {
        const {results} = await env.DB.prepare('SELECT kind,id,value FROM study_items WHERE owner=? AND kind!=?').bind(owner,'ai_cache').all();
        return response(results.map(row=>({...row,value:JSON.parse(row.value)})));
      }
      if (request.method !== 'POST') return response({},405);
      if (request.headers.get('Origin') !== url.origin) return response({},403);
      const raw = await request.text();
      if (raw.length > 95000) return response({},413);
      const {kind,id,value} = JSON.parse(raw);
      if (!kinds.has(kind) || typeof id !== 'string' || !id || id.length > 180 ||
          !value || typeof value !== 'object' || Array.isArray(value)) return response({},400);
      await env.DB.prepare('INSERT INTO study_items(owner,kind,id,value) VALUES(?,?,?,?) ON CONFLICT(owner,kind,id) DO UPDATE SET value=excluded.value')
        .bind(owner,kind,id,JSON.stringify(value)).run();
      return response({saved:true});
    } catch (error) {
      console.error('Wordweave storage request failed', error.message);
      return response({error:'暂时无法同步'},503);
    }
  }
};
