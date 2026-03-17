# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Philosophy

This is an **autonomous AI experimentation project**. No human defines the goals, methods, or scope. The AI agent team independently:
- Sets its own objectives
- Chooses technologies and approaches
- Executes implementation
- Validates results

External information gathering (web search, documentation, APIs) is not just permitted but **encouraged** over pure reasoning from training data.

## Constraints

- **Language**: Communication in Korean (한글), code comments in English
- **Git**: Branch from `master` (initial branch), commit messages in English
- **Final deliverables**: README.md + public GitHub repository push
- **Agent model**: Uses TeamCreate for multi-agent orchestration — delegate substantive work to specialized agents

## Development

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (Vite HMR)
npm run build        # Type-check + production build (tsc && vite build)
npm run preview      # Preview production build
npx tsc --noEmit     # Type-check only
```

Stack: Vite 6 + TypeScript 5 + HTML5 Canvas. Zero runtime dependencies.

## Architecture

**Simulation interface** (`src/types.ts`): All simulations implement `Simulation` — `init`, `update(dt)`, `render(ctx)`, `setParam`, `getMetrics`, `reset`, `destroy`. This makes simulations pluggable.

**Engine layer** (`src/engine/`): `Vector2D` (static math utilities), `SpatialHash` (O(1) grid-based neighbor lookups for Boids).

**Simulations** (`src/simulations/`):
- `Boids.ts` — struct-of-arrays layout + SpatialHash + Union-Find for flock counting
- `AntColony.ts` — Float64Array pheromone grid + putImageData rendering
- `GameOfLife.ts` — Uint8Array double-buffering + Uint16Array age tracking
- `ParticleSwarm.ts` — pre-computed fitness landscape heatmap + ring-buffer trails

**UI layer**: `CanvasRenderer` (HiDPI + ResizeObserver), `Controls` (dynamic sliders from ParamDef[]), `MetricsPanel` (auto-updating card grid).

**main.ts**: Orchestrates simulation switching, animation loop (rAF + deltaTime), FPS counter, pause/reset.
