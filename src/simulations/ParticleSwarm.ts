import type { Simulation, SimulationMeta, Metrics } from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Search space bounds mapped to canvas coordinates. */
const SEARCH_MIN = -5.12;
const SEARCH_MAX = 5.12;
const SEARCH_RANGE = SEARCH_MAX - SEARCH_MIN;

/** Maximum age history stored per particle for trail rendering. */
const TRAIL_LENGTH = 20;

// ---------------------------------------------------------------------------
// Rastrigin fitness function (multi-modal, global min = 0 at origin)
// f(x,y) = 20 + x² + y² - 10*(cos(2πx) + cos(2πy))
// ---------------------------------------------------------------------------
function rastrigin(x: number, y: number): number {
  const TWO_PI = 2 * Math.PI;
  return 20 + x * x + y * y - 10 * (Math.cos(TWO_PI * x) + Math.cos(TWO_PI * y));
}

// ---------------------------------------------------------------------------
// Colour helpers for fitness heatmap
// Fitness range roughly [0, 80] for Rastrigin on [-5.12, 5.12]
// Low fitness (good) → yellow/green, high fitness (bad) → dark purple
// ---------------------------------------------------------------------------
const FITNESS_MAX_DISPLAY = 80; // clamp for colour mapping

function fitnessToABGR(fitness: number): number {
  // t = 0 → best (low fitness, yellow), t = 1 → worst (high fitness, dark purple)
  const t = Math.min(fitness / FITNESS_MAX_DISPLAY, 1);

  // Colour stops: yellow(0) → green → cyan → blue → dark-purple(1)
  let r: number, g: number, b: number;

  if (t < 0.25) {
    // yellow → green
    const s = t / 0.25;
    r = Math.round(220 - s * 220);
    g = Math.round(220 - s * 20);
    b = Math.round(0 + s * 20);
  } else if (t < 0.5) {
    // green → cyan
    const s = (t - 0.25) / 0.25;
    r = 0;
    g = Math.round(200 - s * 50);
    b = Math.round(20 + s * 180);
  } else if (t < 0.75) {
    // cyan → blue
    const s = (t - 0.5) / 0.25;
    r = 0;
    g = Math.round(150 - s * 150);
    b = Math.round(200 + s * 55);
  } else {
    // blue → dark purple
    const s = (t - 0.75) / 0.25;
    r = Math.round(s * 60);
    g = 0;
    b = Math.round(255 - s * 175);
  }

  return (0xff << 24) | (b << 16) | (g << 8) | r;
}

// ---------------------------------------------------------------------------
// Particle type
// ---------------------------------------------------------------------------
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  pBestX: number;
  pBestY: number;
  pBestFitness: number;
  /** Ring buffer of recent canvas positions for trail rendering */
  trailX: Float32Array;
  trailY: Float32Array;
  trailHead: number;
  trailCount: number;
}

// ---------------------------------------------------------------------------
// ParticleSwarm simulation
// ---------------------------------------------------------------------------

export class ParticleSwarm implements Simulation {
  meta: SimulationMeta = {
    id: 'particle-swarm',
    name: 'Particle Swarm Optimization',
    description:
      'Swarm intelligence algorithm where particles collectively search for the global minimum of a multi-modal fitness landscape.',
    icon: '🌀',
    params: [
      { key: 'particleCount', label: 'Particles', min: 10, max: 200, step: 1, default: 50 },
      { key: 'inertia', label: 'Inertia (w)', min: 0.1, max: 1.0, step: 0.001, default: 0.729 },
      { key: 'cognitive', label: 'Cognitive (c1)', min: 0.5, max: 3.0, step: 0.001, default: 1.494 },
      { key: 'social', label: 'Social (c2)', min: 0.5, max: 3.0, step: 0.001, default: 1.494 },
      { key: 'maxVelocity', label: 'Max Velocity', min: 1, max: 20, step: 1, default: 4 },
    ],
  };

  // Parameters
  private particleCount = 50;
  private inertia = 0.729;
  private cognitive = 1.494;
  private social = 1.494;
  private maxVelocity = 4;

  // Swarm state
  private particles: Particle[] = [];
  private gBestX = 0;
  private gBestY = 0;
  private gBestFitness = Infinity;

  // Metrics
  private iterations = 0;
  private avgFitness = 0;
  private initialGBest = Infinity; // used for convergence %

  // Canvas dimensions
  private canvasWidth = 0;
  private canvasHeight = 0;

  // Pre-rendered fitness landscape (only redrawn on resize)
  private landscapeImageData: ImageData | null = null;
  private landscapeWidth = 0;
  private landscapeHeight = 0;

  // Pulsing gBest animation
  private pulsePhase = 0;

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  init(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
    this.buildLandscape(width, height);
    this.spawnParticles();
    this.iterations = 0;
    this.pulsePhase = 0;
  }

  reset(): void {
    this.gBestFitness = Infinity;
    this.initialGBest = Infinity;
    this.iterations = 0;
    this.pulsePhase = 0;
    this.spawnParticles();
  }

  destroy(): void {
    this.landscapeImageData = null;
    this.particles = [];
  }

  // -------------------------------------------------------------------------
  // Parameters
  // -------------------------------------------------------------------------

  setParam(key: string, value: number): void {
    switch (key) {
      case 'particleCount': {
        const n = Math.round(Math.max(10, Math.min(200, value)));
        if (n !== this.particleCount) {
          this.particleCount = n;
          if (this.canvasWidth > 0) this.spawnParticles();
        }
        break;
      }
      case 'inertia':
        this.inertia = Math.max(0.1, Math.min(1.0, value));
        break;
      case 'cognitive':
        this.cognitive = Math.max(0.5, Math.min(3.0, value));
        break;
      case 'social':
        this.social = Math.max(0.5, Math.min(3.0, value));
        break;
      case 'maxVelocity':
        this.maxVelocity = Math.max(1, Math.min(20, Math.round(value)));
        break;
    }
  }

  getParam(key: string): number {
    switch (key) {
      case 'particleCount': return this.particleCount;
      case 'inertia':       return this.inertia;
      case 'cognitive':     return this.cognitive;
      case 'social':        return this.social;
      case 'maxVelocity':   return this.maxVelocity;
    }
    return 0;
  }

  getMetrics(): Metrics {
    const convergence =
      this.initialGBest > 0 && isFinite(this.initialGBest)
        ? Math.min(
            100,
            ((this.initialGBest - this.gBestFitness) / this.initialGBest) * 100,
          ).toFixed(1)
        : '0.0';

    return {
      gBestFitness: {
        label: 'Global Best Fitness',
        value: isFinite(this.gBestFitness) ? this.gBestFitness.toFixed(4) : '—',
      },
      avgFitness: {
        label: 'Average Fitness',
        value: this.avgFitness.toFixed(4),
      },
      convergence: {
        label: 'Convergence',
        value: `${convergence}%`,
      },
      iterations: {
        label: 'Iterations',
        value: this.iterations,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Update  (called once per frame by the host)
  // -------------------------------------------------------------------------

  update(dt: number): void {
    this.pulsePhase += dt * 3; // ~3 rad/s pulse rate

    // Run multiple PSO steps per frame for faster convergence visuals
    const stepsPerFrame = 3;
    for (let s = 0; s < stepsPerFrame; s++) {
      this.psoStep();
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Handle canvas resize
    if (width !== this.canvasWidth || height !== this.canvasHeight) {
      this.canvasWidth = width;
      this.canvasHeight = height;
      this.buildLandscape(width, height);
    }

    // 1. Draw fitness landscape
    if (this.landscapeImageData) {
      ctx.putImageData(this.landscapeImageData, 0, 0);
    } else {
      ctx.fillStyle = '#0a0020';
      ctx.fillRect(0, 0, width, height);
    }

    // 2. Draw particle trails
    this.renderTrails(ctx);

    // 3. Draw pBest markers
    this.renderPBests(ctx);

    // 4. Draw gBest with pulsing glow
    this.renderGBest(ctx, width, height);

    // 5. Draw particles on top
    this.renderParticles(ctx, width, height);
  }

  // -------------------------------------------------------------------------
  // Private: PSO algorithm
  // -------------------------------------------------------------------------

  private psoStep(): void {
    const { inertia: w, cognitive: c1, social: c2, maxVelocity: vMax } = this;
    let totalFitness = 0;

    for (const p of this.particles) {
      const r1 = Math.random();
      const r2 = Math.random();

      // Velocity update (PSO standard equation)
      p.vx = w * p.vx + c1 * r1 * (p.pBestX - p.x) + c2 * r2 * (this.gBestX - p.x);
      p.vy = w * p.vy + c1 * r1 * (p.pBestY - p.y) + c2 * r2 * (this.gBestY - p.y);

      // Velocity clamping
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed > vMax) {
        p.vx = (p.vx / speed) * vMax;
        p.vy = (p.vy / speed) * vMax;
      }

      // Position update (velocity is in search-space units)
      p.x += p.vx;
      p.y += p.vy;

      // Clamp to search bounds with reflection to avoid particles sticking
      if (p.x < SEARCH_MIN) { p.x = SEARCH_MIN; p.vx *= -0.5; }
      if (p.x > SEARCH_MAX) { p.x = SEARCH_MAX; p.vx *= -0.5; }
      if (p.y < SEARCH_MIN) { p.y = SEARCH_MIN; p.vy *= -0.5; }
      if (p.y > SEARCH_MAX) { p.y = SEARCH_MAX; p.vy *= -0.5; }

      // Evaluate fitness
      const fitness = rastrigin(p.x, p.y);
      totalFitness += fitness;

      // Update personal best
      if (fitness < p.pBestFitness) {
        p.pBestFitness = fitness;
        p.pBestX = p.x;
        p.pBestY = p.y;
      }

      // Update global best
      if (fitness < this.gBestFitness) {
        this.gBestFitness = fitness;
        this.gBestX = p.x;
        this.gBestY = p.y;
      }

      // Record canvas-space position into trail ring buffer
      const cx = this.searchToCanvas(p.x, this.canvasWidth);
      const cy = this.searchToCanvas(p.y, this.canvasHeight);
      const head = (p.trailHead + 1) % TRAIL_LENGTH;
      p.trailX[head] = cx;
      p.trailY[head] = cy;
      p.trailHead = head;
      if (p.trailCount < TRAIL_LENGTH) p.trailCount++;
    }

    this.avgFitness = totalFitness / this.particles.length;
    this.iterations++;
  }

  // -------------------------------------------------------------------------
  // Private: Rendering helpers
  // -------------------------------------------------------------------------

  private renderTrails(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.lineWidth = 1;

    for (const p of this.particles) {
      if (p.trailCount < 2) continue;

      ctx.beginPath();
      // Walk the ring buffer from oldest to newest
      let started = false;
      for (let i = 0; i < p.trailCount; i++) {
        const bufIdx = (p.trailHead - (p.trailCount - 1) + i + TRAIL_LENGTH) % TRAIL_LENGTH;
        const tx = p.trailX[bufIdx];
        const ty = p.trailY[bufIdx];
        const alpha = (i + 1) / p.trailCount; // fade in toward recent
        ctx.strokeStyle = `rgba(100, 180, 255, ${(alpha * 0.4).toFixed(3)})`;
        if (!started) {
          ctx.moveTo(tx, ty);
          started = true;
        } else {
          ctx.lineTo(tx, ty);
        }
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  private renderPBests(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.fillStyle = 'rgba(200, 200, 255, 0.35)';

    for (const p of this.particles) {
      const cx = this.searchToCanvas(p.pBestX, this.canvasWidth);
      const cy = this.searchToCanvas(p.pBestY, this.canvasHeight);
      ctx.beginPath();
      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private renderGBest(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (!isFinite(this.gBestFitness)) return;

    const cx = this.searchToCanvas(this.gBestX, width);
    const cy = this.searchToCanvas(this.gBestY, height);
    const pulse = 0.5 + 0.5 * Math.sin(this.pulsePhase);
    const outerR = 14 + pulse * 8;

    ctx.save();

    // Outer glow
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerR);
    grad.addColorStop(0, `rgba(255, 255, 100, ${0.6 + pulse * 0.3})`);
    grad.addColorStop(0.4, `rgba(255, 200, 0, ${0.3 + pulse * 0.2})`);
    grad.addColorStop(1, 'rgba(255, 150, 0, 0)');
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Core dot
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    ctx.restore();
  }

  private renderParticles(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    ctx.save();

    for (const p of this.particles) {
      const cx = this.searchToCanvas(p.x, width);
      const cy = this.searchToCanvas(p.y, height);

      // Particle body
      ctx.beginPath();
      ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fill();

      // Velocity arrow
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed > 0.01) {
        // Scale: vMax search-space units → ~20px arrow max
        const scale = (20 / this.maxVelocity) * (width / SEARCH_RANGE);
        const nx = (p.vx / speed) * Math.min(speed * scale, 20);
        const ny = (p.vy / speed) * Math.min(speed * scale, 20);

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + nx, cy + ny);
        ctx.strokeStyle = 'rgba(180, 220, 255, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Arrowhead
        const angle = Math.atan2(ny, nx);
        const tipX = cx + nx;
        const tipY = cy + ny;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(
          tipX - 5 * Math.cos(angle - 0.4),
          tipY - 5 * Math.sin(angle - 0.4),
        );
        ctx.lineTo(
          tipX - 5 * Math.cos(angle + 0.4),
          tipY - 5 * Math.sin(angle + 0.4),
        );
        ctx.closePath();
        ctx.fillStyle = 'rgba(180, 220, 255, 0.7)';
        ctx.fill();
      }
    }

    ctx.restore();
  }

  // -------------------------------------------------------------------------
  // Private: Landscape & initialisation
  // -------------------------------------------------------------------------

  /**
   * Build a full-canvas heatmap of the Rastrigin fitness landscape.
   * Only called on init and canvas resize — stored as ImageData.
   */
  private buildLandscape(width: number, height: number): void {
    const imgData = new ImageData(width, height);
    const pixels = new Uint32Array(imgData.data.buffer);

    for (let py = 0; py < height; py++) {
      const sy = this.canvasToSearch(py, height);
      for (let px = 0; px < width; px++) {
        const sx = this.canvasToSearch(px, width);
        const fitness = rastrigin(sx, sy);
        pixels[py * width + px] = fitnessToABGR(fitness);
      }
    }

    this.landscapeImageData = imgData;
    this.landscapeWidth = width;
    this.landscapeHeight = height;
  }

  private spawnParticles(): void {
    this.particles = [];
    this.gBestFitness = Infinity;

    for (let i = 0; i < this.particleCount; i++) {
      const x = SEARCH_MIN + Math.random() * SEARCH_RANGE;
      const y = SEARCH_MIN + Math.random() * SEARCH_RANGE;
      const vx = (Math.random() - 0.5) * this.maxVelocity * 0.2;
      const vy = (Math.random() - 0.5) * this.maxVelocity * 0.2;
      const fitness = rastrigin(x, y);

      const p: Particle = {
        x, y, vx, vy,
        pBestX: x,
        pBestY: y,
        pBestFitness: fitness,
        trailX: new Float32Array(TRAIL_LENGTH),
        trailY: new Float32Array(TRAIL_LENGTH),
        trailHead: 0,
        trailCount: 0,
      };

      if (fitness < this.gBestFitness) {
        this.gBestFitness = fitness;
        this.gBestX = x;
        this.gBestY = y;
      }

      this.particles.push(p);
    }

    this.initialGBest = this.gBestFitness;
    this.avgFitness = this.gBestFitness;
    this.iterations = 0;
  }

  // -------------------------------------------------------------------------
  // Coordinate conversion helpers
  // -------------------------------------------------------------------------

  /** Search-space coordinate → canvas pixel coordinate. */
  private searchToCanvas(s: number, canvasDim: number): number {
    return ((s - SEARCH_MIN) / SEARCH_RANGE) * canvasDim;
  }

  /** Canvas pixel coordinate → search-space coordinate. */
  private canvasToSearch(p: number, canvasDim: number): number {
    return SEARCH_MIN + (p / canvasDim) * SEARCH_RANGE;
  }
}

export default ParticleSwarm;
