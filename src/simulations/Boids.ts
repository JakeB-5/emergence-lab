import type { Simulation, SimulationMeta, Metrics } from '../types';
import { SpatialHash } from '../engine/SpatialHash';

const TWO_PI = Math.PI * 2;

/**
 * Craig Reynolds' Boids flocking algorithm.
 * Uses struct-of-arrays layout for cache-friendly iteration.
 * Separation, Alignment, Cohesion with soft boundary bouncing.
 */
class Boids implements Simulation {
  readonly meta: SimulationMeta = {
    id: 'boids',
    name: 'Boids',
    description: 'Craig Reynolds\' emergent flocking simulation with separation, alignment, and cohesion.',
    icon: '🐦',
    params: [
      { key: 'count',       label: 'Boid Count',      min: 50,   max: 500,  step: 10,    default: 200  },
      { key: 'visualRange', label: 'Visual Range',     min: 20,   max: 200,  step: 5,     default: 75   },
      { key: 'separation',  label: 'Separation',       min: 0.01, max: 0.2,  step: 0.005, default: 0.05 },
      { key: 'alignment',   label: 'Alignment',        min: 0.01, max: 0.2,  step: 0.005, default: 0.05 },
      { key: 'cohesion',    label: 'Cohesion',         min: 0.001,max: 0.02, step: 0.001, default: 0.005},
      { key: 'maxSpeed',    label: 'Max Speed',        min: 1,    max: 15,   step: 0.5,   default: 6    },
    ],
  };

  // Simulation parameters
  private count       = 200;
  private visualRange = 75;
  private separation  = 0.05;
  private alignment   = 0.05;
  private cohesion    = 0.005;
  private maxSpeed    = 6;

  // Minimum separation distance (a fraction of visualRange)
  private get minSep(): number { return this.visualRange * 0.4; }

  // Soft boundary turn factor
  private readonly TURN_FACTOR = 0.5;
  private readonly MARGIN_FACTOR = 0.12; // margin = width/height * this

  // Canvas dimensions
  private width  = 800;
  private height = 600;

  // Struct-of-arrays boid storage
  private x!:  Float64Array;
  private y!:  Float64Array;
  private vx!: Float64Array;
  private vy!: Float64Array;

  private spatialHash!: SpatialHash;

  // Metrics state
  private avgSpeed        = 0;
  private avgNeighbors    = 0;
  private flockCount      = 0;
  private entropyVal      = 0;
  private framesSinceInit = 0;

  init(width: number, height: number): void {
    this.width  = width;
    this.height = height;
    this._allocate();
    this.spatialHash = new SpatialHash(this.visualRange);
    this.framesSinceInit = 0;
  }

  private _allocate(): void {
    const n = this.count;
    this.x  = new Float64Array(n);
    this.y  = new Float64Array(n);
    this.vx = new Float64Array(n);
    this.vy = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      this.x[i]  = Math.random() * this.width;
      this.y[i]  = Math.random() * this.height;
      const angle = Math.random() * TWO_PI;
      const speed = this.maxSpeed * (0.3 + Math.random() * 0.7);
      this.vx[i] = Math.cos(angle) * speed;
      this.vy[i] = Math.sin(angle) * speed;
    }
  }

  update(dt: number): void {
    // dt is already in seconds from main loop; clamp to prevent physics explosion
    const safeDt = Math.min(dt, 0.05);
    const n           = this.count;
    const vRange      = this.visualRange;
    const minSep      = this.minSep;
    const minSepSq    = minSep * minSep;
    const vRangeSq    = vRange * vRange;
    const sepFactor   = this.separation;
    const aliFactor   = this.alignment;
    const cohFactor   = this.cohesion;
    const maxSpd      = this.maxSpeed;
    const minSpd      = maxSpd * 0.2;
    const turn        = this.TURN_FACTOR;
    const marginX     = this.width  * this.MARGIN_FACTOR;
    const marginY     = this.height * this.MARGIN_FACTOR;
    const w           = this.width;
    const h           = this.height;

    const x  = this.x;
    const y  = this.y;
    const vx = this.vx;
    const vy = this.vy;

    // Rebuild spatial hash
    const hash = this.spatialHash;
    hash.clear();
    for (let i = 0; i < n; i++) {
      hash.insert(i, x[i], y[i]);
    }

    // Per-frame metric accumulators
    let totalSpeed     = 0;
    let totalNeighbors = 0;

    // Angle histogram for entropy (16 buckets)
    const BUCKETS = 16;
    const hist = new Uint32Array(BUCKETS);

    for (let i = 0; i < n; i++) {
      const xi = x[i];
      const yi = y[i];

      // Get candidate neighbors from spatial hash
      const candidates = hash.query(xi, yi, vRange);

      let sepX = 0, sepY = 0;          // separation accumulator
      let avgVx = 0, avgVy = 0;        // alignment accumulator
      let centerX = 0, centerY = 0;    // cohesion accumulator
      let neighborCount = 0;
      let tooCloseCount = 0;

      for (let ci = 0; ci < candidates.length; ci++) {
        const j = candidates[ci];
        if (j === i) continue;

        const dx = xi - x[j];
        const dy = yi - y[j];
        const dSq = dx * dx + dy * dy;
        if (dSq > vRangeSq) continue;

        neighborCount++;
        centerX += x[j];
        centerY += y[j];
        avgVx   += vx[j];
        avgVy   += vy[j];

        if (dSq < minSepSq && dSq > 0) {
          // Separation: push away proportionally to closeness
          const inv = 1 / Math.sqrt(dSq);
          sepX += dx * inv;
          sepY += dy * inv;
          tooCloseCount++;
        }
      }

      let nvx = vx[i];
      let nvy = vy[i];

      if (neighborCount > 0) {
        // Cohesion: steer toward center of mass
        const cxAvg = centerX / neighborCount;
        const cyAvg = centerY / neighborCount;
        nvx += (cxAvg - xi) * cohFactor;
        nvy += (cyAvg - yi) * cohFactor;

        // Alignment: match average velocity
        const vxAvg = avgVx / neighborCount;
        const vyAvg = avgVy / neighborCount;
        nvx += (vxAvg - nvx) * aliFactor;
        nvy += (vyAvg - nvy) * aliFactor;
      }

      // Separation
      if (tooCloseCount > 0) {
        nvx += sepX * sepFactor;
        nvy += sepY * sepFactor;
      }

      // Soft boundary bouncing
      if (xi < marginX)     nvx += turn;
      if (xi > w - marginX) nvx -= turn;
      if (yi < marginY)     nvy += turn;
      if (yi > h - marginY) nvy -= turn;

      // Speed limits
      const spd = Math.sqrt(nvx * nvx + nvy * nvy);
      if (spd > maxSpd) {
        const s = maxSpd / spd;
        nvx *= s;
        nvy *= s;
      } else if (spd < minSpd && spd > 0) {
        const s = minSpd / spd;
        nvx *= s;
        nvy *= s;
      }

      vx[i] = nvx;
      vy[i] = nvy;

      // Update metrics accumulators
      totalSpeed     += Math.sqrt(nvx * nvx + nvy * nvy);
      totalNeighbors += neighborCount;

      // Angle bucket for entropy
      const angle = Math.atan2(nvy, nvx); // [-PI, PI]
      const bucket = Math.floor(((angle + Math.PI) / TWO_PI) * BUCKETS) % BUCKETS;
      hist[bucket]++;
    }

    // Integrate positions — scale by dt to maintain frame-rate independence
    // Multiply by 60 to preserve same visual speed as original 60fps assumption
    for (let i = 0; i < n; i++) {
      x[i] += vx[i] * safeDt * 60;
      y[i] += vy[i] * safeDt * 60;

      // Hard clamp (fallback if boid escapes margin logic)
      if (x[i] < 0)  x[i] = 0;
      if (x[i] > w)  x[i] = w;
      if (y[i] < 0)  y[i] = 0;
      if (y[i] > h)  y[i] = h;
    }

    // Compute metrics
    this.avgSpeed     = totalSpeed / n;
    this.avgNeighbors = totalNeighbors / n;
    this.flockCount   = this._countFlocks();
    this.entropyVal   = this._shannonEntropy(hist, n);
    this.framesSinceInit++;
  }

  /** Shannon entropy of direction histogram (normalized to [0,1]) */
  private _shannonEntropy(hist: Uint32Array, total: number): number {
    if (total === 0) return 0;
    let entropy = 0;
    const inv = 1 / total;
    for (let i = 0; i < hist.length; i++) {
      if (hist[i] === 0) continue;
      const p = hist[i] * inv;
      entropy -= p * Math.log2(p);
    }
    // Normalize by log2(buckets)
    return entropy / Math.log2(hist.length);
  }

  /**
   * Count flocks via union-find on neighbor graph.
   * Two boids are in the same flock if within visualRange.
   */
  private _countFlocks(): number {
    const n    = this.count;
    const vRSq = this.visualRange * this.visualRange;
    const x    = this.x;
    const y    = this.y;

    // Union-Find with path compression
    const parent = new Int32Array(n);
    for (let i = 0; i < n; i++) parent[i] = i;

    function find(a: number): number {
      while (parent[a] !== a) {
        parent[a] = parent[parent[a]]; // path halving
        a = parent[a];
      }
      return a;
    }

    function union(a: number, b: number): void {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    }

    const hash = this.spatialHash;
    for (let i = 0; i < n; i++) {
      const candidates = hash.query(x[i], y[i], this.visualRange);
      for (let ci = 0; ci < candidates.length; ci++) {
        const j = candidates[ci];
        if (j <= i) continue;
        const dx = x[i] - x[j];
        const dy = y[i] - y[j];
        if (dx * dx + dy * dy <= vRSq) {
          union(i, j);
        }
      }
    }

    // Count unique roots
    const roots = new Set<number>();
    for (let i = 0; i < n; i++) roots.add(find(i));
    return roots.size;
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Trail effect: semi-transparent overlay instead of full clear
    ctx.fillStyle = 'rgba(10, 10, 20, 0.25)';
    ctx.fillRect(0, 0, width, height);

    const n  = this.count;
    const x  = this.x;
    const y  = this.y;
    const vx = this.vx;
    const vy = this.vy;

    for (let i = 0; i < n; i++) {
      const bx   = x[i];
      const by   = y[i];
      const bvx  = vx[i];
      const bvy  = vy[i];
      const angle = Math.atan2(bvy, bvx);

      // Color by velocity direction (hue = angle mapped to [0,360])
      const hue = ((angle + Math.PI) / TWO_PI) * 360;
      const spd = Math.sqrt(bvx * bvx + bvy * bvy);
      const lightness = 45 + (spd / this.maxSpeed) * 25;

      const hslColor   = `hsl(${hue | 0}, 90%, ${lightness | 0}%)`;
      ctx.strokeStyle  = `hsla(${hue | 0}, 100%, 80%, 0.6)`;
      ctx.lineWidth    = 0.5;

      // Compute triangle vertices directly — no save()/restore() per boid
      const size = 5;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      // tip (front)
      const x1 = bx + cos * size * 1.6;
      const y1 = by + sin * size * 1.6;
      // left base vertex
      const x2 = bx - cos * size * 0.8 - sin * size * 0.7;
      const y2 = by - sin * size * 0.8 + cos * size * 0.7;
      // right base vertex
      const x3 = bx - cos * size * 0.8 + sin * size * 0.7;
      const y3 = by - sin * size * 0.8 - cos * size * 0.7;

      ctx.fillStyle = hslColor;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  setParam(key: string, value: number): void {
    switch (key) {
      case 'count':
        if (value !== this.count) {
          this.count = value | 0;
          // Re-init to resize arrays; preserve dimensions
          this._allocate();
          this.spatialHash = new SpatialHash(this.visualRange);
        }
        break;
      case 'visualRange':
        this.visualRange = value;
        // Rebuild spatial hash with new cell size
        this.spatialHash = new SpatialHash(value);
        break;
      case 'separation':  this.separation = value; break;
      case 'alignment':   this.alignment  = value; break;
      case 'cohesion':    this.cohesion   = value; break;
      case 'maxSpeed':    this.maxSpeed   = value; break;
    }
  }

  getParam(key: string): number {
    switch (key) {
      case 'count':       return this.count;
      case 'visualRange': return this.visualRange;
      case 'separation':  return this.separation;
      case 'alignment':   return this.alignment;
      case 'cohesion':    return this.cohesion;
      case 'maxSpeed':    return this.maxSpeed;
      default:            return 0;
    }
  }

  getMetrics(): Metrics {
    return {
      avgSpeed: {
        label: 'Avg Speed',
        value: this.avgSpeed.toFixed(2),
      },
      avgNeighbors: {
        label: 'Avg Neighbors',
        value: this.avgNeighbors.toFixed(1),
      },
      flockCount: {
        label: 'Flock Count',
        value: this.flockCount,
      },
      entropy: {
        label: 'Direction Entropy',
        value: (this.entropyVal * 100).toFixed(1) + '%',
      },
    };
  }

  reset(): void {
    this._allocate();
    this.spatialHash = new SpatialHash(this.visualRange);
    this.framesSinceInit = 0;
  }

  destroy(): void {
    // Release typed array references for GC
    this.x  = new Float64Array(0);
    this.y  = new Float64Array(0);
    this.vx = new Float64Array(0);
    this.vy = new Float64Array(0);
    this.spatialHash.clear();
  }
}

export default Boids;
