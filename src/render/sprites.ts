// ============================================================ hero sprites
// Pixel-art sprites for the player classes (see assets/sprites/CREDITS.md). Two kinds:
//   - 8-direction sets (one image per facing, e.g. assets/sprites/traveler/), tried first
//   - the placeholder sheet heroes.png (a free CC0 pack: down / up / side, with walk frames)
//
// Self-contained on purpose, so it is easy to remove:
//   - switch off: set SPRITES_ENABLED to false (heroes go back to coloured circles)
//   - remove completely: delete this file and assets/sprites/, and the one `drawHeroSprite` call in render/world.ts
// Without a sprite (switched off, image not loaded yet, a class with no row, or headless tests)
// `drawHeroSprite` returns false and the caller draws the old circle.
import type { Player } from '../types';
import { ctx } from '../core/canvas';
import heroSheetUrl from '../../assets/sprites/heroes.png';
import travelerE from '../../assets/sprites/traveler/east.png';
import travelerSE from '../../assets/sprites/traveler/south-east.png';
import travelerS from '../../assets/sprites/traveler/south.png';
import travelerSW from '../../assets/sprites/traveler/south-west.png';
import travelerW from '../../assets/sprites/traveler/west.png';
import travelerNW from '../../assets/sprites/traveler/north-west.png';
import travelerN from '../../assets/sprites/traveler/north.png';
import travelerNE from '../../assets/sprites/traveler/north-east.png';
import vampireE from '../../assets/sprites/vampire/east.png';
import vampireSE from '../../assets/sprites/vampire/south-east.png';
import vampireS from '../../assets/sprites/vampire/south.png';
import vampireSW from '../../assets/sprites/vampire/south-west.png';
import vampireW from '../../assets/sprites/vampire/west.png';
import vampireNW from '../../assets/sprites/vampire/north-west.png';
import vampireN from '../../assets/sprites/vampire/north.png';
import vampireNE from '../../assets/sprites/vampire/north-east.png';
import bountyE from '../../assets/sprites/bounty_hunter/east.png';
import bountySE from '../../assets/sprites/bounty_hunter/south-east.png';
import bountyS from '../../assets/sprites/bounty_hunter/south.png';
import bountySW from '../../assets/sprites/bounty_hunter/south-west.png';
import bountyW from '../../assets/sprites/bounty_hunter/west.png';
import bountyNW from '../../assets/sprites/bounty_hunter/north-west.png';
import bountyN from '../../assets/sprites/bounty_hunter/north.png';
import bountyNE from '../../assets/sprites/bounty_hunter/north-east.png';

export const SPRITES_ENABLED = true;

/** Size of one frame in the sheet, and how big it is drawn in the world. */
const FRAME = 32;
const DRAW_SCALE = 1.4;
/** Walking animation speed (frames per second). */
const WALK_FPS = 8;

interface SheetRow {
  row: number;
  /** Side-view columns that exist for this character (some are missing walking frames). */
  side: number[];
}

/**
 * Class id → row in assets/sprites/heroes.png. Columns in each row:
 * 0-3 facing down (walk, stand, walk, charge), 4-7 facing up (same), 8-10 facing right (walk, stand, walk).
 */
const HERO_ROWS: Record<string, SheetRow> = {
  traveler: { row: 0, side: [8, 9, 10] },
  oathknight: { row: 1, side: [8, 9, 10] },
  bounty_hunter: { row: 2, side: [8, 9, 10] },
  cleric: { row: 3, side: [8, 9, 10] },
  vampire: { row: 4, side: [9, 10] },
  necro: { row: 5, side: [8, 9, 10] },
};

// ------------------------------------------------------------ 8-direction sets

interface DirectionalSet {
  /** One image per facing, clockwise from east: E, SE, S, SW, W, NW, N, NE (canvas y points down). */
  urls: string[];
  /** Pixel size of each (square) image; drawn 1:1 with its bottom edge at the hero's feet. */
  size: number;
}

/**
 * Classes with their own 8-direction art (exported from PixelLab: `<name>/rotations/<dir>.png`).
 * A standing pose only for now, so walking adds a small step bob. Add a class here to use its set.
 */
const DIRECTIONAL: Record<string, DirectionalSet> = {
  traveler: { urls: [travelerE, travelerSE, travelerS, travelerSW, travelerW, travelerNW, travelerN, travelerNE], size: 48 },
  vampire: { urls: [vampireE, vampireSE, vampireS, vampireSW, vampireW, vampireNW, vampireN, vampireNE], size: 48 },
  bounty_hunter: { urls: [bountyE, bountySE, bountyS, bountySW, bountyW, bountyNW, bountyN, bountyNE], size: 48 },
};

/** Loaded images per class (all 8 must load before the set is used). */
const directionalImages: Record<string, { imgs: HTMLImageElement[]; loaded: number }> = {};

function directionalFor(classId: string): HTMLImageElement[] | null {
  const set = DIRECTIONAL[classId];
  if (!set || typeof Image === 'undefined') return null; // headless tests have no Image
  let entry = directionalImages[classId];
  if (!entry) {
    entry = directionalImages[classId] = { imgs: [], loaded: 0 };
    for (const url of set.urls) {
      const img = new Image();
      img.onload = () => { entry.loaded++; };
      img.src = url;
      entry.imgs.push(img);
    }
  }
  return entry.loaded === set.urls.length ? entry.imgs : null;
}

/** Facing index 0-7 (E, SE, S, ... NE) nearest to the aim angle. */
const facing8 = (face: number): number => ((Math.round(face / (Math.PI / 4)) % 8) + 8) % 8;

/** Draw from an 8-direction set. Returns false if the class has none (or it hasn't loaded yet). */
function drawDirectional(p: Player, classId: string, walking: boolean, time: number): boolean {
  const imgs = directionalFor(classId);
  if (!imgs) return false;
  const size = DIRECTIONAL[classId].size;
  const bob = walking && Math.floor(time * WALK_FPS) % 2 ? 1 : 0; // no walk frames yet: step up and down
  ctx.save();
  ctx.imageSmoothingEnabled = false; // keep pixels crisp
  ctx.drawImage(imgs[facing8(p.face)], Math.round(p.x - size / 2), Math.round(p.y + p.r + 4 - size - bob), size, size);
  ctx.restore();
  return true;
}

// ------------------------------------------------------------ placeholder sheet

let sheet: HTMLImageElement | null = null;
let ready = false;

function loadSheet(): void {
  if (sheet || typeof Image === 'undefined') return; // headless tests have no Image
  sheet = new Image();
  sheet.onload = () => { ready = true; };
  sheet.src = heroSheetUrl;
}

/** Which way the sprite faces, from the aim angle. */
function facing(face: number): 'down' | 'up' | 'side' {
  const s = Math.sin(face), c = Math.cos(face);
  if (Math.abs(c) > Math.abs(s)) return 'side';
  return s > 0 ? 'down' : 'up';
}

/** The column to draw for this direction and moment. Walking cycles walk-stand-walk-stand. */
function frameColumn(dir: 'down' | 'up' | 'side', walking: boolean, time: number, side: number[]): number {
  const step = Math.floor(time * WALK_FPS) % 4;
  if (dir === 'side') {
    const stand = side.includes(9) ? 9 : side[0];
    if (!walking) return stand;
    const cycle = [8, 9, 10, 9].filter((c) => side.includes(c));
    return cycle[step % cycle.length] ?? stand;
  }
  const base = dir === 'down' ? 0 : 4;
  return base + (walking ? [0, 1, 2, 1][step] : 1);
}

/**
 * Draw a hero's sprite at their position (world space). Returns false when no sprite can be drawn,
 * so the caller can fall back to the plain circle.
 */
export function drawHeroSprite(p: Player, classId: string, time: number): boolean {
  if (!SPRITES_ENABLED) return false;
  const walking = p.dashTime > 0 || Math.abs(p.moveX) + Math.abs(p.moveY) > 0.01;
  if (drawDirectional(p, classId, walking, time)) return true;
  loadSheet();
  const info = HERO_ROWS[classId];
  if (!ready || !sheet || !info) return false;
  const dir = facing(p.face);
  const col = frameColumn(dir, walking, time, info.side);
  const size = FRAME * DRAW_SCALE;
  ctx.save();
  ctx.imageSmoothingEnabled = false; // keep pixels crisp
  // origin at the hero's feet (a little below their centre, where the shadow is)
  ctx.translate(p.x, p.y + p.r + 4);
  if (dir === 'side' && Math.cos(p.face) < 0) ctx.scale(-1, 1); // the sheet faces right: mirror to face left
  ctx.drawImage(sheet, col * FRAME, info.row * FRAME, FRAME, FRAME, -size / 2, -size, size, size);
  ctx.restore();
  return true;
}
