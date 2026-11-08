// ============================================================ goals: bounties, first-time milestones, Slayer achievements
// Plain tables, checked once at the end of every saved run (docs/progression.md 5.1, 5.2a, 5.4).
// Nothing here is random: bounties rotate in table order, so every player sees the same sequence.
import type { RunTally } from '../types';
import type { Progress, RunRecord } from './progress';

/** Something finished this run, for the rewards reel. Names of monsters are looked up by the screen. */
export type Completion =
  | { kind: 'bounty'; text: string; gold: number }
  | { kind: 'milestone'; text: string; gold: number; exp: number }
  | { kind: 'slayer'; monster: string; tier: number };

/** A finished run with its counters (what every check below reads). */
type CountedRun = RunRecord & { tally: RunTally };

// ------------------------------------------------------------ bounties

/** How many bounties are active at once. A finished one is replaced right away (no timers). */
export const ACTIVE_BOUNTIES = 3;

export interface BountyDef {
  id: string;
  text: string;
  goal: number;
  gold: number;
  /** How much one run adds toward the goal (most bounties add up across runs). */
  measure(r: CountedRun): number;
}

const kills = (t: RunTally, ...keys: string[]): number => keys.reduce((n, k) => n + (t.killsByType[k] ?? 0), 0);

/** Most bounties teach a monster's weakness. Every one can be done solo. */
export const BOUNTIES: BountyDef[] = [
  { id: 'interrupt', text: 'Interrupt 5 heals or summons (hit the caster)', goal: 5, gold: 120, measure: (r) => r.tally.interrupts },
  { id: 'dazed', text: 'Land 5 hits on dazed Tusk Boars', goal: 5, gold: 100, measure: (r) => r.tally.dazedHits },
  { id: 'imp_chain', text: 'Kill 3 enemies with an Imp\'s blast', goal: 3, gold: 100, measure: (r) => r.tally.impChainKills },
  { id: 'shields', text: 'Break 10 Shield Orc shields', goal: 10, gold: 120, measure: (r) => r.tally.shieldBreaks },
  { id: 'healers', text: 'Kill 10 Cultists', goal: 10, gold: 100, measure: (r) => kills(r.tally, 'cultist') },
  { id: 'no_arrows', text: 'Reach wave 6 without an arrow hitting you', goal: 1, gold: 200, measure: (r) => (r.wavesCleared >= 5 && r.tally.arrowHits === 0 ? 1 : 0) },
  { id: 'boars', text: 'Kill 10 Tusk Boars', goal: 10, gold: 100, measure: (r) => kills(r.tally, 'boar') },
  { id: 'bosses', text: 'Defeat 3 bosses', goal: 3, gold: 200, measure: (r) => r.bossesKilled },
  { id: 'wraiths', text: 'Kill 15 Wraiths (hit them while solid)', goal: 15, gold: 120, measure: (r) => kills(r.tally, 'wraith') },
  { id: 'toads', text: 'Kill 10 Bog Toads', goal: 10, gold: 100, measure: (r) => kills(r.tally, 'toad') },
  { id: 'elites', text: 'Kill 10 elites', goal: 10, gold: 150, measure: (r) => r.tally.eliteKills },
  { id: 'callers', text: 'Kill 5 Grave Callers', goal: 5, gold: 150, measure: (r) => kills(r.tally, 'caller') },
  { id: 'waves', text: 'Clear 20 waves', goal: 20, gold: 150, measure: (r) => r.wavesCleared },
  { id: 'wave9', text: 'Reach wave 9 in one run', goal: 1, gold: 250, measure: (r) => (r.wavesCleared >= 8 ? 1 : 0) },
];

export const bountyDef = (id: string): BountyDef | undefined => BOUNTIES.find((b) => b.id === id);

/** Fill the active list up to `ACTIVE_BOUNTIES`, taking the next bounties in table order (repeats once all are done). */
export function fillBounties(p: Progress): void {
  const b = p.bounties;
  for (let tries = 0; b.active.length < ACTIVE_BOUNTIES && tries < BOUNTIES.length; tries++) {
    const next = BOUNTIES[b.next % BOUNTIES.length];
    b.next = (b.next + 1) % BOUNTIES.length;
    if (!b.active.includes(next.id)) { b.active.push(next.id); b.progress[next.id] = 0; }
  }
}

/** Add this run to the active bounties; finished ones pay out and are replaced. */
function updateBounties(p: Progress, r: CountedRun, out: Completion[]): void {
  fillBounties(p);
  for (const id of [...p.bounties.active]) {
    const def = bountyDef(id);
    if (!def) { p.bounties.active = p.bounties.active.filter((x) => x !== id); continue; }
    p.bounties.progress[id] = Math.min(def.goal, (p.bounties.progress[id] ?? 0) + Math.max(0, def.measure(r) || 0));
    if (p.bounties.progress[id] < def.goal) continue;
    p.gold += def.gold;
    p.bounties.done++;
    p.bounties.active = p.bounties.active.filter((x) => x !== id);
    delete p.bounties.progress[id];
    out.push({ kind: 'bounty', text: def.text, gold: def.gold });
  }
  fillBounties(p);
}

// ------------------------------------------------------------ first-time milestones (one-off)

export interface MilestoneDef {
  /** May include the class id, e.g. "boss:cleric", so each class has its own. */
  id: string;
  text: string;
  gold: number;
  /** Specialist EXP for the class that was played. */
  exp: number;
}

/** The one-off rewards this run earns (not yet checked against what's already done). */
function milestonesFor(p: Progress, r: CountedRun): MilestoneDef[] {
  const out: MilestoneDef[] = [];
  const name = r.className || r.classId;
  if (r.bossesKilled >= 1) out.push({ id: 'boss:' + r.classId, text: 'First boss beaten as ' + name, gold: 0, exp: 300 });
  if (r.wavesCleared >= 5) out.push({ id: 'wave6', text: 'First time reaching wave 6', gold: 150, exp: 0 });
  if (r.wavesCleared >= 8) out.push({ id: 'wave9', text: 'First time reaching wave 9', gold: 250, exp: 0 });
  if (r.win) out.push({ id: 'win', text: 'First victory!', gold: 500, exp: 0 });
  if (r.win) out.push({ id: 'win:' + r.classId, text: 'First victory as ' + name, gold: 0, exp: 500 });
  if (r.win && r.players > 1) out.push({ id: 'coop_win', text: 'First co-op victory', gold: 300, exp: 0 });
  if ((r.revives ?? 0) > 0) out.push({ id: 'revive', text: 'First teammate revived', gold: 100, exp: 0 });
  if (r.win && (r.mapLevel ?? 1) >= 2) out.push({ id: 'map_level2', text: 'First win above map level 1', gold: 400, exp: 0 });
  if (r.win && (r.mapLevel ?? 1) >= 5) out.push({ id: 'map_level5', text: 'First win on map level 5', gold: 1000, exp: 0 });
  const bestiary = bestiaryShare(p), cards = p.codex.cards.length;
  if (bestiary >= 0.5) out.push({ id: 'bestiary50', text: 'Bestiary half complete', gold: 200, exp: 0 });
  if (bestiary >= 1) out.push({ id: 'bestiary100', text: 'Bestiary complete', gold: 500, exp: 0 });
  if (cards >= 20) out.push({ id: 'cards20', text: '20 cards in the Codex', gold: 200, exp: 0 });
  if (cards >= 50) out.push({ id: 'cards50', text: '50 cards in the Codex', gold: 400, exp: 0 });
  return out;
}

function updateMilestones(p: Progress, r: CountedRun, out: Completion[]): void {
  for (const m of milestonesFor(p, r)) {
    if (p.milestones.includes(m.id)) continue;
    p.milestones.push(m.id);
    p.gold += m.gold;
    if (m.exp) p.classes[r.classId] = { ...p.classes[r.classId], exp: (p.classes[r.classId]?.exp ?? 0) + m.exp };
    out.push({ kind: 'milestone', text: m.text, gold: m.gold, exp: m.exp });
  }
}

// ------------------------------------------------------------ Slayer achievements and the bestiary

/** Every monster the bestiary lists, in order: 11 enemy types (split slimes count as slimes) and 4 bosses. */
export const BESTIARY = ['slime', 'goblin', 'bat', 'archer', 'cultist', 'orc', 'imp', 'boar', 'toad', 'wraith', 'caller', 'troll', 'colossus', 'wyvern', 'king'];
const BOSS_KEYS = ['troll', 'colossus', 'wyvern', 'king'];

/** Kills needed for Slayer I-V. Each tier is +1% damage against that monster (at most +5%). */
export const SLAYER_KILLS = [25, 100, 250, 500, 1000];
export const SLAYER_BOSS_KILLS = [1, 3, 5, 10, 20];
export const MAX_SLAYER_TIER = 5;
/** Bestiary entries: the first kill shows the name and role; this many show the weakness too. */
export const WEAKNESS_KILLS = 10;

export const isBossKey = (key: string): boolean => BOSS_KEYS.includes(key);

/** Slayer tier (0-5) for this many kills of `key`. */
export function slayerTier(key: string, killCount: number): number {
  const steps = isBossKey(key) ? SLAYER_BOSS_KILLS : SLAYER_KILLS;
  return steps.filter((n) => killCount >= n).length;
}

/** Kills needed for the next tier, or 0 at the top. */
export function nextSlayerKills(key: string, killCount: number): number {
  const steps = isBossKey(key) ? SLAYER_BOSS_KILLS : SLAYER_KILLS;
  return steps.find((n) => killCount < n) ?? 0;
}

/** Share of the bestiary seen (at least one kill). */
export const bestiaryShare = (p: Progress): number => BESTIARY.filter((k) => (p.kills[k] ?? 0) > 0).length / BESTIARY.length;

/** Slayer tiers from untrusted data (another player's hello): known monsters only, tiers 0-5. */
export function cleanSlayer(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const key of BESTIARY) {
    const tier = Math.floor(Number((raw as Record<string, unknown>)[key]));
    if (Number.isFinite(tier) && tier > 0) out[key] = Math.min(MAX_SLAYER_TIER, tier);
  }
  return out;
}

function updateKillsAndCodex(p: Progress, r: CountedRun, out: Completion[]): void {
  for (const [key, n] of Object.entries(r.tally.killsByType)) {
    if (!BESTIARY.includes(key) || !(n > 0)) continue;
    const before = slayerTier(key, p.kills[key] ?? 0);
    p.kills[key] = (p.kills[key] ?? 0) + n;
    const after = slayerTier(key, p.kills[key]);
    if (after > before) out.push({ kind: 'slayer', monster: key, tier: after });
  }
  for (const id of r.cards ?? []) addOnce(p.codex.cards, r.classId + ':' + id);
  for (const id of r.evolved ?? []) addOnce(p.codex.evolved, r.classId + ':' + id);
}

const addOnce = (list: string[], item: string): void => { if (!list.includes(item)) list.push(item); };

// ------------------------------------------------------------ all together

/** Apply a saved run to bounties, kills, the Codex and milestones. Returns what was completed, in reel order. */
export function applyRunToGoals(p: Progress, r: RunRecord): Completion[] {
  const out: Completion[] = [];
  if (!r.tally) return out; // a record without counters (older callers): nothing to count
  const run: CountedRun = { ...r, tally: r.tally };
  updateKillsAndCodex(p, run, out);
  updateBounties(p, run, out);
  updateMilestones(p, run, out);
  return out;
}
