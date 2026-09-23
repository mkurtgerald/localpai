const SHELL="localpai-shell-v2";
const RUNTIME="localpai-runtime-v2";
const META="localpai-meta-v2";
const ASSETS=["./","./index.html","./app.js","./manifest.webmanifest","./icon.svg"];
const LOCK_KEY=new Request(new URL("./__strict_lock__",self.location.href));

self.addEventListener("install",e=>{
 e.waitUntil(caches.open(SHELL).then(c=>c.addAll(ASSETS)));
 self.skipWaiting();
});
self.addEventListener("activate",e=>{
 e.waitUntil((async()=>{
  await self.clients.claim();
 })());
});

async function locked(){
 const c=await caches.open(META);
 return !!(await c.match(LOCK_KEY));
}
async function setLocked(v){
 const c=await caches.open(META);
 if(v)await c.put(LOCK_KEY,new Response("1",{headers:{"content-type":"text/plain"}}));
 else await c.delete(LOCK_KEY);
 return v;
}
self.addEventListener("message",e=>{
 const m=e.data||{},reply=v=>e.ports?.[0]?.postMessage(v);
 if(m.type==="GET_LOCK")e.waitUntil(locked().then(v=>reply({locked:v})));
 if(m.type==="SET_LOCK")e.waitUntil(setLocked(!!m.locked).then(v=>reply({locked:v})));
});

function allowedSetupRemote(u){
 const h=u.hostname;
 return h==="esm.sh"||
  h==="huggingface.co"||
  h.endsWith(".huggingface.co")||
  h.endsWith(".hf.co")||
  h.endsWith(".xethub.hf.co")||
  h.endsWith(".xethub.com");
}

self.addEventListener("fetch",e=>{
 const r=e.request;
 e.respondWith((async()=>{
  const isLocked=await locked();

  // No writes are ever allowed through the network from this app.
  if(r.method!=="GET"){
   return new Response("Network write blocked by Local Photo AI.",{status:403});
  }

  // STRICT MODE: once sealed, the network is cache-only for every origin,
  // including our own GitHub Pages origin. Any cache miss is denied.
  if(isLocked){
   const hit=await caches.match(r);
   if(hit)return hit;
   return new Response("Strict local seal: uncached network request blocked.",{status:503});
  }

  const u=new URL(r.url);
  const same=u.origin===self.location.origin;

  // SETUP MODE has no user prompts/photos. It may fetch only our shell and
  // approved runtime/model assets.
  if(same){
   const hit=await caches.match(r);
   if(hit)return hit;
   try{
    const res=await fetch(r);
    if(res.ok){
     const c=await caches.open(SHELL);
     c.put(r,res.clone()).catch(()=>{});
    }
    return res;
   }catch(err){
    if(r.mode==="navigate")return (await caches.match("./index.html"))||new Response("Offline",{status:503});
    throw err;
   }
  }

  if(!allowedSetupRemote(u)){
   return new Response("Remote host blocked by Local Photo AI.",{status:403});
  }

  if(u.hostname==="esm.sh"){
   const c=await caches.open(RUNTIME),hit=await c.match(r);
   if(hit)return hit;
   const res=await fetch(r);
   if(res.ok)c.put(r,res.clone()).catch(()=>{});
   return res;
  }

  return fetch(r);
 })());
});