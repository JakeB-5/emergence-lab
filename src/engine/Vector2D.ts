import type { Vec2 } from '../types';

/**
 * Static utility functions for 2D vector math.
 * Uses plain objects {x, y} to avoid allocation overhead from class instances.
 */
export const Vector2D = {
  /** Returns a + b */
  add(a: Vec2, b: Vec2): Vec2 {
    return { x: a.x + b.x, y: a.y + b.y };
  },

  /** Returns a - b */
  sub(a: Vec2, b: Vec2): Vec2 {
    return { x: a.x - b.x, y: a.y - b.y };
  },

  /** Scalar multiply */
  mul(a: Vec2, s: number): Vec2 {
    return { x: a.x * s, y: a.y * s };
  },

  /** Scalar divide (safe: returns zero vector if s === 0) */
  div(a: Vec2, s: number): Vec2 {
    if (s === 0) return { x: 0, y: 0 };
    return { x: a.x / s, y: a.y / s };
  },

  /** Euclidean magnitude */
  mag(a: Vec2): number {
    return Math.sqrt(a.x * a.x + a.y * a.y);
  },

  /** Squared magnitude (cheaper when only relative comparison needed) */
  magSq(a: Vec2): number {
    return a.x * a.x + a.y * a.y;
  },

  /** Unit vector; returns zero vector if magnitude is 0 */
  normalize(a: Vec2): Vec2 {
    const m = Math.sqrt(a.x * a.x + a.y * a.y);
    if (m === 0) return { x: 0, y: 0 };
    return { x: a.x / m, y: a.y / m };
  },

  /** Euclidean distance between two points */
  dist(a: Vec2, b: Vec2): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  },

  /** Squared distance (cheaper when only relative comparison needed) */
  distSq(a: Vec2, b: Vec2): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  },

  /** Dot product */
  dot(a: Vec2, b: Vec2): number {
    return a.x * b.x + a.y * b.y;
  },

  /** Clamp vector magnitude to maxMag; returns original if already within limit */
  limit(a: Vec2, maxMag: number): Vec2 {
    const mSq = a.x * a.x + a.y * a.y;
    if (mSq <= maxMag * maxMag) return a;
    const scale = maxMag / Math.sqrt(mSq);
    return { x: a.x * scale, y: a.y * scale };
  },

  /** Random unit vector */
  random(): Vec2 {
    const angle = Math.random() * Math.PI * 2;
    return { x: Math.cos(angle), y: Math.sin(angle) };
  },

  /** Angle of vector in radians (atan2) */
  angle(a: Vec2): number {
    return Math.atan2(a.y, a.x);
  },

  /** Create unit vector from angle in radians */
  fromAngle(angle: number): Vec2 {
    return { x: Math.cos(angle), y: Math.sin(angle) };
  },

  /** Linear interpolation between a and b by t in [0,1] */
  lerp(a: Vec2, b: Vec2, t: number): Vec2 {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  },

  /** Zero vector constant (do not mutate) */
  ZERO: Object.freeze({ x: 0, y: 0 }) as Vec2,
};

export default Vector2D;
