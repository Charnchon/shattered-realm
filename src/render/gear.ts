// ============================================================ accessories panel (class select, E): loadout and upgrades
// Draw and click handling share the rect functions below, so what you see is what you click.
import type { Rect } from '../types';
import { ctx } from '../core/canvas';
import { COLOR, VIEW_W } from '../core/constants';
import { mouseIn } from '../core/input';
import {
  ACCESSORIES, LOADOUT_SLOTS, accessoryDef, maxLevelOf, upgradeCost, type AccessoryDef, type AccessoryRarity,
} from '../meta/accessories';
import { getProgress } from '../meta/progress';
import { drawButton, drawPanel, drawPixelText, drawText } from './primitives';
import { groupDigits } from './scoreboard';

export const RARITY_COLOR: Record<AccessoryRarity, string> = { common: '#c9c2b8', rare: '#5ab0f0', epic: '#c07af0', unique: '#f0b94d' };
const ROMAN = ['', 'I', 'II', 'III'];

const PANEL = { x: 70, y: 24, w: 820, h: 492 };
const ROW_H = 36;
const LIST_Y = PANEL.y + 118;

/** Is the accessories panel open on the class select screen? (E toggles it.) */
export let gearOpen = false;
export const setGearOpen = (open: boolean): void => { gearOpen = open; };

/** One row per accessory in the catalog (owned or not). */
export const gearRowRects = (): Rect[] => ACCESSORIES.map((_, i) => ({ x: PANEL.x + 16, y: LIST_Y + i * ROW_H, w: PANEL.w - 32, h: ROW_H - 4 }));
/** The upgrade button at the right end of a row. */
export const gearUpgradeRect = (row: Rect): Rect => ({ x: row.x + row.w - 150, y: row.y + 3, w: 146, h: row.h - 6 });
export const gearCloseRect = (): Rect => ({ x: PANEL.x + PANEL.w - 130, y: PANEL.y + PANEL.h - 44, w: 114, h: 32 });

/** "Glass Heart II". */
export const accessoryLabel = (id: string, level: number): string => (accessoryDef(id)?.name ?? id) + (level > 1 ? ' ' + ROMAN[level] : '');

export function drawGearPanel(): void {
  const p = getProgress();
  ctx.fillStyle = 'rgba(10,7,14,0.88)';
  ctx.fillRect(0, 0, VIEW_W, 540);
  drawPanel(PANEL.x, PANEL.y, PANEL.w, PANEL.h, COLOR.panel, COLOR.gold, 2);
  drawPixelText('Accessories', PANEL.x + 24, PANEL.y + 36, 24, COLOR.gold);
  drawPixelText('Gold ' + groupDigits(p.gold), PANEL.x + PANEL.w - 24, PANEL.y + 36, 18, COLOR.gold, 'right');
  drawText('Dropped by the Hollow King (one for each player who wins). Wear up to ' + LOADOUT_SLOTS + ' in a run.', PANEL.x + 24, PANEL.y + 56, 12, COLOR.muted);

  // the loadout
  for (let i = 0; i < LOADOUT_SLOTS; i++) {
    const id = p.loadout[i], x = PANEL.x + 24 + i * 262, y = PANEL.y + 66;
    const def = id ? accessoryDef(id) : undefined;
    drawPanel(x, y, 250, 38, def ? 'rgba(37,29,49,0.95)' : 'rgba(20,16,25,0.7)', def ? RARITY_COLOR[def.rarity] : COLOR.line, 2);
    drawText(def ? accessoryLabel(def.id, p.accessories[def.id] ?? 1) : 'Empty slot', x + 125, y + 24, 13, def ? COLOR.text : COLOR.dim, 'center');
  }

  gearRowRects().forEach((row, i) => drawGearRow(ACCESSORIES[i], row, i));
  drawText('Click an accessory (or press its number) to wear or remove it', PANEL.x + 24, PANEL.y + PANEL.h - 22, 12, COLOR.dim);
  drawButton(gearCloseRect(), 'Close · E', COLOR.frame, COLOR.text, 21);
}

function drawGearRow(def: AccessoryDef, row: Rect, index: number): void {
  const p = getProgress(), level = p.accessories[def.id] ?? 0, owned = level > 0, worn = p.loadout.includes(def.id);
  const color = RARITY_COLOR[def.rarity];
  const bg = worn ? 'rgba(240,185,77,0.10)' : owned && mouseIn(row) ? 'rgba(255,255,255,0.05)' : 'rgba(20,16,25,0.6)';
  drawPanel(row.x, row.y, row.w, row.h, bg, worn ? COLOR.gold : COLOR.line, worn ? 2 : 1);
  drawPixelText(String(index + 1), row.x + 14, row.y + 21, 12, COLOR.dim, 'center');
  if (!owned) {
    drawText('???', row.x + 34, row.y + 21, 14, COLOR.dim);
    drawText(def.rarity[0].toUpperCase() + def.rarity.slice(1) + ' · not found yet', row.x + 200, row.y + 21, 12, COLOR.dim);
    return;
  }
  drawText(accessoryLabel(def.id, level), row.x + 34, row.y + 15, 13, color);
  drawText(def.rarity + (worn ? ' · worn' : ''), row.x + 34, row.y + 29, 10, worn ? COLOR.gold : COLOR.dim);
  drawText(def.upside[level - 1], row.x + 230, row.y + 15, 12, COLOR.text);
  drawText('Trade-off: ' + def.tradeoff, row.x + 230, row.y + 29, 11, COLOR.muted);
  const cost = upgradeCost(def, level), btn = gearUpgradeRect(row);
  if (level >= maxLevelOf(def)) { drawText('Max level', btn.x + btn.w / 2, btn.y + 19, 11, COLOR.dim, 'center'); return; }
  const afford = p.gold >= cost;
  drawButton(btn, 'Upgrade · ' + groupDigits(cost) + 'g', afford ? COLOR.gold : COLOR.frame, afford ? COLOR.gold : COLOR.dim, 18);
}
