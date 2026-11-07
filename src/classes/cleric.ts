// ============================================================ Cleric: holy light
import type { CardDef, Enemy, HitOptions, Point, Stats } from '../types';
import { COLOR, TAU, VIEW_H, VIEW_W } from '../core/constants';
import { ctx } from '../core/canvas';
import { distSq, randPick, randRange } from '../core/math';
import { cardExtraProjectiles, cardLevel, cardMul, hasCard, isEvolved, mouseWorld, run, showBanner } from '../core/state';
import { damageInCircle, healPlayer, hitEnemy } from '../world/combat';
import { addFloatingText, addTelegraph, schedule, spawnBurst, spawnPillar, spawnRing } from '../world/effects';
import { enemiesInRadius } from '../world/enemies';
import { fireShot } from '../world/projectiles';
import { addZone } from '../world/zones';
import { registerClass } from './registry';

const HOLY_COLOR = '#fff2a8';
const FAITH_MAX = 100;

interface ClericState {
  attackTimer: number;
  /** Fills on kills; at 100, Judgment strikes. */
  faith: number;
  interventionTime: number;
  pillarTimer: number;
  orbAngle: number;
  orbPositions: Point[];
  bellTimer: number;
  trailTimer: number;
  /** Enemies already healed-from by the current Radiant Step trail. */
  trailHealed: Set<Enemy>;
  guardianUsed: boolean;
}
const state = (): ClericState => run.classState as ClericState;

const CLERIC_CARDS: CardDef[] = [
  { id: 'devout', name: 'Devout', part: 'passive', desc: 'Faith fills 30% faster; Purify deals +10% more.', ups: ['speed', 'effect'] },
  { id: 'sacred_flame', name: 'Sacred Flame', part: 'strike', desc: 'Bolts leave burning holy ground.', ups: ['damage', 'range', 'duration'] },
  { id: 'twin_bolts', name: 'Twin Bolts', part: 'strike', desc: 'Fire 2 bolts at once.', ups: ['projectiles'] },
  { id: 'swift_prayer', name: 'Swift Prayer', part: 'strike', desc: 'Attack 25% faster.', ups: ['speed'] },
  { id: 'heavier_smite', name: 'Heavier Smite', part: 'heavy', desc: 'Smite hits 40% harder over a bigger area.', ups: ['damage', 'range'] },
  { id: 'echo_smite', name: 'Echo Smite', part: 'heavy', desc: 'Smite strikes again 1 s later.', ups: ['damage', 'effect'] },
  { id: 'healing_smite', name: 'Healing Smite', part: 'heavy', desc: 'Smite heals you for each enemy hit.', ups: ['heal'] },
  { id: 'blessed_path', name: 'Blessed Path', part: 'dash', desc: 'Radiant Step trail hurts and heals twice as much.', ups: ['damage', 'heal', 'duration'] },
  { id: 'holy_leap', name: 'Holy Leap', part: 'dash', desc: 'Dash farther and land with a burst of light.', ups: ['range', 'damage'] },
  { id: 'light_step', name: 'Light Step', part: 'dash', desc: 'Dash cooldown −20%. +1 charge at Lv5.', ups: ['speed'] },
  { id: 'greater_intervention', name: 'Greater Intervention', part: 'ultimate', desc: 'More pillars, and it lasts 2 s longer.', ups: ['damage', 'heal', 'duration'] },
  { id: 'wrath_of_heaven', name: 'Wrath of Heaven', part: 'ultimate', desc: 'Pillars deal +50% to undead and bosses.', ups: ['damage', 'effect'] },
  { id: 'afterglow', name: 'Afterglow', part: 'ultimate', desc: 'After Divine Intervention, regen 4 HP/s for 5 s.', ups: ['heal', 'duration'] },
  {
    id: 'guardian_angel', name: 'Guardian Angel', part: 'wild', desc: 'Once per wave, survive a killing blow with 1 HP.', ups: ['effect'],
    evo: { name: 'Seraph', desc: 'Survive with 50% HP and blast enemies away.', need: { card: 'afterglow' }, needText: 'Afterglow card' },
  },
  {
    id: 'holy_orbs', name: 'Holy Orbs', part: 'wild', desc: '2 orbs circle you and burn enemies (more vs undead).', ups: ['damage', 'projectiles', 'speed'],
    evo: { name: 'Sun Ring', desc: '6 bigger orbs with double damage.', need: { part: 'strike' }, needText: 'any Strike card' },
  },
  {
    id: 'falling_bell', name: 'Falling Bell', part: 'wild', desc: 'Every 10 s, a holy bell drops on the biggest crowd.', ups: ['damage', 'range', 'speed'],
    evo: { name: 'Cathedral Bells', desc: '3 bells every 6 s.', need: { part: 'heavy' }, needText: 'any Heavy Strike card' },
  },
];

registerClass({
  id: 'cleric',
  name: 'Cleric',
  role: 'Magic · Holy light',
  color: '#f2d47a',
  ultName: 'Divine Intervention',
  base: { hp: 120, moveSpeed: 135, armor: 2, luck: 0 },
  heavyCooldown: 2.0,
  ratings: { HP: 4, Speed: 2, Damage: 4, 'Attack speed': 2, Range: 3 },
  kit: [
    'Strike: Holy Bolt bursts on hit',
    'Heavy: Smite, a hammer from the sky',
    'Dash: Radiant Step leaves a healing trail',
    'Ultimate: Divine Intervention, full heal + pillars',
    'Passive: +25% damage to undead; kills fill Faith',
  ],
  keys: { lmb: 'Bolt', rmb: 'Smite', spc: 'Step', q: 'Divine' },
  favoredParts: ['strike', 'heavy'],
  cards: CLERIC_CARDS,

  init() {
    const initial: ClericState = {
      attackTimer: 0, faith: 0,
      interventionTime: 0, pillarTimer: 0,
      orbAngle: 0, orbPositions: [],
      bellTimer: 4,
      trailTimer: 0, trailHealed: new Set(),
      guardianUsed: false,
    };
    run.classState = initial;
  },

  onWaveStart() { state().guardianUsed = false; },

  modifyStats(stats: Stats) {
    if (hasCard('swift_prayer')) stats.attackSpeed *= 1.25 * cardMul('swift_prayer', 'speed');
    if (hasCard('light_step')) {
      stats.dashCooldown *= 0.8 / cardMul('light_step', 'speed');
      if (cardLevel('light_step') >= 5) stats.dashCharges += 1;
    }
  },

  /** Passive: bonus damage to undead; Wrath of Heaven pillars hit undead and bosses harder. */
  damageMod(e: Enemy, opts: HitOptions) {
    let mul = 1;
    if (e.undead) mul *= 1.25 + (hasCard('devout') ? 0.1 * cardMul('devout', 'effect') : 0);
    if (opts.tag === 'pillar' && hasCard('wrath_of_heaven') && (e.undead || e.boss)) mul *= 1 + 0.5 * cardMul('wrath_of_heaven', 'effect');
    return mul;
  },

  /** Holy Bolt: bursts on impact, splashing nearby enemies. */
  strike(dt: number, attacking: boolean) {
    const cs = state(), p = run.player;
    cs.attackTimer -= dt;
    if (!attacking || cs.attackTimer > 0) return;
    cs.attackTimer = 0.75 / run.stats.attackSpeed;
    const count = 1 + (hasCard('twin_bolts') ? 1 + cardExtraProjectiles('twin_bolts') : 0) + run.stats.extraProjectiles;
    const sacredFlame = hasCard('sacred_flame');
    for (let i = 0; i < count; i++) {
      const a = p.face + (i - (count - 1) / 2) * 0.17;
      fireShot({
        x: p.x, y: p.y, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, r: 6, dmg: 16, life: 1.3,
        color: HOLY_COLOR, kind: 'holy', tag: 'bolt',
        onHit: (_s, e) => holyBoltBurst(e, sacredFlame),
      });
    }
  },

  /** Smite: a hammer lands at the cursor (max 400 away) after a short delay. */
  heavy() {
    const p = run.player, aim = mouseWorld();
    const a = Math.atan2(aim.y - p.y, aim.x - p.x), reach = Math.min(400, Math.hypot(aim.x - p.x, aim.y - p.y));
    const x = p.x + Math.cos(a) * reach, y = p.y + Math.sin(a) * reach;
    const heavier = hasCard('heavier_smite');
    const radius = 70 * run.stats.area * (heavier ? 1.3 * cardMul('heavier_smite', 'range') : 1);
    const damage = 20 * 1.4 * (heavier ? 1.4 * cardMul('heavier_smite', 'damage') : 1);
    addTelegraph({ kind: 'circle', x, y, r: radius, dur: 0.25, color: COLOR.gold, friendly: true });
    const smite = (mult: number): void => {
      const hit = damageInCircle(x, y, radius, damage * mult, { heavy: true, tag: 'smite', color: HOLY_COLOR });
      spawnRing(x, y, radius, HOLY_COLOR);
      spawnBurst(x, y, HOLY_COLOR, 10, 120);
      if (hasCard('healing_smite') && hit.length) healPlayer(1.5 * cardMul('healing_smite', 'heal') * hit.length);
    };
    schedule(0.25, () => smite(1));
    if (hasCard('echo_smite')) schedule(1.25, () => smite(0.8 * cardMul('echo_smite', 'damage') * cardMul('echo_smite', 'effect')));
  },

  /** Radiant Step: leaves a trail of light that hurts enemies and heals once per enemy. */
  dash() {
    state().trailTimer = 0;
    state().trailHealed = new Set();
    return { dist: 130 * (hasCard('holy_leap') ? 1.4 * cardMul('holy_leap', 'range') : 1) };
  },
  onDashMove(dt: number) {
    const cs = state(), p = run.player;
    cs.trailTimer -= dt;
    if (cs.trailTimer > 0) return;
    cs.trailTimer = 0.03;
    const blessed = hasCard('blessed_path');
    addZone({
      kind: 'light', x: p.x, y: p.y, r: 16, color: 'rgba(255,242,168,0.28)',
      life: 1.5 * (blessed ? cardMul('blessed_path', 'duration') : 1),
      dps: 12 * (blessed ? 2 * cardMul('blessed_path', 'damage') : 1),
      onTick: (e) => {
        if (cs.trailHealed.has(e)) return;
        cs.trailHealed.add(e);
        healPlayer(blessed ? 2 * cardMul('blessed_path', 'heal') : 1, true);
      },
    });
  },
  onDashEnd() {
    if (!hasCard('holy_leap')) return;
    const p = run.player, radius = 60 * run.stats.area;
    damageInCircle(p.x, p.y, radius, 15 * cardMul('holy_leap', 'damage'), { color: HOLY_COLOR });
    spawnRing(p.x, p.y, radius, HOLY_COLOR);
  },

  /** Divine Intervention: full heal, then pillars of light rain on visible enemies. */
  ult() {
    const cs = state(), p = run.player;
    p.hp = run.stats.maxHp;
    addFloatingText(p.x, p.y - 30, 'full heal', COLOR.green, 13);
    cs.interventionTime = 5 + (hasCard('greater_intervention') ? 2 * cardMul('greater_intervention', 'duration') : 0);
    cs.pillarTimer = 0;
  },

  update(dt: number) {
    updateIntervention(dt);
    updateHolyOrbs(dt);
    updateFallingBell(dt);
  },

  /** Kills fill Faith; when full, Judgment strikes the toughest nearby enemy. */
  onKill() {
    const cs = state(), p = run.player;
    cs.faith += 4 * (hasCard('devout') ? 1.3 * cardMul('devout', 'speed') : 1);
    if (cs.faith < FAITH_MAX) return;
    cs.faith = 0;
    let target: Enemy | null = null, bestHp = -1;
    for (const e of run.enemies) {
      if (!e.dead && distSq(e, p) < 360 * 360 && e.hp > bestHp) { bestHp = e.hp; target = e; }
    }
    if (target) {
      pillar(target.x, target.y, 60 * (1 + 0.1 * run.wave), 60);
      addFloatingText(target.x, target.y - 30, 'Judgment', COLOR.gold, 13);
    }
  },

  /** Guardian Angel: once per wave, survive a killing blow. */
  onLethal() {
    const cs = state();
    if (!hasCard('guardian_angel') || cs.guardianUsed) return false;
    const p = run.player;
    cs.guardianUsed = true;
    if (isEvolved('guardian_angel')) {
      p.hp = run.stats.maxHp * 0.5;
      damageInCircle(p.x, p.y, 150, 40, { color: HOLY_COLOR });
      spawnRing(p.x, p.y, 150, HOLY_COLOR);
    } else {
      p.hp = 1;
    }
    p.iframes = 1 * cardMul('guardian_angel', 'effect');
    showBanner('Guardian Angel!', 1.4);
    return true;
  },

  draw() {
    const cs = state();
    for (const o of cs.orbPositions) {
      ctx.fillStyle = HOLY_COLOR;
      ctx.beginPath(); ctx.arc(o.x, o.y, 6, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,242,168,0.4)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    if (cs.interventionTime > 0) {
      const p = run.player;
      ctx.strokeStyle = 'rgba(255,242,168,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, 24, 0, TAU); ctx.stroke();
    }
  },

  resource() {
    const faith = state().faith;
    return { label: 'Faith', value: Math.round(faith), frac: faith / FAITH_MAX, color: HOLY_COLOR };
  },
});

function pillar(x: number, y: number, damage: number, radius: number): void {
  damageInCircle(x, y, radius, damage, { tag: 'pillar', color: HOLY_COLOR });
  spawnPillar(x, y, radius, HOLY_COLOR);
}

/** Holy Bolt impact: splash nearby enemies, optionally leave Sacred Flame ground. */
function holyBoltBurst(e: Enemy, sacredFlame: boolean): void {
  const radius = 36 * run.stats.area;
  for (const o of enemiesInRadius(e.x, e.y, radius)) if (o !== e) hitEnemy(o, 8, { color: HOLY_COLOR, noCrit: true });
  spawnRing(e.x, e.y, radius, 'rgba(255,242,168,0.8)');
  if (sacredFlame) {
    addZone({
      kind: 'holyfire', x: e.x, y: e.y, r: 30 * run.stats.area * cardMul('sacred_flame', 'range'), color: 'rgba(255,200,90,0.28)',
      life: 2 * cardMul('sacred_flame', 'duration'), dps: 8 * cardMul('sacred_flame', 'damage'),
    });
  }
}

function updateIntervention(dt: number): void {
  const cs = state(), p = run.player;
  if (cs.interventionTime <= 0) return;
  cs.interventionTime -= dt;
  cs.pillarTimer -= dt;
  const greater = hasCard('greater_intervention');
  if (cs.pillarTimer <= 0) {
    cs.pillarTimer = 0.4 * (greater ? 0.6 : 1);
    const visible = run.enemies.filter((e) => !e.dead && Math.abs(e.x - p.x) < VIEW_W / 2 && Math.abs(e.y - p.y) < VIEW_H / 2);
    if (visible.length) {
      const t = randPick(visible);
      pillar(t.x, t.y, 30 * (greater ? cardMul('greater_intervention', 'damage') : 1) * (t.undead ? 2 : 1) * (1 + 0.1 * run.wave), 46);
    }
  }
  if (cs.interventionTime <= 0 && hasCard('afterglow')) {
    p.regenBuff = 4 * cardMul('afterglow', 'heal');
    p.regenBuffTime = 5 * cardMul('afterglow', 'duration');
  }
}

function updateHolyOrbs(dt: number): void {
  const cs = state(), p = run.player;
  cs.orbPositions = [];
  if (!hasCard('holy_orbs')) return;
  const sunRing = isEvolved('holy_orbs');
  const count = sunRing ? 6 : 2 + cardExtraProjectiles('holy_orbs'), radius = sunRing ? 95 : 70;
  cs.orbAngle += dt * 2.6 * cardMul('holy_orbs', 'speed');
  for (let i = 0; i < count; i++) {
    const a = cs.orbAngle + (i * TAU) / count, orb = { x: p.x + Math.cos(a) * radius, y: p.y + Math.sin(a) * radius };
    cs.orbPositions.push(orb);
    for (const e of enemiesInRadius(orb.x, orb.y, 9)) {
      if ((e.orbCooldownUntil || 0) > run.time) continue;
      e.orbCooldownUntil = run.time + 0.45;
      hitEnemy(e, 8 * cardMul('holy_orbs', 'damage') * (sunRing ? 2 : 1) * (e.undead ? 1.5 : 1), { tag: 'orb', color: HOLY_COLOR });
    }
  }
}

function updateFallingBell(dt: number): void {
  const cs = state(), p = run.player;
  if (!hasCard('falling_bell')) return;
  cs.bellTimer -= dt;
  if (cs.bellTimer > 0) return;
  const cathedral = isEvolved('falling_bell');
  cs.bellTimer = (cathedral ? 6 : 10) / cardMul('falling_bell', 'speed');
  const candidates = run.enemies.filter((e) => !e.dead && distSq(e, p) < 360 * 360);
  for (let i = 0; i < (cathedral ? 3 : 1); i++) {
    let tx = p.x + randRange(-150, 150), ty = p.y + randRange(-150, 150);
    if (candidates.length) {
      const crowd = densestOf(candidates, 8, 80);
      tx = crowd.x;
      ty = crowd.y;
    }
    const radius = 80 * run.stats.area * cardMul('falling_bell', 'range');
    addTelegraph({ kind: 'circle', x: tx, y: ty, r: radius, dur: 0.6, color: COLOR.gold, friendly: true });
    schedule(0.6, () => {
      damageInCircle(tx, ty, radius, 40 * cardMul('falling_bell', 'damage') * (1 + 0.1 * run.wave), { color: HOLY_COLOR });
      spawnRing(tx, ty, radius, HOLY_COLOR);
      spawnBurst(tx, ty, COLOR.gold, 14, 140);
      run.shake = Math.min(8, run.shake + 2);
    });
  }
}

/** Sample `tries` random candidates; return the one with the most enemies within `radius`. */
function densestOf(candidates: Enemy[], tries: number, radius: number): Enemy {
  let best = candidates[0], bestCount = -1;
  for (let k = 0; k < tries; k++) {
    const c = randPick(candidates), count = enemiesInRadius(c.x, c.y, radius).length;
    if (count > bestCount) { bestCount = count; best = c; }
  }
  return best;
}
