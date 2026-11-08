// ============================================================ screens: level up, menu, pause, result
// Layout functions (…Rects / …Buttons) are shared by drawing and input handling.
import type { CardPart, ClassDef, OfferItem, Rect, RelicId } from '../types';
import { ctx } from '../core/canvas';
import { BOSS_COUNT, COLOR, FINAL_WAVE, FONT_BODY, FONT_PIXEL, RARITY, TAU, VIEW_H, VIEW_W, type Rarity } from '../core/constants';
import { mouseIn } from '../core/input';
import { formatTime } from '../core/math';
import { DEBUG, menuSelection, run, totalArmor } from '../core/state';
import { CLASSES, CLASS_ORDER } from '../classes/registry';
import { CARD_MAX_LEVEL, OFFER_SIZE, PART_LABEL, canReroll, cardDef, relicDef, rerollLabel, upgradeLabel } from '../progression/cards';
import { classPrice, getProgress, isClassUnlocked, lastRank, unlockText } from '../meta/progress';
import { LOADOUT_SLOTS } from '../meta/accessories';
import { drawGearPanel, gearOpen } from './gear';
import { codexOpen, drawBountyStrip, drawCodex } from './codex';
import { drawMapBadge, drawMapPanel, mapPanelOpen } from './mapscreen';
import { mapDef } from '../world/maps';
import { net } from '../net/session';
import { offerFadeIn } from '../game/controls';
import { drawScoreboard, groupDigits, liveScore, scoreboardHeight } from './scoreboard';
import { drawClassLevel, drawClassLevelBadge, drawRewards, goldText } from './rewards';
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
  ctx.save();
  ctx.globalAlpha = 0.25 + 0.75 * offerFadeIn(); // the cards fade in while clicks are ignored
  offer.items.forEach((item, i) => drawOfferCard(item, rects[i], i, offer.hover === i));
  ctx.restore();
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

/** Which button uses each card part. */
const PART_KEY: Record<CardPart, string> = {
  strike: 'Left click', heavy: 'Right click', dash: 'Space', ultimate: 'Q', passive: 'Always on', wild: 'Always on',
};

/** The small tag at the top of a card: the part and its button, e.g. "HEAVY STRIKE · RIGHT CLICK". */
function offerTag(item: OfferItem): string {
  switch (item.kind) {
    case 'evo': return 'Evolution';
    case 'card': return item.def.part === 'wild' ? 'Wild · new power' : PART_LABEL[item.def.part] + ' · ' + PART_KEY[item.def.part];
    case 'relic': return 'Relic';
    case 'stat': return 'Stat boost';
  }
}

/** The line under the name that answers "what does this improve?", e.g. "Upgrades: Mark Prey". */
function offerTarget(item: OfferItem): string {
  switch (item.kind) {
    case 'card': return item.def.part === 'wild' ? 'Adds a new power' : 'Upgrades: ' + run.cls.abilities[item.def.part];
    case 'evo': return 'Evolves your ' + item.def.name + ' card';
    case 'relic': return 'A relic: works for every class';
    case 'stat': return 'A small permanent boost';
  }
}

/** The text blocks under the target line: level change, rolled upgrades, and what the card does. */
function offerDetails(item: OfferItem): { levelLine: string; upgradeLine: string; desc: string } {
  switch (item.kind) {
    case 'card': {
      const def = item.def;
      let desc = def.desc; // always shown, so upgrades remind you what the card does
      if (def.evo && !run.cards[def.id]?.evolved) {
        desc += item.to >= CARD_MAX_LEVEL && !item.isNew ? ' Evolves now if you have ' + def.evo.needText + '.' : ' Evolves at Lv5 with ' + def.evo.needText + '.';
      }
      const upgradeLine = item.ups.length ? (item.isNew ? 'Bonus: ' : 'This level: ') + item.ups.map(upgradeLabel).join(' · ') : '';
      return { levelLine: item.isNew ? 'NEW CARD' : 'Lv ' + item.from + ' → ' + item.to, upgradeLine, desc };
    }
    case 'evo':
      return { levelLine: item.def.name + ' → ' + (item.def.evo?.name ?? ''), upgradeLine: '', desc: item.def.evo?.desc ?? '' };
    case 'relic':
      return { levelLine: item.from ? 'Lv ' + item.from + ' → ' + item.to : 'NEW RELIC', upgradeLine: '', desc: item.def.desc };
    case 'stat':
      return { levelLine: 'Small boost', upgradeLine: '', desc: item.def.desc };
  }
}

function drawOfferCard(item: OfferItem, rect: Rect, index: number, hovered: boolean): void {
  const rarity = RARITY[item.rarity];
  const y0 = rect.y - (hovered ? 6 : 0), cx = rect.x + rect.w / 2;
  drawRarityFrame(rect, y0, rarity, hovered, index + 1);

  // type tag: card part + the button it's on
  const tag = offerTag(item).toUpperCase();
  ctx.font = '800 11px ' + FONT_BODY; // small text is drawn in the body font (see drawPixelText)
  const tagW = ctx.measureText(tag).width + 14;
  ctx.strokeStyle = COLOR.frame;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cx - tagW / 2, y0 + 38, tagW, 18);
  drawPixelText(tag, cx, y0 + 51, 11, COLOR.muted, 'center');

  // text flows down the card, so long names and descriptions never overlap
  const name = item.kind === 'evo' ? (item.def.evo?.name ?? item.def.name) : item.def.name;
  let y = drawWrappedText(name, cx, y0 + 82, rect.w - 24, 23, 20, rarity.tier > 1 ? rarity.color : COLOR.text, 'center', FONT_PIXEL);
  y = drawWrappedText(offerTarget(item), cx, y + 21, rect.w - 20, 16, 13, COLOR.gold, 'center') + 4;

  const { levelLine, upgradeLine, desc } = offerDetails(item);
  const isNew = levelLine.startsWith('NEW');
  drawPixelText(levelLine, cx, y + 22, 14, isNew ? COLOR.teal : COLOR.text, 'center');
  y += 22;
  if (upgradeLine) y = drawWrappedText(upgradeLine, cx, y + 19, rect.w - 24, 15, 12, COLOR.teal, 'center');
  if (desc) drawWrappedText(desc, cx, y + 24, rect.w - 26, 17, 13, COLOR.text, 'center');
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
  const open = CLASS_ORDER.filter(isClassUnlocked).length, best = getProgress().highScores[0];
  const bestText = best ? 'Best score ' + groupDigits(best.score) + ' · H for high scores' : 'H for high scores';
  drawText(goldText() + ' · ' + open + ' of ' + CLASS_ORDER.length + ' classes unlocked · ' + bestText, VIEW_W / 2, 96, 13, COLOR.muted, 'center');
  drawMapBadge();
  const rects = menuCardRects();
  CLASS_ORDER.forEach((id, i) => drawClassTile(CLASSES[id], rects[i], i, menuSelection === i));
  drawClassDetail(CLASSES[CLASS_ORDER[menuSelection]]);
  const online = menuOnlineButtons();
  drawButton(online.host, 'Create room · C', COLOR.teal, COLOR.teal, 21);
  drawButton(online.join, 'Join room · J', COLOR.gold, COLOR.gold, 21);
  drawBountyStrip(458);
  // a notice (e.g. "not enough gold") takes the controls line's place
  if (net.notice) drawText(net.notice, VIEW_W / 2, 508, 13, COLOR.ember, 'center');
  else drawText('WASD move · Left click Strike · Right click Heavy · Space dash · Q Ultimate  ·  E accessories · B codex · H high scores', VIEW_W / 2, 508, 12, COLOR.text, 'center');
  const godHint = 'Click a class or press 1–' + CLASS_ORDER.length + ' to play solo. G = test mode (can\'t die, nothing is saved): ' + (DEBUG.god ? 'ON' : 'off');
  drawText(godHint, VIEW_W / 2, 527, 11, DEBUG.god ? COLOR.gold : COLOR.dim, 'center');
  if (highScoresOpen) drawHighScores();
  if (gearOpen) drawGearPanel();
  if (codexOpen) drawCodex(CLASS_ORDER[menuSelection]);
  if (mapPanelOpen) drawMapPanel(CLASS_ORDER[menuSelection]);
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
  drawText('Map: ' + mapDef(net.map.mapId).name + ' · level ' + net.map.level + (host ? ' (change it on class select with M)' : ''), VIEW_W / 2, 160, 13, COLOR.teal, 'center');

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
  drawClassLevelBadge(cls.id, rect.x + rect.w - 8, y0 + 18);
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
  if (!locked) {
    drawClassLevel(cls.id, rx, y + h - 50, 260);
    const worn = getProgress().loadout.length;
    drawText('Accessories ' + worn + '/' + LOADOUT_SLOTS + ' worn · E to change', rx, y + h - 18, 12, COLOR.gold);
  }
  if (locked) {
    const price = classPrice(cls.id);
    if (price) drawButton(buyClassRect(), 'Unlock · ' + price + ' gold · U', getProgress().gold >= price ? COLOR.gold : COLOR.frame, undefined, 23);
    drawPadlock(x + 34, y + h - 24, COLOR.gold);
    drawPixelText('How to unlock: ' + unlockText(cls.id), x + 52, y + h - 18, 14, COLOR.gold);
  } else {
    drawText('Click its tile or press its number to play solo · C to host a room with this class', x + 24, y + h - 18, 12, COLOR.teal);
  }
}

/** "Unlock with gold" on a locked class's detail panel. */
export const buyClassRect = (): Rect => ({ x: MENU_DETAIL.x + MENU_DETAIL.w - 254, y: MENU_DETAIL.y + MENU_DETAIL.h - 52, w: 230, h: 36 });

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
    again: { x: VIEW_W / 2 - 230, y: 492, w: 210, h: 40 },
    menu: { x: VIEW_W / 2 + 20, y: 492, w: 210, h: 40 },
  };
}

export function drawResult(): void {
  const result = run.result;
  if (!result) return;
  const accent = result.win ? COLOR.gold : COLOR.ember;
  ctx.fillStyle = 'rgba(10,7,14,0.88)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawPixelText(result.win ? 'Victory' : 'Defeated', VIEW_W / 2, 52, 40, accent, 'center');
  const how = result.win ? 'The Hollow King has fallen.' : 'Fell on wave ' + run.wave + ' of ' + FINAL_WAVE + '.';
  const summary = how + '  ·  ' + mapDef(run.mapId).name + ' ' + run.mapLevel + '  ·  Waves ' + run.wavesCleared + '/' + FINAL_WAVE + '  ·  Bosses ' + run.bossesKilled + '/' + BOSS_COUNT + '  ·  ' + formatTime(result.time);
  drawText(summary, VIEW_W / 2, 76, 14, COLOR.muted, 'center');
  const rank = lastRank >= 0 ? '   ·   New high score #' + (lastRank + 1) + '!' : '';
  drawPixelText('Score ' + groupDigits(liveScore()) + rank, VIEW_W / 2, 106, 22, COLOR.gold, 'center');
  // scoreboard, then this player's rewards right under it (4 players: 120..280, rewards 290..418)
  drawScoreboard(120, accent);
  drawRewards(120 + scoreboardHeight() + 6);
  const b = resultButtons();
  if (net.mode === 'client') {
    drawText('Waiting for the host…', b.again.x + b.again.w / 2, b.again.y + 25, 13, COLOR.dim, 'center');
    drawButton(b.menu, 'Leave · Esc', COLOR.frame, COLOR.text, 26);
    return;
  }
  drawButton(b.again, 'Play again · Enter', COLOR.teal, COLOR.teal, 26);
  drawButton(b.menu, net.mode === 'host' ? 'Back to room · Esc' : 'Change class · Esc', COLOR.frame, COLOR.text, 26);
}

// ------------------------------------------------------------ high scores (menu panel)

/** Is the high-score panel open on the menu? (H toggles it.) */
export let highScoresOpen = false;
export const setHighScoresOpen = (open: boolean): void => { highScoresOpen = open; };

/** The best runs on this browser. */
function drawHighScores(): void {
  const list = getProgress().highScores, w = 620, h = 70 + 30 * Math.max(1, list.length), x = VIEW_W / 2 - w / 2, y = Math.max(40, VIEW_H / 2 - h / 2);
  ctx.fillStyle = 'rgba(10,7,14,0.85)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawPanel(x, y, w, h, COLOR.panel, COLOR.gold, 2);
  drawPixelText('High scores', VIEW_W / 2, y + 34, 24, COLOR.gold, 'center');
  if (!list.length) drawText('No runs yet. Finish a run (test mode doesn\'t count) to set a score.', VIEW_W / 2, y + 74, 13, COLOR.muted, 'center');
  list.forEach((e, i) => {
    const ry = y + 74 + i * 30, color = i === 0 ? COLOR.gold : COLOR.text;
    drawPixelText('#' + (i + 1), x + 40, ry, 15, COLOR.dim, 'right');
    drawPixelText(groupDigits(e.score), x + 150, ry, 16, color, 'right');
    drawText(CLASSES[e.classId]?.name ?? e.classId, x + 175, ry, 14, color);
    drawText(e.win ? 'Victory' : 'Wave ' + e.wave, x + 330, ry, 14, e.win ? COLOR.gold : COLOR.muted);
    drawText(formatTime(e.time), x + 420, ry, 14, COLOR.muted);
    drawText((e.players > 1 ? e.players + 'P' : 'Solo') + ' · ' + mapDef(e.mapId ?? 'forest').name.split(' ').pop() + ' ' + (e.mapLevel ?? 1), x + 470, ry, 12, COLOR.muted);
    drawText(e.date, x + w - 20, ry, 12, COLOR.dim, 'right');
  });
  drawText('H or Esc to close', VIEW_W / 2, y + h + 22, 12, COLOR.dim, 'center');
}
