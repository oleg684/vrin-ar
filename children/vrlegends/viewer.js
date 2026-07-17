import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MindARThree } from "mindar-image-three";

const log = (m) => console.log(m);
const setStatus = (t) => { const el=document.getElementById("status-bar"); if(el){el.textContent=t;el.style.opacity=t?"1":"0";} };

let CONFIG = null;
const models = [];
const audioEls = [];
let activeIndex = -1;
let isMuted = false;
let audioUnlocked = false;
const FADE_MS = 800;

// ── Кнопка звука ──
const muteBtn = document.createElement("div");
muteBtn.id = "mute-btn";
muteBtn.textContent = "🔊";
muteBtn.style.cssText = "position:fixed;top:1rem;right:1rem;width:42px;height:42px;border-radius:50%;background:rgba(0,0,0,0.5);color:#fff;font-size:18px;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:100;user-select:none;-webkit-user-select:none;";
document.body.appendChild(muteBtn);
muteBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  isMuted = !isMuted;
  muteBtn.textContent = isMuted ? "🔇" : "🔊";
  audioEls.forEach(a => { if (a) a.muted = isMuted; });
});

// ── Разблокировка аудио по первому касанию (autoplay policy) ──
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  audioEls.forEach(a => {
    if (!a) return;
    // короткий play/pause «разогревает» элемент в рамках жеста пользователя
    a.play().then(() => { a.pause(); a.currentTime = 0; }).catch(()=>{});
  });
  // если уже есть активная сцена со звуком — запускаем
  if (activeIndex >= 0 && audioEls[activeIndex]) startAudio(activeIndex);
  log("[audio] unlocked");
}
document.addEventListener("touchstart", unlockAudio, { once: false });
document.addEventListener("click", unlockAudio, { once: false });

// ── Fade через WebAudio-независимый volume ramp ──
function startAudio(i) {
  const a = audioEls[i];
  if (!a || !audioUnlocked) return;
  a.muted = isMuted;
  a.currentTime = 0;
  a.volume = 0;
  a.play().then(() => fade(a, a._targetVol ?? 0.8, FADE_MS)).catch(()=>{});
}
function stopAudio(i) {
  const a = audioEls[i];
  if (!a || a.paused) return;
  fade(a, 0, FADE_MS, () => { a.pause(); a.currentTime = 0; });
}
function fade(audio, target, ms, done) {
  if (audio._fadeTimer) clearInterval(audio._fadeTimer);
  const start = audio.volume;
  const steps = 24, dt = ms/steps;
  let n = 0;
  audio._fadeTimer = setInterval(() => {
    n++;
    const v = start + (target - start) * (n/steps);
    audio.volume = Math.max(0, Math.min(1, v));
    if (n >= steps) { clearInterval(audio._fadeTimer); audio._fadeTimer = null; if (done) done(); }
  }, dt);
}

// ── Touch: 1 палец вращение, 2 пальца пинч ──
let lastTouch=null, lastPinch=null;
document.addEventListener("touchstart", e => {
  if (e.target.closest("#mute-btn")) return;
  if (e.touches.length===1){ lastTouch={x:e.touches[0].clientX,y:e.touches[0].clientY}; lastPinch=null; }
  else if (e.touches.length===2){ const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY; lastPinch=Math.sqrt(dx*dx+dy*dy); lastTouch=null; }
}, {passive:false});
document.addEventListener("touchmove", e => {
  const m = models[activeIndex];
  if (!m) return;
  if (e.touches.length===1 && lastTouch){
    m.rotation.y += (e.touches[0].clientX-lastTouch.x)*0.012;
    m.rotation.x += (e.touches[0].clientY-lastTouch.y)*0.012;
    lastTouch={x:e.touches[0].clientX,y:e.touches[0].clientY};
  } else if (e.touches.length===2 && lastPinch){
    const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY;
    const d=Math.sqrt(dx*dx+dy*dy);
    m.scale.setScalar(Math.max(0.01,Math.min(2,m.scale.x*d/lastPinch)));
    lastPinch=d;
  }
}, {passive:false});
document.addEventListener("touchend", e => {
  if (e.touches.length===0){lastTouch=null;lastPinch=null;}
  else if(e.touches.length===1){lastTouch={x:e.touches[0].clientX,y:e.touches[0].clientY};lastPinch=null;}
}, {passive:false});

// ── Загрузка config.json (относительно текущей папки) ──
async function loadConfig() {
  const r = await fetch("config.json?v=" + Date.now());
  if (!r.ok) throw new Error("config.json не найден (" + r.status + ")");
  return r.json();
}

(async () => {
  try {
    setStatus("Загрузка выставки...");
    CONFIG = await loadConfig();
    if (!CONFIG.artworks || !CONFIG.artworks.length) { setStatus("Нет сцен"); return; }

    const mindarThree = new MindARThree({
      container: document.body,
      imageTargetSrc: "assets/targets/targets.mind",
      maxTrack: 1, uiLoading:"no", uiScanning:"no", uiError:"no",
      filterMinCF: 0.001, filterBeta: 0.001
    });
    const { renderer, scene, camera } = mindarThree;

    const draco = new DRACOLoader();
    draco.setDecoderPath("https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/");
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);

    scene.add(new THREE.HemisphereLight(0xffffff,0x444444,1.5));
    const dir=new THREE.DirectionalLight(0xffffff,1); dir.position.set(1,1,1); scene.add(dir);

    setStatus("Загрузка моделей...");
    for (let i=0;i<CONFIG.artworks.length;i++){
      const art=CONFIG.artworks[i];
      const anchor=mindarThree.addAnchor(i);

      // аудио
      if (art.audio){
        const a=new Audio(art.audio);
        a.loop = art.audioLoop !== false;
        a.preload="auto";
        a.volume=0;
        a._targetVol = art.audioVolume ?? 0.8;
        audioEls[i]=a;
      } else audioEls[i]=null;

      anchor.onTargetFound=()=>{
        activeIndex=i; setStatus("");
        audioEls.forEach((a,j)=>{ if(j!==i&&a&&!a.paused) stopAudio(j); });
        if (audioEls[i]) startAudio(i);
      };
      anchor.onTargetLost=()=>{
        if(activeIndex===i) activeIndex=-1;
        setStatus("Наведите камеру на картину");
        if (audioEls[i]) stopAudio(i);
      };

      try {
        const gltf=await new Promise((res,rej)=>loader.load(art.model,res,undefined,rej));
        const group=new THREE.Group();
        const inner=gltf.scene;
        const box=new THREE.Box3().setFromObject(inner);
        inner.position.sub(box.getCenter(new THREE.Vector3()));
        group.add(inner);
        group.position.set(art.position.x,art.position.y,art.position.z);
        group.scale.setScalar(art.scale);
        group.rotation.set(
          THREE.MathUtils.degToRad(art.rotation.x),
          THREE.MathUtils.degToRad(art.rotation.y),
          THREE.MathUtils.degToRad(art.rotation.z));
        anchor.group.add(group);
        models[i]=group;
      } catch(e){ log("[viewer] model "+i+" FAIL: "+e.message); }
    }

    setStatus("Запуск камеры...");
    await mindarThree.start();
    setStatus("Наведите камеру на картину");
    renderer.setAnimationLoop(()=>renderer.render(scene,camera));
  } catch(err){
    setStatus("Ошибка: "+(err.message||err));
  }
})();
