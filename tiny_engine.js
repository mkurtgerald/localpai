const ORT_URL="https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/ort.webgpu.min.mjs";
const ORT_WASM_BASE="https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/";
const HF="https://huggingface.co/cursedhelm/aderpy-deepdreamer-onnx/resolve/main/tiny-sd-web-q4f16";
const CACHE="localpai-tinysd-v1";
const ASSETS=[
 {id:"ort",label:"Inference runtime",url:ORT_URL,mb:1},
 {id:"ort-helper",label:"Runtime helper",url:ORT_WASM_BASE+"ort-wasm-simd-threaded.jsep.mjs",mb:1},
 {id:"ort-wasm",label:"Runtime WASM",url:ORT_WASM_BASE+"ort-wasm-simd-threaded.jsep.wasm",mb:24},
 {id:"vocab",label:"Tokenizer vocabulary",url:HF+"/tokenizer/vocab.json",mb:1.1},
 {id:"merges",label:"Tokenizer merges",url:HF+"/tokenizer/merges.txt",mb:0.6},
 {id:"text",label:"Text encoder",url:HF+"/text_encoder/model.onnx",mb:69.6},
 {id:"vae",label:"VAE decoder",url:HF+"/vae_decoder/model.onnx",mb:97.6},
 {id:"unet",label:"UNet",url:HF+"/unet/model.onnx",mb:466}
];

let ort=null,sessions={text:null,unet:null,vae:null},tokenizer=null;
let sessionMeta={};

const sleep=()=>new Promise(r=>setTimeout(r,0));
async function cache(){
 return await caches.open(CACHE);
}
async function getCached(url){
 const c=await cache();
 return await c.match(url);
}
async function fetchIntoCache(asset){
 const c=await cache();
 const hit=await c.match(asset.url);
 if(hit)return {cached:true};
 const r=await fetch(asset.url,{method:"GET",mode:"cors",credentials:"omit",cache:"no-store"});
 if(!r.ok)throw new Error(asset.label+" download failed ("+r.status+")");
 await c.put(asset.url,r);
 return {cached:false};
}
export async function install(onProgress=()=>{}){
 try{await navigator.storage?.persist?.()}catch{}
 let done=0;
 for(const a of ASSETS){
  onProgress({phase:"download",message:(await getCached(a.url)?"Checking cached ":"Downloading ")+a.label,done,total:ASSETS.length,pct:Math.round(done/ASSETS.length*55)});
  const before=await getCached(a.url);
  if(!before)await fetchIntoCache(a);
  done++;
  onProgress({phase:"download",message:a.label+" ready",done,total:ASSETS.length,pct:Math.round(done/ASSETS.length*55)});
 }
 onProgress({phase:"load",message:"Compiling Tiny‑SD sessions…",pct:58});
 await loadFromCache(onProgress);
 onProgress({phase:"ready",message:"Tiny‑SD engine ready",pct:100});
}
async function loadRuntime(){
 if(ort)return ort;
 if(!(await getCached(ORT_URL)))throw new Error("Inference runtime is not cached");
 ort=await import(ORT_URL);
 ort.env.wasm.wasmPaths=ORT_WASM_BASE;
 ort.env.wasm.numThreads=1;
 return ort;
}
async function bytes(url){
 const r=await getCached(url);
 if(!r)throw new Error("Missing cached asset: "+url.split("/").slice(-2).join("/"));
 return await r.arrayBuffer();
}
async function makeSession(url,label,onProgress,pct){
 const O=await loadRuntime();
 onProgress({phase:"compile",message:"Compiling "+label+"…",pct});
 let b=await bytes(url);
 let s;
 try{
  s=await O.InferenceSession.create(b,{
   executionProviders:["webgpu"],
   graphOptimizationLevel:"all",
   enableMemPattern:false,
   enableCpuMemArena:false
  });
 }finally{b=null}
 await sleep();
 return s;
}
export async function loadFromCache(onProgress=()=>{}){
 if(!navigator.gpu)throw new Error("WebGPU is unavailable");
 const adapter=await navigator.gpu.requestAdapter({powerPreference:"high-performance"});
 if(!adapter)throw new Error("No WebGPU adapter");
 if(!adapter.features?.has?.("shader-f16"))throw new Error("shader-f16 is required for Tiny‑SD q4f16");
 await loadTokenizer();
 if(!sessions.text)sessions.text=await makeSession(HF+"/text_encoder/model.onnx","text encoder",onProgress,66);
 if(!sessions.vae)sessions.vae=await makeSession(HF+"/vae_decoder/model.onnx","VAE decoder",onProgress,75);
 if(!sessions.unet)sessions.unet=await makeSession(HF+"/unet/model.onnx","UNet",onProgress,90);
 sessionMeta={
  text:describe(sessions.text),
  unet:describe(sessions.unet),
  vae:describe(sessions.vae)
 };
 onProgress({phase:"ready",message:"All Tiny‑SD sessions compiled",pct:100});
}
function describe(s){
 return {
  inputs:s.inputMetadata.map(x=>({name:x.name,type:x.type,shape:x.shape})),
  outputs:s.outputMetadata.map(x=>({name:x.name,type:x.type,shape:x.shape}))
 };
}
export function diagnostics(){return sessionMeta}

async function loadTokenizer(){
 if(tokenizer)return tokenizer;
 const vr=await getCached(HF+"/tokenizer/vocab.json");
 const mr=await getCached(HF+"/tokenizer/merges.txt");
 if(!vr||!mr)throw new Error("Tokenizer files are not cached");
 tokenizer=new ClipTokenizer(await vr.json(),await mr.text());
 return tokenizer;
}

class ClipTokenizer{
 constructor(vocab,mergesText){
  this.vocab=vocab;this.cache=new Map();
  const lines=mergesText.split(/\r?\n/).filter(Boolean);
  if(lines[0]?.startsWith("#"))lines.shift();
  this.ranks=new Map(lines.map((x,i)=>[x.trim(),i]));
  const {enc}=bytesToUnicode();this.byteEncoder=enc;
  this.re=/<\|startoftext\|>|<\|endoftext\|>|'s|'t|'re|'ve|'m|'ll|'d|[\p{L}]+|[\p{N}]+|[^\s\p{L}\p{N}]+/giu;
  this.te=new TextEncoder();
 }
 bpe(tok){
  if(this.cache.has(tok))return this.cache.get(tok);
  let word=[...tok];
  if(!word.length)return [];
  word[word.length-1]+="</w>";
  while(word.length>1){
   let best=null,bestRank=Infinity;
   for(let i=0;i<word.length-1;i++){
    const p=word[i]+" "+word[i+1],r=this.ranks.get(p);
    if(r!==undefined&&r<bestRank){bestRank=r;best=[word[i],word[i+1]]}
   }
   if(!best)break;
   const next=[];
   for(let i=0;i<word.length;){
    if(i<word.length-1&&word[i]===best[0]&&word[i+1]===best[1]){next.push(word[i]+word[i+1]);i+=2}
    else{next.push(word[i]);i++}
   }
   word=next;
  }
  this.cache.set(tok,word);return word;
 }
 encode(text){
  const ids=[49406];
  const clean=(text||"").toLowerCase().replace(/\s+/g," ").trim();
  for(const m of clean.matchAll(this.re)){
   const raw=this.te.encode(m[0]);
   let mapped="";
   for(const b of raw)mapped+=this.byteEncoder.get(b);
   for(const piece of this.bpe(mapped)){
    const id=this.vocab[piece];
    if(id!==undefined)ids.push(id);
    if(ids.length>=76)break;
   }
   if(ids.length>=76)break;
  }
  ids.push(49407);
  while(ids.length<77)ids.push(49407);
  return ids.slice(0,77);
 }
}
function bytesToUnicode(){
 const bs=[];
 for(let i=33;i<=126;i++)bs.push(i);
 for(let i=161;i<=172;i++)bs.push(i);
 for(let i=174;i<=255;i++)bs.push(i);
 const cs=bs.slice();let n=0;
 for(let b=0;b<256;b++)if(!bs.includes(b)){bs.push(b);cs.push(256+n);n++}
 const enc=new Map();
 for(let i=0;i<bs.length;i++)enc.set(bs[i],String.fromCharCode(cs[i]));
 return {enc};
}

function metaByName(s,name){const i=s.inputNames.indexOf(name);return i>=0?s.inputMetadata[i]:null}
function dimsOf(meta,fallback){if(!meta?.shape?.length)return fallback;return meta.shape.map((x,i)=>typeof x==="number"&&x>0?x:fallback[i]??1)}
function tensor(meta,values,dims){
 const O=ort,type=meta?.type||"float32";
 if(type==="float16")return new O.Tensor("float16",toF16(values),dims);
 if(type==="float32")return new O.Tensor("float32",values instanceof Float32Array?values:Float32Array.from(values),dims);
 if(type==="int64")return new O.Tensor("int64",BigInt64Array.from(Array.from(values,x=>BigInt(Math.round(Number(x))))),dims);
 if(type==="int32")return new O.Tensor("int32",Int32Array.from(values),dims);
 throw new Error("Unsupported tensor type "+type);
}
async function encodeText(prompt){
 const ids=tokenizer.encode(prompt),feeds={};
 for(let i=0;i<sessions.text.inputNames.length;i++){
  const n=sessions.text.inputNames[i],m=sessions.text.inputMetadata[i];
  if(n.includes("input_ids"))feeds[n]=tensor(m,ids,dimsOf(m,[1,77]));
  else if(n.includes("attention_mask"))feeds[n]=tensor(m,new Array(77).fill(1),dimsOf(m,[1,77]));
  else throw new Error("Unsupported text input "+n);
 }
 const out=await sessions.text.run(feeds);
 return out.last_hidden_state||out[sessions.text.outputNames[0]];
}
async function runUnet(latents,t,embedding){
 const feeds={};
 for(let i=0;i<sessions.unet.inputNames.length;i++){
  const n=sessions.unet.inputNames[i],m=sessions.unet.inputMetadata[i];
  if(n==="sample"||n.includes("sample"))feeds[n]=tensor(m,latents,dimsOf(m,[1,4,64,64]));
  else if(n.includes("timestep"))feeds[n]=tensor(m,[t],dimsOf(m,[1]));
  else if(n.includes("encoder_hidden_states"))feeds[n]=embedding;
  else throw new Error("Unsupported UNet input "+n);
 }
 const out=await sessions.unet.run(feeds);
 return tensorToF32(out.out_sample||out.sample||out[sessions.unet.outputNames[0]]);
}
async function decode(latents){
 const scaled=new Float32Array(latents.length);
 for(let i=0;i<latents.length;i++)scaled[i]=latents[i]/0.18215;
 const n=sessions.vae.inputNames[0],m=sessions.vae.inputMetadata[0];
 const out=await sessions.vae.run({[n]:tensor(m,scaled,dimsOf(m,[1,4,64,64]))});
 return tensorToF32(out.sample||out[sessions.vae.outputNames[0]]);
}

function betas(){
 const N=1000,a=Math.sqrt(0.00085),b=Math.sqrt(0.012),cum=new Float64Array(N);
 let prod=1;
 for(let i=0;i<N;i++){
  const x=a+(b-a)*(i/(N-1)),beta=x*x;
  prod*=1-beta;cum[i]=prod;
 }
 return cum;
}
const ALPHAS=betas();
function timesteps(n){
 const out=[];for(let i=0;i<n;i++)out.push(Math.round(999-(999*i/(n-1))));
 return out;
}
function ddimStep(x,eps,t,prevT){
 const at=ALPHAS[t],ap=prevT>=0?ALPHAS[prevT]:1;
 const sa=Math.sqrt(at),sb=Math.sqrt(1-at),spa=Math.sqrt(ap),spb=Math.sqrt(1-ap);
 const y=new Float32Array(x.length);
 for(let i=0;i<x.length;i++){
  const x0=(x[i]-sb*eps[i])/sa;
  y[i]=spa*x0+spb*eps[i];
 }
 return y;
}
function randn(size,seed){
 const r=mulberry32(seed>>>0),a=new Float32Array(size);
 for(let i=0;i<size;i+=2){
  const u=Math.max(r(),1e-7),v=r(),mag=Math.sqrt(-2*Math.log(u));
  a[i]=mag*Math.cos(2*Math.PI*v);if(i+1<size)a[i+1]=mag*Math.sin(2*Math.PI*v);
 }
 return a;
}
function mulberry32(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
export async function generate({prompt,seed=1,steps=6,guidance=7.0,onProgress=()=>{}}){
 if(!sessions.text||!sessions.unet||!sessions.vae)throw new Error("Engine not loaded");
 steps=Math.max(4,Math.min(12,Math.round(steps)));
 onProgress({phase:"encode",message:"Encoding prompt",pct:2});
 const uncond=await encodeText("");
 const cond=await encodeText(prompt);
 let x=randn(4*64*64,seed);
 const ts=timesteps(steps);
 for(let si=0;si<ts.length;si++){
  const t=ts[si],prev=si+1<ts.length?ts[si+1]:-1;
  onProgress({phase:"denoise",message:"Denoising "+(si+1)+"/"+steps,pct:5+Math.round(si/steps*82)});
  const eu=await runUnet(x,t,uncond);
  const ec=await runUnet(x,t,cond);
  const eps=new Float32Array(x.length);
  for(let i=0;i<eps.length;i++)eps[i]=eu[i]+guidance*(ec[i]-eu[i]);
  x=ddimStep(x,eps,t,prev);
  await sleep();
 }
 onProgress({phase:"decode",message:"Decoding image",pct:90});
 const rgb=await decode(x);
 const blob=await rgbToBlob(rgb,512,512);
 onProgress({phase:"complete",message:"Image ready",pct:100});
 return blob;
}
async function rgbToBlob(rgb,w,h){
 const px=new Uint8ClampedArray(w*h*4);let o=0;
 const plane=w*h;
 for(let i=0;i<plane;i++){
  px[o++]=clampByte(rgb[i]);
  px[o++]=clampByte(rgb[plane+i]);
  px[o++]=clampByte(rgb[2*plane+i]);
  px[o++]=255;
 }
 const c=document.createElement("canvas");c.width=w;c.height=h;
 const ctx=c.getContext("2d");ctx.putImageData(new ImageData(px,w,h),0,0);
 return await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error("PNG encode failed")),"image/png"));
}
function clampByte(v){v=v/2+0.5;return Math.max(0,Math.min(255,Math.round(v*255)))}
function tensorToF32(t){
 if(t.type==="float32")return Float32Array.from(t.data);
 if(t.type==="float16"){
  const d=t.data,out=new Float32Array(d.length);
  if(typeof Float16Array!=="undefined"&&d instanceof Float16Array){for(let i=0;i<d.length;i++)out[i]=d[i];return out}
  for(let i=0;i<d.length;i++)out[i]=f16ToF32(d[i]);return out;
 }
 throw new Error("Unexpected output type "+t.type);
}
function toF16(input){
 if(typeof Float16Array!=="undefined")return Float16Array.from(input);
 const out=new Uint16Array(input.length);for(let i=0;i<input.length;i++)out[i]=f32ToF16(input[i]);return out;
}
const _f32=new Float32Array(1),_u32=new Uint32Array(_f32.buffer);
function f32ToF16(v){
 _f32[0]=v;const x=_u32[0],s=(x>>>16)&0x8000,m=x&0x7fffff,e=(x>>>23)&0xff;
 if(e===255)return s|(m?0x7e00:0x7c00);
 let he=e-127+15;
 if(he>=31)return s|0x7c00;
 if(he<=0){
  if(he<-10)return s;
  const mm=(m|0x800000)>>(1-he);
  return s|((mm+0x1000)>>13);
 }
 return s|(he<<10)|((m+0x1000)>>13);
}
function f16ToF32(h){
 const s=(h&0x8000)<<16,e=(h>>10)&0x1f,m=h&0x3ff;let x;
 if(e===0){if(m===0)x=s;else{let mm=m,ee=-14;while((mm&0x400)===0){mm<<=1;ee--}mm&=0x3ff;x=s|((ee+127)<<23)|(mm<<13)}}
 else if(e===31)x=s|0x7f800000|(m<<13);
 else x=s|((e-15+127)<<23)|(m<<13);
 _u32[0]=x;return _f32[0];
}
export async function unload(){
 for(const k of ["text","unet","vae"]){try{await sessions[k]?.release?.()}catch{}sessions[k]=null}
 tokenizer=null;sessionMeta={};await sleep();
}
export async function purge(){
 await unload();await caches.delete(CACHE);
}
export function modelInfo(){return {name:"Tiny-SD q4f16",payloadMB:635,source:"cursedhelm/aderpy-deepdreamer-onnx"}}
