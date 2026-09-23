const SHELL="localpai-shell-v1";
const RUNTIME="localpai-runtime-v1";
const META="localpai-meta-v1";
const ASSETS=["./","./index.html","./manifest.webmanifest","./icon.svg"];
const LOCK_KEY="./__offline_lock__";

self.addEventListener("install",e=>{
  e.waitUntil(caches.open(SHELL).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate",e=>{
  e.waitUntil(self.clients.claim());
});

async function locked(){
  const c=await caches.open(META);
  return !!(await c.match(LOCK_KEY));
}
async function setLocked(v){
  const c=await caches.open(META);
  if(v) await c.put(LOCK_KEY,new Response("1"));
  else await c.delete(LOCK_KEY);
  return v;
}

self.addEventListener("message",e=>{
  const m=e.data||{};
  const reply=v=>e.ports?.[0]?.postMessage(v);
  if(m.type==="GET_LOCK") e.waitUntil(locked().then(v=>reply({locked:v})));
  if(m.type==="SET_LOCK") e.waitUntil(setLocked(!!m.locked).then(v=>reply({locked:v})));
});

function remoteAllowed(u){
  const h=u.hostname;
  return h==="esm.sh" ||
    h==="huggingface.co" ||
    h.endsWith(".huggingface.co") ||
    h.endsWith(".hf.co") ||
    h.endsWith(".xethub.hf.co") ||
    h.endsWith(".xethub.com");
}

self.addEventListener("fetch",e=>{
  const r=e.request;
  const u=new URL(r.url);
  const same=u.origin===self.location.origin;

  if(!same && r.method!=="GET"){
    e.respondWith(new Response("Remote upload blocked by Local Photo AI.",{status:403}));
    return;
  }

  if(same){
    e.respondWith((async()=>{
      const hit=await caches.match(r);
      if(hit) return hit;
      try{
        const res=await fetch(r);
        if(r.method==="GET" && res.ok){
          const c=await caches.open(SHELL);
          c.put(r,res.clone()).catch(()=>{});
        }
        return res;
      }catch(err){
        if(r.mode==="navigate"){
          return (await caches.match("./index.html")) || new Response("Offline",{status:503});
        }
        throw err;
      }
    })());
    return;
  }

  if(!remoteAllowed(u)){
    e.respondWith(new Response("Remote host blocked.",{status:403}));
    return;
  }

  e.respondWith((async()=>{
    const isLocked=await locked();

    if(u.hostname==="esm.sh"){
      const c=await caches.open(RUNTIME);
      const hit=await c.match(r);
      if(hit) return hit;
      if(isLocked) return new Response("Offline Lock blocked uncached runtime.",{status:503});
      const res=await fetch(r);
      if(res.ok) c.put(r,res.clone()).catch(()=>{});
      return res;
    }

    // Model/tokenizer libraries maintain their own browser caches.
    // If they are already cached, those libraries read the cache directly.
    if(isLocked) return new Response("Offline Lock blocked uncached model request.",{status:503});
    return fetch(r);
  })());
});
