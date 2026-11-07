// ============================================================ Oathknight: tank (sword, shield, holy oath)
import type { CardDef, DashOverride, Enemy, Point, Stats } from '../types';
import { TAU } from '../core/constants';
import { ctx } from '../core/canvas';
import { degToRad, distSq } from '../core/math';
import { cardExtraProjectiles, cardLevel, cardMul, hasCard, isEvolved, run } from '../core/state';
import { damageInArc, damageInCircle, healPlayer, hitEnemy } from '../world/combat';
import { addFloatingText, spawnBurst, spawnLine, spawnPillar, spawnRing, spawnSlash } from '../world/effects';
import { enemiesInRadius, nearestEnemy } from '../world/enemies';
import { fireShot } from '../world/projectiles';
import { addZone } from '../world/zones';
import { registerClass } from './registry';

const STEEL = '#c8d4e6';
const HOLY = '#fff2a8';
const SWEEP_ARC = degToRad(160);
const SLAM_ARC = degToRad(95);
/** Bulwark: seconds without taking damage before the shield returns. */
const BULWARK_DELAY = 4;
const OATH_SECONDS = 6;

interface OathState {
  attackTimer: number;
  /** Seconds since you last took damage (Bulwark). */
  calm: number;
  /** Bulwark shields seen last frame, to notice when one blocks a hit. */
  lastShields: number;
  oathTime: number;
  /** Hits blocked during the current Unbreakable Oath. */
  oathBlocks: number;
  shieldAngle: number;
  shieldPositions: Point[];
  lightTimer: number;
  /** Enemies already hit by the current Shield Charge. */
  chargeHit: Set<Enemy>;
}
const state = (): OathState => run.classState as OathState;

const OATH_CARDS: CardDef[] = [
  { id: 'bulwark_vow', name: 'Bulwark Vow', part: 'passive', desc: 'Bulwark returns 30% faster; at Lv3 it holds 2 blocks.', ups: ['speed', 'effect'] },
  { id: 'holy_blade', name: 'Holy Blade', part: 'strike', desc: 'Every swing sends a wave of light forward.', ups: ['damage', 'range'] },
  { id: 'heavy_swings', name: 'Heavy Swings', part: 'strike', desc: 'Swings hit 30% harder and knock enemies back.', ups: ['damage', 'range'] },
  { id: 'quick_strokes', name: 'Quick Strokes', part: 'strike', desc: 'Swing 25% faster.', ups: ['speed'] },
  { id: 'crushing_slam', name: 'Crushing Slam', part: 'heavy', desc: 'Shield Slam is bigger, stronger, and stuns longer.', ups: ['damage', 'range', 'duration'] },
  { id: 'shield_toss', name: 'Shield Toss', part: 'heavy', desc: 'Shield Slam also throws your shield, bouncing between 3 enemies.', ups: ['projectiles', 'damage'] },
  { id: 'rally_slam', name: 'Rally Slam', part: 'heavy', desc: 'Shield Slam heals 2 HP per enemy hit.', ups: ['heal', 'effect'] },
  { id: 'thunder_charge', name: 'Thunder Charge', part: 'dash', desc: 'Shield Charge goes farther, hits harder and stuns longer.', ups: ['damage', 'range', 'duration'] },
  { id: 'iron_charge', name: 'Iron Charge', part: 'dash', desc: 'Block all damage for 0.6 s after a Shield Charge.', ups: ['duration', 'effect'] },
  { id: 'double_charge', name: 'Double Charge', part: 'dash', desc: 'Shield Charge cooldown −20%. +1 charge at Lv5.', ups: ['speed'] },
  { id: 'vow_of_iron', name: 'Vow of Iron', part: 'ultimate', desc: 'Unbreakable Oath lasts 2 s longer; the final wave is bigger.', ups: ['damage', 'duration'] },
  { id: 'vengeance_waves', name: 'Vengeance Waves', part: 'ultimate', desc: 'The final wave also fires 3 sword waves at enemies.', ups: ['projectiles', 'damage'] },
  { id: 'holy_ground', name: 'Holy Ground', part: 'ultimate', desc: 'During the Oath, holy ground burns enemies around you.', ups: ['damage', 'range'] },
  {
    id: 'thorns', name: 'Thorns', part: 'wild', desc: 'When you take damage, nearby enemies take damage back.', ups: ['damage', 'effect'],
    evo: { name: 'Bramble Plate', desc: 'Thorns hit twice as hard, and also when Bulwark blocks.', need: { card: 'bulwark_vow' }, needText: 'Bulwark Vow card' },
  },
  {
    id: 'spinning_shields', name: 'Spinning Shields', part: 'wild', desc: '2 shields orbit you, hitting enemies and blocking shots.', ups: ['projectiles', 'speed', 'range'],
    evo: { name: 'Aegis Ring', desc: 'Twice the shields, wider orbit.', need: { part: 'dash' }, needText: 'any Dash card' },
  },
  {
    id: 'light_of_the_order', name: 'Light of the Order', part: 'wild', desc: 'Every 10 s, a holy beam strikes the toughest enemy nearby.', ups: ['damage', 'speed'],
    evo: { name: "Order's Judgment", desc: 'Every 5 s, beams strike 3 enemies.', need: { card: 'holy_blade' }, needText: 'Holy Blade card' },
  },
];

registerClass({
  id: 'oathknight',
  name: 'Oathknight',
  role: 'Melee · Tank',
  color: '#7f9cc8',
  ultName: 'Unbreakable Oath',
  base: { hp: 150, moveSpeed: 125, armor: 5, luck: 0 },
  heavyCooldown: 2.0,
  ratings: { HP: 5, Speed: 2, Damage: 3, 'Attack speed': 2, Range: 2 },
  kit: [
    'Strike: wide, slow sword sweep',
    'Heavy: Shield Slam stuns and breaks shields',
    'Dash: Shield Charge knocks enemies back',
    'Ultimate: Unbreakable Oath, no damage for 6 s',
    'Passive: Bulwark blocks a hit after 4 s calm',
  ],
  keys: { lmb: 'Sweep', rmb: 'Slam', spc: 'Charge', q: 'Oath' },
  favoredParts: ['heavy', 'ultimate'],
  cards: OATH_CARDS,

  init() {
    const initial: OathState = {
      attackTimer: 0, calm: BULWARK_DELAY, lastShields: 0,
      oathTime: 0, oathBlocks: 0,
      shieldAngle: 0, shieldPositions: [], lightTimer: 5,
      chargeHit: new Set(),
    };
    run.classState = initial;
  },

  modifyStats(stats: Stats) {
    if (hasCard('quick_strokes')) stats.attackSpeed *= 1.25 * cardMul('quick_strokes', 'speed');
    if (hasCard('double_charge')) {
      stats.dashCooldown *= 0.8 / cardMul('double_charge', 'speed');
      if (cardLevel('double_charge') >= 5) stats.dashCharges += 1;
    }
  },

  // ---------------------------------------------------------- defence

  /** Unbreakable Oath blocks everything; any real hit resets Bulwark's timer and triggers Thorns. */
  absorb(damage: number) {
    const cs = state();
    if (cs.oathTime > 0) {
      if (damage > 1) cs.oathBlocks++;
      return 0;
    }
    if (damage > 1) {
      cs.calm = 0;
      thornsBurst(damage);
    }
    return damage;
  },

  // ---------------------------------------------------------- abilities

  /** Sword Sweep: a wide, slow swing. */
  strike(dt: number, attacking: boolean) {
    const cs = state(), p = run.player;
    cs.attackTimer -= dt;
    if (!attacking || cs.attackTimer > 0) return;
    let damage = 14, radius = 62 * run.stats.area, knock = 0;
    if (hasCard('heavy_swings')) {
      damage *= 1.3 * cardMul('heavy_swings', 'damage');
      radius *= cardMul('heavy_swings', 'range');
      knock = 16;
    }
    damageInArc(p.x, p.y, p.face, radius, SWEEP_ARC, damage, { tag: 'sword', knock });
    spawnSlash(p.x, p.y, p.face, radius, SWEEP_ARC, STEEL, 6);
    if (hasCard('holy_blade')) {
      const speed = 420 * cardMul('holy_blade', 'range');
      fireShot({
        x: p.x, y: p.y, vx: Math.cos(p.face) * speed, vy: Math.sin(p.face) * speed, r: 10, pierce: 999, life: 0.6,
        dmg: 7 * cardMul('holy_blade', 'damage'), color: HOLY, kind: 'wave', tag: 'light',
      });
    }
    cs.attackTimer = 0.55 / run.stats.attackSpeed;
  },

  /** Shield Slam: a cone that stuns briefly and breaks enemy shields. */
  heavy() {
    const p = run.player;
    let radius = 82 * run.stats.area, damage = 14 * 0.9 * 1.4, stun = 0.3;
    if (hasCard('crushing_slam')) {
      radius *= 1.25 * cardMul('crushing_slam', 'range');
      damage *= 1.4 * cardMul('crushing_slam', 'damage');
      stun = 0.6 * cardMul('crushing_slam', 'duration');
    }
    const hit = damageInArc(p.x, p.y, p.face, radius, SLAM_ARC, damage, { heavy: true, knock: 18, tag: 'slam', color: STEEL });
    for (const e of hit) if (!e.boss) e.rootTime = Math.max(e.rootTime, stun);
    spawnSlash(p.x, p.y, p.face, radius, SLAM_ARC, '#e8eef8', 9);
    run.shake = Math.max(run.shake, 3);
    if (hasCard('rally_slam') && hit.length) healPlayer(2 * hit.length * cardMul('rally_slam', 'heal') * cardMul('rally_slam', 'effect'));
    if (hasCard('shield_toss')) shieldToss(hit[0] ?? nearestEnemy(p.x, p.y, 300), 3 + cardExtraProjectiles('shield_toss'), damage * 0.6 * cardMul('shield_toss', 'damage'));
  },

  /** Shield Charge: rush forward, knocking back and briefly stunning everything you hit. */
  dash() {
    state().chargeHit = new Set();
    return chargeShape();
  },
  dashShape: () => chargeShape(),
  onDashMove() {
    const p = run.player, cs = state(), thunder = hasCard('thunder_charge');
    for (const e of enemiesInRadius(p.x, p.y, 22)) {
      if (cs.chargeHit.has(e)) continue;
      cs.chargeHit.add(e);
      hitEnemy(e, 6 * (thunder ? 2 * cardMul('thunder_charge', 'damage') : 1), {
        knock: 26, knockAngle: Math.atan2(e.y - p.y, e.x - p.x), tag: 'charge', color: STEEL,
      });
      if (!e.boss) e.rootTime = Math.max(e.rootTime, 0.4 * (thunder ? 1.5 * cardMul('thunder_charge', 'duration') : 1));
    }
  },
  onDashEnd() {
    if (hasCard('iron_charge')) {
      const p = run.player;
      p.iframes = Math.max(p.iframes, 0.6 * cardMul('iron_charge', 'duration') * cardMul('iron_charge', 'effect'));
    }
  },

  /** Unbreakable Oath: no damage for 6 s; every blocked hit powers the sword wave at the end. */
  ult() {
    const cs = state(), p = run.player;
    cs.oathTime = OATH_SECONDS + (hasCard('vow_of_iron') ? 2 * cardMul('vow_of_iron', 'duration') : 0);
    cs.oathBlocks = 0;
    if (hasCard('holy_ground')) {
      addZone({
        kind: 'holyfire', x: p.x, y: p.y, r: 90 * run.stats.area * cardMul('holy_ground', 'range'), follow: p,
        life: cs.oathTime, dps: 12 * cardMul('holy_ground', 'damage'), color: 'rgba(255,242,168,0.16)',
      });
    }
  },

  update(dt: number) {
    updateBulwark(dt);
    updateOath(dt);
    updateSpinningShields(dt);
    updateLightOfTheOrder(dt);
  },

  draw() {
    const cs = state(), p = run.player;
    for (const s of cs.shieldPositions) {
      ctx.fillStyle = STEEL;
      ctx.beginPath(); ctx.arc(s.x, s.y, 9, 0, TAU); ctx.fill();
      ctx.fillStyle = '#5a6f90';
      ctx.fillRect(s.x - 2, s.y - 6, 4, 12);
    }
    if (cs.oathTime > 0) {
      ctx.strokeStyle = 'rgba(255,242,168,0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, 24 + Math.sin(run.time * 10) * 2, 0, TAU); ctx.stroke();
    }
  },

  resource() {
    const cs = state(), shields = run.player.boneShield;
    const frac = shields > 0 ? 1 : Math.min(1, cs.calm / bulwarkDelay());
    return { label: 'Bulwark', value: shields, frac, color: STEEL };
  },
});

const chargeShape = (): DashOverride => ({ dist: 130 * (hasCard('thunder_charge') ? 1.4 * cardMul('thunder_charge', 'range') : 1) });

const bulwarkDelay = (): number => BULWARK_DELAY / (hasCard('bulwark_vow') ? 1.3 * cardMul('bulwark_vow', 'speed') : 1);
const bulwarkMax = (): number => (cardLevel('bulwark_vow') >= 3 ? 2 : 1);

/**
 * Bulwark uses the player's block charges (`boneShield`, drawn as a dashed ring): after a few calm
 * seconds you gain a block. When one is used up, the calm timer restarts.
 */
function updateBulwark(dt: number): void {
  const cs = state(), p = run.player;
  if (p.boneShield < cs.lastShields) {
    cs.calm = 0;
    if (isEvolved('thorns')) thornsBurst(10);
  }
  cs.calm += dt;
  if (cs.calm >= bulwarkDelay() && p.boneShield < bulwarkMax()) {
    p.boneShield++;
    p.boneShieldTime = 0; // never expires
    cs.calm = 0;
    addFloatingText(p.x, p.y - 26, 'Bulwark', STEEL, 10);
  }
  cs.lastShields = p.boneShield;
}

function updateOath(dt: number): void {
  const cs = state(), p = run.player;
  if (cs.oathTime <= 0) return;
  cs.oathTime -= dt;
  if (cs.oathTime > 0) return;
  // the oath ends: a giant sword wave, stronger for every hit you blocked
  const vow = hasCard('vow_of_iron');
  const radius = 190 * run.stats.area * (vow ? 1.25 : 1);
  const damage = (25 + 4 * Math.min(cs.oathBlocks, 40)) * (vow ? 1.3 * cardMul('vow_of_iron', 'damage') : 1);
  damageInCircle(p.x, p.y, radius, damage, { color: HOLY, knock: 20 });
  spawnRing(p.x, p.y, radius, HOLY);
  spawnBurst(p.x, p.y, HOLY, 30, 220);
  run.shake = 8;
  if (hasCard('vengeance_waves')) {
    const count = 3 + cardExtraProjectiles('vengeance_waves');
    for (let i = 0; i < count; i++) {
      const target = nearestEnemy(p.x, p.y, 600);
      const a = (target ? Math.atan2(target.y - p.y, target.x - p.x) : 0) + (i - (count - 1) / 2) * 0.5;
      fireShot({
        x: p.x, y: p.y, vx: Math.cos(a) * 480, vy: Math.sin(a) * 480, r: 14, pierce: 999, life: 1,
        dmg: damage * 0.5 * cardMul('vengeance_waves', 'damage'), color: HOLY, kind: 'wave', tag: 'vengeance',
      });
    }
  }
}

/** Thorns: hurt everything close by when you take a hit. */
function thornsBurst(damageTaken: number): void {
  if (!hasCard('thorns')) return;
  const p = run.player, bramble = isEvolved('thorns');
  const damage = (4 + 0.3 * damageTaken) * cardMul('thorns', 'damage') * (bramble ? 2 : 1);
  damageInCircle(p.x, p.y, 70 * cardMul('thorns', 'effect'), damage, { noSteal: true, color: '#9fbf6a' });
  spawnRing(p.x, p.y, 70, '#9fbf6a');
}

/** The thrown shield bounces from enemy to enemy. */
function shieldToss(first: Enemy | null, bounces: number, damage: number): void {
  if (!first) return;
  const p = run.player;
  let from: Point = p, target: Enemy | null = first;
  const seen = new Set<Enemy>();
  for (let i = 0; i < bounces && target; i++) {
    seen.add(target);
    spawnLine(from.x, from.y, target.x, target.y, STEEL, 3);
    hitEnemy(target, damage, { tag: 'shield', color: STEEL });
    from = target;
    target = nearestEnemy(from.x, from.y, 200, (o) => !seen.has(o));
  }
}

/** Spinning Shields orbit you, hit enemies, and destroy enemy shots they touch. */
function updateSpinningShields(dt: number): void {
  const cs = state(), p = run.player;
  cs.shieldPositions = [];
  if (!hasCard('spinning_shields')) return;
  const aegis = isEvolved('spinning_shields');
  const count = (2 + cardExtraProjectiles('spinning_shields')) * (aegis ? 2 : 1);
  const radius = (aegis ? 75 : 55) * cardMul('spinning_shields', 'range');
  cs.shieldAngle += dt * 2.6 * cardMul('spinning_shields', 'speed');
  for (let i = 0; i < count; i++) {
    const a = cs.shieldAngle + (i * TAU) / count;
    const pos = { x: p.x + Math.cos(a) * radius, y: p.y + Math.sin(a) * radius };
    cs.shieldPositions.push(pos);
    for (const e of enemiesInRadius(pos.x, pos.y, 10)) {
      if ((e.orbCooldownUntil || 0) > run.time) continue;
      e.orbCooldownUntil = run.time + 0.5;
      hitEnemy(e, 6, { tag: 'shield', color: STEEL, knock: 8 });
    }
    for (const s of run.shots) {
      if (s.owner === 'enemy' && !s.dead && distSq(s, pos) < (s.r + 11) ** 2) {
        s.dead = true;
        spawnBurst(s.x, s.y, STEEL, 4, 60);
      }
    }
  }
}

/** Light of the Order: a holy beam on the toughest enemy nearby. */
function updateLightOfTheOrder(dt: number): void {
  const cs = state(), p = run.player;
  if (!hasCard('light_of_the_order')) return;
  cs.lightTimer -= dt;
  if (cs.lightTimer > 0) return;
  const judgment = isEvolved('light_of_the_order');
  cs.lightTimer = (judgment ? 5 : 10) / cardMul('light_of_the_order', 'speed');
  const targets = run.enemies
    .filter((e) => !e.dead && distSq(e, p) < 450 * 450)
    .sort((a, b) => (Number(b.boss) - Number(a.boss)) || (Number(b.elite) - Number(a.elite)) || (b.hp - a.hp))
    .slice(0, judgment ? 3 : 1);
  for (const e of targets) {
    hitEnemy(e, 40 * cardMul('light_of_the_order', 'damage') * (1 + 0.1 * run.wave), { color: HOLY, tag: 'beam' });
    spawnPillar(e.x, e.y, 26, 'rgba(255,242,168,0.7)');
  }
}
