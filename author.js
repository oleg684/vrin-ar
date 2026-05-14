import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MindARThree } from "mindar-image-three";

const log = window.__log;
const setStatus = window.__setStatus;
const STORAGE_KEY = "vrin_ar_author_token";

let models = [];
let currentIndex = 0;
let sessionToken = localStorage.getItem(STORAGE_KEY) || null;

const allParams = EXHIBITION_CONFIG.artworks.map(a => ({
  x: a.position.x, y: a.position.y, z: a.position.z,
  scale: a.scale, rotY: a.rotation.y
}));

function params() { return allParams[currentIndex]; }
function currentModel() { return models[currentIndex]; }
function $(id) { return document.getElementById(id); }

function centerInnerModel(model) {
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);
}

function updateSliders() {
  const p = params();
  ["x","y","z","scale"].forEach(k => {
    const el = $("inp-" + k);
    const val = $("val-" + k);
    if (el) el.value = p[k];
    if (val) val.textContent = Number(p[k]).toFixed(2);
  });
  const label = $("artwork-label");
  if (label) label.textContent = (currentIndex+1) + " / " + EXHIBITION_CONFIG.artworks.length;
}

function applyToModel() {
  const m = currentModel();
  if (!m) return;
  const p = params();
  m.position.set(p.x, p.y, p.z);
  m.scale.setScalar(p.scale);
  m.rotation.y = THREE.MathUtils.degToRad(p.rotY);
}

// Слайдеры
["x","y","z","scale"].forEach(k => {
  const el = $("inp-" + k);
  if (!el) return;
  el.addEventListener("input", () => {
    params()[k] = parseFloat(el.value);
    const v = $("val-" + k); if (v) v.textContent = params()[k].toFixed(2);
    applyToModel();
  });
});

// ─── Touch: 1 палец=rotY, 2 пальца=move+pinch ───
let touch1=null, touch2=null, lastPinch=null;
const mid = t => ({ x:(t[0].clientX+t[1].clientX)/2, y:(t[0].clientY+t[1].clientY)/2 });
const dist = t => { const dx=t[0].clientX-t[1].clientX, dy=t[0].clientY-t[1].clientY; return Math.sqrt(dx*dx+dy*dy); };

document.addEventListener("touchstart", e => {
  if (e.target.closest("#author-panel, #token-dialog")) return;
  if (e.touches.length===1){ touch1={x:e.touches[0].clientX,y:e.touches[0].clientY}; touch2=null; lastPinch=null; }
  else if (e.touches.length===2){ touch1=null; touch2=mid(e.touches); lastPinch=dist(e.touches); }
}, { passive: false });

document.addEventListener("touchmove", e => {
  if (e.target.closest("#author-panel, #token-dialog")) return;
  if (e.touches.length===1 && touch1) {
    const dx = e.touches[0].clientX - touch1.x;
    params().rotY = Math.round((params().rotY + dx*0.5)*10)/10;
    touch1 = {x:e.touches[0].clientX,y:e.touches[0].clientY};
    applyToModel();
  } else if (e.touches.length===2) {
    const m=mid(e.touches), d=dist(e.touches);
    if (touch2) {
      const dx=(m.x-touch2.x)/window.innerWidth*4, dy=(m.y-touch2.y)/window.innerHeight*4;
      params().x = Math.round((params().x+dx)*100)/100;
      params().y = Math.round((params().y-dy)*100)/100;
    }
    if (lastPinch) params().scale = Math.round(Math.max(0.01,Math.min(2,params().scale*d/lastPinch))*100)/100;
    touch2=m; lastPinch=d;
    updateSliders(); applyToModel();
  }
}, { passive: false });

document.addEventListener("touchend", e => {
  if (e.touches.length===0){touch1=null;touch2=null;lastPinch=null;}
  else if(e.touches.length===1){touch1={x:e.touches[0].clientX,y:e.touches[0].clientY};touch2=null;lastPinch=null;}
}, { passive: false });

// ─── Token dialog ───
function showTokenDialog(onOk) {
  const dlg = $("token-dialog");
  dlg.style.display = "flex";
  $("token-error").style.display = "none";
  $("inp-token").value = "";
  $("btn-token-ok").onclick = async () => {
    const t = $("inp-token").value.trim();
    if (!t.startsWith("ghp_")){ $("token-error").textContent="Токен должен начинаться с ghp_"; $("token-error").style.display="block"; return; }
    $("btn-token-ok").textContent="Проверяю..."; $("btn-token-ok").disabled=true;
    try {
      const r = await fetch("https://api.github.com/repos/oleg684/vrin-ar/contents/config.js",
        { headers:{Authorization:"token "+t,Accept:"application/vnd.github.v3+json"}});
      if (!r.ok) throw new Error("Нет доступа: "+r.status);
      localStorage.setItem(STORAGE_KEY,t); sessionToken=t;
      dlg.style.display="none"; onOk(t);
    } catch(e){ $("token-error").textContent="Ошибка: "+e.message; $("token-error").style.display="block"; }
    $("btn-token-ok").textContent="Сохранить"; $("btn-token-ok").disabled=false;
  };
  $("btn-token-cancel").onclick = () => { dlg.style.display="none"; };
  $("btn-token-clear").onclick = () => { localStorage.removeItem(STORAGE_KEY); sessionToken=null; dlg.style.display="none"; setStatus("Токен удалён"); };
}

async function saveAll(ghToken) {
  const artworksCode = EXHIBITION_CONFIG.artworks.map((a, i) => {
    const p = allParams[i];
    return `    {
      id: "${a.id}",
      title: "${a.title}",
      target: "${a.target}",
      model: "${a.model}",
      position: { x: ${p.x}, y: ${p.y}, z: ${p.z} },
      scale: ${p.scale},
      rotation: { x: 0, y: ${p.rotY}, z: 0 }
    }`;
  }).join(",\n");

  const newConfig = `// Конфигурация AR-выставки
const EXHIBITION_CONFIG = {
  artworks: [
${artworksCode}
  ]
};`;

  const metaR = await fetch("https://api.github.com/repos/oleg684/vrin-ar/contents/config.js",
    { headers:{Authorization:"token "+ghToken,Accept:"application/vnd.github.v3+json"}});
  if (!metaR.ok) throw new Error("Нет доступа: "+metaR.status);
  const meta = await metaR.json();

  const upR = await fetch("https://api.github.com/repos/oleg684/vrin-ar/contents/config.js",{
    method:"PUT",
    headers:{Authorization:"token "+ghToken,"Content-Type":"application/json",Accept:"application/vnd.github.v3+json"},
    body:JSON.stringify({message:"Author: update artworks",content:btoa(unescape(encodeURIComponent(newConfig))),sha:meta.sha})
  });
  if (!upR.ok){ const e=await upR.json(); if(upR.status===401||upR.status===403){localStorage.removeItem(STORAGE_KEY);sessionToken=null;} throw new Error(e.message||upR.status); }
}

async function doSave() {
  const btn=$("btn-save");
  btn.textContent="Сохраняю..."; btn.disabled=true;
  try {
    await saveAll(sessionToken);
    setStatus("✅ Сохранено!");
    setTimeout(()=>setStatus("Наведите камеру на картину"), 3000);
  } catch(e) {
    if(!sessionToken) showTokenDialog(doSave);
    else setStatus("Ошибка: "+e.message);
  }
  btn.textContent="💾 Сохранить"; btn.disabled=false;
}

$("btn-save").addEventListener("click", () => { sessionToken ? doSave() : showTokenDialog(doSave); });
$("btn-reset").addEventListener("click", () => {
  const a = EXHIBITION_CONFIG.artworks[currentIndex];
  allParams[currentIndex] = { x:a.position.x, y:a.position.y, z:a.position.z, scale:a.scale, rotY:a.rotation.y };
  updateSliders(); applyToModel();
});
$("btn-change-token").addEventListener("click", () => showTokenDialog(() => setStatus("Токен обновлён")));

// ─── AR ───
(async () => {
  try {
    setStatus("Подготовка...");
    updateSliders();
    if (!sessionToken) showTokenDialog(() => log("[author] token set"));

    const mindarThree = new MindARThree({
      container: document.body,
      imageTargetSrc: "assets/targets/targets.mind",
      maxTrack: 1,
      uiLoading:"no", uiScanning:"no", uiError:"no",
      filterMinCF: 0.001, filterBeta: 0.001
    });

    const { renderer, scene, camera } = mindarThree;
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/");
    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    scene.add(new THREE.HemisphereLight(0xffffff,0x444444,1.5));
    const dir = new THREE.DirectionalLight(0xffffff,1); dir.position.set(1,1,1); scene.add(dir);

    setStatus("Загрузка моделей...");

    for (let i=0; i<EXHIBITION_CONFIG.artworks.length; i++) {
      const artwork = EXHIBITION_CONFIG.artworks[i];
      const anchor = mindarThree.addAnchor(i);

      anchor.onTargetFound = () => {
        currentIndex = i;
        updateSliders();
        setStatus("");
        log("[ar] TARGET " + i);
      };
      anchor.onTargetLost = () => {
        setStatus("Наведите камеру на картину");
      };

      try {
        const gltf = await new Promise((res,rej) => loader.load(artwork.model, res, undefined, rej));
        const group = new THREE.Group();
        const inner = gltf.scene;
        centerInnerModel(inner);
        group.add(inner);
        const p = allParams[i];
        group.position.set(p.x, p.y, p.z);
        group.scale.setScalar(p.scale);
        group.rotation.y = THREE.MathUtils.degToRad(p.rotY);
        anchor.group.add(group);
        models[i] = group;
        log("[author] model " + i + " loaded");
      } catch(e) {
        log("[author] model " + i + " FAIL: " + e.message, "error");
      }
    }

    setStatus("Запуск камеры...");
    await mindarThree.start();
    setStatus("Наведите камеру на картину");
    log("[author] camera live");

    renderer.setAnimationLoop(() => renderer.render(scene, camera));

  } catch(err) {
    log("[author] CRASH: " + (err.message || err), "error");
    setStatus("Ошибка: " + (err.message || err));
  }
})();