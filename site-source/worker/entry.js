import seed from '../data/seed.json' with {type:'json'};
import { collect, competitionStatus } from '../lib/collector.js';
import assets from './assets.generated.js';
import {hasMaintenanceAccess, maintenanceAuthHelp} from '../lib/maintenance-auth.js';

const KEY='compass/snapshot.json';
let pending=null;
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
async function snapshotVersion(env){const obj=await env.BUCKET?.get(KEY);const data=obj?await obj.json():structuredClone(seed);data.competitions=(data.competitions||[]).map(c=>({...c,status:competitionStatus(c)}));return {data,etag:obj?.etag};}
async function snapshot(env){return (await snapshotVersion(env)).data;}
async function save(env,data,etag){const onlyIf=etag?{etagMatches:etag}:new Headers({'If-None-Match':'*'});const result=await env.BUCKET.put(KEY,JSON.stringify(data),{onlyIf,httpMetadata:{contentType:'application/json'}});if(result===null){const e=new Error('内容已被另一次更新修改，请读取最新快照后重试');e.status=409;throw e;}}
async function update(env){
  if(!env.BUCKET)throw new Error('云端存储尚未连接');
  const {data:previous,etag}=await snapshotVersion(env);const data=await collect(previous,seed);
  await save(env,data,etag);
  return data;
}
export default {
  async fetch(request,env,ctx){
    const path=new URL(request.url).pathname;
    try{
      if(request.method==='POST' && path.startsWith('/api/') && !hasMaintenanceAccess(request,env))return json(maintenanceAuthHelp,401);
      if(path==='/api/data' && request.method==='GET'){const data=await snapshot(env);return json({...data,refreshing:!!pending,storageReady:!!env.BUCKET});}
      if(path==='/api/health')return json({ok:true,storage:!!env.BUCKET,version:'1.0.0'});
      if(path==='/api/refresh'){
        if(request.method!=='POST')return json({error:'请使用 POST'},405);
        const origin=request.headers.get('origin');
        if(origin && origin!==new URL(request.url).origin)return json({error:'来源不受支持'},403);
        // Shared writes require the maintenance proof even when the Site is public.
        if(!pending)pending=update(env).finally(()=>{pending=null;});
        const data=await pending;
        return json({ok:true,updatedAt:data.updatedAt,health:data.health});
      }
      if(path==='/api/curation'){
        if(request.method!=='POST')return json({error:'请使用 POST'},405);
        const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'来源不受支持'},403);
        if(!env.BUCKET)return json({error:'存储未连接'},503);
        const raw=await request.text();if(raw.length>1000000)return json({error:'内容过大'},413);
        if(pending)return json({error:'刷新正在进行，请等待完成并重新读取 /api/data 后再提交策展'},409);
        const body=JSON.parse(raw);const {data,etag}=await snapshotVersion(env);
        for(const key of ['campus','projects','competitions','frontier']){
          if(!body[key])continue;
          if(!Array.isArray(body[key])||body[key].length>(key==='campus'?400:100))return json({error:'条目数量不正确'},400);
          for(const item of body[key]){
            if(!item.id||!item.url||!/^https?:\/\//.test(item.url)||(!item.title&&!item.name))return json({error:'条目缺少名称或原文地址'},400);
            if(key==='projects'&&!/^[\w.-]+\/[\w.-]+$/.test(item.repo||''))return json({error:'仓库格式不正确'},400);
          }
          data[key]=body[key];
        }
        if(body.schedule && typeof body.schedule.enabled==='boolean')data.schedule={enabled:body.schedule.enabled,time:'08:00',timezone:'Asia/Shanghai'};
        data.curatedAt=new Date().toISOString();
        await save(env,data,etag);
        return json({ok:true,curatedAt:data.curatedAt,counts:{projects:data.projects.length,competitions:data.competitions.length,frontier:data.frontier.length}});
      }
      const asset=assets[path==='/'?'/index.html':path];
      if(asset){const bytes=asset.encoding==='base64'?Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0)):asset.body;return new Response(bytes,{headers:{'content-type':asset.type,'cache-control':path==='/sw.js'?'no-cache':'public, max-age=300','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin'}});}
      return new Response('Not found',{status:404});
    }catch(e){return json({error:e.message},e.status||503);}
  }
};
