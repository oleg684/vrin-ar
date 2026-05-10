const log = window.__log;

(async () => {
  try {
    log("[app] start");

    if (!window.MINDAR || !window.MINDAR.IMAGE) {
      log("[app] FATAL: MINDAR.IMAGE missing", "error");
      return;
    }
    if (!window.THREE) {
      log("[app] FATAL: THREE missing", "error");
      return;
    }

    const THREE = window.THREE;
    const { MindARThree } = window.MINDAR.IMAGE;
    log("[app] MindARThree=" + typeof MindARThree);

    log("[app] HEAD targets.mind");
    const head = await fetch("assets/targets/targets.mind", { method: "HEAD" });
    log("[app] targets.mind status=" + head.status);

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

    // Загружаем модель
    log("[app] loading GLB...");
    const loader = new THREE.GLTFLoader();
    const cfg = EXHIBITION_CONFIG.artworks[0];

    loader.load(cfg.model, (gltf) => {
      const model = gltf.scene;
      model.position.set(cfg.position.x, cfg.position.y, cfg.position.z);
      model.scale.setScalar(cfg.scale);
      anchor.group.add(model);
      log("[app] GLB loaded and added to anchor");
    }, (xhr) => {
      log("[app] GLB progress " + Math.round((xhr.loaded/xhr.total)*100) + "%");
    }, (err) => {
      log("[app] GLB load error: " + err.message, "error");
    });

    log("[app] calling start()...");
    await mindarThree.start();
    log("[app] >>> AR STARTED <<<");

    renderer.setAnimationLoop(() => renderer.render(scene, camera));
    log("[app] render loop active");

  } catch (err) {
    log("[app] CRASH: " + err.message, "error");
    log("[app] stack: " + (err.stack || "").substring(0, 400), "error");
  }
})();