// ============================================================ snapshots: the host's world, sent to the other players
// The host runs the only simulation. About 20 times a second it sends a snapshot of what the
// screens need to draw; joined players rebuild a read-only `run` from it and render that.
// Busy lists (enemies, shots, zones, gems) are packed into arrays to keep messages small.
import type { Hazard } from '../types';
import type {
  Boss, Coin, EnemyTypeId, Fx, FloatingText, Gem, Hero, Mob, Offer, Player, Run, RunResult, SafeZone, SceneId, Shot,
  Banner, Stats, Telegraph, Zone,
} from '../types';
import { CLASSES } from '../classes/registry';
import { createRunShell, emptyInput } from '../game/run';
import { ENEMY_TYPES, STRIKE_TIME } from '../world/enemies';

const TYPE_IDS = Object.keys(ENEMY_TYPES) as EnemyTypeId[];
const ZONE_KINDS: Zone['kind'][] = ['pool', 'net', 'smoke', 'spikes', 'fire', 'light', 'holyfire', 'ring', 'trap', 'mine'];
/** New particles / texts per snapshot, so a huge explosion can't blow up the message size. */
const MAX_NEW_FX = 90;
const MAX_NEW_TEXTS = 40;
const MAX_ZONES = 160;

/** [id, type, x, y, face, hpFrac, flags, r] */
type PackedMob = [number, number, number, number, number, number, number, number];
const FLAG = { elite: 1, flash: 2, charm: 4, root: 8, shieldBroken: 16, toughBar: 32, phased: 64, dazed: 128, strike: 256, windup: 512 } as const;
/** [x, y, vx, vy, r, color, kind, hostile (1/0)] */
type PackedShot = [number, number, number, number, number, string, string, number];
/** [kind, x, y, r, life, color, currentR, t, hostile (1/0)] */
type PackedZone = [number, number, number, number, number, string, number, number, number];

export interface HeroSnap {
  idx: number;
  name: string;
  classId: string;
  down: boolean;
  revive: number;
  gone: boolean;
  player: Player;
  stats: Stats;
  cardSlots: number;
  cards: Hero['cards'];
  relics: Hero['relics'];
  statCards: Hero['statCards'];
  pendingLevelUps: number;
  offer: Offer | null;
  rerolls: number;
  coinsHeld: number;
  magnetAllTime: number;
  allies: Hero['allies'];
  classState: unknown;
  ack?: number;
  score: Hero['score'];
  accessories: Hero['accessories'];
  slayer: Hero['slayer'];
  tally: Hero['tally'];
}

export interface Snapshot {
  mapId: string;
  mapLevel: number;
  hazards: Hazard[];
  t: 'snap';
  scene: SceneId;
  time: number;
  wave: number;
  waveTime: number;
  waveDuration: number;
  bossesKilled: number;
  wavesCleared: number;
  kills: number;
  shake: number;
  banner: Banner | null;
  safeZone: SafeZone | null;
  result: RunResult | null;
  heroes: HeroSnap[];
  mobs: PackedMob[];
  bosses: Boss[];
  shots: PackedShot[];
  zones: PackedZone[];
  gems: [number, number, number][];
  coins: [number, number, number][];
  telegraphs: Telegraph[];
  fx: Fx[];
  texts: FloatingText[];
}

// ------------------------------------------------------------ host: encode

/** Effects already sent once. Clients animate them on their own after that. */
const sentFx = new WeakSet<object>();

/** Round to 2 decimals: plenty for drawing, much shorter JSON. Sets become a marker (see `reviver`). */
function replacer(_key: string, value: unknown): unknown {
  if (typeof value === 'number') return Math.round(value * 100) / 100;
  if (typeof value === 'function') return undefined;
  if (value instanceof Set) return { $set: 1 };
  if (value instanceof Map) return undefined;
  return value;
}

const r1 = (n: number): number => Math.round(n * 10) / 10;

function packMob(e: Mob): PackedMob {
  let flags = 0;
  if (e.elite) flags |= FLAG.elite;
  if (e.flash > 0) flags |= FLAG.flash;
  if (e.charmTime > 0) flags |= FLAG.charm;
  if (e.rootTime > 0) flags |= FLAG.root;
  if (e.shieldBroken) flags |= FLAG.shieldBroken;
  if (e.maxHp > 30) flags |= FLAG.toughBar;
  if (e.phased) flags |= FLAG.phased;
  if ((e.dazedTime ?? 0) > 0) flags |= FLAG.dazed;
  if (e.strikeTime) flags |= FLAG.strike;
  if (e.windup) flags |= FLAG.windup;
  return [e.id, TYPE_IDS.indexOf(e.type), r1(e.x), r1(e.y), e.face, e.hp / e.maxHp, flags, e.r];
}

const packShot = (s: Shot): PackedShot => [r1(s.x), r1(s.y), r1(s.vx), r1(s.vy), s.r, s.color || '', s.kind || '', s.owner === 'enemy' ? 1 : 0];

function packZone(z: Zone): PackedZone {
  return [ZONE_KINDS.indexOf(z.kind), r1(z.x), r1(z.y), z.r, z.life, z.color || '', z.kind === 'ring' ? z.currentR : 0, z.t, z.owner === 'enemy' ? 1 : 0];
}

/** Effects not sent yet, newest kept when there are too many. */
function takeNew<T extends object>(list: T[], max: number): T[] {
  const fresh = list.filter((item) => !sentFx.has(item));
  for (const item of fresh) sentFx.add(item);
  return fresh.slice(-max);
}

function snapHero(h: Hero): HeroSnap {
  return {
    idx: h.idx, name: h.name, classId: h.classId, down: h.down, revive: h.revive, gone: h.gone,
    player: h.player, stats: h.stats, cardSlots: h.cardSlots, cards: h.cards, relics: h.relics, statCards: h.statCards,
    pendingLevelUps: h.pendingLevelUps, offer: h.offer, rerolls: h.rerolls, coinsHeld: h.coinsHeld,
    magnetAllTime: h.magnetAllTime, allies: h.allies, classState: h.classState, ack: h.ack, score: h.score, accessories: h.accessories, slayer: h.slayer, tally: h.tally,
  };
}

/** The host's world as a JSON message. */
export function encodeSnapshot(run: Run, scene: SceneId): string {
  const snap: Snapshot = {
    t: 'snap', scene,
    time: run.time, wave: run.wave, waveTime: run.waveTime, waveDuration: run.waveDuration,
    mapId: run.mapId, mapLevel: run.mapLevel, hazards: run.hazards,
    bossesKilled: run.bossesKilled, wavesCleared: run.wavesCleared, kills: run.kills,
    shake: run.shake, banner: run.banner, safeZone: run.safeZone, result: run.result,
    heroes: run.heroes.map(snapHero),
    mobs: run.enemies.filter((e): e is Mob => !e.boss && !e.dead).map(packMob),
    bosses: run.enemies.filter((e): e is Boss => e.boss && !e.dead),
    shots: run.shots.filter((s) => !s.dead).map(packShot),
    zones: run.zones.slice(-MAX_ZONES).map(packZone),
    gems: run.gems.map((g) => [Math.round(g.x), Math.round(g.y), g.big ? 1 : 0]),
    coins: run.coins.map((c) => [Math.round(c.x), Math.round(c.y), c.kind === 'heal' ? 1 : 0]),
    telegraphs: run.telegraphs,
    fx: takeNew(run.fx, MAX_NEW_FX),
    texts: takeNew(run.floatingTexts, MAX_NEW_TEXTS),
  };
  return JSON.stringify(snap, replacer);
}

// ------------------------------------------------------------ client: decode

/** Turns the Set markers back into (empty) Sets, so class code that expects one keeps working. */
function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && (value as { $set?: number }).$set === 1) return new Set();
  return value;
}

export const parseMessage = (text: string): { t: string } & Record<string, unknown> => JSON.parse(text, reviver);

function unpackMob(m: PackedMob): Mob {
  const [id, typeIdx, x, y, face, hpFrac, flags, r] = m;
  const type = TYPE_IDS[typeIdx] ?? 'slime';
  const maxHp = flags & FLAG.toughBar ? 100 : 1;
  return {
    id, type, x, y, face, r,
    hp: hpFrac * maxHp, maxHp,
    color: ENEMY_TYPES[type].color,
    elite: !!(flags & FLAG.elite),
    flash: flags & FLAG.flash ? 1 : 0,
    charmTime: flags & FLAG.charm ? 1 : 0,
    rootTime: flags & FLAG.root ? 1 : 0,
    shieldBroken: !!(flags & FLAG.shieldBroken),
    phased: !!(flags & FLAG.phased),
    dazedTime: flags & FLAG.dazed ? 1 : 0,
    strikeTime: flags & FLAG.strike ? STRIKE_TIME / 2 : 0, // mid-lunge: the furthest point
    windup: flags & FLAG.windup ? 1 : 0,
    hasShield: !!ENEMY_TYPES[type].shield,
    boss: false, dead: false, undead: false, speed: 0, damage: 0, xp: 0, contactCooldown: 0,
    knockX: 0, knockY: 0, attackTimer: 0, wobble: 0,
    slowTime: 0, fearTime: 0, confuseTime: 0, bleedDps: 0, bleedTime: 0,
  };
}

function unpackShot(s: PackedShot): Shot {
  const [x, y, vx, vy, r, color, kind, hostile] = s;
  // drawn only; a player shot's hero / pierce / hit set don't matter on a joined screen
  if (!hostile) return { owner: 'player', hero: 0, hitSet: new Set(), pierce: 0, x, y, vx, vy, r, dmg: 0, life: 1, color: color || undefined, kind: kind || undefined };
  return { owner: 'enemy', x, y, vx, vy, r, dmg: 0, life: 1, color: color || undefined, kind: kind || undefined };
}

function unpackZone(z: PackedZone): Zone {
  const [kindIdx, x, y, r, life, color, currentR, t, hostile] = z;
  const kind = ZONE_KINDS[kindIdx] ?? 'pool';
  return {
    kind, x, y, r, life, t, color: color || undefined, currentR, max: life,
    owner: hostile ? 'enemy' : 'player', hero: 0, tick: 1, tickTimer: 0,
    startR: 0, endR: 0, dur: 1, dmg: 0, delay: 0, root: 0,
  } as Zone;
}

function heroFromSnap(s: HeroSnap): Hero {
  return {
    ...s,
    cls: CLASSES[s.classId],
    firstOffer: false,
    input: emptyInput(),
    bot: false,
  };
}

/**
 * Build a drawable run from a snapshot. `previous` is the client's last run: its particles and
 * floating texts carry over (snapshots only include new ones).
 */
export function decodeSnapshot(snap: Snapshot, localHero: number, previous: Run | null): Run {
  const heroes = snap.heroes.map(heroFromSnap);
  const run = createRunShell(heroes, Math.min(localHero, heroes.length - 1));
  const enemies = [...snap.mobs.map(unpackMob), ...snap.bosses];
  Object.assign(run, {
    time: snap.time, wave: snap.wave, waveTime: snap.waveTime, waveDuration: snap.waveDuration,
    mapId: snap.mapId, mapLevel: snap.mapLevel, hazards: snap.hazards ?? [],
    bossesKilled: snap.bossesKilled, wavesCleared: snap.wavesCleared, kills: snap.kills,
    shake: snap.shake, banner: snap.banner, safeZone: snap.safeZone, result: snap.result,
    enemies,
    boss: snap.bosses[0] ?? null,
    shots: snap.shots.map(unpackShot),
    zones: snap.zones.map(unpackZone),
    gems: snap.gems.map(([x, y, big]): Gem => ({ x, y, value: 0, big: !!big, magnetized: false })),
    coins: snap.coins.map(([x, y, heal]): Coin => ({ x, y, value: 0, kind: heal ? 'heal' : 'coin' })),
    telegraphs: snap.telegraphs,
    fx: [...(previous ? previous.fx : []), ...snap.fx],
    floatingTexts: [...(previous ? previous.floatingTexts : []), ...snap.texts],
    camera: previous ? previous.camera : { x: 0, y: 0 },
  });
  return run;
}
