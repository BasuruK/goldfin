export function mosaicPeak(random: () => number = Math.random): number {
  return 0.35 + random() * 0.55;
}

export interface MosaicTile {
  base: number;
  peak: number;
  delay: number;
}

export function createMosaicTiles(
  columns: number,
  rows: number,
  random: () => number = Math.random
): MosaicTile[] {
  const tiles: MosaicTile[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      tiles.push({
        base: 0.08 + random() * 0.14,
        peak: mosaicPeak(random),
        delay: column * 60
      });
    }
  }
  return tiles;
}
