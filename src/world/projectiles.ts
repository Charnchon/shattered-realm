// ============================================================ projectiles
import type { EnemyShot, PlayerShot, PlayerShotSpec, Point, Shot } from '../types';
import { ARENA_H, ARENA_W } from '../core/constants';
import { angleDiff, clamp } from '../core/math';
import { asHero, run } from '../core/state';
import { hitEnemy, hurtHero } from './combat';
import { nearestEnemy } from './enemies';

/** Fire a projectile for the current hero. Defaults: life 1.6 s, no pierce. */
export function fireShot(spec: PlayerShotSpec): PlayerShot {
  const shot = spec as PlayerShot;
  shot.owner = 'player';
  shot.hero = run.hero.idx;
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
    if (s.owner === 'player') asHero(s.hero, () => updatePlayerShot(s, dt));
    else updateEnemyShot(s, dt);
  }
  run.shots = run.shots.filter((s) => !s.dead);
}

/** Moves the shot; returns false (and ends it) once it expires or leaves the arena. */
function moveShot(s: Shot, dt: number): boolean {
  s.life -= dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  return !(s.life <= 0 || s.x < -20 || s.y < -20 || s.x > ARENA_W + 20 || s.y > ARENA_H + 20);
}

/** Runs as the hero who fired it, so hits are credited to them. */
function updatePlayerShot(s: PlayerShot, dt: number): void {
  if (s.home) steerTowardsNearest(s, s.home, dt);
  if (!moveShot(s, dt)) { endShot(s); return; }
  collidePlayerShot(s);
}

function updateEnemyShot(s: EnemyShot, dt: number): void {
  if (!moveShot(s, dt)) { s.dead = true; return; }
  for (const h of run.heroes) {
    if (h.down || h.gone) continue;
    const p = h.player;
    if ((p.x - s.x) ** 2 + (p.y - s.y) ** 2 <= (p.r + s.r) ** 2) {
      const before = p.hp;
      hurtHero(h, s.dmg);
      if (s.kind === 'archer' && p.hp < before) h.tally.arrowHits++;
      s.dead = true;
      return;
    }
  }
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
    if (e.dead || s.hitSet.has(e) || (!e.boss && e.phased)) continue; // shots fly through an ethereal wraith
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
