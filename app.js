// ES module version для MindAR 1.2.x
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MindARThree } from "mindar-image-three";

const log = window.__log;

(async () => {
  try {
    log("[app] ES module loaded, THREE=" + !!THREE + " MindARThree=" + !!MindARThree + " GLTFLoader=" + !!GLTFLoader);
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
    const loader = new GLTFLoader();

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
        log("[app] model " + i + " attached");
      } catch (e) {
        log("[app] model load failed: " + e.message, "error");
      }
    }

    log("[app] calling start()...");
    await mindarThree.start();
    log("[app] start() OK - camera should be live");

    renderer.setAnimationLoop(() => {
      renderer.render(scene, camera);
    });
    log("[app] render loop active. Point camera at the artwork.");

  } catch (err) {
    log("[app] CRASH: " + (err.message || err), "error");
    log("[app] stack: " + (err.stack || "").substring(0, 400), "error");
  }
})();