// ============================================================ projectiles
import type { PlayerShot, PlayerShotSpec, Point } from '../types';
import { ARENA_H, ARENA_W } from '../core/constants';
import { angleDiff, clamp } from '../core/math';
import { run } from '../core/state';
import { hitEnemy, hurtPlayer } from './combat';
import { nearestEnemy } from './enemies';

/** Fire a player projectile. Defaults: life 1.6 s, no pierce. */
export function fireShot(spec: PlayerShotSpec): PlayerShot {
  const shot = spec as PlayerShot;
  shot.owner = 'player';
  shot.hitSet = new Set();
  shot.life = shot.life || 1.6;
  shot.pierce = shot.pierce || 0;
  run.shots.push(shot);
  return shot;
}

/** Fire an enemy projectile from `source` at `angle`. */
export function fireEnemyShot(source: Point, angle: number, speed: number, r: number, dmg: number, color: string, kind: string, life: number): void {
  run.shots.push({
    owner: 'enemy', x: source.x, y: source.y,
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    r, dmg, life, color, kind,
  });
}

export function updateShots(dt: number): void {
  for (const s of run.shots) {
    if (s.dead) continue;
    s.life -= dt;
    if (s.owner === 'player' && s.home) steerTowardsNearest(s, s.home, dt);
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (s.life <= 0 || s.x < -20 || s.y < -20 || s.x > ARENA_W + 20 || s.y > ARENA_H + 20) {
      if (s.owner === 'player') endShot(s);
      else s.dead = true;
      continue;
    }
    if (s.owner === 'player') collidePlayerShot(s);
    else if ((run.player.x - s.x) ** 2 + (run.player.y - s.y) ** 2 <= (run.player.r + s.r) ** 2) {
      hurtPlayer(s.dmg);
      s.dead = true;
    }
  }
  run.shots = run.shots.filter((s) => !s.dead);
}

function steerTowardsNearest(s: PlayerShot, turnRate: number, dt: number): void {
  const target = nearestEnemy(s.x, s.y, 260);
  if (!target) return;
  const speed = Math.hypot(s.vx, s.vy), a = Math.atan2(s.vy, s.vx);
  const want = Math.atan2(target.y - s.y, target.x - s.x);
  const turned = a + clamp(angleDiff(a, want), -turnRate * dt, turnRate * dt);
  s.vx = Math.cos(turned) * speed;
  s.vy = Math.sin(turned) * speed;
}

function collidePlayerShot(s: PlayerShot): void {
  for (const e of run.enemies) {
    if (e.dead || s.hitSet.has(e)) continue;
    if ((e.x - s.x) ** 2 + (e.y - s.y) ** 2 > (e.r + s.r) ** 2) continue;
    s.hitSet.add(e);
    hitEnemy(e, s.dmg, {
      projectile: true,
      from: { x: s.x - s.vx * 0.05, y: s.y - s.vy * 0.05 },
      knock: s.knock, knockAngle: Math.atan2(s.vy, s.vx),
      heavy: s.heavy, tag: s.tag, color: s.textColor,
    });
    if (s.onHit) s.onHit(s, e);
    if (s.pierce-- <= 0) { endShot(s); break; }
  }
}

function endShot(s: PlayerShot): void {
  if (s.dead) return;
  s.dead = true;
  if (s.onEnd) s.onEnd(s);
}
