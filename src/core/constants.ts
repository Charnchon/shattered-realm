// ============================================================ constants
import type { RarityId } from '../types';

/** Logical view size. The canvas is scaled to fit the window, keeping this aspect. */
export const VIEW_W = 960;
export const VIEW_H = 540;

/** Playable arena size in world units. */
export const ARENA_W = 2400;
export const ARENA_H = 1600;

export const TAU = Math.PI * 2;

/** Shared palette. Class- and enemy-specific colours live next to their definitions. */
export const COLOR = {
  bg: '#141019',
  panel: '#251d31',
  panelHover: '#2e2440',
  line: '#3d3150',
  frame: '#6e6284',
  text: '#f2eadb',
  muted: '#bcb1c9',
  dim: '#8a7f9b',
  gold: '#f0b94d',
  teal: '#5fd3c6',
  ember: '#e0623e',
  purple: '#b98cf0',
  red: '#e0623e',
  green: '#7fd06a',
  ink: '#0f0b12',
  barBg: '#2a1f33',
} as const;

export const FONT_PIXEL = '"Pixelify Sans","Courier New",monospace';
export const FONT_BODY = 'Rubik,Arial,sans-serif';

export interface Rarity {
  color: string;
  label: string;
  /** 1-4: drives the gem count and glow strength. */
  tier: number;
}

/** Card rarities, lowest to highest. */
export const RARITY: Record<RarityId, Rarity> = {
  common: { color: '#bcb1c9', label: 'Common', tier: 1 },
  rare: { color: '#5b9cf5', label: 'Rare', tier: 2 },
  epic: { color: COLOR.purple, label: 'Epic', tier: 3 },
  legendary: { color: COLOR.gold, label: 'Legendary', tier: 4 },
};

/** Top-level game screens. */
export const SCENE = {
  MENU: 'menu',
  PLAY: 'play',
  PAUSE: 'pause',
  LEVEL_UP: 'levelup',
  RESULT: 'result',
} as const;

export const FINAL_WAVE = 12;
export const BOSS_COUNT = 4;
