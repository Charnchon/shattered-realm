// ============================================================ math and random helpers
import type { Point } from '../types';
import { TAU } from './constants';

/** Random float in [min, max). */
export const randRange = (min: number, max: number): number => min + Math.random() * (max - min);
/** Random integer in [min, max], both inclusive. */
export const randInt = (min: number, max: number): number => Math.floor(randRange(min, max + 1));
/** Random element of a non-empty array. */
export const randPick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);

/** Squared distance between two points. Cheaper than `dist` for comparisons. */
export const distSq = (a: Point, b: Point): number => {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
};
export const dist = (a: Point, b: Point): number => Math.sqrt(distSq(a, b));

/** Degrees to radians. */
export const degToRad = (deg: number): number => (deg * Math.PI) / 180;

/** Signed shortest angle from `a` to `b`, in (-PI, PI]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Pick one item, weighted by `weightOf(item)`. */
export function weightedPick<T>(items: readonly T[], weightOf: (item: T) => number): T {
  let total = 0;
  for (const item of items) total += weightOf(item);
  let r = Math.random() * total;
  for (const item of items) {
    r -= weightOf(item);
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

/** Fisher-Yates shuffle, in place. Returns the same array. */
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Squared distance from point (px, py) to the segment (ax, ay)-(bx, by). */
export function segmentDistSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax, vy = by - ay, wx = px - ax, wy = py - ay;
  const lenSq = vx * vx + vy * vy;
  let t = lenSq ? (wx * vx + wy * vy) / lenSq : 0;
  t = clamp(t, 0, 1);
  const cx = ax + vx * t - px, cy = ay + vy * t - py;
  return cx * cx + cy * cy;
}

/** Seconds to "m:ss". */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
