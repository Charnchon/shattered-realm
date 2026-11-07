// ============================================================ screens: level up, menu, pause, result
// Layout functions (…Rects / …Buttons) are shared by drawing and input handling.
import type { ClassDef, OfferItem, Rect, RelicId } from '../types';
import { ctx } from '../core/canvas';
import { BOSS_COUNT, COLOR, FINAL_WAVE, FONT_PIXEL, RARITY, TAU, VIEW_H, VIEW_W, type Rarity } from '../core/constants';
import { mouseIn } from '../core/input';
import { formatTime } from '../core/math';
import { DEBUG, menuSelection, run, totalArmor } from '../core/state';
import { CLASSES, CLASS_ORDER } from '../classes/registry';
import { CARD_MAX_LEVEL, OFFER_SIZE, PART_LABEL, canReroll, cardDef, relicDef, rerollLabel, upgradeLabel } from '../progression/cards';
import { drawButton, drawDashedRect, drawDiamond, drawPanel, drawPixelText, drawText, drawWrappedText } from './primitives';

const OVERLAY = 'rgba(10,7,14,0.78)';

// ------------------------------------------------------------ level up

const LEVEL_CARD = { w: 232, h: 292, gap: 22, y: 112, ribbonH: 28 };

export function levelCardRects(): Rect[] {
  const { w, h, gap, y } = LEVEL_CARD;
  const n = run.offer ? run.offer.items.length : OFFER_SIZE;
  const x0 = VIEW_W / 2 - (n * w + (n - 1) * gap) / 2;
  return Array.from({ length: n }, (_, i) => ({ x: x0 + i * (w + gap), y, w, h }));
}

export function rerollButtonRect(): Rect {
  return { x: VIEW_W / 2 + 90, y: 420, w: 220, h: 34 };
}

export function drawLevelUp(): void {
  const offer = run.offer;
  if (!offer) return;
  ctx.fillStyle = OVERLAY;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawPixelText('Level up! · Lv ' + (run.player.level - run.pendingLevelUps + 1), VIEW_W / 2, 84, 30, COLOR.gold, 'center');
  const rects = levelCardRects();
  offer.items.forEach((item, i) => drawOfferCard(item, rects[i], i, offer.hover === i));
  drawSlotStrip();
  const reroll = rerollButtonRect(), canUse = canReroll();
  drawPanel(reroll.x, reroll.y, reroll.w, reroll.h, canUse && mouseIn(reroll) ? COLOR.panelHover : COLOR.panel, canUse ? COLOR.gold : COLOR.line, 2);
  drawPixelText(rerollLabel(), reroll.x + reroll.w / 2, reroll.y + 22, 14, canUse ? COLOR.gold : COLOR.dim, 'center');
  drawText('Click a card or press 1, 2, 3', VIEW_W / 2, 510, 13, COLOR.dim, 'center');
}

function offerTag(item: OfferItem): string {
  switch (item.kind) {
    case 'evo': return 'Evolution';
    case 'card': return PART_LABEL[item.def.part];
    case 'relic': return 'Relic';
    case 'stat': return 'Stat';
  }
}

/** The three text blocks under a card's name: level change, upgrades, description. */
function offerDetails(item: OfferItem): { levelLine: string; upgradeLine: string; desc: string } {
  switch (item.kind) {
    case 'card': {
      const def = item.def;
      let desc = item.isNew ? def.desc : '';
      if (!item.isNew && def.evo && !run.cards[def.id].evolved && item.to >= CARD_MAX_LEVEL) desc = 'Evolves at Lv5 with ' + def.evo.needText + '.';
      if (item.isNew && def.evo) desc += ' Evolves with ' + def.evo.needText + '.';
      return { levelLine: item.isNew ? 'NEW' : 'Lv ' + item.from + ' → ' + item.to, upgradeLine: item.ups.map(upgradeLabel).join(' · '), desc };
    }
    case 'evo':
      return { levelLine: item.def.name + ' → ' + (item.def.evo?.name ?? ''), upgradeLine: '', desc: item.def.evo?.desc ?? '' };
    case 'relic':
      return { levelLine: item.from ? 'Lv ' + item.from + ' → ' + item.to : 'NEW', upgradeLine: '', desc: item.def.desc };
    case 'stat':
      return { levelLine: 'Small boost', upgradeLine: '', desc: item.def.desc };
  }
}

function drawOfferCard(item: OfferItem, rect: Rect, index: number, hovered: boolean): void {
  const rarity = RARITY[item.rarity];
  const y0 = rect.y - (hovered ? 6 : 0), cx = rect.x + rect.w / 2;
  drawRarityFrame(rect, y0, rarity, hovered, index + 1);

  // type tag
  const tag = offerTag(item).toUpperCase();
  ctx.font = '700 11px ' + FONT_PIXEL;
  const tagW = ctx.measureText(tag).width + 14;
  ctx.strokeStyle = COLOR.frame;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cx - tagW / 2, y0 + 38, tagW, 18);
  drawPixelText(tag, cx, y0 + 51, 11, COLOR.muted, 'center');

  const name = item.kind === 'evo' ? (item.def.evo?.name ?? item.def.name) : item.def.name;
  drawWrappedText(name, cx, y0 + 84, rect.w - 24, 24, 21, rarity.tier > 1 ? rarity.color : COLOR.text, 'center', FONT_PIXEL);

  const { levelLine, upgradeLine, desc } = offerDetails(item);
  const isNew = item.kind === 'card' && item.isNew;
  drawPixelText(levelLine, cx, y0 + 136, 15, isNew || levelLine === 'NEW' ? COLOR.teal : COLOR.text, 'center');
  if (upgradeLine) drawWrappedText(upgradeLine, cx, y0 + 156, rect.w - 24, 16, 13, COLOR.teal, 'center');
  if (desc) drawWrappedText(desc, cx, y0 + (upgradeLine ? 188 : 166), rect.w - 30, 17, 13, COLOR.muted, 'center');
}

/** Card body styled by rarity: glow, tint, border and a solid ribbon with tier gems. */
function drawRarityFrame(rect: Rect, y0: number, rarity: Rarity, hovered: boolean, hotkey: number): void {
  const tier = rarity.tier, ribbonH = LEVEL_CARD.ribbonH;
  const now = performance.now() / 1000, pulse = 0.5 + 0.5 * Math.sin(now * 4);
  ctx.save();
  if (tier > 1) {
    ctx.shadowColor = rarity.color;
    ctx.shadowBlur = (tier - 1) * 8 + (tier >= 3 ? pulse * 10 : 0) + (hovered ? 6 : 0);
  }
  ctx.fillStyle = hovered ? COLOR.panelHover : COLOR.panel;
  ctx.fillRect(rect.x, y0, rect.w, rect.h);
  ctx.restore();

  const tint = ctx.createLinearGradient(0, y0, 0, y0 + rect.h);
  tint.addColorStop(0, rarity.color + (tier > 1 ? '40' : '1a'));
  tint.addColorStop(0.55, rarity.color + '00');
  ctx.fillStyle = tint;
  ctx.fillRect(rect.x, y0, rect.w, rect.h);

  const lineWidth = tier > 1 ? 3 : 2;
  ctx.strokeStyle = rarity.color;
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(rect.x + lineWidth / 2, y0 + lineWidth / 2, rect.w - lineWidth, rect.h - lineWidth);

  ctx.fillStyle = rarity.color;
  ctx.fillRect(rect.x, y0, rect.w, ribbonH);
  if (tier === 4) drawRibbonShine(rect, y0, ribbonH, now);
  drawPixelText(rarity.label.toUpperCase(), rect.x + rect.w / 2, y0 + 20, 16, COLOR.ink, 'center');
  drawPixelText(String(hotkey), rect.x + 12, y0 + 20, 14, 'rgba(15,11,18,0.6)', 'center');
  for (let k = 0; k < 4; k++) {
    drawDiamond(rect.x + rect.w - 47 + k * 11, y0 + 14, 4, k < tier ? COLOR.ink : null, k < tier ? null : 'rgba(15,11,18,0.45)');
  }
}

/** Light sweep across the legendary ribbon. */
function drawRibbonShine(rect: Rect, y0: number, ribbonH: number, now: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, y0, rect.w, ribbonH);
  ctx.clip();
  const sx = rect.x - 60 + ((now * 120) % (rect.w + 120));
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.moveTo(sx, y0 + ribbonH); ctx.lineTo(sx + 18, y0); ctx.lineTo(sx + 36, y0); ctx.lineTo(sx + 18, y0 + ribbonH);
  ctx.fill();
  ctx.restore();
}

function drawSlotStrip(): void {
  const owned = Object.keys(run.cards).length, x0 = VIEW_W / 2 - 310;
  drawText('Cards ' + owned + '/' + run.cardSlots + (owned >= run.cardSlots ? ' · full, only upgrades now' : ''), x0, 443, 14, COLOR.muted);
  for (let i = 0; i < run.cardSlots; i++) {
    const x = x0 + i * 26, y = 452;
    if (i < owned) drawPanel(x, y, 20, 20, COLOR.panel, COLOR.teal, 2);
    else drawDashedRect(x + 1, y + 1, 18, 18, [3, 3], COLOR.frame, 1.5);
  }
}

// ------------------------------------------------------------ class select

const MENU_CARD = { w: 212, h: 300, gap: 16, y: 150 };

export function menuCardRects(): Rect[] {
  const { w, h, gap, y } = MENU_CARD;
  const n = CLASS_ORDER.length, x0 = VIEW_W / 2 - (n * w + (n - 1) * gap) / 2;
  return CLASS_ORDER.map((_, i) => ({ x: x0 + i * (w + gap), y, w, h }));
}

export function drawMenu(): void {
  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  for (let i = 0; i < 60; i++) {
    const x = (i * 157) % VIEW_W, y = (i * 89) % VIEW_H;
    ctx.fillStyle = i % 3 ? '#1f1828' : '#2a2036';
    ctx.fillRect(x, y, 3, 3);
  }
  drawPixelText('Shattered Realm', VIEW_W / 2, 74, 46, COLOR.text, 'center');
  drawText('Playable prototype · 4 test classes · placeholder shapes, no art', VIEW_W / 2, 104, 14, COLOR.muted, 'center');
  drawPixelText('Choose a class', VIEW_W / 2, 136, 15, COLOR.gold, 'center');
  const rects = menuCardRects();
  CLASS_ORDER.forEach((id, i) => drawClassCard(CLASSES[id], rects[i], i, menuSelection === i));
  drawText('WASD move · Left click Strike · Right click Heavy Strike · Space dash · Q Ultimate · Esc pause', VIEW_W / 2, 488, 13, COLOR.text, 'center');
  const godHint = 'Keyboard and mouse needed. Press 1–4 or click a class to start. Press G for test mode (you can\'t die): ' + (DEBUG.god ? 'ON' : 'off');
  drawText(godHint, VIEW_W / 2, 510, 12, DEBUG.god ? COLOR.gold : COLOR.dim, 'center');
}

function drawClassCard(cls: ClassDef, rect: Rect, index: number, selected: boolean): void {
  const y0 = rect.y - (selected ? 4 : 0);
  drawPanel(rect.x, y0, rect.w, rect.h, selected ? '#2a2138' : COLOR.panel, selected ? cls.color : COLOR.line, selected ? 3 : 2, cls.color);
  ctx.fillStyle = cls.color;
  ctx.beginPath(); ctx.arc(rect.x + 30, y0 + 36, 14, 0, TAU); ctx.fill();
  drawPixelText(String(index + 1), rect.x + 30, y0 + 41, 13, COLOR.ink, 'center');
  drawPixelText(cls.name, rect.x + 52, y0 + 34, 20, COLOR.text);
  drawText(cls.role, rect.x + 52, y0 + 51, 11, COLOR.muted);
  let y = y0 + 76;
  for (const line of cls.kit) y = drawWrappedText(line, rect.x + 14, y, rect.w - 26, 14, 11.5, COLOR.muted) + 19;
  // rating bars
  y = y0 + rect.h - 70;
  Object.entries(cls.ratings).forEach(([label, value], j) => {
    const rowY = y + j * 12;
    drawText(label, rect.x + 14, rowY + 8, 10, COLOR.dim);
    for (let s = 0; s < 5; s++) {
      ctx.fillStyle = s < value ? cls.color : COLOR.line;
      ctx.fillRect(rect.x + 100 + s * 18, rowY, 14, 7);
    }
  });
}

// ------------------------------------------------------------ pause

export function pauseButtons(): { resume: Rect; quit: Rect } {
  return {
    resume: { x: VIEW_W / 2 - 230, y: 440, w: 210, h: 40 },
    quit: { x: VIEW_W / 2 + 20, y: 440, w: 210, h: 40 },
  };
}

function statRows(): [string, string | number][] {
  const s = run.stats;
  return [
    ['Max HP', Math.round(s.maxHp)],
    ['Armor', totalArmor().toFixed(0)],
    ['Damage', Math.round(s.damage * 100) + '%'],
    ['Attack speed', Math.round(s.attackSpeed * 100) + '%'],
    ['Crit chance', Math.round(s.critChance * 100) + '%'],
    ['Crit damage', Math.round(s.critDamage * 100) + '%'],
    ['Move speed', Math.round(s.moveSpeed)],
    ['Lifesteal', Math.round(s.lifesteal * 100) + '%'],
    ['Area', Math.round(s.area * 100) + '%'],
    ['Luck', Math.round(s.luck)],
    ['Dash charges', s.dashCharges],
    ['Heavy cooldown', (s.heavyCooldown * s.cooldownMul).toFixed(1) + ' s'],
  ];
}

export function drawPause(): void {
  ctx.fillStyle = 'rgba(10,7,14,0.85)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawPixelText('Paused', VIEW_W / 2, 64, 34, COLOR.text, 'center');

  const left = VIEW_W / 2 - 360, right = VIEW_W / 2 + 10;
  drawPanel(left, 92, 330, 330, COLOR.panel, COLOR.line, 2, COLOR.teal);
  drawPixelText('Combat stats', left + 20, 122, 16, COLOR.teal);
  statRows().forEach(([label, value], i) => {
    drawText(label, left + 20, 150 + i * 22, 13, COLOR.muted);
    drawPixelText(String(value), left + 310, 150 + i * 22, 13, COLOR.text, 'right');
  });

  drawPanel(right, 92, 350, 330, COLOR.panel, COLOR.line, 2, COLOR.gold);
  drawPixelText('Cards and relics', right + 20, 122, 16, COLOR.gold);
  let y = 150;
  for (const id of Object.keys(run.cards)) {
    const def = cardDef(id), card = run.cards[id];
    const name = card.evolved && def.evo ? def.evo.name : def.name;
    drawText(name + '  Lv ' + card.level, right + 20, y, 13, card.evolved ? COLOR.gold : COLOR.text);
    drawText(PART_LABEL[def.part], right + 330, y, 11, COLOR.dim, 'right');
    y += 21;
  }
  for (const id of Object.keys(run.relics) as RelicId[]) {
    drawText(relicDef(id).name + '  Lv ' + run.relics[id], right + 20, y, 13, COLOR.muted);
    drawText('Relic', right + 330, y, 11, COLOR.dim, 'right');
    y += 21;
  }
  if (y === 150) drawText('No cards yet. Level up to pick one.', right + 20, y, 13, COLOR.dim);

  const b = pauseButtons();
  drawButton(b.resume, 'Resume · Esc', COLOR.teal);
  drawButton(b.quit, 'Quit to class select', COLOR.ember);
}

// ------------------------------------------------------------ result

export function resultButtons(): { again: Rect; menu: Rect } {
  return {
    again: { x: VIEW_W / 2 - 230, y: 400, w: 210, h: 44 },
    menu: { x: VIEW_W / 2 + 20, y: 400, w: 210, h: 44 },
  };
}

export function drawResult(): void {
  const result = run.result;
  if (!result) return;
  const accent = result.win ? COLOR.gold : COLOR.ember;
  ctx.fillStyle = 'rgba(10,7,14,0.88)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawPixelText(result.win ? 'Victory' : 'Defeated', VIEW_W / 2, 110, 50, accent, 'center');
  drawText(result.win ? 'The Hollow King has fallen.' : 'Fell on wave ' + run.wave + ' of ' + FINAL_WAVE + '.', VIEW_W / 2, 142, 16, COLOR.muted, 'center');
  const rows: [string, string | number][] = [
    ['Class', run.cls.name],
    ['Waves cleared', run.wavesCleared + ' / ' + FINAL_WAVE],
    ['Bosses defeated', run.bossesKilled + ' / ' + BOSS_COUNT],
    ['Level reached', run.player.level],
    ['Kills', run.kills],
    ['Time', formatTime(result.time)],
  ];
  drawPanel(VIEW_W / 2 - 230, 170, 460, 200, COLOR.panel, COLOR.line, 2, accent);
  rows.forEach(([label, value], i) => {
    drawText(label, VIEW_W / 2 - 205, 204 + i * 26, 15, COLOR.muted);
    drawPixelText(String(value), VIEW_W / 2 + 205, 204 + i * 26, 15, COLOR.text, 'right');
  });
  drawText('Rewards (shop and skill tree come later): +' + result.gold + ' gold · +' + result.exp + ' Specialist EXP', VIEW_W / 2, 390, 13, COLOR.gold, 'center');
  const b = resultButtons();
  drawButton(b.again, 'Play again · Enter', COLOR.teal, COLOR.teal, 28);
  drawButton(b.menu, 'Change class · Esc', COLOR.frame, COLOR.text, 28);
}
