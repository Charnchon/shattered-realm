// ============================================================ saved progress, rewards and class unlocks
// Saved in this browser (localStorage). No accounts: each player keeps their own progress,
// online too. If storage is unavailable (private window, tests), progress lives in memory.
// The save is versioned: older saves are migrated, a backup of the last good save is kept, and a
// save from a newer version of the game is never overwritten. See docs/progression.md.
import {
  LOADOUT_SLOTS, accessoryDef, cleanLoadout, duplicateGold, maxLevelOf, rollAccessory, upgradeCost,
  type EquippedAccessory,
} from './accessories';
import { applyRunToGoals, cleanSlayer, fillBounties, slayerTier, type Completion } from './goals';
import type { RunTally } from '../types';
import { DEFAULT_MAP, MAPS, MAX_MAP_LEVEL, lootShift, mapDef, mapRewardMul, previousMap } from '../world/maps';

/** Classes open from the start (phase 1 roster). */
export const STARTER_CLASSES = ['traveler', 'oathknight', 'bounty_hunter', 'cleric'];

/** How a finished run is judged, for unlocks, rewards and high scores. */
export interface RunRecord {
  /** The class this player played. */
  classId: string;
  wavesCleared: number;
  bossesKilled: number;
  win: boolean;
  /** Team kills (the whole party in co-op): used for the score. */
  kills: number;
  /** This player's own kills: used for their rewards, so co-op doesn't inflate them. */
  myKills: number;
  /** Run length in seconds. */
  time: number;
  /** 1 = solo, 2-4 = co-op. */
  players: number;
  /** The class's display name (for milestone texts). */
  className?: string;
  /** Teammates this player revived. */
  revives?: number;
  /** This player's counters (kills by monster, interrupts, ...), for bounties, Slayer and the Codex. */
  tally?: RunTally;
  /** Card ids this player held at the end, and which of them evolved (Codex). */
  cards?: string[];
  evolved?: string[];
  /** The map and level played (default: Whispering Forest, level 1). */
  mapId?: string;
  mapLevel?: number;
  /** Knock-outs across the whole party (a clear with none earns a mastery star). */
  teamDowns?: number;
}

/** One line of the high-score table. */
export interface HighScore {
  score: number;
  classId: string;
  /** Wave reached (the wave the run ended on, or 12 for a win). */
  wave: number;
  win: boolean;
  time: number;
  players: number;
  /** When it was played (YYYY-MM-DD). */
  date: string;
  mapId?: string;
  mapLevel?: number;
}

/** Entries kept in the high-score table. */
export const HIGH_SCORE_LIMIT = 10;

/** A run's score: waves and bosses matter most, kills break ties, a win is a big bonus; harder maps and levels multiply it. */
export function runScore(r: Pick<RunRecord, 'wavesCleared' | 'bossesKilled' | 'kills' | 'win' | 'mapId' | 'mapLevel'>): number {
  const base = 500 * r.wavesCleared + 2000 * r.bossesKilled + 10 * (r.kills || 0) + (r.win ? 5000 : 0);
  return Math.round(base * mapRewardMul(r.mapId ?? DEFAULT_MAP, r.mapLevel ?? 1));
}

// ------------------------------------------------------------ rewards and Specialist levels

/** Gold bonus for playing together (2+ players). */
export const COOP_GOLD_BONUS = 0.1;
/** Highest Specialist level per class. */
export const SPECIALIST_MAX_LEVEL = 15;

/** What a run pays out (docs/progression.md, section 2). Maps and map levels will multiply this later. */
export function runRewards(r: Pick<RunRecord, 'wavesCleared' | 'bossesKilled' | 'win' | 'myKills' | 'players' | 'mapId' | 'mapLevel'>): { gold: number; exp: number } {
  const kills = r.myKills || 0, coop = (r.players || 1) > 1 ? 1 + COOP_GOLD_BONUS : 1;
  const map = mapRewardMul(r.mapId ?? DEFAULT_MAP, r.mapLevel ?? 1); // harder map and level: more of everything
  return {
    gold: Math.round((15 * r.wavesCleared + 60 * r.bossesKilled + kills / 5 + (r.win ? 250 : 0)) * coop * map),
    exp: Math.round((20 * r.wavesCleared + 80 * r.bossesKilled + kills / 5 + (r.win ? 200 : 0)) * map),
  };
}

/** Specialist EXP needed to go from `level` to the next (cheap early levels: one after the first run). */
export const expToNext = (level: number): number => 100 * level;

/** Level reached with `exp` total EXP, how far into the next level, and how much that level needs (0 at max). */
export function specialistLevel(exp: number): { level: number; into: number; need: number } {
  let level = 1, left = Math.max(0, exp);
  while (level < SPECIALIST_MAX_LEVEL && left >= expToNext(level)) { left -= expToNext(level); level++; }
  return level >= SPECIALIST_MAX_LEVEL ? { level, into: 0, need: 0 } : { level, into: left, need: expToNext(level) };
}

/** A class's total Specialist EXP. */
export const classExp = (classId: string): number => getProgress().classes[classId]?.exp ?? 0;

/** What the most recent run paid this screen's player (the result screen's rewards reel). */
export interface RunRewards {
  classId: string;
  gold: number;
  exp: number;
  /** Class EXP before this run (the reel animates from here). */
  expBefore: number;
  goldBefore: number;
  coopBonus: boolean;
  /** False in test mode and bot runs: shown, but not saved. */
  saved: boolean;
  /** The final boss's drop (wins only). */
  loot: LootResult | null;
  /** Bounties, milestones and Slayer tiers finished this run. */
  completions: Completion[];
  /** Class EXP from milestones, on top of `exp` (the reel's EXP bar includes it). */
  bonusExp: number;
  /** Map news from this run: "Sunken Crypt opened", "Level 3 unlocked", mastery stars. */
  mapNews: string[];
}

/** What the final boss dropped for this player. */
export interface LootResult {
  id: string;
  /** Its level after the drop (a duplicate levels it up). */
  level: number;
  isNew: boolean;
  /** A duplicate of a max-level accessory turns into gold instead. */
  gold: number;
}

// ------------------------------------------------------------ unlocks

export interface UnlockRule {
  classId: string;
  /** Shown on the class select screen while locked. */
  text: string;
  /** Or buy it with gold, so nobody gets stuck. */
  price: number;
  isMet(run: RunRecord): boolean;
}

/** Locked classes and how to earn them. Bosses come in order, so "2 bosses killed" = beat Boss 2. */
export const UNLOCKS: UnlockRule[] = [
  { classId: 'vampire', text: 'Beat the first boss (wave 3) as the Traveler', price: 500, isMet: (r) => r.classId === 'traveler' && r.bossesKilled >= 1 },
  { classId: 'necro', text: 'Beat the second boss (wave 6) with any class', price: 800, isMet: (r) => r.bossesKilled >= 2 },
];

// ------------------------------------------------------------ the save

export const SAVE_VERSION = 2;

/** Per-class progress. Skill picks, Run Builds and loadouts join this later. */
export interface ClassProgress {
  /** Total Specialist EXP earned with this class. */
  exp: number;
}

export interface Progress {
  version: typeof SAVE_VERSION;
  runs: number;
  wins: number;
  /** Highest wave reached in any run. */
  bestWave: number;
  /** Class ids unlocked so far (starters are always open and not listed). */
  unlocked: string[];
  /** Best runs on this browser, highest first (at most `HIGH_SCORE_LIMIT`). */
  highScores: HighScore[];
  gold: number;
  classes: Record<string, ClassProgress>;
  /** Accessories owned, by id, with their level (1-3). */
  accessories: Record<string, number>;
  /** Ids of the accessories equipped for the next run (at most `LOADOUT_SLOTS`). */
  loadout: string[];
  /** Active bounties with their progress, the rotation position, and how many were finished. */
  bounties: { active: string[]; progress: Record<string, number>; next: number; done: number };
  /** One-off milestones already rewarded. */
  milestones: string[];
  /** Lifetime kills by monster key (Slayer achievements and the bestiary). */
  kills: Record<string, number>;
  /** Cards held at the end of a run ("classId:cardId"), and evolutions made. */
  codex: { cards: string[]; evolved: string[] };
  /** Per map: open, highest level unlocked and won, best wave. The first map is always open. */
  maps: Record<string, MapProgress>;
  /** Mastery per "mapId:classId": bit 1 = cleared, 2 = cleared with nobody downed, 4 = cleared on level 5+. */
  mastery: Record<string, number>;
  /** The map and level picked on class select for the next run. */
  selected: { mapId: string; level: number };
}

export interface MapProgress {
  open: boolean;
  /** Highest level you may pick (win level N to unlock N + 1). */
  level: number;
  /** Highest level won (0 = never). */
  won: number;
  bestWave: number;
}

const STORAGE_KEY = 'shattered-realm.progress';
const BACKUP_KEY = STORAGE_KEY + '.backup';
const fresh = (): Progress => ({ version: SAVE_VERSION, runs: 0, wins: 0, bestWave: 0, unlocked: [], highScores: [], gold: 0, classes: {}, accessories: {}, loadout: [],
  bounties: { active: [], progress: {}, next: 0, done: 0 }, milestones: [], kills: {}, codex: { cards: [], evolved: [] },
  maps: {}, mastery: {}, selected: { mapId: DEFAULT_MAP, level: 1 },
});

let progress: Progress | null = null;
/** True when the stored save comes from a newer version of the game: we play with it but never overwrite it. */
let newerSave = false;
/** Classes unlocked by the most recent run (for the result screen). */
export let lastUnlocked: string[] = [];
/** Place of the most recent run in the high-score table (0 = best), or -1 if it didn't make it. */
export let lastRank = -1;
/** Rewards of the most recent run, for this screen's player. */
export let lastRewards: RunRewards | null = null;

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null; // some browsers throw when storage is blocked
  }
}

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

/**
 * Turn any saved data (version 1, version 2, or hand-edited) into a valid current save.
 * Returns null if it isn't a save at all. Unknown fields are dropped; bad values fall back to defaults.
 */
export function migrate(raw: unknown): Progress | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const s = raw as Record<string, unknown>;
  const classes: Record<string, ClassProgress> = {};
  if (s.classes && typeof s.classes === 'object') {
    for (const [id, c] of Object.entries(s.classes as Record<string, unknown>)) {
      classes[id] = { exp: count((c as ClassProgress | null)?.exp) };
    }
  }
  const accessories: Record<string, number> = {};
  if (s.accessories && typeof s.accessories === 'object') {
    for (const [id, level] of Object.entries(s.accessories as Record<string, unknown>)) {
      const def = accessoryDef(id);
      if (def && typeof level === 'number' && level >= 1) accessories[id] = Math.min(maxLevelOf(def), Math.floor(level));
    }
  }
  const loadout = Array.isArray(s.loadout) ? [...new Set(s.loadout.filter((id): id is string => typeof id === 'string' && id in accessories))] : [];
  // version 1 (before Nov 2026 step A) had no gold or classes: they start at zero
  return {
    version: SAVE_VERSION,
    runs: count(s.runs), wins: count(s.wins), bestWave: count(s.bestWave),
    unlocked: Array.isArray(s.unlocked) ? s.unlocked.filter((id): id is string => typeof id === 'string') : [],
    highScores: Array.isArray(s.highScores) ? s.highScores.filter(isHighScore).slice(0, HIGH_SCORE_LIMIT) : [],
    gold: count(s.gold),
    classes,
    accessories,
    loadout: loadout.slice(0, LOADOUT_SLOTS),
    bounties: cleanBounties(s.bounties),
    milestones: strings(s.milestones),
    kills: counts(s.kills),
    codex: { cards: strings((s.codex as Record<string, unknown> | undefined)?.cards), evolved: strings((s.codex as Record<string, unknown> | undefined)?.evolved) },
    maps: cleanMaps(s.maps),
    mastery: counts(s.mastery),
    selected: cleanSelected(s.selected),
  };
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))] : []);
function counts(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object') for (const [k, n] of Object.entries(v as Record<string, unknown>)) if (count(n) > 0) out[k] = count(n);
  return out;
}
function cleanMaps(v: unknown): Record<string, MapProgress> {
  const out: Record<string, MapProgress> = {};
  if (!v || typeof v !== 'object') return out;
  for (const def of MAPS) {
    const m = (v as Record<string, Record<string, unknown> | undefined>)[def.id];
    if (!m || typeof m !== 'object') continue;
    const clampLevel = (n: unknown, min: number): number => Math.min(MAX_MAP_LEVEL, Math.max(min, Math.floor(count(n))));
    out[def.id] = { open: m.open === true, level: clampLevel(m.level, 1), won: clampLevel(m.won, 0), bestWave: count(m.bestWave) };
  }
  return out;
}
function cleanSelected(v: unknown): Progress['selected'] {
  const s = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const mapId = MAPS.some((m) => m.id === s.mapId) ? String(s.mapId) : DEFAULT_MAP;
  return { mapId, level: Math.min(MAX_MAP_LEVEL, Math.max(1, Math.floor(count(s.level)) || 1)) };
}
function cleanBounties(v: unknown): Progress['bounties'] {
  const b = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return { active: strings(b.active).slice(0, 3), progress: counts(b.progress), next: Math.floor(count(b.next)), done: Math.floor(count(b.done)) };
}

/** Parse one stored string: the save, or null if it's missing or unreadable. Notes a newer-version save. */
function parseSave(raw: string | null | undefined): Progress | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as { version?: unknown };
    if (typeof data?.version === 'number' && data.version > SAVE_VERSION) newerSave = true;
    return migrate(data);
  } catch {
    return null;
  }
}

/** Read the save from storage: the main copy, else the backup, else a fresh start. */
function load(): Progress {
  const store = storage();
  newerSave = false;
  let p: Progress;
  try {
    p = parseSave(store?.getItem(STORAGE_KEY)) ?? parseSave(store?.getItem(BACKUP_KEY)) ?? fresh();
  } catch {
    p = fresh();
  }
  fillBounties(p); // a new or migrated save starts with its first 3 bounties
  return p;
}

/** The saved progress (loaded once, then kept in memory). */
export function getProgress(): Progress {
  if (!progress) progress = load();
  return progress;
}

/**
 * Before changing progress, pick up anything another tab saved since we loaded (two tabs are the easy way
 * to try co-op). Without storage there's nothing to merge.
 */
function refresh(): Progress {
  if (storage()) progress = load();
  return getProgress();
}

function save(): void {
  if (newerSave) return; // never overwrite a save from a newer version of the game
  try {
    const store = storage();
    if (!store) return;
    const previous = store.getItem(STORAGE_KEY);
    if (previous && parseSave(previous)) store.setItem(BACKUP_KEY, previous); // keep the last good save
    store.setItem(STORAGE_KEY, JSON.stringify(getProgress()));
  } catch {
    // storage full or blocked: progress still works for this session
  }
}

export const isClassUnlocked = (classId: string): boolean =>
  STARTER_CLASSES.includes(classId) || !UNLOCKS.some((u) => u.classId === classId) || getProgress().unlocked.includes(classId);

/** How to unlock a class, or '' if it's already open. */
export function unlockText(classId: string): string {
  if (isClassUnlocked(classId)) return '';
  return UNLOCKS.find((u) => u.classId === classId)?.text ?? '';
}

/** Count a finished run: rewards, unlocks and high score. Returns the newly unlocked class ids. */
export function recordRun(record: RunRecord): string[] {
  const p = refresh();
  p.runs++;
  if (record.win) p.wins++;
  p.bestWave = Math.max(p.bestWave, record.wavesCleared + (record.win ? 0 : 1));
  lastRewards = rewardsFor(p, record, true);
  p.gold += lastRewards.gold;
  p.classes[record.classId] = { ...p.classes[record.classId], exp: lastRewards.expBefore + lastRewards.exp };
  if (record.win) lastRewards.loot = dropLoot(p, lootShift(record.mapId ?? DEFAULT_MAP, record.mapLevel ?? 1));
  lastRewards.mapNews = updateMaps(p, record);
  // goals come last: milestones add their own EXP on top of the run's
  lastRewards.completions = applyRunToGoals(p, record);
  lastRewards.bonusExp = lastRewards.completions.reduce((n, c) => n + (c.kind === 'milestone' ? c.exp : 0), 0);
  lastUnlocked = UNLOCKS.filter((u) => !isClassUnlocked(u.classId) && u.isMet(record)).map((u) => u.classId);
  p.unlocked.push(...lastUnlocked);
  lastRank = addHighScore(p, record);
  save();
  return lastUnlocked;
}

/** A test-mode or bot run: show what it would have paid, save nothing. */
export function previewRun(record: RunRecord): void {
  lastRewards = rewardsFor(getProgress(), record, false);
  lastUnlocked = [];
  lastRank = -1;
}

function rewardsFor(p: Progress, record: RunRecord, saved: boolean): RunRewards {
  const { gold, exp } = runRewards(record);
  return {
    classId: record.classId, gold, exp, saved,
    expBefore: p.classes[record.classId]?.exp ?? 0, goldBefore: p.gold, coopBonus: (record.players || 1) > 1, loot: null, completions: [], bonusExp: 0, mapNews: [],
  };
}

/** The final boss's drop: the Shard of the Crown on the first win, then a roll on the loot table. */
function dropLoot(p: Progress, shift: number): LootResult {
  const def = !p.accessories.shard_of_the_crown ? accessoryDef('shard_of_the_crown')! : rollAccessory(Math.random, shift);
  const owned = p.accessories[def.id] ?? 0;
  if (!owned) { p.accessories[def.id] = 1; return { id: def.id, level: 1, isNew: true, gold: 0 }; }
  if (owned < maxLevelOf(def)) { p.accessories[def.id] = owned + 1; return { id: def.id, level: owned + 1, isNew: false, gold: 0 }; }
  const gold = duplicateGold(def);
  p.gold += gold;
  return { id: def.id, level: owned, isNew: false, gold };
}

// ------------------------------------------------------------ spending: loadout, upgrades, classes

/** The accessories equipped for the next run, with their levels (what a hero carries in). */
export const equippedLoadout = (): EquippedAccessory[] =>
  cleanLoadout(getProgress().loadout.map((id) => ({ id, level: getProgress().accessories[id] ?? 0 })).filter((a) => a.level > 0));

/** Equip or take off an owned accessory. Returns false if it isn't owned or all slots are full. */
export function toggleEquip(id: string): boolean {
  const p = refresh();
  if (!p.accessories[id]) return false;
  if (p.loadout.includes(id)) p.loadout = p.loadout.filter((x) => x !== id);
  else if (p.loadout.length < LOADOUT_SLOTS) p.loadout.push(id);
  else return false;
  save();
  return true;
}

/** Spend gold to raise an owned accessory one level. Returns false if it can't be upgraded or gold is short. */
export function upgradeAccessory(id: string): boolean {
  const p = refresh(), def = accessoryDef(id), level = p.accessories[id] ?? 0;
  const cost = def && level ? upgradeCost(def, level) : 0;
  if (!def || !cost || p.gold < cost) return false;
  p.gold -= cost;
  p.accessories[id] = level + 1;
  save();
  return true;
}

// ------------------------------------------------------------ maps: access, levels, mastery, the selection

/** This player's progress on a map (the first map is always open). */
export function mapProgress(mapId: string): MapProgress {
  const m = getProgress().maps[mapId];
  const first = !previousMap(mapId);
  return { open: first || !!m?.open, level: m?.level ?? 1, won: m?.won ?? 0, bestWave: m?.bestWave ?? 0 };
}
export const isMapOpen = (mapId: string): boolean => mapProgress(mapId).open;

/** How to open a locked map, or '' if it's open. */
export function mapUnlockText(mapId: string): string {
  const prev = previousMap(mapId);
  if (isMapOpen(mapId) || !prev) return '';
  return 'Reach wave 6 on ' + prev.name + ', or ' + mapDef(mapId).price + ' gold';
}

/** Mastery stars (0-3) a class has on a map. */
export function masteryStars(mapId: string, classId: string): number {
  const bits = getProgress().mastery[mapId + ':' + classId] ?? 0;
  return (bits & 1 ? 1 : 0) + (bits & 2 ? 1 : 0) + (bits & 4 ? 1 : 0);
}

/** Map progress from a finished run. Returns what's new, for the rewards reel. */
function updateMaps(p: Progress, r: RunRecord): string[] {
  const news: string[] = [], id = mapDef(r.mapId ?? DEFAULT_MAP).id, level = r.mapLevel ?? 1, def = mapDef(id);
  const m = (p.maps[id] ??= { open: true, level: 1, won: 0, bestWave: 0 });
  m.open = true;
  m.bestWave = Math.max(m.bestWave, r.wavesCleared + (r.win ? 0 : 1));
  if (r.win) {
    m.won = Math.max(m.won, level);
    if (level >= m.level && m.level < MAX_MAP_LEVEL) { m.level = level + 1; news.push(def.name + ' level ' + m.level + ' unlocked'); }
    const key = id + ':' + r.classId, before = masteryBits(p, key);
    const bits = before | 1 | ((r.teamDowns ?? 0) === 0 ? 2 : 0) | (level >= 5 ? 4 : 0);
    p.mastery[key] = bits;
    if (bits !== before) news.push('Mastery on ' + def.name + ': ' + '★'.repeat(popcount(bits)) + '☆'.repeat(3 - popcount(bits)) + ' with ' + (r.className || r.classId));
  }
  // reaching wave 6, or winning, opens the next map
  const next = MAPS[MAPS.findIndex((x) => x.id === id) + 1];
  if (next && (r.win || r.wavesCleared >= 5) && !p.maps[next.id]?.open) {
    p.maps[next.id] = { ...(p.maps[next.id] ?? { level: 1, won: 0, bestWave: 0 }), open: true };
    news.push('New map: ' + next.name);
  }
  return news;
}
const masteryBits = (p: Progress, key: string): number => p.mastery[key] ?? 0;
const popcount = (bits: number): number => (bits & 1 ? 1 : 0) + (bits & 2 ? 1 : 0) + (bits & 4 ? 1 : 0);

/** Buy a locked map with gold. Returns false if it's open or gold is short. */
export function buyMap(mapId: string): boolean {
  const p = refresh(), def = mapDef(mapId);
  if (def.id !== mapId || isMapOpen(mapId) || p.gold < def.price) return false;
  p.gold -= def.price;
  p.maps[mapId] = { ...(p.maps[mapId] ?? { level: 1, won: 0, bestWave: 0 }), open: true };
  save();
  return true;
}

/** The map and level for the next solo run (or hosted room): the selection, kept within what's unlocked. */
export function selectedMap(): { mapId: string; level: number } {
  const s = getProgress().selected, open = isMapOpen(s.mapId);
  const mapId = open ? s.mapId : DEFAULT_MAP;
  return { mapId, level: Math.min(Math.max(1, s.level), mapProgress(mapId).level) };
}

/** Pick the map and level for the next run. Returns false if the map is locked or the level isn't unlocked yet. */
export function selectMap(mapId: string, level: number): boolean {
  if (!isMapOpen(mapId) || level < 1 || level > mapProgress(mapId).level) return false;
  const p = refresh();
  p.selected = { mapId, level };
  save();
  return true;
}

/** This player's Slayer tiers by monster key (what a hero carries into a run). */
export function slayerTiers(): Record<string, number> {
  const kills = getProgress().kills, out: Record<string, number> = {};
  for (const key of Object.keys(kills)) { const tier = slayerTier(key, kills[key]); if (tier) out[key] = tier; }
  return cleanSlayer(out);
}

/** Gold price of a locked class (0 if it's open or can't be bought). */
export const classPrice = (classId: string): number =>
  isClassUnlocked(classId) ? 0 : UNLOCKS.find((u) => u.classId === classId)?.price ?? 0;

/** Buy a locked class with gold. Returns false if it's already open or gold is short. */
export function buyClass(classId: string): boolean {
  const p = refresh(), price = classPrice(classId);
  if (!price || p.gold < price) return false;
  p.gold -= price;
  p.unlocked.push(classId);
  save();
  return true;
}

/** Put a run in the table if it's good enough. Returns its place (0 = best) or -1. */
function addHighScore(p: Progress, record: RunRecord): number {
  const entry: HighScore = {
    score: runScore(record), classId: record.classId, wave: record.win ? 12 : record.wavesCleared + 1, win: record.win,
    time: Math.round(record.time || 0), players: record.players || 1, date: new Date().toISOString().slice(0, 10),
    mapId: record.mapId ?? DEFAULT_MAP, mapLevel: record.mapLevel ?? 1,
  };
  // a tie goes below the older run, so an equal score never pushes an older entry down
  let rank = p.highScores.findIndex((h) => entry.score > h.score);
  if (rank < 0) rank = p.highScores.length;
  if (rank >= HIGH_SCORE_LIMIT) return -1;
  p.highScores.splice(rank, 0, entry);
  p.highScores.length = Math.min(p.highScores.length, HIGH_SCORE_LIMIT);
  return rank;
}

/** A saved entry that has the fields the table draws (old or hand-edited saves may not). */
function isHighScore(h: unknown): h is HighScore {
  const e = h as HighScore;
  return !!e && typeof e === 'object' && Number.isFinite(e.score) && typeof e.classId === 'string' && Number.isFinite(e.wave);
}

/** Forget the result screen's messages (a new run started). */
export const clearLastUnlocked = (): void => { lastUnlocked = []; lastRank = -1; lastRewards = null; };

// ------------------------------------------------------------ export / import (moving browsers, safety net)

/** The whole save as text, to copy somewhere safe. */
export const exportSave = (): string => JSON.stringify(getProgress());

/** Replace the save with exported text. Returns false (and changes nothing) if the text isn't a save. */
export function importSave(text: string): boolean {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return false; }
  const imported = migrate(data);
  if (!imported) return false;
  progress = imported;
  fillBounties(progress);
  newerSave = false;
  save();
  return true;
}

/** Test / debug helpers (window.__SR.progress). */
export function unlockAll(): void {
  refresh().unlocked = UNLOCKS.map((u) => u.classId);
  save();
}
export function resetProgress(): void {
  progress = fresh();
  fillBounties(progress);
  lastUnlocked = [];
  lastRank = -1;
  lastRewards = null;
  save();
}
