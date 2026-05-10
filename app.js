const log = window.__log;

(async () => {
  try {
    log("[app] start");

    if (!window.MINDAR || !window.MINDAR.IMAGE) {
      log("[app] FATAL: MINDAR.IMAGE missing", "error");
      return;
    }

    const THREE = window.MINDAR.IMAGE.THREE || window.THREE;
    log("[app] THREE=" + (!!THREE));
    if (!THREE) { log("[app] FATAL no THREE", "error"); return; }
    log("[app] THREE.GLTFLoader=" + (typeof THREE.GLTFLoader));

    log("[app] fetching targets.mind HEAD");
    const head = await fetch("assets/targets/targets.mind", { method: "HEAD" });
    log("[app] targets.mind status=" + head.status);

    const { MindARThree } = window.MINDAR.IMAGE;
    log("[app] MindARThree=" + (typeof MindARThree));

    log("[app] new MindARThree()");
    const mindarThree = new MindARThree({
      container: document.body,
      imageTargetSrc: "assets/targets/targets.mind",
      maxTrack: 1,
      uiLoading: "no",
      uiScanning: "no",
      uiError: "no"
    });
    log("[app] instance created");

    const { renderer, scene, camera } = mindarThree;
    const anchor = mindarThree.addAnchor(0);
    log("[app] anchor created");

    anchor.onTargetFound = () => log("[app] >>> TARGET FOUND <<<");
    anchor.onTargetLost = () => log("[app] target lost");

    log("[app] calling start() ...");
    await mindarThree.start();
    log("[app] start() resolved!");

    renderer.setAnimationLoop(() => {
      renderer.render(scene, camera);
    });
    log("[app] render loop active");

  } catch (err) {
    log("[app] CRASH: " + err.message, "error");
    log("[app] stack: " + (err.stack || "").substring(0, 400), "error");
  }
})();