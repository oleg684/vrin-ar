// Диагностическая версия
const log = window.__log;

(async () => {
  try {
    log("[app] starting");

    if (!window.MINDAR || !window.MINDAR.IMAGE) {
      log("[app] MINDAR.IMAGE not loaded!", "error");
      return;
    }

    const THREE = window.MINDAR.IMAGE.THREE || window.THREE;
    log("[app] THREE available: " + !!THREE);

    if (!THREE) {
      log("[app] THREE is missing!", "error");
      return;
    }

    log("[app] GLTFLoader available: " + (typeof THREE.GLTFLoader));

    const { MindARThree } = window.MINDAR.IMAGE;

    log("[app] creating MindARThree...");
    const mindarThree = new MindARThree({
      container: document.body,
      imageTargetSrc: "assets/targets/targets.mind",
      maxTrack: 1
    });
    log("[app] MindARThree created");

    const { renderer, scene, camera } = mindarThree;

    if (typeof THREE.GLTFLoader === "undefined") {
      log("[app] GLTFLoader is NOT in THREE namespace", "warn");
      log("[app] checking window: " + (typeof window.GLTFLoader));
    }

    log("[app] starting AR engine...");
    await mindarThree.start();
    log("[app] AR engine started!");

    renderer.setAnimationLoop(() => {
      renderer.render(scene, camera);
    });

    log("[app] render loop running");

  } catch (err) {
    log("[app] CRASH: " + err.message, "error");
    log("[app] stack: " + (err.stack || "").substring(0, 300), "error");
  }
})();