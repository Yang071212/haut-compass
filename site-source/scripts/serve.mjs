import http from 'node:http';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { env } from './local-env.mjs';
const worker=(await import(pathToFileURL(path.resolve(import.meta.dirname,'../dist/server/index.js')))).default;
const port=Number(process.env.PORT||4318);
const host='0.0.0.0';
http.createServer(async(req,res)=>{
  try{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const url='http://'+(req.headers.host||'localhost:'+port)+req.url;
    const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
    const response=await worker.fetch(request,env,{waitUntil:p=>p.catch(console.error)});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(e){res.writeHead(500);res.end(e.message);}
}).listen(port,host,()=>{console.log('Local: http://127.0.0.1:'+port);for(const group of Object.values(os.networkInterfaces()))for(const addr of group||[])if(addr.family==='IPv4'&&!addr.internal)console.log('Phone on same Wi-Fi: http://'+addr.address+':'+port);});
