// Outdoor AR viewer — режимы: world / overlay / image
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

const setStatus = (t) => { const el=document.getElementById("status-bar"); if(el){el.textContent=t;el.style.opacity=t?"1":"0";} };
let CONFIG = null;
const pendingVideos = []; // видео, которые надо запустить по касанию

function loadConfigUrl(){ return location.pathname.replace(/\.html$/, ".json").split("/").pop(); }
async function loadConfig() {
  const r = await fetch(loadConfigUrl() + "?v=" + Date.now());
  if (!r.ok) throw new Error("config " + r.status);
  return r.json();
}

// Экран "нажмите чтобы начать" — нужен для камеры и автоплея видео
function tapGate() {
  return new Promise(resolve => {
    const g = document.createElement("div");
    g.style.cssText = "position:fixed;inset:0;z-index:500;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:sans-serif;gap:1rem;cursor:pointer;";
    g.innerHTML = '<div style="font-size:48px;">▶️</div><div style="font-size:16px;">Нажмите, чтобы запустить AR</div>';
    g.addEventListener("click", () => { g.remove(); resolve(); }, { once:true });
    document.body.appendChild(g);
  });
}

// Создаёт видео-элемент, готовый к воспроизведению на мобильных
function makeVideo(src, loop) {
  const v = document.createElement("video");
  v.src = src;
  v.loop = loop !== false;
  v.muted = true;              // обязательно для автоплея
  v.playsInline = true;
  v.setAttribute("playsinline","");
  v.setAttribute("webkit-playsinline","");
  v.setAttribute("muted","");
  v.crossOrigin = "anonymous";
  v.preload = "auto";
  // держим в DOM (скрыто) — иначе часть браузеров не декодирует кадры для текстуры
  v.style.cssText = "position:fixed;width:2px;height:2px;opacity:0.01;pointer-events:none;left:-10px;top:-10px;";
  document.body.appendChild(v);
  pendingVideos.push(v);
  return v;
}

async function startCamera() {
  const video = document.createElement("video");
  video.setAttribute("playsinline",""); video.muted = true; video.playsInline = true;
  video.style.cssText = "position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;";
  document.body.appendChild(video);
  const stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:"environment" }, audio:false });
  video.srcObject = stream; await video.play();
  return video;
}

// ─────────────────────────────────── OVERLAY ───────────────────────────────────
async function initOverlay(cfg) {
  try { await startCamera(); } catch(e){ setStatus("Нет доступа к камере"); }
  const layer = document.createElement("div");
  layer.style.cssText = "position:fixed;inset:0;z-index:10;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:1rem;padding:1rem;";
  document.body.appendChild(layer);
  for (const item of cfg.content||[]) {
    if (item.type === "image") {
      const img = document.createElement("img");
      img.src = item.src;
      img.style.cssText = "max-width:92%;max-height:75%;object-fit:contain;border-radius:8px;opacity:"+(item.opacity ?? 1)+";";
      layer.appendChild(img);
    } else if (item.type === "video") {
      const v = makeVideo(item.src, item.loop);
      v.style.cssText = "max-width:95%;max-height:80%;border-radius:8px;opacity:"+(item.opacity ?? 1)+";";
      v.controls = true;
      layer.appendChild(v);
    }
  }
  setStatus("");
}

// ─────────────────────────────────── WORLD ───────────────────────────────────
async function initWorld(cfg) {
  try { await startCamera(); } catch(e){ setStatus("Нет доступа к камере"); return; }

  // элементы с mode:fullscreen показываем оверлеем, остальное — в 3D
  const fullscreenItems = (cfg.content||[]).filter(i => i.mode === "fullscreen" && i.type !== "model");
  const spaceItems = (cfg.content||[]).filter(i => !(i.mode === "fullscreen" && i.type !== "model"));

  if (fullscreenItems.length) {
    const layer = document.createElement("div");
    layer.style.cssText = "position:fixed;inset:0;z-index:10;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:1rem;padding:1rem;pointer-events:none;";
    document.body.appendChild(layer);
    for (const item of fullscreenItems) {
      if (item.type==="image"){ const img=document.createElement("img");img.src=item.src;img.style.cssText="max-width:92%;max-height:75%;object-fit:contain;pointer-events:auto;border-radius:8px;opacity:"+(item.opacity ?? 1)+";";layer.appendChild(img); }
      else { const v=makeVideo(item.src,item.loop);v.style.cssText="max-width:95%;max-height:80%;pointer-events:auto;border-radius:8px;opacity:"+(item.opacity ?? 1)+";";v.controls=true;layer.appendChild(v); }
    }
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth/innerHeight, 0.01, 1000);
  const renderer = new THREE.WebGLRenderer({ alpha:true, antialias:true });
  renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(devicePixelRatio);
  renderer.domElement.style.cssText = "position:fixed;inset:0;z-index:5;";
  document.body.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xffffff,0x444444,1.5));
  const dir=new THREE.DirectionalLight(0xffffff,1); dir.position.set(1,1,1); scene.add(dir);
  const group = new THREE.Group(); scene.add(group);

  const draco = new DRACOLoader(); draco.setDecoderPath("https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/");
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);

  for (const item of spaceItems) {
    if (item.type === "model") {
      try {
        const gltf = await new Promise((res,rej)=>loader.load(item.src,res,undefined,rej));
        const m=gltf.scene; const box=new THREE.Box3().setFromObject(m);
        m.position.sub(box.getCenter(new THREE.Vector3()));
        if((item.opacity ?? 1) < 1){ m.traverse(o=>{ if(o.isMesh&&o.material){ o.material.transparent=true; o.material.opacity=item.opacity; } }); }
        const wrap=new THREE.Group(); wrap.add(m);
        const p=item.position||{x:0,y:0,z:-3}; wrap.position.set(p.x,p.y,p.z ?? -3);
        wrap.scale.setScalar(item.scale||1);
        if(item.rotationY) wrap.rotation.y = THREE.MathUtils.degToRad(item.rotationY);
        group.add(wrap);
      } catch(e){ console.log("model fail", e.message); }
    } else {
      let tex, plane;
      if (item.type === "image") {
        tex = new THREE.TextureLoader().load(item.src, t => { const a=t.image.width/t.image.height; plane.scale.set(a,1,1); });
      } else {
        const vv = makeVideo(item.src, item.loop); tex = new THREE.VideoTexture(vv);
        vv.addEventListener("loadedmetadata", () => { const a=vv.videoWidth/vv.videoHeight; plane.scale.set(a,1,1); });
      }
      const mat = new THREE.MeshBasicMaterial({ map:tex, side:THREE.DoubleSide, transparent:true, opacity: item.opacity ?? 1 });
      plane = new THREE.Mesh(new THREE.PlaneGeometry(1,1), mat);
      const p=item.position||{x:0,y:0,z:-3}; plane.position.set(p.x,p.y,p.z ?? -3);
      plane.scale.setScalar(item.scale||1);
      if(item.rotationY) plane.rotation.y = THREE.MathUtils.degToRad(item.rotationY);
      group.add(plane);
    }
  }

  if (cfg.interactive) {
    let lt=null,lp=null;
    document.addEventListener("touchstart",e=>{
      if(e.touches.length===1){lt={x:e.touches[0].clientX,y:e.touches[0].clientY};lp=null;}
      else if(e.touches.length===2){const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY;lp=Math.hypot(dx,dy);lt=null;}
    },{passive:false});
    document.addEventListener("touchmove",e=>{
      if(e.touches.length===1&&lt){group.rotation.y+=(e.touches[0].clientX-lt.x)*0.01;group.rotation.x+=(e.touches[0].clientY-lt.y)*0.01;lt={x:e.touches[0].clientX,y:e.touches[0].clientY};}
      else if(e.touches.length===2&&lp){const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY;const d=Math.hypot(dx,dy);group.scale.multiplyScalar(d/lp);lp=d;}
    },{passive:false});
    document.addEventListener("touchend",e=>{if(e.touches.length===0){lt=null;lp=null;}},{passive:false});
  }

  addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
  renderer.setAnimationLoop(()=>renderer.render(scene,camera));
  setStatus("");
}

// ─────────────────────────────────── IMAGE (MindAR) ───────────────────────────────────
async function initImage(cfg) {
  // Проверяем, что якорь скомпилирован — иначе MindAR виснет
  const mindFile = cfg.anchorMind || "anchor.mind";
  try {
    const chk = await fetch(mindFile + "?t=" + Date.now(), { method: "HEAD" });
    if (!chk.ok) throw new Error();
  } catch(e) {
    setStatus("Якорь не скомпилирован. В админке нажмите «Скомпилировать якорь» или выберите режим «На весь экран».");
    return;
  }
  const { MindARThree } = await import("mindar-image-three");
  const mindar = new MindARThree({
    container: document.body,
    imageTargetSrc: mindFile,
    maxTrack: 1, uiLoading:"no", uiScanning:"no", uiError:"no",
    filterMinCF: 0.001, filterBeta: 0.001
  });
  const { renderer, scene, camera } = mindar;
  scene.add(new THREE.HemisphereLight(0xffffff,0x444444,1.5));
  const dir=new THREE.DirectionalLight(0xffffff,1); dir.position.set(1,1,1); scene.add(dir);
  const anchor = mindar.addAnchor(0);
  const draco = new DRACOLoader(); draco.setDecoderPath("https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/");
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);

  for (const item of cfg.content||[]) {
    if (item.type === "model") {
      try {
        const gltf = await new Promise((res,rej)=>loader.load(item.src,res,undefined,rej));
        const m=gltf.scene; const box=new THREE.Box3().setFromObject(m);
        m.position.sub(box.getCenter(new THREE.Vector3()));
        if((item.opacity ?? 1) < 1){ m.traverse(o=>{ if(o.isMesh&&o.material){ o.material.transparent=true; o.material.opacity=item.opacity; } }); }
        const wrap=new THREE.Group(); wrap.add(m);
        const p=item.position||{x:0,y:0,z:0}; wrap.position.set(p.x,p.y,p.z);
        wrap.scale.setScalar(item.scale||0.5);
        if(item.rotationY) wrap.rotation.y = THREE.MathUtils.degToRad(item.rotationY);
        anchor.group.add(wrap);
      } catch(e){ console.log(e.message); }
    } else {
      let tex, plane;
      if(item.type==="image") tex=new THREE.TextureLoader().load(item.src,t=>{const a=t.image.width/t.image.height;plane.scale.set(a,1,1);});
      else { const vv=makeVideo(item.src,item.loop); tex=new THREE.VideoTexture(vv); vv.addEventListener("loadedmetadata",()=>{const a=vv.videoWidth/vv.videoHeight;plane.scale.set(a,1,1);}); }
      plane=new THREE.Mesh(new THREE.PlaneGeometry(1,1), new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide,transparent:true,opacity:item.opacity ?? 1}));
      const p=item.position||{x:0,y:0,z:0}; plane.position.set(p.x,p.y,p.z); plane.scale.setScalar(item.scale||1);
      if(item.rotationY) plane.rotation.y = THREE.MathUtils.degToRad(item.rotationY);
      anchor.group.add(plane);
    }
  }
  anchor.onTargetFound=()=>setStatus("");
  anchor.onTargetLost=()=>setStatus("Наведите на картинку-якорь");
  await mindar.start();
  renderer.setAnimationLoop(()=>renderer.render(scene,camera));
  setStatus("Наведите на картинку-якорь");
}

// ─── Роутер ───
(async () => {
  try {
    CONFIG = await loadConfig();
    const mode = CONFIG.displayMode || "world";
    // Ждём касание — камера и видео требуют жеста пользователя
    await tapGate();
    setStatus("Запуск...");
    if (mode === "overlay") await initOverlay(CONFIG);
    else if (mode === "image") await initImage(CONFIG);
    else await initWorld(CONFIG);
    // Запускаем все видео (жест уже был на tapGate)
    for (const v of pendingVideos) { v.play().catch(()=>{}); }
  } catch(err) {
    setStatus("Ошибка: " + (err.message||err));
  }
})();
