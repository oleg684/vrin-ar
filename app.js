import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MindARThree } from "mindar-image-three";

const log = window.__log || console.log;
const setStatus = window.__setStatus || (() => {});

// ─── Состояние ────────────────────────────────────────────────────────────────
let authorMode = false;
let currentModel = null;
let mindarThree = null;

// Рабочие параметры (копия из конфига, меняется в режиме автора)
const params = {
  x: EXHIBITION_CONFIG.artworks[0].position.x,
  y: EXHIBITION_CONFIG.artworks[0].position.y,
  z: EXHIBITION_CONFIG.artworks[0].position.z,
  scale: EXHIBITION_CONFIG.artworks[0].scale,
  rotX: EXHIBITION_CONFIG.artworks[0].rotation.x,
  rotY: EXHIBITION_CONFIG.artworks[0].rotation.y,
  rotZ: EXHIBITION_CONFIG.artworks[0].rotation.z,
};

// ─── UI ───────────────────────────────────────────────────────────────────────
function buildUI() {
  const ui = document.createElement("div");
  ui.id = "ar-ui";
  ui.style.cssText = `
    position:fixed; top:0; left:0; right:0; bottom:0;
    pointer-events:none; z-index:50;
    font-family: sans-serif;
  `;
  ui.innerHTML = `
    <!-- Статус внизу -->
    <div id="status-bar" style="
      position:absolute; bottom:1.5rem; left:50%; transform:translateX(-50%);
      padding:0.4rem 1rem; background:rgba(0,0,0,0.55); border-radius:999px;
      font-size:13px; color:#fff; pointer-events:none; transition:opacity 0.3s;
    ">Наведите камеру на картину</div>

    <!-- Кнопка режима автора -->
    <div id="btn-author" style="
      position:absolute; top:1rem; right:1rem;
      padding:0.5rem 0.9rem; background:rgba(0,0,0,0.6);
      border:1px solid rgba(255,255,255,0.3); border-radius:8px;
      font-size:12px; color:#fff; cursor:pointer; pointer-events:all;
    ">✏️ Автор</div>

    <!-- Панель автора (скрыта по умолчанию) -->
    <div id="author-panel" style="
      display:none; position:absolute; bottom:0; left:0; right:0;
      background:rgba(0,0,0,0.82); padding:1rem; pointer-events:all;
      border-top:1px solid rgba(255,255,255,0.15);
    ">
      <div style="color:#fff; font-size:12px; margin-bottom:0.7rem; opacity:0.7;">
        ← → ↑ ↓ двигают модель · пинч = масштаб
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; margin-bottom:0.7rem;">
        <label style="color:#aaa; font-size:11px;">X (лево/право)
          <input id="inp-x" type="range" min="-3" max="3" step="0.05"
            style="width:100%; margin-top:2px;" />
          <span id="val-x" style="color:#fff; font-size:10px;"></span>
        </label>
        <label style="color:#aaa; font-size:11px;">Y (вверх/вниз)
          <input id="inp-y" type="range" min="-3" max="3" step="0.05"
            style="width:100%; margin-top:2px;" />
          <span id="val-y" style="color:#fff; font-size:10px;"></span>
        </label>
        <label style="color:#aaa; font-size:11px;">Z (вперёд/назад)
          <input id="inp-z" type="range" min="-2" max="2" step="0.05"
            style="width:100%; margin-top:2px;" />
          <span id="val-z" style="color:#fff; font-size:10px;"></span>
        </label>
        <label style="color:#aaa; font-size:11px;">Масштаб
          <input id="inp-scale" type="range" min="0.01" max="2" step="0.01"
            style="width:100%; margin-top:2px;" />
          <span id="val-scale" style="color:#fff; font-size:10px;"></span>
        </label>
      </div>

      <div style="display:flex; gap:0.5rem;">
        <button id="btn-save" style="
          flex:1; padding:0.6rem; background:#2563eb; color:#fff;
          border:none; border-radius:8px; font-size:14px; cursor:pointer;
        ">💾 Сохранить</button>
        <button id="btn-cancel" style="
          padding:0.6rem 1rem; background:rgba(255,255,255,0.1); color:#fff;
          border:1px solid rgba(255,255,255,0.2); border-radius:8px;
          font-size:14px; cursor:pointer;
        ">✕</button>
      </div>
    </div>

    <!-- Диалог сохранения -->
    <div id="save-dialog" style="
      display:none; position:absolute; inset:0;
      background:rgba(0,0,0,0.85); align-items:center; justify-content:center;
    ">
      <div style="background:#1e1e1e; border-radius:12px; padding:1.5rem; width:85%; max-width:340px;">
        <div style="color:#fff; font-size:15px; margin-bottom:1rem;">Сохранить параметры</div>
        <div style="color:#aaa; font-size:12px; margin-bottom:0.5rem;">
          GitHub токен (только repo scope):
        </div>
        <input id="inp-token" type="password" placeholder="ghp_..." style="
          width:100%; padding:0.6rem; border-radius:6px; border:1px solid #444;
          background:#2a2a2a; color:#fff; font-size:13px; margin-bottom:1rem;
          box-sizing:border-box;
        " />
        <div id="save-error" style="color:#f88; font-size:12px; margin-bottom:0.7rem; display:none;"></div>
        <div style="display:flex; gap:0.5rem;">
          <button id="btn-confirm-save" style="
            flex:1; padding:0.6rem; background:#2563eb; color:#fff;
            border:none; border-radius:8px; font-size:14px; cursor:pointer;
          ">Сохранить</button>
          <button id="btn-cancel-save" style="
            padding:0.6rem 1rem; background:#333; color:#fff;
            border:none; border-radius:8px; font-size:14px; cursor:pointer;
          ">Отмена</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(ui);
  return ui;
}

function updateSliders() {
  const set = (id, val, valId) => {
    const el = document.getElementById(id);
    if (el) { el.value = val; }
    const v = document.getElementById(valId);
    if (v) v.textContent = Number(val).toFixed(2);
  };
  set("inp-x", params.x, "val-x");
  set("inp-y", params.y, "val-y");
  set("inp-z", params.z, "val-z");
  set("inp-scale", params.scale, "val-scale");
}

function applyToModel() {
  if (!currentModel) return;
  currentModel.position.set(params.x, params.y, params.z);
  currentModel.scale.setScalar(params.scale);
}

function bindSlider(id, key) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("input", () => {
    params[key] = parseFloat(el.value);
    const v = document.getElementById("val-" + key);
    if (v) v.textContent = params[key].toFixed(2);
    applyToModel();
  });
}

// Touch drag для режима автора
let lastTouch = null;
let lastPinchDist = null;

function onTouchStart(e) {
  if (!authorMode) return;
  if (e.touches.length === 1) {
    lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  } else if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    lastPinchDist = Math.sqrt(dx*dx + dy*dy);
  }
}

function onTouchMove(e) {
  if (!authorMode) return;
  // Не трогаем панель автора
  if (e.target.closest("#author-panel")) return;
  e.preventDefault();

  if (e.touches.length === 1 && lastTouch) {
    const dx = (e.touches[0].clientX - lastTouch.x) / window.innerWidth * 4;
    const dy = (e.touches[0].clientY - lastTouch.y) / window.innerHeight * 4;
    params.x = Math.round((params.x + dx) * 100) / 100;
    params.y = Math.round((params.y - dy) * 100) / 100;
    lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    updateSliders();
    applyToModel();
  } else if (e.touches.length === 2 && lastPinchDist) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const ratio = dist / lastPinchDist;
    params.scale = Math.round(Math.max(0.01, Math.min(2, params.scale * ratio)) * 100) / 100;
    lastPinchDist = dist;
    updateSliders();
    applyToModel();
  }
}

function onTouchEnd() {
  lastTouch = null;
  lastPinchDist = null;
}

// Вращение для зрителя (режим не-автора)
let viewerTouch = null;

function onViewerTouchStart(e) {
  if (authorMode || e.touches.length !== 1) return;
  viewerTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}

function onViewerTouchMove(e) {
  if (authorMode || !viewerTouch || !currentModel) return;
  const dx = e.touches[0].clientX - viewerTouch.x;
  const dy = e.touches[0].clientY - viewerTouch.y;
  currentModel.rotation.y += dx * 0.01;
  currentModel.rotation.x += dy * 0.01;
  viewerTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}

function onViewerTouchEnd() {
  viewerTouch = null;
}

// Сохранение в GitHub
async function saveToGitHub(ghToken) {
  const artwork = EXHIBITION_CONFIG.artworks[0];
  const newConfig = `// Конфигурация AR-выставки
const EXHIBITION_CONFIG = {
  artworks: [
    {
      id: "${artwork.id}",
      title: "${artwork.title}",
      target: "${artwork.target}",
      model: "${artwork.model}",
      position: { x: ${params.x}, y: ${params.y}, z: ${params.z} },
      scale: ${params.scale},
      rotation: { x: ${params.rotX}, y: ${params.rotY}, z: ${params.rotZ} }
    }
  ]
};`;

  // Получаем SHA текущего config.js
  const metaResp = await fetch(
    "https://api.github.com/repos/oleg684/vrin-ar/contents/config.js",
    { headers: { "Authorization": "token " + ghToken, "Accept": "application/vnd.github.v3+json" } }
  );
  if (!metaResp.ok) throw new Error("Не удалось получить config.js: " + metaResp.status);
  const meta = await metaResp.json();

  // Обновляем файл
  const updateResp = await fetch(
    "https://api.github.com/repos/oleg684/vrin-ar/contents/config.js",
    {
      method: "PUT",
      headers: {
        "Authorization": "token " + ghToken,
        "Content-Type": "application/json",
        "Accept": "application/vnd.github.v3+json"
      },
      body: JSON.stringify({
        message: "Author mode: update position and scale",
        content: btoa(unescape(encodeURIComponent(newConfig))),
        sha: meta.sha
      })
    }
  );
  if (!updateResp.ok) {
    const err = await updateResp.json();
    throw new Error(err.message || updateResp.status);
  }
  return true;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  try {
    setStatus("Подготовка...");
    buildUI();
    updateSliders();

    // Bind слайдеры
    bindSlider("inp-x", "x");
    bindSlider("inp-y", "y");
    bindSlider("inp-z", "z");
    bindSlider("inp-scale", "scale");

    // Touch события на canvas
    document.addEventListener("touchstart", (e) => { onTouchStart(e); onViewerTouchStart(e); }, { passive: false });
    document.addEventListener("touchmove", (e) => { onTouchMove(e); onViewerTouchMove(e); }, { passive: false });
    document.addEventListener("touchend", () => { onTouchEnd(); onViewerTouchEnd(); });

    // Кнопка режима автора
    document.getElementById("btn-author").addEventListener("click", () => {
      authorMode = !authorMode;
      document.getElementById("author-panel").style.display = authorMode ? "block" : "none";
      document.getElementById("btn-author").textContent = authorMode ? "👁 Зритель" : "✏️ Автор";
      updateSliders();
    });

    // Закрыть панель
    document.getElementById("btn-cancel").addEventListener("click", () => {
      authorMode = false;
      document.getElementById("author-panel").style.display = "none";
      document.getElementById("btn-author").textContent = "✏️ Автор";
    });

    // Открыть диалог сохранения
    document.getElementById("btn-save").addEventListener("click", () => {
      const dialog = document.getElementById("save-dialog");
      dialog.style.display = "flex";
      document.getElementById("save-error").style.display = "none";
    });

    // Закрыть диалог
    document.getElementById("btn-cancel-save").addEventListener("click", () => {
      document.getElementById("save-dialog").style.display = "none";
    });

    // Подтвердить сохранение
    document.getElementById("btn-confirm-save").addEventListener("click", async () => {
      const ghToken = document.getElementById("inp-token").value.trim();
      const errEl = document.getElementById("save-error");
      const btn = document.getElementById("btn-confirm-save");

      if (!ghToken.startsWith("ghp_")) {
        errEl.textContent = "Введите корректный токен (начинается с ghp_)";
        errEl.style.display = "block";
        return;
      }

      btn.textContent = "Сохраняю...";
      btn.disabled = true;
      errEl.style.display = "none";

      try {
        await saveToGitHub(ghToken);
        document.getElementById("save-dialog").style.display = "none";
        document.getElementById("author-panel").style.display = "none";
        authorMode = false;
        document.getElementById("btn-author").textContent = "✏️ Автор";
        document.getElementById("status-bar").textContent = "✅ Сохранено!";
        setTimeout(() => {
          document.getElementById("status-bar").textContent = "Наведите камеру на картину";
        }, 3000);
        log("[author] saved: x=" + params.x + " y=" + params.y + " z=" + params.z + " scale=" + params.scale);
      } catch(e) {
        errEl.textContent = "Ошибка: " + e.message;
        errEl.style.display = "block";
        log("[author] save failed: " + e.message, "error");
      }

      btn.textContent = "Сохранить";
      btn.disabled = false;
    });

    // MindAR
    mindarThree = new MindARThree({
      container: document.body,
      imageTargetSrc: "assets/targets/targets.mind",
      maxTrack: 1,
      uiLoading: "no",
      uiScanning: "no",
      uiError: "no",
      filterMinCF: 0.001,
      filterBeta: 0.001
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

    setStatus("Загрузка модели...");

    const artwork = EXHIBITION_CONFIG.artworks[0];
    const anchor = mindarThree.addAnchor(0);

    anchor.onTargetFound = () => {
      log("[ar] TARGET FOUND");
      document.getElementById("status-bar").style.opacity = "0";
    };
    anchor.onTargetLost = () => {
      log("[ar] target lost");
      const sb = document.getElementById("status-bar");
      sb.textContent = "Наведите камеру на картину";
      sb.style.opacity = "1";
    };

    const gltf = await new Promise((res, rej) => loader.load(artwork.model, res, undefined, rej));
    currentModel = gltf.scene;
    applyToModel();
    anchor.group.add(currentModel);
    log("[app] model loaded");

    setStatus("Запуск камеры...");
    await mindarThree.start();
    log("[app] camera live");

    document.getElementById("status-bar").textContent = "Наведите камеру на картину";

    renderer.setAnimationLoop(() => {
      renderer.render(scene, camera);
    });

  } catch (err) {
    log("[app] CRASH: " + (err.message || err), "error");
    document.getElementById("status-bar").textContent = "Ошибка: " + (err.message || err);
  }
})();