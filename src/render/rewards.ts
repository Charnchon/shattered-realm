// ============================================================ rewards reel (result screen) and class levels
// What the run paid this screen's player: gold counting up, the class EXP bar filling (with level-ups),
// unlocks, and the next goal. Each screen shows its own player's rewards, online too (see recordRun).
import { ctx } from '../core/canvas';
import { COLOR, VIEW_W } from '../core/constants';
import { clamp } from '../core/math';
import { CLASSES, CLASS_ORDER } from '../classes/registry';
import {
  SPECIALIST_MAX_LEVEL, classExp, getProgress, isClassUnlocked, lastRewards, lastUnlocked, specialistLevel, unlockText,
  type LootResult,
} from '../meta/progress';
import { accessoryDef } from '../meta/accessories';
import { RARITY_COLOR, accessoryLabel } from './gear';
import { monsterName, slayerTitle } from './codex';
import type { Completion } from '../meta/goals';
import { drawBar, drawPanel, drawPixelText, drawText } from './primitives';
import { groupDigits } from './scoreboard';

/** Reel timing in seconds: gold counts up, then the EXP bar fills, then the next goal appears. */
const GOLD_TIME = 0.8, EXP_START = 0.6, EXP_TIME = 1.4, LOOT_AT = 2.0, GOALS_AT = 2.3, GOAL_AT = 2.9;
const REEL_DONE = GOAL_AT + 0.3;
const PANEL_H = 128, LOOT_H = 24, LINE_H = 18;
/** Completed goals listed on the panel (more are summarised as "and N more"). */
const MAX_LINES = 3;
const shownLines = (): number => Math.min(MAX_LINES, (lastRewards?.completions.length ?? 0) + (lastRewards?.mapNews.length ?? 0));
/** Taller when the final boss dropped something, and for each goal completed. */
export const rewardsPanelHeight = (): number => PANEL_H + (lastRewards?.loot ? LOOT_H : 0) + LINE_H * shownLines();

/** Seconds the result screen has been showing (a click or Space skips to the end). */
let reelAge = 0;

/** Called every frame: runs the reel on the result screen and resets it everywhere else. */
export function advanceRewardsReel(dt: number, onResultScreen: boolean, skip: boolean): void {
  if (!onResultScreen) { reelAge = 0; return; }
  reelAge = skip ? Math.max(reelAge, REEL_DONE) : reelAge + dt;
}

const easeOut = (t: number): number => 1 - (1 - t) ** 3;

/** The rewards panel, top at `y`, the same width as the scoreboard. */
export function drawRewards(y: number): void {
  const r = lastRewards, w = 680, x = VIEW_W / 2 - w / 2;
  if (!r) return;
  const h = rewardsPanelHeight();
  drawPanel(x, y, w, h, COLOR.panel, COLOR.line, 2, COLOR.gold);
  const goldT = easeOut(clamp(reelAge / GOLD_TIME, 0, 1));
  const expT = easeOut(clamp((reelAge - EXP_START) / EXP_TIME, 0, 1));

  // gold
  drawText('Gold', x + 24, y + 26, 12, COLOR.dim);
  drawPixelText('+' + groupDigits(r.gold * goldT), x + 24, y + 60, 30, COLOR.gold);
  // the total includes bounty, milestone and loot gold once the reel has shown them
  const totalGold = reelAge >= GOAL_AT ? getProgress().gold : r.goldBefore + r.gold * goldT;
  const total = r.saved ? 'Total ' + groupDigits(totalGold) : 'Test mode: rewards are not saved';
  drawText(total + (r.coopBonus ? '  ·  co-op +10%' : ''), x + 24, y + 82, 12, r.saved ? COLOR.muted : COLOR.ember);

  // class EXP: the bar animates through every level gained
  const gained = r.exp + r.bonusExp, cls = CLASSES[r.classId], before = specialistLevel(r.expBefore), now = specialistLevel(r.expBefore + gained * expT);
  const ex = x + 330, bw = w - 330 - 24;
  drawText((cls?.name ?? r.classId) + ' · Specialist', ex, y + 26, 12, COLOR.dim);
  drawPixelText('Lv ' + now.level + (now.level >= SPECIALIST_MAX_LEVEL ? ' (max)' : ''), ex, y + 52, 22, COLOR.text);
  if (now.level > before.level) drawPixelText('Level up!', ex + bw, y + 52, 18, COLOR.gold, 'right');
  drawBar(ex, y + 62, bw, 10, now.need ? now.into / now.need : 1, COLOR.teal, COLOR.barBg);
  const expText = now.need ? groupDigits(now.into) + ' / ' + groupDigits(now.need) + ' EXP' : 'Max level';
  drawText(expText + '   (+' + groupDigits(gained * expT) + ')', ex, y + 88, 12, COLOR.muted);

  // unlocks and the next goal
  if (reelAge >= GOAL_AT) {
    ctx.globalAlpha = clamp((reelAge - GOAL_AT) / 0.3, 0, 1);
    const line = lastUnlocked.length
      ? 'New class unlocked: ' + lastUnlocked.map((id) => CLASSES[id]?.name ?? id).join(' and ') + '!'
      : nextGoal(r.classId);
    drawText(line, VIEW_W / 2, y + h - 14, 13, COLOR.gold, 'center');
    ctx.globalAlpha = 1;
  }
  let ly = y + 112;
  if (r.loot) { if (reelAge >= LOOT_AT) drawLoot(r.loot, x + 24, ly); ly += LOOT_H; }
  drawCompletions([...r.mapNews.map((text): Line => ({ kind: 'map', text })), ...r.completions], x + 24, ly);
}

/** Bounties, milestones and Slayer tiers finished this run, one line each, appearing one after another. */
/** A reel line: a finished goal, or map news (a new map, a level, mastery). */
type Line = Completion | { kind: 'map'; text: string };

function drawCompletions(list: Line[], x: number, y: number): void {
  list.slice(0, MAX_LINES).forEach((c, i) => {
    const at = GOALS_AT + i * 0.2;
    if (reelAge < at) return;
    ctx.globalAlpha = clamp((reelAge - at) / 0.25, 0, 1);
    const more = i === MAX_LINES - 1 && list.length > MAX_LINES ? '   (and ' + (list.length - MAX_LINES) + ' more)' : '';
    const text = c.kind === 'map' ? '🗺 ' + c.text : completionText(c);
    drawText(text + more, x, y + i * LINE_H, 12, c.kind === 'slayer' || c.kind === 'map' ? COLOR.teal : COLOR.gold);
    ctx.globalAlpha = 1;
  });
}

/** One line of the reel for a finished goal. */
export function completionText(c: Completion): string {
  if (c.kind === 'slayer') return '⚔ ' + slayerTitle(c.monster, c.tier) + ': +' + c.tier + '% damage to ' + monsterName(c.monster);
  const pay = [c.gold ? '+' + groupDigits(c.gold) + ' gold' : '', c.kind === 'milestone' && c.exp ? '+' + c.exp + ' EXP' : ''].filter(Boolean).join(', ');
  return (c.kind === 'bounty' ? '✓ Bounty: ' : '★ ') + c.text + '  ' + pay;
}

/** The final boss's drop, after the EXP bar. */
function drawLoot(loot: LootResult, x: number, y: number): void {
  const def = accessoryDef(loot.id);
  if (!def) return;
  ctx.globalAlpha = clamp((reelAge - LOOT_AT) / 0.3, 0, 1);
  const what = loot.gold ? 'already at max level: +' + groupDigits(loot.gold) + ' gold'
    : loot.isNew ? 'new! Wear it from class select (E)' : 'duplicate: upgraded to Lv ' + loot.level;
  drawPixelText('Loot: ' + accessoryLabel(def.id, loot.level), x, y, 18, RARITY_COLOR[def.rarity]);
  drawText(def.rarity + ' · ' + what, x + 300, y, 12, COLOR.muted);
  ctx.globalAlpha = 1;
}

/** The closest goal to show after a run: the next class level, or how to unlock a locked class. */
export function nextGoal(classId: string): string {
  const lvl = specialistLevel(classExp(classId)), name = CLASSES[classId]?.name ?? classId;
  const levelGoal = lvl.need ? 'Next: ' + name + ' Lv ' + (lvl.level + 1) + ' in ' + groupDigits(lvl.need - lvl.into) + ' EXP' : '';
  const locked = CLASS_ORDER.find((id) => !isClassUnlocked(id));
  const unlockGoal = locked ? 'Locked: ' + CLASSES[locked].name + ' · ' + unlockText(locked) : '';
  return [levelGoal, unlockGoal].filter(Boolean).join('   ·   ') || 'Every class maxed. Legend.';
}

/** "Lv 3" on a class tile (nothing for a locked class). */
export function drawClassLevelBadge(classId: string, x: number, y: number): void {
  if (!isClassUnlocked(classId)) return;
  drawPixelText('Lv ' + specialistLevel(classExp(classId)).level, x, y, 12, COLOR.teal, 'right');
}

/** The selected class's Specialist level and EXP bar (class select detail panel). */
export function drawClassLevel(classId: string, x: number, y: number, w: number): void {
  const lvl = specialistLevel(classExp(classId));
  drawText('Specialist Lv ' + lvl.level + (lvl.need ? '' : ' (max)'), x, y, 12, COLOR.teal);
  if (lvl.need) drawText(groupDigits(lvl.into) + ' / ' + groupDigits(lvl.need) + ' EXP', x + w, y, 11, COLOR.dim, 'right');
  drawBar(x, y + 6, w, 6, lvl.need ? lvl.into / lvl.need : 1, COLOR.teal, COLOR.barBg);
}

/** Account gold, for the class select screen. */
export const goldText = (): string => 'Gold ' + groupDigits(getProgress().gold);
