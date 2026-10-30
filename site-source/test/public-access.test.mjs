import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/entry.js';
const origin='https://compass.example';
const proof='a'.repeat(64);
function bucket(){let data=null,writes=0;return {get writes(){return writes;},async get(){return data?{etag:'version-1',json:async()=>JSON.parse(data)}:null;},async put(key,value){writes++;data=value;return {etag:'version-1'};}};}
test('anonymous visitors read public pages and data without any identity header',async()=>{
 const env={BUCKET:bucket(),COMPASS_UPDATE_PROOF:proof};
 for(const url of ['/', '/api/data']){const r=await worker.fetch(new Request(origin+url),env,{});assert.equal(r.status,200);assert.equal(r.headers.get('location'),null);}
});
test('anonymous or spoofed platform headers cannot alter shared content',async()=>{
 const b=bucket();const env={BUCKET:b,COMPASS_UPDATE_PROOF:proof};
 for(const url of ['/api/curation','/api/refresh']){
  const r=await worker.fetch(new Request(origin+url,{method:'POST',headers:{'OAI-Sites-Authorization':'Bearer fake','oai-authenticated-user-id':'fake'},body:'{}'}),env,{});
  assert.equal(r.status,401);assert.equal((await r.json()).maintenanceAuthorization.proofHeader,'X-Compass-Update-Key');
 }
 assert.equal(b.writes,0);
});
test('configured maintenance proof can save and read back; foreign origin remains rejected',async()=>{
 const b=bucket();const env={BUCKET:b,COMPASS_UPDATE_PROOF:proof};
 const request=new Request(origin+'/api/curation',{method:'POST',headers:{'X-Compass-Update-Key':proof,'Content-Type':'application/json'},body:JSON.stringify({schedule:{enabled:true}})});
 const r=await worker.fetch(request,env,{});assert.equal(r.status,200);assert.equal(b.writes,1);
 const data=await (await worker.fetch(new Request(origin+'/api/data'),env,{})).json();assert.equal(data.schedule.enabled,true);
 const denied=await worker.fetch(new Request(origin+'/api/curation',{method:'POST',headers:{'X-Compass-Update-Key':proof,origin:'https://other.example'},body:'{}'}),env,{});assert.equal(denied.status,403);assert.equal(b.writes,1);
});
test('missing server secret fails closed for writes',async()=>{
 const b=bucket();const r=await worker.fetch(new Request(origin+'/api/curation',{method:'POST',headers:{'X-Compass-Update-Key':proof},body:'{}'}),{BUCKET:b},{});assert.equal(r.status,401);assert.equal(b.writes,0);
});
test('curation during refresh is rejected instead of overwriting the refreshed arrays',async()=>{
 const originalFetch=globalThis.fetch;
 let release;const gate=new Promise(resolve=>{release=resolve;});
 globalThis.fetch=async()=>{await gate;return new Response('',{status:503});};
 const b=bucket(),env={BUCKET:b,COMPASS_UPDATE_PROOF:proof};
 const headers={'X-Compass-Update-Key':proof};
 const refresh=worker.fetch(new Request(origin+'/api/refresh',{method:'POST',headers}),env,{});
 try{
  const r=await worker.fetch(new Request(origin+'/api/curation',{method:'POST',headers,body:'{"campus":[]}'}),env,{});
  assert.equal(r.status,409);assert.equal(b.writes,0);
 }finally{release();await refresh;globalThis.fetch=originalFetch;}
});
