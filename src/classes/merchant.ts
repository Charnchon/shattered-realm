// ============================================================ Merchant: crossbow + pet mimic
import type { CardDef, Enemy, PickupHelper, PlayerShot, Stats } from '../types';
import { ARENA_H, ARENA_W, COLOR, TAU } from '../core/constants';
import { ctx } from '../core/canvas';
import { clamp, distSq, randRange } from '../core/math';
import { cardExtraProjectiles, cardMul, hasCard, isEvolved, recalcStats, run } from '../core/state';
import { damageInCircle, healPlayer, hitEnemy } from '../world/combat';
import { addFloatingText, spawnBurst, spawnLine, spawnRing } from '../world/effects';
import { enemiesInRadius, nearestEnemy } from '../world/enemies';
import { dropCoin } from '../world/pickups';
import { fireShot } from '../world/projectiles';
import { addZone } from '../world/zones';
import { registerClass } from './registry';

const BOLT_COLOR = '#f2d38a';
const BITE_COLOR = '#ffd27a';
const BOLT_SPEED = 560;

/** Biscuit, the pet mimic. Bites enemies and helps collect pickups. */
interface Biscuit extends PickupHelper {
  r: number;
  biteTimer: number;
  bites: number;
  target: Enemy | null;
}

interface MerchantState {
  /** Crossbow charge, 0-1. */
  charge: number;
  shotsFired: number;
  /** A dash primes the next shot to fire at full charge instantly. */
  primed: boolean;
  feastTime: number;
  trapTimer: number;
  biscuit: Biscuit;
}
const state = (): MerchantState => run.classState as MerchantState;

const MERCHANT_CARDS: CardDef[] = [
  { id: 'haggle_harder', name: 'Haggle Harder', part: 'passive', desc: 'More Trade Coin drops; coin rerolls cost less.', ups: ['effect'] },
  { id: 'explosive_bolts', name: 'Explosive Bolts', part: 'strike', desc: 'Bolts explode on hit.', ups: ['damage', 'range'] },
  { id: 'bolt_bundle', name: 'Bolt Bundle', part: 'strike', desc: 'Every 4th shot fires 3 bolts.', ups: ['projectiles', 'damage'] },
  { id: 'quick_draw', name: 'Quick Draw', part: 'strike', desc: 'Crossbow charges 25% faster.', ups: ['speed'] },
  { id: 'heavy_draw', name: 'Heavy Draw', part: 'heavy', desc: 'Heavy Bolt is bigger and hits 30% harder.', ups: ['damage', 'range', 'speed'] },
  { id: 'net_bolt', name: 'Net Bolt', part: 'heavy', desc: 'Heavy Bolt bursts into a net that roots enemies.', ups: ['range', 'duration'] },
  { id: 'chain_bolt', name: 'Chain Bolt', part: 'heavy', desc: 'Heavy Bolt jumps to 2 more enemies.', ups: ['projectiles', 'damage'] },
  { id: 'tumble_shot', name: 'Tumble Shot', part: 'dash', desc: 'Tumble Roll also fires a free full bolt.', ups: ['damage', 'projectiles'] },
  { id: 'smoke_pouch', name: 'Smoke Pouch', part: 'dash', desc: 'Tumble Roll leaves smoke; enemies inside get lost.', ups: ['range', 'duration'] },
  { id: 'coin_toss_roll', name: 'Coin Toss Roll', part: 'dash', desc: 'Tumble Roll drops 3 coins that explode.', ups: ['damage', 'effect'] },
  { id: 'feast_time', name: 'Feast Time', part: 'ultimate', desc: "Biscuit's Feast lasts 3 s longer and bites harder.", ups: ['damage', 'duration'] },
  { id: 'treasure_spit', name: 'Treasure Spit', part: 'ultimate', desc: 'When the Feast ends, Biscuit spits coins in a ring.', ups: ['projectiles', 'damage'] },
  { id: 'lucky_feast', name: 'Lucky Feast', part: 'ultimate', desc: 'Feast bites can drop Trade Coins and heal orbs.', ups: ['heal', 'effect'] },
  {
    id: 'bigger_biscuit', name: 'Bigger Biscuit', part: 'wild', desc: 'Biscuit grows, bites 60% harder and heals you.', ups: ['damage', 'range', 'heal'],
    evo: { name: 'Mimic King', desc: 'Biscuit swallows weak enemies whole.', need: { part: 'ultimate' }, needText: 'any Ultimate card' },
  },
  {
    id: 'bear_traps', name: 'Bear Traps', part: 'wild', desc: 'Every 8 s, drop a trap that roots and hurts.', ups: ['damage', 'projectiles', 'duration'],
    evo: { name: 'Iron Jaws', desc: 'Traps every 4 s, double damage, longer root.', need: { card: 'net_bolt' }, needText: 'Net Bolt card' },
  },
  {
    id: 'investment', name: 'Investment', part: 'wild', desc: '+1% damage per 10 Trade Coins held.', ups: ['effect'],
    evo: { name: 'Compound Fortune', desc: 'Coins also add crit chance.', need: { card: 'haggle_harder' }, needText: 'Haggle Harder card' },
  },
];

registerClass({
  id: 'merchant',
  name: 'Merchant',
  role: 'Ranged · Crossbow + pet',
  color: '#e0a83e',
  ultName: "Biscuit's Feast",
  base: { hp: 100, moveSpeed: 150, armor: 0, luck: 0, regen: 0.5 },
  heavyCooldown: 2.5,
  ratings: { HP: 3, Speed: 3, Damage: 4, 'Attack speed': 2, Range: 4 },
  kit: [
    'Strike: hold to charge the crossbow',
    'Heavy: Heavy Bolt pierces a whole line',
    'Dash: Tumble Roll primes a full shot',
    "Ultimate: Biscuit's Feast, pet goes giant",
    'Passive: enemies drop Trade Coins for rerolls',
  ],
  keys: { lmb: 'Bolt', rmb: 'Heavy', spc: 'Roll', q: 'Feast' },
  favoredParts: ['strike', 'heavy'],
  cards: MERCHANT_CARDS,

  init() {
    const p = run.player;
    const initial: MerchantState = {
      charge: 0, shotsFired: 0, primed: false,
      feastTime: 0, trapTimer: 4,
      biscuit: { x: p.x - 30, y: p.y + 20, r: 10, biteTimer: 0, bites: 0, target: null, pickupRadius: 46 },
    };
    run.classState = initial;
  },

  modifyStats(stats: Stats) {
    if (!hasCard('investment')) return;
    const stacks = Math.floor(run.coinsHeld / 10);
    stats.damage *= 1 + 0.01 * cardMul('investment', 'effect') * stacks;
    if (isEvolved('investment')) stats.critChance += 0.005 * stacks;
  },
  pickupHelpers() { return [state().biscuit]; },
  onCoin() { if (hasCard('investment')) recalcStats(); },
  rerollCost() { return hasCard('haggle_harder') ? Math.max(3, Math.round(7 / cardMul('haggle_harder', 'effect'))) : 10; },

  // ---------------------------------------------------------- crossbow

  /** Hold to charge; a full charge fires automatically. A dash primes an instant full shot. */
  strike(dt: number, attacking: boolean) {
    const cs = state();
    const chargeTime = (0.6 * (hasCard('quick_draw') ? 0.75 / cardMul('quick_draw', 'speed') : 1)) / run.stats.attackSpeed;
    if (attacking) {
      if (cs.primed) { fireBolt(1); cs.primed = false; cs.charge = 0; return; }
      cs.charge += dt / chargeTime;
      if (cs.charge >= 1) { fireBolt(1); cs.charge = 0; }
    } else if (cs.charge > 0) {
      if (cs.charge > 0.3) fireBolt(cs.charge);
      cs.charge = 0;
    }
  },

  /** Heavy Bolt: slow, piercing, knocks back. Cards add chaining and a rooting net. */
  heavy() {
    const p = run.player;
    let damage = 18 * 1.45 * 1.6, r = 8, speed = 380;
    if (hasCard('heavy_draw')) {
      damage *= 1.3 * cardMul('heavy_draw', 'damage');
      r *= 1.4 * cardMul('heavy_draw', 'range');
      speed *= cardMul('heavy_draw', 'speed');
    }
    const chains = hasCard('chain_bolt') ? 2 + cardExtraProjectiles('chain_bolt') : 0;
    let netThrown = false;
    const throwNet = (x: number, y: number): void => {
      if (netThrown || !hasCard('net_bolt')) return;
      netThrown = true;
      addZone({
        kind: 'net', x, y, r: 70 * run.stats.area * cardMul('net_bolt', 'range'), color: 'rgba(240,185,77,0.22)',
        life: 0.6, root: 1.5 * cardMul('net_bolt', 'duration'), tick: 0.05,
      });
    };
    fireShot({
      x: p.x, y: p.y, vx: Math.cos(p.face) * speed, vy: Math.sin(p.face) * speed,
      r, dmg: damage, pierce: 999, life: 1.7, heavy: true, knock: 12, color: '#ffe0a0', kind: 'heavybolt', tag: 'heavy',
      onHit: (s, e) => {
        if (chains && !s.chained) {
          s.chained = true;
          chainLightning(e, chains, damage * 0.7 * cardMul('chain_bolt', 'damage'));
        }
        throwNet(e.x, e.y);
      },
      onEnd: (s) => throwNet(s.x, s.y),
    });
  },

  /** Tumble Roll: primes a full shot; cards add a free bolt, smoke and coin mines. */
  dash() {
    const cs = state(), p = run.player;
    cs.primed = true;
    if (hasCard('tumble_shot')) {
      const count = 1 + cardExtraProjectiles('tumble_shot');
      for (let i = 0; i < count; i++) {
        fireBolt(1, { angle: p.face + (i - (count - 1) / 2) * 0.15, free: true, damageMul: cardMul('tumble_shot', 'damage') });
      }
    }
    if (hasCard('smoke_pouch')) {
      addZone({
        kind: 'smoke', x: p.x, y: p.y, r: 70 * run.stats.area * cardMul('smoke_pouch', 'range'), color: 'rgba(170,160,190,0.25)',
        life: 2.5 * cardMul('smoke_pouch', 'duration'), confuse: true, slow: true,
      });
    }
    if (hasCard('coin_toss_roll')) {
      const count = Math.round(3 * cardMul('coin_toss_roll', 'effect'));
      for (let i = 0; i < count; i++) {
        addZone({
          kind: 'mine', x: p.x + randRange(-30, 30), y: p.y + randRange(-30, 30), r: 45 * run.stats.area,
          life: 2, delay: 0.6, dmg: 15 * cardMul('coin_toss_roll', 'damage'), color: COLOR.gold,
        });
      }
    }
    return { dist: 120 };
  },

  /** Biscuit's Feast: Biscuit grows, bites everything nearby, and all pickups fly to you. */
  ult() {
    const cs = state();
    cs.feastTime = 8 + (hasCard('feast_time') ? 3 * cardMul('feast_time', 'duration') : 0);
    run.magnetAllTime = cs.feastTime;
  },

  update(dt: number) {
    updateBiscuit(dt);
    updateFeastEnd(dt);
    updateBearTraps(dt);
  },

  /** Trade Coins drop from kills; elites drop far more often. */
  onKill(e: Enemy) {
    const chance = 0.08 * (hasCard('haggle_harder') ? 1 + 0.5 * cardMul('haggle_harder', 'effect') : 1) * (e.elite ? 4 : 1);
    if (Math.random() < chance) dropCoin(e.x + randRange(-6, 6), e.y + randRange(-6, 6), 1);
  },

  draw() {
    const cs = state(), b = cs.biscuit, p = run.player, r = b.r;
    // Biscuit: a little treasure chest
    ctx.fillStyle = '#8a5a34'; ctx.fillRect(b.x - r, b.y - r * 0.7, r * 2, r * 1.5);
    ctx.fillStyle = COLOR.gold; ctx.fillRect(b.x - r, b.y - r * 0.1, r * 2, Math.max(2, r * 0.18));
    ctx.fillStyle = '#ffe066';
    ctx.fillRect(b.x - r * 0.5, b.y - r * 0.5, r * 0.3, r * 0.3);
    ctx.fillRect(b.x + r * 0.2, b.y - r * 0.5, r * 0.3, r * 0.3);
    if (cs.feastTime > 0) {
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 5; i++) ctx.fillRect(b.x - r + (i * r * 2) / 5 + 2, b.y - r * 0.12, r * 0.2, r * 0.2);
    }
    // crossbow charge ring
    if (cs.charge > 0 || cs.primed) {
      ctx.strokeStyle = cs.primed ? COLOR.gold : 'rgba(242,211,138,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, 18, -Math.PI / 2, -Math.PI / 2 + TAU * (cs.primed ? 1 : cs.charge)); ctx.stroke();
    }
  },

  resource() {
    return { label: 'Trade Coins', value: run.coinsHeld, frac: Math.min(1, run.coinsHeld / 50), color: COLOR.gold };
  },
});

interface BoltOptions {
  /** Aim override (default: player facing). */
  angle?: number;
  /** Doesn't count towards Bolt Bundle's every-4th shot. */
  free?: boolean;
  damageMul?: number;
}

/** Fire bolt(s) at `charge` (0-1) strength. */
function fireBolt(charge: number, opts: BoltOptions = {}): void {
  const p = run.player, cs = state();
  const aim = opts.angle != null ? opts.angle : p.face;
  let damage = 21 * (0.4 + 0.6 * charge) * (opts.damageMul || 1);
  let count = 1 + run.stats.extraProjectiles;
  if (!opts.free) {
    cs.shotsFired++;
    if (hasCard('bolt_bundle') && cs.shotsFired % 4 === 0) {
      count += 2 + cardExtraProjectiles('bolt_bundle');
      damage *= cardMul('bolt_bundle', 'damage');
    }
  }
  const explode = hasCard('explosive_bolts') ? explodeBolt : null;
  for (let i = 0; i < count; i++) {
    const a = aim + (i - (count - 1) / 2) * 0.12;
    fireShot({
      x: p.x, y: p.y,
      vx: Math.cos(a) * BOLT_SPEED * (0.8 + 0.2 * charge), vy: Math.sin(a) * BOLT_SPEED * (0.8 + 0.2 * charge),
      r: 4, dmg: damage, pierce: 2, life: 1.2, color: BOLT_COLOR, kind: 'bolt', tag: 'bolt', onHit: explode,
    });
  }
}

/** Explosive Bolts: small blast where a bolt hits. */
function explodeBolt(_shot: PlayerShot, e: Enemy): void {
  const radius = 40 * run.stats.area * cardMul('explosive_bolts', 'range');
  damageInCircle(e.x, e.y, radius, 6 * cardMul('explosive_bolts', 'damage'), { color: COLOR.gold, noCrit: true });
  spawnRing(e.x, e.y, radius, COLOR.gold);
}

/** Jump from `first` to up to `jumps` nearby enemies it hasn't hit yet. */
function chainLightning(first: Enemy, jumps: number, damage: number): void {
  let from = first;
  const seen = new Set<Enemy>([first]);
  for (let i = 0; i < jumps; i++) {
    const next = nearestEnemy(from.x, from.y, 170, (o) => !seen.has(o));
    if (!next) break;
    seen.add(next);
    spawnLine(from.x, from.y, next.x, next.y, COLOR.teal, 2);
    hitEnemy(next, damage, { color: COLOR.teal });
    from = next;
  }
}

function updateBiscuit(dt: number): void {
  const cs = state(), p = run.player, b = cs.biscuit;
  const big = hasCard('bigger_biscuit'), feast = cs.feastTime > 0;
  b.r = (feast ? 28 : 10) * (big ? 1.3 : 1);
  const reach = (feast ? 150 : 95) * (big ? cardMul('bigger_biscuit', 'range') : 1);

  // pick a target, or follow behind the player
  let target = b.target;
  if (!target || target.dead || distSq(target, p) > 340 * 340) target = b.target = nearestEnemy(b.x, b.y, reach + 60);
  let gx: number, gy: number;
  if (target) { gx = target.x; gy = target.y; }
  else { gx = p.x - Math.cos(p.face) * 34; gy = p.y - Math.sin(p.face) * 34 + 10; }
  const a = Math.atan2(gy - b.y, gx - b.x), d = Math.hypot(gx - b.x, gy - b.y), speed = feast ? 270 : 230;
  if (d > 4) {
    b.x += Math.cos(a) * Math.min(d, speed * dt);
    b.y += Math.sin(a) * Math.min(d, speed * dt);
  }
  if (distSq(b, p) > 420 * 420) { b.x = p.x; b.y = p.y; }

  b.biteTimer -= dt;
  if (target && Math.hypot(target.x - b.x, target.y - b.y) < b.r + target.r + 8 && b.biteTimer <= 0) bite(target, big, feast);
}

function bite(target: Enemy, big: boolean, feast: boolean): void {
  const b = state().biscuit;
  b.biteTimer = feast ? 0.3 : 0.65;
  const damage = (feast ? 30 : 13)
    * (big ? 1.6 * cardMul('bigger_biscuit', 'damage') : 1)
    * (feast && hasCard('feast_time') ? cardMul('feast_time', 'damage') : 1)
    * (1 + 0.1 * run.wave);
  const swallowable = !target.boss && (target.hp < target.maxHp * 0.2 || (!target.elite && target.hp < 30));
  if (isEvolved('bigger_biscuit') && swallowable) {
    addFloatingText(target.x, target.y - 14, 'gulp!', COLOR.gold, 12);
    hitEnemy(target, target.hp / run.stats.damage + 1, { noCrit: true, silent: true });
  } else {
    const victims = feast ? enemiesInRadius(b.x, b.y, b.r + 18) : [target];
    for (const e of victims) hitEnemy(e, damage, { tag: 'bite', color: BITE_COLOR });
  }
  b.bites++;
  if (big && b.bites % 3 === 0) healPlayer(cardMul('bigger_biscuit', 'heal'), true);
  if (feast && hasCard('lucky_feast')) {
    if (Math.random() < 0.25 * cardMul('lucky_feast', 'effect')) dropCoin(target.x, target.y, 1);
    if (Math.random() < 0.1) dropCoin(target.x, target.y, 5 * cardMul('lucky_feast', 'heal'), 'heal');
  }
  spawnBurst(target.x, target.y, BITE_COLOR, 4, 60);
}

function updateFeastEnd(dt: number): void {
  const cs = state(), b = cs.biscuit;
  if (cs.feastTime <= 0) return;
  cs.feastTime -= dt;
  if (cs.feastTime > 0 || !hasCard('treasure_spit')) return;
  const count = 12 + 3 * cardExtraProjectiles('treasure_spit');
  for (let i = 0; i < count; i++) {
    const a = (i * TAU) / count;
    fireShot({
      x: b.x, y: b.y, vx: Math.cos(a) * 360, vy: Math.sin(a) * 360, r: 5,
      dmg: 10 * cardMul('treasure_spit', 'damage') * (1 + 0.1 * run.wave), pierce: 1, life: 1, color: COLOR.gold, kind: 'coin',
    });
  }
}

function updateBearTraps(dt: number): void {
  const cs = state(), p = run.player;
  if (!hasCard('bear_traps')) return;
  cs.trapTimer -= dt;
  if (cs.trapTimer > 0) return;
  const ironJaws = isEvolved('bear_traps');
  cs.trapTimer = (ironJaws ? 4 : 8) / cardMul('bear_traps', 'speed');
  for (let i = 0; i < 1 + cardExtraProjectiles('bear_traps'); i++) {
    addZone({
      kind: 'trap',
      x: clamp(p.x + randRange(-170, 170), 20, ARENA_W - 20), y: clamp(p.y + randRange(-170, 170), 20, ARENA_H - 20),
      r: 14, life: 20, color: '#b0b8c8',
      root: (ironJaws ? 3 : 2) * cardMul('bear_traps', 'duration'),
      dmg: 20 * cardMul('bear_traps', 'damage') * (ironJaws ? 2 : 1) * (1 + 0.1 * run.wave),
    });
  }
}
