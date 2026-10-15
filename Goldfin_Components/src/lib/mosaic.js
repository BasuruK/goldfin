
export function mosaicPeak(random = Math.random) {
  return .35 + random() * .55;
}

/** @typedef {{ base: number, peak: number, delay: number }} MosaicTile */

/**
 * @param {number} columns
 * @param {number} rows
 * @param {() => number} [random]
 * @returns {MosaicTile[]}
 */
export function createMosaicTiles(columns, rows, random = Math.random) {
  /** @type {MosaicTile[]} */
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
