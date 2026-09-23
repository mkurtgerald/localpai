const VERSION="strict-v4";
const SHELL="localpai-shell-v4";
const META="localpai-meta-v4";
const ASSETS=["./","./index.html","./app.js?v=4","./manifest.webmanifest","./icon.svg"];
const LOCK_KEY=new Request(new URL("./__strict_lock_v4__",self.location.href));
let lockState=false;

async function readPersistedLock(){
 const c=await caches.open(META);
 return !!(await c.match(LOCK_KEY));
}
async function setLocked(v){
 lockState=!!v;
 const c=await caches.open(META);
 if(lockState)await c.put(LOCK_KEY,new Response("1",{headers:{"content-type":"text/plain"}}));
 else await c.delete(LOCK_KEY);
 return lockState;
}

self.addEventListener("install",e=>{
 e.waitUntil(caches.open(SHELL).then(c=>c.addAll(ASSETS)));
 self.skipWaiting();
});

self.addEventListener("activate",e=>{
 e.waitUntil((async()=>{
  lockState=await readPersistedLock();
  await self.clients.claim();
 })());
});

self.addEventListener("message",e=>{
 const m=e.data||{};
 const reply=v=>e.ports?.[0]?.postMessage(v);
 if(m.type==="GET_STATUS")reply({version:VERSION,locked:lockState});
 if(m.type==="SET_LOCK"){
  e.waitUntil(setLocked(!!m.locked).then(v=>reply({version:VERSION,locked:v})));
 }
 if(m.type==="SKIP_WAITING"){
  e.waitUntil(self.skipWaiting().then(()=>reply({version:VERSION,ok:true})));
 }
});

self.addEventListener("fetch",e=>{
 const r=e.request;

 // Network writes are never allowed from this app.
 if(r.method!=="GET"){
  e.respondWith(new Response("Network write blocked by Local Photo AI.",{status:403}));
  return;
 }

 // SEALED MODE: every request is cache-only. Any cache miss fails locally.
 if(lockState){
  e.respondWith((async()=>{
   const hit=await caches.match(r);
   if(hit)return hit;
   return new Response("Strict local seal: uncached request blocked.",{
    status:503,
    headers:{"content-type":"text/plain","x-localpai-seal":VERSION}
   });
  })());
  return;
 }

 const u=new URL(r.url);
 const same=u.origin===self.location.origin;

 // SETUP MODE: cache our own static shell.
 if(same){
  e.respondWith((async()=>{
   const hit=await caches.match(r);
   if(hit)return hit;
   try{
    const res=await fetch(r);
    if(res.ok){
     const c=await caches.open(SHELL);
     c.put(r,res.clone()).catch(()=>{});
    }
    return res;
   }catch{
    if(r.mode==="navigate")return (await caches.match("./index.html"))||new Response("Offline",{status:503});
    return new Response("Local shell load failed.",{status:503});
   }
  })());
  return;
 }

 // SETUP MODE: cross-origin GETs pass through untouched so model/runtime
 // downloads cannot be broken by the privacy worker. Personal input is disabled
 // until sealed verification is complete.
});