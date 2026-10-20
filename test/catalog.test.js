const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const E=require('../engine');
test('catalog discovers deployed snapshots, schema-driven Data APIs, collisions and persistence',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mes-catalog-'));let child,base;
 // An existing v0.2 user's state must migrate without losing the draft.
 fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify({draft:{...E.defaults,rowLimit:50000},revision:4,versions:[{version:1,workflow:E.defaults,targets:{api:true,mcp:true},mode:'sync',deployedAt:new Date().toISOString()}],active:1,runs:[],jobs:{},agent:{name:'existing-agent',prompt:'keep this'}}));
 async function start(){child=spawn(process.execPath,[path.join(__dirname,'../server.js')],{env:{...process.env,PORT:'0',MES_DATA_DIR:dir}});base=await new Promise((resolve,reject)=>{child.stdout.on('data',b=>{const m=b.toString().match(/http:\/\/127\.0\.0\.1:\d+/);if(m)resolve(m[0])});child.once('error',reject);child.once('exit',c=>reject(Error('Server exit '+c)))})}
 async function stop(){const p=new Promise(r=>child.once('exit',r));child.kill();await p}
 async function req(url,method='GET',data){const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});return {status:r.status,data:await r.json()}}
 try{await start();let catalog=(await req('/api/catalog')).data.tools;
 assert.equal(catalog.length,5);assert.equal(catalog.find(t=>t.id==='data:wafer_yield_summary').inputSchema.required.length,1);
 const state=(await req('/api/state')).data;assert.equal(state.revision,4);assert.equal(state.draft.rowLimit,50000);assert.equal(state.agent.name,'existing-agent');const saved=(await req('/api/draft','PUT',{revision:state.revision,workflow:{...state.draft,threshold:.93}})).data;
 const deploy={revision:saved.revision,targets:{api:true,mcp:true},mode:'sync',apiId:'strict_yield',toolName:'get_strict_yield',description:'평균 수율 93% 미만 장비'};
 assert.equal((await req('/api/deploy','POST',deploy)).status,200);
 catalog=(await req('/api/catalog')).data.tools;assert.equal(catalog.filter(t=>t.kind==='workflow').length,2);assert.equal(catalog.find(t=>t.name==='get_strict_yield').version,2);
 assert.equal((await req('/api/workflow/strict_yield','POST',E.defaultInput)).data.rows.length,1);assert.equal((await req('/api/workflow/lot_yield_equip','POST',E.defaultInput)).data.rows.length,4);
 const mcp=(await req('/mcp','POST',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'get_strict_yield',arguments:E.defaultInput}})).data;
 assert.equal(JSON.parse(mcp.result.content[0].text).rows.length,1);
 assert.equal((await req('/api/data/wafer_yield_summary','POST',{lot_id:'LOT-1199',wafer_id:'W001'})).data.rows.length,1);
 assert.equal((await req('/api/data/wafer_yield_summary','POST',{})).status,400);
 assert.equal((await req('/api/data/lot_process_history','POST',{...E.defaultInput,wafer_id:'W001'})).data.rows.length,3);
 assert.equal((await req('/api/deploy','POST',{...deploy,apiId:'other_yield'})).status,400);
 await req('/api/deploy','POST',{...deploy,toolName:'get_strict_yield_v2',targets:{api:true,mcp:false}});
 catalog=(await req('/api/catalog')).data.tools;assert.equal(catalog.find(t=>t.id==='workflow:strict_yield').transports.join(','),'rest');
 assert.ok((await req('/api/openapi.json')).data.paths['/api/workflow/strict_yield']);
 await stop();await start();assert.equal((await req('/api/catalog')).data.tools.filter(t=>t.kind==='workflow').length,2);
 }finally{if(child?.exitCode===null)await stop();fs.rmSync(dir,{recursive:true,force:true})}
});
