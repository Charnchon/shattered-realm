// ============================================================ bounties strip and the Codex panel (class select, B)
// Draw and click handling share the rect functions below.
import type { Rect } from '../types';
import { ctx } from '../core/canvas';
import { COLOR, VIEW_W } from '../core/constants';
import { CLASSES } from '../classes/registry';
import {
  BESTIARY, MAX_SLAYER_TIER, WEAKNESS_KILLS, bestiaryShare, bountyDef, isBossKey, nextSlayerKills, slayerTier,
} from '../meta/goals';
import { getProgress } from '../meta/progress';
import { ENEMY_TYPES } from '../world/enemies';
import { BOSS_DEFS } from '../world/bosses';
import type { EnemyTypeId } from '../types';
import { drawBar, drawButton, drawPanel, drawPixelText, drawText, drawWrappedText } from './primitives';
import { groupDigits } from './scoreboard';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

/** Role and weakness of each boss (enemy types keep theirs in `ENEMY_TYPES`). */
const BOSS_INFO: Record<string, { role: string; weakness: string }> = {
  troll: { role: 'Wave 3 boss: charges and slams', weakness: 'Dodge sideways; heavy strikes fill its stagger bar' },
  colossus: { role: 'Wave 6 boss: shockwaves and summons', weakness: 'Dash through the shockwave ring; holy damage' },
  wyvern: { role: 'Wave 9 boss: fire breath and dives', weakness: 'Stay out of the breath line; punish it after it lands' },
  king: { role: 'Final boss: three phases, a shrinking arena', weakness: 'Stay inside the safe zone; save your ultimate' },
};

/** Display name of a monster key (enemy type or boss kind). */
export function monsterName(key: string): string {
  if (isBossKey(key)) return Object.values(BOSS_DEFS).find((b) => b.kind === key)?.name ?? key;
  return ENEMY_TYPES[key as EnemyTypeId]?.name ?? key;
}
const monsterInfo = (key: string): { role: string; weakness: string } =>
  BOSS_INFO[key] ?? { role: ENEMY_TYPES[key as EnemyTypeId]?.role ?? '', weakness: ENEMY_TYPES[key as EnemyTypeId]?.weakness ?? '' };

/** "Cultist Slayer II". */
export const slayerTitle = (key: string, tier: number): string => monsterName(key) + ' Slayer ' + ROMAN[tier];

// ------------------------------------------------------------ bounties strip (class select)

/** The 3 active bounties with their progress, in a row at `y`. */
export function drawBountyStrip(y: number): void {
  const p = getProgress(), w = 296, gap = 6, x0 = VIEW_W / 2 - (3 * w + 2 * gap) / 2;
  p.bounties.active.forEach((id, i) => {
    const def = bountyDef(id);
    if (!def) return;
    const x = x0 + i * (w + gap), done = p.bounties.progress[id] ?? 0;
    drawPanel(x, y, w, 32, 'rgba(20,16,25,0.85)', COLOR.line, 1);
    drawText(def.text, x + 8, y + 13, 11, COLOR.text);
    drawBar(x + 8, y + 20, w - 110, 5, done / def.goal, COLOR.gold, COLOR.barBg);
    drawText(done + '/' + def.goal + ' · ' + def.gold + ' gold', x + w - 8, y + 27, 11, COLOR.gold, 'right');
  });
}

// ------------------------------------------------------------ Codex panel

const PANEL = { x: 40, y: 18, w: 880, h: 504 };
export type CodexTab = 'bestiary' | 'cards';

/** Is the Codex open on the class select screen? (B toggles it.) */
export let codexOpen = false;
export let codexTab: CodexTab = 'bestiary';
export const setCodexOpen = (open: boolean): void => { codexOpen = open; };
export const setCodexTab = (tab: CodexTab): void => { codexTab = tab; };

export const codexTabRects = (): Record<CodexTab, Rect> => ({
  bestiary: { x: PANEL.x + 24, y: PANEL.y + 50, w: 150, h: 30 },
  cards: { x: PANEL.x + 182, y: PANEL.y + 50, w: 150, h: 30 },
});
export const codexCloseRect = (): Rect => ({ x: PANEL.x + PANEL.w - 138, y: PANEL.y + 50, w: 114, h: 30 });

/** `classId` is the class highlighted on the menu (the Cards tab shows its cards). */
export function drawCodex(classId: string): void {
  const p = getProgress();
  ctx.fillStyle = 'rgba(10,7,14,0.88)';
  ctx.fillRect(0, 0, VIEW_W, 540);
  drawPanel(PANEL.x, PANEL.y, PANEL.w, PANEL.h, COLOR.panel, COLOR.gold, 2);
  drawPixelText('Codex', PANEL.x + 24, PANEL.y + 36, 24, COLOR.gold);
  const seen = Math.round(bestiaryShare(p) * BESTIARY.length);
  drawText('Bestiary ' + seen + '/' + BESTIARY.length + '  ·  Cards found ' + p.codex.cards.length + '  ·  Evolutions ' + p.codex.evolved.length,
    PANEL.x + PANEL.w - 24, PANEL.y + 32, 13, COLOR.muted, 'right');
  const tabs = codexTabRects();
  drawButton(tabs.bestiary, 'Bestiary · 1', codexTab === 'bestiary' ? COLOR.gold : COLOR.frame);
  drawButton(tabs.cards, 'Cards · 2', codexTab === 'cards' ? COLOR.gold : COLOR.frame);
  if (codexTab === 'bestiary') drawBestiary();
  else drawCards(classId);
  drawButton(codexCloseRect(), 'Close · B', COLOR.frame, COLOR.text);
}

/** 15 monsters, 3 columns: kills, Slayer tier, and what you've learned about them. */
function drawBestiary(): void {
  const p = getProgress(), w = 272, h = 74, gap = 6, x0 = PANEL.x + 24, y0 = PANEL.y + 90;
  BESTIARY.forEach((key, i) => {
    const x = x0 + (i % 3) * (w + gap), y = y0 + Math.floor(i / 3) * (h + gap), kills = p.kills[key] ?? 0;
    const tier = slayerTier(key, kills), boss = isBossKey(key);
    drawPanel(x, y, w, h, 'rgba(20,16,25,0.8)', tier ? COLOR.gold : COLOR.line, 1);
    if (!kills) {
      drawText('???', x + 10, y + 20, 14, COLOR.dim);
      drawText(boss ? 'Boss · defeat it to learn about it' : 'Kill one to learn about it', x + 10, y + 40, 11, COLOR.dim);
      return;
    }
    drawText(monsterName(key), x + 10, y + 18, 14, boss ? '#f08a68' : COLOR.text);
    const next = nextSlayerKills(key, kills);
    drawText(groupDigits(kills) + (next ? ' / ' + groupDigits(next) : '') + ' kills', x + w - 10, y + 18, 11, COLOR.muted, 'right');
    const slayer = tier ? 'Slayer ' + ROMAN[tier] + ' · +' + tier + '% damage' : 'Slayer I at ' + groupDigits(next) + ' kills';
    drawText(slayer + (tier >= MAX_SLAYER_TIER ? ' (max)' : ''), x + 10, y + 34, 11, tier ? COLOR.gold : COLOR.dim);
    const info = monsterInfo(key), known = kills >= WEAKNESS_KILLS || boss;
    const line = known ? 'Weakness: ' + info.weakness : info.role + ' · weakness at ' + WEAKNESS_KILLS + ' kills';
    drawWrappedText(line, x + 10, y + 50, w - 20, 13, 10, known ? COLOR.teal : COLOR.muted);
  });
}

/** The highlighted class's cards (16, plus mutations): found ones by name, evolutions once made. */
function drawCards(classId: string): void {
  const cls = CLASSES[classId], p = getProgress(), w = 205, h = 46, gap = 6, x0 = PANEL.x + 24, y0 = PANEL.y + 112;
  if (!cls) return;
  const found = cls.cards.filter((c) => p.codex.cards.includes(classId + ':' + c.id)).length;
  drawText(cls.name + ': ' + found + ' / ' + cls.cards.length + ' cards found. Cards join the Codex when you finish a run holding them.',
    PANEL.x + 24, PANEL.y + 100, 12, COLOR.muted);
  cls.cards.forEach((card, i) => {
    const x = x0 + (i % 4) * (w + gap), y = y0 + Math.floor(i / 4) * (h + gap);
    const has = p.codex.cards.includes(classId + ':' + card.id), evolved = p.codex.evolved.includes(classId + ':' + card.id);
    drawPanel(x, y, w, h, 'rgba(20,16,25,0.8)', evolved ? COLOR.gold : has ? COLOR.teal : COLOR.line, 1);
    drawText(has ? card.name : '???', x + 10, y + 18, 13, has ? COLOR.text : COLOR.dim);
    drawText(card.part + (card.mutation ? ' · mutation' : ''), x + w - 10, y + 18, 10, card.mutation ? COLOR.mutation : COLOR.dim, 'right');
    if (card.evo) drawText(evolved ? 'Evolved: ' + card.evo.name : 'Evolution: ???', x + 10, y + 36, 10, evolved ? COLOR.gold : COLOR.dim);
  });
}
