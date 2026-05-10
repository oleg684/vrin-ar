import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MindARThree } from "mindar-image-three";

const log = window.__log;
const setStatus = window.__setStatus;

(async () => {
  try {
    log("[app] start, THREE=" + THREE.REVISION);
    setStatus("Подготовка...");

    if (typeof EXHIBITION_CONFIG === "undefined") {
      log("[app] FATAL: EXHIBITION_CONFIG missing", "error");
      setStatus("Ошибка конфигурации");
      return;
    }

    const mindarThree = new MindARThree({
      container: document.body,
      imageTargetSrc: "assets/targets/targets.mind",
      maxTrack: 1,
      uiLoading: "no",
      uiScanning: "no",
      uiError: "no"
    });

    const { renderer, scene, camera } = mindarThree;

    // DRACO loader для сжатых моделей
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/");

    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    // Освещение
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(1, 1, 1);
    scene.add(dirLight);

    setStatus("Загрузка моделей...");

    for (let i = 0; i < EXHIBITION_CONFIG.artworks.length; i++) {
      const artwork = EXHIBITION_CONFIG.artworks[i];
      const anchor = mindarThree.addAnchor(i);

      anchor.onTargetFound = () => {
        log("[ar] TARGET " + i + " FOUND");
        setStatus("Картина " + (i+1), true);
      };
      anchor.onTargetLost = () => {
        log("[ar] target " + i + " lost");
        setStatus("Наведите камеру на картину");
      };

      log("[app] loading model: " + artwork.model);
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
        log("[app] model " + i + " loaded");
      } catch (e) {
        log("[app] model load failed: " + e.message, "error");
      }
    }

    setStatus("Запуск камеры...");
    log("[app] start()");
    await mindarThree.start();
    log("[app] camera live");
    setStatus("Наведите камеру на картину");

    renderer.setAnimationLoop(() => {
      renderer.render(scene, camera);
    });

  } catch (err) {
    log("[app] CRASH: " + (err.message || err), "error");
    log("[app] stack: " + (err.stack || "").substring(0, 400), "error");
    setStatus("Ошибка: " + (err.message || "AR не запустился"));
  }
})();