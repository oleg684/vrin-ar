// Outdoor AR author — позиционирование контента относительно якоря (image) или в пространстве (world)
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

const setStatus=(t)=>{const el=document.getElementById("status-bar");if(el){el.textContent=t;el.style.opacity=t?"1":"0";}};
const $=id=>document.getElementById(id);
const STORAGE_KEY="vrin_ar_author_token";
let sessionToken=localStorage.getItem(STORAGE_KEY)||null;

const objName=location.pathname.split("/").pop().replace("-author.html","");
const eventPath=location.pathname.replace(/\/[^/]+$/,"").replace(/^\//,""); // outdoor/{event}
let CONFIG=null;
let nodes=[];          // THREE-объекты по индексам контента
let current=0;         // выбранный элемент контента
let params=[];         // {x,y,z,scale,rotY,opacity} по индексам

function p(){ return params[current]; }

function applyToNode(){
  const n=nodes[current];if(!n)return;
  const pr=p();
  n.position.set(pr.x,pr.y,pr.z);
  n.scale.setScalar(pr.scale);
  n.rotation.y=THREE.MathUtils.degToRad(pr.rotY);
  applyOpacity(n,pr.opacity);
}
function applyOpacity(node,op){
  node.traverse(o=>{
    if(o.isMesh&&o.material){
      o.material.transparent=true;
      o.material.opacity=op;
    }
  });
}
function updateUI(){
  const pr=p();
  [["x",pr.x],["y",pr.y],["z",pr.z],["scale",pr.scale],["opacity",pr.opacity]].forEach(([k,v])=>{
    const el=$("inp-"+k);const lbl=$("val-"+k);
    if(el)el.value=v;if(lbl)lbl.textContent=Number(v).toFixed(2);
  });
  $("item-label").textContent=(current+1)+" / "+(CONFIG.content||[]).length;
  const it=(CONFIG.content||[])[current];
  $("item-name").textContent=it?(it.name||it.src.split("/").pop()):"—";
}

["x","y","z","scale","opacity"].forEach(k=>{
  const el=$("inp-"+k);
  if(el)el.addEventListener("input",()=>{
    p()[k]=parseFloat(el.value);
    $("val-"+k).textContent=p()[k].toFixed(2);
    applyToNode();
  });
});
$("btn-prev").addEventListener("click",()=>{if(!CONFIG.content?.length)return;current=(current-1+CONFIG.content.length)%CONFIG.content.length;updateUI();});
$("btn-next").addEventListener("click",()=>{if(!CONFIG.content?.length)return;current=(current+1)%CONFIG.content.length;updateUI();});

// Жесты: 1 палец — rotY, 2 пальца — перемещение XY + пинч
let t1=null,t2=null,lp=null;
const mid=t=>({x:(t[0].clientX+t[1].clientX)/2,y:(t[0].clientY+t[1].clientY)/2});
const dist=t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);
document.addEventListener("touchstart",e=>{
  if(e.target.closest("#author-panel,#token-dialog"))return;
  if(e.touches.length===1){t1={x:e.touches[0].clientX,y:e.touches[0].clientY};t2=null;lp=null;}
  else if(e.touches.length===2){t1=null;t2=mid(e.touches);lp=dist(e.touches);}
},{passive:false});
document.addEventListener("touchmove",e=>{
  if(e.target.closest("#author-panel,#token-dialog"))return;
  e.preventDefault();
  if(e.touches.length===1&&t1){
    p().rotY=Math.round((p().rotY+(e.touches[0].clientX-t1.x)*0.5)*10)/10;
    t1={x:e.touches[0].clientX,y:e.touches[0].clientY};applyToNode();
  } else if(e.touches.length===2){
    const m=mid(e.touches),d=dist(e.touches);
    if(t2){p().x=Math.round((p().x+(m.x-t2.x)/window.innerWidth*2)*100)/100;p().y=Math.round((p().y-(m.y-t2.y)/window.innerHeight*2)*100)/100;}
    if(lp)p().scale=Math.round(Math.max(0.01,Math.min(5,p().scale*d/lp))*100)/100;
    t2=m;lp=d;updateUI();applyToNode();
  }
},{passive:false});
document.addEventListener("touchend",e=>{if(e.touches.length===0){t1=null;t2=null;lp=null;}else if(e.touches.length===1){t1={x:e.touches[0].clientX,y:e.touches[0].clientY};t2=null;lp=null;}},{passive:false});

// Токен-диалог
function showTokenDialog(onOk){
  const d=$("token-dialog");d.style.display="flex";$("token-error").style.display="none";$("inp-token").value="";
  $("btn-token-ok").onclick=async()=>{
    const t=$("inp-token").value.trim();
    if(!t.startsWith("ghp_")){$("token-error").textContent="Токен должен начинаться с ghp_";$("token-error").style.display="block";return;}
    $("btn-token-ok").disabled=true;$("btn-token-ok").textContent="Проверяю...";
    try{
      const r=await fetch("https://api.github.com/repos/oleg684/vrin-ar/contents/"+eventPath+"/"+objName+".json",{headers:{Authorization:"token "+t}});
      if(!r.ok)throw new Error(r.status);
      localStorage.setItem(STORAGE_KEY,t);sessionToken=t;d.style.display="none";onOk&&onOk();
    }catch(e){$("token-error").textContent="Нет доступа: "+e.message;$("token-error").style.display="block";}
    $("btn-token-ok").disabled=false;$("btn-token-ok").textContent="Сохранить";
  };
  $("btn-token-cancel").onclick=()=>{d.style.display="none";};
}

async function doSave(){
  if(!sessionToken){showTokenDialog(doSave);return;}
  const btn=$("btn-save");btn.disabled=true;btn.textContent="Сохраняю...";
  try{
    const api="https://api.github.com/repos/oleg684/vrin-ar/contents/"+eventPath+"/"+objName+".json";
    const meta=await(await fetch(api+"?ref=main&t="+Date.now(),{headers:{Authorization:"token "+sessionToken}})).json();
    const cfg=JSON.parse(decodeURIComponent(escape(atob(meta.content.replace(/\n/g,"")))));
    (cfg.content||[]).forEach((it,i)=>{
      const pr=params[i];if(!pr)return;
      it.position={x:pr.x,y:pr.y,z:pr.z};
      it.scale=pr.scale;
      it.rotationY=pr.rotY;
      it.opacity=pr.opacity;
    });
    const txt=JSON.stringify(cfg,null,2);
    const r=await fetch(api,{method:"PUT",headers:{Authorization:"token "+sessionToken,"Content-Type":"application/json"},body:JSON.stringify({message:"Author: positions "+objName,content:btoa(unescape(encodeURIComponent(txt))),sha:meta.sha})});
    if(!r.ok){const e=await r.json();throw new Error(e.message||r.status);}
    setStatus("✅ Сохранено");setTimeout(()=>setStatus(""),2500);
  }catch(e){setStatus("Ошибка: "+e.message);}
  btn.disabled=false;btn.textContent="💾 Сохранить";
}
$("btn-save").addEventListener("click",doSave);
$("btn-reset").addEventListener("click",()=>{
  const it=(CONFIG.content||[])[current];if(!it)return;
  params[current]={x:it.position?.x??0,y:it.position?.y??0,z:it.position?.z??0,scale:it.scale??1,rotY:it.rotationY??0,opacity:it.opacity??1};
  updateUI();applyToNode();
});


// ── Анимированный GIF как THREE-текстура (через canvas) ──
const gifTextures = []; // {canvas, ctx, img, tex}
function makeGifTexture(src, onAspect){
  const img = document.createElement("img");
  img.src = src;
  img.crossOrigin = "anonymous";
  // держим в DOM невидимым — браузер анимирует GIF только у подключённых элементов
  img.style.cssText = "position:fixed;width:2px;height:2px;opacity:0.01;pointer-events:none;left:-10px;top:-10px;";
  document.body.appendChild(img);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  img.addEventListener("load", () => {
    canvas.width = img.naturalWidth || 512;
    canvas.height = img.naturalHeight || 512;
    onAspect && onAspect(canvas.width / canvas.height);
  });
  gifTextures.push({ canvas, ctx, img, tex });
  return tex;
}
function updateGifTextures(){
  for (const g of gifTextures){
    if (g.img.complete && g.canvas.width > 0){
      g.ctx.drawImage(g.img, 0, 0, g.canvas.width, g.canvas.height);
      g.tex.needsUpdate = true;
    }
  }
}
const isGif = (src) => /\.gif(\?|$)/i.test(src);


function tapGate() {
  return new Promise(resolve => {
    const g = document.createElement("div");
    g.style.cssText = "position:fixed;inset:0;z-index:500;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:sans-serif;gap:1rem;cursor:pointer;";
    g.innerHTML = '<div style="font-size:48px;">✏️</div><div style="font-size:16px;">Нажмите, чтобы запустить режим автора</div>';
    g.id = "tap-gate";
    const go = () => { g.remove(); resolve(); };
    g.addEventListener("click", go, { once:true });
    g.addEventListener("touchend", (e) => { e.preventDefault(); go(); }, { once:true });
    document.body.appendChild(g);
  });
}

function makeVideo(src){
  const v=document.createElement("video");
  v.src=src;v.loop=true;v.muted=true;v.playsInline=true;
  v.setAttribute("playsinline","");v.setAttribute("muted","");
  v.dataset.contentVideo="1";
  v.crossOrigin="anonymous";v.preload="auto";
  let holder=document.getElementById("content-videos");
  if(!holder){holder=document.createElement("div");holder.id="content-videos";holder.style.cssText="position:fixed;width:0;height:0;overflow:hidden;";document.body.appendChild(holder);}
  holder.appendChild(v);
  return v;
}

async function buildContent(parent, loader){
  const vids=[];
  for(let i=0;i<(CONFIG.content||[]).length;i++){
    const item=CONFIG.content[i];
    params[i]={
      x:item.position?.x??0, y:item.position?.y??0, z:item.position?.z??(CONFIG.displayMode==='world'?-3:0),
      scale:item.scale??(item.type==='model'?0.5:1),
      rotY:item.rotationY??0,
      opacity:item.opacity??1
    };
    let node=null;
    if(item.type==="model"){
      try{
        const gltf=await new Promise((res,rej)=>loader.load(item.src,res,undefined,rej));
        const m=gltf.scene;const box=new THREE.Box3().setFromObject(m);
        m.position.sub(box.getCenter(new THREE.Vector3()));
        node=new THREE.Group();node.add(m);
      }catch(e){console.log("model",i,e.message);}
    } else {
      let tex;
      if(item.type==="image"){
        if(isGif(item.src))tex=makeGifTexture(item.src);
        else tex=new THREE.TextureLoader().load(item.src);
      }
      else{const vv=makeVideo(item.src);vids.push(vv);tex=new THREE.VideoTexture(vv);}
      node=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide,transparent:true}));
    }
    if(node){
      const pr=params[i];
      node.position.set(pr.x,pr.y,pr.z);
      node.scale.setScalar(pr.scale);
      node.rotation.y=THREE.MathUtils.degToRad(pr.rotY);
      applyOpacity(node,pr.opacity);
      parent.add(node);
      nodes[i]=node;
    }
  }
  return vids;
}

(async()=>{
  try{
    setStatus("Загрузка...");
    CONFIG=await(await fetch(objName+".json?v="+Date.now())).json();
    if(!(CONFIG.content||[]).length){setStatus("Нет контента — добавьте в админке");return;}
    // Жест пользователя — без него getUserMedia на Android виснет
    await tapGate();
    setStatus("Запуск камеры...");
    if(!sessionToken)showTokenDialog();

    const draco=new DRACOLoader();draco.setDecoderPath("https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/");
    const loader=new GLTFLoader();loader.setDRACOLoader(draco);
    const mode=CONFIG.displayMode||"world";

    if(mode==="image"){
      const mindFile=CONFIG.anchorMind;
      if(!mindFile){setStatus("Якорь не скомпилирован — сохраните сцену в админке");return;}
      const{MindARThree}=await import("mindar-image-three");
      const mindar=new MindARThree({container:document.body,imageTargetSrc:mindFile,maxTrack:1,uiLoading:"no",uiScanning:"no",uiError:"no",filterMinCF:0.001,filterBeta:0.001});
      const{renderer,scene,camera}=mindar;
      scene.add(new THREE.HemisphereLight(0xffffff,0x444444,1.5));
      const dir=new THREE.DirectionalLight(0xffffff,1);dir.position.set(1,1,1);scene.add(dir);
      const anchor=mindar.addAnchor(0);
      const vids=await buildContent(anchor.group,loader);
      anchor.onTargetFound=()=>{setStatus("");vids.forEach(v=>v.play().catch(()=>{}));};
      anchor.onTargetLost=()=>setStatus("Наведите на якорь");
      updateUI();
      await mindar.start();
      // MindAR вставляет камеру-видео без стилей — растягиваем на весь экран под канвас
      setTimeout(()=>{
        document.querySelectorAll("video").forEach(v=>{
          if(v.srcObject){ v.style.cssText="position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:1;"; }
        });
        document.querySelectorAll("canvas").forEach(c=>{
          c.style.position="fixed"; c.style.inset="0"; c.style.zIndex="5";
        });
      }, 300);
      setStatus("Наведите на якорь");
      renderer.setAnimationLoop(()=>{updateGifTextures();renderer.render(scene,camera);});
    } else {
      // world: камера + свободная сцена
      const video=document.createElement("video");
      video.setAttribute("playsinline","");video.muted=true;video.playsInline=true;
      video.style.cssText="position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;";
      document.body.appendChild(video);
      try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"},audio:false});video.srcObject=stream;await video.play();}
      catch(e){setStatus("Нет доступа к камере");return;}
      const scene=new THREE.Scene();
      const camera=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,0.01,1000);
      const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});
      renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(devicePixelRatio);
      renderer.domElement.style.cssText="position:fixed;inset:0;z-index:5;";
      document.body.appendChild(renderer.domElement);
      scene.add(new THREE.HemisphereLight(0xffffff,0x444444,1.5));
      const dir=new THREE.DirectionalLight(0xffffff,1);dir.position.set(1,1,1);scene.add(dir);
      const group=new THREE.Group();scene.add(group);
      const vids=await buildContent(group,loader);
      vids.forEach(v=>v.play().catch(()=>{}));
      updateUI();
      addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
      renderer.setAnimationLoop(()=>{updateGifTextures();renderer.render(scene,camera);});
      setStatus("");
    }
  }catch(err){setStatus("Ошибка: "+(err.message||err));}
})();
