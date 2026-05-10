import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MindARThree } from "mindar-image-three";

const log = window.__log;
const setStatus = window.__setStatus;

let currentModel = null;
let viewerTouch = null;

// Вращение модели пальцем
document.addEventListener("touchstart", e => {
  if (e.touches.length === 1) viewerTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: false });

document.addEventListener("touchmove", e => {
  if (!viewerTouch || !currentModel || e.touches.length !== 1) return;
  const dx = e.touches[0].clientX - viewerTouch.x;
  const dy = e.touches[0].clientY - viewerTouch.y;
  currentModel.rotation.y += dx * 0.012;
  currentModel.rotation.x += dy * 0.012;
  viewerTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: false });

document.addEventListener("touchend", () => { viewerTouch = null; }, { passive: false });

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
    dir.position.set(1, 1, 1);
    scene.add(dir);

    const artwork = EXHIBITION_CONFIG.artworks[0];
    const anchor = mindarThree.addAnchor(0);

    anchor.onTargetFound = () => {
      log("[ar] TARGET FOUND");
      setStatus("");
    };
    anchor.onTargetLost = () => {
      log("[ar] target lost");
      setStatus("Наведите камеру на картину");
    };

    setStatus("Загрузка модели...");
    const gltf = await new Promise((res, rej) => loader.load(artwork.model, res, undefined, rej));
    currentModel = gltf.scene;
    currentModel.position.set(artwork.position.x, artwork.position.y, artwork.position.z);
    currentModel.scale.setScalar(artwork.scale);
    currentModel.rotation.set(
      THREE.MathUtils.degToRad(artwork.rotation.x),
      THREE.MathUtils.degToRad(artwork.rotation.y),
      THREE.MathUtils.degToRad(artwork.rotation.z)
    );
    anchor.group.add(currentModel);
    log("[viewer] model loaded");

    setStatus("Запуск камеры...");
    await mindarThree.start();
    setStatus("Наведите камеру на картину");
    log("[viewer] camera live");

    renderer.setAnimationLoop(() => renderer.render(scene, camera));

  } catch (err) {
    log("[viewer] CRASH: " + (err.message || err), "error");
    setStatus("Ошибка: " + (err.message || err));
  }
})();