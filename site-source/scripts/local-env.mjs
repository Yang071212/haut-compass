import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const dir=path.join(root,'.runtime');await mkdir(dir,{recursive:true});
const etag=value=>createHash('sha256').update(value).digest('hex');let chain=Promise.resolve();
export const env={BUCKET:{async get(key){try{const value=await readFile(path.join(dir,'snapshot.json'),'utf8');return {etag:etag(value),async json(){return JSON.parse(value);}};}catch(e){if(e.code==='ENOENT')return null;throw e;}},async put(key,value,options={}){const task=chain.then(async()=>{const old=await env.BUCKET.get(key);const cond=options.onlyIf;if(cond?.etagMatches&&old?.etag!==cond.etagMatches)return null;if(cond instanceof Headers&&cond.get('If-None-Match')==='*'&&old)return null;const target=path.join(dir,'snapshot.json');await writeFile(target+'.tmp',value);await rename(target+'.tmp',target);return {etag:etag(value)};});chain=task.catch(()=>{});return task;}}};
