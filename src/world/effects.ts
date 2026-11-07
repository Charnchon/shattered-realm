// ============================================================ visual effects, telegraphs, timers
import type { Telegraph, TelegraphSpec } from '../types';
import { TAU } from '../core/constants';
import { randRange } from '../core/math';
import { run } from '../core/state';

const MAX_FX = 500;
const MAX_FLOATING_TEXTS = 120;

/** Particles flying out from a point. */
export function spawnBurst(x: number, y: number, color: string, count: number, speed: number): void {
  for (let i = 0; i < count; i++) {
    const a = randRange(0, TAU), s = randRange(speed * 0.3, speed);
    const life = randRange(0.25, 0.5);
    run.fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: 0.5, color, size: randRange(2, 4) });
  }
}

export function spawnSlash(x: number, y: number, face: number, r: number, arc: number, color: string, width?: number): void {
  run.fx.push({ kind: 'slash', x, y, face, r, arc, color, life: 0.14, max: 0.14, w: width || 4 });
}

export function spawnRing(x: number, y: number, r: number, color: string): void {
  run.fx.push({ kind: 'ring', x, y, r, color, life: 0.3, max: 0.3 });
}

export function spawnLine(x1: number, y1: number, x2: number, y2: number, color: string, width?: number): void {
  run.fx.push({ kind: 'line', x: x1, y: y1, x2, y2, color, life: 0.18, max: 0.18, w: width || 4 });
}

/** Fading afterimage, used while dashing. */
export function spawnGhost(x: number, y: number, color: string): void {
  run.fx.push({ x, y, vx: 0, vy: 0, life: 0.25, max: 0.25, color, size: 9, ghost: true });
}

export function spawnPillar(x: number, y: number, r: number, color: string): void {
  run.fx.push({ kind: 'pillar', x, y, r, life: 0.35, max: 0.35, color });
}

/** Rising damage / status text. */
export function addFloatingText(x: number, y: number, text: string, color: string, size?: number): void {
  if (run.floatingTexts.length > MAX_FLOATING_TEXTS) run.floatingTexts.shift();
  run.floatingTexts.push({ x, y, text, color, size: size || 11, life: 0.7 });
}

/** Warning shape that fills up before an attack lands. */
export function addTelegraph(spec: TelegraphSpec): Telegraph {
  const telegraph = spec as Telegraph;
  telegraph.t = 0;
  run.telegraphs.push(telegraph);
  return telegraph;
}

/** Run `fn` after `delay` seconds of game time (pauses with the game). */
export function schedule(delay: number, fn: () => void): void {
  run.timers.push({ t: delay, fn });
}

export function updateEffects(dt: number): void {
  for (const f of run.fx) {
    f.life -= dt;
    if (!f.kind) { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.9; f.vy *= 0.9; }
  }
  run.fx = run.fx.filter((f) => f.life > 0);
  if (run.fx.length > MAX_FX) run.fx.splice(0, run.fx.length - MAX_FX);

  for (const t of run.floatingTexts) { t.life -= dt; t.y -= 26 * dt; }
  run.floatingTexts = run.floatingTexts.filter((t) => t.life > 0);

  for (const t of run.telegraphs) t.t += dt;
  run.telegraphs = run.telegraphs.filter((t) => t.t < t.dur);

  for (const timer of run.timers) {
    timer.t -= dt;
    if (timer.t <= 0 && !timer.done) { timer.done = true; timer.fn(); }
  }
  run.timers = run.timers.filter((timer) => !timer.done);
}
