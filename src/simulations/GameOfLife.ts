import type { Simulation, SimulationMeta, Metrics } from '../types';

export class GameOfLife implements Simulation {
  meta: SimulationMeta = {
    id: 'game-of-life',
    name: "Conway's Game of Life",
    description:
      'Classic cellular automaton where cells live, die, or are born based on neighbor counts.',
    icon: '🧬',
    params: [
      { key: 'cellSize', label: 'Cell Size', min: 2, max: 20, step: 1, default: 4 },
      { key: 'speed', label: 'Speed (gen/s)', min: 1, max: 60, step: 1, default: 10 },
      {
        key: 'initialDensity',
        label: 'Initial Density',
        min: 0.1,
        max: 0.9,
        step: 0.01,
        default: 0.35,
      },
    ],
  };

  // Parameters
  private cellSize = 4;
  private speed = 10;
  private initialDensity = 0.35;

  // Grid dimensions
  private cols = 0;
  private rows = 0;

  // Double-buffered state (0=dead, 1=alive)
  private current!: Uint8Array;
  private next!: Uint8Array;

  // Per-cell age in generations (reset to 0 on death)
  private ages!: Uint16Array;

  // Pixel output buffer for putImageData
  private imageData!: ImageData;
  private pixels!: Uint32Array;

  // Offscreen canvas used to blit the ImageData via drawImage (HiDPI-safe)
  private offscreen!: HTMLCanvasElement;
  private offscreenCtx!: CanvasRenderingContext2D;

  // Timing
  private accumulator = 0;
  private secondsPerGen = 1 / 10;

  // Metrics state
  private generation = 0;
  private population = 0;
  private births = 0;
  private deaths = 0;
  private prevPopulation = 0;
  private changedLastStep = 0;
  private totalCells = 0;

  // Canvas size snapshot for resize detection
  private canvasWidth = 0;
  private canvasHeight = 0;

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  init(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
    this.cols = Math.floor(width / this.cellSize);
    this.rows = Math.floor(height / this.cellSize);
    this.totalCells = this.cols * this.rows;

    this.current = new Uint8Array(this.totalCells);
    this.next = new Uint8Array(this.totalCells);
    this.ages = new Uint16Array(this.totalCells);

    // ImageData covers the grid area at logical pixel dimensions.
    // We render it to an offscreen canvas and then use drawImage() to blit to
    // the main canvas — drawImage respects the DPR transform, so HiDPI works.
    const imgW = this.cols * this.cellSize;
    const imgH = this.rows * this.cellSize;
    this.imageData = new ImageData(imgW, imgH);
    // Uint32Array view so we can write RGBA as a single integer per pixel
    this.pixels = new Uint32Array(this.imageData.data.buffer);

    // Create (or reuse) the offscreen canvas at the logical grid size
    this.offscreen = document.createElement('canvas');
    this.offscreen.width = imgW;
    this.offscreen.height = imgH;
    const octx = this.offscreen.getContext('2d');
    if (!octx) throw new Error('Failed to get offscreen 2D context');
    this.offscreenCtx = octx;

    this.randomize();
    this.accumulator = 0;
    this.generation = 0;
  }

  reset(): void {
    this.generation = 0;
    this.accumulator = 0;
    this.births = 0;
    this.deaths = 0;
    this.changedLastStep = 0;
    this.ages.fill(0);
    this.randomize();
  }

  destroy(): void {
    this.current = null!;
    this.next = null!;
    this.ages = null!;
    this.imageData = null!;
    this.pixels = null!;
  }

  // -------------------------------------------------------------------------
  // Parameter management
  // -------------------------------------------------------------------------

  setParam(key: string, value: number): void {
    switch (key) {
      case 'cellSize': {
        const clamped = Math.max(2, Math.min(20, Math.round(value)));
        if (clamped !== this.cellSize) {
          this.cellSize = clamped;
          // Re-initialise at current canvas size
          if (this.canvasWidth > 0) this.init(this.canvasWidth, this.canvasHeight);
        }
        break;
      }
      case 'speed':
        this.speed = Math.max(1, Math.min(60, value));
        this.secondsPerGen = 1 / this.speed;
        break;
      case 'initialDensity':
        this.initialDensity = Math.max(0.1, Math.min(0.9, value));
        break;
    }
  }

  getParam(key: string): number {
    switch (key) {
      case 'cellSize':
        return this.cellSize;
      case 'speed':
        return this.speed;
      case 'initialDensity':
        return this.initialDensity;
    }
    return 0;
  }

  getMetrics(): Metrics {
    const stability =
      this.totalCells > 0
        ? (((this.totalCells - this.changedLastStep) / this.totalCells) * 100).toFixed(1)
        : '100.0';

    const birthRate =
      this.prevPopulation > 0 ? ((this.births / this.prevPopulation) * 100).toFixed(1) : '0.0';
    const deathRate =
      this.prevPopulation > 0 ? ((this.deaths / this.prevPopulation) * 100).toFixed(1) : '0.0';

    return {
      population: { label: 'Population', value: this.population },
      generation: { label: 'Generation', value: this.generation },
      birthRate: { label: 'Birth Rate', value: `${birthRate}%` },
      deathRate: { label: 'Death Rate', value: `${deathRate}%` },
      stability: { label: 'Stability', value: `${stability}%` },
    };
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  update(dt: number): void {
    this.accumulator += dt;

    while (this.accumulator >= this.secondsPerGen) {
      this.accumulator -= this.secondsPerGen;
      this.step();
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Handle canvas resize
    if (width !== this.canvasWidth || height !== this.canvasHeight) {
      this.init(width, height);
    }

    this.buildImageData();

    // Flush pixel data to the offscreen canvas
    this.offscreenCtx.putImageData(this.imageData, 0, 0);

    // Clear the full canvas with the background colour, then blit the grid.
    // drawImage respects the DPR transform applied to ctx, so HiDPI is correct.
    ctx.fillStyle = '#050810';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(this.offscreen, 0, 0, width, height);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private randomize(): void {
    for (let i = 0; i < this.totalCells; i++) {
      this.current[i] = Math.random() < this.initialDensity ? 1 : 0;
      this.ages[i] = this.current[i] ? 1 : 0;
    }
    this.countPopulation();
    this.prevPopulation = this.population;
    this.births = 0;
    this.deaths = 0;
    this.changedLastStep = 0;
  }

  /** One Game-of-Life generation using toroidal (wrapping) boundaries. */
  private step(): void {
    const { cols, rows, current, next, ages } = this;
    let births = 0;
    let deaths = 0;
    let changed = 0;

    for (let r = 0; r < rows; r++) {
      const rUp = r === 0 ? rows - 1 : r - 1;
      const rDown = r === rows - 1 ? 0 : r + 1;

      for (let c = 0; c < cols; c++) {
        const cLeft = c === 0 ? cols - 1 : c - 1;
        const cRight = c === cols - 1 ? 0 : c + 1;

        // Sum the 8 neighbours
        const neighbors =
          current[rUp * cols + cLeft] +
          current[rUp * cols + c] +
          current[rUp * cols + cRight] +
          current[r * cols + cLeft] +
          current[r * cols + cRight] +
          current[rDown * cols + cLeft] +
          current[rDown * cols + c] +
          current[rDown * cols + cRight];

        const idx = r * cols + c;
        const alive = current[idx];
        let nextAlive: number;

        if (alive) {
          // Survive with 2 or 3 neighbours
          nextAlive = neighbors === 2 || neighbors === 3 ? 1 : 0;
        } else {
          // Born with exactly 3 neighbours
          nextAlive = neighbors === 3 ? 1 : 0;
        }

        next[idx] = nextAlive;

        if (nextAlive) {
          ages[idx] = Math.min(ages[idx] + 1, 65535);
          if (!alive) births++;
        } else {
          if (alive) deaths++;
          ages[idx] = 0;
        }

        if (nextAlive !== alive) changed++;
      }
    }

    // Swap buffers
    const tmp = this.current;
    this.current = this.next;
    this.next = tmp;

    this.prevPopulation = this.population;
    this.births = births;
    this.deaths = deaths;
    this.changedLastStep = changed;
    this.generation++;
    this.countPopulation();
  }

  private countPopulation(): void {
    let count = 0;
    for (let i = 0; i < this.totalCells; i++) {
      if (this.current[i]) count++;
    }
    this.population = count;
  }

  /**
   * Convert the grid state into RGBA pixel data.
   * Each cell maps to cellSize x cellSize pixels.
   * Colour encodes cell age: new cells = bright cyan, old cells = deep blue.
   */
  private buildImageData(): void {
    const { cols, rows, cellSize, current, ages, pixels } = this;
    const imgWidth = cols * cellSize;

    // Background colour packed as ABGR (little-endian Uint32)
    // #050810 → R=5, G=8, B=16 → 0xFF100805
    const BG = 0xff100805;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        let color: number;

        if (current[idx]) {
          const age = ages[idx];
          color = ageToColor(age);
        } else {
          color = BG;
        }

        // Fill the cellSize x cellSize block
        const baseX = c * cellSize;
        const baseY = r * cellSize;
        for (let dy = 0; dy < cellSize; dy++) {
          const rowStart = (baseY + dy) * imgWidth + baseX;
          for (let dx = 0; dx < cellSize; dx++) {
            pixels[rowStart + dx] = color;
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Colour helper — converts cell age to a packed ABGR Uint32
// Age 1 (newborn) → bright cyan (#00FFFF)
// Age ~50+       → deep blue (#0033AA)
// ---------------------------------------------------------------------------
function ageToColor(age: number): number {
  // Normalise: 0 at age 1, 1 at age >= 60
  const t = Math.min((age - 1) / 59, 1);

  // Interpolate cyan → deep blue
  const r = Math.round(0 + t * 0);          // 0 → 0
  const g = Math.round(255 - t * 204);      // 255 → 51
  const b = Math.round(255 - t * 85);       // 255 → 170

  // Pack as ABGR (canvas ImageData is RGBA, but Uint32 on little-endian is ABGR)
  return (0xff << 24) | (b << 16) | (g << 8) | r;
}

export default GameOfLife;
