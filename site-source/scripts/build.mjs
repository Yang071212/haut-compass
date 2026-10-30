import { readFile, writeFile, mkdir, readdir, cp } from 'node:fs/promises';
import { build } from 'esbuild';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const web=path.join(root,'web');
await mkdir(path.join(root,'dist/server'),{recursive:true});
await mkdir(path.join(root,'dist/.openai'),{recursive:true});
const assets={};
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.png':'image/png','.txt':'text/plain; charset=utf-8'};
for(const name of await readdir(web)){
  const ext=path.extname(name);if(!types[ext])continue;
  const buf=await readFile(path.join(web,name));
  assets['/'+name]={body:buf.toString(ext==='.png'?'base64':'utf8'),type:types[ext],encoding:ext==='.png'?'base64':'utf8'};
}
assets['/vendor/fuse.js']={body:await readFile(path.join(root,'node_modules/fuse.js/dist/fuse.min.js'),'utf8'),type:types['.js']};
const names=['compass','layout-dashboard','graduation-cap','github','trophy','orbit','bookmark','radio','search','arrow-up-right','refresh-cw','calendar-days','chevron-right','plus','x','external-link','check','circle-alert','menu','monitor-smartphone','download','arrow-right','star','code-2','sprout','sparkles','clock-3','bell','book-open','circle-check','globe-2','filter','layers','command','chevrons-up-down','wifi-off','info'];
let sprite='<svg xmlns="http://www.w3.org/2000/svg">';
for(const name of names){let file=name;if(name==='globe-2')file='earth';if(name==='code-2')file='code-xml';const svg=await readFile(path.join(root,'node_modules/lucide-static/icons',file+'.svg'),'utf8');const body=svg.slice(svg.indexOf('>',svg.indexOf('<svg'))+1,svg.lastIndexOf('</svg>'));sprite+=`<symbol id="${name}" viewBox="0 0 24 24">${body}</symbol>`;}
sprite+='</svg>';assets['/icons.svg']={body:sprite,type:types['.svg']};
const licenses=[['Lucide','lucide-static'],['Fuse.js','fuse.js'],['Cheerio','cheerio'],['fast-xml-parser','fast-xml-parser']];let license='工大 Compass · 开源许可\n\n';
for(const [title,pkg]of licenses){let txt;for(const f of ['LICENSE','LICENSE.txt','LICENSE.md']){try{txt=await readFile(path.join(root,'node_modules',pkg,f),'utf8');break;}catch{}}license+=title+'\n'+(txt||'See package repository for its license.')+'\n\n';}
assets['/licenses.txt']={body:license,type:types['.txt']};
await writeFile(path.join(root,'worker/assets.generated.js'),'export default '+JSON.stringify(assets)+';\n');
await build({entryPoints:[path.join(root,'worker/entry.js')],outfile:path.join(root,'dist/server/index.js'),bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,legalComments:'inline'});
await cp(path.join(root,'.openai/hosting.json'),path.join(root,'dist/.openai/hosting.json'));
console.log('Built Worker with '+Object.keys(assets).length+' embedded assets.');
