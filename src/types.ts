// Core type definitions for Emergence Lab simulations

export interface Vec2 {
  x: number;
  y: number;
}

export interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface SimulationMeta {
  id: string;
  name: string;
  description: string;
  icon: string;
  params: ParamDef[];
}

export interface MetricEntry {
  label: string;
  value: string | number;
}

export type Metrics = Record<string, MetricEntry>;

export interface Simulation {
  meta: SimulationMeta;
  init(width: number, height: number): void;
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D, width: number, height: number): void;
  setParam(key: string, value: number): void;
  getParam(key: string): number;
  getMetrics(): Metrics;
  reset(): void;
  destroy(): void;
}
