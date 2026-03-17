# 🧬 Emergence Lab

Complex intelligence emerges from simple rules. Emergence Lab is an interactive web playground where you can observe and experiment with emergent intelligence through four classic multi-agent simulations. Each agent perceives only its immediate neighbors, yet when hundreds interact, global patterns and behaviors arise spontaneously. Tweak parameters in real-time and explore the boundaries of emergence.

![Emergence Lab](./docs/screenshot.png)

---

## Simulations

### 🐦 Boids — Flocking
Craig Reynolds' 1986 flocking model. Each boid follows just three rules — **Separation**, **Alignment**, and **Cohesion** — yet the collective moves like a living flock of birds.

### 🐜 Ant Colony — Colony Optimization
Ants deposit pheromones on their return from food sources. Pheromones evaporate and diffuse over time, and shorter paths accumulate stronger trails. Observe **stigmergy** — optimal routes emerging without any central coordination.

### 🧊 Game of Life — Cellular Automaton
Each cell lives or dies based on its neighbor count. From just two rules, infinite structures emerge: gliders, oscillators, still lifes, and beyond.

### 🎯 Particle Swarm — Swarm Optimization
Particles explore a multi-modal Rastrigin fitness landscape, sharing personal and global best positions to converge on the global minimum. Visualize the balance between exploration and exploitation in PSO.

---

## Tech Stack

| Component | Choice |
|-----------|--------|
| Bundler | Vite 6 |
| Language | TypeScript 5 |
| Rendering | HTML5 Canvas API |
| Runtime Dependencies | **None** (zero external runtime dependencies) |

---

## Getting Started

```bash
git clone https://github.com/JakeB-5/emergence-lab.git
cd emergence-lab
npm install
npm run dev       # Dev server (http://localhost:5173)
npm run build     # Production build → dist/
```

---

## Project Structure

```
src/
├── main.ts                  # App entry point, animation loop
├── types.ts                 # Simulation interface & shared types
├── engine/
│   ├── Vector2D.ts          # 2D vector math utilities
│   └── SpatialHash.ts       # Spatial partitioning data structure
├── renderer/
│   └── CanvasRenderer.ts    # Canvas renderer wrapper
├── ui/
│   ├── Controls.ts          # Parameter slider UI
│   └── Metrics.ts           # Real-time metrics panel
└── simulations/
    ├── Boids.ts
    ├── AntColony.ts
    ├── GameOfLife.ts
    └── ParticleSwarm.ts
```

---

## Key Design Decisions

- **`Simulation` interface**: A plugin architecture enforcing `init / update / render / setParam / getMetrics / reset / destroy`. Any new simulation just implements the interface and is automatically registered in the UI.
- **`SpatialHash`**: Partitions the canvas into a fixed cell grid, reducing neighbor lookups from O(n²) to near O(1). Used for Boids' visual range queries.
- **`putImageData` pixel rendering**: AntColony's pheromone grid and GameOfLife's cell grid manipulate `ImageData` directly instead of using Canvas 2D draw calls, achieving 8-10x better rendering performance.
- **`requestAnimationFrame` + deltaTime loop**: Frame timing is normalized to elapsed seconds and clamped to 50ms max, keeping simulation speed consistent across tab switches and frame drops.

---

## Note

This project was an experiment in AI autonomy. Claude (AI) independently set the goals, chose the technology, and implemented everything from scratch. No human was involved in any technical decision.

---

## License

MIT
