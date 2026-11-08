// ============================================================ scoreboard: per-player stats (hold Tab in a run, and the result screen)
// Reads only `run` fields that are in the online snapshot (hero.score, levels, kills, waves), so a joined
// player's scoreboard matches the host's.
import type { Hero } from '../types';
import { ctx } from '../core/canvas';
import { COLOR, FINAL_WAVE, VIEW_W } from '../core/constants';
import { formatTime } from '../core/math';
import { localHero, run } from '../core/state';
import { runScore } from '../meta/progress';
import { drawPanel, drawPixelText, drawText } from './primitives';

/** The run's score so far (the team's, in co-op). Same formula as the saved high scores. */
export const liveScore = (): number =>
  runScore({ wavesCleared: run.wavesCleared, bossesKilled: run.bossesKilled, kills: run.kills, win: !!run.result?.win });

/** Columns: header, x offset from the panel's left, and how to read a hero. */
const SCORE_COLUMNS: { label: string; x: number; value: (h: Hero) => string }[] = [
  { label: 'Player', x: 34, value: (h) => h.name },
  { label: 'Class', x: 190, value: (h) => h.cls.name },
  { label: 'Lv', x: 330, value: (h) => String(h.player.level) },
  { label: 'Kills', x: 400, value: (h) => groupDigits(h.score.kills) },
  { label: 'Damage', x: 480, value: (h) => shortNumber(h.score.damage) },
  { label: 'Taken', x: 560, value: (h) => shortNumber(h.score.taken) },
  { label: 'Revives', x: 640, value: (h) => String(h.score.revives) },
];
const SCORE_PANEL_W = 680;
const ROW_H = 30;

/** Height of the table for the current party. */
export const scoreboardHeight = (): number => 40 + ROW_H * run.heroes.length;

/** One row per player, top of the table at `y`. Your row is highlighted; in co-op a star marks the top damage dealer. */
export function drawScoreboard(y: number, accent: string): void {
  const heroes = run.heroes, x = VIEW_W / 2 - SCORE_PANEL_W / 2;
  drawPanel(x, y, SCORE_PANEL_W, scoreboardHeight(), COLOR.panel, COLOR.line, 2, accent);
  SCORE_COLUMNS.forEach((c, i) => drawText(c.label, x + c.x, y + 26, 12, COLOR.dim, i < 2 ? 'left' : 'right'));
  const top = heroes.length > 1 ? heroes.reduce((a, b) => (b.score.damage > a.score.damage ? b : a)) : null;
  heroes.forEach((h, row) => {
    const ry = y + 40 + row * ROW_H;
    if (h === localHero()) { ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(x + 6, ry + 2, SCORE_PANEL_W - 12, ROW_H - 4); }
    if (h === top) drawText('★', x + 16, ry + 21, 13, COLOR.gold, 'center');
    const color = h.gone ? COLOR.dim : h.down ? COLOR.red : COLOR.text;
    SCORE_COLUMNS.forEach((c, i) => {
      if (i < 2) drawText(c.value(h) + (i === 0 && h.down ? ' · down' : ''), x + c.x, ry + 21, 14, color);
      else drawPixelText(c.value(h), x + c.x, ry + 21, 15, color, 'right');
    });
  });
}

/** Held Tab during a run: the live scoreboard over the game (the game keeps running). */
export function drawLiveScoreboard(): void {
  const h = scoreboardHeight() + 70, y = Math.max(70, 270 - h / 2);
  ctx.fillStyle = 'rgba(10,7,14,0.6)';
  ctx.fillRect(VIEW_W / 2 - SCORE_PANEL_W / 2 - 20, y - 16, SCORE_PANEL_W + 40, h + 20);
  drawPixelText('Score ' + groupDigits(liveScore()), VIEW_W / 2, y + 14, 24, COLOR.gold, 'center');
  const info = 'Wave ' + run.wave + ' / ' + FINAL_WAVE + '  ·  Bosses ' + run.bossesKilled + '  ·  Team kills ' + groupDigits(run.kills) + '  ·  ' + formatTime(run.time);
  drawText(info, VIEW_W / 2, y + 36, 13, COLOR.muted, 'center');
  drawScoreboard(y + 50, COLOR.gold);
}

/** 12345 -> "12,345" (no locale, so every screen shows the same). */
export function groupDigits(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 38210 -> "38.2k"; small numbers stay whole. */
const shortNumber = (n: number): string => (n >= 10000 ? (n / 1000).toFixed(1) + 'k' : groupDigits(n));
