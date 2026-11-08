// ============================================================ map hazards: mushrooms (Fungal Grotto), lava (Ember Wastes), regen
import type { Hazard } from '../types';
import { ARENA_H, ARENA_W, COLOR, TAU } from '../core/constants';
import { randRange } from '../core/math';
import { livingHeroes, run } from '../core/state';
import { hurtHeroOverTime } from './combat';
import { addTelegraph, spawnBurst } from './effects';
import { mapDef } from './maps';
import { addZone } from './zones';

const MUSHROOM_R = 70, MUSHROOM_TRIGGER = 60, MUSHROOM_FUSE = 0.8, MUSHROOM_REGROW = 10;
const LAVA_R = 22, LAVA_DPS = 14;
/** Keep hazards away from where the heroes start. */
const SAFE_START = 180;

function placeAwayFromStart(): { x: number; y: number } {
  for (let i = 0; i < 20; i++) {
    const x = randRange(80, ARENA_W - 80), y = randRange(80, ARENA_H - 80);
    if (Math.hypot(x - ARENA_W / 2, y - ARENA_H / 2) > SAFE_START) return { x, y };
  }
  return { x: 80, y: 80 };
}

/** Put this run's map hazards down (called once when the run starts). */
export function setUpMap(): void {
  const def = mapDef(run.mapId), hazards: Hazard[] = [];
  for (let i = 0; i < (def.mushrooms ?? 0); i++) hazards.push({ kind: 'mushroom', ...placeAwayFromStart(), r: MUSHROOM_R, timer: 0, state: 'ready' });
  for (let i = 0; i < (def.lavaCracks ?? 0); i++) {
    // a crack: a short wobbly chain of burning spots
    let { x, y } = placeAwayFromStart(), a = randRange(0, TAU);
    for (let j = 0; j < 5; j++) {
      hazards.push({ kind: 'lava', x, y, r: LAVA_R, timer: 0, state: 'ready' });
      a += randRange(-0.5, 0.5);
      x += Math.cos(a) * 34;
      y += Math.sin(a) * 34;
    }
  }
  run.hazards = hazards;
}

/** Map rules each step: hazards, and enemy regeneration on Bloodmoon. */
export function updateMap(dt: number): void {
  const def = mapDef(run.mapId);
  for (const hz of run.hazards) {
    if (hz.kind === 'lava') updateLava(hz, dt);
    else updateMushroom(hz, dt);
  }
  if (def.enemyRegen) {
    for (const e of run.enemies) if (!e.dead && !e.boss) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * def.enemyRegen * dt);
  }
}

function updateLava(hz: Hazard, dt: number): void {
  for (const h of livingHeroes()) {
    if (Math.hypot(h.player.x - hz.x, h.player.y - hz.y) < hz.r + h.player.r * 0.5) hurtHeroOverTime(h, LAVA_DPS * dt);
  }
}

/** Ready → (a hero comes close) → fuse, with a warning circle → burst into a poison pool → regrow. */
function updateMushroom(hz: Hazard, dt: number): void {
  if (hz.state === 'ready') {
    if (!livingHeroes().some((h) => Math.hypot(h.player.x - hz.x, h.player.y - hz.y) < MUSHROOM_TRIGGER)) return;
    hz.state = 'fuse';
    hz.timer = MUSHROOM_FUSE;
    addTelegraph({ kind: 'circle', x: hz.x, y: hz.y, r: hz.r, dur: MUSHROOM_FUSE, color: '#7ad06a' });
    return;
  }
  hz.timer -= dt;
  if (hz.timer > 0) return;
  if (hz.state === 'fuse') {
    hz.state = 'spent';
    hz.timer = MUSHROOM_REGROW;
    addZone({ owner: 'enemy', kind: 'pool', x: hz.x, y: hz.y, r: hz.r, life: 4, dps: 10, tick: 0.25, color: 'rgba(120,210,90,0.3)' });
    spawnBurst(hz.x, hz.y, COLOR.green, 14, 120);
  } else {
    hz.state = 'ready';
  }
}
