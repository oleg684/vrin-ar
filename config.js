// Конфигурация AR-выставки
// Здесь настраиваются все параметры без изменения основного кода

const EXHIBITION_CONFIG = {

  // Список картин и их AR-контент
  artworks: [
    {
      id: "artwork-1",
      title: "Название картины 1",
      // Фото картины (триггер для распознавания)
      // Положите файл в папку assets/targets/
      target: "assets/targets/artwork-1.jpg",
      // 3D модель из Open Brush (GLB)
      // Положите файл в папку assets/models/
      model: "assets/models/artwork-1.glb",
      // Позиция модели относительно картины
      // x: вправо/влево (+ вправо, - влево)
      // y: вверх/вниз (+ вверх, - вниз)
      // z: ближе/дальше (+ ближе к зрителю)
      position: { x: 1.5, y: 0, z: 0 },
      // Масштаб модели (1 = оригинальный размер)
      scale: 1.0,
      // Поворот модели в градусах
      rotation: { x: 0, y: 0, z: 0 }
    }
    // Добавляйте следующие картины по аналогии:
    // {
    //   id: "artwork-2",
    //   title: "Название картины 2",
    //   target: "assets/targets/artwork-2.jpg",
    //   model: "assets/models/artwork-2.glb",
    //   position: { x: -1.5, y: 0, z: 0 },
    //   scale: 1.0,
    //   rotation: { x: 0, y: 0, z: 0 }
    // }
  ]
};
