// ============================================================ accessories: final-boss loot, equipped up to 3 per run
// Each accessory has an upside that grows with its level (Lv 1-3) and a fixed trade-off, so it pushes a build
// instead of being pure power (design doc section 7, docs/progression.md 5.0). Applied in `recalcStats`.
import type { Stats } from '../types';

export type AccessoryRarity = 'common' | 'rare' | 'epic' | 'unique';

export interface AccessoryDef {
  id: string;
  name: string;
  rarity: AccessoryRarity;
  /** The upside at Lv 1 / 2 / 3, and the trade-off (same at every level). */
  upside: [string, string, string];
  tradeoff: string;
  /** Change the stats for this level (1-3). */
  apply(stats: Stats, level: number): void;
}

/** One equipped accessory, as a hero carries it into a run (also sent by online players when they join). */
export interface EquippedAccessory {
  id: string;
  level: number;
}

export const MAX_ACCESSORY_LEVEL = 3;
/** Accessories a player can wear in one run. */
export const LOADOUT_SLOTS = 3;

/** Upside value for a level: `[lv1, lv2, lv3][level - 1]`. */
const at = (values: [number, number, number], level: number): number => values[Math.min(MAX_ACCESSORY_LEVEL, Math.max(1, level)) - 1];

/** The catalog. Start with 8 + the unique Shard; the rest of the design doc's list comes later. */
export const ACCESSORIES: AccessoryDef[] = [
  {
    id: 'titan_belt', name: 'Titan Belt', rarity: 'common',
    upside: ['+12% max HP', '+18% max HP', '+24% max HP'], tradeoff: '−5% move speed',
    apply(s, lv) { s.maxHp *= 1 + at([0.12, 0.18, 0.24], lv); s.moveSpeed *= 0.95; },
  },
  {
    id: 'wind_boots', name: 'Wind Boots', rarity: 'common',
    upside: ['+6% move speed', '+9% move speed', '+12% move speed'], tradeoff: '−8% max HP',
    apply(s, lv) { s.moveSpeed *= 1 + at([0.06, 0.09, 0.12], lv); s.maxHp *= 0.92; },
  },
  {
    id: 'monocle', name: "Collector's Monocle", rarity: 'common',
    upside: ['+30% pickup radius', '+45% pickup radius', '+60% pickup radius'], tradeoff: '−3% move speed',
    apply(s, lv) { s.pickupRadius *= 1 + at([0.3, 0.45, 0.6], lv); s.moveSpeed *= 0.97; },
  },
  {
    id: 'clover_charm', name: 'Clover Charm', rarity: 'common',
    upside: ['+5 Luck', '+8 Luck', '+10 Luck'], tradeoff: '−5% damage',
    apply(s, lv) { s.luck += at([5, 8, 10], lv); s.damage *= 0.95; },
  },
  {
    id: 'fang_pendant', name: 'Fang Pendant', rarity: 'rare',
    upside: ['+2% lifesteal', '+3% lifesteal', '+4% lifesteal'], tradeoff: '−8% max HP',
    apply(s, lv) { s.lifesteal += at([0.02, 0.03, 0.04], lv); s.maxHp *= 0.92; },
  },
  {
    id: 'scholars_tome', name: "Scholar's Tome", rarity: 'rare',
    upside: ['+10% XP, +3% ult charge', '+15% XP, +5% ult charge', '+20% XP, +8% ult charge'], tradeoff: '−5% damage',
    apply(s, lv) { s.xpGain *= 1 + at([0.1, 0.15, 0.2], lv); s.ultRate *= 1 + at([0.03, 0.05, 0.08], lv); s.damage *= 0.95; },
  },
  {
    id: 'feather_anklet', name: 'Feather Anklet', rarity: 'rare',
    upside: ['+1 dash charge, +3% move', '+1 dash charge, +6% move', '+1 dash charge, +9% move'], tradeoff: 'Dash cooldown +20%',
    apply(s, lv) { s.dashCharges += 1; s.moveSpeed *= 1 + at([0.03, 0.06, 0.09], lv); s.dashCooldown *= 1.2; },
  },
  {
    id: 'glass_heart', name: 'Glass Heart', rarity: 'epic',
    upside: ['+15% damage', '+20% damage', '+25% damage'], tradeoff: '−25% max HP',
    apply(s, lv) { s.damage *= 1 + at([0.15, 0.2, 0.25], lv); s.maxHp *= 0.75; },
  },
  {
    id: 'shard_of_the_crown', name: 'Shard of the Crown', rarity: 'unique',
    upside: ['Your class\'s favored card parts show up twice as often', '', ''], tradeoff: 'None. Reward for your first win',
    apply() { /* read by the card offers: see `hasAccessory` in progression/cards.ts */ },
  },
];

export const accessoryDef = (id: string): AccessoryDef | undefined => ACCESSORIES.find((a) => a.id === id);
export const maxLevelOf = (def: AccessoryDef): number => (def.rarity === 'unique' ? 1 : MAX_ACCESSORY_LEVEL);

/** Apply a hero's equipped accessories to their stats (before caps). */
export function applyAccessories(stats: Stats, equipped: readonly EquippedAccessory[] | undefined): void {
  for (const a of equipped ?? []) accessoryDef(a.id)?.apply(stats, a.level);
}

export const hasAccessory = (equipped: readonly EquippedAccessory[] | undefined, id: string): boolean => !!equipped?.some((a) => a.id === id);

/**
 * A loadout from an untrusted source (a save, or another player over the network): known accessories only,
 * levels in range, no duplicates, at most `LOADOUT_SLOTS`.
 */
export function cleanLoadout(raw: unknown): EquippedAccessory[] {
  if (!Array.isArray(raw)) return [];
  const out: EquippedAccessory[] = [];
  for (const item of raw) {
    const def = accessoryDef(String((item as EquippedAccessory | null)?.id));
    if (!def || out.some((a) => a.id === def.id)) continue;
    const level = Math.round(Number((item as EquippedAccessory).level));
    out.push({ id: def.id, level: Number.isFinite(level) ? Math.min(maxLevelOf(def), Math.max(1, level)) : 1 });
    if (out.length >= LOADOUT_SLOTS) break;
  }
  return out;
}

// ------------------------------------------------------------ loot and prices

/** Drop weights by rarity (map and map-level bonuses shift these later). The unique Shard is never rolled. */
export const LOOT_WEIGHTS: Record<Exclude<AccessoryRarity, 'unique'>, number> = { common: 70, rare: 25, epic: 5 };
/** Gold value by rarity: a Lv 3 duplicate turns into this; upgrades cost 50% (to Lv 2) and 100% (to Lv 3). */
export const ACCESSORY_VALUE: Record<AccessoryRarity, number> = { common: 300, rare: 800, epic: 2000, unique: 0 };
/** Gold for a duplicate of an accessory that is already Lv 3. */
export const duplicateGold = (def: AccessoryDef): number => Math.round(ACCESSORY_VALUE[def.rarity] / 2);
/** Gold to raise an accessory from `level` to `level + 1` (0 when it can't be upgraded). */
export function upgradeCost(def: AccessoryDef, level: number): number {
  if (level >= maxLevelOf(def)) return 0;
  return level === 1 ? ACCESSORY_VALUE[def.rarity] / 2 : ACCESSORY_VALUE[def.rarity];
}

/** Drop weights after `shift` points move from Common to Rare (3 of every 4) and Epic (1 of every 4); Common keeps 20. */
export function lootWeights(shift = 0): Record<keyof typeof LOOT_WEIGHTS, number> {
  const moved = Math.min(Math.max(0, shift), LOOT_WEIGHTS.common - 20);
  return { common: LOOT_WEIGHTS.common - moved, rare: LOOT_WEIGHTS.rare + moved * 0.75, epic: LOOT_WEIGHTS.epic + moved * 0.25 };
}

/** Roll one accessory from the loot table (`random` in [0, 1), twice). `shift` improves the odds (harder maps). */
export function rollAccessory(random: () => number, shift = 0): AccessoryDef {
  const weights = lootWeights(shift);
  const rarities = Object.keys(weights) as (keyof typeof weights)[];
  const total = rarities.reduce((n, r) => n + weights[r], 0);
  let pick = random() * total, rarity = rarities[0];
  for (const r of rarities) { if (pick < weights[r]) { rarity = r; break; } pick -= weights[r]; }
  const pool = ACCESSORIES.filter((a) => a.rarity === rarity);
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}
