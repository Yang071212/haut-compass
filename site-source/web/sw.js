const CACHE='haut-compass-v2-public';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/','/style.css','/app.js','/icons.svg','/vendor/fuse.js','/manifest.webmanifest','/icon-192.png'])));self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 if(url.pathname.startsWith('/api/')&&url.pathname!=='/api/data')return;
 event.respondWith(fetch(event.request).then(response=>{if(response.ok && response.headers.get('content-type')?.includes(url.pathname==='/api/data'?'application/json':url.pathname==='/'?'text/html':'')){const copy=response.clone();caches.open(CACHE).then(c=>c.put(event.request,copy));}return response;}).catch(()=>caches.match(event.request).then(hit=>hit||new Response('离线时暂无此内容',{status:503}))));
});
