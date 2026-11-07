// ============================================================ test bot
// Plays a hero for soak testing: aims at the nearest enemy, kites, and uses everything.
// Writes the hero's input, the same way the keyboard or the network does.
import type { Hero } from '../types';
import { ARENA_H, ARENA_W, TAU } from '../core/constants';
import { dist, randRange } from '../core/math';
import { run, withHero } from '../core/state';
import { nearestEnemy } from '../world/enemies';

interface BotMemory {
  moveX: number;
  moveY: number;
  rethinkTimer: number;
}

const memories = new WeakMap<Hero, BotMemory>();
const BOT_EDGE_MARGIN = 250;

export function botThink(hero: Hero, dt: number): void {
  let mem = memories.get(hero);
  if (!mem) memories.set(hero, (mem = { moveX: 0, moveY: 0, rethinkTimer: 0 }));
  const p = hero.player, input = hero.input;
  mem.rethinkTimer -= dt;
  const nearest = nearestEnemy(p.x, p.y, 700);
  if (nearest) { input.aimX = nearest.x; input.aimY = nearest.y; }
  if (mem.rethinkTimer <= 0) {
    mem.rethinkTimer = randRange(0.4, 1.0);
    // back away from close enemies, otherwise wander
    const a = nearest && dist(nearest, p) < 160 ? Math.atan2(p.y - nearest.y, p.x - nearest.x) + randRange(-0.8, 0.8) : randRange(0, TAU);
    steer(mem, a);
    // stay away from the arena edges
    if (p.x < BOT_EDGE_MARGIN) mem.moveX = 1;
    if (p.x > ARENA_W - BOT_EDGE_MARGIN) mem.moveX = -1;
    if (p.y < BOT_EDGE_MARGIN) mem.moveY = 1;
    if (p.y > ARENA_H - BOT_EDGE_MARGIN) mem.moveY = -1;
    const rally = hero.cls.botRallyPoint ? withHero(hero, () => hero.cls.botRallyPoint!()) : null;
    if (rally && Math.hypot(rally.x - p.x, rally.y - p.y) > 90) steer(mem, Math.atan2(rally.y - p.y, rally.x - p.x));
    // go and revive a downed teammate
    const downed = run.heroes.find((h) => h.down && !h.gone && h !== hero);
    if (downed) steer(mem, Math.atan2(downed.player.y - p.y, downed.player.x - p.x));
    if (run.safeZone) steer(mem, Math.atan2(run.safeZone.y - p.y, run.safeZone.x - p.x));
  }
  input.moveX = mem.moveX;
  input.moveY = mem.moveY;
  input.fire = true;
  input.heavy = true;
  input.dash = Math.random() < dt * 0.6;
  input.ult = p.ult >= 100;
}

function steer(mem: BotMemory, angle: number): void {
  mem.moveX = Math.cos(angle);
  mem.moveY = Math.sin(angle);
}
