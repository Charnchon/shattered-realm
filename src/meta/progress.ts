// ============================================================ saved progress, rewards and class unlocks
// Saved in this browser (localStorage). No accounts: each player keeps their own progress,
// online too. If storage is unavailable (private window, tests), progress lives in memory.
// The save is versioned: older saves are migrated, a backup of the last good save is kept, and a
// save from a newer version of the game is never overwritten. See docs/progression.md.
import {
  LOADOUT_SLOTS, accessoryDef, cleanLoadout, duplicateGold, maxLevelOf, rollAccessory, upgradeCost,
  type EquippedAccessory,
} from './accessories';

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
}

/** Entries kept in the high-score table. */
export const HIGH_SCORE_LIMIT = 10;

/** A run's score: waves and bosses matter most, kills break ties, a win is a big bonus. */
export function runScore(r: Pick<RunRecord, 'wavesCleared' | 'bossesKilled' | 'kills' | 'win'>): number {
  return 500 * r.wavesCleared + 2000 * r.bossesKilled + 10 * (r.kills || 0) + (r.win ? 5000 : 0);
}

// ------------------------------------------------------------ rewards and Specialist levels

/** Gold bonus for playing together (2+ players). */
export const COOP_GOLD_BONUS = 0.1;
/** Highest Specialist level per class. */
export const SPECIALIST_MAX_LEVEL = 15;

/** What a run pays out (docs/progression.md, section 2). Maps and map levels will multiply this later. */
export function runRewards(r: Pick<RunRecord, 'wavesCleared' | 'bossesKilled' | 'win' | 'myKills' | 'players'>): { gold: number; exp: number } {
  const kills = r.myKills || 0, coop = (r.players || 1) > 1 ? 1 + COOP_GOLD_BONUS : 1;
  return {
    gold: Math.round((15 * r.wavesCleared + 60 * r.bossesKilled + kills / 5 + (r.win ? 250 : 0)) * coop),
    exp: Math.round(20 * r.wavesCleared + 80 * r.bossesKilled + kills / 5 + (r.win ? 200 : 0)),
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
}

const STORAGE_KEY = 'shattered-realm.progress';
const BACKUP_KEY = STORAGE_KEY + '.backup';
const fresh = (): Progress => ({ version: SAVE_VERSION, runs: 0, wins: 0, bestWave: 0, unlocked: [], highScores: [], gold: 0, classes: {}, accessories: {}, loadout: [] });

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
  };
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
  try {
    return parseSave(store?.getItem(STORAGE_KEY)) ?? parseSave(store?.getItem(BACKUP_KEY)) ?? fresh();
  } catch {
    return fresh();
  }
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
  if (record.win) lastRewards.loot = dropLoot(p);
  p.classes[record.classId] = { ...p.classes[record.classId], exp: lastRewards.expBefore + lastRewards.exp };
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
    expBefore: p.classes[record.classId]?.exp ?? 0, goldBefore: p.gold, coopBonus: (record.players || 1) > 1, loot: null,
  };
}

/** The final boss's drop: the Shard of the Crown on the first win, then a roll on the loot table. */
function dropLoot(p: Progress): LootResult {
  const def = !p.accessories.shard_of_the_crown ? accessoryDef('shard_of_the_crown')! : rollAccessory(Math.random);
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
  lastUnlocked = [];
  lastRank = -1;
  lastRewards = null;
  save();
}
