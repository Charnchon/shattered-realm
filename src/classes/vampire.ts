// ============================================================ Vampire: melee sustain
import type { CardDef, DashOverride, Enemy, HitOptions, Point, Stats } from '../types';
import { ARENA_H, ARENA_W, COLOR, TAU } from '../core/constants';
import { ctx } from '../core/canvas';
import { clamp, degToRad, distSq, randPick, randRange } from '../core/math';
import { cardExtraProjectiles, cardLevel, cardMul, hasCard, isEvolved, run } from '../core/state';
import { applyBleed, damageInArc, damageInCircle, healPlayer, hitEnemy } from '../world/combat';
import { addFloatingText, addTelegraph, schedule, spawnBurst, spawnRing, spawnSlash } from '../world/effects';
import { enemiesInRadius, nearestEnemy } from '../world/enemies';
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
}
const state = (): VampireState => run.classState as VampireState;

const VAMPIRE_CARDS: CardDef[] = [
  { id: 'crimson_feast', name: 'Crimson Feast', part: 'passive', desc: '+1% lifesteal, and kills heal 1 HP.', ups: ['heal', 'effect'] },
  { id: 'razor_claws', name: 'Razor Claws', part: 'strike', desc: 'Claws hit 25% harder; the 3rd hit is wider.', ups: ['damage', 'range', 'speed'] },
  { id: 'bleeding_claws', name: 'Bleeding Claws', part: 'strike', desc: 'Claw hits cause bleeding for 3 s.', ups: ['damage', 'duration'] },
  { id: 'hemorrhage', name: 'Hemorrhage', part: 'strike', desc: 'Claw crits burst in blood that heals you.', ups: ['heal', 'effect'] },
  { id: 'rending_lunge', name: 'Rending Lunge', part: 'heavy', desc: 'Crimson Rend lunges twice as far and causes bleeding.', ups: ['damage', 'range', 'duration'] },
  { id: 'feeding_rend', name: 'Feeding Rend', part: 'heavy', desc: 'Crimson Rend heals an extra 1% max HP per enemy hit.', ups: ['heal', 'effect'] },
  { id: 'twin_rend', name: 'Twin Rend', part: 'heavy', desc: 'Crimson Rend strikes a second time.', ups: ['damage', 'projectiles'] },
  { id: 'mist_form', name: 'Mist Form', part: 'dash', desc: 'Mist Step deals double damage and heals double.', ups: ['damage', 'heal', 'range'] },
  { id: 'blood_trail', name: 'Blood Trail', part: 'dash', desc: 'Mist Step leaves a blood trail that hurts enemies.', ups: ['damage', 'duration'] },
  { id: 'swift_mist', name: 'Swift Mist', part: 'dash', desc: 'Mist Step cooldown −20%. +1 charge at Lv5.', ups: ['speed'] },
  { id: 'hunger_moon', name: 'Hunger Moon', part: 'ultimate', desc: 'Blood Moon lasts 3 s longer with ×4 lifesteal.', ups: ['heal', 'duration'] },
  { id: 'red_moon_burst', name: 'Red Moon Burst', part: 'ultimate', desc: 'The shield explosion at the end is bigger and stronger.', ups: ['damage', 'range'] },
  { id: 'thrall_moon', name: 'Thrall Moon', part: 'ultimate', desc: 'During Blood Moon, kills rise as thralls for 5 s.', ups: ['projectiles', 'duration'] },
  {
    id: 'bat_swarm', name: 'Bat Swarm', part: 'wild', desc: '2 bats circle you; their hits lifesteal.', ups: ['damage', 'projectiles', 'speed'],
    evo: { name: 'Bat Storm', desc: 'Twice the bats, double damage, wider circle.', need: { part: 'dash' }, needText: 'any Dash card' },
  },
  {
    id: 'blood_rain', name: 'Blood Rain', part: 'wild', desc: 'Every 6 s, blood drops fall on enemies; each hit heals.', ups: ['damage', 'projectiles', 'heal'],
    evo: { name: 'Red Monsoon', desc: 'Twice the drops, every 3 s.', need: { relic: 'heart' }, needText: 'Heart Gem relic' },
  },
  {
    id: 'gaze_of_the_count', name: 'Gaze of the Count', part: 'wild', desc: 'Every 8 s, charm the strongest nearby enemy for 3 s.', ups: ['duration', 'speed'],
    evo: { name: 'Thrall Master', desc: 'Charm 2 enemies for 6 s.', need: { card: 'thrall_moon' }, needText: 'Thrall Moon card' },
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
  },

  // ---------------------------------------------------------- Blood Shield (overheal)

  lifestealMul() {
    if (state().moonTime <= 0) return 1;
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
    const finisher = cs.combo === 2;
    let radius = (finisher ? 54 : 46) * run.stats.area;
    const arc = degToRad(finisher ? 140 : 100);
    let damage = finisher ? 14 : 10;
    if (hasCard('razor_claws')) {
      damage *= 1.25 * cardMul('razor_claws', 'damage');
      if (finisher) radius *= 1.2 * cardMul('razor_claws', 'range');
    }
    const hit = damageInArc(p.x, p.y, p.face, radius, arc, damage, { tag: 'claw' });
    if (hasCard('bleeding_claws')) {
      for (const e of hit) applyBleed(e, 3 * cardMul('bleeding_claws', 'damage'), 3 * cardMul('bleeding_claws', 'duration'));
    }
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

  /** Crimson Rend: lunge forward, then a wide claw that heals per enemy hit. */
  heavy() {
    const p = run.player;
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
    return mistStepShape();
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
  },

  update(dt: number) {
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

const mistStepShape = (): DashOverride => ({ dist: 140 * (hasCard('mist_form') ? cardMul('mist_form', 'range') : 1) });

function shieldCap(): number {
  return run.stats.maxHp * (state().moonTime > 0 ? 1 : SHIELD_CAP_FRAC);
}

function crimsonRend(mult: number): void {
  const p = run.player;
  let damage = 10 * 0.55 * mult * 2.2;
  if (hasCard('rending_lunge')) damage *= 1.3 * cardMul('rending_lunge', 'damage');
  if (hasCard('twin_rend')) damage *= cardMul('twin_rend', 'damage');
  const radius = 62 * run.stats.area * (hasCard('rending_lunge') ? cardMul('rending_lunge', 'range') : 1);
  const hit = damageInArc(p.x, p.y, p.face, radius, REND_ARC, damage, { heavy: true, tag: 'rend', color: VAMPIRE_RED });
  let healPerHit = 0.01 * run.stats.maxHp;
  if (hasCard('feeding_rend')) healPerHit += 0.01 * run.stats.maxHp * cardMul('feeding_rend', 'heal') * cardMul('feeding_rend', 'effect');
  if (hit.length) healPlayer(healPerHit * hit.length);
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
