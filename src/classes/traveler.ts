// ============================================================ Traveler: the starter class (simple, weaker on purpose)
import type { CardDef, DashOverride, Enemy, Point, Stats } from '../types';
import { ARENA_H, ARENA_W, COLOR, TAU } from '../core/constants';
import { ctx } from '../core/canvas';
import { clamp, degToRad, distSq, randRange } from '../core/math';
import { cardExtraProjectiles, cardLevel, cardMul, hasCard, isEvolved, livingHeroes, recalcStats, run, withHero } from '../core/state';
import { damageInArc, damageInCircle, healPlayer, hitEnemy } from '../world/combat';
import { addFloatingText, schedule, spawnBurst, spawnLine, spawnRing, spawnSlash } from '../world/effects';
import { enemiesInRadius, nearestEnemy } from '../world/enemies';
import { fireShot } from '../world/projectiles';
import { addZone } from '../world/zones';
import { registerClass } from './registry';

const STAFF_COLOR = '#d9b27a';
const EARTH_COLOR = '#a07a50';
const STAFF_ARC = degToRad(110);
/** Quick Learner: the Traveler's base XP bonus. */
const BASE_XP_BONUS = 0.1;

interface Campfire extends Point {
  life: number;
  r: number;
}

/** Rally Banner (mutation): a planted healing circle. */
interface RallyBanner extends Point {
  r: number;
  life: number;
}

interface TravelerState {
  combo: number;
  attackTimer: number;
  /** Rally Cry speed boost (Loud Rally). */
  rallyTime: number;
  coinTimer: number;
  /** Lucky Coin heads: damage buff. */
  luckyTime: number;
  campTimer: number;
  campfires: Campfire[];
  stoneTimer: number;
  /** Enemies already bumped by the current roll (Rolling Bump). */
  rollHit: Set<Enemy>;
  /** Tumble (mutation): seconds of faster swings left after a roll. */
  tumbleTime: number;
  banner: RallyBanner | null;
  /** Standing inside your own Rally Banner (damage bonus). */
  inBanner: boolean;
  /** Last Stand (mutation): seconds left in which you can't drop below 1 HP. */
  standTime: number;
}
const state = (): TravelerState => run.classState as TravelerState;

const TRAVELER_CARDS: CardDef[] = [
  { id: 'wanderlust', name: 'Wanderlust', part: 'passive', desc: 'Gain 10% more XP, and move 5% faster.', ups: ['effect', 'speed'] },
  { id: 'sturdy_staff', name: 'Sturdy Staff', part: 'strike', desc: 'Staff hits deal 25% more damage and swing wider.', ups: ['damage', 'range'] },
  { id: 'quick_jab', name: 'Quick Jab', part: 'strike', desc: 'Swing 20% faster. Your 2nd hit also pokes a long line ahead.', ups: ['speed', 'damage'] },
  { id: 'knock_away', name: 'Knock Away', part: 'strike', desc: 'Staff hits push enemies back and slow them for 1 s.', ups: ['range', 'duration'] },
  { id: 'big_slam', name: 'Big Slam', part: 'heavy', desc: 'Staff Slam deals 40% more damage in a 30% bigger circle.', ups: ['damage', 'range'] },
  { id: 'pebble_shower', name: 'Pebble Shower', part: 'heavy', desc: 'Staff Slam also throws 3 pebbles forward.', ups: ['projectiles', 'damage'] },
  { id: 'ground_crack', name: 'Ground Crack', part: 'heavy', desc: 'Staff Slam leaves a crack that slows enemies for 2.5 s.', ups: ['range', 'duration'] },
  { id: 'dust_roll', name: 'Dust Roll', part: 'dash', desc: 'Rolling leaves a dust cloud that slows enemies inside it.', ups: ['range', 'duration'] },
  { id: 'rolling_bump', name: 'Rolling Bump', part: 'dash', desc: 'Rolling into enemies damages them and pushes them away.', ups: ['damage', 'range'] },
  { id: 'light_feet', name: 'Light Feet', part: 'dash', desc: 'Roll recharges 20% faster. At Lv5, gain a 2nd roll.', ups: ['speed'] },
  { id: 'loud_rally', name: 'Loud Rally', part: 'ultimate', desc: 'Rally Cry heals 45% instead of 30%, then you move 25% faster for 4 s.', ups: ['heal', 'speed'] },
  { id: 'rally_wave', name: 'Rally Wave', part: 'ultimate', desc: 'Rally Cry’s push also deals heavy damage.', ups: ['damage', 'range'] },
  { id: 'hopeful_cry', name: 'Hopeful Cry', part: 'ultimate', desc: 'After Rally Cry, your ultimate starts at 25% charge instead of 0%.', ups: ['effect'] },
  // mutations: each changes how an ability works; only one per ability in a run
  { id: 'whirling_staff', name: 'Whirling Staff', part: 'strike', mutation: true, desc: 'Your staff spins in a full circle, hitting everything around you for 20% less damage.', ups: ['damage', 'range', 'speed'] },
  { id: 'sling', name: 'Sling', part: 'strike', mutation: true, desc: 'Trade the staff swing for a sling: throw fast stones that pass through 1 enemy.', ups: ['damage', 'speed', 'projectiles'] },
  { id: 'pole_vault', name: 'Pole Vault', part: 'heavy', mutation: true, desc: 'Staff Slam vaults you forward, and you slam down where you land in a bigger circle.', ups: ['damage', 'range'] },
  { id: 'earthshaker', name: 'Earthshaker', part: 'heavy', mutation: true, desc: 'Staff Slam becomes a stomp: 3 shockwaves ripple out from you, each one wider.', ups: ['damage', 'range', 'projectiles'] },
  { id: 'backflip', name: 'Backflip', part: 'dash', mutation: true, desc: 'Roll becomes a backflip away from your aim. On landing, you jab forward for big damage.', ups: ['damage', 'range'] },
  { id: 'tumble', name: 'Tumble', part: 'dash', mutation: true, desc: 'Rolls are short but you get 2 more, and each roll makes your swings 35% faster for 1.5 s.', ups: ['speed', 'duration'] },
  { id: 'rally_banner', name: 'Rally Banner', part: 'ultimate', mutation: true, desc: 'Rally Cry plants a banner for 8 s. Inside, allies heal 3% HP/s and you deal 30% more damage.', ups: ['heal', 'duration', 'range'] },
  { id: 'last_stand', name: 'Last Stand', part: 'ultimate', mutation: true, desc: 'Rally Cry: for 6 s you can’t drop below 1 HP and swing 40% faster, then heal 20%.', ups: ['duration', 'heal'] },
  {
    id: 'lucky_coin', name: 'Lucky Coin', part: 'wild', desc: 'Every 8 s, flip a coin. Heads: +30% damage for 4 s. Tails: heal 8 HP.', ups: ['heal', 'duration', 'effect'],
    evo: { name: "Fortune's Favor", desc: 'Every 5 s, you get both heads and tails.', need: { card: 'wanderlust' }, needText: 'Wanderlust card' },
  },
  {
    id: 'campfire', name: 'Campfire', part: 'wild', desc: 'Every 10 s, light a campfire at your feet. It burns enemies and heals you while you stand in it.', ups: ['damage', 'heal', 'duration'],
    evo: { name: 'Hearthfire', desc: 'Campfires are bigger, last twice as long and heal double.', need: { part: 'ultimate' }, needText: 'any Ultimate card' },
  },
  {
    id: 'thrown_stones', name: 'Thrown Stones', part: 'wild', desc: 'Every 1.2 s, automatically throw a stone at the nearest enemy.', ups: ['damage', 'projectiles', 'speed'],
    evo: { name: 'Rockslide', desc: 'Throw stones twice as often, and they pass through 2 enemies.', need: { part: 'heavy' }, needText: 'any Heavy Strike card' },
  },
];

registerClass({
  id: 'traveler',
  name: 'Traveler',
  role: 'Melee · Starter all-rounder',
  color: '#b98a5a',
  ultName: 'Rally Cry',
  base: { hp: 80, moveSpeed: 150, armor: 0, luck: 0 },
  heavyCooldown: 1.5,
  ratings: { HP: 2, Speed: 3, Damage: 2, 'Attack speed': 3, Range: 2 },
  kit: [
    'Strike: 2-hit walking staff combo',
    'Heavy: Staff Slam with a small shockwave',
    'Dash: a simple roll',
    'Ultimate: Rally Cry heals 30% and pushes enemies away',
    'Passive: Quick Learner, +10% XP',
  ],
  keys: { lmb: 'Staff', rmb: 'Slam', spc: 'Roll', q: 'Rally' },
  abilities: { strike: 'Walking Staff', heavy: 'Staff Slam', dash: 'Roll', ultimate: 'Rally Cry', passive: 'Quick Learner' },
  favoredParts: ['strike', 'wild'],
  cards: TRAVELER_CARDS,

  init() {
    const initial: TravelerState = {
      combo: 0, attackTimer: 0, rallyTime: 0,
      coinTimer: 4, luckyTime: 0, campTimer: 5, campfires: [], stoneTimer: 0,
      rollHit: new Set(),
      tumbleTime: 0, banner: null, inBanner: false, standTime: 0,
    };
    run.classState = initial;
  },

  modifyStats(stats: Stats) {
    const cs = state();
    stats.xpGain += BASE_XP_BONUS;
    if (hasCard('wanderlust')) {
      stats.xpGain += 0.1 * cardMul('wanderlust', 'effect');
      stats.moveSpeed *= 1.05 * cardMul('wanderlust', 'speed');
    }
    if (hasCard('light_feet')) {
      stats.dashCooldown *= 0.8 / cardMul('light_feet', 'speed');
      if (cardLevel('light_feet') >= 5) stats.dashCharges += 1;
    }
    if (hasCard('quick_jab')) stats.attackSpeed *= 1.2 * cardMul('quick_jab', 'speed');
    if (cs && cs.rallyTime > 0) stats.moveSpeed *= 1.25 * cardMul('loud_rally', 'speed');
    if (cs && cs.luckyTime > 0) stats.damage *= 1.3 * cardMul('lucky_coin', 'effect');
    if (hasCard('tumble')) {
      stats.dashCharges += 2;
      if (cs && cs.tumbleTime > 0) stats.attackSpeed *= 1.35 * cardMul('tumble', 'speed');
    }
    if (cs && cs.inBanner) stats.damage *= 1.3;
    if (cs && cs.standTime > 0) stats.attackSpeed *= 1.4;
  },

  /** Last Stand: while it lasts, a hit can take you down to 1 HP but not below. */
  absorb(damage: number) {
    if (state().standTime <= 0) return damage;
    return Math.min(damage, Math.max(0, run.player.hp - 1));
  },

  // ---------------------------------------------------------- abilities

  /** Walking Staff: a simple 2-hit combo; the 2nd hit is a little stronger. */
  strike(dt: number, attacking: boolean) {
    const cs = state(), p = run.player;
    cs.attackTimer -= dt;
    if (!attacking || cs.attackTimer > 0) return;
    if (hasCard('sling')) { throwSling(); cs.attackTimer = 0.5 / run.stats.attackSpeed; return; }
    const second = cs.combo === 1, whirl = hasCard('whirling_staff');
    let radius = 52 * run.stats.area, damage = (second ? 13 : 10) * staffDamageMul(), arc = STAFF_ARC;
    if (hasCard('sturdy_staff')) {
      radius *= 1.15 * cardMul('sturdy_staff', 'range');
      arc *= 1.2;
    }
    if (whirl) {
      arc = TAU;
      damage *= 0.8 * cardMul('whirling_staff', 'damage');
      radius *= 0.95 * cardMul('whirling_staff', 'range');
    }
    const knock = hasCard('knock_away') ? 14 * cardMul('knock_away', 'range') : 0;
    const hit = damageInArc(p.x, p.y, p.face, radius, arc, damage, { tag: 'staff', knock });
    if (knock) for (const e of hit) if (!e.boss) e.slowTime = Math.max(e.slowTime, 1 * cardMul('knock_away', 'duration'));
    // the poke: a thin line further ahead
    if (second && hasCard('quick_jab')) poke(radius * 1.9, damage * 0.8 * cardMul('quick_jab', 'damage'), 0, hit);
    spawnSlash(p.x, p.y, p.face, radius, arc, STAFF_COLOR, second ? 5 : 3);
    cs.combo = (cs.combo + 1) % 2;
    cs.attackTimer = (0.38 / run.stats.attackSpeed) * (whirl ? 1.15 / cardMul('whirling_staff', 'speed') : 1);
  },

  /** Staff Slam: overhead slam in front of you with a small shockwave. Mutations: Pole Vault, Earthshaker. */
  heavy() {
    const p = run.player;
    let radius = 62 * run.stats.area, damage = 10 * 0.75 * 2;
    if (hasCard('big_slam')) {
      radius *= 1.3 * cardMul('big_slam', 'range');
      damage *= 1.4 * cardMul('big_slam', 'damage');
    }
    if (hasCard('earthshaker')) {
      // a stomp at your feet: widening shockwaves; the first one carries the slam cards
      const x = p.x, y = p.y, waves = 3 + cardExtraProjectiles('earthshaker');
      for (let i = 0; i < waves; i++) {
        const r = radius * (0.9 + 0.45 * i) * cardMul('earthshaker', 'range');
        schedule(0.22 * i, () => slam(x, y, r, damage * 0.6 * cardMul('earthshaker', 'damage'), i === 0));
      }
      return;
    }
    let cx = p.x + Math.cos(p.face) * 34, cy = p.y + Math.sin(p.face) * 34;
    if (hasCard('pole_vault')) {
      const dist = 120 * cardMul('pole_vault', 'range');
      p.x = clamp(p.x + Math.cos(p.face) * dist, p.r, ARENA_W - p.r);
      p.y = clamp(p.y + Math.sin(p.face) * dist, p.r, ARENA_H - p.r);
      p.iframes = Math.max(p.iframes, 0.25);
      cx = p.x; cy = p.y;
      radius *= 1.2 * cardMul('pole_vault', 'range');
      damage *= cardMul('pole_vault', 'damage');
    }
    slam(cx, cy, radius, damage, true);
  },

  /** Roll: a plain dash. Cards add dust (slow) and bumping; mutations: Backflip, Tumble. */
  dash() {
    const p = run.player, cs = state();
    cs.rollHit = new Set();
    if (hasCard('dust_roll')) {
      addZone({
        kind: 'smoke', x: p.x, y: p.y, r: 60 * run.stats.area * cardMul('dust_roll', 'range'), color: 'rgba(200,180,140,0.22)',
        life: 2 * cardMul('dust_roll', 'duration'), slow: true,
      });
    }
    if (hasCard('tumble')) { cs.tumbleTime = 1.5 * cardMul('tumble', 'duration'); recalcStats(); }
    return rollShape();
  },
  dashShape: () => rollShape(),
  onDashEnd() {
    // Backflip: land and jab toward where you aim
    if (hasCard('backflip')) poke(120 * run.stats.area * cardMul('backflip', 'range'), 20 * staffDamageMul() * cardMul('backflip', 'damage'), 16, []);
  },
  onDashMove() {
    if (!hasCard('rolling_bump')) return;
    const p = run.player, cs = state();
    for (const e of enemiesInRadius(p.x, p.y, 20 * cardMul('rolling_bump', 'range'))) {
      if (cs.rollHit.has(e)) continue;
      cs.rollHit.add(e);
      hitEnemy(e, 8 * cardMul('rolling_bump', 'damage'), { knock: 10, tag: 'bump', color: STAFF_COLOR });
    }
  },

  /** Rally Cry: heal and push every nearby enemy away. Mutations: Rally Banner, Last Stand. */
  ult() {
    const p = run.player, cs = state();
    const wave = hasCard('rally_wave') ? 30 * cardMul('rally_wave', 'damage') : 0;
    if (hasCard('rally_banner')) {
      cs.banner = { x: p.x, y: p.y, r: 150 * run.stats.area * cardMul('rally_banner', 'range'), life: 8 * cardMul('rally_banner', 'duration') };
      spawnRing(p.x, p.y, cs.banner.r, COLOR.gold);
      if (wave) rallyPush(wave);
    } else if (hasCard('last_stand')) {
      cs.standTime = 6 * cardMul('last_stand', 'duration');
      recalcStats();
      spawnRing(p.x, p.y, 40, COLOR.gold);
      if (wave) rallyPush(wave);
    } else {
      healPlayer(run.stats.maxHp * (0.3 + (hasCard('loud_rally') ? 0.15 * cardMul('loud_rally', 'heal') : 0)));
      rallyPush(wave || 3);
    }
    if (hasCard('loud_rally')) { cs.rallyTime = 4; recalcStats(); }
    if (hasCard('hopeful_cry')) p.ult = Math.min(100, 25 * cardMul('hopeful_cry', 'effect'));
  },

  update(dt: number) {
    const cs = state();
    if (cs.rallyTime > 0) { cs.rallyTime -= dt; if (cs.rallyTime <= 0) recalcStats(); }
    if (cs.luckyTime > 0) { cs.luckyTime -= dt; if (cs.luckyTime <= 0) recalcStats(); }
    if (cs.tumbleTime > 0) { cs.tumbleTime -= dt; if (cs.tumbleTime <= 0) recalcStats(); }
    updateLastStand(dt);
    updateBanner(dt);
    updateLuckyCoin(dt);
    updateCampfires(dt);
    updateStones(dt);
  },

  draw() {
    const cs = state(), p = run.player;
    if (cs.banner) drawBanner(cs.banner);
    if (cs.standTime > 0) {
      ctx.strokeStyle = COLOR.gold;
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(run.time * 12);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, 24, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const f of cs.campfires) {
      ctx.globalAlpha = Math.min(1, f.life);
      ctx.fillStyle = 'rgba(255,150,60,0.18)';
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill();
      ctx.fillStyle = Math.floor(run.time * 8) % 2 ? '#ffb347' : '#ff7a3a';
      ctx.beginPath(); ctx.moveTo(f.x - 7, f.y + 5); ctx.lineTo(f.x, f.y - 10); ctx.lineTo(f.x + 7, f.y + 5); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (cs.luckyTime > 0) {
      ctx.strokeStyle = COLOR.gold;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, 20 + Math.sin(run.time * 8) * 1.5, 0, TAU); ctx.stroke();
    }
  },

  resource() {
    const bonus = Math.round((run.stats.xpGain - 1) * 100);
    return { label: 'XP bonus %', value: bonus, frac: Math.min(1, bonus / 40), color: STAFF_COLOR };
  },
});

// ------------------------------------------------------------ ability helpers

/** Sturdy Staff's damage bonus, shared by every form of the Strike. */
const staffDamageMul = (): number => (hasCard('sturdy_staff') ? 1.25 * cardMul('sturdy_staff', 'damage') : 1);

/**
 * Where a roll goes: Backflip flips away from your aim; Tumble is short and quick; otherwise a plain roll.
 * Used by both `dash` and `dashShape`, so online prediction moves the same way.
 */
function rollShape(): DashOverride {
  if (hasCard('backflip')) return { ang: run.player.face + Math.PI, dist: 115 };
  if (hasCard('tumble')) return { dist: 85, dur: 0.12 };
  return {};
}

/** A thin staff thrust along your aim, `len` long. Enemies in `skip` were already hit this swing. */
function poke(len: number, damage: number, knock: number, skip: Enemy[]): void {
  const p = run.player, c = Math.cos(p.face), s = Math.sin(p.face), ex = p.x + c * len, ey = p.y + s * len;
  for (const e of enemiesInRadius((p.x + ex) / 2, (p.y + ey) / 2, len / 2)) {
    if (skip.includes(e)) continue;
    const along = (e.x - p.x) * c + (e.y - p.y) * s, side = Math.abs(-(e.x - p.x) * s + (e.y - p.y) * c);
    if (along > 0 && along < len && side < e.r + 8) hitEnemy(e, damage, { tag: 'staff', knock });
  }
  spawnLine(p.x, p.y, ex, ey, STAFF_COLOR, 3);
}

/** Sling (mutation): fast stones instead of the swing. Staff cards still count. */
function throwSling(): void {
  const p = run.player, count = 1 + cardExtraProjectiles('sling'), speed = 560 * cardMul('sling', 'speed');
  const knock = hasCard('knock_away') ? 10 * cardMul('knock_away', 'range') : 0;
  for (let i = 0; i < count; i++) {
    const a = p.face + (i - (count - 1) / 2) * 0.12;
    fireShot({
      x: p.x, y: p.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 4, pierce: 1, knock,
      dmg: 12 * staffDamageMul() * cardMul('sling', 'damage'), life: 0.75, color: STAFF_COLOR, kind: 'pebble', tag: 'staff',
    });
  }
}

/** One Staff Slam landing at (cx, cy). `withCards`: also throw Pebble Shower and leave a Ground Crack. */
function slam(cx: number, cy: number, radius: number, damage: number, withCards: boolean): void {
  const p = run.player;
  damageInCircle(cx, cy, radius, damage, { heavy: true, knock: 10, tag: 'slam', color: STAFF_COLOR });
  spawnRing(cx, cy, radius, STAFF_COLOR);
  spawnBurst(cx, cy, EARTH_COLOR, 10, 120);
  if (!withCards) return;
  if (hasCard('pebble_shower')) {
    const count = 3 + cardExtraProjectiles('pebble_shower');
    for (let i = 0; i < count; i++) {
      const a = p.face + (i - (count - 1) / 2) * 0.35;
      fireShot({
        x: cx, y: cy, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, r: 4,
        dmg: 7 * cardMul('pebble_shower', 'damage'), life: 0.7, color: EARTH_COLOR, kind: 'pebble', tag: 'pebble',
      });
    }
  }
  if (hasCard('ground_crack')) {
    addZone({
      kind: 'spikes', x: cx, y: cy, r: radius * 0.9 * cardMul('ground_crack', 'range'), color: 'rgba(160,122,80,0.28)',
      life: 2.5 * cardMul('ground_crack', 'duration'), slow: true, dps: 3,
    });
  }
}

/** Rally Cry's push: every nearby enemy is shoved away and takes `damage`. */
function rallyPush(damage: number): void {
  const p = run.player, radius = 210 * run.stats.area * (hasCard('rally_wave') ? cardMul('rally_wave', 'range') : 1);
  for (const e of enemiesInRadius(p.x, p.y, radius)) {
    hitEnemy(e, damage, { knock: 40, knockAngle: Math.atan2(e.y - p.y, e.x - p.x), color: COLOR.gold });
  }
  spawnRing(p.x, p.y, radius, COLOR.gold);
  spawnBurst(p.x, p.y, COLOR.gold, 24, 200);
  run.shake = 5;
}

/** Last Stand ends with a heal (more with Loud Rally). */
function updateLastStand(dt: number): void {
  const cs = state();
  if (cs.standTime <= 0) return;
  cs.standTime -= dt;
  if (cs.standTime > 0) return;
  const loud = hasCard('loud_rally') ? 1.5 * cardMul('loud_rally', 'heal') : 1;
  healPlayer(run.stats.maxHp * 0.2 * cardMul('last_stand', 'heal') * loud);
  recalcStats();
}

/** Rally Banner: heals every hero standing in it (teammates too); you also deal more damage inside. */
function updateBanner(dt: number): void {
  const cs = state(), b = cs.banner;
  let inside = false;
  if (b) {
    b.life -= dt;
    if (b.life <= 0) cs.banner = null;
    else {
      const heal = 0.03 * cardMul('rally_banner', 'heal') * (hasCard('loud_rally') ? 1.5 * cardMul('loud_rally', 'heal') : 1);
      for (const h of livingHeroes()) {
        if (distSq(h.player, b) > b.r * b.r) continue;
        if (h === run.hero) inside = true;
        withHero(h, () => healPlayer(run.stats.maxHp * heal * dt, true));
      }
    }
  }
  if (inside !== cs.inBanner) { cs.inBanner = inside; recalcStats(); }
}

function drawBanner(b: RallyBanner): void {
  ctx.globalAlpha = Math.min(1, b.life);
  ctx.fillStyle = 'rgba(240,185,77,0.08)';
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(240,185,77,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.stroke();
  // the banner: a pole and a waving flag
  ctx.fillStyle = '#8a6a44';
  ctx.fillRect(b.x - 1.5, b.y - 34, 3, 36);
  const wave = Math.sin(run.time * 6) * 2;
  ctx.fillStyle = COLOR.gold;
  ctx.beginPath(); ctx.moveTo(b.x + 1.5, b.y - 34); ctx.lineTo(b.x + 20, b.y - 29 + wave); ctx.lineTo(b.x + 1.5, b.y - 22); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
}

function updateLuckyCoin(dt: number): void {
  const cs = state(), p = run.player;
  if (!hasCard('lucky_coin')) return;
  cs.coinTimer -= dt;
  if (cs.coinTimer > 0) return;
  const favor = isEvolved('lucky_coin');
  cs.coinTimer = favor ? 5 : 8;
  const heads = favor || Math.random() < 0.5, tails = favor || !heads;
  if (heads) {
    cs.luckyTime = 4 * cardMul('lucky_coin', 'duration');
    recalcStats();
    addFloatingText(p.x, p.y - 30, 'Heads!', COLOR.gold, 12);
  }
  if (tails) {
    healPlayer(8 * cardMul('lucky_coin', 'heal'));
    if (!favor) addFloatingText(p.x, p.y - 30, 'Tails!', COLOR.green, 12);
  }
}

function updateCampfires(dt: number): void {
  const cs = state(), p = run.player;
  for (const f of cs.campfires) f.life -= dt;
  cs.campfires = cs.campfires.filter((f) => f.life > 0);
  if (!hasCard('campfire')) return;
  const hearth = isEvolved('campfire');
  cs.campTimer -= dt;
  if (cs.campTimer <= 0) {
    cs.campTimer = 10;
    const r = 70 * run.stats.area * (hearth ? 1.4 : 1), life = 5 * cardMul('campfire', 'duration') * (hearth ? 2 : 1);
    cs.campfires.push({ x: p.x, y: p.y, r, life });
    addZone({ kind: 'fire', x: p.x, y: p.y, r, life, dps: 8 * cardMul('campfire', 'damage'), color: 'rgba(255,140,60,0.12)' });
  }
  // warm up next to your own fires
  for (const f of cs.campfires) {
    if (distSq(f, p) < f.r * f.r) healPlayer(1.2 * cardMul('campfire', 'heal') * (hearth ? 2 : 1) * dt, true);
  }
}

function updateStones(dt: number): void {
  const cs = state(), p = run.player;
  if (!hasCard('thrown_stones')) return;
  const rockslide = isEvolved('thrown_stones');
  cs.stoneTimer -= dt;
  if (cs.stoneTimer > 0) return;
  cs.stoneTimer = (rockslide ? 0.6 : 1.2) / cardMul('thrown_stones', 'speed');
  const target = nearestEnemy(p.x, p.y, 420);
  if (!target) return;
  const count = 1 + cardExtraProjectiles('thrown_stones');
  const a0 = Math.atan2(target.y - p.y, target.x - p.x);
  for (let i = 0; i < count; i++) {
    const a = a0 + (i - (count - 1) / 2) * 0.2 + randRange(-0.05, 0.05);
    fireShot({
      x: p.x, y: p.y, vx: Math.cos(a) * 430, vy: Math.sin(a) * 430, r: 4, pierce: rockslide ? 2 : 0,
      dmg: 8 * cardMul('thrown_stones', 'damage'), life: 1, color: EARTH_COLOR, kind: 'pebble', tag: 'stone',
    });
  }
}
