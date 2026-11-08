// ============================================================ shared types: the game's data model
import type { EquippedAccessory } from './meta/accessories';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SceneId = 'menu' | 'play' | 'pause' | 'levelup' | 'result' | 'lobby' | 'join';
export type RarityId = 'common' | 'rare' | 'epic' | 'legendary';

// ------------------------------------------------------------ player and stats

export interface Player extends Point {
  r: number;
  hp: number;
  /** Aim angle (radians). */
  face: number;
  level: number;
  xp: number;
  /** Ultimate charge, 0-100. */
  ult: number;
  iframes: number;
  hitFlash: number;
  moveX: number;
  moveY: number;
  dashCooldown: number;
  dashCharges: number;
  dashTime: number;
  dashVx: number;
  dashVy: number;
  heavyCooldown: number;
  boneShield: number;
  boneShieldTime: number;
  regenBuff: number;
  regenBuffTime: number;
}

/** Derived stats, rebuilt by `recalcStats`. */
export interface Stats {
  maxHp: number;
  armor: number;
  regen: number;
  damage: number;
  attackSpeed: number;
  critChance: number;
  critDamage: number;
  moveSpeed: number;
  area: number;
  extraProjectiles: number;
  pickupRadius: number;
  luck: number;
  /** XP multiplier (1 = normal). */
  xpGain: number;
  cooldownMul: number;
  lifesteal: number;
  ultRate: number;
  dashCharges: number;
  dashCooldown: number;
  heavyCooldown: number;
}

// ------------------------------------------------------------ enemies

export type EnemyTypeId = 'slime' | 'mini' | 'goblin' | 'bat' | 'archer' | 'cultist' | 'orc' | 'imp' | 'boar' | 'toad' | 'wraith' | 'caller';
export type BossKind = 'troll' | 'colossus' | 'wyvern' | 'king';

export interface StatusTimers {
  slowTime: number;
  rootTime: number;
  charmTime: number;
  fearTime: number;
  confuseTime: number;
  bleedDps: number;
  bleedTime: number;
}

interface EnemyBase extends Point, StatusTimers {
  /** Unique per run; lets online clients match enemies between snapshots. */
  id: number;
  /** Hero whose bleed is ticking on this enemy (gets the credit). */
  bleedOwner?: number;
  r: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  xp: number;
  color: string;
  elite: boolean;
  undead: boolean;
  dead: boolean;
  flash: number;
  contactCooldown: number;
  face: number;
  knockX: number;
  knockY: number;
  attackTimer: number;
  /** Per-source hit cooldowns set by orbiting class abilities (game time). */
  batCooldownUntil?: number;
  wraithCooldownUntil?: number;
  orbCooldownUntil?: number;
}

/** A regular enemy. */
export interface Mob extends EnemyBase {
  boss: false;
  type: EnemyTypeId;
  hasShield: boolean;
  shieldBroken: boolean;
  /** Random phase for wobbly movement and confusion. */
  wobble: number;
  /**
   * Seconds left of a telegraphed action (an archer drawing its bow, a healer channelling, an imp's
   * fuse). Unset or 0 = none. The warning itself is `windTelegraph`, which online clients see.
   */
  windup?: number;
  /** Direction locked in when an archer starts aiming: the shot flies exactly along its warning line. */
  windAngle?: number;
  /** HP when a healer started channelling: any damage after that interrupts it. */
  windHp?: number;
  /** Index of the hero who hit it last (credit for interrupts). */
  lastHitBy?: number;
  windTelegraph?: Telegraph;
  /** Boar: seconds left of a charge in progress, then seconds it stays dazed (and takes extra damage). */
  chargeTime?: number;
  dazedTime?: number;
  /** Wraith: ethereal (can't be hurt, can't hurt) while true; `phaseTimer` counts down to the next switch. */
  phased?: boolean;
  phaseTimer?: number;
}

export type BossState = 'chase' | 'aim' | 'charge' | 'recover' | 'slam' | 'breath' | 'dive' | 'land' | 'slash';

export interface Boss extends EnemyBase {
  boss: true;
  type: 'boss';
  kind: BossKind;
  name: string;
  unlocksCardSlot: boolean;
  stagger: number;
  stunTime: number;
  phase: number;
  state: BossState;
  stateTime: number;
  specialTimer: number;
  orbitAngle: number;
  lockedAngle: number;
  target: Point | null;
}

export type Enemy = Mob | Boss;

/** Options for `hitEnemy`. */
export interface HitOptions {
  /** Damage over time: never crits. */
  dot?: boolean;
  /** No damage number. */
  silent?: boolean;
  noCrit?: boolean;
  /** Doesn't trigger lifesteal. */
  noSteal?: boolean;
  /** Came from a projectile (shield orcs can block it from the front). */
  projectile?: boolean;
  from?: Point;
  /** Heavy hit: breaks shields, staggers bosses. */
  heavy?: boolean;
  knock?: number;
  /** Knockback direction (default: away from the player). */
  knockAngle?: number;
  /** Source label class hooks can react to ('claw', 'pillar', 'corpse', ...). */
  tag?: string;
  /** Damage number colour. */
  color?: string;
}

// ------------------------------------------------------------ world entities

interface ShotBase extends Point {
  vx: number;
  vy: number;
  r: number;
  dmg: number;
  life: number;
  color?: string;
  /** Drawing style ('bolt', 'heavybolt', 'shard', ...). */
  kind?: string;
  dead?: boolean;
}

export interface EnemyShot extends ShotBase {
  owner: 'enemy';
}

export interface PlayerShot extends ShotBase {
  owner: 'player';
  /** Index of the hero who fired it (set by `fireShot`). */
  hero: number;
  /** Enemies already hit (each is hit at most once). */
  hitSet: Set<Enemy>;
  /** Extra enemies it passes through. */
  pierce: number;
  /** Homing turn rate (radians / s). */
  home?: number;
  knock?: number;
  heavy?: boolean;
  tag?: string;
  textColor?: string;
  chained?: boolean;
  onHit?: ((shot: PlayerShot, enemy: Enemy) => void) | null;
  onEnd?: (shot: PlayerShot) => void;
}

export type Shot = PlayerShot | EnemyShot;

/** What callers pass to `fireShot`; the rest is filled in. */
export type PlayerShotSpec = Omit<PlayerShot, 'owner' | 'hero' | 'hitSet' | 'pierce' | 'life'> & { pierce?: number; life?: number };

interface ZoneBase extends Point {
  r: number;
  life: number;
  owner?: 'player' | 'enemy';
  color?: string;
  /** Entity the zone sticks to. */
  follow?: Point;
  /** Seconds between area ticks (default 0.25). */
  tick?: number;
}

/** Ticking area: damage / slow / confuse / root enemies inside (or burn the player if enemy-owned). */
export interface AreaZone extends ZoneBase {
  kind: 'pool' | 'net' | 'smoke' | 'spikes' | 'fire' | 'light' | 'holyfire';
  dps?: number;
  slow?: boolean;
  confuse?: boolean;
  root?: number;
  rooted?: boolean;
  noSteal?: boolean;
  onTick?: (enemy: Enemy) => void;
}

/** Enemy shockwave growing from startR to endR over `dur`; hits the player once. */
export interface RingZone extends ZoneBase {
  kind: 'ring';
  dmg: number;
  dur: number;
  startR: number;
  endR: number;
  currentR: number;
  /** Heroes already hit by this ring. */
  hitHeroes?: number[];
}

/** Roots and damages the first enemy that steps on it. */
export interface TrapZone extends ZoneBase {
  kind: 'trap';
  dmg: number;
  root: number;
}

/** Explodes after `delay`. */
export interface MineZone extends ZoneBase {
  kind: 'mine';
  dmg: number;
  delay: number;
}

export type ZoneSpec = AreaZone | RingZone | TrapZone | MineZone;

/** Fields `addZone` fills in. */
export interface ZoneRuntime {
  owner: 'player' | 'enemy';
  /** Hero who placed a player zone. */
  hero: number;
  tick: number;
  /** Age in seconds. */
  t: number;
  tickTimer: number;
  /** Starting life, for fading. */
  max: number;
}

export type Zone = ZoneSpec & ZoneRuntime;

interface FxBase extends Point {
  life: number;
  max: number;
  color: string;
}
export interface Particle extends FxBase {
  kind?: undefined;
  vx: number;
  vy: number;
  size: number;
  /** Fading afterimage instead of a square particle. */
  ghost?: boolean;
}
export interface SlashFx extends FxBase { kind: 'slash'; face: number; r: number; arc: number; w: number }
export interface RingFx extends FxBase { kind: 'ring'; r: number }
export interface LineFx extends FxBase { kind: 'line'; x2: number; y2: number; w: number }
export interface PillarFx extends FxBase { kind: 'pillar'; r: number }

/** Visual effect. */
export type Fx = Particle | SlashFx | RingFx | LineFx | PillarFx;

export interface FloatingText extends Point {
  text: string;
  color: string;
  size: number;
  life: number;
}

interface TelegraphBase extends Point {
  dur: number;
  color: string;
  /** Player telegraphs survive a boss's death. */
  friendly?: boolean;
}
/** Warning shape: circle, line (from x,y at angle a), cone, or aim (a thin sight line for a single shot). */
export type TelegraphSpec =
  | (TelegraphBase & { kind: 'circle'; r: number })
  | (TelegraphBase & { kind: 'line'; a: number; len: number; w: number })
  | (TelegraphBase & { kind: 'aim'; a: number; len: number })
  | (TelegraphBase & { kind: 'cone'; a: number; r: number; arc: number });
/** A live telegraph; `t` is its elapsed time. */
export type Telegraph = TelegraphSpec & { t: number };

export interface Timer {
  t: number;
  fn: () => void;
  /** Hero whose context the callback runs in. */
  hero: number;
  done?: boolean;
}

export interface Gem extends Point {
  value: number;
  big: boolean;
  magnetized: boolean;
  /** Hero the gem is flying to, once magnetized. */
  to?: number;
  dead?: boolean;
}

export interface Coin extends Point {
  value: number;
  kind: 'coin' | 'heal';
  magnetized?: boolean;
  to?: number;
  dead?: boolean;
}

/** Something besides the player that pulls pickups in. */
export interface PickupHelper extends Point {
  pickupRadius: number;
}

export interface Thrall extends Point {
  kind: 'thrall';
  life: number;
  attackTimer: number;
  damage: number;
  dead?: boolean;
}
export type Ally = Thrall;

export interface SafeZone extends Point {
  r: number;
  min: number;
}

// ------------------------------------------------------------ cards and progression

export type CardPart = 'passive' | 'strike' | 'heavy' | 'dash' | 'ultimate' | 'wild';
export type UpgradeType = 'damage' | 'heal' | 'range' | 'speed' | 'duration' | 'effect';
export type CardUpgradeType = UpgradeType | 'projectiles';
export type StatCardId = 'dmg' | 'hp' | 'move' | 'atk' | 'crit';
export type RelicId = 'heart' | 'feather' | 'whet' | 'magnet' | 'echo' | 'ink' | 'clover' | 'buckle';

export interface CardDef {
  id: string;
  name: string;
  part: CardPart;
  desc: string;
  /** Upgrade types this card can roll. */
  ups: CardUpgradeType[];
  evo?: {
    name: string;
    desc: string;
    needText: string;
    need: { card?: string; part?: CardPart; relic?: RelicId };
  };
}

export interface CardState {
  level: number;
  upgrades: Record<UpgradeType, number> & { projectiles: number };
  evolved: boolean;
}

export interface Upgrade {
  type: CardUpgradeType;
  strength: number;
}

export interface RelicDef {
  id: RelicId;
  name: string;
  desc: string;
}

export interface StatCardDef {
  id: StatCardId;
  name: string;
  desc: string;
}

/** A level-up choice. Rarity, levels and upgrades are filled in when the offer is finalised. */
export type OfferItem =
  | { kind: 'card'; def: CardDef; rarity: RarityId; isNew: boolean; from: number; to: number; ups: Upgrade[] }
  | { kind: 'evo'; def: CardDef; rarity: RarityId }
  | { kind: 'relic'; def: RelicDef; rarity: RarityId; from: number; to: number }
  | { kind: 'stat'; def: StatCardDef; rarity: RarityId };

export interface Offer {
  items: OfferItem[];
  hover: number;
}

// ------------------------------------------------------------ classes

export interface ClassResource {
  label: string;
  value: number;
  frac: number;
  color: string;
}

export interface DashOverride {
  dist?: number;
  dur?: number;
  ang?: number;
}

/**
 * A playable class. Each class lives in its own file and calls `registerClass`.
 * Shared code never checks a class id: classes plug in through these hooks.
 */
export interface ClassDef {
  id: string;
  name: string;
  role: string;
  color: string;
  ultName: string;
  base: { hp: number; moveSpeed: number; armor?: number; luck?: number; regen?: number; lifesteal?: number };
  heavyCooldown: number;
  /** 1-5 bars on the menu. */
  ratings: Record<string, number>;
  /** Menu description lines. */
  kit: string[];
  /** Ability bar labels. */
  keys: { lmb: string; rmb: string; spc: string; q: string };
  /**
   * Full ability names, shown on level-up cards ("Upgrades: Mark Prey · Right click") so players
   * know at a glance which ability a card improves. Wild cards add something new instead.
   */
  abilities: Record<Exclude<CardPart, 'wild'>, string>;
  /** Card parts offered a bit more often. */
  favoredParts: CardPart[];
  cards: CardDef[];

  // required hooks
  /** Set up run.classState. */
  init(): void;
  strike(dt: number, attacking: boolean): void;
  heavy(): void;
  ult(): void;
  update(dt: number): void;
  /** World-space drawing (pets, orbs, ...). */
  draw(): void;
  /** HUD meter. */
  resource(): ClassResource;

  // optional hooks
  dash?(dx: number, dy: number): DashOverride;
  /**
   * Where a dash goes, with no side effects (`dash` may fire shots or drop zones). Online, a joined
   * player's screen uses it to move their hero the instant they dash. Must agree with `dash`.
   */
  dashShape?(dx: number, dy: number): DashOverride;
  onDashMove?(dt: number): void;
  onDashEnd?(): void;
  modifyStats?(stats: Stats): void;
  bonusArmor?(): number;
  damageMod?(enemy: Enemy, opts: HitOptions): number;
  lifestealMul?(): number;
  onHit?(enemy: Enemy, damage: number, opts: HitOptions): void;
  onCrit?(enemy: Enemy, opts: HitOptions): void;
  onKill?(enemy: Enemy, opts: HitOptions): void;
  /** Replaces normal healing. */
  onHeal?(amount: number, silent?: boolean): void;
  /** Shields: return the damage left over. */
  absorb?(damage: number): number;
  /** Return true to survive a killing blow. */
  onLethal?(): boolean;
  onWaveStart?(): void;
  onCoin?(): void;
  pickupHelpers?(): PickupHelper[];
  rerollCost?(): number;
  drawHpOverlay?(x: number, y: number, w: number): void;
  /** Test bot: a point to stay near. */
  botRallyPoint?(): Point | null;
}

// ------------------------------------------------------------ the run

export interface Banner {
  text: string;
  time: number;
}

export interface RunResult {
  win: boolean;
  time: number;
}

/** One frame of a hero's controls, in world space. Filled from the keyboard, the network or the bot. */
export interface HeroInput {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  fire: boolean;
  heavy: boolean;
  /** One-shot presses: latched until the next simulation step uses them. */
  dash: boolean;
  ult: boolean;
}

/**
 * One player in the run: their body, build and class state. Single player has one hero; co-op has 2-4.
 * Gameplay code reads the *current* hero through `run.player`, `run.stats`, `run.cls`, ... (see `withHero`).
 */
export interface Hero {
  /** Position in `run.heroes`; 0 is the host. */
  idx: number;
  name: string;
  classId: string;
  cls: ClassDef;
  player: Player;
  stats: Stats;
  cardSlots: number;
  cards: Record<string, CardState>;
  relics: Partial<Record<RelicId, number>>;
  statCards: Record<StatCardId, number>;
  pendingLevelUps: number;
  offer: Offer | null;
  rerolls: number;
  firstOffer: boolean;
  coinsHeld: number;
  magnetAllTime: number;
  allies: Ally[];
  classState: unknown;
  input: HeroInput;
  /** Played by the test bot. */
  bot: boolean;
  /** Knocked out: a teammate can revive them, or they return at the next wave. */
  down: boolean;
  /** 0-1 while a teammate stands next to a downed hero. */
  revive: number;
  /** Left the game (online). Never comes back this run. */
  gone: boolean;
  /** Online: number of the latest input from this player the host has applied (for prediction). */
  ack?: number;
  /** This player's numbers for the end-of-run scoreboard. */
  score: HeroScore;
  /** Accessories this player brought into the run (applied in `recalcStats`). */
  accessories: EquippedAccessory[];
  /** This player's Slayer tiers (0-5) by monster key: +1% damage per tier against that monster. */
  slayer: Record<string, number>;
  /** Counters for bounties, Slayer and the Codex (sent in snapshots: a joined player saves their own). */
  tally: RunTally;
}

/** A map hazard: a mushroom that bursts into poison, or a burning lava spot. */
export interface Hazard {
  kind: 'mushroom' | 'lava';
  x: number;
  y: number;
  r: number;
  /** Mushrooms: seconds left of the fuse, or until it regrows. */
  timer: number;
  state: 'ready' | 'fuse' | 'spent';
}

/** What one player did in a run, beyond the scoreboard. Monster keys: enemy type, or boss kind. */
export interface RunTally {
  killsByType: Record<string, number>;
  eliteKills: number;
  /** Healer heals and summons stopped by this player's hits. */
  interrupts: number;
  /** Hits landed on dazed boars. */
  dazedHits: number;
  /** Enemies killed by the blast of an imp this player killed. */
  impChainKills: number;
  shieldBreaks: number;
  /** Archer arrows that hurt this player. */
  arrowHits: number;
  /** Times this player was knocked out (map mastery: a clear with nobody downed). */
  downs: number;
}

/** One player's contribution to a run (end-of-run scoreboard). */
export interface HeroScore {
  kills: number;
  /** Damage dealt to enemies (not counting overkill). */
  damage: number;
  /** Damage taken after armor. */
  taken: number;
  /** Teammates this player revived. */
  revives: number;
}

/** Everything about the current run. */
export interface Run {
  /** The map and its level (1-10) for this run (see world/maps.ts). */
  mapId: string;
  mapLevel: number;
  /** The map's hazards: mushrooms and lava (sent in snapshots so joined players see them). */
  hazards: Hazard[];
  /** Every player in the run. */
  heroes: Hero[];
  /** The hero gameplay code is acting for right now (see `withHero`). Otherwise the local player. */
  hero: Hero;
  /** The hero this screen belongs to (camera, HUD, level-up screen). */
  localHero: number;
  /** Next enemy id. */
  nextId: number;
  classId: string;
  cls: ClassDef;
  time: number;
  wave: number;
  waveTime: number;
  waveDuration: number;
  spawnBudget: number;
  boss: Boss | null;
  bossesKilled: number;
  wavesCleared: number;
  camera: Point;
  shake: number;
  banner: Banner | null;
  player: Player;
  cardSlots: number;
  cards: Record<string, CardState>;
  relics: Partial<Record<RelicId, number>>;
  statCards: Record<StatCardId, number>;
  enemies: Enemy[];
  shots: Shot[];
  zones: Zone[];
  gems: Gem[];
  coins: Coin[];
  allies: Ally[];
  fx: Fx[];
  floatingTexts: FloatingText[];
  telegraphs: Telegraph[];
  timers: Timer[];
  pendingLevelUps: number;
  offer: Offer | null;
  rerolls: number;
  firstOffer: boolean;
  kills: number;
  coinsHeld: number;
  safeZone: SafeZone | null;
  magnetAllTime: number;
  /** Class-specific state, owned by the class (see its `init`). */
  classState: unknown;
  result: RunResult | null;
  stats: Stats;
}
