// Outdoor AR viewer — режимы: world / overlay / image
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

const setStatus = (t) => { const el=document.getElementById("status-bar"); if(el){el.textContent=t;el.style.opacity=t?"1":"0";} };
let CONFIG = null;

async function loadConfig() {
  // Имя конфига = имя html-файла с .json
  const jsonUrl = location.pathname.replace(/\.html$/, ".json").split("/").pop();
  const r = await fetch(jsonUrl + "?v=" + Date.now());
  if (!r.ok) throw new Error("config " + r.status);
  return r.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERLAY — контент на весь экран поверх камеры
// ─────────────────────────────────────────────────────────────────────────────
async function initOverlay(cfg) {
  // Камера-фон
  const video = document.createElement("video");
  video.setAttribute("playsinline", "");
  video.setAttribute("muted", "");
  video.muted = true;
  video.style.cssText = "position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;";
  document.body.appendChild(video);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = stream;
    await video.play();
  } catch(e) { setStatus("Нет доступа к камере"); }

  const layer = document.createElement("div");
  layer.style.cssText = "position:fixed;inset:0;z-index:10;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:1rem;pointer-events:none;";
  document.body.appendChild(layer);

  for (const item of cfg.content) {
    if (item.type === "image") {
      const img = document.createElement("img");
      img.src = item.src;
      img.style.cssText = "max-width:90%;max-height:70%;object-fit:contain;pointer-events:auto;";
      layer.appendChild(img);
    } else if (item.type === "video") {
      const v = document.createElement("video");
      v.src = item.src; v.controls = true; v.autoplay = true; v.loop = !!item.loop;
      v.setAttribute("playsinline","");
      v.style.cssText = "max-width:95%;max-height:80%;pointer-events:auto;";
      layer.appendChild(v);
    }
    // 3D в overlay-режиме не имеет смысла — пропускаем
  }
  setStatus("");
}

// ─────────────────────────────────────────────────────────────────────────────
// WORLD — объект висит в пространстве перед камерой (без якоря)
// ─────────────────────────────────────────────────────────────────────────────
async function initWorld(cfg) {
  const video = document.createElement("video");
  video.setAttribute("playsinline",""); video.muted = true;
  video.style.cssText = "position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;";
  document.body.appendChild(video);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:"environment" }});
    video.srcObject = stream; await video.play();
  } catch(e){ setStatus("Нет доступа к камере"); return; }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth/innerHeight, 0.01, 1000);
  const renderer = new THREE.WebGLRenderer({ alpha:true, antialias:true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(devicePixelRatio);
  renderer.domElement.style.cssText = "position:fixed;inset:0;z-index:5;";
  document.body.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff,0x444444,1.5));
  const dir=new THREE.DirectionalLight(0xffffff,1); dir.position.set(1,1,1); scene.add(dir);

  const group = new THREE.Group();
  scene.add(group);

  const draco = new DRACOLoader();
  draco.setDecoderPath("https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/");
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);

  for (const item of cfg.content) {
    if (item.type === "model") {
      try {
        const gltf = await new Promise((res,rej)=>loader.load(item.src,res,undefined,rej));
        const m = gltf.scene;
        const box = new THREE.Box3().setFromObject(m);
        m.position.sub(box.getCenter(new THREE.Vector3()));
        const wrap = new THREE.Group(); wrap.add(m);
        const p = item.position||{x:0,y:0,z:-3};
        wrap.position.set(p.x, p.y, p.z ?? -3);
        wrap.scale.setScalar(item.scale||1);
        group.add(wrap);
      } catch(e){ console.log("model fail", e.message); }
    } else if (item.type === "image" || item.type === "video") {
      let tex, aspect = 1;
      if (item.type === "image") {
        tex = new THREE.TextureLoader().load(item.src, t => { aspect = t.image.width/t.image.height; plane.scale.set(aspect,1,1); });
      } else {
        const vv = document.createElement("video");
        vv.src=item.src; vv.loop=!!item.loop; vv.muted=true; vv.setAttribute("playsinline","");
        vv.play(); tex = new THREE.VideoTexture(vv);
      }
      const mat = new THREE.MeshBasicMaterial({ map:tex, side:THREE.DoubleSide, transparent:true });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(1,1), mat);
      const p = item.position||{x:0,y:0,z:-3};
      plane.position.set(p.x,p.y,p.z ?? -3);
      plane.scale.setScalar(item.scale||1);
      group.add(plane);
    }
  }

  // Интерактив: вращение/масштаб пальцами
  if (cfg.interactive) {
    let lt=null,lp=null;
    document.addEventListener("touchstart",e=>{
      if(e.touches.length===1){lt={x:e.touches[0].clientX,y:e.touches[0].clientY};lp=null;}
      else if(e.touches.length===2){const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY;lp=Math.hypot(dx,dy);lt=null;}
    },{passive:false});
    document.addEventListener("touchmove",e=>{
      e.preventDefault();
      if(e.touches.length===1&&lt){group.rotation.y+=(e.touches[0].clientX-lt.x)*0.01;group.rotation.x+=(e.touches[0].clientY-lt.y)*0.01;lt={x:e.touches[0].clientX,y:e.touches[0].clientY};}
      else if(e.touches.length===2&&lp){const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY;const d=Math.hypot(dx,dy);group.scale.multiplyScalar(d/lp);lp=d;}
    },{passive:false});
    document.addEventListener("touchend",e=>{if(e.touches.length===0){lt=null;lp=null;}},{passive:false});
  }

  addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
  renderer.setAnimationLoop(()=>renderer.render(scene,camera));
  setStatus("");
}

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE — объект привязан к картинке-якорю (MindAR)
// ─────────────────────────────────────────────────────────────────────────────
async function initImage(cfg) {
  const { MindARThree } = await import("mindar-image-three");
  const mindar = new MindARThree({
    container: document.body,
    imageTargetSrc: cfg.anchorMind || "anchor.mind",
    maxTrack: 1, uiLoading:"no", uiScanning:"no", uiError:"no",
    filterMinCF: 0.001, filterBeta: 0.001
  });
  const { renderer, scene, camera } = mindar;
  scene.add(new THREE.HemisphereLight(0xffffff,0x444444,1.5));
  const dir=new THREE.DirectionalLight(0xffffff,1); dir.position.set(1,1,1); scene.add(dir);

  const anchor = mindar.addAnchor(0);
  const draco = new DRACOLoader();
  draco.setDecoderPath("https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/");
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);

  for (const item of cfg.content) {
    if (item.type === "model") {
      try {
        const gltf = await new Promise((res,rej)=>loader.load(item.src,res,undefined,rej));
        const m=gltf.scene; const box=new THREE.Box3().setFromObject(m);
        m.position.sub(box.getCenter(new THREE.Vector3()));
        const wrap=new THREE.Group(); wrap.add(m);
        const p=item.position||{x:0,y:0,z:0};
        wrap.position.set(p.x,p.y,p.z);
        wrap.scale.setScalar(item.scale||0.5);
        anchor.group.add(wrap);
      } catch(e){ console.log(e.message); }
    } else if (item.type==="image"||item.type==="video") {
      let tex;
      if(item.type==="image") tex=new THREE.TextureLoader().load(item.src);
      else { const vv=document.createElement("video"); vv.src=item.src;vv.loop=!!item.loop;vv.muted=true;vv.setAttribute("playsinline","");vv.play(); tex=new THREE.VideoTexture(vv); }
      const plane=new THREE.Mesh(new THREE.PlaneGeometry(1,1), new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide,transparent:true}));
      const p=item.position||{x:0,y:0,z:0};
      plane.position.set(p.x,p.y,p.z); plane.scale.setScalar(item.scale||1);
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
    setStatus("Загрузка...");
    CONFIG = await loadConfig();
    const mode = CONFIG.displayMode || "world";
    if (mode === "overlay") await initOverlay(CONFIG);
    else if (mode === "image") await initImage(CONFIG);
    else await initWorld(CONFIG);
  } catch(err) {
    setStatus("Ошибка: " + (err.message||err));
  }
})();
