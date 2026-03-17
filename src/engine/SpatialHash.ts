/**
 * Spatial hash grid for O(1) average-case neighbor lookups.
 * Uses prime-based hash: cx * 73856093 ^ cy * 19349663
 */
export class SpatialHash {
  private cellSize: number;
  private invCellSize: number;
  // Map from hashed cell key to array of entity ids
  private cells: Map<number, number[]>;

  constructor(cellSize: number) {
    this.cellSize = cellSize;
    this.invCellSize = 1 / cellSize;
    this.cells = new Map();
  }

  /** Convert world coordinate to cell coordinate */
  private toCellCoord(v: number): number {
    return Math.floor(v * this.invCellSize);
  }

  /**
   * Hash a cell (cx, cy) pair to a single integer key.
   * Uses bitwise XOR of two prime-multiplied coordinates.
   * Operates in 32-bit integer space via |0.
   */
  private hash(cx: number, cy: number): number {
    return ((cx * 73856093) ^ (cy * 19349663)) | 0;
  }

  /** Insert an entity id at world position (x, y) */
  insert(id: number, x: number, y: number): void {
    const cx = this.toCellCoord(x);
    const cy = this.toCellCoord(y);
    const key = this.hash(cx, cy);
    let cell = this.cells.get(key);
    if (cell === undefined) {
      cell = [];
      this.cells.set(key, cell);
    }
    cell.push(id);
  }

  /**
   * Query all entity ids within radius of (x, y).
   * Checks all cells overlapped by the bounding box of the circle.
   */
  query(x: number, y: number, radius: number): number[] {
    const result: number[] = [];
    const minCx = this.toCellCoord(x - radius);
    const maxCx = this.toCellCoord(x + radius);
    const minCy = this.toCellCoord(y - radius);
    const maxCy = this.toCellCoord(y + radius);
    const rSq = radius * radius;

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const key = this.hash(cx, cy);
        const cell = this.cells.get(key);
        if (cell === undefined) continue;
        for (let i = 0; i < cell.length; i++) {
          result.push(cell[i]);
        }
      }
    }

    // Note: callers receive candidate ids; exact distance filtering
    // is intentionally left to the caller for flexibility.
    // However we provide rSq for reference if needed.
    void rSq;

    return result;
  }

  /**
   * Query all entity ids within radius, with exact distance filtering.
   * Requires a positions lookup to perform the distance check.
   */
  queryWithPositions(
    x: number,
    y: number,
    radius: number,
    px: Float64Array | number[],
    py: Float64Array | number[]
  ): number[] {
    const result: number[] = [];
    const minCx = this.toCellCoord(x - radius);
    const maxCx = this.toCellCoord(x + radius);
    const minCy = this.toCellCoord(y - radius);
    const maxCy = this.toCellCoord(y + radius);
    const rSq = radius * radius;

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const key = this.hash(cx, cy);
        const cell = this.cells.get(key);
        if (cell === undefined) continue;
        for (let i = 0; i < cell.length; i++) {
          const id = cell[i];
          const dx = px[id] - x;
          const dy = py[id] - y;
          if (dx * dx + dy * dy <= rSq) {
            result.push(id);
          }
        }
      }
    }

    return result;
  }

  /** Remove all entries. Call each frame before re-inserting. */
  clear(): void {
    this.cells.clear();
  }

  /** Number of occupied cells (useful for debugging) */
  get cellCount(): number {
    return this.cells.size;
  }
}

export default SpatialHash;
