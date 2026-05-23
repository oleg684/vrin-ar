import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MindARThree } from "mindar-image-three";

const log = window.__log;
const setStatus = window.__setStatus;

const models = [];
const audioPlayers = [];
let activeModel = null;
let isMuted = false;
const FADE_DURATION = 1.0; // секунды

// ─── Кнопка звука ────────────────────────────────────────────────────────────
const muteBtn = document.createElement("div");
muteBtn.id = "mute-btn";
muteBtn.textContent = "🔊";
muteBtn.style.cssText = `
  position: fixed; top: 1rem; right: 1rem;
  width: 40px; height: 40px; border-radius: 50%;
  background: rgba(0,0,0,0.5); color: #fff;
  font-size: 18px; display: flex; align-items: center; justify-content: center;
  cursor: pointer; z-index: 100; pointer-events: all;
  user-select: none; -webkit-user-select: none;
`;
document.body.appendChild(muteBtn);

muteBtn.addEventListener("click", () => {
  isMuted = !isMuted;
  muteBtn.textContent = isMuted ? "🔇" : "🔊";
  audioPlayers.forEach(p => { if (p) p.muted = isMuted; });
});

// ─── Аудио плеер с fade ───────────────────────────────────────────────────────
function createAudio(src, volume) {
  if (!src) return null;
  const audio = new Audio(src);
  audio.loop = true;
  audio.volume = 0;
  audio.muted = isMuted;
  audio.preload = "auto";
  return audio;
}

function fadeIn(audio, targetVolume, duration) {
  if (!audio) return;
  audio.play().catch(() => {});
  const steps = 30;
  const step = targetVolume / steps;
  const interval = (duration * 1000) / steps;
  let current = 0;
  const timer = setInterval(() => {
    current += step;
    if (current >= targetVolume) { audio.volume = targetVolume; clearInterval(timer); }
    else audio.volume = current;
  }, interval);
}

function fadeOut(audio, duration) {
  if (!audio || audio.paused) return;
  const startVol = audio.volume;
  const steps = 30;
  const step = startVol / steps;
  const interval = (duration * 1000) / steps;
  let current = startVol;
  const timer = setInterval(() => {
    current -= step;
    if (current <= 0) { audio.volume = 0; audio.pause(); audio.currentTime = 0; clearInterval(timer); }
    else audio.volume = current;
  }, interval);
}

// ─── Touch: 1 палец = вращение, 2 пальца пинч = масштаб ─────────────────────
let lastTouch = null, lastPinch = null;

document.addEventListener("touchstart", e => {
  if (e.target.closest("#mute-btn")) return;
  if (e.touches.length === 1) { lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY }; lastPinch = null; }
  else if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    lastPinch = Math.sqrt(dx*dx + dy*dy); lastTouch = null;
  }
}, { passive: false });

document.addEventListener("touchmove", e => {
  if (!activeModel) return;
  if (e.touches.length === 1 && lastTouch) {
    activeModel.rotation.y += (e.touches[0].clientX - lastTouch.x) * 0.012;
    activeModel.rotation.x += (e.touches[0].clientY - lastTouch.y) * 0.012;
    lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  } else if (e.touches.length === 2 && lastPinch) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    activeModel.scale.setScalar(Math.max(0.01, Math.min(2, activeModel.scale.x * dist / lastPinch)));
    lastPinch = dist;
  }
}, { passive: false });

document.addEventListener("touchend", e => {
  if (e.touches.length === 0) { lastTouch = null; lastPinch = null; }
  else if (e.touches.length === 1) { lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY }; lastPinch = null; }
}, { passive: false });

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  try {
    setStatus("Подготовка...");

    const mindarThree = new MindARThree({
      container: document.body,
      imageTargetSrc: "assets/targets/targets.mind",
      maxTrack: 1,
      uiLoading: "no", uiScanning: "no", uiError: "no",
      filterMinCF: 0.001, filterBeta: 0.001
    });

    const { renderer, scene, camera } = mindarThree;

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/");
    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.5));
    const dir = new THREE.DirectionalLight(0xffffff, 1);
    dir.position.set(1, 1, 1); scene.add(dir);

    setStatus("Загрузка...");

    for (let i = 0; i < EXHIBITION_CONFIG.artworks.length; i++) {
      const artwork = EXHIBITION_CONFIG.artworks[i];
      const anchor = mindarThree.addAnchor(i);

      // Аудио
      const volume = artwork.audioVolume !== undefined ? artwork.audioVolume : 0.8;
      const audio = artwork.audio ? createAudio(artwork.audio, volume) : null;
      audioPlayers[i] = audio;

      anchor.onTargetFound = () => {
        log("[ar] TARGET " + i);
        activeModel = models[i];
        setStatus("");
        // Останавливаем все остальные звуки
        audioPlayers.forEach((p, j) => { if (j !== i && p) fadeOut(p, FADE_DURATION); });
        if (audio) fadeIn(audio, volume, FADE_DURATION);
      };
      anchor.onTargetLost = () => {
        if (activeModel === models[i]) activeModel = null;
        setStatus("Наведите камеру на картину");
        if (audio) fadeOut(audio, FADE_DURATION);
      };

      try {
        const gltf = await new Promise((res, rej) => loader.load(artwork.model, res, undefined, rej));
        const group = new THREE.Group();
        const inner = gltf.scene;
        // Центрируем
        const box = new THREE.Box3().setFromObject(inner);
        inner.position.sub(box.getCenter(new THREE.Vector3()));
        group.add(inner);
        group.position.set(artwork.position.x, artwork.position.y, artwork.position.z);
        group.scale.setScalar(artwork.scale);
        group.rotation.set(
          THREE.MathUtils.degToRad(artwork.rotation.x),
          THREE.MathUtils.degToRad(artwork.rotation.y),
          THREE.MathUtils.degToRad(artwork.rotation.z)
        );
        anchor.group.add(group);
        models[i] = group;
        log("[viewer] model " + i + " OK");
      } catch(e) {
        log("[viewer] model " + i + " FAIL: " + e.message, "error");
      }
    }

    setStatus("Запуск камеры...");
    await mindarThree.start();
    setStatus("Наведите камеру на картину");
    log("[viewer] live");

    renderer.setAnimationLoop(() => renderer.render(scene, camera));

  } catch(err) {
    log("[viewer] CRASH: " + (err.message || err), "error");
    setStatus("Ошибка: " + (err.message || err));
  }
})();