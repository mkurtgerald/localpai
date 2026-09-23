const VERSION="strict-v5-tinysd";
const SHELL="localpai-shell-v5";
const META="localpai-meta-v5";
const ASSETS=["./","./index.html","./tiny_app.js?v=5","./tiny_engine.js?v=5","./manifest.webmanifest","./icon.svg"];
const LOCK_KEY=new Request(new URL("./__strict_lock_v5__",self.location.href));
let lockState=false;
async function readLock(){const c=await caches.open(META);return !!(await c.match(LOCK_KEY))}
async function setLock(v){lockState=!!v;const c=await caches.open(META);if(lockState)await c.put(LOCK_KEY,new Response("1"));else await c.delete(LOCK_KEY);return lockState}
self.addEventListener("install",e=>{e.waitUntil(caches.open(SHELL).then(c=>c.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil((async()=>{lockState=await readLock();await self.clients.claim()})())});
self.addEventListener("message",e=>{const m=e.data||{},reply=v=>e.ports?.[0]?.postMessage(v);
 if(m.type==="GET_STATUS")reply({version:VERSION,locked:lockState});
 if(m.type==="SET_LOCK")e.waitUntil(setLock(!!m.locked).then(v=>reply({version:VERSION,locked:v})));
});
self.addEventListener("fetch",e=>{
 const r=e.request;
 if(r.method!=="GET"){e.respondWith(new Response("Network write blocked by Local Photo AI.",{status:403}));return}
 if(lockState){e.respondWith((async()=>{const hit=await caches.match(r);if(hit)return hit;return new Response("Strict local seal: uncached request blocked.",{status:503,headers:{"content-type":"text/plain","x-localpai-seal":VERSION}})})());return}
 const u=new URL(r.url);
 if(u.origin===self.location.origin){e.respondWith((async()=>{const hit=await caches.match(r);if(hit)return hit;try{const res=await fetch(r);if(res.ok){const c=await caches.open(SHELL);c.put(r,res.clone()).catch(()=>{})}return res}catch{return r.mode==="navigate"?(await caches.match("./index.html"))||new Response("Offline",{status:503}):new Response("Shell load failed",{status:503})}})());return}
 // Setup mode: cross-origin GETs are allowed only while personal input is disabled.
});