// ============================================================ zones (ground effects)
import type { AreaZone, MineZone, RingZone, TrapZone, Zone, ZoneRuntime, ZoneSpec } from '../types';
import { COLOR } from '../core/constants';
import { clamp } from '../core/math';
import { run } from '../core/state';
import { damageInCircle, hitEnemy, hurtPlayer, hurtPlayerOverTime } from './combat';
import { spawnBurst } from './effects';
import { enemiesInRadius } from './enemies';

/** Add a ground zone (see the zone types in types.ts for what each kind does). */
export function addZone(spec: ZoneSpec): Zone {
  const zone = spec as Zone;
  zone.t = 0;
  zone.tick = zone.tick || 0.25;
  zone.tickTimer = 0;
  zone.owner = zone.owner || 'player';
  zone.max = zone.life;
  run.zones.push(zone);
  return zone;
}

export function updateZones(dt: number): void {
  for (const z of run.zones) {
    z.life -= dt;
    z.t += dt;
    if (z.follow) { z.x = z.follow.x; z.y = z.follow.y; }
    switch (z.kind) {
      case 'ring': updateRing(z); break;
      case 'trap': updateTrap(z); break;
      case 'mine': updateMine(z); break;
      default:
        z.tickTimer += dt;
        if (z.tickTimer >= z.tick) {
          z.tickTimer -= z.tick;
          tickAreaZone(z);
        }
    }
  }
  run.zones = run.zones.filter((z) => z.life > 0);
}

function updateRing(z: RingZone & ZoneRuntime): void {
  const p = run.player;
  z.currentR = z.startR + (z.endR - z.startR) * clamp(z.t / z.dur, 0, 1);
  if (!z.hitPlayer && Math.abs(Math.hypot(p.x - z.x, p.y - z.y) - z.currentR) < 16) {
    z.hitPlayer = true;
    hurtPlayer(z.dmg);
  }
  if (z.t >= z.dur) z.life = 0;
}

function updateTrap(z: TrapZone & ZoneRuntime): void {
  for (const e of run.enemies) {
    if (e.dead || e.boss) continue;
    if ((e.x - z.x) ** 2 + (e.y - z.y) ** 2 < (z.r + e.r) ** 2) {
      e.rootTime = Math.max(e.rootTime, z.root);
      hitEnemy(e, z.dmg, { color: COLOR.gold });
      z.life = 0;
      spawnBurst(z.x, z.y, COLOR.gold, 8, 80);
      break;
    }
  }
}

function updateMine(z: MineZone & ZoneRuntime): void {
  if (z.t < z.delay) return;
  damageInCircle(z.x, z.y, z.r, z.dmg, { color: COLOR.gold });
  spawnBurst(z.x, z.y, COLOR.gold, 12, 140);
  z.life = 0;
}

function tickAreaZone(z: AreaZone & ZoneRuntime): void {
  if (z.owner === 'player') {
    for (const e of enemiesInRadius(z.x, z.y, z.r)) {
      if (z.dps) hitEnemy(e, z.dps * z.tick, { dot: true, silent: true, noSteal: z.noSteal });
      if (z.slow) e.slowTime = Math.max(e.slowTime, z.tick + 0.1);
      if (z.confuse && !e.boss) e.confuseTime = Math.max(e.confuseTime, z.tick + 0.1);
      if (z.root && !e.boss && !z.rooted) e.rootTime = Math.max(e.rootTime, z.root);
      if (z.onTick) z.onTick(e);
    }
    if (z.root) z.rooted = true;
  } else {
    const p = run.player;
    if (Math.hypot(p.x - z.x, p.y - z.y) < z.r + p.r * 0.5 && z.dps) hurtPlayerOverTime(z.dps * z.tick);
  }
}
