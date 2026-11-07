// ============================================================ run lifecycle
import type { Player, Stats } from '../types';
import { ARENA_H, ARENA_W, SCENE } from '../core/constants';
import { recalcStats, run, setRun, setScene } from '../core/state';
import { CLASSES } from '../classes/registry';
import { spawnEnemy } from '../world/enemies';
import { findSpawnPosition, startWave } from '../world/waves';

const START_CARD_SLOTS = 5;
const START_ENEMIES = 8;

function createPlayer(): Player {
  return {
    x: ARENA_W / 2, y: ARENA_H / 2, r: 12, hp: 1, face: 0,
    level: 1, xp: 0, ult: 0,
    iframes: 0, hitFlash: 0,
    moveX: 0, moveY: 0,
    dashCooldown: 0, dashCharges: 1, dashTime: 0, dashVx: 0, dashVy: 0,
    heavyCooldown: 0,
    boneShield: 0, boneShieldTime: 0,
    regenBuff: 0, regenBuffTime: 0,
  };
}

/** Start a fresh run with the given class id and switch to play. */
export function newRun(classId: string): void {
  const cls = CLASSES[classId];
  setRun({
    classId, cls,
    time: 0,
    // waves
    wave: 0, waveTime: 0, waveDuration: 0, spawnBudget: 0,
    boss: null, bossesKilled: 0, wavesCleared: 0,
    // view
    camera: { x: 0, y: 0 }, shake: 0, banner: null,
    // player and build
    player: createPlayer(),
    cardSlots: START_CARD_SLOTS,
    cards: {}, relics: {}, statCards: { dmg: 0, hp: 0, move: 0, atk: 0, crit: 0 },
    // world entities
    enemies: [], shots: [], zones: [], gems: [], coins: [], allies: [],
    fx: [], floatingTexts: [], telegraphs: [], timers: [],
    // progression
    pendingLevelUps: 0, offer: null, rerolls: 1, firstOffer: true,
    kills: 0, coinsHeld: 0,
    // arena effects
    safeZone: null, magnetAllTime: 0,
    classState: {},
    result: null,
    stats: null as unknown as Stats, // filled by recalcStats() just below
  });
  recalcStats();
  run.player.hp = run.stats.maxHp;
  run.player.dashCharges = run.stats.dashCharges;
  cls.init();
  startWave(1);
  for (let i = 0; i < START_ENEMIES; i++) {
    const pos = findSpawnPosition();
    spawnEnemy(i % 2 ? 'goblin' : 'slime', pos.x, pos.y, false);
  }
  setScene(SCENE.PLAY);
}

/** Finish the run and show the result screen. Rewards feed future meta-progression. */
export function endRun(win: boolean): void {
  if (run.result) return;
  const gold = Math.round(10 * run.wavesCleared + 50 * run.bossesKilled + (win ? 150 : 0));
  const exp = 20 * run.wavesCleared + 80 * run.bossesKilled + (win ? 200 : 0);
  run.result = { win, gold, exp, time: run.time };
  setScene(SCENE.RESULT);
}
