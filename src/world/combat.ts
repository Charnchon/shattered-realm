// ============================================================ combat: damage, healing, status
import type { Enemy, Hero, HitOptions, Mob } from '../types';
import { COLOR, SCENE } from '../core/constants';
import { angleDiff, randRange, segmentDistSq } from '../core/math';
import { DEBUG, livingHeroes, run, scene, showBanner, totalArmor, withHero } from '../core/state';
import { endRun } from '../game/run';
import { onBossDefeated } from './bosses';
import { addFloatingText, spawnBurst } from './effects';
import { DAZED_DAMAGE_MUL, ENEMY_TYPES, IMP_BLAST, cancelWindup, enemiesInRadius, spawnEnemy } from './enemies';
import { ELITE_HEAL_ORB, dropCoin, dropGem } from './pickups';
import { currentMods } from './maps';

const SHIELD_BLOCK_MUL = 0.2;
const SHIELD_ARC = 1.0;
const BOSS_STAGGER_PER_HEAVY = 14;
/** Ultimate charge (%) per kill. Doubled from the plan's 1% / 5% because waves now have about half as many, tougher enemies. */
const ULT_PER_KILL = 2;
const ULT_PER_ELITE_KILL = 10;

/** Deal `amount` base damage to an enemy. Returns the final damage dealt. */
export function hitEnemy(e: Enemy | null, amount: number, opts: HitOptions = {}): number {
  if (!e || e.dead) return 0;
  if (!e.boss && e.phased) return 0; // an ethereal wraith can't be hurt
  const stats = run.stats, cls = run.cls;
  let damage = amount * stats.damage;
  if (!e.boss && (e.dazedTime ?? 0) > 0) damage *= DAZED_DAMAGE_MUL; // a dazed boar is open
  damage *= slayerMul(e); // Slayer achievements: up to +5% against a monster type
  if (cls.damageMod) damage *= cls.damageMod(e, opts);

  let crit = false;
  if (!opts.dot && !opts.noCrit && Math.random() < stats.critChance) {
    damage *= stats.critDamage;
    crit = true;
  }

  if (opts.projectile && !e.boss && e.hasShield && !e.shieldBroken && opts.from) {
    const incoming = Math.atan2(opts.from.y - e.y, opts.from.x - e.x);
    if (Math.abs(angleDiff(e.face, incoming)) < SHIELD_ARC) {
      damage *= SHIELD_BLOCK_MUL;
      if (!opts.silent) addFloatingText(e.x, e.y - e.r - 6, 'block', COLOR.dim, 10);
    }
  }

  if (opts.heavy) applyHeavyHit(e);

  if (opts.knock && !e.boss) {
    const a = opts.knockAngle != null ? opts.knockAngle : Math.atan2(e.y - run.player.y, e.x - run.player.x);
    e.knockX += Math.cos(a) * opts.knock * 6;
    e.knockY += Math.sin(a) * opts.knock * 6;
  }

  run.hero.score.damage += Math.min(damage, Math.max(0, e.hp)); // overkill doesn't count
  if (!e.boss) {
    e.lastHitBy = run.hero.idx;
    if ((e.dazedTime ?? 0) > 0) run.hero.tally.dazedHits++;
  }
  e.hp -= damage;
  e.flash = 0.08;
  if (!opts.silent && damage >= 0.5) {
    const label = Math.round(damage) + (crit ? '!' : '');
    addFloatingText(e.x + randRange(-6, 6), e.y - e.r - 4, label, crit ? COLOR.gold : opts.color || COLOR.text, crit ? 13 : 11);
  }
  if (stats.lifesteal > 0 && !opts.noSteal) {
    healPlayer(damage * stats.lifesteal * (cls.lifestealMul ? cls.lifestealMul() : 1), true);
  }
  if (e.boss) addUlt((damage / e.maxHp) * 100 * stats.ultRate);
  if (crit && cls.onCrit) cls.onCrit(e, opts);
  if (cls.onHit) cls.onHit(e, damage, opts);
  if (e.hp <= 0) killEnemy(e, opts);
  return damage;
}

function applyHeavyHit(e: Enemy): void {
  if (!e.boss && e.hasShield && !e.shieldBroken) {
    e.shieldBroken = true;
    run.hero.tally.shieldBreaks++;
    addFloatingText(e.x, e.y - 20, 'shield broken', COLOR.gold, 11);
  }
  if (e.boss) {
    e.stagger = (e.stagger || 0) + BOSS_STAGGER_PER_HEAVY;
    if (e.stagger >= 100) {
      e.stagger = 0;
      e.stunTime = 2;
      showBanner('Staggered!', 1.2);
    }
  }
  if (e.elite) e.attackTimer = Math.max(e.attackTimer, 1.2);
}

export function killEnemy(e: Enemy, opts: HitOptions = {}): void {
  if (e.dead) return;
  e.dead = true;
  run.kills++;
  run.hero.score.kills++; // the current hero landed the killing blow
  const key = monsterKey(e), tally = run.hero.tally;
  tally.killsByType[key] = (tally.killsByType[key] ?? 0) + 1;
  if (e.elite) tally.eliteKills++;
  spawnBurst(e.x, e.y, e.color, e.elite ? 14 : 7, 90);
  if (e.boss) { onBossDefeated(e); return; }
  dropGem(e.x, e.y, e.xp * (1 + 0.3 * (run.wave - 1)), e.elite);
  // every class can recover HP: elites drop a heal orb (it goes to whoever picks it up)
  if (e.elite) dropCoin(e.x, e.y, ELITE_HEAL_ORB * currentMods().healOrbMul, 'heal');
  addUlt((e.elite ? ULT_PER_ELITE_KILL : ULT_PER_KILL) * run.stats.ultRate);
  cancelWindup(e); // a dead archer/healer/imp's warning disappears with it
  const def = ENEMY_TYPES[e.type];
  if (def.bomber) blowUpImp(e);
  if (def.splitInto && run.wave >= 4) {
    for (let i = 0; i < 2; i++) spawnEnemy(def.splitInto, e.x + randRange(-8, 8), e.y + randRange(-8, 8), false);
  }
  if (run.cls.onKill) run.cls.onKill(e, opts);
}

/** Damage a killed imp deals to the enemies around it (scaled by the killer's damage, like any hit). */
const IMP_CHAIN_DAMAGE = 30;

/** Killing an imp before its fuse runs out makes it explode on its own side. */
function blowUpImp(e: Mob): void {
  spawnBurst(e.x, e.y, '#ff7a4a', 16, 140);
  for (const o of enemiesInRadius(e.x, e.y, IMP_BLAST)) {
    if (o === e) continue;
    hitEnemy(o, IMP_CHAIN_DAMAGE, { noCrit: true });
    if (o.dead) run.hero.tally.impChainKills++;
  }
}

/**
 * The key a kill counts under for Slayer and the bestiary: the enemy type, or the boss kind.
 * Split slimes count as slimes.
 */
export const monsterKey = (e: Enemy): string => (e.boss ? e.kind : e.type === 'mini' ? 'slime' : e.type);

/** +1% damage per Slayer tier the current hero has against this monster. */
const slayerMul = (e: Enemy): number => 1 + 0.01 * (run.hero.slayer?.[monsterKey(e)] ?? 0);

/** Make an enemy bleed. Keeps the stronger of the current and new bleed. */
export function applyBleed(e: Enemy, dps: number, duration: number): void {
  e.bleedDps = Math.max(e.bleedTime > 0 ? e.bleedDps : 0, dps);
  e.bleedTime = Math.max(e.bleedTime, duration);
  e.bleedOwner = run.hero.idx;
}

// ------------------------------------------------------------ area attacks (return enemies hit)

export function damageInCircle(x: number, y: number, r: number, damage: number, opts: HitOptions = {}): Enemy[] {
  const hit = enemiesInRadius(x, y, r);
  for (const e of hit) hitEnemy(e, damage, opts);
  return hit;
}

/** Cone of radius `r` and width `arc` (radians) facing `face`. */
export function damageInArc(x: number, y: number, face: number, r: number, arc: number, damage: number, opts: HitOptions = {}): Enemy[] {
  const hit: Enemy[] = [];
  for (const e of run.enemies) {
    if (e.dead) continue;
    const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy);
    if (d > r + e.r) continue;
    if (d > e.r && Math.abs(angleDiff(face, Math.atan2(dy, dx))) > arc / 2 + Math.atan2(e.r, d)) continue;
    hit.push(e);
  }
  for (const e of hit) hitEnemy(e, damage, opts);
  return hit;
}

/** Thick line from (x1, y1) to (x2, y2). */
export function damageInLine(x1: number, y1: number, x2: number, y2: number, width: number, damage: number, opts: HitOptions = {}): Enemy[] {
  const hit: Enemy[] = [];
  for (const e of run.enemies) {
    if (!e.dead && segmentDistSq(e.x, e.y, x1, y1, x2, y2) <= (width / 2 + e.r) ** 2) hit.push(e);
  }
  for (const e of hit) hitEnemy(e, damage, opts);
  return hit;
}

// ------------------------------------------------------------ player damage and healing

const ARMOR_HALF_POINT = 25;

export function addUlt(amount: number): void {
  run.player.ult = Math.min(100, run.player.ult + amount);
}

/** Hit a specific hero (see `hurtPlayer`). */
export const hurtHero = (hero: Hero, amount: number): void => withHero(hero, () => hurtPlayer(amount));
/** Damage over time to a specific hero (see `hurtPlayerOverTime`). */
export const hurtHeroOverTime = (hero: Hero, amount: number): void => withHero(hero, () => hurtPlayerOverTime(amount));

/** Hit the current hero (contact, projectile, slam). Respects i-frames, armor and shields. */
export function hurtPlayer(amount: number): void {
  const p = run.player;
  if (run.hero.down || p.iframes > 0 || p.dashTime > 0 || DEBUG.god || scene !== SCENE.PLAY) return;
  const armor = totalArmor();
  let damage = amount * (1 - armor / (armor + ARMOR_HALF_POINT));
  if (p.boneShield > 0) {
    p.boneShield--;
    addFloatingText(p.x, p.y - 22, 'blocked', COLOR.muted, 11);
    p.iframes = 0.3;
    return;
  }
  if (run.cls.absorb) damage = run.cls.absorb(damage);
  if (damage <= 0) { p.iframes = 0.2; return; }
  p.hp -= damage;
  run.hero.score.taken += damage;
  p.hitFlash = 0.15;
  p.iframes = 0.3;
  run.shake = Math.min(8, run.shake + 3);
  addFloatingText(p.x, p.y - 22, '-' + Math.round(damage), COLOR.red, 12);
  addUlt((damage / run.stats.maxHp) * 20 * run.stats.ultRate);
  checkPlayerDeath();
}

/** Damage over time (fire, the closing arena). Ignores armor and i-frames. */
export function hurtPlayerOverTime(amount: number): void {
  const p = run.player;
  if (run.hero.down || DEBUG.god || p.dashTime > 0) return;
  let damage = amount;
  if (run.cls.absorb) damage = run.cls.absorb(damage);
  p.hp -= damage;
  run.hero.score.taken += Math.max(0, damage);
  p.hitFlash = 0.08;
  checkPlayerDeath();
}

/** At 0 HP the hero is knocked out. The run ends when every hero is down. */
function checkPlayerDeath(): void {
  const p = run.player;
  if (p.hp > 0) return;
  if (run.cls.onLethal && run.cls.onLethal()) return;
  p.hp = 0;
  run.hero.down = true;
  run.hero.tally.downs++;
  run.hero.revive = 0;
  p.dashTime = 0;
  if (livingHeroes().length === 0) { endRun(false); return; }
  spawnBurst(p.x, p.y, run.cls.color, 16, 120);
  showBanner(run.hero.name + ' is down!', 2);
}

/** Bring a downed hero back with a share of their max HP. */
export function reviveHero(hero: Hero, hpFrac: number): void {
  if (!hero.down || hero.gone) return;
  hero.down = false;
  hero.revive = 0;
  const p = hero.player;
  p.hp = Math.max(1, hero.stats.maxHp * hpFrac);
  p.iframes = 2;
  spawnBurst(p.x, p.y, COLOR.green, 18, 120);
  addFloatingText(p.x, p.y - 26, 'revived', COLOR.green, 13);
}

export function healPlayer(amount: number, silent?: boolean): void {
  if (amount <= 0 || !run || run.hero.down) return;
  if (run.cls.onHeal) { run.cls.onHeal(amount, silent); return; }
  const p = run.player, before = p.hp;
  p.hp = Math.min(run.stats.maxHp, p.hp + amount);
  if (!silent && p.hp - before >= 1) addFloatingText(p.x, p.y - 26, '+' + Math.round(p.hp - before), COLOR.green, 11);
}
