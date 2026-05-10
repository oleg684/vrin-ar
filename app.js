// Основная логика AR
// Не редактируйте этот файл — все настройки в config.js

(async () => {
  const loading = document.getElementById("loading");

  const targets = EXHIBITION_CONFIG.artworks.map(a => a.target);

  const mindarThree = new window.MINDAR.IMAGE.MindARThree({
    container: document.body,
    imageTargetSrc: "assets/targets/targets.mind",
    maxTrack: EXHIBITION_CONFIG.artworks.length
  });

  const { renderer, scene, camera } = mindarThree;
  const loader = new THREE.GLTFLoader();

  const loadModel = (url) => new Promise((resolve, reject) => {
    loader.load(url, (gltf) => resolve(gltf.scene), undefined, reject);
  });

  // Загружаем все модели и привязываем к якорям
  for (let i = 0; i < EXHIBITION_CONFIG.artworks.length; i++) {
    const artwork = EXHIBITION_CONFIG.artworks[i];
    const anchor = mindarThree.addAnchor(i);

    try {
      const model = await loadModel(artwork.model);

      // Позиция из конфига
      model.position.set(
        artwork.position.x,
        artwork.position.y,
        artwork.position.z
      );

      // Масштаб из конфига
      model.scale.setScalar(artwork.scale);

      // Поворот из конфига (градусы -> радианы)
      model.rotation.set(
        THREE.MathUtils.degToRad(artwork.rotation.x),
        THREE.MathUtils.degToRad(artwork.rotation.y),
        THREE.MathUtils.degToRad(artwork.rotation.z)
      );

      anchor.group.add(model);
    } catch (e) {
      console.warn("Не удалось загрузить модель:", artwork.model, e);
    }
  }

  await mindarThree.start();
  loading.style.display = "none";

  renderer.setAnimationLoop(() => {
    renderer.render(scene, camera);
  });
})();
