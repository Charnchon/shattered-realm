// ============================================================ Bounty Hunter: ranged bow + falcon pet
// Easy to read: you shoot arrows, Mark Prey tags a target, and your falcon dives on what you marked.
import type { CardDef, DashOverride, Enemy, PickupHelper, Point, Stats } from '../types';
import { COLOR, TAU } from '../core/constants';
import { ctx } from '../core/canvas';
import { distSq, randPick, randRange } from '../core/math';
import { cardExtraProjectiles, cardLevel, cardMul, hasCard, isEvolved, relicLevel, run } from '../core/state';
import { applyBleed, damageInCircle, hitEnemy } from '../world/combat';
import { addFloatingText, spawnBurst, spawnLine } from '../world/effects';
import { enemiesInRadius, nearestEnemy } from '../world/enemies';
import { dropCoin } from '../world/pickups';
import { fireShot } from '../world/projectiles';
import { registerClass } from './registry';

const ARROW_COLOR = '#e8dcc0';
const MARK_COLOR = '#ff8a3d';
const FEATHER_COLOR = '#c9a46a';
const ARROW_SPEED = 620;
/** Hawk Eye: extra damage you deal to marked prey. */
const MARK_BONUS = 0.5;
const MARK_SECONDS = 6;

/** A falcon: circles above you, dives on prey, and fetches pickups. */
interface Falcon extends PickupHelper {
  /** Angle around the player while circling. */
  orbit: number;
  diveTimer: number;
  /** Enemy id it's diving at, or 0. */
  diveId: number;
}

interface BountyState {
  attackTimer: number;
  shots: number;
  /** Marked prey: enemy id → seconds left. Ids (not objects) so online clients can draw the marks. */
  marks: Record<number, number>;
  falcons: Falcon[];
  /** Feather Fall: empowered arrows left after a dash. */
  empowered: number;
  huntTime: number;
  huntTimer: number;
  volleyTimer: number;
  featherTimer: number;
}
const state = (): BountyState => run.classState as BountyState;

const BOUNTY_CARDS: CardDef[] = [
  { id: 'keen_eye', name: 'Keen Eye', part: 'passive', desc: 'Marked enemies take 25% more damage from you, and marks last 50% longer.', ups: ['effect', 'duration'] },
  { id: 'twin_arrows', name: 'Twin Arrows', part: 'strike', desc: 'Shoot 2 arrows with every attack.', ups: ['projectiles', 'damage'] },
  { id: 'piercing_arrows', name: 'Piercing Arrows', part: 'strike', desc: 'Arrows pass through 2 more enemies and fly farther.', ups: ['damage', 'range'] },
  { id: 'quick_nock', name: 'Quick Nock', part: 'strike', desc: 'Shoot arrows 25% faster.', ups: ['speed'] },
  { id: 'barbed_mark', name: 'Barbed Mark', part: 'heavy', desc: 'Marked enemies also bleed, taking damage for 4 s.', ups: ['damage', 'duration'] },
  { id: 'spread_mark', name: 'Spread Mark', part: 'heavy', desc: 'Mark Prey fires 3 arrows, so you can mark 3 enemies at once.', ups: ['projectiles', 'damage'] },
  { id: 'pinning_shot', name: 'Pinning Shot', part: 'heavy', desc: 'Marked enemies are pinned in place for 1.5 s.', ups: ['duration', 'range'] },
  { id: 'swoop_guard', name: 'Swoop Guard', part: 'dash', desc: 'When you dash, Kestrel swoops around you and hits every nearby enemy.', ups: ['damage', 'range'] },
  { id: 'feather_fall', name: 'Feather Fall', part: 'dash', desc: 'After a dash, your next 3 arrows deal double damage.', ups: ['damage', 'effect'] },
  { id: 'wind_step', name: 'Wind Step', part: 'dash', desc: 'Feather Step recharges 20% faster. At Lv5, gain a 2nd dash.', ups: ['speed'] },
  { id: 'long_hunt', name: 'Long Hunt', part: 'ultimate', desc: 'Sky Hunt lasts 3 s longer, and its falcons hit 30% harder.', ups: ['damage', 'duration'] },
  { id: 'talon_storm', name: 'Talon Storm', part: 'ultimate', desc: 'More falcons join Sky Hunt, so they dive more often.', ups: ['projectiles', 'speed'] },
  { id: 'feather_rain', name: 'Feather Rain', part: 'ultimate', desc: 'When Sky Hunt ends, sharp feathers burst out and hit everything around you.', ups: ['damage', 'range'] },
  {
    id: 'second_falcon', name: 'Second Falcon', part: 'wild', desc: 'A second falcon joins Kestrel and attacks with it.', ups: ['damage', 'speed', 'projectiles'],
    evo: { name: 'Falcon Pair', desc: 'Your falcons dive twice as often and hit 50% harder.', need: { part: 'ultimate' }, needText: 'any Ultimate card' },
  },
  {
    id: 'volley', name: 'Volley', part: 'wild', desc: 'Every 6 s, a rain of arrows hits the biggest group of enemies near you.', ups: ['damage', 'projectiles', 'speed'],
    evo: { name: 'Arrow Storm', desc: 'Twice as many arrows, every 3 s.', need: { card: 'twin_arrows' }, needText: 'Twin Arrows card' },
  },
  {
    id: 'feather_fetch', name: 'Feather Fetch', part: 'wild', desc: 'Your falcons grab gems from farther away, and every 12 s bring back a heal orb.', ups: ['heal', 'range'],
    evo: { name: 'Golden Feather', desc: 'A heal orb every 6 s, healing double.', need: { relic: 'magnet' }, needText: 'Magnet Stone relic' },
  },
];

registerClass({
  id: 'bounty_hunter',
  name: 'Bounty Hunter',
  role: 'Ranged · Bow + falcon',
  color: '#6fb26a',
  ultName: 'Sky Hunt',
  base: { hp: 90, moveSpeed: 165, armor: 0, luck: 0 },
  heavyCooldown: 2.0,
  ratings: { HP: 2, Speed: 4, Damage: 3, 'Attack speed': 4, Range: 5 },
  kit: [
    'Strike: quick shortbow arrows',
    'Heavy: Mark Prey; your falcon dives on it',
    'Dash: Feather Step, a quick hop',
    'Ultimate: Sky Hunt, falcons dive everywhere',
    'Passive: Hawk Eye, +50% damage to marked prey',
  ],
  keys: { lmb: 'Bow', rmb: 'Mark', spc: 'Step', q: 'Hunt' },
  abilities: { strike: 'Shortbow', heavy: 'Mark Prey', dash: 'Feather Step', ultimate: 'Sky Hunt', passive: 'Hawk Eye' },
  favoredParts: ['strike', 'heavy'],
  cards: BOUNTY_CARDS,

  init() {
    const p = run.player;
    const initial: BountyState = {
      attackTimer: 0, shots: 0, marks: {}, falcons: [newFalcon(p, 0)], empowered: 0,
      huntTime: 0, huntTimer: 0, volleyTimer: 4, featherTimer: 8,
    };
    run.classState = initial;
  },

  modifyStats(stats: Stats) {
    if (hasCard('quick_nock')) stats.attackSpeed *= 1.25 * cardMul('quick_nock', 'speed');
    if (hasCard('wind_step')) {
      stats.dashCooldown *= 0.8 / cardMul('wind_step', 'speed');
      if (cardLevel('wind_step') >= 5) stats.dashCharges += 1;
    }
  },

  /** Hawk Eye: you hit marked prey harder. */
  damageMod(e: Enemy) {
    if (!isMarked(e)) return 1;
    return 1 + MARK_BONUS + (hasCard('keen_eye') ? 0.25 * cardMul('keen_eye', 'effect') : 0);
  },

  pickupHelpers() { return state().falcons; },

  // ---------------------------------------------------------- abilities

  /** Shortbow: fast arrows toward the cursor. */
  strike(dt: number, attacking: boolean) {
    const cs = state(), p = run.player;
    cs.attackTimer -= dt;
    if (!attacking || cs.attackTimer > 0) return;
    const count = 1 + run.stats.extraProjectiles + (hasCard('twin_arrows') ? 1 + cardExtraProjectiles('twin_arrows') : 0);
    let damage = 9 * (hasCard('twin_arrows') ? 0.75 * cardMul('twin_arrows', 'damage') : 1);
    if (hasCard('piercing_arrows')) damage *= cardMul('piercing_arrows', 'damage');
    if (cs.empowered > 0) { cs.empowered--; damage *= 2 * cardMul('feather_fall', 'damage'); }
    const pierce = hasCard('piercing_arrows') ? 2 : 0;
    const life = 0.9 * (hasCard('piercing_arrows') ? 1.3 * cardMul('piercing_arrows', 'range') : 1);
    for (let i = 0; i < count; i++) {
      const a = p.face + (i - (count - 1) / 2) * 0.1;
      fireShot({
        x: p.x, y: p.y, vx: Math.cos(a) * ARROW_SPEED, vy: Math.sin(a) * ARROW_SPEED,
        r: 3, dmg: damage, pierce, life, color: ARROW_COLOR, kind: 'bolt', tag: 'arrow',
      });
    }
    cs.shots++;
    cs.attackTimer = 0.32 / run.stats.attackSpeed;
  },

  /** Mark Prey: a heavy arrow that marks the first enemy it hits; your falcons dive on it at once. */
  heavy() {
    const p = run.player;
    const spread = hasCard('spread_mark');
    const count = spread ? 3 + cardExtraProjectiles('spread_mark') : 1;
    const damage = 9 * 2.2 * (spread ? 0.8 * cardMul('spread_mark', 'damage') : 1);
    for (let i = 0; i < count; i++) {
      const a = p.face + (i - (count - 1) / 2) * 0.2;
      fireShot({
        x: p.x, y: p.y, vx: Math.cos(a) * 700, vy: Math.sin(a) * 700, r: 5, dmg: damage, life: 1,
        heavy: true, knock: 8, color: MARK_COLOR, kind: 'heavybolt', tag: 'mark',
        onHit: (_s, e) => markPrey(e),
      });
    }
  },

  /** Feather Step: a quick hop. Cards make your falcon swoop with you, or power up the next arrows. */
  dash() {
    const p = run.player, cs = state();
    if (hasCard('feather_fall')) cs.empowered = Math.round(3 * cardMul('feather_fall', 'effect'));
    if (hasCard('swoop_guard')) {
      const radius = 90 * run.stats.area * cardMul('swoop_guard', 'range');
      for (const e of enemiesInRadius(p.x, p.y, radius)) hitEnemy(e, 10 * cardMul('swoop_guard', 'damage'), { tag: 'talon', color: FEATHER_COLOR });
      spawnBurst(p.x, p.y, FEATHER_COLOR, 10, 160);
    }
    return featherStepShape();
  },
  dashShape: () => featherStepShape(),

  /** Sky Hunt: falcons dive on enemies all over the screen. */
  ult() {
    const cs = state();
    cs.huntTime = 8 + (hasCard('long_hunt') ? 3 * cardMul('long_hunt', 'duration') : 0);
    cs.huntTimer = 0;
  },

  update(dt: number) {
    const cs = state();
    for (const id of Object.keys(cs.marks)) {
      const key = Number(id);
      cs.marks[key] -= dt;
      if (cs.marks[key] <= 0 || !run.enemies.some((e) => e.id === key && !e.dead)) delete cs.marks[key];
    }
    updateFalcons(dt);
    updateSkyHunt(dt);
    updateVolley(dt);
    updateFeatherFetch(dt);
  },

  draw() {
    const cs = state();
    // marks on prey (drawn by enemy id, so it works on online clients too)
    for (const e of run.enemies) {
      if (!cs.marks[e.id] || e.dead) continue;
      ctx.strokeStyle = MARK_COLOR;
      ctx.lineWidth = 2;
      const r = e.r + 7 + Math.sin(run.time * 8) * 1.5;
      ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(e.x - r - 4, e.y); ctx.lineTo(e.x - r + 4, e.y);
      ctx.moveTo(e.x + r - 4, e.y); ctx.lineTo(e.x + r + 4, e.y);
      ctx.moveTo(e.x, e.y - r - 4); ctx.lineTo(e.x, e.y - r + 4);
      ctx.stroke();
    }
    for (const f of cs.falcons) drawFalcon(f);
  },

  resource() {
    const marked = Object.keys(state().marks).length;
    return { label: 'Marked prey', value: marked, frac: Math.min(1, marked / 3), color: MARK_COLOR };
  },
});

const featherStepShape = (): DashOverride => ({ dist: 130 });

const newFalcon = (p: Point, orbit: number): Falcon => ({ x: p.x, y: p.y - 40, orbit, diveTimer: 0.5, diveId: 0, pickupRadius: 55 });

const isMarked = (e: Enemy): boolean => !!state().marks[e.id];

function markPrey(e: Enemy): void {
  const cs = state();
  if (e.dead) return;
  const seconds = MARK_SECONDS * (hasCard('keen_eye') ? 1.5 * cardMul('keen_eye', 'duration') : 1);
  cs.marks[e.id] = seconds;
  addFloatingText(e.x, e.y - e.r - 10, 'marked', MARK_COLOR, 10);
  if (hasCard('barbed_mark')) applyBleed(e, 5 * cardMul('barbed_mark', 'damage'), 4 * cardMul('barbed_mark', 'duration'));
  if (hasCard('pinning_shot') && !e.boss) e.rootTime = Math.max(e.rootTime, 1.5 * cardMul('pinning_shot', 'duration'));
  // every falcon drops what it's doing and dives at the new prey
  for (const f of cs.falcons) { f.diveId = e.id; f.diveTimer = 0; }
}

/** How many falcons you should have right now. */
const falconCount = (): number => 1 + (hasCard('second_falcon') ? 1 + cardExtraProjectiles('second_falcon') : 0);

/** Falcons circle above you, dive on marked prey (or the nearest enemy), and fetch pickups. */
function updateFalcons(dt: number): void {
  const cs = state(), p = run.player;
  while (cs.falcons.length < falconCount()) cs.falcons.push(newFalcon(p, cs.falcons.length * 2));
  const pair = isEvolved('second_falcon');
  const fetch = hasCard('feather_fetch') ? 1.6 * cardMul('feather_fetch', 'range') : 1;
  cs.falcons.forEach((f, i) => {
    f.pickupRadius = 55 * fetch;
    f.diveTimer -= dt;
    let prey = f.diveId ? run.enemies.find((e) => e.id === f.diveId && !e.dead) ?? null : null;
    if (!prey && f.diveTimer <= 0) {
      const marked = run.enemies.find((e) => !e.dead && isMarked(e) && distSq(e, p) < 500 * 500);
      prey = marked ?? nearestEnemy(p.x, p.y, 320);
      f.diveId = prey ? prey.id : 0;
    }
    if (prey) {
      // dive: fly straight at it, strike on contact, then climb back up
      const a = Math.atan2(prey.y - f.y, prey.x - f.x), speed = 520 * (hasCard('second_falcon') ? cardMul('second_falcon', 'speed') : 1);
      f.x += Math.cos(a) * speed * dt;
      f.y += Math.sin(a) * speed * dt;
      if (distSq(f, prey) < (prey.r + 8) ** 2) {
        const damage = 11 * (1 + 0.1 * run.wave) * (pair ? 1.5 : 1) * (hasCard('second_falcon') ? cardMul('second_falcon', 'damage') : 1);
        hitEnemy(prey, damage, { tag: 'talon', color: FEATHER_COLOR });
        spawnBurst(prey.x, prey.y, FEATHER_COLOR, 4, 70);
        f.diveId = 0;
        f.diveTimer = (pair ? 0.45 : 0.9) + i * 0.1;
      }
    } else {
      // circle above the player
      f.orbit += dt * 2.2;
      const gx = p.x + Math.cos(f.orbit + i * 2) * 36, gy = p.y - 34 + Math.sin(f.orbit + i * 2) * 14;
      f.x += (gx - f.x) * Math.min(1, dt * 6);
      f.y += (gy - f.y) * Math.min(1, dt * 6);
    }
    if (distSq(f, p) > 600 * 600) { f.x = p.x; f.y = p.y - 40; f.diveId = 0; }
  });
}

function updateSkyHunt(dt: number): void {
  const cs = state(), p = run.player;
  if (cs.huntTime <= 0) return;
  cs.huntTime -= dt;
  cs.huntTimer -= dt;
  const flock = 5 + (hasCard('talon_storm') ? 2 + 2 * cardExtraProjectiles('talon_storm') : 0);
  while (cs.huntTimer <= 0) {
    cs.huntTimer += 1 / (flock * (hasCard('talon_storm') ? cardMul('talon_storm', 'speed') : 1));
    const targets = run.enemies.filter((e) => !e.dead && distSq(e, p) < 520 * 520);
    if (!targets.length) break;
    const prey = targets.find(isMarked) && Math.random() < 0.4 ? targets.find(isMarked)! : randPick(targets);
    const damage = 16 * (1 + 0.12 * run.wave) * (hasCard('long_hunt') ? 1.3 * cardMul('long_hunt', 'damage') : 1);
    spawnLine(prey.x - 60, prey.y - 160, prey.x, prey.y, FEATHER_COLOR, 3);
    hitEnemy(prey, damage, { tag: 'talon', color: FEATHER_COLOR });
  }
  if (cs.huntTime > 0 || !hasCard('feather_rain')) return;
  // Feather Rain: the hunt ends with a burst of feathers
  const radius = 160 * run.stats.area * cardMul('feather_rain', 'range');
  damageInCircle(p.x, p.y, radius, 25 * cardMul('feather_rain', 'damage') * (1 + 0.1 * run.wave), { color: FEATHER_COLOR, noSteal: true });
  spawnBurst(p.x, p.y, FEATHER_COLOR, 30, 220);
}

/** Volley: arrows rain on the biggest nearby group. */
function updateVolley(dt: number): void {
  const cs = state(), p = run.player;
  if (!hasCard('volley')) return;
  cs.volleyTimer -= dt;
  if (cs.volleyTimer > 0) return;
  const storm = isEvolved('volley');
  cs.volleyTimer = (storm ? 3 : 6) / cardMul('volley', 'speed');
  // aim at the enemy with the most neighbours
  let best: Enemy | null = null, bestCount = 0;
  for (const e of run.enemies) {
    if (e.dead || distSq(e, p) > 480 * 480) continue;
    const n = enemiesInRadius(e.x, e.y, 80).length;
    if (n > bestCount) { bestCount = n; best = e; }
  }
  if (!best) return;
  const arrows = (6 + 2 * cardExtraProjectiles('volley')) * (storm ? 2 : 1);
  for (let i = 0; i < arrows; i++) {
    const x = best.x + randRange(-60, 60), y = best.y + randRange(-60, 60);
    spawnLine(x - 20, y - 70, x, y, ARROW_COLOR, 2);
    damageInCircle(x, y, 22, 8 * cardMul('volley', 'damage') * (1 + 0.1 * run.wave), { color: ARROW_COLOR, noCrit: true });
  }
}

/** Feather Fetch: now and then a falcon brings back a heal orb. */
function updateFeatherFetch(dt: number): void {
  const cs = state();
  if (!hasCard('feather_fetch')) return;
  const golden = isEvolved('feather_fetch') && relicLevel('magnet') > 0;
  cs.featherTimer -= dt;
  if (cs.featherTimer > 0) return;
  cs.featherTimer = golden ? 6 : 12;
  const f = cs.falcons[0];
  if (f) dropCoin(f.x, f.y, 6 * cardMul('feather_fetch', 'heal') * (golden ? 2 : 1), 'heal');
}

function drawFalcon(f: Falcon): void {
  const flap = Math.sin(run.time * 14 + f.orbit) * 4;
  ctx.fillStyle = FEATHER_COLOR;
  ctx.beginPath();
  ctx.moveTo(f.x - 10, f.y - 2 + flap); ctx.lineTo(f.x, f.y + 2); ctx.lineTo(f.x + 10, f.y - 2 + flap); ctx.lineTo(f.x, f.y - 3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#5a3d22';
  ctx.beginPath(); ctx.arc(f.x, f.y - 1, 3, 0, TAU); ctx.fill();
  ctx.fillStyle = COLOR.gold;
  ctx.fillRect(f.x + 2, f.y - 2, 2, 2);
}
