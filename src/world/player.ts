// ============================================================ player (the current hero, see withHero)
import type { DashOverride } from '../types';
import { ARENA_H, ARENA_W } from '../core/constants';
import { clamp } from '../core/math';
import { mouseWorld, run, showBanner } from '../core/state';
import { healPlayer } from './combat';
import { spawnGhost } from './effects';

const DEFAULT_DASH = { distance: 140, duration: 0.16 };

/** Move, cool down and act for the current hero, from `run.hero.input`. */
export function updatePlayer(dt: number): void {
  const p = run.player, stats = run.stats, input = run.hero.input;
  const aim = mouseWorld();
  p.face = Math.atan2(aim.y - p.y, aim.x - p.x);
  p.iframes -= dt;
  p.hitFlash -= dt;
  if (p.boneShieldTime > 0) {
    p.boneShieldTime -= dt;
    if (p.boneShieldTime <= 0) p.boneShield = 0;
  }

  const dashing = p.dashTime > 0;
  const walk = moveHero(p, input.moveX, input.moveY, stats.moveSpeed, dt);
  if (dashing) {
    if (run.cls.onDashMove) run.cls.onDashMove(dt);
    if (Math.random() < 0.6) spawnGhost(p.x, p.y, run.cls.color);
    if (p.dashTime <= 0 && run.cls.onDashEnd) run.cls.onDashEnd();
  } else {
    p.moveX = walk.x;
    p.moveY = walk.y;
  }

  // cooldowns and regeneration
  if (p.dashCharges < stats.dashCharges) {
    p.dashCooldown -= dt;
    if (p.dashCooldown <= 0) { p.dashCharges++; p.dashCooldown = stats.dashCooldown; }
  }
  p.heavyCooldown -= dt;
  const regen = stats.regen + (p.regenBuffTime > 0 ? p.regenBuff : 0);
  if (p.regenBuffTime > 0) p.regenBuffTime -= dt;
  if (regen > 0) healPlayer(regen * dt, true);

  // actions (one-shot presses are used up here)
  if (input.dash) tryDash();
  if (input.heavy && p.heavyCooldown <= 0) useHeavy();
  if (input.ult) tryUlt();
  input.dash = input.ult = false;
  run.cls.strike(dt, input.fire);
}

/** The part of a hero that moves. An online client predicts this for its own hero. */
export interface Motion {
  x: number;
  y: number;
  r: number;
  dashTime: number;
  dashVx: number;
  dashVy: number;
}

/**
 * One frame of movement: gliding through a dash, or walking at `moveSpeed` (input is normalised).
 * Shared by the host's simulation and a client's prediction so they agree. Returns the walk direction.
 */
export function moveHero(m: Motion, moveX: number, moveY: number, moveSpeed: number, dt: number): { x: number; y: number } {
  let mx = 0, my = 0;
  if (m.dashTime > 0) {
    m.dashTime -= dt;
    m.x += m.dashVx * dt;
    m.y += m.dashVy * dt;
  } else {
    mx = moveX; my = moveY;
    const len = Math.hypot(mx, my);
    if (len) { mx /= len; my /= len; }
    m.x += mx * moveSpeed * dt;
    m.y += my * moveSpeed * dt;
  }
  m.x = clamp(m.x, m.r, ARENA_W - m.r);
  m.y = clamp(m.y, m.r, ARENA_H - m.r);
  return { x: mx, y: my };
}

/** Start a dash toward (dx, dy), or where `shape` says. Returns its duration. */
export function startDash(m: Motion, dx: number, dy: number, shape: DashOverride | null): number {
  const distance = (shape && shape.dist) || DEFAULT_DASH.distance;
  const duration = (shape && shape.dur) || DEFAULT_DASH.duration;
  const angle = shape && shape.ang != null ? shape.ang : Math.atan2(dy, dx);
  m.dashVx = (Math.cos(angle) * distance) / duration;
  m.dashVy = (Math.sin(angle) * distance) / duration;
  m.dashTime = duration;
  return duration;
}

/** The dash direction: where you're walking, or where you face when standing still. */
export function dashDirection(moveX: number, moveY: number, face: number): { x: number; y: number } {
  return moveX || moveY ? { x: moveX, y: moveY } : { x: Math.cos(face), y: Math.sin(face) };
}

/** Dash in the move direction (or facing, when standing still). Classes may override distance/time/angle. */
function tryDash(): void {
  const p = run.player;
  if (p.dashCharges <= 0 || p.dashTime > 0) return;
  p.dashCharges--;
  if (p.dashCooldown <= 0) p.dashCooldown = run.stats.dashCooldown;
  const dir = dashDirection(p.moveX, p.moveY, p.face);
  const duration = startDash(p, dir.x, dir.y, run.cls.dash ? run.cls.dash(dir.x, dir.y) : null);
  p.iframes = Math.max(p.iframes, duration + 0.08);
}

function useHeavy(): void {
  run.player.heavyCooldown = run.stats.heavyCooldown * run.stats.cooldownMul;
  run.cls.heavy();
}

function tryUlt(): void {
  const p = run.player;
  if (p.ult < 100) return;
  p.ult = 0;
  p.iframes = Math.max(p.iframes, 0.5);
  showBanner(run.cls.ultName + '!', 1.4);
  run.cls.ult();
}
