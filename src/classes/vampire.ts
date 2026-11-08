// ============================================================ Vampire: melee sustain
import type { CardDef, DashOverride, Enemy, HitOptions, Point, Stats } from '../types';
import { ARENA_H, ARENA_W, COLOR, TAU } from '../core/constants';
import { ctx } from '../core/canvas';
import { clamp, degToRad, distSq, randPick, randRange } from '../core/math';
import { cardExtraProjectiles, cardLevel, cardMul, hasCard, isEvolved, recalcStats, run } from '../core/state';
import { applyBleed, damageInArc, damageInCircle, healPlayer, hitEnemy } from '../world/combat';
import { addFloatingText, addTelegraph, schedule, spawnBurst, spawnLine, spawnRing, spawnSlash } from '../world/effects';
import { enemiesInRadius, nearestEnemy } from '../world/enemies';
import { fireShot } from '../world/projectiles';
import { addZone } from '../world/zones';
import { registerClass } from './registry';

const VAMPIRE_RED = '#ff5a6e';
const VAMPIRE_DEEP_RED = '#ff2e4d';
const SHIELD_CAP_FRAC = 0.3;
const REND_ARC = degToRad(130);

interface VampireState {
  combo: number;
  attackTimer: number;
  /** Blood Shield: overheal that absorbs damage. */
  shield: number;
  moonTime: number;
  moonMax: number;
  batAngle: number;
  batPositions: Point[];
  rainTimer: number;
  gazeTimer: number;
  /** Enemies already hit by the current Mist Step. */
  mistHit: Set<Enemy>;
  trailTimer: number;
  /** Frenzy (mutation): attack-speed stacks, and seconds until they fade. */
  frenzy: number;
  frenzyTimer: number;
  /** Eclipse (mutation): time to the next drain tick. */
  drainTimer: number;
}
const state = (): VampireState => run.classState as VampireState;

const VAMPIRE_CARDS: CardDef[] = [
  { id: 'crimson_feast', name: 'Crimson Feast', part: 'passive', desc: '+1% lifesteal, and every kill heals you 1 HP.', ups: ['heal', 'effect'] },
  { id: 'razor_claws', name: 'Razor Claws', part: 'strike', desc: 'Blood Claws deal 25% more damage, and the 3rd hit of the combo swings wider.', ups: ['damage', 'range', 'speed'] },
  { id: 'bleeding_claws', name: 'Bleeding Claws', part: 'strike', desc: 'Blood Claws make enemies bleed for 3 s.', ups: ['damage', 'duration'] },
  { id: 'hemorrhage', name: 'Hemorrhage', part: 'strike', desc: 'Critical hits with Blood Claws burst in blood: nearby enemies take damage and you heal.', ups: ['heal', 'effect'] },
  { id: 'rending_lunge', name: 'Rending Lunge', part: 'heavy', desc: 'Crimson Rend lunges twice as far and makes enemies bleed.', ups: ['damage', 'range', 'duration'] },
  { id: 'feeding_rend', name: 'Feeding Rend', part: 'heavy', desc: 'Crimson Rend heals an extra 1% of your max HP for each enemy hit.', ups: ['heal', 'effect'] },
  { id: 'twin_rend', name: 'Twin Rend', part: 'heavy', desc: 'Crimson Rend strikes a second time right after the first.', ups: ['damage', 'projectiles'] },
  { id: 'mist_form', name: 'Mist Form', part: 'dash', desc: 'Mist Step deals double damage and heals double for each enemy you pass through.', ups: ['damage', 'heal', 'range'] },
  { id: 'blood_trail', name: 'Blood Trail', part: 'dash', desc: 'Mist Step leaves a blood trail that hurts enemies standing in it.', ups: ['damage', 'duration'] },
  { id: 'swift_mist', name: 'Swift Mist', part: 'dash', desc: 'Mist Step recharges 20% faster. At Lv5, gain a 2nd dash.', ups: ['speed'] },
  { id: 'hunger_moon', name: 'Hunger Moon', part: 'ultimate', desc: 'Blood Moon lasts 3 s longer, with ×4 lifesteal instead of ×3.', ups: ['heal', 'duration'] },
  { id: 'red_moon_burst', name: 'Red Moon Burst', part: 'ultimate', desc: 'When Blood Moon ends, the Blood Shield explosion is bigger and stronger.', ups: ['damage', 'range'] },
  { id: 'thrall_moon', name: 'Thrall Moon', part: 'ultimate', desc: 'During Blood Moon, enemies you kill rise as thralls and fight for you for 5 s.', ups: ['projectiles', 'duration'] },
  // mutations: each changes how an ability works; only one per ability in a run
  { id: 'blood_whip', name: 'Blood Whip', part: 'strike', mutation: true, desc: 'Blood Claws become a long blood whip that hits everything in a line and pulls enemies in.', ups: ['damage', 'range', 'speed'] },
  { id: 'frenzy', name: 'Frenzy', part: 'strike', mutation: true, desc: 'Each claw hit gives +6% attack speed, up to 10 stacks. Stop hitting for 2 s and it fades.', ups: ['speed', 'duration'] },
  { id: 'blood_lance', name: 'Blood Lance', part: 'heavy', mutation: true, desc: 'Crimson Rend hurls a blood lance that pierces every enemy in a line and heals you per hit.', ups: ['damage', 'heal', 'projectiles'] },
  { id: 'sanguine_nova', name: 'Sanguine Nova', part: 'heavy', mutation: true, desc: 'Crimson Rend costs 6% HP and bursts in a big blood nova that heals 2% HP per enemy hit.', ups: ['damage', 'range', 'heal'] },
  { id: 'bat_scatter', name: 'Bat Scatter', part: 'dash', mutation: true, desc: 'Mist Step is shorter, but you burst into 4 bats that hunt enemies and heal you when they bite.', ups: ['damage', 'projectiles', 'heal'] },
  { id: 'crimson_pounce', name: 'Crimson Pounce', part: 'dash', mutation: true, desc: 'Mist Step leaps further and lands with a claw slam that makes nearby enemies bleed.', ups: ['damage', 'range'] },
  { id: 'eclipse', name: 'Eclipse', part: 'ultimate', mutation: true, desc: 'Blood Moon becomes a draining aura instead of ×3 lifesteal: nearby enemies bleed HP into you.', ups: ['damage', 'range', 'heal'] },
  { id: 'night_lord', name: 'Night Lord', part: 'ultimate', mutation: true, desc: 'Blood Moon transforms you instead of ×3 lifesteal: +30% damage, attack speed and move speed.', ups: ['damage', 'speed'] },
  {
    id: 'bat_swarm', name: 'Bat Swarm', part: 'wild', desc: '2 bats circle you and bite enemies; their bites heal you.', ups: ['damage', 'projectiles', 'speed'],
    evo: { name: 'Bat Storm', desc: 'Twice as many bats, double damage, wider circle.', need: { part: 'dash' }, needText: 'any Dash card' },
  },
  {
    id: 'blood_rain', name: 'Blood Rain', part: 'wild', desc: 'Every 6 s, blood drops fall on nearby enemies; each hit heals you.', ups: ['damage', 'projectiles', 'heal'],
    evo: { name: 'Red Monsoon', desc: 'Twice as many drops, every 3 s.', need: { relic: 'heart' }, needText: 'Heart Gem relic' },
  },
  {
    id: 'gaze_of_the_count', name: 'Gaze of the Count', part: 'wild', desc: 'Every 8 s, the strongest nearby enemy is charmed and fights for you for 3 s.', ups: ['duration', 'speed'],
    evo: { name: 'Thrall Master', desc: 'Charm 2 enemies at once, for 6 s.', need: { card: 'thrall_moon' }, needText: 'Thrall Moon card' },
  },
];

registerClass({
  id: 'vampire',
  name: 'Vampire',
  role: 'Melee · Sustain',
  color: '#d0384f',
  ultName: 'Blood Moon',
  base: { hp: 100, moveSpeed: 175, armor: 0, luck: 0, lifesteal: 0.04 },
  heavyCooldown: 1.0,
  ratings: { HP: 3, Speed: 4, Damage: 3, 'Attack speed': 4, Range: 1 },
  kit: [
    'Strike: 3-hit claw combo',
    'Heavy: lunging Crimson Rend that heals',
    'Dash: Mist Step through enemies',
    'Ultimate: Blood Moon, triple lifesteal',
    'Passive: overheal becomes a Blood Shield',
  ],
  keys: { lmb: 'Claws', rmb: 'Rend', spc: 'Mist', q: 'Moon' },
  abilities: { strike: 'Blood Claws', heavy: 'Crimson Rend', dash: 'Mist Step', ultimate: 'Blood Moon', passive: 'Blood Thirst' },
  favoredParts: ['dash', 'strike'],
  cards: VAMPIRE_CARDS,

  init() {
    const initial: VampireState = {
      combo: 0, attackTimer: 0,
      shield: 0,
      moonTime: 0, moonMax: 1,
      batAngle: 0, batPositions: [],
      rainTimer: 3, gazeTimer: 4,
      mistHit: new Set(), trailTimer: 0,
      frenzy: 0, frenzyTimer: 0, drainTimer: 0,
    };
    run.classState = initial;
  },

  modifyStats(stats: Stats) {
    if (hasCard('crimson_feast')) stats.lifesteal += 0.01 * cardMul('crimson_feast', 'effect');
    if (hasCard('swift_mist')) {
      stats.dashCooldown *= 0.8 / cardMul('swift_mist', 'speed');
      if (cardLevel('swift_mist') >= 5) stats.dashCharges += 1;
    }
    if (hasCard('razor_claws')) stats.attackSpeed *= cardMul('razor_claws', 'speed');
    const cs = run.classState as VampireState | null;
    if (!cs) return;
    if (hasCard('frenzy')) stats.attackSpeed *= 1 + 0.06 * cardMul('frenzy', 'speed') * cs.frenzy;
    if (hasCard('night_lord') && cs.moonTime > 0) {
      stats.damage *= 1.3 * cardMul('night_lord', 'damage');
      stats.attackSpeed *= 1.3 * cardMul('night_lord', 'speed');
      stats.moveSpeed *= 1.3;
    }
  },

  // ---------------------------------------------------------- Blood Shield (overheal)

  lifestealMul() {
    // the ultimate mutations trade the triple lifesteal for something else
    if (state().moonTime <= 0 || hasCard('eclipse') || hasCard('night_lord')) return 1;
    return hasCard('hunger_moon') ? 4 * cardMul('hunger_moon', 'heal') : 3;
  },
  onHeal(amount: number, silent?: boolean) {
    const p = run.player, cs = state(), room = run.stats.maxHp - p.hp;
    if (amount <= room) p.hp += amount;
    else {
      p.hp = run.stats.maxHp;
      cs.shield = Math.min(shieldCap(), cs.shield + (amount - room));
    }
    if (!silent && amount >= 1) addFloatingText(p.x, p.y - 26, '+' + Math.round(amount), COLOR.green, 11);
  },
  absorb(damage: number) {
    const cs = state();
    if (cs.shield > 0) {
      const absorbed = Math.min(cs.shield, damage);
      cs.shield -= absorbed;
      damage -= absorbed;
    }
    return damage;
  },

  // ---------------------------------------------------------- abilities

  strike(dt: number, attacking: boolean) {
    const cs = state(), p = run.player;
    cs.attackTimer -= dt;
    if (!attacking || cs.attackTimer > 0) return;
    if (hasCard('blood_whip')) { bloodWhip(); cs.attackTimer = 0.42 / run.stats.attackSpeed; return; }
    const finisher = cs.combo === 2;
    let radius = (finisher ? 54 : 46) * run.stats.area;
    const arc = degToRad(finisher ? 140 : 100);
    const damage = (finisher ? 14 : 10) * clawDamageMul();
    if (hasCard('razor_claws') && finisher) radius *= 1.2 * cardMul('razor_claws', 'range');
    const hit = damageInArc(p.x, p.y, p.face, radius, arc, damage, { tag: 'claw' });
    clawBleed(hit);
    if (hasCard('frenzy') && hit.length) addFrenzy();
    spawnSlash(p.x, p.y, p.face, radius, arc, VAMPIRE_RED, finisher ? 6 : 4);
    cs.combo = (cs.combo + 1) % 3;
    cs.attackTimer = 0.3 / run.stats.attackSpeed;
  },

  onCrit(e: Enemy, opts: HitOptions) {
    if (opts.tag !== 'claw' || !hasCard('hemorrhage')) return;
    damageInCircle(e.x, e.y, 50, 4, { tag: 'burst', color: VAMPIRE_RED, noCrit: true });
    healPlayer(1.5 * cardMul('hemorrhage', 'heal') * cardMul('hemorrhage', 'effect'), true);
    spawnBurst(e.x, e.y, '#c2334a', 8, 100);
  },

  /** Crimson Rend: lunge forward, then a wide claw that heals per enemy hit. Mutations: Blood Lance, Sanguine Nova. */
  heavy() {
    const p = run.player;
    const extra = hasCard('twin_rend') ? 1 + cardExtraProjectiles('twin_rend') : 0;
    if (hasCard('blood_lance')) { throwLances(1 + cardExtraProjectiles('blood_lance') + extra); return; }
    if (hasCard('sanguine_nova')) {
      sanguineNova(1, true);
      for (let i = 1; i <= extra; i++) schedule(0.2 * i, () => sanguineNova(0.8, false));
      return;
    }
    const lunge = hasCard('rending_lunge') ? 100 * cardMul('rending_lunge', 'range') : 50;
    const a = p.face;
    p.x = clamp(p.x + Math.cos(a) * lunge, p.r, ARENA_W - p.r);
    p.y = clamp(p.y + Math.sin(a) * lunge, p.r, ARENA_H - p.r);
    p.iframes = Math.max(p.iframes, 0.12);
    crimsonRend(1);
    if (hasCard('twin_rend')) {
      const extra = 1 + cardExtraProjectiles('twin_rend');
      for (let i = 1; i <= extra; i++) schedule(0.15 * i, () => crimsonRend(0.8));
    }
  },

  /** Mist Step: pass through enemies, damaging and healing once per enemy. */
  dash() {
    state().mistHit = new Set();
    state().trailTimer = 0;
    if (hasCard('bat_scatter')) releaseBats();
    return mistStepShape();
  },
  onDashEnd() {
    if (hasCard('crimson_pounce')) pounceLanding();
  },
  dashShape: () => mistStepShape(),
  onDashMove(dt: number) {
    const p = run.player, cs = state(), mist = hasCard('mist_form');
    for (const e of enemiesInRadius(p.x, p.y, 18 * (mist ? cardMul('mist_form', 'range') : 1))) {
      if (cs.mistHit.has(e)) continue;
      cs.mistHit.add(e);
      hitEnemy(e, 6 * (mist ? 2 * cardMul('mist_form', 'damage') : 1), { tag: 'mist', color: '#ff9fb0' });
      healPlayer(1 * (mist ? 2 * cardMul('mist_form', 'heal') : 1), true);
    }
    if (hasCard('blood_trail')) {
      cs.trailTimer -= dt;
      if (cs.trailTimer <= 0) {
        cs.trailTimer = 0.03;
        addZone({
          kind: 'pool', x: p.x, y: p.y, r: 18, color: 'rgba(200,30,60,0.32)',
          life: 2 * cardMul('blood_trail', 'duration'), dps: 10 * cardMul('blood_trail', 'damage'),
        });
      }
    }
  },

  /** Blood Moon: boosted lifesteal and shield cap, then the shield explodes. */
  ult() {
    const cs = state();
    cs.moonTime = 8 + (hasCard('hunger_moon') ? 3 * cardMul('hunger_moon', 'duration') : 0);
    cs.moonMax = cs.moonTime;
    if (hasCard('night_lord')) recalcStats();
  },

  update(dt: number) {
    const cs = state();
    if (cs.frenzyTimer > 0) {
      cs.frenzyTimer -= dt;
      if (cs.frenzyTimer <= 0) { cs.frenzy = 0; recalcStats(); }
    }
    updateEclipse(dt);
    updateBloodMoon(dt);
    updateBatSwarm(dt);
    updateBloodRain(dt);
    updateGaze(dt);
    updateThralls(dt);
  },

  onKill(e: Enemy) {
    if (hasCard('crimson_feast')) healPlayer(cardMul('crimson_feast', 'heal'), true);
    if (state().moonTime > 0 && hasCard('thrall_moon')) {
      const maxThralls = 4 + cardExtraProjectiles('thrall_moon');
      if (run.allies.filter((m) => m.kind === 'thrall').length < maxThralls) {
        run.allies.push({
          kind: 'thrall', x: e.x, y: e.y, attackTimer: 0,
          life: 5 * cardMul('thrall_moon', 'duration'), damage: 8 * (1 + 0.15 * run.wave),
        });
      }
    }
  },

  // ---------------------------------------------------------- drawing

  draw() {
    const cs = state(), p = run.player;
    for (const b of cs.batPositions) {
      ctx.fillStyle = '#b48ae0';
      ctx.beginPath();
      ctx.moveTo(b.x - 7, b.y - 2); ctx.lineTo(b.x, b.y + 3); ctx.lineTo(b.x + 7, b.y - 2); ctx.lineTo(b.x, b.y - 1);
      ctx.closePath();
      ctx.fill();
    }
    for (const m of run.allies) {
      if (m.kind !== 'thrall') continue;
      ctx.fillStyle = '#ff9fb0';
      ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.arc(m.x, m.y, 8, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (cs.moonTime > 0 && hasCard('eclipse')) {
      const r = eclipseRadius();
      ctx.fillStyle = 'rgba(120,10,30,0.14)';
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,46,77,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, r - 4 + Math.sin(run.time * 4) * 3, 0, TAU); ctx.stroke();
    }
    if (cs.moonTime > 0 && hasCard('night_lord')) {
      ctx.fillStyle = 'rgba(255,46,77,0.16)';
      ctx.beginPath(); ctx.arc(p.x, p.y, 30 + Math.sin(run.time * 10) * 3, 0, TAU); ctx.fill();
    }
    // Frenzy stacks: red sparks circling you
    for (let i = 0; i < cs.frenzy; i++) {
      const a = run.time * 5 + (i * TAU) / 10;
      ctx.fillStyle = VAMPIRE_RED;
      ctx.fillRect(p.x + Math.cos(a) * 21 - 1.5, p.y + Math.sin(a) * 21 - 1.5, 3, 3);
    }
    if (cs.moonTime > 0) {
      ctx.strokeStyle = 'rgba(255,46,77,0.5)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, 26 + Math.sin(run.time * 6) * 2, 0, TAU); ctx.stroke();
    }
    if (cs.shield > 0) {
      ctx.strokeStyle = 'rgba(255,120,140,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, 17, 0, TAU * Math.min(1, cs.shield / (run.stats.maxHp * SHIELD_CAP_FRAC))); ctx.stroke();
    }
  },

  /** Blood Shield sliver on top of the HP bar. */
  drawHpOverlay(x: number, y: number, w: number) {
    const shield = state().shield;
    if (shield <= 0) return;
    ctx.fillStyle = 'rgba(255,170,185,0.9)';
    ctx.fillRect(x, y, w * Math.min(1, shield / run.stats.maxHp), 4);
  },

  resource() {
    const shield = state().shield;
    return { label: 'Blood Shield', value: Math.round(shield), frac: Math.min(1, shield / (run.stats.maxHp * SHIELD_CAP_FRAC)), color: VAMPIRE_RED };
  },
});

/**
 * How far Mist Step goes: Bat Scatter is short, Crimson Pounce is a long leap. Used by both `dash` and
 * `dashShape`, so online prediction moves the same way.
 */
function mistStepShape(): DashOverride {
  const range = hasCard('mist_form') ? cardMul('mist_form', 'range') : 1;
  if (hasCard('bat_scatter')) return { dist: 90 * range };
  if (hasCard('crimson_pounce')) return { dist: 190 * range * cardMul('crimson_pounce', 'range'), dur: 0.22 };
  return { dist: 140 * range };
}

/** Razor Claws' damage bonus, shared by every form of the Strike. */
const clawDamageMul = (): number => (hasCard('razor_claws') ? 1.25 * cardMul('razor_claws', 'damage') : 1);

/** Bleeding Claws: enemies hit by any form of the Strike start bleeding. */
function clawBleed(hit: Enemy[]): void {
  if (!hasCard('bleeding_claws')) return;
  for (const e of hit) applyBleed(e, 3 * cardMul('bleeding_claws', 'damage'), 3 * cardMul('bleeding_claws', 'duration'));
}

/** Blood Whip (mutation): a long lash along your aim that pulls everything it hits toward you. */
function bloodWhip(): void {
  const p = run.player, c = Math.cos(p.face), s = Math.sin(p.face);
  const len = 150 * run.stats.area * cardMul('blood_whip', 'range') * (hasCard('razor_claws') ? cardMul('razor_claws', 'range') : 1);
  const ex = p.x + c * len, ey = p.y + s * len, damage = 9 * clawDamageMul() * cardMul('blood_whip', 'damage');
  const hit: Enemy[] = [];
  for (const e of enemiesInRadius((p.x + ex) / 2, (p.y + ey) / 2, len / 2)) {
    const along = (e.x - p.x) * c + (e.y - p.y) * s, side = Math.abs(-(e.x - p.x) * s + (e.y - p.y) * c);
    if (along <= 0 || along >= len || side >= e.r + 10) continue;
    hitEnemy(e, damage, { tag: 'claw', knock: 12, knockAngle: Math.atan2(p.y - e.y, p.x - e.x) });
    hit.push(e);
  }
  clawBleed(hit);
  spawnLine(p.x, p.y, ex, ey, VAMPIRE_RED, 4);
}

/** Frenzy: one more stack (max 10); the stacks fade 2 s after your last hit. */
function addFrenzy(): void {
  const cs = state();
  cs.frenzyTimer = 2 * cardMul('frenzy', 'duration');
  if (cs.frenzy < 10) { cs.frenzy++; recalcStats(); }
}

/** Crimson Rend's damage, with the Heavy cards that boost it. */
function rendDamage(mult: number): number {
  let damage = 10 * 0.55 * mult * 2.2;
  if (hasCard('rending_lunge')) damage *= 1.3 * cardMul('rending_lunge', 'damage');
  if (hasCard('twin_rend')) damage *= cardMul('twin_rend', 'damage');
  return damage;
}

/** Healing per enemy hit by a Crimson Rend (more with Feeding Rend). */
function rendHealPerHit(): number {
  let heal = 0.01 * run.stats.maxHp;
  if (hasCard('feeding_rend')) heal += 0.01 * run.stats.maxHp * cardMul('feeding_rend', 'heal') * cardMul('feeding_rend', 'effect');
  return heal;
}

/** Blood Lance (mutation): piercing lances along your aim; each enemy pierced heals you. */
function throwLances(count: number): void {
  const p = run.player, damage = rendDamage(1.1) * cardMul('blood_lance', 'damage');
  const heal = rendHealPerHit() * 0.8 * cardMul('blood_lance', 'heal');
  for (let i = 0; i < count; i++) {
    const a = p.face + (i - (count - 1) / 2) * 0.14;
    fireShot({
      x: p.x, y: p.y, vx: Math.cos(a) * 650, vy: Math.sin(a) * 650, r: 6, pierce: 99, heavy: true,
      dmg: damage, life: 0.55, color: VAMPIRE_DEEP_RED, kind: 'heavybolt', tag: 'rend',
      onHit: (_shot, e) => {
        healPlayer(heal, true);
        if (hasCard('rending_lunge')) applyBleed(e, 4, 3 * cardMul('rending_lunge', 'duration'));
      },
    });
  }
}

/** Sanguine Nova (mutation): pay 6% max HP (never below 1), then a blood nova that heals per enemy hit. */
function sanguineNova(mult: number, pay: boolean): void {
  const p = run.player;
  if (pay) {
    const cost = Math.min(p.hp - 1, run.stats.maxHp * 0.06);
    if (cost > 0) { p.hp -= cost; addFloatingText(p.x, p.y - 26, '-' + Math.round(cost), VAMPIRE_DEEP_RED, 11); }
  }
  const radius = 120 * run.stats.area * cardMul('sanguine_nova', 'range');
  const hit = damageInCircle(p.x, p.y, radius, rendDamage(mult) * 1.6 * cardMul('sanguine_nova', 'damage'), { heavy: true, tag: 'rend', color: VAMPIRE_RED });
  if (hit.length) healPlayer((0.02 * run.stats.maxHp * cardMul('sanguine_nova', 'heal') + rendHealPerHit() - 0.01 * run.stats.maxHp) * hit.length);
  if (hasCard('rending_lunge')) for (const e of hit) applyBleed(e, 4, 3 * cardMul('rending_lunge', 'duration'));
  spawnRing(p.x, p.y, radius, VAMPIRE_DEEP_RED);
  spawnBurst(p.x, p.y, VAMPIRE_DEEP_RED, 18, 180);
}

/** Bat Scatter (mutation): bats fan out from you and home in on enemies; each bite heals. */
function releaseBats(): void {
  const p = run.player, count = 4 + cardExtraProjectiles('bat_scatter');
  const damage = 8 * cardMul('bat_scatter', 'damage') * (hasCard('mist_form') ? cardMul('mist_form', 'damage') : 1);
  for (let i = 0; i < count; i++) {
    const a = p.face + ((i + 0.5) / count - 0.5) * Math.PI * 1.4;
    fireShot({
      x: p.x, y: p.y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, r: 4, home: 7,
      dmg: damage, life: 1.6, color: '#d9a2ff', tag: 'bat',
      onHit: () => healPlayer(cardMul('bat_scatter', 'heal'), true),
    });
  }
}

/** Crimson Pounce (mutation): the leap lands with a claw slam; everything nearby starts bleeding. */
function pounceLanding(): void {
  const p = run.player, radius = 70 * run.stats.area * cardMul('crimson_pounce', 'range');
  const damage = 16 * cardMul('crimson_pounce', 'damage') * (hasCard('mist_form') ? cardMul('mist_form', 'damage') : 1);
  const hit = damageInCircle(p.x, p.y, radius, damage, { tag: 'claw', color: VAMPIRE_RED });
  for (const e of hit) applyBleed(e, 4, 3);
  if (hit.length) healPlayer(hit.length, true);
  spawnRing(p.x, p.y, radius, VAMPIRE_RED);
  spawnBurst(p.x, p.y, VAMPIRE_DEEP_RED, 10, 120);
}

const eclipseRadius = (): number => 150 * run.stats.area * cardMul('eclipse', 'range');

/** Eclipse (mutation): during Blood Moon, enemies near you lose HP every 0.25 s and 30% of it heals you. */
function updateEclipse(dt: number): void {
  const cs = state(), p = run.player;
  if (cs.moonTime <= 0 || !hasCard('eclipse')) return;
  cs.drainTimer -= dt;
  if (cs.drainTimer > 0) return;
  cs.drainTimer = 0.25;
  let drained = 0;
  for (const e of enemiesInRadius(p.x, p.y, eclipseRadius())) {
    drained += hitEnemy(e, 16 * 0.25 * cardMul('eclipse', 'damage'), { dot: true, silent: true, noSteal: true });
  }
  if (drained > 0) healPlayer(drained * 0.3 * cardMul('eclipse', 'heal'), true);
}

function shieldCap(): number {
  return run.stats.maxHp * (state().moonTime > 0 ? 1 : SHIELD_CAP_FRAC);
}

function crimsonRend(mult: number): void {
  const p = run.player;
  const radius = 62 * run.stats.area * (hasCard('rending_lunge') ? cardMul('rending_lunge', 'range') : 1);
  const hit = damageInArc(p.x, p.y, p.face, radius, REND_ARC, rendDamage(mult), { heavy: true, tag: 'rend', color: VAMPIRE_RED });
  if (hit.length) healPlayer(rendHealPerHit() * hit.length);
  if (hasCard('rending_lunge')) for (const e of hit) applyBleed(e, 4, 3 * cardMul('rending_lunge', 'duration'));
  spawnSlash(p.x, p.y, p.face, radius, REND_ARC, VAMPIRE_DEEP_RED, 7);
}

function updateBloodMoon(dt: number): void {
  const cs = state(), p = run.player;
  if (cs.moonTime <= 0) return;
  cs.moonTime -= dt;
  if (cs.moonTime > 0) return;
  const burst = hasCard('red_moon_burst');
  const radius = 160 * run.stats.area * (burst ? 1.4 * cardMul('red_moon_burst', 'range') : 1);
  const damage = (cs.shield + 30) * (burst ? 1.5 * cardMul('red_moon_burst', 'damage') : 1);
  damageInCircle(p.x, p.y, radius, damage, { color: VAMPIRE_RED, noSteal: true });
  spawnRing(p.x, p.y, radius, VAMPIRE_DEEP_RED);
  spawnBurst(p.x, p.y, VAMPIRE_DEEP_RED, 30, 220);
  run.shake = 8;
  cs.shield = Math.min(cs.shield, run.stats.maxHp * SHIELD_CAP_FRAC);
  if (hasCard('night_lord')) recalcStats(); // the transformation ends
}

function updateBatSwarm(dt: number): void {
  const cs = state(), p = run.player;
  cs.batPositions = [];
  if (!hasCard('bat_swarm')) return;
  const storm = isEvolved('bat_swarm');
  const count = (2 + cardExtraProjectiles('bat_swarm')) * (storm ? 2 : 1), radius = storm ? 85 : 60;
  cs.batAngle += dt * 3 * cardMul('bat_swarm', 'speed');
  const damage = 5 * cardMul('bat_swarm', 'damage') * (storm ? 2 : 1);
  for (let i = 0; i < count; i++) {
    const a = cs.batAngle + (i * TAU) / count;
    const bx = p.x + Math.cos(a) * radius, by = p.y + Math.sin(a) * radius;
    cs.batPositions.push({ x: bx, y: by });
    for (const e of enemiesInRadius(bx, by, 8)) {
      if ((e.batCooldownUntil || 0) > run.time) continue;
      e.batCooldownUntil = run.time + 0.5;
      hitEnemy(e, damage, { tag: 'bat', color: '#d9a2ff' });
    }
  }
}

function updateBloodRain(dt: number): void {
  const cs = state(), p = run.player;
  if (!hasCard('blood_rain')) return;
  cs.rainTimer -= dt;
  if (cs.rainTimer > 0) return;
  const monsoon = isEvolved('blood_rain');
  cs.rainTimer = (monsoon ? 3 : 6) / cardMul('blood_rain', 'speed');
  const drops = (5 + cardExtraProjectiles('blood_rain')) * (monsoon ? 2 : 1);
  const targets = run.enemies.filter((e) => !e.dead && distSq(e, p) < 380 * 380);
  for (let i = 0; i < drops; i++) {
    const t: Point = targets.length ? randPick(targets) : { x: p.x + randRange(-200, 200), y: p.y + randRange(-200, 200) };
    const tx = t.x, ty = t.y;
    addTelegraph({ kind: 'circle', x: tx, y: ty, r: 22, dur: 0.4, color: VAMPIRE_DEEP_RED, friendly: true });
    schedule(0.4, () => {
      const hit = damageInCircle(tx, ty, 22, 12 * cardMul('blood_rain', 'damage'), { color: VAMPIRE_RED });
      if (hit.length) healPlayer(hit.length * cardMul('blood_rain', 'heal'), true);
      spawnBurst(tx, ty, '#c2334a', 6, 80);
    });
  }
}

function updateGaze(dt: number): void {
  const cs = state(), p = run.player;
  if (!hasCard('gaze_of_the_count')) return;
  cs.gazeTimer -= dt;
  if (cs.gazeTimer > 0) return;
  const master = isEvolved('gaze_of_the_count');
  cs.gazeTimer = 8 / cardMul('gaze_of_the_count', 'speed');
  const duration = (master ? 6 : 3) * cardMul('gaze_of_the_count', 'duration');
  const candidates = run.enemies
    .filter((e) => !e.dead && !e.boss && e.charmTime <= 0 && distSq(e, p) < 420 * 420)
    .sort((a, b) => (Number(b.elite) - Number(a.elite)) || (b.hp - a.hp));
  for (let i = 0; i < (master ? 2 : 1) && i < candidates.length; i++) {
    const e = candidates[i];
    e.charmTime = duration;
    spawnRing(e.x, e.y, 26, '#ff7ad0');
    addFloatingText(e.x, e.y - 20, 'charmed', '#ff7ad0', 11);
  }
}

/** Thralls (from Thrall Moon) chase and bite the nearest enemy until they expire. */
function updateThralls(dt: number): void {
  for (const m of run.allies) {
    if (m.kind !== 'thrall') continue;
    m.life -= dt;
    m.attackTimer -= dt;
    if (m.life <= 0) { m.dead = true; continue; }
    const target = nearestEnemy(m.x, m.y, 400);
    if (!target) continue;
    const a = Math.atan2(target.y - m.y, target.x - m.x), d = Math.hypot(target.x - m.x, target.y - m.y);
    if (d > target.r + 10) {
      m.x += Math.cos(a) * 160 * dt;
      m.y += Math.sin(a) * 160 * dt;
    } else if (m.attackTimer <= 0) {
      m.attackTimer = 0.6;
      hitEnemy(target, m.damage, { tag: 'minion', color: '#ff9fb0' });
    }
  }
  run.allies = run.allies.filter((m) => !m.dead);
}
