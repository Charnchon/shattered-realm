// ============================================================ run lifecycle
import type { Hero, HeroInput, Player, Run, Stats } from '../types';
import { ARENA_H, ARENA_W, SCENE } from '../core/constants';
import { recalcStats, run, setRun, setScene, withHero } from '../core/state';
import { CLASSES } from '../classes/registry';
import { spawnEnemy } from '../world/enemies';
import { findSpawnPosition, startWave } from '../world/waves';

const START_CARD_SLOTS = 5;
const START_ENEMIES = 8;
/** Heroes start in a small circle around the arena centre. */
const START_SPREAD = 50;

/** Who plays in a run: one entry per player. */
export interface HeroSpec {
  classId: string;
  name?: string;
  /** Played by the test bot. */
  bot?: boolean;
}

/**
 * Fields of `Run` that belong to the current hero: reading or writing `run.player`, `run.cards`, ...
 * goes to `run.hero`. This keeps class code written for one player working unchanged in co-op.
 */
const HERO_FIELDS = [
  'classId', 'cls', 'player', 'stats', 'cardSlots', 'cards', 'relics', 'statCards', 'pendingLevelUps',
  'offer', 'rerolls', 'firstOffer', 'coinsHeld', 'magnetAllTime', 'allies', 'classState',
] as const satisfies readonly (keyof Hero & keyof Run)[];

/** Make `run.<field>` read and write the current hero's field. */
export function attachHeroAccessors(target: object): void {
  for (const field of HERO_FIELDS) {
    Object.defineProperty(target, field, {
      get(this: Run) { return this.hero[field]; },
      set(this: Run, value: unknown) { (this.hero as unknown as Record<string, unknown>)[field] = value; },
      enumerable: false,
      configurable: true,
    });
  }
}

export const emptyInput = (): HeroInput => ({ moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, heavy: false, dash: false, ult: false });

function createPlayer(x: number, y: number): Player {
  return {
    x, y, r: 12, hp: 1, face: 0,
    level: 1, xp: 0, ult: 0,
    iframes: 0, hitFlash: 0,
    moveX: 0, moveY: 0,
    dashCooldown: 0, dashCharges: 1, dashTime: 0, dashVx: 0, dashVy: 0,
    heavyCooldown: 0,
    boneShield: 0, boneShieldTime: 0,
    regenBuff: 0, regenBuffTime: 0,
  };
}

export function createHero(idx: number, spec: HeroSpec, count: number): Hero {
  const angle = (idx / Math.max(1, count)) * Math.PI * 2;
  const spread = count > 1 ? START_SPREAD : 0;
  const x = ARENA_W / 2 + Math.cos(angle) * spread, y = ARENA_H / 2 + Math.sin(angle) * spread;
  return {
    idx,
    name: spec.name || 'Player ' + (idx + 1),
    classId: spec.classId,
    cls: CLASSES[spec.classId],
    player: createPlayer(x, y),
    stats: null as unknown as Stats, // filled by recalcStats() in newRunWith
    cardSlots: START_CARD_SLOTS,
    cards: {}, relics: {}, statCards: { dmg: 0, hp: 0, move: 0, atk: 0, crit: 0 },
    pendingLevelUps: 0, offer: null, rerolls: 1, firstOffer: true,
    coinsHeld: 0, magnetAllTime: 0,
    allies: [],
    classState: {},
    input: { ...emptyInput(), aimX: x + 100, aimY: y },
    bot: !!spec.bot,
    down: false, revive: 0, gone: false,
  };
}

/** The shared (non-hero) part of a fresh run. */
export function createRunShell(heroes: Hero[], localHero: number): Run {
  const shell = {
    heroes, hero: heroes[localHero], localHero, nextId: 1,
    time: 0,
    // waves
    wave: 0, waveTime: 0, waveDuration: 0, spawnBudget: 0,
    boss: null, bossesKilled: 0, wavesCleared: 0,
    // view
    camera: { x: 0, y: 0 }, shake: 0, banner: null,
    // world entities
    enemies: [], shots: [], zones: [], gems: [], coins: [],
    fx: [], floatingTexts: [], telegraphs: [], timers: [],
    kills: 0,
    // arena effects
    safeZone: null,
    result: null,
  };
  attachHeroAccessors(shell);
  return shell as unknown as Run;
}

/** Start a fresh single-player run with the given class id and switch to play. */
export function newRun(classId: string): void {
  newRunWith([{ classId }], 0);
}

/** Start a fresh run for these players. `localHero` is the one this screen follows. */
export function newRunWith(specs: HeroSpec[], localHero: number): void {
  const heroes = specs.map((spec, i) => createHero(i, spec, specs.length));
  setRun(createRunShell(heroes, localHero));
  for (const hero of heroes) {
    withHero(hero, () => {
      recalcStats();
      run.player.hp = run.stats.maxHp;
      run.player.dashCharges = run.stats.dashCharges;
      run.cls.init();
    });
  }
  startWave(1);
  for (let i = 0; i < START_ENEMIES * heroes.length; i++) {
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
