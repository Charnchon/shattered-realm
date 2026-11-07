// ============================================================ main loop, scenes, boot
import type { Rect, SceneId } from '../types';
import { canvas, ctx, viewport } from '../core/canvas';
import { ARENA_H, ARENA_W, SCENE, VIEW_H, VIEW_W } from '../core/constants';
import { clearFrameInput, keysPressed, mouse, mouseIn } from '../core/input';
import { clamp, dist, randInt, randPick } from '../core/math';
import { DEBUG, hasRun, menuSelection, recalcStats, run, scene, setMenuSelection, setScene } from '../core/state';
import { CLASSES, CLASS_ORDER } from '../classes/registry';
import { applyPick, makeOffer, tryReroll } from '../progression/cards';
import { drawHUD } from '../render/hud';
import { drawLevelUp, drawMenu, drawPause, drawResult, levelCardRects, menuCardRects, pauseButtons, rerollButtonRect, resultButtons } from '../render/screens';
import { drawWorld } from '../render/world';
import { hurtPlayerOverTime } from '../world/combat';
import { updateEffects } from '../world/effects';
import { spawnEnemy, updateEnemies } from '../world/enemies';
import { updatePickups } from '../world/pickups';
import { updatePlayer } from '../world/player';
import { updateShots } from '../world/projectiles';
import { updateWave } from '../world/waves';
import { updateZones } from '../world/zones';
import { botThink } from './bot';
import { newRun } from './run';

const MAX_FRAME_DT = 0.05;
const MENU_KEYS = ['1', '2', '3', '4'];
const OFFER_KEYS = ['1', '2', '3'];

/** Advance the simulation by `dt` seconds (play scene only). */
export function step(dt: number): void {
  if (DEBUG.bot) botThink(dt);
  run.time += dt;
  updatePlayer(dt);
  if (scene !== SCENE.PLAY) return;
  run.cls.update(dt);
  updateEnemies(dt);
  updateShots(dt);
  updateZones(dt);
  updatePickups(dt);
  if (scene !== SCENE.PLAY) return; // the run may have ended this frame
  updateWave(dt);
  updateEffects(dt);
  if (run.safeZone && dist(run.player, run.safeZone) > run.safeZone.r) hurtPlayerOverTime(10 * dt);
  run.enemies = run.enemies.filter((e) => !e.dead);
  if (run.banner) {
    run.banner.time -= dt;
    if (run.banner.time <= 0) run.banner = null;
  }
  run.shake = Math.max(0, run.shake - dt * 20);
  updateCamera();
  if (run.pendingLevelUps > 0 && scene === SCENE.PLAY) {
    recalcStats();
    makeOffer();
    setScene(SCENE.LEVEL_UP);
  }
}

function updateCamera(): void {
  run.camera.x = clamp(run.player.x - VIEW_W / 2, -40, ARENA_W - VIEW_W + 40);
  run.camera.y = clamp(run.player.y - VIEW_H / 2, -40, ARENA_H - VIEW_H + 40);
}

/** Index of the rect under the mouse, or -1. */
const hoveredIndex = (rects: Rect[]): number => rects.findIndex((r) => mouseIn(r));

const SCENE_UPDATE: Record<SceneId, (dt: number) => void> = {
  menu() {
    const rects = menuCardRects(), hovered = hoveredIndex(rects), count = CLASS_ORDER.length;
    if (hovered >= 0) setMenuSelection(hovered);
    if (mouse.leftPressed && hovered >= 0) newRun(CLASS_ORDER[hovered]);
    MENU_KEYS.forEach((k, i) => { if (keysPressed[k]) newRun(CLASS_ORDER[i]); });
    if (keysPressed.arrowright || keysPressed.d) setMenuSelection((menuSelection + 1) % count);
    if (keysPressed.arrowleft || keysPressed.a) setMenuSelection((menuSelection + count - 1) % count);
    if (keysPressed.enter || keysPressed.space) newRun(CLASS_ORDER[menuSelection]);
    if (keysPressed.g) DEBUG.god = !DEBUG.god;
  },
  play(dt) {
    if (keysPressed.escape || keysPressed.p) setScene(SCENE.PAUSE);
    else step(dt);
  },
  pause() {
    if (keysPressed.escape || keysPressed.p) setScene(SCENE.PLAY);
    const b = pauseButtons();
    if (mouse.leftPressed && mouseIn(b.resume)) setScene(SCENE.PLAY);
    if (mouse.leftPressed && mouseIn(b.quit)) setScene(SCENE.MENU);
  },
  levelup() {
    const offer = run.offer;
    if (!offer) return;
    offer.hover = hoveredIndex(levelCardRects());
    let chosen = mouse.leftPressed ? offer.hover : -1;
    OFFER_KEYS.forEach((k, i) => { if (keysPressed[k]) chosen = i; });
    if (DEBUG.bot) chosen = randInt(0, offer.items.length - 1);
    if (chosen >= 0 && offer.items[chosen]) applyPick(offer.items[chosen]);
    else if (keysPressed.r || (mouse.leftPressed && mouseIn(rerollButtonRect()))) tryReroll();
  },
  result() {
    const b = resultButtons();
    if ((mouse.leftPressed && mouseIn(b.again)) || keysPressed.enter) newRun(run.classId);
    else if ((mouse.leftPressed && mouseIn(b.menu)) || keysPressed.escape) setScene(SCENE.MENU);
  },
};

export function update(dt: number): void {
  SCENE_UPDATE[scene](dt);
  clearFrameInput();
}

export function render(): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#07050a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const { scale, offsetX, offsetY, pixelRatio } = viewport;
  ctx.setTransform(pixelRatio * scale, 0, 0, pixelRatio * scale, pixelRatio * offsetX, pixelRatio * offsetY);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, VIEW_W, VIEW_H);
  ctx.clip();
  if (scene === SCENE.MENU || !hasRun()) drawMenu();
  else {
    drawWorld();
    drawHUD();
    if (scene === SCENE.LEVEL_UP) drawLevelUp();
    if (scene === SCENE.PAUSE) drawPause();
    if (scene === SCENE.RESULT) drawResult();
  }
  ctx.restore();
}

// ------------------------------------------------------------ boot

let lastFrameTime = performance.now();
function frame(now: number): void {
  const dt = Math.min(MAX_FRAME_DT, (now - lastFrameTime) / 1000);
  lastFrameTime = now;
  try {
    update(dt);
    render();
  } catch (err) {
    console.error(err);
  }
  requestAnimationFrame(frame);
}

export function boot(): void {
  requestAnimationFrame(frame);
  if (document.fonts && document.fonts.load) {
    document.fonts.load('16px "Pixelify Sans"').catch(() => {});
    document.fonts.load('16px Rubik').catch(() => {});
  }
  installTestHooks();
}

// ------------------------------------------------------------ debug and test hooks (harmless in normal play)

declare global {
  interface Window {
    __SR: unknown;
  }
}

function installTestHooks(): void {
  window.__SR = {
    DEBUG, CLASSES, newRun, step, update, render, makeOffer, applyPick, spawnEnemy,
    get run() { return run; },
    /** @deprecated alias of `run`, kept for older test scripts. */
    get G() { return run; },
    get scene() { return scene; },
    set scene(v: SceneId) { setScene(v); },
    /** Fast-forward `seconds` of play, picking random cards. Returns a summary. */
    simulate(seconds: number) {
      const dt = 1 / 60;
      let t = 0;
      while (t < seconds) {
        if (scene === SCENE.LEVEL_UP && run.offer) { applyPick(randPick(run.offer.items)); continue; }
        if (scene !== SCENE.PLAY) break;
        step(dt);
        t += dt;
      }
      return {
        scene, wave: run.wave, lvl: run.player.level, hp: Math.round(run.player.hp), kills: run.kills,
        cards: Object.keys(run.cards).map((id) => id + ':' + run.cards[id].level + (run.cards[id].evolved ? '*' : '')),
        enemies: run.enemies.length,
      };
    },
  };
}
