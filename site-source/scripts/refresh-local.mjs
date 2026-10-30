import { readFile } from 'node:fs/promises';
import { env } from './local-env.mjs';
import { collect } from '../lib/collector.js';
const seed=JSON.parse(await readFile(new URL('../data/seed.json',import.meta.url),'utf8'));
const obj=await env.BUCKET.get('compass/snapshot.json');
const data=await collect(obj?await obj.json():seed,seed);
await env.BUCKET.put('compass/snapshot.json',JSON.stringify(data));
console.log(JSON.stringify({updatedAt:data.updatedAt,health:data.health,campus:data.campus.length,projects:data.projects.length,competitions:data.competitions.length,frontier:data.frontier.length},null,2));
