// ============================================================ pickups: XP gems, coins, heal orbs
// In co-op, XP is shared (everyone levels together); coins and heal orbs go to whoever collects them.
import type { Coin, Hero, Point } from '../types';
import { nearestHero, run, withHero } from '../core/state';
import { healPlayer } from './combat';

const GEM_SPEED = 520;
const COIN_SPEED = 480;
const COLLECT_RADIUS = 18;
/** Above this many gems, the oldest are merged into one to keep things fast. */
const GEM_MERGE_AT = 260;
const GEM_KEEP = 200;

interface Magnetic extends Point {
  magnetized?: boolean;
  to?: number;
  dead?: boolean;
}
/** Something that pulls pickups in for a hero: the hero, or a class helper such as a pet. */
interface Puller extends Point {
  radius: number;
  hero: Hero;
}

export function dropGem(x: number, y: number, value: number, big: boolean): void {
  run.gems.push({ x, y, value, magnetized: false, big });
}

/** HP in the heal orb an elite drops, and in each of the orbs a boss drops. */
export const ELITE_HEAL_ORB = 10;
export const BOSS_HEAL_ORB = 15;
export const BOSS_HEAL_ORBS = 3;

/** A Trade Coin, or a heal orb worth `value` HP. */
export function dropCoin(x: number, y: number, value: number, kind: Coin['kind'] = 'coin'): void {
  run.coins.push({ x, y, value, kind });
}

export function updatePickups(dt: number): void {
  const pullers: Puller[] = [];
  for (const h of run.heroes) {
    if (h.magnetAllTime > 0) h.magnetAllTime -= dt;
    if (h.down || h.gone) continue;
    pullers.push({ x: h.player.x, y: h.player.y, radius: h.stats.pickupRadius, hero: h });
    if (h.cls.pickupHelpers) {
      for (const helper of withHero(h, () => h.cls.pickupHelpers!())) pullers.push({ x: helper.x, y: helper.y, radius: helper.pickupRadius, hero: h });
    }
  }
  if (!pullers.length) return;
  const magnetAll = run.heroes.find((h) => h.magnetAllTime > 0 && !h.down && !h.gone);

  for (const gem of run.gems) updateMagnetPickup(gem, pullers, magnetAll, GEM_SPEED, dt, () => shareXp(gem.value));
  run.gems = run.gems.filter((g) => !g.dead);
  mergeExcessGems();

  for (const coin of run.coins) updateMagnetPickup(coin, pullers, magnetAll, COIN_SPEED, dt, (h) => withHero(h, () => collectCoin(coin)));
  run.coins = run.coins.filter((c) => !c.dead);
}

/** Start flying to a hero once any of their pullers is close (or their magnet-all is on). */
function updateMagnetPickup(item: Magnetic, pullers: Puller[], magnetAll: Hero | undefined, speed: number, dt: number, onCollect: (h: Hero) => void): void {
  if (!item.magnetized) {
    if (magnetAll) { item.magnetized = true; item.to = magnetAll.idx; }
    else {
      for (const puller of pullers) {
        if ((puller.x - item.x) ** 2 + (puller.y - item.y) ** 2 < puller.radius * puller.radius) {
          item.magnetized = true;
          item.to = puller.hero.idx;
          break;
        }
      }
    }
  }
  if (!item.magnetized) return;
  // fly to the hero who pulled it in; if they went down, to whoever is nearest
  let hero = item.to === undefined ? undefined : run.heroes[item.to];
  if (!hero || hero.down || hero.gone) {
    hero = nearestHero(item.x, item.y) ?? undefined;
    if (!hero) return;
    item.to = hero.idx;
  }
  const p = hero.player;
  const a = Math.atan2(p.y - item.y, p.x - item.x);
  item.x += Math.cos(a) * speed * dt;
  item.y += Math.sin(a) * speed * dt;
  if ((p.x - item.x) ** 2 + (p.y - item.y) ** 2 < COLLECT_RADIUS * COLLECT_RADIUS) {
    item.dead = true;
    onCollect(hero);
  }
}

/** Runs as the hero who collected it. */
function collectCoin(coin: Coin): void {
  if (coin.kind === 'heal') { healPlayer(coin.value); return; }
  run.coinsHeld += coin.value;
  if (run.cls.onCoin) run.cls.onCoin();
}

function mergeExcessGems(): void {
  if (run.gems.length <= GEM_MERGE_AT) return;
  const keep = run.gems.slice(-GEM_KEEP), merged = run.gems.slice(0, -GEM_KEEP);
  const total = merged.reduce((sum, g) => sum + g.value, 0);
  run.gems = keep;
  dropGem(merged[0].x, merged[0].y, total, true);
}

// ------------------------------------------------------------ experience

/**
 * XP needed to go from `level` to the next. The first two levels are cheap, so the first cards come early
 * (bot runs: first card ~13 s instead of ~21 s, second ~25 s instead of ~42 s).
 */
export function xpToNextLevel(level: number): number {
  if (level <= 2) return 3 + 4 * level; // 7, then 11
  return 8 + 5 * level + 0.5 * level * level;
}

/** Every hero in the run gets the XP. */
function shareXp(amount: number): void {
  for (const h of run.heroes) if (!h.gone) gainXp(h, amount);
}

function gainXp(hero: Hero, amount: number): void {
  const p = hero.player;
  p.xp += amount * (hero.stats.xpGain ?? 1);
  while (p.xp >= xpToNextLevel(p.level)) {
    p.xp -= xpToNextLevel(p.level);
    p.level++;
    hero.pendingLevelUps++;
  }
}
