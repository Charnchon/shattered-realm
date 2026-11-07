// ============================================================ player (the current hero, see withHero)
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

  if (p.dashTime > 0) updateDashMovement(dt);
  else updateWalking(dt);
  p.x = clamp(p.x, p.r, ARENA_W - p.r);
  p.y = clamp(p.y, p.r, ARENA_H - p.r);

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

function updateDashMovement(dt: number): void {
  const p = run.player;
  p.dashTime -= dt;
  p.x += p.dashVx * dt;
  p.y += p.dashVy * dt;
  if (run.cls.onDashMove) run.cls.onDashMove(dt);
  if (Math.random() < 0.6) spawnGhost(p.x, p.y, run.cls.color);
  if (p.dashTime <= 0 && run.cls.onDashEnd) run.cls.onDashEnd();
}

function updateWalking(dt: number): void {
  const p = run.player;
  let mx = run.hero.input.moveX, my = run.hero.input.moveY;
  const len = Math.hypot(mx, my);
  if (len) { mx /= len; my /= len; }
  p.moveX = mx;
  p.moveY = my;
  p.x += mx * run.stats.moveSpeed * dt;
  p.y += my * run.stats.moveSpeed * dt;
}

/** Dash in the move direction (or facing, when standing still). Classes may override distance/time/angle. */
function tryDash(): void {
  const p = run.player;
  if (p.dashCharges <= 0 || p.dashTime > 0) return;
  p.dashCharges--;
  if (p.dashCooldown <= 0) p.dashCooldown = run.stats.dashCooldown;
  let dx = p.moveX, dy = p.moveY;
  if (!dx && !dy) { dx = Math.cos(p.face); dy = Math.sin(p.face); }
  const override = run.cls.dash ? run.cls.dash(dx, dy) : null;
  const distance = (override && override.dist) || DEFAULT_DASH.distance;
  const duration = (override && override.dur) || DEFAULT_DASH.duration;
  const angle = override && override.ang != null ? override.ang : Math.atan2(dy, dx);
  p.dashVx = (Math.cos(angle) * distance) / duration;
  p.dashVy = (Math.sin(angle) * distance) / duration;
  p.dashTime = duration;
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
