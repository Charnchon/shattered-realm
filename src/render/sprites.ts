// ============================================================ hero sprites (placeholder art)
// Pixel-art sprites for the player classes, from a free CC0 pack (see assets/sprites/CREDITS.md).
//
// Self-contained on purpose, so it is easy to remove:
//   - switch off: set SPRITES_ENABLED to false (heroes go back to coloured circles)
//   - remove completely: delete this file and assets/sprites/, and the one `drawHeroSprite` call in render/world.ts
// Without a sprite (switched off, image not loaded yet, a class with no row, or headless tests)
// `drawHeroSprite` returns false and the caller draws the old circle.
import type { Player } from '../types';
import { ctx } from '../core/canvas';
import heroSheetUrl from '../../assets/sprites/heroes.png';

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
  loadSheet();
  const info = HERO_ROWS[classId];
  if (!ready || !sheet || !info) return false;
  const dir = facing(p.face);
  const walking = p.dashTime > 0 || Math.abs(p.moveX) + Math.abs(p.moveY) > 0.01;
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
