import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MindARThree } from "mindar-image-three";

const log = window.__log;
const setStatus = window.__setStatus;

const STORAGE_KEY = "vrin_ar_author_token";
let currentModel = null;
let sessionToken = localStorage.getItem(STORAGE_KEY) || null;

const params = {
  x: EXHIBITION_CONFIG.artworks[0].position.x,
  y: EXHIBITION_CONFIG.artworks[0].position.y,
  z: EXHIBITION_CONFIG.artworks[0].position.z,
  scale: EXHIBITION_CONFIG.artworks[0].scale,
  rotY: EXHIBITION_CONFIG.artworks[0].rotation.y,
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
  currentModel.rotation.y = THREE.MathUtils.degToRad(params.rotY);
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

// ─── Touch ────────────────────────────────────────────────────────────────────
let touch1 = null, touch2 = null, lastPinch = null;

function midpoint(t) {
  return { x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 };
}
function pinchDist(t) {
  const dx = t[0].clientX - t[1].clientX;
  const dy = t[0].clientY - t[1].clientY;
  return Math.sqrt(dx*dx + dy*dy);
}

document.addEventListener("touchstart", e => {
  if (e.target.closest("#author-panel, #token-dialog")) return;
  if (e.touches.length === 1) {
    touch1 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    touch2 = null; lastPinch = null;
  } else if (e.touches.length === 2) {
    touch1 = null;
    touch2 = midpoint(e.touches);
    lastPinch = pinchDist(e.touches);
  }
}, { passive: false });

document.addEventListener("touchmove", e => {
  if (e.target.closest("#author-panel, #token-dialog")) return;
  if (e.touches.length === 1 && touch1) {
    const dx = e.touches[0].clientX - touch1.x;
    params.rotY = Math.round((params.rotY + dx * 0.5) * 10) / 10;
    touch1 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    applyToModel();
  } else if (e.touches.length === 2) {
    const mid = midpoint(e.touches);
    const dist = pinchDist(e.touches);
    if (touch2) {
      const dx = (mid.x - touch2.x) / window.innerWidth * 4;
      const dy = (mid.y - touch2.y) / window.innerHeight * 4;
      params.x = Math.round((params.x + dx) * 100) / 100;
      params.y = Math.round((params.y - dy) * 100) / 100;
    }
    if (lastPinch) {
      params.scale = Math.round(Math.max(0.01, Math.min(2, params.scale * dist / lastPinch)) * 100) / 100;
    }
    touch2 = mid; lastPinch = dist;
    updateSliders(); applyToModel();
  }
}, { passive: false });

document.addEventListener("touchend", e => {
  if (e.touches.length === 0) { touch1 = null; touch2 = null; lastPinch = null; }
  else if (e.touches.length === 1) {
    touch1 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    touch2 = null; lastPinch = null;
  }
}, { passive: false });

// ─── Диалог токена ────────────────────────────────────────────────────────────
function showTokenDialog(onSuccess) {
  const dialog = $("token-dialog");
  dialog.style.display = "flex";
  $("token-error").style.display = "none";
  $("inp-token").value = "";

  $("btn-token-ok").onclick = async () => {
    const t = $("inp-token").value.trim();
    if (!t.startsWith("ghp_")) {
      $("token-error").textContent = "Токен должен начинаться с ghp_";
      $("token-error").style.display = "block";
      return;
    }
    // Проверяем токен перед сохранением
    $("btn-token-ok").textContent = "Проверяю...";
    $("btn-token-ok").disabled = true;
    try {
      const r = await fetch("https://api.github.com/repos/oleg684/vrin-ar/contents/config.js", {
        headers: { Authorization: "token " + t, Accept: "application/vnd.github.v3+json" }
      });
      if (!r.ok) throw new Error("Нет доступа: " + r.status);
      // Токен рабочий — сохраняем
      localStorage.setItem(STORAGE_KEY, t);
      sessionToken = t;
      dialog.style.display = "none";
      log("[author] token saved to localStorage");
      onSuccess(t);
    } catch(e) {
      $("token-error").textContent = "Ошибка: " + e.message;
      $("token-error").style.display = "block";
    }
    $("btn-token-ok").textContent = "Сохранить";
    $("btn-token-ok").disabled = false;
  };

  $("btn-token-cancel").onclick = () => {
    dialog.style.display = "none";
  };

  $("btn-token-clear").onclick = () => {
    localStorage.removeItem(STORAGE_KEY);
    sessionToken = null;
    dialog.style.display = "none";
    setStatus("Токен удалён");
  };
}

// ─── Сохранение ───────────────────────────────────────────────────────────────
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
      rotation: { x: 0, y: ${params.rotY}, z: 0 }
    }
  ]
};`;

  const metaR = await fetch(
    "https://api.github.com/repos/oleg684/vrin-ar/contents/config.js",
    { headers: { Authorization: "token " + ghToken, Accept: "application/vnd.github.v3+json" } }
  );
  if (!metaR.ok) throw new Error("Нет доступа: " + metaR.status);
  const meta = await metaR.json();

  const upR = await fetch(
    "https://api.github.com/repos/oleg684/vrin-ar/contents/config.js",
    {
      method: "PUT",
      headers: {
        Authorization: "token " + ghToken,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json"
      },
      body: JSON.stringify({
        message: "Author: update position/scale/rotation",
        content: btoa(unescape(encodeURIComponent(newConfig))),
        sha: meta.sha
      })
    }
  );
  if (!upR.ok) {
    const err = await upR.json();
    // Токен протух — удаляем из localStorage и просим снова
    if (upR.status === 401 || upR.status === 403) {
      localStorage.removeItem(STORAGE_KEY);
      sessionToken = null;
    }
    throw new Error(err.message || upR.status);
  }
}

async function doSave() {
  const btn = $("btn-save");
  btn.textContent = "Сохраняю...";
  btn.disabled = true;
  try {
    await saveToGitHub(sessionToken);
    setStatus("✅ Сохранено!");
    setTimeout(() => setStatus("Наведите камеру на картину"), 3000);
    log("[author] saved: " + JSON.stringify(params));
  } catch(e) {
    if (!sessionToken) {
      showTokenDialog(doSave);
    } else {
      setStatus("Ошибка сохранения: " + e.message);
    }
    log("[author] save fail: " + e.message, "error");
  }
  btn.textContent = "💾 Сохранить";
  btn.disabled = false;
}

// ─── Кнопки ───────────────────────────────────────────────────────────────────
$("btn-save").addEventListener("click", () => {
  if (sessionToken) {
    doSave();
  } else {
    showTokenDialog(doSave);
  }
});

$("btn-reset").addEventListener("click", () => {
  Object.assign(params, origParams);
  updateSliders();
  applyToModel();
});

// Кнопка смены токена в панели
$("btn-change-token").addEventListener("click", () => {
  showTokenDialog(() => setStatus("Токен обновлён"));
});

// ─── AR ───────────────────────────────────────────────────────────────────────
(async () => {
  try {
    setStatus("Подготовка...");
    updateSliders();

    // Если токена нет — просим сразу
    if (!sessionToken) {
      showTokenDialog(() => log("[author] token set on start"));
    } else {
      log("[author] token loaded from localStorage");
    }

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
    anchor.onTargetLost  = () => { log("[ar] lost");  setStatus("Наведите камеру на картину"); };

    setStatus("Загрузка модели...");
    const gltf = await new Promise((res, rej) =>
      loader.load(EXHIBITION_CONFIG.artworks[0].model, res, undefined, rej)
    );
    currentModel = gltf.scene;
    applyToModel();
    anchor.group.add(currentModel);

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