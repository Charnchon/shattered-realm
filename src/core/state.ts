// ============================================================ global game state
import type { Hero, Point, RelicId, Run, SceneId, Stats, UpgradeType } from '../types';
import { ARENA_H, ARENA_W, SCENE, VIEW_H, VIEW_W } from './constants';
import { clamp } from './math';
import { applyAccessories } from '../meta/accessories';

/**
 * State of the current run. Built by `newRun`, so only read it from gameplay
 * code (which runs after a run starts); menu code checks `hasRun()` first.
 */
export let run: Run = null as unknown as Run;
/** Current screen. */
export let scene: SceneId = SCENE.MENU;
/** Highlighted class on the menu. */
export let menuSelection = 0;
/** Test switches: `god` = can't die, `bot` = the local player is played by the bot. */
export const DEBUG = { god: false, bot: false };

// ES modules can't assign another module's variables, so changes go through these.
export const setRun = (next: Run): void => { run = next; };
export const setScene = (next: SceneId): void => { scene = next; };
export const setMenuSelection = (next: number): void => { menuSelection = next; };
export const hasRun = (): boolean => run !== null;

/** Where the current hero is aiming, in world coordinates (their mouse, for a human player). */
export function mouseWorld(): Point {
  const input = run.hero.input;
  return { x: input.aimX, y: input.aimY };
}

// ------------------------------------------------------------ heroes (players)

/**
 * Run `fn` as `hero`: while it runs, `run.player`, `run.stats`, `run.cls`, `run.cards`, ... are that hero's.
 * Class hooks, damage credit and healing all follow the current hero. Restores the previous hero afterwards.
 */
export function withHero<T>(hero: Hero, fn: () => T): T {
  const previous = run.hero;
  run.hero = hero;
  try {
    return fn();
  } finally {
    run.hero = previous;
  }
}

/** Run `fn` as the hero at `idx` (falls back to the current hero if it doesn't exist). */
export function asHero<T>(idx: number | undefined, fn: () => T): T {
  const hero = idx === undefined ? undefined : run.heroes[idx];
  return hero ? withHero(hero, fn) : fn();
}

/** Heroes still fighting (not knocked out, not disconnected). */
export const livingHeroes = (): Hero[] => run.heroes.filter((h) => !h.down && !h.gone);

/** The living hero closest to (x, y), or null when everyone is down. */
export function nearestHero(x: number, y: number): Hero | null {
  let best: Hero | null = null, bestSq = Infinity;
  for (const h of run.heroes) {
    if (h.down || h.gone) continue;
    const dSq = (h.player.x - x) ** 2 + (h.player.y - y) ** 2;
    if (dSq < bestSq) { bestSq = dSq; best = h; }
  }
  return best;
}

/** The hero this screen belongs to. */
export const localHero = (): Hero => run.heroes[run.localHero];

/** Point the camera at this screen's hero. */
export function updateCamera(): void {
  const p = localHero().player;
  run.camera.x = clamp(p.x - VIEW_W / 2, -40, ARENA_W - VIEW_W + 40);
  run.camera.y = clamp(p.y - VIEW_H / 2, -40, ARENA_H - VIEW_H + 40);
}

/** Co-op difficulty: 1 for one player, plus `perExtraPlayer` for each additional one. */
export function partyScale(perExtraPlayer: number): number {
  const players = run.heroes.filter((h) => !h.gone).length;
  return 1 + perExtraPlayer * Math.max(0, players - 1);
}

/** Show a large centred message for `duration` seconds. */
export function showBanner(text: string, duration: number): void {
  run.banner = { text, time: duration };
}

// ------------------------------------------------------------ card and relic lookups

/** Does the player own this card? */
export const hasCard = (id: string): boolean => !!run.cards[id];
/** Card level, 0 if not owned. */
export const cardLevel = (id: string): number => (run.cards[id] ? run.cards[id].level : 0);
/** Has this card evolved? */
export const isEvolved = (id: string): boolean => !!(run.cards[id] && run.cards[id].evolved);
/** Upgrade multiplier of an owned card. 1 if not owned. */
export const cardMul = (id: string, kind: UpgradeType): number => (run.cards[id] ? run.cards[id].upgrades[kind] : 1);
/** Extra projectiles bought for a card. 0 if not owned. */
export const cardExtraProjectiles = (id: string): number => (run.cards[id] ? run.cards[id].upgrades.projectiles : 0);
/** Relic level, 0 if not owned. */
export const relicLevel = (id: RelicId): number => run.relics[id] || 0;

// ------------------------------------------------------------ derived stats

const STAT_CAPS = { critChance: 0.75, moveSpeedMul: 1.8, attackSpeed: 3 };

/**
 * Rebuild `run.stats` from the class base, relics, stat cards and level,
 * then let the class adjust them. Keeps current HP in step with max HP.
 */
export function recalcStats(): void {
  const base = run.cls.base, sc = run.statCards;
  const stats: Stats = {
    maxHp: base.hp * (1 + 0.08 * relicLevel('heart') + 0.08 * sc.hp),
    armor: (base.armor || 0) + 2 * relicLevel('buckle'),
    regen: base.regen || 0,
    damage: (1 + 0.05 * sc.dmg) * (1 + 0.03 * (run.player.level - 1)),
    attackSpeed: 1 + 0.05 * sc.atk,
    critChance: 0.05 + 0.03 * sc.crit,
    critDamage: 1.5 + 0.1 * relicLevel('whet'),
    moveSpeed: base.moveSpeed * (1 + 0.06 * relicLevel('feather') + 0.05 * sc.move),
    area: 1 + 0.05 * relicLevel('echo'),
    extraProjectiles: (relicLevel('echo') >= 3 ? 1 : 0) + (relicLevel('echo') >= 5 ? 1 : 0),
    pickupRadius: 70 * (1 + 0.2 * relicLevel('magnet')),
    luck: (base.luck || 0) + 5 * relicLevel('clover'),
    xpGain: 1,
    cooldownMul: Math.max(0.5, 1 - 0.05 * relicLevel('ink')),
    lifesteal: base.lifesteal || 0,
    ultRate: 1,
    dashCharges: 1,
    dashCooldown: 1.5,
    heavyCooldown: run.cls.heavyCooldown,
  };
  applyAccessories(stats, run.hero.accessories);
  if (run.cls.modifyStats) run.cls.modifyStats(stats);
  stats.critChance = Math.min(STAT_CAPS.critChance, stats.critChance);
  stats.moveSpeed = Math.min(stats.moveSpeed, base.moveSpeed * STAT_CAPS.moveSpeedMul);
  stats.attackSpeed = Math.min(stats.attackSpeed, STAT_CAPS.attackSpeed);

  // run.stats is unset on the very first call (from newRun)
  const oldMax = run.stats ? run.stats.maxHp : stats.maxHp;
  run.stats = stats;
  if (stats.maxHp > oldMax) run.player.hp += stats.maxHp - oldMax;
  run.player.hp = Math.min(run.player.hp, stats.maxHp);
}

/** Armor including class bonuses (e.g. Necromancer's Bone Armor). */
export function totalArmor(): number {
  return run.stats.armor + (run.cls.bonusArmor ? run.cls.bonusArmor() : 0);
}
