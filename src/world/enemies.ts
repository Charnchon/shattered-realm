// ============================================================ enemies
import type { Enemy, EnemyTypeId, Mob, StatusTimers } from '../types';
import { ARENA_H, ARENA_W, TAU } from '../core/constants';
import { angleDiff, clamp, randRange } from '../core/math';
import { run } from '../core/state';
import { updateBoss } from './bosses';
import { hitEnemy, hurtPlayer } from './combat';
import { spawnBurst } from './effects';
import { fireEnemyShot } from './projectiles';

export interface EnemyTypeDef {
  name: string;
  hp: number;
  speed: number;
  r: number;
  damage: number;
  xp: number;
  color: string;
  /** Takes extra damage from holy sources (Cleric). */
  undead?: boolean;
  /** Ranged: keeps distance and fires. */
  shot?: { interval: number; speed: number; r: number; color: string };
  /** Frontal shield blocks projectiles until a heavy hit breaks it. */
  shield?: boolean;
  /** Max turn speed in radians/s (default: always faces the player instantly). */
  turnRate?: number;
  /** Explodes when close to the player. */
  bomber?: boolean;
  /** Spawns two of this type on death (from wave 4). */
  splitInto?: EnemyTypeId;
}

/** Enemy archetypes. Stats are wave-1 values; `spawnEnemy` scales them by wave. */
export const ENEMY_TYPES: Record<EnemyTypeId, EnemyTypeDef> = {
  slime: { name: 'Slime', hp: 14, speed: 48, r: 11, damage: 8, xp: 1, color: '#6fbf5a', splitInto: 'mini' },
  mini: { name: 'Slime', hp: 5, speed: 60, r: 7, damage: 4, xp: 1, color: '#9ad884' },
  goblin: { name: 'Goblin', hp: 10, speed: 96, r: 9, damage: 7, xp: 1, color: '#c9a24a' },
  bat: { name: 'Bat', hp: 6, speed: 112, r: 7, damage: 5, xp: 1, color: '#9b7bc6', undead: true },
  archer: {
    name: 'Skeleton Archer', hp: 12, speed: 52, r: 10, damage: 8, xp: 2, color: '#b8735e', undead: true,
    shot: { interval: 2.2, speed: 230, r: 4, color: '#ff8a5c' },
  },
  cultist: {
    name: 'Cultist', hp: 18, speed: 44, r: 11, damage: 9, xp: 2, color: '#9a4aa8', undead: true,
    shot: { interval: 3.0, speed: 150, r: 6, color: '#ff5ab0' },
  },
  // Turns slowly (~70°/s) so the player can dash around the shield and hit its back.
  orc: { name: 'Shield Orc', hp: 42, speed: 40, r: 15, damage: 12, xp: 3, color: '#6f8f5a', shield: true, turnRate: 1.2 },
  imp: { name: 'Imp Bomber', hp: 8, speed: 125, r: 8, damage: 16, xp: 1, color: '#ff7a4a', bomber: true },
};

const ELITE = { size: 1.35, hp: 3.5, speed: 0.92, damage: 1.4, xp: 5 };

/** Status timers shared by enemies and bosses. */
export function createStatusTimers(): StatusTimers {
  return { slowTime: 0, rootTime: 0, charmTime: 0, fearTime: 0, confuseTime: 0, bleedDps: 0, bleedTime: 0 };
}

export function spawnEnemy(type: EnemyTypeId, x: number, y: number, elite: boolean): Mob {
  const def = ENEMY_TYPES[type], wave = Math.max(1, run.wave);
  const hpMul = 1 + 0.24 * (wave - 1), damageMul = 1 + 0.1 * (wave - 1);
  const hp = def.hp * hpMul * (elite ? ELITE.hp : 1);
  const e: Mob = {
    type, x, y,
    r: def.r * (elite ? ELITE.size : 1),
    hp,
    maxHp: hp,
    speed: def.speed * (elite ? ELITE.speed : 1) * randRange(0.92, 1.08),
    damage: def.damage * damageMul * (elite ? ELITE.damage : 1),
    xp: def.xp * (elite ? ELITE.xp : 1),
    elite: !!elite, undead: !!def.undead, hasShield: !!def.shield, color: def.color,
    contactCooldown: 0, flash: 0, attackTimer: randRange(0.8, 2.2),
    ...createStatusTimers(),
    face: Math.atan2(run.player.y - y, run.player.x - x), // spawn facing the player
    wobble: randRange(0, TAU), shieldBroken: false, dead: false, boss: false, knockX: 0, knockY: 0,
  };
  run.enemies.push(e);
  return e;
}

// ------------------------------------------------------------ queries

/** Closest living enemy within `maxDist`, optionally matching `filter`. */
export function nearestEnemy(x: number, y: number, maxDist: number, filter?: (e: Enemy) => boolean): Enemy | null {
  let best: Enemy | null = null, bestSq = maxDist * maxDist;
  for (const e of run.enemies) {
    if (e.dead || (filter && !filter(e))) continue;
    const dSq = (e.x - x) ** 2 + (e.y - y) ** 2;
    if (dSq < bestSq) { bestSq = dSq; best = e; }
  }
  return best;
}

/** Living enemies whose body overlaps the circle. */
export function enemiesInRadius(x: number, y: number, r: number): Enemy[] {
  const out: Enemy[] = [];
  for (const e of run.enemies) {
    if (!e.dead && (e.x - x) ** 2 + (e.y - y) ** 2 <= (r + e.r) ** 2) out.push(e);
  }
  return out;
}

// ------------------------------------------------------------ spatial grid (for separation)

const GRID_CELL = 48;
let enemyGrid = new Map<string, Enemy[]>();

const gridKey = (cx: number, cy: number): string => cx + ',' + cy;

function buildEnemyGrid(): void {
  enemyGrid = new Map();
  for (const e of run.enemies) {
    if (e.dead) continue;
    const key = gridKey((e.x / GRID_CELL) | 0, (e.y / GRID_CELL) | 0);
    let cell = enemyGrid.get(key);
    if (!cell) enemyGrid.set(key, (cell = []));
    cell.push(e);
  }
}

/** Push an enemy out of the neighbours it overlaps. */
function separateFromNeighbours(e: Mob): void {
  const gx = (e.x / GRID_CELL) | 0, gy = (e.y / GRID_CELL) | 0;
  for (let ix = gx - 1; ix <= gx + 1; ix++) {
    for (let iy = gy - 1; iy <= gy + 1; iy++) {
      const cell = enemyGrid.get(gridKey(ix, iy));
      if (!cell) continue;
      for (const o of cell) {
        if (o === e || o.dead) continue;
        const dx = e.x - o.x, dy = e.y - o.y, rr = e.r + o.r, dSq = dx * dx + dy * dy;
        if (dSq > 0.01 && dSq < rr * rr) {
          const d = Math.sqrt(dSq), push = (rr - d) * 0.5;
          e.x += (dx / d) * push;
          e.y += (dy / d) * push;
        }
      }
    }
  }
}

// ------------------------------------------------------------ update

export function updateEnemies(dt: number): void {
  buildEnemyGrid();
  for (const e of run.enemies) {
    if (e.dead) continue;
    e.flash -= dt;
    e.contactCooldown -= dt;
    if (e.bleedTime > 0) {
      e.bleedTime -= dt;
      hitEnemy(e, e.bleedDps * dt, { dot: true, silent: true });
      if (e.dead) continue;
    }
    if (e.boss) updateBoss(e, dt);
    else updateEnemy(e, dt);
  }
}

function tickStatusTimers(e: Mob, dt: number): void {
  e.slowTime -= dt; e.rootTime -= dt; e.charmTime -= dt; e.fearTime -= dt; e.confuseTime -= dt;
}

function updateEnemy(e: Mob, dt: number): void {
  const p = run.player, def = ENEMY_TYPES[e.type];
  tickStatusTimers(e, dt);

  // Steering: chase the player, or a victim while charmed, then apply status effects.
  let tx = p.x, ty = p.y, charmTarget: Enemy | null = null;
  if (e.charmTime > 0) {
    charmTarget = nearestEnemy(e.x, e.y, 500, (o) => o !== e && o.charmTime <= 0 && !o.boss);
    if (charmTarget) { tx = charmTarget.x; ty = charmTarget.y; }
  }
  let angle = Math.atan2(ty - e.y, tx - e.x);
  let speed = e.speed * (e.slowTime > 0 ? 0.5 : 1);
  if (e.rootTime > 0) speed = 0;
  if (e.fearTime > 0) angle += Math.PI;
  if (e.confuseTime > 0) { e.wobble += dt * 2; angle = e.wobble; speed *= 0.5; }

  const distToPlayer = Math.hypot(p.x - e.x, p.y - e.y);
  const inControl = e.charmTime <= 0 && e.fearTime <= 0 && e.confuseTime <= 0;
  if (def.shot && inControl) {
    // ranged: back off when close, hover at range, shoot periodically
    if (distToPlayer < 200) angle += Math.PI;
    else if (distToPlayer < 270) speed *= 0.15;
    e.attackTimer -= dt;
    if (e.attackTimer <= 0 && distToPlayer < 420) {
      e.attackTimer = def.shot.interval;
      const aim = Math.atan2(p.y - e.y, p.x - e.x);
      fireEnemyShot(e, aim, def.shot.speed, def.shot.r, e.damage, def.shot.color, e.type, 3.5);
    }
  }
  if (e.type === 'bat') angle += Math.sin(run.time * 6 + e.wobble) * 0.7;

  // Movement, knockback decay, separation, arena bounds.
  turnToward(e, Math.atan2(p.y - e.y, p.x - e.x), def.turnRate, dt);
  e.x += (Math.cos(angle) * speed + e.knockX) * dt;
  e.y += (Math.sin(angle) * speed + e.knockY) * dt;
  e.knockX *= Math.pow(0.02, dt);
  e.knockY *= Math.pow(0.02, dt);
  separateFromNeighbours(e);
  e.x = clamp(e.x, 10, ARENA_W - 10);
  e.y = clamp(e.y, 10, ARENA_H - 10);

  // Interactions (distance is from before this frame's move, as designed).
  if (e.charmTime > 0) {
    const touching = charmTarget && Math.hypot(charmTarget.x - e.x, charmTarget.y - e.y) < e.r + charmTarget.r + 4;
    if (touching && e.contactCooldown <= 0) {
      e.contactCooldown = 0.5;
      hitEnemy(charmTarget, e.damage * 1.5, { tag: 'charm' });
    }
    return;
  }
  if (def.bomber && distToPlayer < 34) { explodeBomber(e); return; }
  if (distToPlayer < e.r + p.r && e.contactCooldown <= 0) {
    e.contactCooldown = 0.7;
    hurtPlayer(e.damage);
  }
}

/** Rotate `face` toward `target`, at most `turnRate` rad/s (instantly if undefined). */
export function turnToward(e: { face: number }, target: number, turnRate: number | undefined, dt: number): void {
  if (turnRate === undefined) { e.face = target; return; }
  const maxStep = turnRate * dt;
  e.face += clamp(angleDiff(e.face, target), -maxStep, maxStep);
}

function explodeBomber(e: Mob): void {
  e.dead = true;
  e.hp = 0;
  spawnBurst(e.x, e.y, '#ff7a4a', 16, 140);
  if (Math.hypot(run.player.x - e.x, run.player.y - e.y) < 48) hurtPlayer(e.damage);
}
