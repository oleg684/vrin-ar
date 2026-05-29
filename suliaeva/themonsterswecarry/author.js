import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MindARThree } from "mindar-image-three";

const setStatus = (t) => { const el=document.getElementById("status-bar"); if(el){el.textContent=t;el.style.opacity=t?"1":"0";} };
const STORAGE_KEY = "vrin_ar_author_token";

let CONFIG = null;
let models = [];
let currentIndex = 0;
let allParams = [];
let sessionToken = localStorage.getItem(STORAGE_KEY) || null;
let configSha = null;
const EXHIB = location.pathname.replace(/\/author\.html$/, "").replace(/^\//, "").replace(/\/$/, ""); // artist/slug

function p(){ return allParams[currentIndex]; }
function $(id){ return document.getElementById(id); }

function centerInner(m){ const b=new THREE.Box3().setFromObject(m); m.position.sub(b.getCenter(new THREE.Vector3())); }

function updateSliders(){
  const pr=p();
  ["x","y","z","scale"].forEach(k=>{const el=$("inp-"+k);const v=$("val-"+k);if(el)el.value=pr[k];if(v)v.textContent=Number(pr[k]).toFixed(2);});
  const lbl=$("artwork-label"); if(lbl) lbl.textContent=(currentIndex+1)+" / "+CONFIG.artworks.length;
}
function applyToModel(){const m=models[currentIndex];if(!m)return;const pr=p();m.position.set(pr.x,pr.y,pr.z);m.scale.setScalar(pr.scale);m.rotation.y=THREE.MathUtils.degToRad(pr.rotY);}

["x","y","z","scale"].forEach(k=>{const el=$("inp-"+k);if(el)el.addEventListener("input",()=>{p()[k]=parseFloat(el.value);$("val-"+k).textContent=p()[k].toFixed(2);applyToModel();});});

let t1=null,t2=null,lp=null;
const mid=t=>({x:(t[0].clientX+t[1].clientX)/2,y:(t[0].clientY+t[1].clientY)/2});
const dist=t=>{const dx=t[0].clientX-t[1].clientX,dy=t[0].clientY-t[1].clientY;return Math.sqrt(dx*dx+dy*dy);};
document.addEventListener("touchstart",e=>{if(e.target.closest("#author-panel,#token-dialog"))return;if(e.touches.length===1){t1={x:e.touches[0].clientX,y:e.touches[0].clientY};t2=null;lp=null;}else if(e.touches.length===2){t1=null;t2=mid(e.touches);lp=dist(e.touches);}},{passive:false});
document.addEventListener("touchmove",e=>{if(e.target.closest("#author-panel,#token-dialog"))return;if(e.touches.length===1&&t1){p().rotY=Math.round((p().rotY+(e.touches[0].clientX-t1.x)*0.5)*10)/10;t1={x:e.touches[0].clientX,y:e.touches[0].clientY};applyToModel();}else if(e.touches.length===2){const m=mid(e.touches),d=dist(e.touches);if(t2){p().x=Math.round((p().x+(m.x-t2.x)/window.innerWidth*4)*100)/100;p().y=Math.round((p().y-(m.y-t2.y)/window.innerHeight*4)*100)/100;}if(lp)p().scale=Math.round(Math.max(0.01,Math.min(2,p().scale*d/lp))*100)/100;t2=m;lp=d;updateSliders();applyToModel();}},{passive:false});
document.addEventListener("touchend",e=>{if(e.touches.length===0){t1=null;t2=null;lp=null;}else if(e.touches.length===1){t1={x:e.touches[0].clientX,y:e.touches[0].clientY};t2=null;lp=null;}},{passive:false});

function showTokenDialog(onOk){
  const d=$("token-dialog");d.style.display="flex";$("token-error").style.display="none";$("inp-token").value="";
  $("btn-token-ok").onclick=async()=>{const t=$("inp-token").value.trim();if(!t.startsWith("ghp_")){$("token-error").textContent="Токен должен начинаться с ghp_";$("token-error").style.display="block";return;}$("btn-token-ok").textContent="Проверяю...";$("btn-token-ok").disabled=true;try{const r=await fetch("https://api.github.com/repos/oleg684/vrin-ar/contents/"+EXHIB+"/config.json",{headers:{Authorization:"token "+t}});if(!r.ok)throw new Error("Нет доступа: "+r.status);localStorage.setItem(STORAGE_KEY,t);sessionToken=t;d.style.display="none";onOk(t);}catch(e){$("token-error").textContent="Ошибка: "+e.message;$("token-error").style.display="block";}$("btn-token-ok").textContent="Сохранить";$("btn-token-ok").disabled=false;};
  $("btn-token-cancel").onclick=()=>{d.style.display="none";};
  $("btn-token-clear").onclick=()=>{localStorage.removeItem(STORAGE_KEY);sessionToken=null;d.style.display="none";setStatus("Токен удалён");};
}

async function saveAll(t){
  const r0=await fetch("https://api.github.com/repos/oleg684/vrin-ar/contents/"+EXHIB+"/config.json",{headers:{Authorization:"token "+t}});
  const meta=await r0.json();
  CONFIG.artworks.forEach((a,i)=>{const pr=allParams[i];a.position={x:pr.x,y:pr.y,z:pr.z};a.scale=pr.scale;a.rotation={x:0,y:pr.rotY,z:0};});
  const txt=JSON.stringify(CONFIG,null,2);
  const r=await fetch("https://api.github.com/repos/oleg684/vrin-ar/contents/"+EXHIB+"/config.json",{method:"PUT",headers:{Authorization:"token "+t,"Content-Type":"application/json"},body:JSON.stringify({message:"Author: update positions",content:btoa(unescape(encodeURIComponent(txt))),sha:meta.sha})});
  if(!r.ok){const e=await r.json();throw new Error(e.message||r.status);}
}
async function doSave(){const btn=$("btn-save");btn.textContent="Сохраняю...";btn.disabled=true;try{await saveAll(sessionToken);setStatus("✅ Сохранено!");setTimeout(()=>setStatus("Наведите камеру на картину"),3000);}catch(e){if(!sessionToken)showTokenDialog(doSave);else setStatus("Ошибка: "+e.message);}btn.textContent="💾 Сохранить";btn.disabled=false;}

$("btn-save").addEventListener("click",()=>{sessionToken?doSave():showTokenDialog(doSave);});
$("btn-reset").addEventListener("click",()=>{const a=CONFIG.artworks[currentIndex];allParams[currentIndex]={x:a.position.x,y:a.position.y,z:a.position.z,scale:a.scale,rotY:a.rotation.y};updateSliders();applyToModel();});
$("btn-change-token").addEventListener("click",()=>showTokenDialog(()=>setStatus("Токен обновлён")));

(async()=>{
  try{
    setStatus("Загрузка...");
    CONFIG=await(await fetch("config.json?v="+Date.now())).json();
    allParams=CONFIG.artworks.map(a=>({x:a.position.x,y:a.position.y,z:a.position.z,scale:a.scale,rotY:a.rotation.y}));
    updateSliders();
    if(!sessionToken)showTokenDialog(()=>{});
    const mindarThree=new MindARThree({container:document.body,imageTargetSrc:"assets/targets/targets.mind",maxTrack:1,uiLoading:"no",uiScanning:"no",uiError:"no",filterMinCF:0.001,filterBeta:0.001});
    const{renderer,scene,camera}=mindarThree;
    const draco=new DRACOLoader();draco.setDecoderPath("https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/");
    const loader=new GLTFLoader();loader.setDRACOLoader(draco);
    scene.add(new THREE.HemisphereLight(0xffffff,0x444444,1.5));const dir=new THREE.DirectionalLight(0xffffff,1);dir.position.set(1,1,1);scene.add(dir);
    setStatus("Загрузка моделей...");
    for(let i=0;i<CONFIG.artworks.length;i++){
      const art=CONFIG.artworks[i];const anchor=mindarThree.addAnchor(i);
      anchor.onTargetFound=()=>{currentIndex=i;updateSliders();setStatus("");};
      anchor.onTargetLost=()=>{setStatus("Наведите камеру на картину");};
      try{const gltf=await new Promise((res,rej)=>loader.load(art.model,res,undefined,rej));const g=new THREE.Group();const inner=gltf.scene;centerInner(inner);g.add(inner);const pr=allParams[i];g.position.set(pr.x,pr.y,pr.z);g.scale.setScalar(pr.scale);g.rotation.y=THREE.MathUtils.degToRad(pr.rotY);anchor.group.add(g);models[i]=g;}catch(e){console.log("model "+i+" fail",e.message);}
    }
    setStatus("Запуск камеры...");await mindarThree.start();setStatus("Наведите камеру на картину");
    renderer.setAnimationLoop(()=>renderer.render(scene,camera));
  }catch(err){setStatus("Ошибка: "+(err.message||err));}
})();
