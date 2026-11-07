// ============================================================ saved progress and class unlocks
// Saved in this browser (localStorage). No accounts: each player keeps their own progress,
// online too. If storage is unavailable (private window, tests), progress lives in memory.

/** Classes open from the start (phase 1 roster). */
export const STARTER_CLASSES = ['traveler', 'oathknight', 'bounty_hunter', 'cleric'];

/** How a finished run is judged for unlocks. */
export interface RunRecord {
  /** The class this player played. */
  classId: string;
  wavesCleared: number;
  bossesKilled: number;
  win: boolean;
}

export interface UnlockRule {
  classId: string;
  /** Shown on the class select screen while locked. */
  text: string;
  isMet(run: RunRecord): boolean;
}

/** Locked classes and how to earn them. Bosses come in order, so "2 bosses killed" = beat Boss 2. */
export const UNLOCKS: UnlockRule[] = [
  { classId: 'vampire', text: 'Beat the first boss (wave 3) as the Traveler', isMet: (r) => r.classId === 'traveler' && r.bossesKilled >= 1 },
  { classId: 'necro', text: 'Beat the second boss (wave 6) with any class', isMet: (r) => r.bossesKilled >= 2 },
];

export interface Progress {
  version: 1;
  runs: number;
  wins: number;
  /** Highest wave reached in any run. */
  bestWave: number;
  /** Class ids unlocked so far (starters are always open and not listed). */
  unlocked: string[];
}

const STORAGE_KEY = 'shattered-realm.progress';
const fresh = (): Progress => ({ version: 1, runs: 0, wins: 0, bestWave: 0, unlocked: [] });

let progress: Progress | null = null;
/** Classes unlocked by the most recent run (for the result screen). */
export let lastUnlocked: string[] = [];

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null; // some browsers throw when storage is blocked
  }
}

/** The saved progress (loaded once, then kept in memory). */
export function getProgress(): Progress {
  if (progress) return progress;
  progress = fresh();
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Progress>;
      progress = { ...fresh(), ...saved, unlocked: Array.isArray(saved.unlocked) ? saved.unlocked.filter((id) => typeof id === 'string') : [] };
    }
  } catch {
    // corrupt save: start over rather than crash
  }
  return progress;
}

function save(): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(getProgress()));
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

/** Count a finished run and unlock whatever it earned. Returns the newly unlocked class ids. */
export function recordRun(record: RunRecord): string[] {
  const p = getProgress();
  p.runs++;
  if (record.win) p.wins++;
  p.bestWave = Math.max(p.bestWave, record.wavesCleared + (record.win ? 0 : 1));
  lastUnlocked = UNLOCKS.filter((u) => !isClassUnlocked(u.classId) && u.isMet(record)).map((u) => u.classId);
  p.unlocked.push(...lastUnlocked);
  save();
  return lastUnlocked;
}

/** Forget the "just unlocked" message (a new run started). */
export const clearLastUnlocked = (): void => { lastUnlocked = []; };

/** Test / debug helpers (window.__SR.progress). */
export function unlockAll(): void {
  getProgress().unlocked = UNLOCKS.map((u) => u.classId);
  save();
}
export function resetProgress(): void {
  progress = fresh();
  lastUnlocked = [];
  save();
}
