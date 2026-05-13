import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MindARThree } from "mindar-image-three";

const log = window.__log;
const setStatus = window.__setStatus;

const models = [];
let activeModel = null;
let viewerTouch = null;

document.addEventListener("touchstart", e => {
  if (e.touches.length === 1) viewerTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: false });

document.addEventListener("touchmove", e => {
  if (!viewerTouch || !activeModel || e.touches.length !== 1) return;
  const dx = e.touches[0].clientX - viewerTouch.x;
  const dy = e.touches[0].clientY - viewerTouch.y;
  activeModel.rotation.y += dx * 0.012;
  activeModel.rotation.x += dy * 0.012;
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

    setStatus("Загрузка моделей...");

    for (let i = 0; i < EXHIBITION_CONFIG.artworks.length; i++) {
      const artwork = EXHIBITION_CONFIG.artworks[i];
      const anchor = mindarThree.addAnchor(i);

      anchor.onTargetFound = () => {
        log("[ar] TARGET " + i + " FOUND");
        activeModel = models[i];
        setStatus("");
      };
      anchor.onTargetLost = () => {
        log("[ar] target " + i + " lost");
        if (activeModel === models[i]) activeModel = null;
        setStatus("Наведите камеру на картину");
      };

      try {
        const gltf = await new Promise((res, rej) => loader.load(artwork.model, res, undefined, rej));
        const model = gltf.scene;
        model.position.set(artwork.position.x, artwork.position.y, artwork.position.z);
        model.scale.setScalar(artwork.scale);
        model.rotation.set(
          THREE.MathUtils.degToRad(artwork.rotation.x),
          THREE.MathUtils.degToRad(artwork.rotation.y),
          THREE.MathUtils.degToRad(artwork.rotation.z)
        );
        anchor.group.add(model);
        models[i] = model;
        log("[viewer] model " + i + " loaded");
      } catch(e) {
        log("[viewer] model " + i + " failed: " + e.message, "error");
      }
    }

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