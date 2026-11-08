// ============================================================ maps and map levels (docs/progression.md 5.3)
// Each map has one modifier, a look, an enemy mix and a reward multiplier. Every map also has levels 1-10:
// each level adds one modifier on top of the ones before it. Level 1 of the Whispering Forest changes
// nothing, so a default run plays exactly as before.
// Pure data and rules (the save module reads it too); the hazards themselves live in world/hazards.ts.
import type { EnemyTypeId } from '../types';
import { run } from '../core/state';

export interface MapDef {
  id: string;
  name: string;
  /** Difficulty, 1-5 (shown as stars). Higher-star maps drop better loot. */
  stars: number;
  /** Gold, EXP and score multiplier. */
  rewardMul: number;
  /** The one rule this map adds, as shown on map select. */
  modifier: string;
  /** Gold to open it early (otherwise: reach wave 6 on the map before it, or win it). */
  price: number;
  ground: { fill: string; grid: string; decor: [string, string] };
  /** Spawn weight multipliers by enemy type (the map's usual crowd). */
  spawnMul?: Partial<Record<EnemyTypeId, number>>;
  /** Darkness: you see this far around your hero. Warnings and enemy shots still show. */
  vision?: number;
  /** Mushrooms that puff poison when a hero comes close. */
  mushrooms?: number;
  /** Lava cracks that burn heroes standing in them. */
  lavaCracks?: number;
  /** Enemies regain this share of their max HP per second (not bosses). */
  enemyRegen?: number;
}

export const MAPS: MapDef[] = [
  {
    id: 'forest', name: 'Whispering Forest', stars: 1, rewardMul: 1.0, price: 0, modifier: 'No modifier: a good place to learn',
    ground: { fill: '#17121e', grid: '#1f1828', decor: ['#231b2e', '#1f2a26'] },
  },
  {
    id: 'crypt', name: 'Sunken Crypt', stars: 2, rewardMul: 1.15, price: 400, modifier: 'Darkness: you only see around you. More undead',
    ground: { fill: '#10121a', grid: '#181c28', decor: ['#1c2232', '#232031'] }, vision: 270,
    spawnMul: { archer: 1.6, wraith: 1.8, cultist: 1.4, caller: 1.4, bat: 1.4 },
  },
  {
    id: 'grotto', name: 'Fungal Grotto', stars: 3, rewardMul: 1.3, price: 800, modifier: 'Mushrooms burst into poison when you get close. More toads and slimes',
    ground: { fill: '#121a14', grid: '#1a241c', decor: ['#20321f', '#2c2240'] }, mushrooms: 16,
    spawnMul: { toad: 2, slime: 1.5, bigslime: 2 },
  },
  {
    id: 'ember', name: 'Ember Wastes', stars: 3, rewardMul: 1.4, price: 1200, modifier: 'Lava cracks burn you. More imps and boars',
    ground: { fill: '#1c1210', grid: '#281a16', decor: ['#33201a', '#2a1a1e'] }, lavaCracks: 9,
    spawnMul: { imp: 2, boar: 1.6 },
  },
  {
    id: 'bloodmoon', name: 'Bloodmoon Village', stars: 4, rewardMul: 1.5, price: 1800, modifier: 'Enemies slowly heal. More wraiths and healers',
    ground: { fill: '#1a0f14', grid: '#26141c', decor: ['#341822', '#22131c'] }, enemyRegen: 0.015,
    spawnMul: { wraith: 1.5, cultist: 1.5 },
  },
];

export const DEFAULT_MAP = MAPS[0].id;
export const MAX_MAP_LEVEL = 10;
export const mapDef = (id: string): MapDef => MAPS.find((m) => m.id === id) ?? MAPS[0];
/** The map before this one (it unlocks this one), or null for the first. */
export const previousMap = (id: string): MapDef | null => MAPS[MAPS.findIndex((m) => m.id === id) - 1] ?? null;

// ------------------------------------------------------------ map levels

/** Everything a map level changes, all multipliers 1 (or nothing) at level 1. */
export interface LevelMods {
  enemyHp: number;
  enemyDamage: number;
  enemySpeed: number;
  /** First wave that can have elites. */
  eliteFromWave: number;
  /** Healer heals and the time casters need to channel. */
  healMul: number;
  channelMul: number;
  /** Heal orbs from elites and bosses. */
  healOrbMul: number;
  /** Spawn rate and the enemy cap. */
  spawnMul: number;
  bossHp: number;
}

/** Each level's addition, shown on map select. Level N has every change up to N. */
export const LEVEL_LADDER: { text: string; apply(m: LevelMods): void }[] = [
  { text: 'The normal map', apply() {} },
  { text: 'Enemies +15% HP', apply(m) { m.enemyHp *= 1.15; } },
  { text: 'Elites from wave 4', apply(m) { m.eliteFromWave = 4; } },
  { text: 'Healers heal 50% more; casters channel 20% faster', apply(m) { m.healMul *= 1.5; m.channelMul *= 0.8; } },
  { text: 'Enemies 10% faster', apply(m) { m.enemySpeed *= 1.1; } },
  { text: 'Heal orbs restore half', apply(m) { m.healOrbMul *= 0.5; } },
  { text: 'Enemies +15% HP again', apply(m) { m.enemyHp *= 1.15; } },
  { text: 'Enemies +15% damage', apply(m) { m.enemyDamage *= 1.15; } },
  { text: '20% more enemies', apply(m) { m.spawnMul *= 1.2; } },
  { text: 'Bosses +30% HP', apply(m) { m.bossHp *= 1.3; } },
];

export function levelMods(level: number): LevelMods {
  const m: LevelMods = { enemyHp: 1, enemyDamage: 1, enemySpeed: 1, eliteFromWave: 7, healMul: 1, channelMul: 1, healOrbMul: 1, spawnMul: 1, bossHp: 1 };
  LEVEL_LADDER.slice(0, Math.max(1, Math.min(MAX_MAP_LEVEL, level))).forEach((step) => step.apply(m));
  return m;
}

/** Gold, EXP and score multiplier for a map at a level: the map's own, plus 15% per level above 1. */
export const mapRewardMul = (mapId: string, level: number): number => mapDef(mapId).rewardMul * (1 + 0.15 * (Math.max(1, level) - 1));

/** Loot gets better on harder maps and levels: points moved from Common to Rare (3) and Epic (1) per step. */
export const lootShift = (mapId: string, level: number): number => 4 * (mapDef(mapId).stars - 1) + 4 * (Math.max(1, level) - 1);

/** This run's level modifiers (cached per run: they only depend on the level). */
let cachedMods: { level: number; mods: LevelMods } | null = null;
export function currentMods(): LevelMods {
  const level = run?.mapLevel ?? 1;
  if (!cachedMods || cachedMods.level !== level) cachedMods = { level, mods: levelMods(level) };
  return cachedMods.mods;
}
