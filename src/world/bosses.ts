// ============================================================ bosses
import type { Boss, BossKind, Hero } from '../types';
import { ARENA_H, ARENA_W, COLOR, TAU } from '../core/constants';
import { angleDiff, clamp, randPick, randRange } from '../core/math';
import { livingHeroes, nearestHero, partyScale, run, showBanner, withHero } from '../core/state';
import { hurtHero, hurtPlayer } from './combat';
import { addFloatingText, addTelegraph, schedule, spawnBurst, spawnSlash } from './effects';
import { createStatusTimers, spawnEnemy } from './enemies';
import { BOSS_HEAL_ORB, BOSS_HEAL_ORBS, dropCoin, dropGem } from './pickups';
import { currentMods } from './maps';
import { fireEnemyShot } from './projectiles';
import { completeWave } from './waves';
import { addZone } from './zones';

export interface BossDef {
  /** Selects the AI (BOSS_AI) and the drawing (BOSS_SHAPES). */
  kind: BossKind;
  name: string;
  hp: number;
  r: number;
  damage: number;
  color: string;
  speed: number;
  undead: boolean;
  /** Grants +1 card slot on defeat. */
  unlocksCardSlot?: boolean;
}

/** Bosses, keyed by the wave they appear on. HP raised 1.5x (Nov 2026 playtest: bosses died too fast). */
export const BOSS_DEFS: Record<number, BossDef> = {
  3: { kind: 'troll', name: 'Thornback Troll', hp: 1350, r: 30, damage: 14, color: '#7f9a4e', speed: 70, undead: false },
  6: { kind: 'colossus', name: 'Bone Colossus', hp: 3600, r: 36, damage: 18, color: '#d8d0b8', speed: 45, undead: true, unlocksCardSlot: true },
  9: { kind: 'wyvern', name: 'Crimson Wyvern', hp: 4800, r: 30, damage: 20, color: '#c2334a', speed: 0, undead: false },
  12: { kind: 'king', name: 'The Hollow King', hp: 9750, r: 28, damage: 24, color: '#8e7fb0', speed: 80, undead: true },
};

const BOSS_TELEGRAPH_COLOR = COLOR.ember;

/** Hurt every living hero for whom `inRange(hero)` is true. */
function hurtHeroesWhere(inRange: (h: Hero) => boolean, amount: number): void {
  for (const h of livingHeroes()) if (inRange(h)) hurtHero(h, amount);
}

export function spawnBoss(wave: number): void {
  const living = livingHeroes();
  const def = BOSS_DEFS[wave], a = randRange(0, TAU), p = living.length ? randPick(living).player : run.player;
  const x = clamp(p.x + Math.cos(a) * 380, 80, ARENA_W - 80);
  const y = clamp(p.y + Math.sin(a) * 380, 80, ARENA_H - 80);
  const hp = def.hp * partyScale(0.7) * currentMods().bossHp;
  const e: Boss = {
    id: run.nextId++,
    type: 'boss', kind: def.kind, name: def.name, x, y, r: def.r,
    hp, maxHp: hp, speed: def.speed, damage: def.damage, color: def.color, undead: def.undead,
    unlocksCardSlot: !!def.unlocksCardSlot,
    boss: true, elite: false, dead: false, flash: 0, contactCooldown: 0, xp: 0, face: 0, knockX: 0, knockY: 0,
    ...createStatusTimers(),
    stagger: 0, stunTime: 0, phase: 1,
    // AI state machine
    state: 'chase', stateTime: 0, attackTimer: 3, specialTimer: 3.5, orbitAngle: 0, lockedAngle: 0, target: null,
  };
  run.enemies.push(e);
  run.boss = e;
  spawnBurst(x, y, def.color, 30, 200);
}

export function onBossDefeated(e: Boss): void {
  run.boss = null;
  run.bossesKilled++;
  // clear the boss's attacks
  run.shots = run.shots.filter((s) => s.owner !== 'enemy');
  run.zones = run.zones.filter((z) => z.owner !== 'enemy');
  run.telegraphs = run.telegraphs.filter((t) => t.friendly);
  run.safeZone = null;
  const gemValue = 6 * (1 + 0.3 * (run.wave - 1));
  for (let i = 0; i < 14; i++) dropGem(e.x + randRange(-50, 50), e.y + randRange(-50, 50), gemValue, true);
  for (let i = 0; i < BOSS_HEAL_ORBS; i++) dropCoin(e.x + randRange(-40, 40), e.y + randRange(-40, 40), BOSS_HEAL_ORB * currentMods().healOrbMul, 'heal');
  spawnBurst(e.x, e.y, e.color, 40, 240);
  run.shake = 10;
  if (e.unlocksCardSlot) {
    for (const h of run.heroes) h.cardSlots++;
    schedule(2.4, () => showBanner(ordinal(run.cardSlots) + ' card slot unlocked', 2.5));
  }
  completeWave();
}

const ordinal = (n: number): string => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');

/** The boss hunts the nearest hero. Its AI runs as that hero, so `run.player` is its target. */
export function updateBoss(e: Boss, dt: number): void {
  const target = nearestHero(e.x, e.y);
  if (!target) return;
  withHero(target, () => updateBossFor(e, dt));
}

function updateBossFor(e: Boss, dt: number): void {
  const p = run.player;
  if (e.stunTime > 0) { e.stunTime -= dt; return; }
  const angle = Math.atan2(p.y - e.y, p.x - e.x), distToPlayer = Math.hypot(p.x - e.x, p.y - e.y);
  e.face = angle;
  if (distToPlayer < e.r + p.r && e.contactCooldown <= 0) {
    e.contactCooldown = 0.8;
    hurtPlayer(e.damage);
  }
  e.stateTime += dt;
  const slowMul = e.slowTime > 0 ? 0.7 : 1;
  e.slowTime -= dt;
  BOSS_AI[e.kind](e, dt, angle, distToPlayer, slowMul);
  e.x = clamp(e.x, e.r, ARENA_W - e.r);
  e.y = clamp(e.y, e.r, ARENA_H - e.r);
}

function setBossState(e: Boss, state: Boss['state']): void {
  e.state = state;
  e.stateTime = 0;
}

function moveBossToward(e: Boss, angle: number, speed: number, dt: number): void {
  e.x += Math.cos(angle) * speed * dt;
  e.y += Math.sin(angle) * speed * dt;
}

/** Walk toward the player at the boss's own speed, scaled by haste and slow. */
function chasePlayer(e: Boss, angle: number, dt: number, slowMul: number, haste = 1): void {
  e.x += Math.cos(angle) * e.speed * haste * slowMul * dt;
  e.y += Math.sin(angle) * e.speed * haste * slowMul * dt;
}

/** Move straight at a point, never overshooting. Returns the distance before moving. */
function moveBossTo(e: Boss, tx: number, ty: number, maxSpeed: number, dt: number): number {
  const a = Math.atan2(ty - e.y, tx - e.x), d = Math.hypot(tx - e.x, ty - e.y);
  const step = Math.min(d, maxSpeed * dt);
  e.x += Math.cos(a) * step;
  e.y += Math.sin(a) * step;
  return d;
}

type BossAi = (e: Boss, dt: number, angleToPlayer: number, distToPlayer: number, slowMul: number) => void;

const BOSS_AI: Record<BossKind, BossAi> = {
  // Thornback Troll: charges in lines, throws boulders. Teaches the dash.
  troll(e, dt, angle, _distToPlayer, slowMul) {
    if (e.state === 'chase') {
      chasePlayer(e, angle, dt, slowMul);
      e.attackTimer -= dt;
      e.specialTimer -= dt;
      if (e.specialTimer <= 0) {
        e.specialTimer = 3.2;
        fireEnemyShot(e, angle + randRange(-0.1, 0.1), 260, 12, 16, '#9a8a62', 'boulder', 4);
      }
      if (e.attackTimer <= 0) {
        setBossState(e, 'aim');
        e.lockedAngle = angle;
        addTelegraph({ kind: 'line', x: e.x, y: e.y, a: angle, len: 540, w: e.r * 2, dur: 0.8, color: BOSS_TELEGRAPH_COLOR });
      }
    } else if (e.state === 'aim') {
      if (e.stateTime >= 0.8) setBossState(e, 'charge');
    } else if (e.state === 'charge') {
      moveBossToward(e, e.lockedAngle, 580, dt);
      hurtHeroesWhere((h) => Math.hypot(h.player.x - e.x, h.player.y - e.y) < e.r + h.player.r, e.damage * 1.4);
      const hitWall = e.x <= e.r + 1 || e.x >= ARENA_W - e.r - 1 || e.y <= e.r + 1 || e.y >= ARENA_H - e.r - 1;
      if (e.stateTime > 0.93 || hitWall) {
        setBossState(e, 'recover');
        run.shake = 6;
        spawnBurst(e.x, e.y, '#9a8a62', 12, 140);
      }
    } else if (e.state === 'recover') {
      if (e.stateTime > 0.9) { e.state = 'chase'; e.attackTimer = randRange(3.5, 4.5); }
    }
  },

  // Bone Colossus: ground slam shockwaves, summons skeleton archers.
  colossus(e, dt, angle, _distToPlayer, slowMul) {
    if (e.state === 'chase') {
      chasePlayer(e, angle, dt, slowMul);
      e.attackTimer -= dt;
      e.specialTimer -= dt;
      if (e.attackTimer <= 0) {
        setBossState(e, 'slam');
        addTelegraph({ kind: 'circle', x: e.x, y: e.y, r: 170, dur: 1.0, color: BOSS_TELEGRAPH_COLOR });
      }
      if (e.specialTimer <= 0) {
        e.specialTimer = 7;
        for (let i = 0; i < 3; i++) {
          const a = randRange(0, TAU);
          spawnEnemy('archer', e.x + Math.cos(a) * 70, e.y + Math.sin(a) * 70, false);
        }
        addFloatingText(e.x, e.y - e.r - 12, 'Rise!', COLOR.ember, 14);
      }
    } else if (e.state === 'slam') {
      if (e.stateTime >= 1.0) {
        hurtHeroesWhere((h) => Math.hypot(h.player.x - e.x, h.player.y - e.y) < 170, e.damage);
        addZone({ owner: 'enemy', kind: 'ring', x: e.x, y: e.y, r: 0, startR: 30, endR: 330, currentR: 30, dur: 0.9, life: 1, dmg: e.damage * 0.8 });
        run.shake = 8;
        spawnBurst(e.x, e.y, '#d8d0b8', 16, 160);
        e.state = 'chase';
        e.attackTimer = randRange(4.5, 5.5);
      }
    }
  },

  // Crimson Wyvern: circles the arena, fire breath lines, dive attacks.
  wyvern(e, dt, angle) {
    const p = run.player;
    if (e.state === 'chase') {
      e.orbitAngle += dt * 0.6;
      moveBossTo(e, p.x + Math.cos(e.orbitAngle) * 220, p.y + Math.sin(e.orbitAngle) * 220, 230, dt);
      e.attackTimer -= dt;
      e.specialTimer -= dt;
      if (e.attackTimer <= 0) {
        setBossState(e, 'breath');
        e.lockedAngle = angle;
        addTelegraph({ kind: 'line', x: e.x, y: e.y, a: angle, len: 540, w: 40, dur: 0.8, color: BOSS_TELEGRAPH_COLOR });
      } else if (e.specialTimer <= 0) {
        setBossState(e, 'dive');
        e.target = { x: p.x, y: p.y };
        addTelegraph({ kind: 'circle', x: p.x, y: p.y, r: 64, dur: 0.9, color: BOSS_TELEGRAPH_COLOR });
      }
    } else if (e.state === 'breath') {
      if (e.stateTime >= 0.8) {
        for (let i = 1; i <= 13; i++) {
          addZone({
            owner: 'enemy', kind: 'fire', x: e.x + Math.cos(e.lockedAngle) * i * 40, y: e.y + Math.sin(e.lockedAngle) * i * 40,
            r: 21, life: 3, dps: 18, tick: 0.2, color: 'rgba(255,110,50,0.35)',
          });
        }
        e.state = 'chase';
        e.attackTimer = randRange(3.5, 4.5);
      }
    } else if (e.state === 'land') {
      if (e.stateTime >= 2.0) e.state = 'chase';
    } else if (e.state === 'dive' && e.target) {
      if (e.stateTime >= 0.9) {
        const remaining = moveBossTo(e, e.target.x, e.target.y, 950, dt);
        if (remaining < 6 || e.stateTime > 2.2) {
          hurtHeroesWhere((h) => Math.hypot(h.player.x - e.x, h.player.y - e.y) < 64 + h.player.r, e.damage * 1.2);
          run.shake = 7;
          spawnBurst(e.x, e.y, '#ff6e32', 18, 180);
          setBossState(e, 'land');
          e.specialTimer = randRange(5.5, 6.5);
          addFloatingText(e.x, e.y - e.r - 12, 'Landed!', COLOR.gold, 13);
        }
      }
    }
  },

  // The Hollow King: 3 phases. Sword slashes, shard rings, shrinking arena.
  king(e, dt, angle, distToPlayer, slowMul) {
    const p = run.player, hpFrac = e.hp / e.maxHp;
    const phase = hpFrac > 0.66 ? 1 : hpFrac > 0.33 ? 2 : 3;
    if (phase !== e.phase) {
      e.phase = phase;
      showBanner('The Hollow King · Phase ' + phase, 2);
      if (phase === 3) {
        const toCenter = Math.hypot(p.x - ARENA_W / 2, p.y - ARENA_H / 2);
        run.safeZone = { x: ARENA_W / 2, y: ARENA_H / 2, r: Math.max(700, toCenter + 150), min: 380 };
      }
    }
    if (run.safeZone) run.safeZone.r = Math.max(run.safeZone.min, run.safeZone.r - 22 * dt);
    const haste = phase === 3 ? 1.25 : 1;
    if (e.state === 'chase') {
      if (phase === 2 && distToPlayer < 230) moveBossToward(e, angle, -e.speed, dt);
      else if (distToPlayer > 60) chasePlayer(e, angle, dt, slowMul, haste);
      e.attackTimer -= dt * haste;
      e.specialTimer -= dt * haste;
      if (e.attackTimer <= 0 && distToPlayer < 270) {
        setBossState(e, 'slash');
        e.lockedAngle = angle;
        addTelegraph({ kind: 'cone', x: e.x, y: e.y, a: angle, r: 170, arc: Math.PI / 2, dur: 0.9, color: BOSS_TELEGRAPH_COLOR });
      }
      if (phase >= 2 && e.specialTimer <= 0) {
        e.specialTimer = 2.4;
        const count = 16, offset = randRange(0, TAU);
        for (let i = 0; i < count; i++) fireEnemyShot(e, offset + (i * TAU) / count, 200, 6, 12, '#ff6e8a', 'shard', 4);
      }
    } else if (e.state === 'slash') {
      if (e.stateTime >= 0.9) {
        hurtHeroesWhere((h) => {
          const hp = h.player;
          const inCone = Math.abs(angleDiff(e.lockedAngle, Math.atan2(hp.y - e.y, hp.x - e.x))) < Math.PI / 4 + 0.1;
          return inCone && Math.hypot(hp.x - e.x, hp.y - e.y) < 170 + hp.r;
        }, 22);
        spawnSlash(e.x, e.y, e.lockedAngle, 170, Math.PI / 2, COLOR.ember, 8);
        e.state = 'chase';
        e.attackTimer = randRange(2.6, 3.4);
      }
    }
  },
};
