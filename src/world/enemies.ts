// ============================================================ enemies
import type { Enemy, EnemyTypeId, Hero, Mob, Point, StatusTimers, TelegraphSpec } from '../types';
import { ARENA_H, ARENA_W, COLOR, TAU } from '../core/constants';
import { angleDiff, clamp, randRange } from '../core/math';
import { asHero, nearestHero, partyScale, run } from '../core/state';
import { updateBoss } from './bosses';
import { hitEnemy, hurtHero } from './combat';
import { addFloatingText, addTelegraph, schedule, spawnBurst } from './effects';
import { addZone } from './zones';
import { fireEnemyShot } from './projectiles';

export interface EnemyTypeDef {
  name: string;
  /** Its job in a fight, and how to beat it. Each type has one clear answer (for docs now, a codex later). */
  role: string;
  weakness: string;
  hp: number;
  speed: number;
  r: number;
  damage: number;
  xp: number;
  color: string;
  /** Takes extra damage from holy sources (Cleric). */
  undead?: boolean;
  /** Ranged: keeps distance, stops to aim along a warning line for `windup` s, then fires along it. */
  shot?: { interval: number; windup: number; speed: number; r: number; color: string };
  /** Healer: keeps distance, channels for `channel` s, then heals allies in `radius` by `percent` of max HP. Damage interrupts it. */
  healer?: { interval: number; channel: number; radius: number; percent: number };
  /** Charger: aims a lane for `windup` s, charges `dist` px at `speed`, then is dazed for `daze` s (takes extra damage). */
  charge?: { interval: number; windup: number; speed: number; dist: number; daze: number };
  /** Mortar: lobs a glob at the hero's spot (circle shown for `flight` s), leaving a poison pool for `life` s. */
  mortar?: { interval: number; range: number; flight: number; r: number; dps: number; life: number };
  /** Phaser: solid for `solid` s, then ethereal (immune, harmless, faster) for `ethereal` s. */
  phase?: { solid: number; ethereal: number };
  /** Summoner: channels like a healer (any hit interrupts), then raises `count` of `type` around itself. */
  summon?: { interval: number; channel: number; type: EnemyTypeId; count: number };
  /** At most this many alive at once (per living player), so a type that must be focused never floods the screen. */
  maxAlive?: number;
  /** Frontal shield blocks projectiles until a heavy hit breaks it. */
  shield?: boolean;
  /** Max turn speed in radians/s (default: always faces the player instantly). */
  turnRate?: number;
  /** Lights a fuse near a hero (blast circle shown), then explodes. Killed first, it blows up its neighbours instead. */
  bomber?: boolean;
  /** Spawns two of this type on death (from wave 4). */
  splitInto?: EnemyTypeId;
}

/**
 * Enemy archetypes. Stats are wave-1 values; `spawnEnemy` scales them by wave.
 * Fewer, tougher enemies, each with one job and one weakness, so the player picks targets instead of
 * mowing a horde: kill the healer first, step off the archer's line, pop imps from range, flank the orc.
 */
export const ENEMY_TYPES: Record<EnemyTypeId, EnemyTypeDef> = {
  slime: {
    name: 'Slime', role: 'Fodder that splits in two (from wave 4)', weakness: 'Area attacks clear the splits',
    hp: 26, speed: 48, r: 11, damage: 8, xp: 2, color: '#6fbf5a', splitInto: 'mini',
  },
  mini: { name: 'Slime', role: 'Split from a slime', weakness: 'Fragile', hp: 9, speed: 60, r: 7, damage: 4, xp: 1, color: '#9ad884' },
  goblin: { name: 'Goblin', role: 'Fast rusher', weakness: 'Fragile: one or two hits', hp: 18, speed: 96, r: 9, damage: 7, xp: 2, color: '#c9a24a' },
  bat: {
    name: 'Bat', role: 'Erratic flanker, sometimes in a flock', weakness: 'Very fragile; holy damage', hp: 10, speed: 112, r: 7, damage: 5, xp: 1,
    color: '#9b7bc6', undead: true,
  },
  archer: {
    name: 'Skeleton Archer', role: 'Ranged: stops and shows a thin red aim line, then fires a fast arrow down it', weakness: 'Step off the line; fragile up close',
    hp: 20, speed: 52, r: 10, damage: 10, xp: 4, color: '#b8735e', undead: true, maxAlive: 5,
    shot: { interval: 2.6, windup: 0.7, speed: 520, r: 5, color: '#ff8a5c' },
  },
  cultist: {
    name: 'Cultist', role: 'Healer: channels a green circle that heals every enemy inside it', weakness: 'Kill it first; any hit interrupts the heal',
    hp: 26, speed: 46, r: 11, damage: 6, xp: 6, color: '#9a4aa8', undead: true, maxAlive: 2,
    healer: { interval: 4, channel: 1.2, radius: 150, percent: 0.35 },
  },
  // Turns slowly (~70 deg/s) so the player can dash around the shield and hit its back.
  orc: {
    name: 'Shield Orc', role: 'Tank: its shield blocks shots from the front', weakness: 'Flank it, or break the shield with a heavy strike',
    hp: 80, speed: 40, r: 15, damage: 12, xp: 6, color: '#6f8f5a', shield: true, turnRate: 1.2, maxAlive: 4,
  },
  imp: {
    name: 'Imp Bomber', role: 'Kamikaze: lights a fuse next to you and explodes', weakness: 'Kill it from range: it blows up the enemies around it',
    hp: 12, speed: 125, r: 8, damage: 16, xp: 2, color: '#ff7a4a', bomber: true, maxAlive: 4,
  },
  // (new types go at the end: online snapshots send enemy types by their index in this table)
  boar: {
    name: 'Tusk Boar', role: 'Charger: shows a lane, then charges down it', weakness: 'Sidestep the lane, then punish it while it is dazed (+50% damage)',
    hp: 60, speed: 70, r: 13, damage: 14, xp: 5, color: '#8a5a3c', maxAlive: 4,
    charge: { interval: 3.5, windup: 0.8, speed: 620, dist: 360, daze: 1.4 },
  },
  toad: {
    name: 'Bog Toad', role: 'Artillery: lobs poison at where you stand', weakness: 'Keep moving; slow and fragile once you reach it',
    hp: 22, speed: 38, r: 12, damage: 6, xp: 4, color: '#4fa08a', maxAlive: 3,
    mortar: { interval: 3.5, range: 460, flight: 1.0, r: 46, dps: 10, life: 4 },
  },
  wraith: {
    name: 'Wraith', role: 'Phases out: ethereal (immune) for 1.5 s, then solid for 2.5 s', weakness: 'Hit it only while solid; holy damage',
    hp: 30, speed: 72, r: 10, damage: 9, xp: 4, color: '#a8c8e8', undead: true, maxAlive: 4,
    phase: { solid: 2.5, ethereal: 1.5 },
  },
  caller: {
    name: 'Grave Caller', role: 'Summoner: channels a purple circle, then raises three bats', weakness: 'Kill it first; any hit interrupts the summon',
    hp: 30, speed: 40, r: 11, damage: 6, xp: 7, color: '#6a4a8a', undead: true, maxAlive: 1,
    summon: { interval: 6, channel: 1.2, type: 'bat', count: 3 },
  },
};

const ELITE = { size: 1.35, hp: 3.5, speed: 0.92, damage: 1.4, xp: 5 };

/** Status timers shared by enemies and bosses. */
export function createStatusTimers(): StatusTimers {
  return { slowTime: 0, rootTime: 0, charmTime: 0, fearTime: 0, confuseTime: 0, bleedDps: 0, bleedTime: 0 };
}

export function spawnEnemy(type: EnemyTypeId, x: number, y: number, elite: boolean): Mob {
  const def = ENEMY_TYPES[type], wave = Math.max(1, run.wave);
  const hpMul = (1 + 0.24 * (wave - 1)) * partyScale(0.5), damageMul = 1 + 0.1 * (wave - 1);
  const hp = def.hp * hpMul * (elite ? ELITE.hp : 1);
  const target = nearestHero(x, y)?.player ?? run.player;
  const e: Mob = {
    id: run.nextId++,
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
    face: Math.atan2(target.y - y, target.x - x), // spawn facing the nearest player
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
      asHero(e.bleedOwner, () => hitEnemy(e, e.bleedDps * dt, { dot: true, silent: true }));
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
  const def = ENEMY_TYPES[e.type];
  tickStatusTimers(e, dt);
  // Chase the nearest living hero. With everyone down the run is over, so idle.
  const targetHero = nearestHero(e.x, e.y);
  if (!targetHero) return;
  const p = targetHero.player;

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
  if (!inControl) cancelWindup(e); // charmed, feared or confused mid-attack: the attack is lost
  if ((def.shot || def.healer || def.mortar || def.summon) && inControl) {
    // keep distance: back off when close, hover at range
    if (distToPlayer < 200) angle += Math.PI;
    else if (distToPlayer < 270) speed *= 0.15;
  }
  // telegraphed actions: the enemy stands still while its warning shows
  if (def.shot && inControl && updateArcher(e, def.shot, p, distToPlayer, dt)) speed = 0;
  if (def.healer && inControl && updateHealer(e, def.healer, dt)) speed = 0;
  if (def.bomber && inControl && updateBomber(e, distToPlayer, dt)) return; // fuse lit: planted until it blows
  if (def.summon && inControl && updateSummoner(e, def.summon, dt)) speed = 0;
  if (def.mortar && inControl) updateMortar(e, def.mortar, p, distToPlayer, dt);
  if (def.charge && updateCharger(e, def.charge, targetHero, distToPlayer, inControl, dt)) speed = 0;
  if (def.phase) updatePhaser(e, def.phase, dt);
  if (e.phased) speed *= 1.6; // ethereal: drifts quickly through the crowd
  if (e.type === 'bat') angle += Math.sin(run.time * 6 + e.wobble) * 0.7;

  // Movement, knockback decay, separation, arena bounds.
  turnToward(e, Math.atan2(p.y - e.y, p.x - e.x), def.turnRate, dt);
  e.x += (Math.cos(angle) * speed + e.knockX) * dt;
  e.y += (Math.sin(angle) * speed + e.knockY) * dt;
  e.knockX *= Math.pow(0.02, dt);
  e.knockY *= Math.pow(0.02, dt);
  if (!e.phased) separateFromNeighbours(e);
  e.x = clamp(e.x, 10, ARENA_W - 10);
  e.y = clamp(e.y, 10, ARENA_H - 10);

  // Interactions (distance is from before this frame's move, as designed).
  if (e.charmTime > 0) {
    const touching = charmTarget && Math.hypot(charmTarget.x - e.x, charmTarget.y - e.y) < e.r + charmTarget.r + 4;
    if (touching && e.contactCooldown <= 0) {
      e.contactCooldown = 0.5;
      // credit the charm hit to the nearest hero (charms come from the players)
      asHero(targetHero.idx, () => hitEnemy(charmTarget, e.damage * 1.5, { tag: 'charm' }));
    }
    return;
  }
  if (distToPlayer < e.r + p.r && e.contactCooldown <= 0 && !e.phased) {
    e.contactCooldown = 0.7;
    hurtHero(targetHero, e.damage);
  }
}

/** Rotate `face` toward `target`, at most `turnRate` rad/s (instantly if undefined). */
export function turnToward(e: { face: number }, target: number, turnRate: number | undefined, dt: number): void {
  if (turnRate === undefined) { e.face = target; return; }
  const maxStep = turnRate * dt;
  e.face += clamp(angleDiff(e.face, target), -maxStep, maxStep);
}

// ------------------------------------------------------------ telegraphed attacks

/** Range of the archer's warning line (and of its decision to shoot). */
const ARCHER_RANGE = 420;
/** An imp lights its fuse this close to a hero, then explodes `IMP_FUSE` s later within `IMP_BLAST` px. */
const IMP_TRIGGER = 60;
const IMP_FUSE = 0.6;
export const IMP_BLAST = 56;
const HOSTILE_RED = '#ff5a3c';

/** Start a telegraphed action: `seconds` of warning shown by `spec` (online clients draw it too). */
function startWindup(e: Mob, seconds: number, spec: TelegraphSpec): void {
  e.windup = seconds;
  e.windHp = e.hp;
  e.windTelegraph = addTelegraph(spec);
}

/** Drop a telegraphed action and its warning (interrupted, crowd-controlled, or dead). */
export function cancelWindup(e: Mob): void {
  if (e.windTelegraph) run.telegraphs = run.telegraphs.filter((t) => t !== e.windTelegraph);
  e.windup = 0;
  e.windTelegraph = undefined;
  e.chargeTime = 0;
}

/** Archer: aim along a locked line, then fire down it. Returns true while aiming. */
function updateArcher(e: Mob, shot: NonNullable<EnemyTypeDef['shot']>, target: Point, dist: number, dt: number): boolean {
  if (e.windup) {
    e.windup = Math.max(0, e.windup - dt);
    e.face = e.windAngle ?? e.face;
    if (e.windup > 0) return true;
    e.windTelegraph = undefined;
    e.attackTimer = shot.interval;
    fireEnemyShot(e, e.windAngle ?? 0, shot.speed, shot.r, e.damage, shot.color, e.type, 3.5);
    return false;
  }
  e.attackTimer -= dt;
  if (e.attackTimer > 0 || dist > ARCHER_RANGE) return false;
  e.windAngle = Math.atan2(target.y - e.y, target.x - e.x);
  startWindup(e, shot.windup, { kind: 'aim', x: e.x, y: e.y, a: e.windAngle, len: ARCHER_RANGE, dur: shot.windup, color: HOSTILE_RED });
  return true;
}

/** Channel radius drawn around a summoner. */
const SUMMON_RADIUS = 60;
/** Boars take this much extra damage while dazed after a charge. */
export const DAZED_DAMAGE_MUL = 1.5;

/**
 * A caster's channel: after `interval`, if `ready()`, stand still inside `spec` for `time` s, then `done()`.
 * Any damage during the channel interrupts it. Returns true while channelling (the caster stands still).
 */
function updateChannel(e: Mob, interval: number, time: number, spec: TelegraphSpec, ready: () => boolean, done: () => void, dt: number): boolean {
  if (e.windup) {
    if (e.hp < (e.windHp ?? e.hp)) {
      cancelWindup(e);
      e.attackTimer = interval;
      addFloatingText(e.x, e.y - e.r - 8, 'interrupted', COLOR.gold, 11);
      return false;
    }
    e.windup = Math.max(0, e.windup - dt);
    if (e.windup > 0) return true;
    e.windTelegraph = undefined;
    e.attackTimer = interval;
    done();
    return false;
  }
  e.attackTimer -= dt;
  if (e.attackTimer > 0) return false;
  if (!ready()) { e.attackTimer = 0.5; return false; } // nothing to do yet: look again soon
  startWindup(e, time, spec);
  return true;
}

/** Healer: channel inside a green circle, then heal every enemy in it. Any damage interrupts. Returns true while channelling. */
function updateHealer(e: Mob, heal: NonNullable<EnemyTypeDef['healer']>, dt: number): boolean {
  const inCircle = (): Enemy[] => enemiesInRadius(e.x, e.y, heal.radius).filter((o) => o !== e && !o.boss && o.hp < o.maxHp);
  return updateChannel(e, heal.interval, heal.channel,
    { kind: 'circle', x: e.x, y: e.y, r: heal.radius, dur: heal.channel, color: COLOR.green },
    () => inCircle().length > 0,
    () => {
      for (const o of inCircle()) {
        o.hp = Math.min(o.maxHp, o.hp + o.maxHp * heal.percent);
        spawnBurst(o.x, o.y, COLOR.green, 5, 60);
      }
      spawnBurst(e.x, e.y, COLOR.green, 12, 120);
    }, dt);
}

/** Summoner: channel inside a purple circle, then raise minions around itself. Any damage interrupts. */
function updateSummoner(e: Mob, sum: NonNullable<EnemyTypeDef['summon']>, dt: number): boolean {
  return updateChannel(e, sum.interval, sum.channel,
    { kind: 'circle', x: e.x, y: e.y, r: SUMMON_RADIUS, dur: sum.channel, color: '#b07ae0' },
    () => true,
    () => {
      for (let i = 0; i < sum.count; i++) {
        const a = (i / sum.count) * TAU;
        spawnEnemy(sum.type, e.x + Math.cos(a) * 30, e.y + Math.sin(a) * 30, false);
      }
      spawnBurst(e.x, e.y, '#b07ae0', 14, 120);
    }, dt);
}

/** Toad: lob a glob at where the hero stands now (circle shown while it flies), leaving a poison pool. It keeps moving. */
function updateMortar(e: Mob, m: NonNullable<EnemyTypeDef['mortar']>, target: Point, dist: number, dt: number): void {
  e.attackTimer -= dt;
  if (e.attackTimer > 0 || dist > m.range) return;
  e.attackTimer = m.interval;
  const x = target.x, y = target.y;
  // the glob is already in the air: it lands even if the toad dies
  addTelegraph({ kind: 'circle', x, y, r: m.r, dur: m.flight, color: HOSTILE_RED });
  schedule(m.flight, () => {
    addZone({ owner: 'enemy', kind: 'pool', x, y, r: m.r, life: m.life, dps: m.dps, tick: 0.25, color: 'rgba(90,200,120,0.3)' });
    spawnBurst(x, y, '#5ac878', 10, 90);
  });
}

/**
 * Boar: aim a lane (shown as a wide line: its body charges down it), charge, then stand dazed.
 * Returns true while it is busy (aiming, charging or dazed), when normal walking is off.
 */
function updateCharger(e: Mob, c: NonNullable<EnemyTypeDef['charge']>, target: Hero, dist: number, inControl: boolean, dt: number): boolean {
  if ((e.dazedTime ?? 0) > 0) { e.dazedTime = (e.dazedTime ?? 0) - dt; return true; }
  if ((e.chargeTime ?? 0) > 0) {
    const a = e.windAngle ?? e.face;
    e.chargeTime = (e.chargeTime ?? 0) - dt;
    e.x += Math.cos(a) * c.speed * dt;
    e.y += Math.sin(a) * c.speed * dt;
    for (const h of run.heroes) {
      const p = h.player;
      if (!h.down && !h.gone && e.contactCooldown <= 0 && Math.hypot(p.x - e.x, p.y - e.y) < e.r + p.r) {
        e.contactCooldown = 0.7;
        hurtHero(h, e.damage * 1.5);
      }
    }
    if (e.chargeTime <= 0 || e.x <= 12 || e.y <= 12 || e.x >= ARENA_W - 12 || e.y >= ARENA_H - 12) {
      e.chargeTime = 0;
      e.dazedTime = c.daze;
      addFloatingText(e.x, e.y - e.r - 8, 'dazed', COLOR.gold, 11);
    }
    return true;
  }
  if (!inControl) return false;
  if (e.windup) {
    e.windup = Math.max(0, e.windup - dt);
    e.face = e.windAngle ?? e.face;
    if (e.windup > 0) return true;
    e.windTelegraph = undefined;
    e.chargeTime = c.dist / c.speed;
    e.attackTimer = c.interval;
    return true;
  }
  e.attackTimer -= dt;
  if (e.attackTimer > 0 || dist < 90 || dist > c.dist) return false;
  const p = target.player;
  e.windAngle = Math.atan2(p.y - e.y, p.x - e.x);
  startWindup(e, c.windup, { kind: 'line', x: e.x, y: e.y, a: e.windAngle, len: c.dist + e.r, w: e.r * 2 + 8, dur: c.windup, color: HOSTILE_RED });
  return true;
}

/** Wraith: switch between solid and ethereal on a timer. A quick flicker of particles marks each switch. */
function updatePhaser(e: Mob, ph: NonNullable<EnemyTypeDef['phase']>, dt: number): void {
  e.phaseTimer = (e.phaseTimer ?? ph.solid) - dt;
  if (e.phaseTimer > 0) return;
  e.phased = !e.phased;
  e.phaseTimer = e.phased ? ph.ethereal : ph.solid;
  spawnBurst(e.x, e.y, e.color, 6, 60);
}

/** Imp: light the fuse near a hero (blast circle shown), stand still, explode. Returns true once the fuse is lit. */
function updateBomber(e: Mob, dist: number, dt: number): boolean {
  if (e.windup) {
    e.windup = Math.max(0, e.windup - dt);
    if (e.windup <= 0) explodeBomber(e);
    return true;
  }
  if (dist > IMP_TRIGGER) return false;
  startWindup(e, IMP_FUSE, { kind: 'circle', x: e.x, y: e.y, r: IMP_BLAST, dur: IMP_FUSE, color: HOSTILE_RED });
  return true;
}

/** The fuse ran out: hurt every hero in the blast. */
function explodeBomber(e: Mob): void {
  e.windTelegraph = undefined;
  e.dead = true;
  e.hp = 0;
  spawnBurst(e.x, e.y, '#ff7a4a', 16, 140);
  for (const h of run.heroes) {
    if (!h.down && !h.gone && Math.hypot(h.player.x - e.x, h.player.y - e.y) < IMP_BLAST) hurtHero(h, e.damage);
  }
}
