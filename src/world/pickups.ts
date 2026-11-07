// ============================================================ pickups: XP gems, coins, heal orbs
import type { Coin, Point } from '../types';
import { run } from '../core/state';
import { healPlayer } from './combat';

const GEM_SPEED = 520;
const COIN_SPEED = 480;
const COLLECT_RADIUS = 18;
/** Above this many gems, the oldest are merged into one to keep things fast. */
const GEM_MERGE_AT = 260;
const GEM_KEEP = 200;

interface Magnetic extends Point {
  magnetized?: boolean;
  dead?: boolean;
}
type Puller = Point & { pickupRadius?: number };

export function dropGem(x: number, y: number, value: number, big: boolean): void {
  run.gems.push({ x, y, value, magnetized: false, big });
}

/** A Trade Coin, or a heal orb worth `value` HP. */
export function dropCoin(x: number, y: number, value: number, kind: Coin['kind'] = 'coin'): void {
  run.coins.push({ x, y, value, kind });
}

export function updatePickups(dt: number): void {
  if (run.magnetAllTime > 0) run.magnetAllTime -= dt;
  const pullers: Puller[] = [run.player];
  if (run.cls.pickupHelpers) pullers.push(...run.cls.pickupHelpers());

  for (const gem of run.gems) updateMagnetPickup(gem, pullers, GEM_SPEED, dt, () => gainXp(gem.value));
  run.gems = run.gems.filter((g) => !g.dead);
  mergeExcessGems();

  for (const coin of run.coins) updateMagnetPickup(coin, pullers, COIN_SPEED, dt, () => collectCoin(coin));
  run.coins = run.coins.filter((c) => !c.dead);
}

/** Start flying to the player once any puller is close (or magnet-all is on). */
function updateMagnetPickup(item: Magnetic, pullers: Puller[], speed: number, dt: number, onCollect: () => void): void {
  const p = run.player;
  if (!item.magnetized) {
    if (run.magnetAllTime > 0) item.magnetized = true;
    else {
      for (const puller of pullers) {
        const r = puller === p ? run.stats.pickupRadius : (puller.pickupRadius ?? 0);
        if ((puller.x - item.x) ** 2 + (puller.y - item.y) ** 2 < r * r) { item.magnetized = true; break; }
      }
    }
  }
  if (!item.magnetized) return;
  const a = Math.atan2(p.y - item.y, p.x - item.x);
  item.x += Math.cos(a) * speed * dt;
  item.y += Math.sin(a) * speed * dt;
  if ((p.x - item.x) ** 2 + (p.y - item.y) ** 2 < COLLECT_RADIUS * COLLECT_RADIUS) {
    item.dead = true;
    onCollect();
  }
}

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

export function xpToNextLevel(level: number): number {
  return 8 + 5 * level + 0.5 * level * level;
}

function gainXp(amount: number): void {
  const p = run.player;
  p.xp += amount;
  while (p.xp >= xpToNextLevel(p.level)) {
    p.xp -= xpToNextLevel(p.level);
    p.level++;
    run.pendingLevelUps++;
  }
}
