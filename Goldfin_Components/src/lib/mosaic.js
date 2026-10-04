
export function mosaicPeak(random = Math.random) {
  return .35 + random() * .55;
}

export function createMosaicTiles(columns, rows, random = Math.random) {
  const tiles = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      tiles.push({
        base: .08 + random() * .14,
        peak: mosaicPeak(random),
        delay: column * 60
      });
    }
  }
  return tiles;
}
