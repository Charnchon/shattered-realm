// ============================================================ maps on screen: hazards, darkness, the badge and map select (M)
// Draw and click handling share the rect functions below.
import type { Rect } from '../types';
import { ctx } from '../core/canvas';
import { COLOR, TAU, VIEW_H, VIEW_W } from '../core/constants';
import { mouseIn } from '../core/input';
import { run } from '../core/state';
import { CLASSES } from '../classes/registry';
import { getProgress, isMapOpen, mapProgress, mapUnlockText, masteryStars, selectedMap } from '../meta/progress';
import { LEVEL_LADDER, MAPS, mapDef, mapRewardMul } from '../world/maps';
import { drawButton, drawPanel, drawPixelText, drawText } from './primitives';

const stars = (n: number, of = 5): string => '★'.repeat(n) + '☆'.repeat(Math.max(0, of - n));

// ------------------------------------------------------------ in the world

/** Lava spots and mushrooms, drawn on the ground (world space). */
export function drawHazards(isOnScreen: (x: number, y: number, pad: number) => boolean): void {
  for (const hz of run.hazards) {
    if (!isOnScreen(hz.x, hz.y, hz.r + 10)) continue;
    if (hz.kind === 'lava') {
      ctx.fillStyle = 'rgba(255,90,40,0.25)';
      ctx.beginPath(); ctx.ellipse(hz.x, hz.y, hz.r * 1.2, hz.r * 0.8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = Math.sin(run.time * 4 + hz.x) > 0 ? '#ff7a2a' : '#e8501e';
      ctx.beginPath(); ctx.ellipse(hz.x, hz.y, hz.r * 0.7, hz.r * 0.35, 0.4, 0, TAU); ctx.fill();
      continue;
    }
    // mushroom: stem and cap; it blinks while its fuse burns and is a stump while it regrows
    const spent = hz.state === 'spent', fuse = hz.state === 'fuse';
    ctx.fillStyle = '#d8ccb0';
    ctx.fillRect(hz.x - 3, hz.y - (spent ? 3 : 8), 6, spent ? 6 : 12);
    if (spent) continue;
    ctx.fillStyle = fuse && Math.floor(run.time * 10) % 2 ? '#e8ff8a' : '#7ad06a';
    ctx.beginPath(); ctx.arc(hz.x, hz.y - 8, 11, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#2c5a24';
    ctx.fillRect(hz.x - 5, hz.y - 14, 3, 3); ctx.fillRect(hz.x + 3, hz.y - 12, 3, 3);
  }
}

/** Sunken Crypt: dark except around your hero (world space). Call before drawing what must stay visible. */
export function drawDarkness(): boolean {
  const vision = mapDef(run.mapId).vision;
  if (!vision) return false;
  const p = run.player, cam = run.camera;
  const g = ctx.createRadialGradient(p.x, p.y, vision * 0.55, p.x, p.y, vision);
  g.addColorStop(0, 'rgba(4,3,8,0)');
  g.addColorStop(1, 'rgba(4,3,8,0.94)');
  ctx.fillStyle = g;
  ctx.fillRect(cam.x - 40, cam.y - 40, VIEW_W + 80, VIEW_H + 80);
  return true;
}

// ------------------------------------------------------------ class select: the badge and the map panel

/** Top left of class select: the map and level for the next run. */
export const mapBadgeRect = (): Rect => ({ x: 16, y: 16, w: 236, h: 56 });

export function drawMapBadge(): void {
  const r = mapBadgeRect(), sel = selectedMap(), def = mapDef(sel.mapId);
  drawPanel(r.x, r.y, r.w, r.h, mouseIn(r) ? COLOR.panelHover : COLOR.panel, COLOR.line, 2, COLOR.teal);
  drawText(def.name + '  ' + stars(def.stars), r.x + 12, r.y + 22, 13, COLOR.text);
  drawText('Level ' + sel.level + ' · rewards ×' + mapRewardMul(sel.mapId, sel.level).toFixed(2) + ' · M to change', r.x + 12, r.y + 42, 11, COLOR.teal);
}

const PANEL = { x: 60, y: 20, w: 840, h: 500 };
const ROW_H = 58;

/** Is the map panel open? (M toggles it.) `mapCursor` is the highlighted row (it may be a locked map). */
export let mapPanelOpen = false;
export let mapCursor = 0;
export const setMapPanelOpen = (open: boolean): void => {
  mapPanelOpen = open;
  if (open) mapCursor = Math.max(0, MAPS.findIndex((m) => m.id === selectedMap().mapId));
};
export const setMapCursor = (i: number): void => { mapCursor = Math.max(0, Math.min(MAPS.length - 1, i)); };

export const mapRowRects = (): Rect[] => MAPS.map((_, i) => ({ x: PANEL.x + 16, y: PANEL.y + 60 + i * ROW_H, w: PANEL.w - 32, h: ROW_H - 6 }));
export const mapBuyRect = (row: Rect): Rect => ({ x: row.x + row.w - 170, y: row.y + 10, w: 160, h: 32 });
export const levelArrowRects = (): { down: Rect; up: Rect } => ({
  down: { x: PANEL.x + 24, y: PANEL.y + 362, w: 40, h: 34 },
  up: { x: PANEL.x + 176, y: PANEL.y + 362, w: 40, h: 34 },
});
export const mapCloseRect = (): Rect => ({ x: PANEL.x + PANEL.w - 140, y: PANEL.y + PANEL.h - 46, w: 124, h: 32 });

/** `classId` is the class highlighted on the menu (its mastery stars are shown). */
export function drawMapPanel(classId: string): void {
  const p = getProgress(), sel = selectedMap();
  ctx.fillStyle = 'rgba(10,7,14,0.88)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawPanel(PANEL.x, PANEL.y, PANEL.w, PANEL.h, COLOR.panel, COLOR.teal, 2);
  drawPixelText('Maps', PANEL.x + 24, PANEL.y + 36, 24, COLOR.teal);
  drawText('Gold ' + p.gold + '  ·  mastery shown for ' + (CLASSES[classId]?.name ?? classId), PANEL.x + PANEL.w - 24, PANEL.y + 32, 12, COLOR.muted, 'right');

  mapRowRects().forEach((row, i) => drawMapRow(i, row, classId, sel.mapId));

  // the level picker and what the chosen level adds
  const def = mapDef(sel.mapId), mp = mapProgress(sel.mapId), arrows = levelArrowRects();
  drawButton(arrows.down, '◀', sel.level > 1 ? COLOR.teal : COLOR.frame);
  drawPixelText('Level ' + sel.level, PANEL.x + 120, PANEL.y + 386, 20, COLOR.text, 'center');
  drawButton(arrows.up, '▶', sel.level < mp.level ? COLOR.teal : COLOR.frame);
  drawText(def.name + ': levels 1–' + mp.level + ' unlocked (win a level to open the next) · rewards ×' + mapRewardMul(sel.mapId, sel.level).toFixed(2),
    PANEL.x + 232, PANEL.y + 377, 12, COLOR.muted);
  const adds = LEVEL_LADDER.slice(1, sel.level).map((s) => s.text);
  drawText(adds.length ? 'This level adds: ' + adds.join(' · ') : 'Level 1: the normal map', PANEL.x + 232, PANEL.y + 395, 11, adds.length ? COLOR.ember : COLOR.dim);
  drawText('Click a map or press 1–' + MAPS.length + ' · ◀ ▶ (or ← →) change the level · U unlocks the highlighted map with gold',
    PANEL.x + 24, PANEL.y + PANEL.h - 24, 12, COLOR.dim);
  drawButton(mapCloseRect(), 'Done · M', COLOR.teal, COLOR.teal);
}

function drawMapRow(i: number, row: Rect, classId: string, selectedId: string): void {
  const def = MAPS[i], open = isMapOpen(def.id), mp = mapProgress(def.id), picked = def.id === selectedId;
  const border = picked ? COLOR.teal : i === mapCursor ? COLOR.gold : COLOR.line;
  drawPanel(row.x, row.y, row.w, row.h, picked ? 'rgba(90,200,190,0.08)' : 'rgba(20,16,25,0.7)', border, picked ? 2 : 1);
  drawPixelText(String(i + 1), row.x + 14, row.y + 30, 12, COLOR.dim, 'center');
  drawText(def.name, row.x + 34, row.y + 21, 15, open ? COLOR.text : COLOR.dim);
  drawText(stars(def.stars) + '  ×' + def.rewardMul.toFixed(2), row.x + 230, row.y + 21, 12, COLOR.gold);
  drawText(def.modifier, row.x + 34, row.y + 41, 11, open ? COLOR.muted : COLOR.dim);
  if (!open) {
    const price = def.price, afford = getProgress().gold >= price;
    drawText(mapUnlockText(def.id), row.x + 380, row.y + 21, 11, COLOR.gold);
    drawButton(mapBuyRect(row), 'Unlock · ' + price + 'g · U', afford ? COLOR.gold : COLOR.frame);
    return;
  }
  const best = mp.won ? 'Won up to level ' + mp.won : mp.bestWave ? 'Best wave ' + mp.bestWave : 'Not played yet';
  drawText(best + '  ·  levels 1–' + mp.level, row.x + 380, row.y + 21, 12, COLOR.text);
  const m = masteryStars(def.id, classId);
  drawText('Mastery ' + '★'.repeat(m) + '☆'.repeat(3 - m) + '  (win · nobody downed · level 5)', row.x + 380, row.y + 41, 11, m ? COLOR.gold : COLOR.dim);
}
