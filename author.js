import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MindARThree } from "mindar-image-three";

const log = window.__log;
const setStatus = window.__setStatus;

let currentModel = null;
const params = {
  x: EXHIBITION_CONFIG.artworks[0].position.x,
  y: EXHIBITION_CONFIG.artworks[0].position.y,
  z: EXHIBITION_CONFIG.artworks[0].position.z,
  scale: EXHIBITION_CONFIG.artworks[0].scale,
};
const origParams = { ...params };

function $(id) { return document.getElementById(id); }

function updateSliders() {
  ["x","y","z","scale"].forEach(k => {
    const el = $("inp-" + k);
    const val = $("val-" + k);
    if (el) el.value = params[k];
    if (val) val.textContent = Number(params[k]).toFixed(2);
  });
}

function applyToModel() {
  if (!currentModel) return;
  currentModel.position.set(params.x, params.y, params.z);
  currentModel.scale.setScalar(params.scale);
}

["x","y","z","scale"].forEach(k => {
  const el = $("inp-" + k);
  if (!el) return;
  el.addEventListener("input", () => {
    params[k] = parseFloat(el.value);
    $("val-" + k).textContent = params[k].toFixed(2);
    applyToModel();
  });
});

// Drag + pinch
let lastTouch = null, lastPinch = null;

document.addEventListener("touchstart", e => {
  const onPanel = e.target.closest("#author-panel, #save-dialog");
  if (onPanel) return;
  if (e.touches.length === 1) {
    lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  } else if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    lastPinch = Math.sqrt(dx*dx + dy*dy);
  }
}, { passive: false });

document.addEventListener("touchmove", e => {
  const onPanel = e.target.closest("#author-panel, #save-dialog");
  if (onPanel) return;
  if (e.touches.length === 1 && lastTouch) {
    const dx = (e.touches[0].clientX - lastTouch.x) / window.innerWidth * 4;
    const dy = (e.touches[0].clientY - lastTouch.y) / window.innerHeight * 4;
    params.x = Math.round((params.x + dx) * 100) / 100;
    params.y = Math.round((params.y - dy) * 100) / 100;
    lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    updateSliders(); applyToModel();
  } else if (e.touches.length === 2 && lastPinch) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    params.scale = Math.round(Math.max(0.01, Math.min(2, params.scale * dist / lastPinch)) * 100) / 100;
    lastPinch = dist;
    updateSliders(); applyToModel();
  }
}, { passive: false });

document.addEventListener("touchend", () => { lastTouch = null; lastPinch = null; }, { passive: false });

// Сохранение в GitHub
async function saveToGitHub(ghToken) {
  const a = EXHIBITION_CONFIG.artworks[0];
  const newConfig = `// Конфигурация AR-выставки
const EXHIBITION_CONFIG = {
  artworks: [
    {
      id: "${a.id}",
      title: "${a.title}",
      target: "${a.target}",
      model: "${a.model}",
      position: { x: ${params.x}, y: ${params.y}, z: ${params.z} },
      scale: ${params.scale},
      rotation: { x: ${a.rotation.x}, y: ${a.rotation.y}, z: ${a.rotation.z} }
    }
  ]
};`;

  const metaR = await fetch("https://api.github.com/repos/oleg684/vrin-ar/contents/config.js", {
    headers: { Authorization: "token " + ghToken, Accept: "application/vnd.github.v3+json" }
  });
  if (!metaR.ok) throw new Error("Нет доступа к репозиторию: " + metaR.status);
  const meta = await metaR.json();

  const upR = await fetch("https://api.github.com/repos/oleg684/vrin-ar/contents/config.js", {
    method: "PUT",
    headers: { Authorization: "token " + ghToken, "Content-Type": "application/json", Accept: "application/vnd.github.v3+json" },
    body: JSON.stringify({ message: "Author: update position/scale", content: btoa(unescape(encodeURIComponent(newConfig))), sha: meta.sha })
  });
  if (!upR.ok) { const e = await upR.json(); throw new Error(e.message || upR.status); }
}

// Кнопки
$("btn-save").addEventListener("click", () => { $("save-dialog").style.display = "flex"; $("save-error").style.display = "none"; });
$("btn-cancel-save").addEventListener("click", () => { $("save-dialog").style.display = "none"; });
$("btn-reset").addEventListener("click", () => { Object.assign(params, origParams); updateSliders(); applyToModel(); });

$("btn-confirm-save").addEventListener("click", async () => {
  const ghToken = $("inp-token").value.trim();
  const errEl = $("save-error");
  const btn = $("btn-confirm-save");
  if (!ghToken.startsWith("ghp_")) {
    errEl.textContent = "Токен должен начинаться с ghp_";
    errEl.style.display = "block"; return;
  }
  btn.textContent = "Сохраняю..."; btn.disabled = true; errEl.style.display = "none";
  try {
    await saveToGitHub(ghToken);
    $("save-dialog").style.display = "none";
    setStatus("✅ Сохранено! Параметры применены.");
    setTimeout(() => setStatus("Наведите камеру на картину"), 3000);
    log("[author] saved x=" + params.x + " y=" + params.y + " z=" + params.z + " scale=" + params.scale);
  } catch(e) {
    errEl.textContent = "Ошибка: " + e.message; errEl.style.display = "block";
    log("[author] save fail: " + e.message, "error");
  }
  btn.textContent = "Сохранить"; btn.disabled = false;
});

// AR
(async () => {
  try {
    setStatus("Подготовка...");
    updateSliders();

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
    dir.position.set(1, 1, 1);
    scene.add(dir);

    const anchor = mindarThree.addAnchor(0);
    anchor.onTargetFound = () => { log("[ar] FOUND"); setStatus(""); };
    anchor.onTargetLost  = () => { log("[ar] lost"); setStatus("Наведите камеру на картину"); };

    setStatus("Загрузка модели...");
    const gltf = await new Promise((res, rej) => loader.load(EXHIBITION_CONFIG.artworks[0].model, res, undefined, rej));
    currentModel = gltf.scene;
    applyToModel();
    anchor.group.add(currentModel);
    log("[author] model loaded");

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