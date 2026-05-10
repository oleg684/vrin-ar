// ES module version для MindAR 1.2.x
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MindARThree } from "mindar-image-three";

const log = window.__log;

(async () => {
  try {
    log("[app] ES module loaded, THREE=" + !!THREE + " MindARThree=" + !!MindARThree);
    log("[app] THREE.REVISION=" + THREE.REVISION);

    log("[app] fetching targets.mind HEAD");
    const head = await fetch("assets/targets/targets.mind", { method: "HEAD" });
    log("[app] targets.mind status=" + head.status + " size=" + head.headers.get("content-length"));

    if (typeof EXHIBITION_CONFIG === "undefined") {
      log("[app] FATAL: EXHIBITION_CONFIG missing", "error");
      return;
    }
    log("[app] artworks=" + EXHIBITION_CONFIG.artworks.length);

    log("[app] creating MindARThree");
    const mindarThree = new MindARThree({
      container: document.body,
      imageTargetSrc: "assets/targets/targets.mind",
      maxTrack: 1,
      uiLoading: "no",
      uiScanning: "no",
      uiError: "no"
    });
    log("[app] MindARThree instance OK");

    const { renderer, scene, camera } = mindarThree;

    // Настраиваем DRACO loader для сжатых моделей
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/");
    log("[app] DRACOLoader configured");

    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    // Добавляем свет для модели
    const light = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(light);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(1, 1, 1);
    scene.add(dirLight);

    for (let i = 0; i < EXHIBITION_CONFIG.artworks.length; i++) {
      const artwork = EXHIBITION_CONFIG.artworks[i];
      const anchor = mindarThree.addAnchor(i);
      anchor.onTargetFound = () => log("[ar] >>> TARGET " + i + " FOUND <<<");
      anchor.onTargetLost = () => log("[ar] target " + i + " lost");

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
        log("[app] model " + i + " attached, vertices: " + (model.children.length ? "ok" : "empty"));
      } catch (e) {
        log("[app] model load failed: " + e.message, "error");
      }
    }

    log("[app] calling start() (requesting camera)...");
    await mindarThree.start();
    log("[app] start() OK - camera live, point at the artwork");

    renderer.setAnimationLoop(() => {
      renderer.render(scene, camera);
    });

  } catch (err) {
    log("[app] CRASH: " + (err.message || err), "error");
    log("[app] stack: " + (err.stack || "").substring(0, 400), "error");
  }
})();