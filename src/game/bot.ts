// ============================================================ test bot (DEBUG.bot)
// Plays the game for soak testing: aims at the nearest enemy, kites, and uses everything.
import { ARENA_H, ARENA_W, TAU } from '../core/constants';
import { mouse } from '../core/input';
import { dist, randRange } from '../core/math';
import { run } from '../core/state';
import { nearestEnemy } from '../world/enemies';

export const bot = { moveX: 0, moveY: 0, fire: false, heavy: false, dash: false, ult: false, rethinkTimer: 0 };

const BOT_EDGE_MARGIN = 250;

export function botThink(dt: number): void {
  const p = run.player;
  bot.rethinkTimer -= dt;
  const nearest = nearestEnemy(p.x, p.y, 700);
  if (nearest) {
    mouse.x = nearest.x - run.camera.x;
    mouse.y = nearest.y - run.camera.y;
  }
  if (bot.rethinkTimer <= 0) {
    bot.rethinkTimer = randRange(0.4, 1.0);
    // back away from close enemies, otherwise wander
    const a = nearest && dist(nearest, p) < 160 ? Math.atan2(p.y - nearest.y, p.x - nearest.x) + randRange(-0.8, 0.8) : randRange(0, TAU);
    botSteer(a);
    // stay away from the arena edges
    if (p.x < BOT_EDGE_MARGIN) bot.moveX = 1;
    if (p.x > ARENA_W - BOT_EDGE_MARGIN) bot.moveX = -1;
    if (p.y < BOT_EDGE_MARGIN) bot.moveY = 1;
    if (p.y > ARENA_H - BOT_EDGE_MARGIN) bot.moveY = -1;
    const rally = run.cls.botRallyPoint ? run.cls.botRallyPoint() : null;
    if (rally && Math.hypot(rally.x - p.x, rally.y - p.y) > 90) botSteer(Math.atan2(rally.y - p.y, rally.x - p.x));
    if (run.safeZone) botSteer(Math.atan2(run.safeZone.y - p.y, run.safeZone.x - p.x));
  }
  bot.fire = true;
  bot.heavy = true;
  bot.dash = Math.random() < dt * 0.6;
  bot.ult = p.ult >= 100;
}

function botSteer(angle: number): void {
  bot.moveX = Math.cos(angle);
  bot.moveY = Math.sin(angle);
}
