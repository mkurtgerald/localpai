const $=id=>document.getElementById(id);
const ENGINE_URL="https://esm.sh/web-txt2img@0.3.1?bundle&deps=onnxruntime-web@1.30.0,@xenova/transformers@2.17.2";
const MODEL="sd-turbo";
let api=null,loaded=false,verified=localStorage.getItem("verified-v2")==="1",locked=false,currentUrl=null;
let sessionGallery=[];

// Disable browser network APIs the inference stack does not need.
// Fetch/XHR requests are additionally governed by the service worker.
try{Object.defineProperty(window,"WebSocket",{value:class{constructor(){throw new Error("WebSocket disabled by Local Photo AI")}},writable:false,configurable:false})}catch{}
try{Object.defineProperty(window,"EventSource",{value:class{constructor(){throw new Error("EventSource disabled by Local Photo AI")}},writable:false,configurable:false})}catch{}
try{if(navigator.sendBeacon)Object.defineProperty(navigator,"sendBeacon",{value:()=>false,writable:false,configurable:false})}catch{}

function setP(t,p=null){$("progress").textContent=t;$("bar").style.width=p==null?"0%":Math.max(0,Math.min(100,p))+"%"}
function setG(t){$("genStatus").textContent=t}
function updateNet(){$("net").textContent=navigator.onLine?"Online (OK if sealed)":"Offline"};addEventListener("online",updateNet);addEventListener("offline",updateNet);updateNet();

async function sw(type,extra={}){
 if(!("serviceWorker" in navigator))return null;
 const reg=await navigator.serviceWorker.ready;
 const target=navigator.serviceWorker.controller||reg.active;
 if(!target)return null;
 return new Promise(resolve=>{
  const ch=new MessageChannel(),timer=setTimeout(()=>resolve(null),2500);
  ch.port1.onmessage=e=>{clearTimeout(timer);resolve(e.data)};
  target.postMessage({type,...extra},[ch.port2])
 });
}
async function initSW(){
 if(!("serviceWorker" in navigator))throw new Error("Service workers unavailable");
 await navigator.serviceWorker.register("./sw.js",{scope:"./"});
 await navigator.serviceWorker.ready;
 const r=await sw("GET_LOCK");locked=!!r?.locked;ui()
}
function ui(){
 const sealed=locked&&verified;
 $("lockState").textContent=sealed?"SEALED":"SETUP ONLY";
 $("lockState").style.color=sealed?"var(--good)":"var(--warn)";
 $("privacy").textContent=sealed?"Network Sealed":"Setup";
 $("dot").className="dot"+(sealed?" good":"");
 $("prompt").disabled=!sealed;$("seed").disabled=!sealed;$("random").disabled=!sealed;$("go").disabled=!sealed;
 $("sealedNotice").className="notice "+(sealed?"":"bad");
 $("sealedNotice").textContent=sealed
   ?"Network seal confirmed. You may leave Wi‑Fi/cellular on; uncached app requests are blocked."
   :"Generation is locked until the privacy gate is sealed.";
 $("setupCard").classList.toggle("hidden",sealed);
}
async function gpu(){
 if(!navigator.gpu){$("gpu").textContent="Unavailable";$("gpu").style.color="var(--bad)";return false}
 try{
  const a=await navigator.gpu.requestAdapter({powerPreference:"high-performance"});
  if(!a)throw new Error("No GPU adapter");
  $("gpu").textContent=a.features?.has?.("shader-f16")?"Ready + FP16":"Ready";
  $("gpu").style.color="var(--good)";return true
 }catch{$("gpu").textContent="Unavailable";$("gpu").style.color="var(--bad)";return false}
}
async function runtime(){
 if(api)return api;
 setP(locked?"Loading cached inference runtime…":"Downloading/loading inference runtime…");
 api=await import(ENGINE_URL);
 return api
}
async function load(){
 $("install").disabled=true;
 try{
  const a=await runtime(),caps=await a.detectCapabilities();
  let res=null;
  if(caps.webgpu){
   setP("Trying WebGPU engine…",2);
   res=await a.loadModel(MODEL,{backendPreference:["webgpu"],onProgress:p=>{
    const m=p?.bytesDownloaded?(" • "+Math.round(p.bytesDownloaded/1048576)+" MB"):"";
    setP((p?.message||p?.phase||"Loading")+m,p?.pct)
   }})
  }
  if(!res?.ok){
   setP("Trying WASM fallback…",3);
   res=await a.loadModel(MODEL,{backendPreference:["wasm"],wasmNumThreads:2,wasmSimd:true,onProgress:p=>{
    const m=p?.bytesDownloaded?(" • "+Math.round(p.bytesDownloaded/1048576)+" MB"):"";
    setP((p?.message||p?.phase||"Loading")+m,p?.pct)
   }})
  }
  if(!res?.ok)throw new Error(res?.message||res?.reason||"Engine load failed");
  loaded=true;localStorage.setItem("installed-v2","1");
  $("engine").textContent=(res.backendUsed==="webgpu"?"WebGPU":"WASM")+" loaded";
  $("engine").style.color="var(--good)";$("verify").disabled=false;
  setP("Engine loaded. Tap Verify & Seal. The test uses a fixed non-personal prompt.",100)
 }catch(e){
  $("engine").textContent="Load failed";$("engine").style.color="var(--bad)";setP(e?.message||String(e))
 }finally{$("install").disabled=false}
}
async function ensure(){
 if(loaded)return true;
 await load();
 return loaded
}
async function rawGenerate(prompt,seed,checking=false){
 if(!(await ensure()))throw new Error("Engine is not loaded");
 const a=await runtime();
 const r=await a.generateImage({model:MODEL,prompt,seed,width:512,height:512,onProgress:p=>{
  const n=p?.phase||"Generating",q=p?.pct!=null?" • "+Math.round(p.pct)+"%":"";
  checking?setP("Verification: "+n+q,p?.pct):setG(n+q)
 }});
 if(!r?.ok)throw new Error(r?.message||r?.reason||"Generation failed");
 return r.blob
}
async function verifyAndSeal(){
 $("verify").disabled=true;$("install").disabled=true;
 try{
  setP("Running fixed local verification image…",5);
  const b=await rawGenerate("a simple studio photograph of a red apple on a plain table",1,true);
  if(!b||b.size<1000)throw new Error("Verification returned an invalid image");
  // Do not keep the verification image.
  verified=true;localStorage.setItem("verified-v2","1");
  setP("Verification passed. Sealing every uncached network request…",98);
  const r=await sw("SET_LOCK",{locked:true});
  locked=!!r?.locked;
  if(!locked)throw new Error("Network seal could not be confirmed");
  $("engine").textContent="Verified + sealed";
  setP("Privacy gate sealed. Generation is now enabled.",100);ui()
 }catch(e){
  verified=false;localStorage.removeItem("verified-v2");
  setP("Verification/seal failed: "+(e?.message||e));ui()
 }finally{$("install").disabled=false;$("verify").disabled=!loaded}
}
function rand(){
 const a=new Uint32Array(1);crypto.getRandomValues(a);$("seed").value=String(a[0]);return a[0]
}
$("random").onclick=rand;

function clearRendered(){
 if(currentUrl){URL.revokeObjectURL(currentUrl);currentUrl=null}
 $("out").removeAttribute("src");$("result").classList.remove("show");
 for(const x of sessionGallery){try{URL.revokeObjectURL(x.url)}catch{}}
 sessionGallery=[];
 $("gallery").innerHTML="";$("empty").classList.remove("hidden");
}
function renderGallery(){
 const g=$("gallery");g.innerHTML="";$("empty").classList.toggle("hidden",sessionGallery.length>0);
 for(const x of sessionGallery){
  const box=document.createElement("div");box.className="item";
  const im=document.createElement("img");im.src=x.url;im.alt="Local generation";
  const m=document.createElement("div");m.className="meta";
  const p=document.createElement("div");p.textContent=x.prompt;
  const s=document.createElement("div");s.textContent="seed "+x.seed;
  m.append(p,s);box.append(im,m);g.append(box)
 }
}
async function go(){
 if(!(locked&&verified)){setG("Privacy gate is not sealed.");ui();return}
 const prompt=$("prompt").value.trim();
 const seed=$("seed").value===""?rand():(Number($("seed").value)>>>0);
 if(!prompt){setG("Enter a description first.");return}
 $("go").disabled=true;
 try{
  setG("Generating locally with network seal active…");
  const b=await rawGenerate(prompt,seed,false);
  if(!(locked&&verified))throw new Error("Privacy gate changed during generation");
  if(currentUrl)URL.revokeObjectURL(currentUrl);
  currentUrl=URL.createObjectURL(b);$("out").src=currentUrl;$("result").classList.add("show");
  const galleryUrl=URL.createObjectURL(b);
  sessionGallery.unshift({url:galleryUrl,prompt,seed});
  if(sessionGallery.length>8){const old=sessionGallery.pop();try{URL.revokeObjectURL(old.url)}catch{}}
  renderGallery();setG("Done. Image exists only in this app session memory.")
 }catch(e){setG("Generation failed: "+(e?.message||e))}
 finally{$("go").disabled=!(locked&&verified)}
}
async function reset(){
 if(!confirm("This destroys all generated images and prompt text from this session before reopening downloads. Continue?"))return;
 clearRendered();$("prompt").value="";$("seed").value="";setG("");
 // Remove sensitive runtime state before network is reopened.
 try{if(api)await api.unloadModel(MODEL)}catch{}
 api=null;loaded=false;verified=false;
 localStorage.removeItem("verified-v2");localStorage.removeItem("installed-v2");
 const r=await sw("SET_LOCK",{locked:false});locked=!!r?.locked;
 $("engine").textContent="Not loaded";$("engine").style.color="";
 setP("Session destroyed. Setup/download mode reopened.");ui()
}

$("install").onclick=load;$("verify").onclick=verifyAndSeal;$("go").onclick=go;$("reset").onclick=reset;
window.addEventListener("pagehide",clearRendered);

(async()=>{
 try{
  await initSW();await gpu();
  const installed=localStorage.getItem("installed-v2")==="1";
  if(locked&&verified&&installed){
    $("engine").textContent="Cached + sealed";$("engine").style.color="var(--good)";
    setP("Privacy gate already sealed. Cached model will load on first generation.",100)
  }
  ui()
 }catch(e){
  $("sealedNotice").className="notice bad";
  $("sealedNotice").textContent="Privacy initialization failed. Generation remains disabled.";
  setP(e?.message||String(e));ui()
 }
})();