import * as tiny from "./tiny_engine.js?v=5";
const $=id=>document.getElementById(id);
const WORKER_VERSION="strict-v5-tinysd";
let loaded=false,verified=localStorage.getItem("tinysd-verified-v5")==="1",locked=false,currentUrl=null,sessionGallery=[];

try{Object.defineProperty(window,"WebSocket",{value:class{constructor(){throw new Error("WebSocket disabled")}},writable:false,configurable:false})}catch{}
try{Object.defineProperty(window,"EventSource",{value:class{constructor(){throw new Error("EventSource disabled")}},writable:false,configurable:false})}catch{}
try{if(navigator.sendBeacon)Object.defineProperty(navigator,"sendBeacon",{value:()=>false,writable:false,configurable:false})}catch{}

function setP(t,p=null){$("progress").textContent=t;$("bar").style.width=p==null?"0%":Math.max(0,Math.min(100,p))+"%"}
function setG(t){$("genStatus").textContent=t}
function updateNet(){$("net").textContent=navigator.onLine?"Online (OK if sealed)":"Offline"}addEventListener("online",updateNet);addEventListener("offline",updateNet);updateNet();

async function sw(type,extra={}){
 const target=navigator.serviceWorker?.controller;if(!target)return null;
 return new Promise(resolve=>{const ch=new MessageChannel(),timer=setTimeout(()=>resolve(null),3000);ch.port1.onmessage=e=>{clearTimeout(timer);resolve(e.data)};target.postMessage({type,...extra},[ch.port2])});
}
async function workerStatus(){return await sw("GET_STATUS")||{version:null,locked:false}}
async function initSW(){
 if(!("serviceWorker" in navigator))throw new Error("Service workers unavailable");
 const reg=await navigator.serviceWorker.register("./sw.js?v=5",{scope:"./",updateViaCache:"none"});
 await reg.update().catch(()=>{});
 let s=await workerStatus();
 if(s.version!==WORKER_VERSION){
  await new Promise(resolve=>{let done=false;const timer=setTimeout(()=>{if(!done){done=true;resolve()}},10000);navigator.serviceWorker.addEventListener("controllerchange",()=>{if(!done){done=true;clearTimeout(timer);resolve()}},{once:true})});
  s=await workerStatus();
 }
 if(s.version!==WORKER_VERSION)throw new Error("Privacy worker v5 did not take control. Close and reopen once.");
 locked=!!s.locked;ui();
}
function ui(){
 const sealed=locked&&verified;
 $("lockState").textContent=sealed?"SEALED":"SETUP ONLY";$("lockState").style.color=sealed?"var(--good)":"var(--warn)";
 $("privacy").textContent=sealed?"Network Sealed":"Setup";$("dot").className="dot"+(sealed?" good":"");
 for(const id of ["prompt","seed","steps","random","go"])$(id).disabled=!sealed;
 $("sealedNotice").className="notice "+(sealed?"":"bad");
 $("sealedNotice").textContent=sealed?"Sealed cold-cache test passed. Personal generation is enabled.":"Generation is locked until the sealed cold-cache test passes.";
 $("setupCard").classList.toggle("hidden",sealed);
}
async function gpu(){
 if(!navigator.gpu){$("gpu").textContent="Unavailable";$("gpu").style.color="var(--bad)";return false}
 try{const a=await navigator.gpu.requestAdapter({powerPreference:"high-performance"});if(!a)throw 0;
 $("gpu").textContent=a.features?.has?.("shader-f16")?"Ready + FP16":"No FP16";$("gpu").style.color=a.features?.has?.("shader-f16")?"var(--good)":"var(--bad)";
 return a.features?.has?.("shader-f16")}catch{$("gpu").textContent="Unavailable";$("gpu").style.color="var(--bad)";return false}
}
function onEngineProgress(e){setP(e.message||e.phase||"Working…",e.pct)}
async function install(){
 $("install").disabled=true;
 try{
  const ok=await gpu();if(!ok)throw new Error("Tiny-SD q4f16 requires WebGPU shader-f16");
  setP("Installing Tiny‑SD local assets…",1);
  await tiny.install(onEngineProgress);loaded=true;
  localStorage.setItem("tinysd-installed-v5","1");
  $("engine").textContent="Tiny‑SD loaded";$("engine").style.color="var(--good)";$("verify").disabled=false;
  setP("Install complete. Tap Verify & Seal.",100)
 }catch(e){$("engine").textContent="Install failed";$("engine").style.color="var(--bad)";setP("Install failed: "+(e?.message||e))}
 finally{$("install").disabled=false}
}
async function harmless(prompt,seed,label){
 let blob=await tiny.generate({prompt,seed,steps:4,guidance:6.5,onProgress:e=>setP(label+": "+(e.message||e.phase),e.pct)});
 const ok=blob&&blob.size>1000;blob=null;return ok;
}
async function verify(){
 $("verify").disabled=true;$("install").disabled=true;
 try{
  if(!loaded){await tiny.loadFromCache(onEngineProgress);loaded=true}
  setP("Stage 1/4: harmless local generation…",2);
  if(!(await harmless("a red apple on a plain studio table",101,"Stage 1")))throw new Error("First local generation failed");

  setP("Stage 2/4: sealing all network cache misses…",45);
  const seal=await sw("SET_LOCK",{locked:true});
  if(!seal?.locked||seal.version!==WORKER_VERSION)throw new Error("Privacy worker did not confirm seal");
  locked=true;ui();

  setP("Stage 2/4: testing blocked egress…",52);
  const probe=await fetch("./__egress_probe_"+Date.now(),{cache:"no-store"});
  const txt=await probe.text().catch(()=>"");
  if(probe.status!==503||!txt.includes("Strict local seal"))throw new Error("Egress probe was not blocked");

  setP("Stage 3/4: unloading engine completely…",58);
  await tiny.unload();loaded=false;

  setP("Stage 3/4: reloading sessions from local cache while sealed…",62);
  await tiny.loadFromCache(onEngineProgress);loaded=true;

  setP("Stage 4/4: second generation while sealed…",82);
  if(!(await harmless("a blue ceramic coffee cup on a plain studio table",202,"Stage 4")))throw new Error("Sealed generation failed");

  verified=true;localStorage.setItem("tinysd-verified-v5","1");
  $("engine").textContent="Tiny‑SD verified";setP("SEALED COLD-CACHE TEST PASSED. Personal generation enabled.",100);ui()
 }catch(e){
  verified=false;localStorage.removeItem("tinysd-verified-v5");
  const s=await workerStatus().catch(()=>null);locked=!!s?.locked;
  setP("Verify failed: "+(e?.message||e));ui()
 }finally{$("install").disabled=false;$("verify").disabled=!loaded}
}
function rand(){const a=new Uint32Array(1);crypto.getRandomValues(a);$("seed").value=String(a[0]);return a[0]}
$("random").onclick=rand;
function clearRendered(){
 if(currentUrl){URL.revokeObjectURL(currentUrl);currentUrl=null}$("out").removeAttribute("src");$("result").classList.remove("show");
 for(const x of sessionGallery)try{URL.revokeObjectURL(x.url)}catch{}sessionGallery=[];$("gallery").innerHTML="";$("empty").classList.remove("hidden");
}
function renderGallery(){
 const g=$("gallery");g.innerHTML="";$("empty").classList.toggle("hidden",sessionGallery.length>0);
 for(const x of sessionGallery){const box=document.createElement("div");box.className="item";const im=document.createElement("img");im.src=x.url;const m=document.createElement("div");m.className="meta";const p=document.createElement("div");p.textContent=x.prompt;const s=document.createElement("div");s.textContent="seed "+x.seed;m.append(p,s);box.append(im,m);g.append(box)}
}
async function go(){
 if(!(locked&&verified)){setG("Privacy gate is not sealed.");return}
 const prompt=$("prompt").value.trim();if(!prompt){setG("Enter a description.");return}
 const seed=$("seed").value===""?rand():(Number($("seed").value)>>>0),steps=Number($("steps").value)||6;
 $("go").disabled=true;
 try{
  const blob=await tiny.generate({prompt,seed,steps,guidance:7,onProgress:e=>setG(e.message||e.phase)});
  if(currentUrl)URL.revokeObjectURL(currentUrl);currentUrl=URL.createObjectURL(blob);$("out").src=currentUrl;$("result").classList.add("show");
  const u=URL.createObjectURL(blob);sessionGallery.unshift({url:u,prompt,seed});if(sessionGallery.length>6){const o=sessionGallery.pop();URL.revokeObjectURL(o.url)}
  renderGallery();setG("Done — generated locally under network seal.")
 }catch(e){setG("Generation failed: "+(e?.message||e))}
 finally{$("go").disabled=!(locked&&verified)}
}
async function reset(){
 if(!confirm("Destroy this image session and reopen setup/download mode?"))return;
 clearRendered();$("prompt").value="";$("seed").value="";setG("");await tiny.unload().catch(()=>{});loaded=false;verified=false;
 localStorage.removeItem("tinysd-installed-v5");localStorage.removeItem("tinysd-verified-v5");
 const r=await sw("SET_LOCK",{locked:false});locked=!!r?.locked;$("engine").textContent="Cached / not loaded";setP("Session destroyed. Setup reopened.");ui()
}
$("install").onclick=install;$("verify").onclick=verify;$("go").onclick=go;$("reset").onclick=reset;
window.addEventListener("pagehide",clearRendered);
(async()=>{
 try{await initSW();await gpu();const installed=localStorage.getItem("tinysd-installed-v5")==="1";
 if(locked&&verified&&installed){$("engine").textContent="Cached + sealed";$("engine").style.color="var(--good)";setP("Sealed state restored. Engine will load from local cache on first generation.",100)}
 ui()}catch(e){setP("Privacy initialization failed: "+(e?.message||e));ui()}
})();