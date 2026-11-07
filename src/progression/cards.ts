// ============================================================ cards, relics and level-up offers
import type {
  CardDef, CardPart, CardState, OfferItem, RarityId, RelicDef, RelicId, StatCardDef, Upgrade, UpgradeType,
} from '../types';
import { SCENE } from '../core/constants';
import { randPick, shuffle, weightedPick } from '../core/math';
import { hasCard, isEvolved, recalcStats, relicLevel, run, setScene, showBanner } from '../core/state';

export const OFFER_SIZE = 3;
export const CARD_MAX_LEVEL = 5;
const EVOLVED_MAX_LEVEL = 10;
export const MAX_RELICS = 4;
const RELIC_MAX_LEVEL = 5;

/** Relics are shared by every class. Their effects are applied in `recalcStats`. */
export const RELICS: RelicDef[] = [
  { id: 'heart', name: 'Heart Gem', desc: '+8% max HP' },
  { id: 'feather', name: 'Swift Feather', desc: '+6% move speed' },
  { id: 'whet', name: 'Whetstone', desc: '+10% crit damage' },
  { id: 'magnet', name: 'Magnet Stone', desc: '+20% pickup radius' },
  { id: 'echo', name: 'Echo Stone', desc: '+5% area; +1 projectile at Lv3 and Lv5' },
  { id: 'ink', name: 'Arcane Ink', desc: '−5% Heavy Strike cooldown' },
  { id: 'clover', name: 'Four-Leaf', desc: '+5 Luck: better card rarity' },
  { id: 'buckle', name: 'Iron Buckle', desc: '+2 armor' },
];
export const relicDef = (id: RelicId): RelicDef => RELICS.find((r) => r.id === id) as RelicDef;

/** Small fallback boosts offered when there aren't enough cards and relics. */
const STAT_CARDS: StatCardDef[] = [
  { id: 'dmg', name: 'Sharpen', desc: '+5% damage' },
  { id: 'hp', name: 'Toughen', desc: '+8% max HP' },
  { id: 'move', name: 'Quick Feet', desc: '+5% move speed' },
  { id: 'atk', name: 'Fast Hands', desc: '+5% attack speed' },
  { id: 'crit', name: 'Keen Eye', desc: '+3% crit chance' },
];

/** The ability slot a card belongs to. */
const CARD_PARTS: CardPart[] = ['strike', 'heavy', 'dash', 'ultimate', 'wild', 'passive'];
export const PART_LABEL: Record<CardPart, string> = { passive: 'Passive', strike: 'Strike', heavy: 'Heavy Strike', dash: 'Dash', ultimate: 'Ultimate', wild: 'Wild' };
export const PART_SHORT: Record<CardPart, string> = { passive: 'PAS', strike: 'STR', heavy: 'HVY', dash: 'DSH', ultimate: 'ULT', wild: 'WLD' };

/** Per-level card upgrades: each multiplies its stat by (1 + percent/100 * strength). */
const UPGRADES: Record<UpgradeType, { label: string; percent: number }> = {
  damage: { label: 'damage', percent: 20 },
  heal: { label: 'healing', percent: 25 },
  range: { label: 'range', percent: 15 },
  speed: { label: 'speed', percent: 15 },
  duration: { label: 'duration', percent: 25 },
  effect: { label: 'effect', percent: 25 },
};

/** "+30% damage", "+1 projectile". */
export function upgradeLabel(up: Upgrade): string {
  if (up.type === 'projectiles') return '+1 projectile';
  const u = UPGRADES[up.type];
  return '+' + Math.round(u.percent * up.strength) + '% ' + u.label;
}

export const cardDef = (id: string): CardDef => run.cls.cards.find((c) => c.id === id) as CardDef;
const cardMaxLevel = (id: string): number => (isEvolved(id) ? EVOLVED_MAX_LEVEL : CARD_MAX_LEVEL);

/** A max-level card whose evolution requirement (card, part or relic) is met. */
function isEvolutionReady(def: CardDef): boolean {
  if (!def.evo) return false;
  const card = run.cards[def.id];
  if (!card || card.evolved || card.level < CARD_MAX_LEVEL) return false;
  const need = def.evo.need;
  if (need.card) return hasCard(need.card);
  if (need.part) return Object.keys(run.cards).some((id) => id !== def.id && cardDef(id).part === need.part);
  if (need.relic) return relicLevel(need.relic) > 0;
  return false;
}

function newCardState(): CardState {
  return {
    level: 1,
    upgrades: { damage: 1, range: 1, speed: 1, duration: 1, heal: 1, effect: 1, projectiles: 0 },
    evolved: false,
  };
}

function applyUpgrade(card: CardState, up: Upgrade): void {
  if (up.type === 'projectiles') { card.upgrades.projectiles += 1; return; }
  card.upgrades[up.type] *= 1 + (UPGRADES[up.type].percent / 100) * up.strength;
}

// ------------------------------------------------------------ rolling an offer

/** An offer item before rarity, levels and upgrades are rolled. */
type OfferDraft =
  | { kind: 'card'; def: CardDef }
  | { kind: 'evo'; def: CardDef }
  | { kind: 'relic'; def: RelicDef }
  | { kind: 'stat'; def: StatCardDef };

interface PoolEntry {
  draft: OfferDraft;
  weight: number;
}

/** Luck shifts weight from common towards rare and epic. */
function rollRarity(): RarityId {
  const luck = run.stats.luck;
  const wCommon = Math.max(20, 60 - luck * 0.8), wRare = 28 + luck * 0.5, wEpic = 10 + luck * 0.3;
  const r = Math.random() * (wCommon + wRare + wEpic);
  return r < wCommon ? 'common' : r < wCommon + wRare ? 'rare' : 'epic';
}

/** Upgrades for levelling an owned card: epic = two different, rare = one at 1.5x, common = one. */
function rollUpgrades(def: CardDef, rarity: RarityId): Upgrade[] {
  if (rarity === 'epic' && def.ups.length > 1) {
    return shuffle(def.ups.slice()).slice(0, 2).map((type) => ({ type, strength: 1 }));
  }
  return [{ type: randPick(def.ups), strength: rarity === 'rare' ? 1.5 : 1 }];
}

/** Bonus upgrades a brand-new card comes with, by rarity. */
function rollNewCardUpgrades(def: CardDef, rarity: RarityId): Upgrade[] {
  if (rarity === 'common') return [];
  if (rarity === 'rare') return [{ type: randPick(def.ups), strength: 1 }];
  return rollUpgrades(def, 'epic');
}

/** The very first offer gives one new card from three different parts. */
function firstOfferDrafts(): OfferDraft[] {
  const drafts: OfferDraft[] = [];
  for (const part of shuffle(CARD_PARTS.slice())) {
    const candidates = run.cls.cards.filter((d) => d.part === part && !run.cards[d.id]);
    if (candidates.length) drafts.push({ kind: 'card', def: randPick(candidates) });
    if (drafts.length === OFFER_SIZE) break;
  }
  return drafts;
}

/** Everything that could be offered, with weights. */
function offerPool(exclude: OfferDraft[]): PoolEntry[] {
  const owned = Object.keys(run.cards), slotsFull = owned.length >= run.cardSlots;
  const pool: PoolEntry[] = [];
  for (const def of run.cls.cards) {
    if (exclude.some((d) => d.def === def)) continue;
    const card = run.cards[def.id];
    if (card) {
      if (card.level < cardMaxLevel(def.id)) pool.push({ draft: { kind: 'card', def }, weight: owned.length >= 3 ? 2.2 : 1.2 });
    } else if (!slotsFull) {
      pool.push({ draft: { kind: 'card', def }, weight: run.cls.favoredParts.includes(def.part) ? 1.4 : 1 });
    }
  }
  const relicCount = Object.keys(run.relics).length;
  for (const def of RELICS) {
    const level = relicLevel(def.id);
    if (level > 0 && level < RELIC_MAX_LEVEL) pool.push({ draft: { kind: 'relic', def }, weight: 0.5 });
    else if (level === 0 && relicCount < MAX_RELICS) pool.push({ draft: { kind: 'relic', def }, weight: 0.3 });
  }
  return pool;
}

/** Roll rarity, levels and upgrades for a draft. */
function finalizeOfferItem(draft: OfferDraft): OfferItem {
  switch (draft.kind) {
    case 'card': {
      const rarity = rollRarity();
      const card = run.cards[draft.def.id];
      return {
        kind: 'card', def: draft.def, rarity,
        isNew: !card,
        from: card ? card.level : 0,
        to: card ? card.level + 1 : 1,
        ups: card ? rollUpgrades(draft.def, rarity) : rollNewCardUpgrades(draft.def, rarity),
      };
    }
    case 'evo':
      return { kind: 'evo', def: draft.def, rarity: 'legendary' };
    case 'relic': {
      const from = relicLevel(draft.def.id);
      return { kind: 'relic', def: draft.def, rarity: 'common', from, to: from + 1 };
    }
    case 'stat':
      return { kind: 'stat', def: draft.def, rarity: 'common' };
  }
}

/**
 * Build the level-up offer: ready evolutions first (legendary), then the
 * first-offer starter picks, then weighted cards/relics, then stat cards.
 */
export function makeOffer(): void {
  const drafts: OfferDraft[] = [];
  for (const def of run.cls.cards) if (isEvolutionReady(def)) drafts.push({ kind: 'evo', def });
  if (run.firstOffer && !drafts.length) {
    run.firstOffer = false;
    drafts.push(...firstOfferDrafts());
  }
  let pool = offerPool(drafts);
  while (drafts.length < OFFER_SIZE && pool.length) {
    const pick = weightedPick(pool, (entry) => entry.weight);
    pool = pool.filter((entry) => entry !== pick);
    drafts.push(pick.draft);
  }
  const stats = shuffle(STAT_CARDS.slice());
  while (drafts.length < OFFER_SIZE) drafts.push({ kind: 'stat', def: stats.pop() as StatCardDef });

  run.offer = { items: drafts.slice(0, OFFER_SIZE).map(finalizeOfferItem), hover: -1 };
}

// ------------------------------------------------------------ choosing

export function applyPick(item: OfferItem): void {
  switch (item.kind) {
    case 'card': {
      let card = run.cards[item.def.id];
      if (!card) card = run.cards[item.def.id] = newCardState();
      else card.level++;
      for (const up of item.ups) applyUpgrade(card, up);
      break;
    }
    case 'evo':
      run.cards[item.def.id].evolved = true;
      showBanner((item.def.evo?.name ?? item.def.name) + ' evolved!', 2);
      break;
    case 'relic':
      run.relics[item.def.id] = (run.relics[item.def.id] || 0) + 1;
      break;
    case 'stat':
      run.statCards[item.def.id]++;
      break;
  }
  recalcStats();
  run.pendingLevelUps--;
  run.offer = null;
  if (run.pendingLevelUps > 0) makeOffer();
  else setScene(SCENE.PLAY);
}

/** Free rerolls first; some classes can then pay coins (`rerollCost` hook). */
export function tryReroll(): void {
  if (run.rerolls > 0) { run.rerolls--; makeOffer(); return; }
  const cost = run.cls.rerollCost ? run.cls.rerollCost() : null;
  if (cost != null && run.coinsHeld >= cost) {
    run.coinsHeld -= cost;
    recalcStats();
    makeOffer();
  }
}

export function canReroll(): boolean {
  return run.rerolls > 0 || (!!run.cls.rerollCost && run.coinsHeld >= run.cls.rerollCost());
}

export function rerollLabel(): string {
  if (run.rerolls > 0) return 'Reroll (' + run.rerolls + ') · R';
  if (run.cls.rerollCost) return 'Reroll (' + run.cls.rerollCost() + ' coins) · R';
  return 'No rerolls left';
}
