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
import { isClassUnlocked, lastUnlocked, unlockText } from '../meta/progress';
import { net } from '../net/session';
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
  ctx.fillStyle = OVERLAY;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  if (!offer) { drawWaitingForTeam(); return; }
  drawPixelText('Level up! · Lv ' + (run.player.level - run.pendingLevelUps + 1), VIEW_W / 2, 84, 30, COLOR.gold, 'center');
  const rects = levelCardRects();
  offer.items.forEach((item, i) => drawOfferCard(item, rects[i], i, offer.hover === i));
  drawSlotStrip();
  const reroll = rerollButtonRect(), canUse = canReroll();
  drawPanel(reroll.x, reroll.y, reroll.w, reroll.h, canUse && mouseIn(reroll) ? COLOR.panelHover : COLOR.panel, canUse ? COLOR.gold : COLOR.line, 2);
  drawPixelText(rerollLabel(), reroll.x + reroll.w / 2, reroll.y + 22, 14, canUse ? COLOR.gold : COLOR.dim, 'center');
  drawText('Click a card or press 1, 2, 3', VIEW_W / 2, 510, 13, COLOR.dim, 'center');
}

/** Co-op: you've chosen, the game resumes once everyone has. */
function drawWaitingForTeam(): void {
  const choosing = run.heroes.filter((h) => h.offer && !h.gone).map((h) => h.name);
  drawPixelText('Card chosen', VIEW_W / 2, VIEW_H / 2 - 20, 28, COLOR.gold, 'center');
  const who = choosing.length ? 'Waiting for ' + choosing.join(', ') + ' to choose…' : 'Resuming…';
  drawText(who, VIEW_W / 2, VIEW_H / 2 + 14, 15, COLOR.muted, 'center');
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

/** A row of class tiles; the highlighted class is described in the panel below. */
const MENU_TILE = { w: 140, h: 96, gap: 12, y: 118 };
const MENU_DETAIL = { x: 30, y: 228, w: 900, h: 224 };

export function menuCardRects(): Rect[] {
  const { w, h, gap, y } = MENU_TILE;
  const n = CLASS_ORDER.length, x0 = VIEW_W / 2 - (n * w + (n - 1) * gap) / 2;
  return CLASS_ORDER.map((_, i) => ({ x: x0 + i * (w + gap), y, w, h }));
}

export function drawMenu(): void {
  drawMenuBackdrop();
  drawPixelText('Shattered Realm', VIEW_W / 2, 66, 44, COLOR.text, 'center');
  const open = CLASS_ORDER.filter(isClassUnlocked).length;
  drawText('Prototype · ' + open + ' of ' + CLASS_ORDER.length + ' classes unlocked · placeholder shapes, no art', VIEW_W / 2, 96, 13, COLOR.muted, 'center');
  const rects = menuCardRects();
  CLASS_ORDER.forEach((id, i) => drawClassTile(CLASSES[id], rects[i], i, menuSelection === i));
  drawClassDetail(CLASSES[CLASS_ORDER[menuSelection]]);
  const online = menuOnlineButtons();
  drawButton(online.host, 'Create room · C', COLOR.teal, COLOR.teal, 21);
  drawButton(online.join, 'Join room · J', COLOR.gold, COLOR.gold, 21);
  if (net.notice) drawText(net.notice, VIEW_W / 2, 470, 13, COLOR.ember, 'center');
  drawText('WASD move · Left click Strike · Right click Heavy Strike · Space dash · Q Ultimate · Esc pause', VIEW_W / 2, 490, 13, COLOR.text, 'center');
  const godHint = 'Click a class or press 1–' + CLASS_ORDER.length + ' to play solo. Press G for test mode (can\'t die, unlocks don\'t count): ' + (DEBUG.god ? 'ON' : 'off');
  drawText(godHint, VIEW_W / 2, 512, 12, DEBUG.god ? COLOR.gold : COLOR.dim, 'center');
}

/** "Create room" / "Join room", top right of the class select screen. */
export function menuOnlineButtons(): { host: Rect; join: Rect } {
  return {
    host: { x: VIEW_W - 190, y: 16, w: 174, h: 32 },
    join: { x: VIEW_W - 190, y: 54, w: 174, h: 32 },
  };
}

// ------------------------------------------------------------ online: lobby, join, leave panel

export function lobbyButtons(): { start: Rect; copy: Rect; leave: Rect } {
  return {
    start: { x: VIEW_W / 2 + 120, y: 444, w: 200, h: 42 },
    copy: { x: VIEW_W / 2 - 100, y: 444, w: 200, h: 42 },
    leave: { x: VIEW_W / 2 - 320, y: 444, w: 200, h: 42 },
  };
}

export function drawLobby(): void {
  drawMenuBackdrop();
  const host = net.mode === 'host';
  drawPixelText('Room code', VIEW_W / 2, 56, 18, COLOR.muted, 'center');
  drawPixelText(net.code || '·····', VIEW_W / 2, 112, 56, COLOR.gold, 'center');
  drawText(host ? 'Send this code (or the invite link) to your friends. They choose Join room and type it in.' : 'You\'re in! Waiting for the host to start.', VIEW_W / 2, 140, 13, COLOR.muted, 'center');

  const w = 200, gap = 14, x0 = VIEW_W / 2 - (4 * w + 3 * gap) / 2, y = 168, h = 220;
  for (let i = 0; i < 4; i++) {
    const x = x0 + i * (w + gap), player = net.players[i];
    if (!player) {
      drawDashedRect(x + 1, y + 1, w - 2, h - 2, [5, 5], COLOR.line, 2);
      drawText('Open slot', x + w / 2, y + h / 2, 13, COLOR.dim, 'center');
      continue;
    }
    const cls = CLASSES[player.classId], mine = i === (host ? 0 : net.you);
    drawPanel(x, y, w, h, COLOR.panel, mine ? cls.color : COLOR.line, mine ? 3 : 2, cls.color);
    drawPixelText(player.name + (mine ? ' (you)' : ''), x + w / 2, y + 34, 16, mine ? COLOR.gold : COLOR.text, 'center');
    ctx.fillStyle = cls.color;
    ctx.beginPath(); ctx.arc(x + w / 2, y + 92, 30, 0, TAU); ctx.fill();
    drawPixelText(cls.name[0], x + w / 2, y + 101, 26, COLOR.ink, 'center');
    drawPixelText(cls.name, x + w / 2, y + 150, 18, COLOR.text, 'center');
    drawText(cls.role, x + w / 2, y + 170, 11, COLOR.muted, 'center');
    if (mine) drawText('1–4 or ←/→ to change class', x + w / 2, y + 200, 10, COLOR.dim, 'center');
  }

  const b = lobbyButtons();
  drawButton(b.leave, 'Leave · Esc', COLOR.ember, COLOR.ember, 27);
  drawButton(b.copy, 'Copy invite link', COLOR.teal, COLOR.teal, 27);
  if (host) drawButton(b.start, 'Start · Enter', COLOR.gold, COLOR.gold, 27);
  else drawText('The host starts the game', b.start.x + b.start.w / 2, b.start.y + 26, 12, COLOR.dim, 'center');
  if (net.status) drawText(net.status, VIEW_W / 2, 420, 13, COLOR.gold, 'center');
  drawText('Co-op: XP is shared, everyone picks their own cards. Stand next to a downed friend to revive them.', VIEW_W / 2, 512, 12, COLOR.dim, 'center');
}

export function joinButtons(): { join: Rect; back: Rect } {
  return {
    back: { x: VIEW_W / 2 - 220, y: 360, w: 200, h: 42 },
    join: { x: VIEW_W / 2 + 20, y: 360, w: 200, h: 42 },
  };
}

export function drawJoin(): void {
  drawMenuBackdrop();
  drawPixelText('Join a room', VIEW_W / 2, 110, 34, COLOR.text, 'center');
  const connecting = net.mode === 'client';
  drawText(connecting ? '' : 'Type the 5-letter code from your friend, or paste their invite link.', VIEW_W / 2, 146, 14, COLOR.muted, 'center');
  const code = connecting ? net.code : net.joinText;
  const boxW = 64, gap = 12, x0 = VIEW_W / 2 - (5 * boxW + 4 * gap) / 2;
  for (let i = 0; i < 5; i++) {
    const x = x0 + i * (boxW + gap), active = !connecting && i === code.length;
    drawPanel(x, 190, boxW, 80, COLOR.panel, active ? COLOR.gold : COLOR.line, active ? 3 : 2);
    if (code[i]) drawPixelText(code[i], x + boxW / 2, 248, 40, COLOR.gold, 'center');
  }
  if (net.status) drawText(net.status, VIEW_W / 2, 314, 14, connecting ? COLOR.teal : COLOR.ember, 'center');
  const b = joinButtons();
  drawButton(b.back, 'Back · Esc', COLOR.frame, COLOR.text, 27);
  const ready = !connecting && net.joinText.length === 5;
  drawButton(b.join, connecting ? 'Connecting…' : 'Join · Enter', ready ? COLOR.gold : COLOR.line, ready ? COLOR.gold : COLOR.dim, 27);
  drawText('You\'ll play as ' + CLASSES[CLASS_ORDER[menuSelection]].name + '. You can change class in the room.', VIEW_W / 2, 440, 12, COLOR.dim, 'center');
}

/** Esc during an online game: the game keeps running, so this is just a leave prompt. */
export function drawOnlineMenu(): void {
  ctx.fillStyle = 'rgba(10,7,14,0.6)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawPanel(VIEW_W / 2 - 200, VIEW_H / 2 - 70, 400, 140, COLOR.panel, COLOR.frame, 2, COLOR.gold);
  drawPixelText('Online game', VIEW_W / 2, VIEW_H / 2 - 30, 22, COLOR.text, 'center');
  drawText('The game keeps running for everyone.', VIEW_W / 2, VIEW_H / 2 - 4, 13, COLOR.muted, 'center');
  drawText('Esc back to the game · L leave the game', VIEW_W / 2, VIEW_H / 2 + 34, 14, COLOR.gold, 'center');
}

function drawMenuBackdrop(): void {
  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  for (let i = 0; i < 60; i++) {
    const x = (i * 157) % VIEW_W, y = (i * 89) % VIEW_H;
    ctx.fillStyle = i % 3 ? '#1f1828' : '#2a2036';
    ctx.fillRect(x, y, 3, 3);
  }
}

/** A small class tile: colour badge, hotkey, name and type. Locked classes are dimmed with a padlock. */
function drawClassTile(cls: ClassDef, rect: Rect, index: number, selected: boolean): void {
  const locked = !isClassUnlocked(cls.id), y0 = rect.y - (selected ? 4 : 0);
  if (locked) {
    drawPanel(rect.x, y0, rect.w, rect.h, 'rgba(20,16,25,0.85)', null);
    drawDashedRect(rect.x + 1, y0 + 1, rect.w - 2, rect.h - 2, [5, 4], selected ? COLOR.gold : COLOR.frame, selected ? 2.5 : 1.5);
  } else {
    drawPanel(rect.x, y0, rect.w, rect.h, selected ? '#2a2138' : COLOR.panel, selected ? cls.color : COLOR.line, selected ? 3 : 2, cls.color);
  }
  const cx = rect.x + rect.w / 2;
  ctx.globalAlpha = locked ? 0.35 : 1;
  ctx.fillStyle = cls.color;
  ctx.beginPath(); ctx.arc(cx, y0 + 32, 17, 0, TAU); ctx.fill();
  drawPixelText(cls.name[0], cx, y0 + 39, 17, COLOR.ink, 'center');
  ctx.globalAlpha = 1;
  if (locked) drawPadlock(cx, y0 + 32, COLOR.gold);
  drawPixelText(String(index + 1), rect.x + 12, y0 + 18, 12, COLOR.dim, 'center');
  drawPixelText(cls.name, cx, y0 + 68, 15, locked ? COLOR.dim : COLOR.text, 'center');
  drawText(locked ? 'Locked' : cls.role.split(' · ')[0], cx, y0 + 85, 10, locked ? COLOR.gold : COLOR.muted, 'center');
}

/** The highlighted class: kit, ratings, and how to play or unlock it. */
function drawClassDetail(cls: ClassDef): void {
  const { x, y, w, h } = MENU_DETAIL, locked = !isClassUnlocked(cls.id);
  drawPanel(x, y, w, h, COLOR.panel, COLOR.line, 2, locked ? COLOR.gold : cls.color);
  drawPixelText(cls.name, x + 24, y + 40, 26, locked ? COLOR.muted : COLOR.text);
  drawText(cls.role + ' · Ultimate: ' + cls.ultName, x + 24, y + 62, 12, COLOR.muted);
  cls.kit.forEach((line, i) => drawText(line, x + 24, y + 92 + i * 21, 13, locked ? COLOR.dim : COLOR.text));
  const rx = x + 600;
  drawPixelText('Stats', rx, y + 40, 14, COLOR.muted);
  Object.entries(cls.ratings).forEach(([label, value], j) => {
    const rowY = y + 58 + j * 22;
    drawText(label, rx, rowY + 9, 12, COLOR.dim);
    for (let s = 0; s < 5; s++) {
      ctx.fillStyle = s < value ? (locked ? COLOR.frame : cls.color) : COLOR.line;
      ctx.fillRect(rx + 110 + s * 30, rowY, 26, 9);
    }
  });
  if (locked) {
    drawPadlock(x + 34, y + h - 24, COLOR.gold);
    drawPixelText('How to unlock: ' + unlockText(cls.id), x + 52, y + h - 18, 14, COLOR.gold);
  } else {
    drawText('Click its tile or press its number to play solo · C to host a room with this class', x + 24, y + h - 18, 12, COLOR.teal);
  }
}

function drawPadlock(cx: number, cy: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(cx, cy - 4, 6, Math.PI, 0); ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillRect(cx - 9, cy - 4, 18, 13);
  ctx.fillStyle = COLOR.ink;
  ctx.fillRect(cx - 1.5, cy, 3, 5);
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
  if (lastUnlocked.length) {
    const names = lastUnlocked.map((id) => CLASSES[id]?.name ?? id).join(' and ');
    drawPixelText('New class unlocked: ' + names + '!', VIEW_W / 2, 486, 22, COLOR.gold, 'center');
  }
  const b = resultButtons();
  if (net.mode === 'client') {
    drawText('Waiting for the host…', b.again.x + b.again.w / 2, b.again.y + 27, 13, COLOR.dim, 'center');
    drawButton(b.menu, 'Leave · Esc', COLOR.frame, COLOR.text, 28);
    return;
  }
  drawButton(b.again, 'Play again · Enter', COLOR.teal, COLOR.teal, 28);
  drawButton(b.menu, net.mode === 'host' ? 'Back to room · Esc' : 'Change class · Esc', COLOR.frame, COLOR.text, 28);
}
