// ============================================================ HUD (view space)
import type { Rect } from '../types';
import { ctx } from '../core/canvas';
import { COLOR, FINAL_WAVE, TAU, VIEW_H, VIEW_W } from '../core/constants';
import { clamp, formatTime } from '../core/math';
import { DEBUG, relicLevel, run } from '../core/state';
import { MAX_RELICS, PART_SHORT, cardDef, relicDef } from '../progression/cards';
import { xpToNextLevel } from '../world/pickups';
import { isBossWave } from '../world/waves';
import { drawBar, drawDashedRect, drawPanel, drawPixelText, drawText } from './primitives';
import { keysDown } from '../core/input';
import { drawLiveScoreboard, groupDigits, liveScore } from './scoreboard';

const HUD_BG = 'rgba(20,16,25,0.85)';
const HUD_PANEL = 'rgba(37,29,49,0.92)';
const VITALS_X = 70;
const VITALS_W = 210;

export function drawHUD(): void {
  drawPortrait();
  drawVitals();
  drawTeammates();
  drawDownedNotice();
  drawWaveInfo();
  drawBossBar();
  drawPauseHint();
  drawCardSlots();
  drawAbilityBar();
  drawClassResource();
  drawBanner();
  drawLiveScore();
  if (keysDown.tab) drawLiveScoreboard();
}

/** The run's score, top right, with a reminder that Tab shows everyone's stats. */
function drawLiveScore(): void {
  drawPixelText('Score ' + groupDigits(liveScore()), VIEW_W - 54, 30, 16, COLOR.gold, 'right');
  drawText('Hold Tab · scoreboard', VIEW_W - 54, 46, 10, COLOR.dim, 'right');
}

/** Class badge with the ultimate charge ring around it. */
function drawPortrait(): void {
  const p = run.player, cls = run.cls, x = 36, y = 38;
  ctx.fillStyle = HUD_BG;
  ctx.beginPath(); ctx.arc(x, y, 26, 0, TAU); ctx.fill();
  ctx.strokeStyle = COLOR.line;
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(x, y, 24, 0, TAU); ctx.stroke();
  ctx.strokeStyle = p.ult >= 100 ? COLOR.gold : COLOR.teal;
  ctx.beginPath(); ctx.arc(x, y, 24, -Math.PI / 2, -Math.PI / 2 + (TAU * p.ult) / 100); ctx.stroke();
  if (p.ult >= 100) {
    // pulse when the ultimate is ready
    ctx.globalAlpha = 0.4 + 0.3 * Math.sin(run.time * 6);
    ctx.strokeStyle = COLOR.gold;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 30, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = cls.color;
  ctx.beginPath(); ctx.arc(x, y, 16, 0, TAU); ctx.fill();
  drawPixelText(cls.name[0], x, y + 6, 16, COLOR.ink, 'center');
}

function drawVitals(): void {
  const p = run.player, stats = run.stats, x = VITALS_X;
  drawBar(x, 20, VITALS_W, 14, p.hp / stats.maxHp, COLOR.ember, COLOR.barBg);
  if (run.cls.drawHpOverlay) run.cls.drawHpOverlay(x, 20, VITALS_W);
  drawPixelText(Math.ceil(p.hp) + ' / ' + Math.round(stats.maxHp), x + 6, 31, 11, COLOR.text);
  drawBar(x, 38, VITALS_W, 6, p.xp / xpToNextLevel(p.level), COLOR.gold, COLOR.barBg);
  drawPixelText('Lv ' + p.level, x, 60, 14, COLOR.gold);
  drawText(run.kills + ' kills', x + VITALS_W, 60, 12, COLOR.muted, 'right');
}

/** Co-op: each teammate's name, class colour and HP, under your own bars. */
function drawTeammates(): void {
  if (run.heroes.length < 2) return;
  let y = 84;
  for (const h of run.heroes) {
    if (h.idx === run.localHero) continue;
    ctx.fillStyle = h.gone ? COLOR.line : h.cls.color;
    ctx.beginPath(); ctx.arc(20, y - 4, 6, 0, TAU); ctx.fill();
    const label = h.gone ? h.name + ' · left' : h.down ? h.name + ' · DOWN' : h.name;
    drawText(label, 32, y, 11, h.gone ? COLOR.dim : h.down ? COLOR.red : COLOR.text);
    if (!h.gone) drawBar(32, y + 4, 120, 5, h.down ? h.revive : h.player.hp / h.stats.maxHp, h.down ? COLOR.green : COLOR.ember, COLOR.barBg);
    y += 24;
  }
}

function drawDownedNotice(): void {
  if (!run.hero.down) return;
  drawPixelText('You are down', VIEW_W / 2, VIEW_H / 2 - 60, 22, COLOR.red, 'center');
  drawText('A teammate can revive you by standing next to you, or you return at the next wave.', VIEW_W / 2, VIEW_H / 2 - 36, 12, COLOR.muted, 'center');
}

function drawWaveInfo(): void {
  const status = isBossWave(run.wave) ? 'Boss' : formatTime(run.waveDuration - run.waveTime);
  drawPixelText('Wave ' + run.wave + ' / ' + FINAL_WAVE + ' · ' + status, VIEW_W / 2, 28, 18, COLOR.text, 'center');
  if (DEBUG.god && !DEBUG.bot) drawText('Test mode', VIEW_W / 2, VIEW_H - 76, 11, COLOR.gold, 'center');
}

function drawBossBar(): void {
  const boss = run.boss;
  if (!boss) return;
  const w = 360, x = VIEW_W / 2 - w / 2;
  drawPixelText(boss.name, VIEW_W / 2, 46, 12, '#f08a68', 'center');
  drawBar(x, 50, w, 10, boss.hp / boss.maxHp, COLOR.ember, COLOR.barBg);
  drawBar(x, 62, w, 3, boss.stagger / 100, COLOR.gold, COLOR.barBg);
}

function drawPauseHint(): void {
  drawPanel(VIEW_W - 42, 12, 30, 30, HUD_BG, COLOR.frame, 2);
  ctx.fillStyle = COLOR.muted;
  ctx.fillRect(VIEW_W - 32, 20, 4, 14);
  ctx.fillRect(VIEW_W - 24, 20, 4, 14);
  drawText('Esc', VIEW_W - 27, 54, 10, COLOR.dim, 'center');
}

/** Owned cards (part + level), locked slots dashed, then relic chips below. */
function drawCardSlots(): void {
  const owned = Object.keys(run.cards);
  const x0 = 14, y = VIEW_H - 66, size = 36;
  drawText('Cards ' + owned.length + '/' + run.cardSlots, x0, y - 6, 11, COLOR.muted);
  for (let i = 0; i < 6; i++) {
    const x = x0 + i * (size + 5);
    const id = owned[i];
    if (i >= run.cardSlots) { drawDashedRect(x + 1, y + 1, size - 2, size - 2, [3, 3], COLOR.frame, 1.5); continue; }
    if (!id) { drawPanel(x, y, size, size, 'rgba(20,16,25,0.7)', COLOR.line, 2); continue; }
    const def = cardDef(id), card = run.cards[id], color = card.evolved ? COLOR.gold : COLOR.teal;
    drawPanel(x, y, size, size, 'rgba(37,29,49,0.95)', color, 2);
    drawPixelText(PART_SHORT[def.part], x + size / 2, y + 15, 10, color, 'center');
    drawPixelText(String(card.level), x + size / 2, y + 30, 13, COLOR.text, 'center');
  }
  const relicIds = Object.keys(run.relics) as (keyof typeof run.relics)[];
  for (let i = 0; i < MAX_RELICS; i++) {
    const x = x0 + i * 23, ry = y + size + 5;
    const id = relicIds[i];
    if (id) {
      drawPanel(x, ry, 20, 12, 'rgba(37,29,49,0.95)', COLOR.gold, 1);
      drawPixelText(relicDef(id).name[0] + relicLevel(id), x + 10, ry + 10, 9, COLOR.gold, 'center');
    } else {
      drawDashedRect(x + 0.5, ry + 0.5, 19, 11, [2, 2], COLOR.line, 1);
    }
  }
}

function abilityBoxes(): Rect[] {
  const size = 46, gap = 8, total = 4 * size + 3 * gap, x0 = VIEW_W / 2 - total / 2, y = VIEW_H - size - 14;
  return [0, 1, 2, 3].map((i) => ({ x: x0 + i * (size + gap), y, w: size, h: size }));
}

/** LMB / RMB / Space / Q boxes with cooldown, dash charges and ult fill. */
function drawAbilityBar(): void {
  const p = run.player, stats = run.stats, cls = run.cls;
  const labels = [['LMB', cls.keys.lmb], ['RMB', cls.keys.rmb], ['SPC', cls.keys.spc], ['Q', cls.keys.q]];
  const ultReady = p.ult >= 100;
  abilityBoxes().forEach((b, i) => {
    drawPanel(b.x, b.y, b.w, b.h, HUD_PANEL, i === 3 && ultReady ? COLOR.gold : COLOR.frame, 2);
    if (i === 1 && p.heavyCooldown > 0) {
      const frac = p.heavyCooldown / (stats.heavyCooldown * stats.cooldownMul);
      ctx.fillStyle = 'rgba(15,11,18,0.7)';
      ctx.fillRect(b.x + 2, b.y + 2, b.w - 4, (b.h - 4) * clamp(frac, 0, 1));
    }
    if (i === 2) {
      for (let k = 0; k < stats.dashCharges; k++) {
        ctx.fillStyle = k < p.dashCharges ? COLOR.teal : COLOR.line;
        ctx.fillRect(b.x + 6 + k * 9, b.y + b.h - 9, 7, 4);
      }
    }
    if (i === 3) {
      ctx.fillStyle = 'rgba(240,185,77,0.25)';
      ctx.fillRect(b.x + 2, b.y + 2 + (b.h - 4) * (1 - p.ult / 100), b.w - 4, (b.h - 4) * (p.ult / 100));
    }
    drawPixelText(labels[i][0], b.x + b.w / 2, b.y + 18, 12, COLOR.text, 'center');
    const sub = i === 3 ? Math.floor(p.ult) + '%' : labels[i][1];
    drawText(sub, b.x + b.w / 2, b.y + 34, 10, i === 3 && ultReady ? COLOR.gold : COLOR.muted, 'center');
  });
}

function drawClassResource(): void {
  const res = run.cls.resource();
  const x = VIEW_W - 130, y = VIEW_H - 52;
  drawPanel(x, y, 116, 38, HUD_PANEL, COLOR.frame, 2);
  drawText(res.label, x + 8, y + 15, 11, COLOR.muted);
  drawPixelText(String(res.value), x + 108, y + 15, 12, res.color, 'right');
  drawBar(x + 8, y + 23, 100, 6, res.frac, res.color, COLOR.line);
}

function drawBanner(): void {
  const banner = run.banner;
  if (!banner) return;
  ctx.globalAlpha = Math.min(1, banner.time * 2);
  drawPixelText(banner.text, VIEW_W / 2, 112, 26, COLOR.gold, 'center');
  ctx.globalAlpha = 1;
}
