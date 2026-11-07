// ============================================================ global game state
import type { Point, RelicId, Run, SceneId, Stats, UpgradeType } from '../types';
import { SCENE } from './constants';
import { mouse } from './input';

/**
 * State of the current run. Built by `newRun`, so only read it from gameplay
 * code (which runs after a run starts); menu code checks `hasRun()` first.
 */
export let run: Run = null as unknown as Run;
/** Current screen. */
export let scene: SceneId = SCENE.MENU;
/** Highlighted class on the menu. */
export let menuSelection = 0;
/** Test switches: `god` = can't die, `bot` = the game plays itself. */
export const DEBUG = { god: false, bot: false };

// ES modules can't assign another module's variables, so changes go through these.
export const setRun = (next: Run): void => { run = next; };
export const setScene = (next: SceneId): void => { scene = next; };
export const setMenuSelection = (next: number): void => { menuSelection = next; };
export const hasRun = (): boolean => run !== null;

/** Mouse position in world coordinates. */
export function mouseWorld(): Point {
  return { x: mouse.x + run.camera.x, y: mouse.y + run.camera.y };
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
    cooldownMul: Math.max(0.5, 1 - 0.05 * relicLevel('ink')),
    lifesteal: base.lifesteal || 0,
    ultRate: 1,
    dashCharges: 1,
    dashCooldown: 1.5,
    heavyCooldown: run.cls.heavyCooldown,
  };
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
