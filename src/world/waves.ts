// ============================================================ waves
import type { EnemyTypeId, Point } from '../types';
import { ARENA_H, ARENA_W, FINAL_WAVE, TAU, VIEW_H, VIEW_W } from '../core/constants';
import { clamp, randRange, weightedPick } from '../core/math';
import { run, showBanner } from '../core/state';
import { endRun } from '../game/run';
import { BOSS_DEFS, spawnBoss } from './bosses';
import { spawnEnemy } from './enemies';

/** Length in seconds of each normal wave. Boss waves last until the boss dies. */
const WAVE_DURATION: Record<number, number> = { 1: 45, 2: 50, 4: 55, 5: 60, 7: 60, 8: 70, 10: 70, 11: 75 };
const ENEMY_CAP = 170;
const ELITE_FROM_WAVE = 7;
const ELITE_CHANCE = 0.06;

export const isBossWave = (wave: number): boolean => wave % 3 === 0;

/** Spawn weight of each enemy type on a wave (0 = not yet). */
function spawnWeights(wave: number): Partial<Record<EnemyTypeId, number>> {
  return {
    slime: 3,
    goblin: 3,
    bat: wave >= 2 ? 2 : 0,
    archer: wave >= 4 ? 2 : 0,
    imp: wave >= 4 ? 1.4 : 0,
    cultist: wave >= 5 ? 1.4 : 0,
    orc: wave >= 5 ? 1.4 : 0,
  };
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
  if (run.cls.onWaveStart) run.cls.onWaveStart();
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
  const spawnRate = boss ? 0.5 + 0.08 * wave : 1.0 + 0.3 * wave;
  run.spawnBudget += spawnRate * dt;
  const weights = spawnWeights(wave);
  const types = (Object.keys(weights) as EnemyTypeId[]).filter((k) => (weights[k] ?? 0) > 0);
  while (run.spawnBudget >= 1) {
    run.spawnBudget -= 1;
    if (run.enemies.length >= ENEMY_CAP) break;
    const type = weightedPick(types, (k) => weights[k] ?? 0);
    const pos = findSpawnPosition();
    const elite = wave >= ELITE_FROM_WAVE && Math.random() < ELITE_CHANCE;
    if (type === 'bat' && Math.random() < 0.5) {
      // bats sometimes arrive as a small flock
      for (let i = 0; i < 3; i++) spawnEnemy('bat', pos.x + randRange(-30, 30), pos.y + randRange(-30, 30), false);
    } else {
      spawnEnemy(type, pos.x, pos.y, elite);
    }
  }
  if (!boss && run.waveTime >= run.waveDuration) completeWave();
}

/** A point just off-screen around the player, inside the arena. */
export function findSpawnPosition(): Point {
  const p = run.player;
  for (let i = 0; i < 12; i++) {
    const a = randRange(0, TAU), r = randRange(500, 660);
    const x = clamp(p.x + Math.cos(a) * r, 30, ARENA_W - 30);
    const y = clamp(p.y + Math.sin(a) * r, 30, ARENA_H - 30);
    if (Math.abs(x - p.x) > VIEW_W / 2 + 20 || Math.abs(y - p.y) > VIEW_H / 2 + 20) return { x, y };
  }
  return { x: p.x < ARENA_W / 2 ? ARENA_W - 40 : 40, y: randRange(40, ARENA_H - 40) };
}
