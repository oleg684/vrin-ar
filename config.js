// Конфигурация AR-выставки
// Все параметры настраиваются здесь без изменения основного кода

const EXHIBITION_CONFIG = {
  artworks: [
    {
      id: "artwork-1",
      title: "Картина 1",
      target: "assets/targets/artwork-1.jpg",
      model: "assets/models/artwork-1.glb",
      // Позиция: x=вправо/влево, y=вверх/вниз, z=ближе/дальше
      position: { x: 0, y: 0, z: 0 },
      // Масштаб: 0.1 = маленький, 1.0 = оригинальный
      scale: 0.15,
      // Поворот в градусах
      rotation: { x: 0, y: 0, z: 0 }
    }
  ]
};