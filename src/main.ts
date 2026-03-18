// Styles
import './styles/main.css';

// Core components
import { CanvasRenderer } from './renderer/CanvasRenderer';
import { Controls } from './ui/Controls';
import { MetricsPanel } from './ui/Metrics';
import type { Simulation } from './types';

// Simulations
import Boids from './simulations/Boids';
import AntColony from './simulations/AntColony';
import GameOfLife from './simulations/GameOfLife';
import ParticleSwarm from './simulations/ParticleSwarm';

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------
const canvas = document.getElementById('simulation-canvas') as HTMLCanvasElement | null;
const controlsContainer = document.getElementById('controls') as HTMLElement | null;
const metricsContainer = document.getElementById('metrics') as HTMLElement | null;
const selectorNav = document.getElementById('sim-selector') as HTMLElement | null;
const fpsCounter = document.getElementById('fps-counter') as HTMLElement | null;
const btnPause = document.getElementById('btn-pause') as HTMLButtonElement | null;
const btnReset = document.getElementById('btn-reset') as HTMLButtonElement | null;
const simDescription = document.getElementById('sim-description') as HTMLElement | null;

if (!canvas || !controlsContainer || !metricsContainer || !selectorNav) {
  throw new Error('Required DOM elements not found. Check index.html structure.');
}

// ---------------------------------------------------------------------------
// Instantiate core components
// ---------------------------------------------------------------------------
const renderer = new CanvasRenderer(canvas);

const controls = new Controls(controlsContainer, (key: string, value: number) => {
  if (activeSim) {
    activeSim.setParam(key, value);
  }
});

const metricsPanel = new MetricsPanel(metricsContainer);

// ---------------------------------------------------------------------------
// Simulation registry (ordered as specified)
// ---------------------------------------------------------------------------
const simulations: Simulation[] = [
  new Boids(),
  new AntColony(),
  new GameOfLife(),
  new ParticleSwarm(),
];

let activeSim: Simulation | null = null;
let paused = false;
let lastTime = 0;
let frameCount = 0;
let metricsFrameCount = 0;

// FPS smoothing (rolling average)
const FPS_SAMPLES = 30;
const fpsSamples: number[] = [];
let fpsIndex = 0;
for (let i = 0; i < FPS_SAMPLES; i++) fpsSamples.push(60);

// ---------------------------------------------------------------------------
// Build simulation selector nav
// ---------------------------------------------------------------------------
const navButtons: HTMLButtonElement[] = [];

for (const sim of simulations) {
  const btn = document.createElement('button');
  btn.className = 'sim-btn';
  btn.innerHTML = `<span class="sim-icon">${sim.meta.icon}</span>${sim.meta.name}`;
  btn.addEventListener('click', () => switchSimulation(sim));
  selectorNav.appendChild(btn);
  navButtons.push(btn);
}

// ---------------------------------------------------------------------------
// Simulation switching
// ---------------------------------------------------------------------------
function switchSimulation(sim: Simulation): void {
  // Destroy current simulation
  if (activeSim) {
    activeSim.destroy();
  }

  activeSim = sim;

  // Update nav active state
  for (let i = 0; i < simulations.length; i++) {
    navButtons[i].classList.toggle('active', simulations[i] === sim);
  }

  // Initialize with current canvas dimensions
  const { width, height } = renderer.getDimensions();
  sim.init(width, height);

  // Update controls panel
  controls.setParams(sim.meta.params);

  // Clear and prepare metrics
  metricsPanel.clear();
  metricsPanel.update(sim.getMetrics());

  // Update description
  if (simDescription) {
    simDescription.textContent = sim.meta.description;
  }

  // Reset pause state
  paused = false;
  if (btnPause) {
    btnPause.textContent = 'Pause';
    btnPause.classList.remove('paused');
  }
}

// ---------------------------------------------------------------------------
// Pause / Reset handlers
// ---------------------------------------------------------------------------
if (btnPause) {
  btnPause.addEventListener('click', () => {
    paused = !paused;
    btnPause.textContent = paused ? 'Resume' : 'Pause';
    btnPause.classList.toggle('paused', paused);
  });
}

if (btnReset) {
  btnReset.addEventListener('click', () => {
    if (!activeSim) return;

    activeSim.reset();

    // Refresh controls to default values
    controls.setParams(activeSim.meta.params);
    metricsPanel.clear();
    metricsPanel.update(activeSim.getMetrics());

    // Unpause on reset
    paused = false;
    if (btnPause) {
      btnPause.textContent = 'Pause';
      btnPause.classList.remove('paused');
    }
  });
}

// ---------------------------------------------------------------------------
// Handle window resize - re-init simulation with new dimensions
// ---------------------------------------------------------------------------
let resizeTimeout: ReturnType<typeof setTimeout> | null = null;

window.addEventListener('resize', () => {
  // Debounce resize to avoid thrashing
  if (resizeTimeout) clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (activeSim) {
      const { width, height } = renderer.getDimensions();
      activeSim.init(width, height);
    }
  }, 200);
});

// ---------------------------------------------------------------------------
// Main animation loop
// ---------------------------------------------------------------------------
function loop(timestamp: number): void {
  requestAnimationFrame(loop);

  // Compute delta time in seconds, capped to avoid spiral-of-death
  const dtMs = lastTime === 0 ? 16.67 : timestamp - lastTime;
  lastTime = timestamp;
  const dt = Math.min(dtMs / 1000, 0.05);

  // FPS tracking
  if (dtMs > 0) {
    fpsSamples[fpsIndex] = 1000 / dtMs;
    fpsIndex = (fpsIndex + 1) % FPS_SAMPLES;
  }
  frameCount++;

  // Update FPS display every 10 frames
  if (frameCount % 10 === 0 && fpsCounter) {
    let sum = 0;
    for (let i = 0; i < FPS_SAMPLES; i++) sum += fpsSamples[i];
    const avgFps = Math.round(sum / FPS_SAMPLES);
    fpsCounter.textContent = `${avgFps} FPS`;
  }

  if (!activeSim) return;

  // Update simulation (skip if paused)
  if (!paused) {
    activeSim.update(dt);
  }

  // Render every frame (even when paused, for consistent display)
  renderer.clear('#0a0a1a');
  activeSim.render(renderer.ctx, renderer.width, renderer.height);

  // Update metrics every 10 frames for performance
  metricsFrameCount++;
  if (metricsFrameCount % 10 === 0) {
    metricsPanel.update(activeSim.getMetrics());
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
// Start with Boids as default
switchSimulation(simulations[0]);

// Kick off the animation loop
requestAnimationFrame(loop);
