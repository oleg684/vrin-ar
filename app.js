import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MindARThree } from "mindar-image-three";

const log = window.__log;
const setStatus = window.__setStatus;

(async () => {
  try {
    log("[app] start v2, THREE=" + THREE.REVISION);
    setStatus("Подготовка...");

    const mindarThree = new MindARThree({
      container: document.body,
      imageTargetSrc: "assets/targets/targets.mind",
      maxTrack: 1,
      uiLoading: "no",
      uiScanning: "no",
      uiError: "no",
      // Фильтры стабилизации — убирают дрожание
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

    for (let i = 0; i < EXHIBITION_CONFIG.artworks.length; i++) {
      const artwork = EXHIBITION_CONFIG.artworks[i];
      const anchor = mindarThree.addAnchor(i);

      anchor.onTargetFound = () => {
        log("[ar] TARGET " + i + " FOUND");
        setStatus("", true);
      };
      anchor.onTargetLost = () => {
        log("[ar] target lost");
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
        log("[app] model " + i + " loaded, scale=" + artwork.scale);
      } catch (e) {
        log("[app] model failed: " + e.message, "error");
        setStatus("Ошибка загрузки модели");
      }
    }

    setStatus("Запуск камеры...");
    await mindarThree.start();
    log("[app] camera live");
    setStatus("Наведите камеру на картину");

    renderer.setAnimationLoop(() => {
      renderer.render(scene, camera);
    });

  } catch (err) {
    log("[app] CRASH: " + (err.message || err), "error");
    setStatus("Ошибка: " + (err.message || err));
  }
})();