// ============================================================ Traveler: the starter class (simple, weaker on purpose)
import type { CardDef, Enemy, Point, Stats } from '../types';
import { COLOR, TAU } from '../core/constants';
import { ctx } from '../core/canvas';
import { degToRad, distSq, randRange } from '../core/math';
import { cardExtraProjectiles, cardLevel, cardMul, hasCard, isEvolved, recalcStats, run } from '../core/state';
import { damageInArc, damageInCircle, healPlayer, hitEnemy } from '../world/combat';
import { addFloatingText, spawnBurst, spawnLine, spawnRing, spawnSlash } from '../world/effects';
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
  },

  // ---------------------------------------------------------- abilities

  /** Walking Staff: a simple 2-hit combo; the 2nd hit is a little stronger. */
  strike(dt: number, attacking: boolean) {
    const cs = state(), p = run.player;
    cs.attackTimer -= dt;
    if (!attacking || cs.attackTimer > 0) return;
    const second = cs.combo === 1;
    let radius = 52 * run.stats.area, damage = second ? 13 : 10, arc = STAFF_ARC;
    if (hasCard('sturdy_staff')) {
      damage *= 1.25 * cardMul('sturdy_staff', 'damage');
      radius *= 1.15 * cardMul('sturdy_staff', 'range');
      arc *= 1.2;
    }
    const knock = hasCard('knock_away') ? 14 * cardMul('knock_away', 'range') : 0;
    const hit = damageInArc(p.x, p.y, p.face, radius, arc, damage, { tag: 'staff', knock });
    if (knock) for (const e of hit) if (!e.boss) e.slowTime = Math.max(e.slowTime, 1 * cardMul('knock_away', 'duration'));
    if (second && hasCard('quick_jab')) {
      // the poke: a thin line further ahead
      const len = radius * 1.9, ex = p.x + Math.cos(p.face) * len, ey = p.y + Math.sin(p.face) * len;
      for (const e of enemiesInRadius((p.x + ex) / 2, (p.y + ey) / 2, len / 2)) {
        if (hit.includes(e)) continue;
        const along = (e.x - p.x) * Math.cos(p.face) + (e.y - p.y) * Math.sin(p.face);
        const side = Math.abs(-(e.x - p.x) * Math.sin(p.face) + (e.y - p.y) * Math.cos(p.face));
        if (along > 0 && along < len && side < e.r + 8) hitEnemy(e, damage * 0.8 * cardMul('quick_jab', 'damage'), { tag: 'staff' });
      }
      spawnLine(p.x, p.y, ex, ey, STAFF_COLOR, 3);
    }
    spawnSlash(p.x, p.y, p.face, radius, arc, STAFF_COLOR, second ? 5 : 3);
    cs.combo = (cs.combo + 1) % 2;
    cs.attackTimer = 0.38 / run.stats.attackSpeed;
  },

  /** Staff Slam: overhead slam in front of you with a small shockwave. */
  heavy() {
    const p = run.player;
    const cx = p.x + Math.cos(p.face) * 34, cy = p.y + Math.sin(p.face) * 34;
    let radius = 62 * run.stats.area, damage = 10 * 0.75 * 2;
    if (hasCard('big_slam')) {
      radius *= 1.3 * cardMul('big_slam', 'range');
      damage *= 1.4 * cardMul('big_slam', 'damage');
    }
    damageInCircle(cx, cy, radius, damage, { heavy: true, knock: 10, tag: 'slam', color: STAFF_COLOR });
    spawnRing(cx, cy, radius, STAFF_COLOR);
    spawnBurst(cx, cy, EARTH_COLOR, 10, 120);
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
  },

  /** Roll: a plain dash. Cards add dust (slow) and bumping. */
  dash() {
    const p = run.player, cs = state();
    cs.rollHit = new Set();
    if (hasCard('dust_roll')) {
      addZone({
        kind: 'smoke', x: p.x, y: p.y, r: 60 * run.stats.area * cardMul('dust_roll', 'range'), color: 'rgba(200,180,140,0.22)',
        life: 2 * cardMul('dust_roll', 'duration'), slow: true,
      });
    }
    return {};
  },
  dashShape: () => ({}),
  onDashMove() {
    if (!hasCard('rolling_bump')) return;
    const p = run.player, cs = state();
    for (const e of enemiesInRadius(p.x, p.y, 20 * cardMul('rolling_bump', 'range'))) {
      if (cs.rollHit.has(e)) continue;
      cs.rollHit.add(e);
      hitEnemy(e, 8 * cardMul('rolling_bump', 'damage'), { knock: 10, tag: 'bump', color: STAFF_COLOR });
    }
  },

  /** Rally Cry: heal and push every nearby enemy away. */
  ult() {
    const p = run.player, cs = state();
    const heal = 0.3 + (hasCard('loud_rally') ? 0.15 * cardMul('loud_rally', 'heal') : 0);
    healPlayer(run.stats.maxHp * heal);
    const radius = 210 * run.stats.area * (hasCard('rally_wave') ? cardMul('rally_wave', 'range') : 1);
    const damage = hasCard('rally_wave') ? 30 * cardMul('rally_wave', 'damage') : 3;
    for (const e of enemiesInRadius(p.x, p.y, radius)) {
      hitEnemy(e, damage, { knock: 40, knockAngle: Math.atan2(e.y - p.y, e.x - p.x), color: COLOR.gold });
    }
    spawnRing(p.x, p.y, radius, COLOR.gold);
    spawnBurst(p.x, p.y, COLOR.gold, 24, 200);
    run.shake = 5;
    if (hasCard('loud_rally')) { cs.rallyTime = 4; recalcStats(); }
    if (hasCard('hopeful_cry')) p.ult = Math.min(100, 25 * cardMul('hopeful_cry', 'effect'));
  },

  update(dt: number) {
    const cs = state();
    if (cs.rallyTime > 0) { cs.rallyTime -= dt; if (cs.rallyTime <= 0) recalcStats(); }
    if (cs.luckyTime > 0) { cs.luckyTime -= dt; if (cs.luckyTime <= 0) recalcStats(); }
    updateLuckyCoin(dt);
    updateCampfires(dt);
    updateStones(dt);
  },

  draw() {
    const cs = state(), p = run.player;
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
