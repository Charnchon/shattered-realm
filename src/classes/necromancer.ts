// ============================================================ Necromancer: skeleton commander
import type { CardDef, DashOverride, Enemy, HitOptions, Point } from '../types';
import { ARENA_H, ARENA_W, TAU } from '../core/constants';
import { ctx } from '../core/canvas';
import { clamp, degToRad, dist, distSq, randRange } from '../core/math';
import { cardExtraProjectiles, cardMul, hasCard, isEvolved, mouseWorld, run } from '../core/state';
import { damageInArc, damageInCircle, damageInLine, healPlayer, hitEnemy } from '../world/combat';
import { addTelegraph, spawnBurst, spawnLine, spawnRing, spawnSlash } from '../world/effects';
import { enemiesInRadius } from '../world/enemies';
import { fireShot } from '../world/projectiles';
import { addZone } from '../world/zones';
import { registerClass } from './registry';

const BONE_COLOR = '#e8e0c8';
const NECRO_GLOW = '#cbb8e8';
const WRAITH_COLOR = '#bfe0ff';
const CORPSE_COLOR = '#9be35a';
/** Skeletons inside this radius obey Strike and March orders. */
const COMMAND_RADIUS = 190;
/** Skeletons farther than this crumble (permanent ones re-form near you). */
const LEASH_RADIUS = 340;
const BASE_SKELETONS = 3;
const PHALANX_ARC = degToRad(100);

interface Skeleton extends Point {
  /** Temporary skeletons expire after `life` seconds; permanent ones re-form. */
  temp: boolean;
  life: number;
  giant: boolean;
  /** Raised by Army of the Dead. */
  army: boolean;
  crumbleTime: number;
  march: (Point & { t: number }) | null;
  marchHit: Set<Enemy>;
  face: number;
  flash: number;
  gone?: boolean;
}

interface CorpseBlast extends Point {
  r: number;
  dmg: number;
}

interface NecroState {
  skeletons: Skeleton[];
  attackTimer: number;
  wraithAngle: number;
  wraiths: Point[];
  wraithHits: number;
  bansheeTimer: number;
  armyTime: number;
  /** Corpse explosions queued this frame (resolved in update, capped per frame). */
  corpseBlasts: CorpseBlast[];
  dashTarget: Skeleton | null;
}
const state = (): NecroState => run.classState as NecroState;

const NECRO_CARDS: CardDef[] = [
  { id: 'restless_graves', name: 'Restless Graves', part: 'passive', desc: '+1 max skeleton, and enemies you kill rise as temporary skeletons more often.', ups: ['projectiles', 'effect'] },
  { id: 'sharpened_spears', name: 'Sharpened Spears', part: 'strike', desc: 'Skeleton attacks deal 30% more damage and reach farther.', ups: ['damage', 'range'] },
  { id: 'phalanx', name: 'Phalanx', part: 'strike', desc: 'Skeletons sweep wide instead of thrusting, so they hit more enemies.', ups: ['range', 'damage'] },
  { id: 'quick_orders', name: 'Quick Orders', part: 'strike', desc: 'Skeletons attack 33% faster.', ups: ['speed'] },
  { id: 'trampling_march', name: 'Trampling March', part: 'heavy', desc: 'Marching skeletons deal much more damage and push enemies aside.', ups: ['damage', 'range'] },
  { id: 'grave_rush', name: 'Grave Rush', part: 'heavy', desc: 'Skeletons march faster and land with a shockwave.', ups: ['speed', 'damage'] },
  { id: 'dread_march', name: 'Dread March', part: 'heavy', desc: 'Enemies that marching skeletons pass through are slowed.', ups: ['duration', 'range'] },
  { id: 'spiked_grave', name: 'Spiked Grave', part: 'dash', desc: 'Grave Step leaves bone spikes where you land that hurt enemies.', ups: ['damage', 'range', 'duration'] },
  { id: 'long_leash', name: 'Long Leash', part: 'dash', desc: 'Grave Step can reach skeletons much farther away.', ups: ['range'] },
  { id: 'bone_shield', name: 'Bone Shield', part: 'dash', desc: 'After Grave Step, a bone shield blocks the next hit.', ups: ['duration', 'effect'] },
  { id: 'grand_army', name: 'Grand Army', part: 'ultimate', desc: 'Army of the Dead raises 4 more skeletons, and they last longer.', ups: ['projectiles', 'duration'] },
  { id: 'bone_giants', name: 'Bone Giants', part: 'ultimate', desc: '3 skeletons of the raised army are big brutes with heavy hits.', ups: ['damage', 'effect'] },
  { id: 'last_rites', name: 'Last Rites', part: 'ultimate', desc: 'When Army of the Dead ends, heal for each skeleton it raised.', ups: ['heal'] },
  {
    id: 'corpse_explosion', name: 'Corpse Explosion', part: 'wild', desc: '30% of the enemies you kill explode, hurting enemies around them.', ups: ['damage', 'range'],
    evo: { name: 'Chain Detonation', desc: 'Every corpse explodes, and explosions set off more explosions.', need: { part: 'heavy' }, needText: 'any Heavy Strike card' },
  },
  {
    id: 'bone_armor', name: 'Bone Armor', part: 'wild', desc: '+2 armor for each skeleton near you.', ups: ['effect', 'duration'],
    evo: { name: 'Ossified', desc: 'Double the armor for each skeleton.', need: { relic: 'buckle' }, needText: 'Iron Buckle relic' },
  },
  {
    id: 'wraith', name: 'Wraith', part: 'wild', desc: 'A wraith flies through enemies and drains their life.', ups: ['damage', 'heal', 'speed'],
    evo: { name: 'Banshee', desc: '2 wraiths, and every 5 s a scream scares enemies away.', need: { part: 'dash' }, needText: 'any Dash card' },
  },
];

const isStanding = (s: Skeleton): boolean => s.crumbleTime <= 0;
const inCommandRange = (s: Skeleton): boolean => distSq(s, run.player) < COMMAND_RADIUS * COMMAND_RADIUS;

registerClass({
  id: 'necro',
  name: 'Necromancer',
  role: 'Magic · Skeleton commander',
  color: '#9a68c8',
  ultName: 'Army of the Dead',
  base: { hp: 100, moveSpeed: 150, armor: 0, luck: 0, regen: 0.5 },
  heavyCooldown: 2.0,
  ratings: { HP: 3, Speed: 3, Damage: 2, 'Attack speed': 3, Range: 3 },
  kit: [
    'Strike: skeletons in range thrust at the cursor',
    'Heavy: March, skeletons rush to the cursor',
    'Dash: Grave Step jumps to a skeleton',
    'Ultimate: Army of the Dead, 10 extra skeletons',
    'Passive: kills can raise a temporary skeleton',
  ],
  keys: { lmb: 'Attack', rmb: 'March', spc: 'Grave', q: 'Army' },
  abilities: { strike: 'Skeleton Attack', heavy: 'Command: March', dash: 'Grave Step', ultimate: 'Army of the Dead', passive: 'Restless Dead' },
  favoredParts: ['strike', 'heavy'],
  cards: NECRO_CARDS,

  init() {
    const initial: NecroState = {
      skeletons: [], attackTimer: 0,
      wraithAngle: 0, wraiths: [], wraithHits: 0, bansheeTimer: 5,
      armyTime: 0,
      corpseBlasts: [],
      dashTarget: null,
    };
    run.classState = initial;
    for (let i = 0; i < BASE_SKELETONS; i++) addSkeleton();
  },

  bonusArmor() {
    if (!hasCard('bone_armor')) return 0;
    const near = state().skeletons.filter((s) => isStanding(s) && distSq(s, run.player) < 140 * 140).length;
    return Math.min(10, near) * 2 * cardMul('bone_armor', 'effect') * (isEvolved('bone_armor') ? 2 : 1);
  },

  /** Every ready skeleton in command range attacks toward the cursor. */
  strike(dt: number, attacking: boolean) {
    const cs = state(), p = run.player;
    cs.attackTimer -= dt;
    if (!attacking || cs.attackTimer > 0) return;
    cs.attackTimer = (0.5 * (hasCard('quick_orders') ? 0.75 / cardMul('quick_orders', 'speed') : 1)) / run.stats.attackSpeed;
    const aim = mouseWorld();
    const ready = cs.skeletons.filter((s) => isStanding(s) && !s.march && inCommandRange(s));
    if (!ready.length) {
      // no skeletons nearby: weak bone shard from the necromancer
      fireShot({ x: p.x, y: p.y, vx: Math.cos(p.face) * 450, vy: Math.sin(p.face) * 450, r: 3, dmg: 7, life: 0.8, color: BONE_COLOR, kind: 'shard' });
      return;
    }
    for (const s of ready) skeletonAttack(s, aim);
  },

  /** March: skeletons in range rush to the cursor in a ring, trampling what they pass. */
  heavy() {
    const aim = mouseWorld();
    const group = state().skeletons.filter((s) => isStanding(s) && inCommandRange(s));
    const n = group.length;
    group.forEach((s, i) => {
      const a = (i / n) * TAU, ringR = n > 1 ? 16 + n * 3 : 0;
      s.march = { x: clamp(aim.x + Math.cos(a) * ringR, 10, ARENA_W - 10), y: clamp(aim.y + Math.sin(a) * ringR, 10, ARENA_H - 10), t: 0 };
      s.marchHit = new Set();
    });
    addTelegraph({ kind: 'circle', x: aim.x, y: aim.y, r: 24, dur: 0.3, color: NECRO_GLOW, friendly: true });
  },

  /** Grave Step: jump to the skeleton nearest the cursor, or a short hop if none is close. */
  dash() {
    const best = boneSwapTarget();
    state().dashTarget = best;
    return boneSwapShape(best);
  },
  dashShape: () => boneSwapShape(boneSwapTarget()),
  onDashEnd() {
    const p = run.player, cs = state();
    if (cs.dashTarget) {
      damageInCircle(p.x, p.y, 60 * run.stats.area, 6, { knock: 20 });
      spawnRing(p.x, p.y, 60, NECRO_GLOW);
    }
    if (hasCard('spiked_grave')) {
      addZone({
        kind: 'spikes', x: p.x, y: p.y, r: 50 * run.stats.area * cardMul('spiked_grave', 'range'), color: 'rgba(232,224,200,0.2)',
        life: 3 * cardMul('spiked_grave', 'duration'), dps: 12 * cardMul('spiked_grave', 'damage'),
      });
    }
    if (hasCard('bone_shield')) {
      p.boneShield = 1 + (cardMul('bone_shield', 'effect') >= 1.5 ? 1 : 0);
      p.boneShieldTime = 4 * cardMul('bone_shield', 'duration');
    }
    cs.dashTarget = null;
  },

  /** Army of the Dead: a ring of temporary skeletons at the cursor. */
  ult() {
    const cs = state(), aim = mouseWorld();
    const grand = hasCard('grand_army');
    const count = 10 + (grand ? 4 + cardExtraProjectiles('grand_army') : 0);
    const life = 12 + (grand ? 4 * cardMul('grand_army', 'duration') : 0);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU;
      const s = addSkeleton({
        temp: true,
        x: clamp(aim.x + Math.cos(a) * 54, 10, ARENA_W - 10),
        y: clamp(aim.y + Math.sin(a) * 54, 10, ARENA_H - 10),
        life,
        giant: hasCard('bone_giants') && i < 3,
      });
      s.army = true;
    }
    cs.armyTime = life;
    spawnRing(aim.x, aim.y, 80, NECRO_GLOW);
    spawnBurst(aim.x, aim.y, BONE_COLOR, 24, 160);
  },

  update(dt: number) {
    const cs = state();
    let permanent = cs.skeletons.filter((s) => !s.temp).length;
    while (permanent < maxSkeletons()) { addSkeleton(); permanent++; }
    for (const s of cs.skeletons) updateSkeleton(s, dt);
    if (cs.armyTime > 0) {
      cs.armyTime -= dt;
      if (cs.armyTime <= 0 && hasCard('last_rites')) healPlayer(3 * cardMul('last_rites', 'heal') * cs.skeletons.filter((s) => s.army).length);
    }
    cs.skeletons = cs.skeletons.filter((s) => !s.gone);
    updateWraiths(dt);
    resolveCorpseBlasts();
  },

  onKill(e: Enemy, opts: HitOptions) {
    const cs = state();
    const tempRisen = cs.skeletons.filter((s) => s.temp && !s.army).length;
    const riseChance = 0.1 + (hasCard('restless_graves') ? 0.05 * cardMul('restless_graves', 'effect') : 0);
    if (tempRisen < 2 && Math.random() < riseChance) addSkeleton({ temp: true, x: e.x, y: e.y, life: 10 });
    if (hasCard('corpse_explosion')) {
      const chained = isEvolved('corpse_explosion');
      const chance = chained ? 1 : 0.3 * cardMul('corpse_explosion', 'effect');
      // only Chain Detonation lets explosion kills explode again
      if (Math.random() < chance && (!opts || opts.tag !== 'corpse' || chained)) {
        cs.corpseBlasts.push({
          x: e.x, y: e.y,
          r: 45 * run.stats.area * cardMul('corpse_explosion', 'range'),
          dmg: 12 * cardMul('corpse_explosion', 'damage') * (1 + 0.1 * run.wave),
        });
      }
    }
  },

  /** Test bot: stay close to the skeleton group so it can be commanded. */
  botRallyPoint() {
    const cs = state();
    if (!cs.skeletons.length) return null;
    const group = cs.skeletons.filter((s) => isStanding(s) && !s.temp);
    if (!group.length) return null;
    return {
      x: group.reduce((t, s) => t + s.x, 0) / group.length,
      y: group.reduce((t, s) => t + s.y, 0) / group.length,
    };
  },

  draw() {
    const cs = state(), p = run.player;
    // command radius
    ctx.strokeStyle = 'rgba(203,184,232,0.12)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.arc(p.x, p.y, COMMAND_RADIUS, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    for (const s of cs.skeletons) drawSkeleton(s);
    for (const w of cs.wraiths) {
      ctx.fillStyle = 'rgba(191,224,255,0.75)';
      ctx.beginPath(); ctx.arc(w.x, w.y, 9, 0, TAU); ctx.fill();
    }
  },

  resource() {
    const standing = state().skeletons.filter(isStanding).length;
    return { label: 'Skeletons', value: standing, frac: Math.min(1, standing / Math.max(3, maxSkeletons())), color: BONE_COLOR };
  },
});

/** Grave Step target: the standing skeleton nearest the cursor, within reach. */
function boneSwapTarget(): Skeleton | null {
  const p = run.player, aim = mouseWorld();
  const reach = 250 * (hasCard('long_leash') ? 1.8 * cardMul('long_leash', 'range') : 1);
  let best: Skeleton | null = null, bestSq = 80 * 80;
  for (const s of state().skeletons) {
    if (!isStanding(s)) continue;
    const dSq = distSq(s, aim);
    if (dSq < bestSq && distSq(s, p) < reach * reach) { bestSq = dSq; best = s; }
  }
  return best;
}

/** Jump to the skeleton, or a short hop toward the cursor. */
function boneSwapShape(target: Skeleton | null): DashOverride {
  const p = run.player;
  if (target) {
    const a = Math.atan2(target.y - p.y, target.x - p.x), distance = Math.max(20, dist(target, p) - 14);
    return { ang: a, dist: distance, dur: Math.min(0.28, 0.12 + distance / 1600) };
  }
  const aim = mouseWorld();
  return { ang: Math.atan2(aim.y - p.y, aim.x - p.x), dist: 120 };
}

function maxSkeletons(): number {
  return BASE_SKELETONS + (hasCard('restless_graves') ? 1 + cardExtraProjectiles('restless_graves') : 0);
}

interface SkeletonOptions {
  temp?: boolean;
  /** Spawn point; defaults to a random spot next to the player. */
  x?: number;
  y?: number;
  life?: number;
  giant?: boolean;
}

/** Raise a skeleton. Permanent by default. */
function addSkeleton({ temp = false, x, y, life = 0, giant = false }: SkeletonOptions = {}): Skeleton {
  const p = run.player, a = randRange(0, TAU);
  const s: Skeleton = {
    x: x != null ? x : p.x + Math.cos(a) * 40,
    y: y != null ? y : p.y + Math.sin(a) * 40,
    temp, life, giant, army: false,
    crumbleTime: 0, march: null, marchHit: new Set(), face: 0, flash: 0,
  };
  state().skeletons.push(s);
  return s;
}

function skeletonAttack(s: Skeleton, aim: Point): void {
  const a = Math.atan2(aim.y - s.y, aim.x - s.x);
  s.face = a;
  s.flash = 0.12;
  const spears = hasCard('sharpened_spears');
  const damage = 15 * (spears ? 1.3 * cardMul('sharpened_spears', 'damage') : 1) * (s.giant ? 2.5 * cardMul('bone_giants', 'damage') : 1);
  if (hasCard('phalanx')) {
    const radius = 60 * cardMul('phalanx', 'range') * run.stats.area * (spears ? cardMul('sharpened_spears', 'range') : 1);
    damageInArc(s.x, s.y, a, radius, PHALANX_ARC, damage * cardMul('phalanx', 'damage'), { tag: 'spear' });
    spawnSlash(s.x, s.y, a, radius, PHALANX_ARC, BONE_COLOR, 3);
  } else {
    const length = 62 * (spears ? 1.25 * cardMul('sharpened_spears', 'range') : 1) * run.stats.area;
    const x2 = s.x + Math.cos(a) * length, y2 = s.y + Math.sin(a) * length;
    damageInLine(s.x, s.y, x2, y2, 24, damage, { tag: 'spear' });
    spawnLine(s.x, s.y, x2, y2, BONE_COLOR, 3);
  }
}

function updateSkeleton(s: Skeleton, dt: number): void {
  const p = run.player;
  s.flash -= dt;
  if (s.temp) {
    s.life -= dt;
    if (s.life <= 0) { s.gone = true; return; }
  }
  if (s.crumbleTime > 0) {
    s.crumbleTime -= dt;
    if (s.crumbleTime <= 0) {
      // re-form next to the necromancer
      const a = randRange(0, TAU);
      s.x = p.x + Math.cos(a) * 36;
      s.y = p.y + Math.sin(a) * 36;
      spawnBurst(s.x, s.y, BONE_COLOR, 6, 60);
    }
    return;
  }
  if (distSq(s, p) > LEASH_RADIUS * LEASH_RADIUS) {
    if (s.temp) { s.gone = true; return; }
    s.crumbleTime = 3;
    s.march = null;
    spawnBurst(s.x, s.y, BONE_COLOR, 8, 80);
    return;
  }
  if (s.march) updateMarch(s, s.march, dt);
}

function updateMarch(s: Skeleton, march: Point & { t: number }, dt: number): void {
  march.t += dt;
  const speed = 520 * (hasCard('grave_rush') ? 1.5 * cardMul('grave_rush', 'speed') : 1);
  const a = Math.atan2(march.y - s.y, march.x - s.x), d = Math.hypot(march.x - s.x, march.y - s.y);
  const step = Math.min(d, speed * dt);
  s.x += Math.cos(a) * step;
  s.y += Math.sin(a) * step;
  s.face = a;
  const trample = hasCard('trampling_march');
  const damage = 9 * 0.4 * 2.2 * (trample ? 2.5 * cardMul('trampling_march', 'damage') : 1) * (s.giant ? 2 : 1);
  for (const e of enemiesInRadius(s.x, s.y, 10 * (hasCard('dread_march') ? cardMul('dread_march', 'range') : 1))) {
    if (s.marchHit.has(e)) continue;
    s.marchHit.add(e);
    hitEnemy(e, damage, { heavy: true, tag: 'march', knock: trample ? 14 : 0, knockAngle: a + Math.PI / 2 });
    if (hasCard('dread_march')) e.slowTime = Math.max(e.slowTime, 2 * cardMul('dread_march', 'duration'));
  }
  if (d < 4 || march.t > 2) {
    s.march = null;
    if (hasCard('grave_rush')) {
      damageInCircle(s.x, s.y, 45 * run.stats.area, 8 * cardMul('grave_rush', 'damage'), {});
      spawnRing(s.x, s.y, 45, NECRO_GLOW);
    }
  }
}

function updateWraiths(dt: number): void {
  const cs = state(), p = run.player;
  cs.wraiths = [];
  if (!hasCard('wraith')) return;
  const banshee = isEvolved('wraith'), count = banshee ? 2 : 1;
  cs.wraithAngle += dt * 2.2 * cardMul('wraith', 'speed');
  for (let i = 0; i < count; i++) {
    const a = cs.wraithAngle + i * Math.PI, radius = 110 + Math.sin(run.time * 1.7 + i) * 30;
    const w = { x: p.x + Math.cos(a) * radius, y: p.y + Math.sin(a) * radius };
    cs.wraiths.push(w);
    for (const e of enemiesInRadius(w.x, w.y, 12)) {
      if ((e.wraithCooldownUntil || 0) > run.time) continue;
      e.wraithCooldownUntil = run.time + 0.4;
      hitEnemy(e, 10 * cardMul('wraith', 'damage'), { tag: 'wraith', color: WRAITH_COLOR });
      cs.wraithHits++;
      if (cs.wraithHits % 5 === 0) healPlayer(cardMul('wraith', 'heal'), true);
    }
  }
  if (banshee) {
    cs.bansheeTimer -= dt;
    if (cs.bansheeTimer <= 0) {
      cs.bansheeTimer = 5;
      for (const e of enemiesInRadius(p.x, p.y, 160)) if (!e.boss) e.fearTime = 1.5;
      spawnRing(p.x, p.y, 160, WRAITH_COLOR);
    }
  }
}

function resolveCorpseBlasts(): void {
  const cs = state();
  if (!cs.corpseBlasts.length) return;
  const queued = cs.corpseBlasts;
  cs.corpseBlasts = [];
  for (const b of queued.slice(0, 20)) {
    damageInCircle(b.x, b.y, b.r, b.dmg, { tag: 'corpse', color: CORPSE_COLOR, noCrit: true });
    spawnBurst(b.x, b.y, CORPSE_COLOR, 8, 120);
  }
}

function drawSkeleton(s: Skeleton): void {
  if (!isStanding(s)) {
    // bone pile while crumbled
    ctx.fillStyle = 'rgba(232,224,200,0.25)';
    ctx.fillRect(s.x - 5, s.y + 2, 10, 3);
    return;
  }
  const r = s.giant ? 13 : 8;
  ctx.globalAlpha = s.temp ? 0.75 : 1;
  ctx.fillStyle = s.flash > 0 ? '#ffffff' : inCommandRange(s) ? BONE_COLOR : '#9d9584';
  ctx.fillRect(s.x - r * 0.7, s.y - r, r * 1.4, r * 2);
  ctx.fillStyle = '#1b1024';
  ctx.fillRect(s.x - r * 0.4, s.y - r * 0.6, r * 0.25, r * 0.25);
  ctx.fillRect(s.x + r * 0.15, s.y - r * 0.6, r * 0.25, r * 0.25);
  // spear
  ctx.strokeStyle = '#a07a50';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + Math.cos(s.face) * (r + 10), s.y + Math.sin(s.face) * (r + 10)); ctx.stroke();
  ctx.globalAlpha = 1;
}
