// Основная логика AR
// Не редактируйте этот файл — все настройки в config.js

(async () => {
  const loading = document.getElementById("loading");
  const loadingText = document.getElementById("loading-text");
  const hint = document.getElementById("hint");

  try {
    loadingText.textContent = "Инициализация камеры...";

    const THREE = window.THREE;
    const { MindARThree } = window.MINDAR.IMAGE;

    const mindarThree = new MindARThree({
      container: document.body,
      imageTargetSrc: "assets/targets/targets.mind",
      maxTrack: EXHIBITION_CONFIG.artworks.length
    });

    const { renderer, scene, camera } = mindarThree;

    loadingText.textContent = "Загрузка моделей...";

    const loader = new THREE.GLTFLoader();

    const loadModel = (url) => new Promise((resolve, reject) => {
      loader.load(url, (gltf) => resolve(gltf.scene), undefined, reject);
    });

    for (let i = 0; i < EXHIBITION_CONFIG.artworks.length; i++) {
      const artwork = EXHIBITION_CONFIG.artworks[i];
      const anchor = mindarThree.addAnchor(i);

      try {
        const model = await loadModel(artwork.model);

        model.position.set(
          artwork.position.x,
          artwork.position.y,
          artwork.position.z
        );

        model.scale.setScalar(artwork.scale);

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

    loadingText.textContent = "Запуск AR...";
    await mindarThree.start();

    loading.style.display = "none";
    hint.style.display = "block";

    renderer.setAnimationLoop(() => {
      renderer.render(scene, camera);
    });

  } catch (err) {
    loadingText.textContent = "Ошибка: " + err.message;
    console.error(err);
  }
})();