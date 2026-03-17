import type { Simulation, SimulationMeta, Metrics } from '../types';

const TWO_PI = Math.PI * 2;

/** Ant behavioral states */
const enum AntState {
  EXPLORING = 0,
  RETURNING = 1,
}

/** A food source cluster */
interface FoodSource {
  x: number;
  y: number;
  radius: number;
  amount: number; // remaining food units
}

/**
 * Ant Colony Optimization simulation.
 * Ants explore a pheromone grid, find food, and return to nest.
 * Pheromones evaporate and diffuse each frame.
 * Uses putImageData for pheromone rendering (performance).
 */
class AntColony implements Simulation {
  readonly meta: SimulationMeta = {
    id: 'ant-colony',
    name: 'Ant Colony',
    description: 'Ant colony optimization: emergent foraging paths through stigmergic pheromone trails.',
    icon: '🐜',
    params: [
      { key: 'antCount',         label: 'Ant Count',          min: 20,  max: 200,  step: 5,     default: 80   },
      { key: 'evaporationRate',  label: 'Evaporation Rate',   min: 0.9, max: 0.999,step: 0.001, default: 0.98 },
      { key: 'pheromoneStrength',label: 'Pheromone Strength', min: 1,   max: 20,   step: 0.5,   default: 5    },
      { key: 'diffusionRate',    label: 'Diffusion Rate',     min: 0,   max: 0.3,  step: 0.01,  default: 0.1  },
      { key: 'wanderStrength',   label: 'Wander Strength',    min: 0.1, max: 2,    step: 0.05,  default: 0.5  },
    ],
  };

  // Parameters
  private antCount          = 80;
  private evaporationRate   = 0.98;
  private pheromoneStrength = 5;
  private diffusionRate     = 0.1;
  private wanderStrength    = 0.5;

  // Canvas dimensions
  private width  = 800;
  private height = 600;

  // Pheromone grid (downsampled for perf: GRID_SCALE px per cell)
  private readonly GRID_SCALE = 4;
  private gridW = 0;
  private gridH = 0;
  private pheromone!:     Float64Array; // current frame
  private pheromoneTmp!:  Float64Array; // scratch for diffusion
  private imageData!:     ImageData;
  private pixels!:        Uint8ClampedArray;

  // Nest position
  private nestX = 0;
  private nestY = 0;
  private readonly NEST_RADIUS = 18;

  // Food sources
  private foodSources: FoodSource[] = [];
  private readonly FOOD_RADIUS     = 14;
  private readonly FOOD_CLUSTER_R  = 30;

  // Ant struct-of-arrays
  private ax!:    Float64Array; // position x
  private ay!:    Float64Array; // position y
  private avx!:   Float64Array; // velocity x
  private avy!:   Float64Array; // velocity y
  private aState!: Uint8Array;  // AntState enum
  // Path memory: last known food position per ant
  private aFoodX!: Float64Array;
  private aFoodY!: Float64Array;

  // Metrics
  private foodCollected  = 0;
  private activeAnts     = 0;
  private peakPheromone  = 0;
  private trailCoverage  = 0;

  // Offscreen canvas for pheromone layer
  private offscreen!:    HTMLCanvasElement;
  private offCtx!:       CanvasRenderingContext2D;

  init(width: number, height: number): void {
    this.width  = width;
    this.height = height;
    this.nestX  = width  * 0.5;
    this.nestY  = height * 0.5;

    this.gridW = Math.ceil(width  / this.GRID_SCALE);
    this.gridH = Math.ceil(height / this.GRID_SCALE);

    const cells       = this.gridW * this.gridH;
    this.pheromone    = new Float64Array(cells);
    this.pheromoneTmp = new Float64Array(cells);

    // Offscreen canvas for pheromone ImageData
    this.offscreen = document.createElement('canvas');
    this.offscreen.width  = this.gridW;
    this.offscreen.height = this.gridH;
    this.offCtx = this.offscreen.getContext('2d', { willReadFrequently: true })!;
    this.imageData = this.offCtx.createImageData(this.gridW, this.gridH);
    this.pixels    = this.imageData.data;

    this._placeFoodSources();
    this._allocateAnts();
  }

  private _placeFoodSources(): void {
    this.foodSources = [];
    const count = 2 + Math.floor(Math.random());  // 2–3 clusters
    const margin = 80;
    const cx = this.width  * 0.5;
    const cy = this.height * 0.5;
    const minNestDist = 120;

    for (let attempt = 0; attempt < 200 && this.foodSources.length < count; attempt++) {
      const fx = margin + Math.random() * (this.width  - margin * 2);
      const fy = margin + Math.random() * (this.height - margin * 2);
      const dx = fx - cx;
      const dy = fy - cy;
      if (Math.sqrt(dx * dx + dy * dy) < minNestDist) continue;
      // Ensure sources are not too close to each other
      let tooClose = false;
      for (const s of this.foodSources) {
        const edx = fx - s.x;
        const edy = fy - s.y;
        if (Math.sqrt(edx * edx + edy * edy) < 120) { tooClose = true; break; }
      }
      if (tooClose) continue;
      this.foodSources.push({ x: fx, y: fy, radius: this.FOOD_CLUSTER_R, amount: 500 });
    }

    // Guarantee at least one food source if placement failed
    if (this.foodSources.length === 0) {
      this.foodSources.push({
        x: this.width * 0.2, y: this.height * 0.2,
        radius: this.FOOD_CLUSTER_R, amount: 500,
      });
    }
  }

  private _allocateAnts(): void {
    const n = this.antCount;
    this.ax     = new Float64Array(n);
    this.ay     = new Float64Array(n);
    this.avx    = new Float64Array(n);
    this.avy    = new Float64Array(n);
    this.aState = new Uint8Array(n);
    this.aFoodX = new Float64Array(n);
    this.aFoodY = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      this.ax[i] = this.nestX + (Math.random() - 0.5) * 20;
      this.ay[i] = this.nestY + (Math.random() - 0.5) * 20;
      const angle = Math.random() * TWO_PI;
      const spd   = 1.5 + Math.random() * 1.5;
      this.avx[i] = Math.cos(angle) * spd;
      this.avy[i] = Math.sin(angle) * spd;
      this.aState[i] = AntState.EXPLORING;
    }

    this.foodCollected = 0;
  }

  update(_dt: number): void {
    this._updatePheromones();
    this._updateAnts();
    this._computeMetrics();
  }

  /** Evaporate and diffuse pheromone grid */
  private _updatePheromones(): void {
    const p   = this.pheromone;
    const tmp = this.pheromoneTmp;
    const W   = this.gridW;
    const H   = this.gridH;
    const evap = this.evaporationRate;
    const diff = this.diffusionRate;

    if (diff > 0) {
      // Simple box-filter diffusion (4-neighbor average blend)
      const keep = 1 - diff;
      const share = diff * 0.25;

      for (let gy = 0; gy < H; gy++) {
        for (let gx = 0; gx < W; gx++) {
          const idx = gy * W + gx;
          const v   = p[idx];
          let   nb  = 0;
          nb += gx > 0     ? p[idx - 1]     : v;
          nb += gx < W - 1 ? p[idx + 1]     : v;
          nb += gy > 0     ? p[idx - W]     : v;
          nb += gy < H - 1 ? p[idx + W]     : v;
          tmp[idx] = (v * keep + nb * share) * evap;
          if (tmp[idx] < 0.001) tmp[idx] = 0; // floor to zero
        }
      }
      this.pheromone.set(tmp);
    } else {
      // Evaporation only
      for (let i = 0; i < p.length; i++) {
        p[i] *= evap;
        if (p[i] < 0.001) p[i] = 0;
      }
    }
  }

  private _updateAnts(): void {
    const n    = this.antCount;
    const nestX = this.nestX;
    const nestY = this.nestY;
    const nestR = this.NEST_RADIUS;
    const W     = this.gridW;
    const H     = this.gridH;
    const scale = this.GRID_SCALE;
    const p     = this.pheromone;
    const pStr  = this.pheromoneStrength;
    const wand  = this.wanderStrength;
    const ANT_SPEED = 2.5;
    const FOOD_R    = this.FOOD_RADIUS;

    let returning = 0;

    for (let i = 0; i < n; i++) {
      const xi  = this.ax[i];
      const yi  = this.ay[i];
      let   vxi = this.avx[i];
      let   vyi = this.avy[i];

      if (this.aState[i] === AntState.EXPLORING) {
        // --- EXPLORING ---
        // Sense pheromone in front-left, front, front-right
        const angle   = Math.atan2(vyi, vxi);
        const SENSOR_DIST = 8; // grid cells
        const SENSOR_ANG  = 0.4; // radians

        const sensorAngles = [angle - SENSOR_ANG, angle, angle + SENSOR_ANG];
        let   bestV  = -1;
        let   bestA  = angle;

        for (const sa of sensorAngles) {
          const sx = Math.round((xi / scale) + Math.cos(sa) * SENSOR_DIST);
          const sy = Math.round((yi / scale) + Math.sin(sa) * SENSOR_DIST);
          if (sx < 0 || sx >= W || sy < 0 || sy >= H) continue;
          const v = p[sy * W + sx];
          if (v > bestV) { bestV = v; bestA = sa; }
        }

        // Blend pheromone attraction with wander noise
        const wanderAngle = angle + (Math.random() - 0.5) * wand * TWO_PI * 0.3;
        const blendT = bestV > 0.1 ? Math.min(bestV / 5, 0.7) : 0;
        const targetAngle = bestA * blendT + wanderAngle * (1 - blendT);

        // Smoothly steer toward target angle
        const steerX = Math.cos(targetAngle);
        const steerY = Math.sin(targetAngle);
        vxi = vxi * 0.7 + steerX * ANT_SPEED * 0.3;
        vyi = vyi * 0.7 + steerY * ANT_SPEED * 0.3;

        // Normalize to constant speed
        const spd = Math.sqrt(vxi * vxi + vyi * vyi);
        if (spd > 0) { vxi = (vxi / spd) * ANT_SPEED; vyi = (vyi / spd) * ANT_SPEED; }

        // Check food sources
        for (const food of this.foodSources) {
          if (food.amount <= 0) continue;
          const fdx = xi - food.x;
          const fdy = yi - food.y;
          if (fdx * fdx + fdy * fdy < FOOD_R * FOOD_R) {
            // Found food — switch to returning
            food.amount -= 1;
            this.foodCollected++;
            this.aState[i] = AntState.RETURNING;
            this.aFoodX[i] = food.x;
            this.aFoodY[i] = food.y;
            // Reverse direction toward nest
            const backDx = nestX - xi;
            const backDy = nestY - yi;
            const backD  = Math.sqrt(backDx * backDx + backDy * backDy) || 1;
            vxi = (backDx / backD) * ANT_SPEED;
            vyi = (backDy / backD) * ANT_SPEED;
            break;
          }
        }
      } else {
        // --- RETURNING ---
        returning++;
        // Steer directly toward nest
        const dx = nestX - xi;
        const dy = nestY - yi;
        const d  = Math.sqrt(dx * dx + dy * dy);

        if (d < nestR) {
          // Reached nest — deposit collected food, go back to exploring
          this.aState[i] = AntState.EXPLORING;
          const angle  = Math.random() * TWO_PI;
          vxi = Math.cos(angle) * ANT_SPEED;
          vyi = Math.sin(angle) * ANT_SPEED;
        } else {
          vxi = vxi * 0.5 + (dx / d) * ANT_SPEED * 0.5;
          vyi = vyi * 0.5 + (dy / d) * ANT_SPEED * 0.5;
          const spd = Math.sqrt(vxi * vxi + vyi * vyi);
          if (spd > 0) { vxi = (vxi / spd) * ANT_SPEED; vyi = (vyi / spd) * ANT_SPEED; }

          // Deposit pheromone at current position
          const gx = Math.round(xi / scale);
          const gy = Math.round(yi / scale);
          if (gx >= 0 && gx < W && gy >= 0 && gy < H) {
            p[gy * W + gx] = Math.min(p[gy * W + gx] + pStr, 255);
          }
        }
      }

      // Update velocity
      this.avx[i] = vxi;
      this.avy[i] = vyi;

      // Integrate position
      let nx = xi + vxi;
      let ny = yi + vyi;

      // Bounce off walls
      if (nx < 0)              { nx = 0;              this.avx[i] = Math.abs(vxi);  }
      if (nx > this.width)     { nx = this.width;      this.avx[i] = -Math.abs(vxi); }
      if (ny < 0)              { ny = 0;               this.avy[i] = Math.abs(vyi);  }
      if (ny > this.height)    { ny = this.height;     this.avy[i] = -Math.abs(vyi); }

      this.ax[i] = nx;
      this.ay[i] = ny;
    }

    this.activeAnts = returning;
  }

  private _computeMetrics(): void {
    const p = this.pheromone;
    let peak = 0;
    let covered = 0;
    const threshold = 0.5;

    for (let i = 0; i < p.length; i++) {
      if (p[i] > peak) peak = p[i];
      if (p[i] > threshold) covered++;
    }

    this.peakPheromone = peak;
    this.trailCoverage = (covered / p.length) * 100;
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Clear main canvas
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, width, height);

    // --- Pheromone layer via ImageData ---
    this._buildPheromoneImage();
    this.offCtx.putImageData(this.imageData, 0, 0);

    // Scale up pheromone layer to canvas size
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(this.offscreen, 0, 0, width, height);
    ctx.restore();

    // --- Food sources ---
    for (const food of this.foodSources) {
      if (food.amount <= 0) continue;
      const alpha = Math.min(food.amount / 500, 1);
      ctx.save();
      const grad = ctx.createRadialGradient(food.x, food.y, 0, food.x, food.y, this.FOOD_CLUSTER_R);
      grad.addColorStop(0, `rgba(80, 255, 80, ${alpha})`);
      grad.addColorStop(0.6, `rgba(40, 180, 40, ${alpha * 0.8})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(food.x, food.y, this.FOOD_CLUSTER_R, 0, TWO_PI);
      ctx.fill();
      ctx.restore();
    }

    // --- Nest ---
    ctx.save();
    const nestGrad = ctx.createRadialGradient(
      this.nestX, this.nestY, 0,
      this.nestX, this.nestY, this.NEST_RADIUS
    );
    nestGrad.addColorStop(0, 'rgba(255, 160, 30, 1)');
    nestGrad.addColorStop(0.5, 'rgba(200, 100, 10, 0.9)');
    nestGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = nestGrad;
    ctx.beginPath();
    ctx.arc(this.nestX, this.nestY, this.NEST_RADIUS, 0, TWO_PI);
    ctx.fill();
    ctx.restore();

    // --- Ants ---
    const n = this.antCount;
    for (let i = 0; i < n; i++) {
      const isReturning = this.aState[i] === AntState.RETURNING;
      ctx.fillStyle = isReturning ? '#ffe040' : 'rgba(220, 220, 230, 0.85)';
      ctx.beginPath();
      ctx.arc(this.ax[i], this.ay[i], isReturning ? 2.5 : 2, 0, TWO_PI);
      ctx.fill();
    }
  }

  /**
   * Build RGBA ImageData from pheromone grid.
   * Maps intensity to a green→yellow→red color ramp.
   */
  private _buildPheromoneImage(): void {
    const p    = this.pheromone;
    const px   = this.pixels;
    const len  = this.gridW * this.gridH;

    for (let i = 0; i < len; i++) {
      const v = p[i];
      if (v < 0.01) {
        px[i * 4]     = 0;
        px[i * 4 + 1] = 0;
        px[i * 4 + 2] = 0;
        px[i * 4 + 3] = 0;
        continue;
      }

      // Map 0..255 to color ramp: dark-green → green → yellow → orange → red
      const t = Math.min(v / 20, 1); // saturates at value 20

      let r: number, g: number, b: number;
      if (t < 0.5) {
        // green → yellow
        const tt = t * 2;
        r = tt * 255 | 0;
        g = 180 + tt * 50 | 0;
        b = 0;
      } else {
        // yellow → red
        const tt = (t - 0.5) * 2;
        r = 255;
        g = (1 - tt) * 200 | 0;
        b = 0;
      }

      const alpha = Math.min(v / 8, 0.85) * 255 | 0;
      px[i * 4]     = r;
      px[i * 4 + 1] = g;
      px[i * 4 + 2] = b;
      px[i * 4 + 3] = alpha;
    }
  }

  setParam(key: string, value: number): void {
    switch (key) {
      case 'antCount':
        if (value !== this.antCount) {
          this.antCount = value | 0;
          this._allocateAnts();
        }
        break;
      case 'evaporationRate':   this.evaporationRate   = value; break;
      case 'pheromoneStrength': this.pheromoneStrength = value; break;
      case 'diffusionRate':     this.diffusionRate     = value; break;
      case 'wanderStrength':    this.wanderStrength    = value; break;
    }
  }

  getParam(key: string): number {
    switch (key) {
      case 'antCount':          return this.antCount;
      case 'evaporationRate':   return this.evaporationRate;
      case 'pheromoneStrength': return this.pheromoneStrength;
      case 'diffusionRate':     return this.diffusionRate;
      case 'wanderStrength':    return this.wanderStrength;
      default:                  return 0;
    }
  }

  getMetrics(): Metrics {
    return {
      foodCollected: {
        label: 'Food Collected',
        value: this.foodCollected,
      },
      activeAnts: {
        label: 'Returning Ants',
        value: this.activeAnts,
      },
      peakPheromone: {
        label: 'Peak Pheromone',
        value: this.peakPheromone.toFixed(1),
      },
      trailCoverage: {
        label: 'Trail Coverage',
        value: this.trailCoverage.toFixed(1) + '%',
      },
    };
  }

  reset(): void {
    if (this.pheromone) {
      this.pheromone.fill(0);
      this.pheromoneTmp.fill(0);
    }
    this._placeFoodSources();
    this._allocateAnts();
  }

  destroy(): void {
    this.pheromone    = new Float64Array(0);
    this.pheromoneTmp = new Float64Array(0);
    this.ax  = new Float64Array(0);
    this.ay  = new Float64Array(0);
    this.avx = new Float64Array(0);
    this.avy = new Float64Array(0);
    this.aState = new Uint8Array(0);
    this.foodSources = [];
  }
}

export default AntColony;
