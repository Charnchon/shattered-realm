// ============================================================ waves
import type { EnemyTypeId, Point } from '../types';
import { ARENA_H, ARENA_W, FINAL_WAVE, TAU, VIEW_H, VIEW_W } from '../core/constants';
import { clamp, randPick, randRange, weightedPick } from '../core/math';
import { livingHeroes, partyScale, run, showBanner, withHero } from '../core/state';
import { endRun } from '../game/run';
import { BOSS_DEFS, spawnBoss } from './bosses';
import { reviveHero } from './combat';
import { ENEMY_TYPES, spawnEnemy } from './enemies';
import { currentMods, mapDef } from './maps';

/** Downed heroes come back at the start of each wave with this share of their HP. */
const WAVE_REVIVE_HP = 0.5;

/** Length in seconds of each normal wave. Boss waves last until the boss dies. */
const WAVE_DURATION: Record<number, number> = { 1: 45, 2: 50, 4: 55, 5: 60, 7: 60, 8: 70, 10: 70, 11: 75 };
/** Fewer, tougher enemies: the player should be choosing targets, not mowing a horde. */
const ENEMY_CAP = 70;
const ELITE_FROM_WAVE = 7;
/** Elite chance on the first elite wave, rising each wave after it (6% on wave 7 → 10% on wave 11). */
const ELITE_CHANCE = 0.06;
const ELITE_CHANCE_PER_WAVE = 0.01;
/** From this wave on, fodder fades out and the tougher enemies take its place. */
const LATE_FROM_WAVE = 7;

export const isBossWave = (wave: number): boolean => wave % 3 === 0;

/** Spawn weight of each enemy type on a wave (0 = not yet). Late waves swap fodder for tougher enemies. */
function spawnWeights(wave: number): Partial<Record<EnemyTypeId, number>> {
  const late = Math.max(0, wave - LATE_FROM_WAVE + 1); // 0 before wave 7, then 1, 2, …
  const fodder = Math.max(1, 3 - 0.4 * late);
  const tough = 1.4 + 0.2 * late;
  return {
    slime: fodder,
    goblin: fodder,
    bat: wave >= 2 ? 2 : 0,
    archer: wave >= 4 ? 2 : 0,
    imp: wave >= 4 ? 1.4 : 0,
    cultist: wave >= 5 ? tough : 0,
    orc: wave >= 5 ? tough : 0,
    boar: wave >= 2 ? 1.2 : 0,
    toad: wave >= 4 ? 1.2 : 0,
    wraith: wave >= 5 ? 1.2 : 0,
    caller: wave >= 7 ? 1 : 0,
  };
}

/** Is this type already at its `maxAlive` (per living player)? */
function atLimit(type: EnemyTypeId): boolean {
  const max = ENEMY_TYPES[type].maxAlive;
  if (!max) return false;
  const players = Math.max(1, livingHeroes().length);
  return run.enemies.filter((e) => !e.dead && !e.boss && e.type === type).length >= max * players;
}

/** Chance that a spawn on this wave is an elite. */
function eliteChance(wave: number): number {
  const from = Math.min(ELITE_FROM_WAVE, currentMods().eliteFromWave); // map level 3+: from wave 4
  return wave >= from ? ELITE_CHANCE + ELITE_CHANCE_PER_WAVE * Math.max(0, wave - ELITE_FROM_WAVE) : 0;
}

export function startWave(wave: number): void {
  run.wave = wave;
  run.waveTime = 0;
  run.waveDuration = WAVE_DURATION[wave] || 0;
  run.spawnBudget = 0;
  if (isBossWave(wave)) {
    spawnBoss(wave);
    showBanner('Wave ' + wave + ' · ' + BOSS_DEFS[wave].name, 3);
  } else {
    showBanner('Wave ' + wave, 2.2);
  }
  for (const h of run.heroes) {
    if (h.down) reviveHero(h, WAVE_REVIVE_HP);
    if (!h.gone && h.cls.onWaveStart) withHero(h, () => h.cls.onWaveStart!());
  }
}

/** Called when a wave's timer runs out or its boss dies. */
export function completeWave(): void {
  run.wavesCleared++;
  if (run.wave >= FINAL_WAVE) { endRun(true); return; }
  startWave(run.wave + 1);
}

export function updateWave(dt: number): void {
  run.waveTime += dt;
  const wave = run.wave, boss = isBossWave(wave);
  const mods = currentMods();
  const spawnRate = (boss ? 0.25 + 0.04 * wave : 0.5 + 0.15 * wave) * partyScale(0.6) * mods.spawnMul;
  run.spawnBudget += spawnRate * dt;
  const weights = spawnWeights(wave), mix = mapDef(run.mapId).spawnMul ?? {};
  for (const k of Object.keys(mix) as EnemyTypeId[]) if (weights[k]) weights[k] = (weights[k] ?? 0) * (mix[k] ?? 1); // the map's usual crowd
  while (run.spawnBudget >= 1) {
    run.spawnBudget -= 1;
    if (run.enemies.length >= ENEMY_CAP * partyScale(0.25) * mods.spawnMul) break;
    const types = (Object.keys(weights) as EnemyTypeId[]).filter((k) => (weights[k] ?? 0) > 0 && !atLimit(k));
    const type = weightedPick(types, (k) => weights[k] ?? 0);
    const pos = findSpawnPosition();
    const elite = eliteChance(wave) > 0 && Math.random() < eliteChance(wave);
    if (type === 'bat' && Math.random() < 0.3) {
      // bats sometimes arrive as a small flock
      for (let i = 0; i < 3; i++) spawnEnemy('bat', pos.x + randRange(-30, 30), pos.y + randRange(-30, 30), false);
    } else {
      spawnEnemy(type, pos.x, pos.y, elite);
    }
  }
  if (!boss && run.waveTime >= run.waveDuration) completeWave();
}

/** A point just off-screen around a random living player, and off every player's screen, inside the arena. */
export function findSpawnPosition(): Point {
  const living = livingHeroes();
  const heroes = living.length ? living : run.heroes;
  const p = (heroes.length > 1 ? randPick(heroes) : heroes[0]).player;
  const offScreenForAll = (x: number, y: number): boolean =>
    heroes.every((h) => Math.abs(x - h.player.x) > VIEW_W / 2 + 20 || Math.abs(y - h.player.y) > VIEW_H / 2 + 20);
  for (let i = 0; i < 12; i++) {
    const a = randRange(0, TAU), r = randRange(500, 660);
    const x = clamp(p.x + Math.cos(a) * r, 30, ARENA_W - 30);
    const y = clamp(p.y + Math.sin(a) * r, 30, ARENA_H - 30);
    if (offScreenForAll(x, y)) return { x, y };
  }
  return { x: p.x < ARENA_W / 2 ? ARENA_W - 40 : 40, y: randRange(40, ARENA_H - 40) };
}
