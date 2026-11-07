// ============================================================ main loop, scenes, boot
import type { Hero, Rect, SceneId } from '../types';
import { canvas, ctx, viewport } from '../core/canvas';
import { SCENE, VIEW_H, VIEW_W } from '../core/constants';
import { clearFrameInput, keysDown, keysPressed, mouse, mouseIn } from '../core/input';
import { dist, randPick } from '../core/math';
import { DEBUG, hasRun, livingHeroes, localHero, menuSelection, run, scene, setMenuSelection, setScene, updateCamera, withHero } from '../core/state';
import { CLASSES, CLASS_ORDER } from '../classes/registry';
import { applyPick, makeOffer, offerPendingLevelUps, tryReroll } from '../progression/cards';
import { drawHUD } from '../render/hud';
import {
  drawJoin, drawLevelUp, drawLobby, drawMenu, drawOnlineMenu, drawPause, drawResult, levelCardRects, menuCardRects, menuOnlineButtons,
  pauseButtons, rerollButtonRect, resultButtons,
} from '../render/screens';
import {
  acceptConnection, connectToHost, hostGame, joinFromUrl, leaveOnline, net, netTick, pasteIntoJoin, startOnlineGame,
  updateClientScene, updateHostResult, updateJoin, updateLobby, updateOnlineMenu,
} from '../net/session';
import { encodeSnapshot } from '../net/snapshot';
import { drawWorld } from '../render/world';
import { hurtHero, hurtHeroOverTime, reviveHero } from '../world/combat';
import { updateEffects } from '../world/effects';
import { spawnEnemy, updateEnemies } from '../world/enemies';
import { updatePickups } from '../world/pickups';
import { updatePlayer } from '../world/player';
import { updateShots } from '../world/projectiles';
import { updateWave } from '../world/waves';
import { updateZones } from '../world/zones';
import { botThink } from './bot';
import { applyInput, readLocalInput } from './controls';
import { newRun, newRunWith } from './run';

const MAX_FRAME_DT = 0.05;
const MENU_KEYS = ['1', '2', '3', '4'];
const OFFER_KEYS = ['1', '2', '3'];

/** Is this hero played by the test bot? */
const isBotControlled = (h: Hero): boolean => h.bot || (DEBUG.bot && h.idx === run.localHero);

/** Advance the simulation by `dt` seconds (play scene only). */
export function step(dt: number): void {
  for (const h of livingHeroes()) if (isBotControlled(h)) botThink(h, dt);
  run.time += dt;
  for (const h of livingHeroes()) withHero(h, () => updatePlayer(dt));
  if (scene !== SCENE.PLAY) return;
  for (const h of livingHeroes()) withHero(h, () => h.cls.update(dt));
  updateEnemies(dt);
  updateShots(dt);
  updateZones(dt);
  updatePickups(dt);
  if (scene !== SCENE.PLAY) return; // the run may have ended this frame
  updateWave(dt);
  updateEffects(dt);
  updateRevives(dt);
  const zone = run.safeZone;
  if (zone) for (const h of livingHeroes()) if (dist(h.player, zone) > zone.r) hurtHeroOverTime(h, 10 * dt);
  if (scene !== SCENE.PLAY) return;
  run.enemies = run.enemies.filter((e) => !e.dead);
  if (run.banner) {
    run.banner.time -= dt;
    if (run.banner.time <= 0) run.banner = null;
  }
  run.shake = Math.max(0, run.shake - dt * 20);
  updateCamera();
  if (offerPendingLevelUps()) setScene(SCENE.LEVEL_UP);
}

const REVIVE_RADIUS = 46;
const REVIVE_SECONDS = 3;
const REVIVE_HP = 0.4;

/** Standing next to a downed teammate revives them after a few seconds. */
function updateRevives(dt: number): void {
  for (const h of run.heroes) {
    if (!h.down || h.gone) continue;
    const helped = livingHeroes().some((o) => dist(o.player, h.player) < REVIVE_RADIUS);
    h.revive = helped ? h.revive + dt / REVIVE_SECONDS : Math.max(0, h.revive - dt / REVIVE_SECONDS);
    if (h.revive >= 1) reviveHero(h, REVIVE_HP);
  }
}

/** Bots (and heroes who left) choose a random card. */
function autoPickForBots(): void {
  for (const h of run.heroes) {
    if (h.offer && (isBotControlled(h) || h.gone)) withHero(h, () => applyPick(randPick(h.offer!.items)));
  }
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
    const online = menuOnlineButtons();
    if (keysPressed.c || (mouse.leftPressed && mouseIn(online.host))) hostGame(CLASS_ORDER[menuSelection]);
    else if (keysPressed.j || (mouse.leftPressed && mouseIn(online.join))) { net.joinText = ''; net.status = ''; net.notice = ''; setScene(SCENE.JOIN); }
  },
  play(dt) {
    const me = localHero();
    if (net.mode === 'host') {
      // online games don't pause: Esc opens a leave panel while the game runs on
      if (updateOnlineMenu()) { applyInput(me.input, { ...me.input, moveX: 0, moveY: 0, fire: false, heavy: false }); step(dt); return; }
    } else if (keysPressed.escape || keysPressed.p) { setScene(SCENE.PAUSE); return; }
    if (!isBotControlled(me)) applyInput(me.input, readLocalInput(run.camera));
    step(dt);
  },
  pause() {
    if (keysPressed.escape || keysPressed.p) setScene(SCENE.PLAY);
    const b = pauseButtons();
    if (mouse.leftPressed && mouseIn(b.resume)) setScene(SCENE.PLAY);
    if (mouse.leftPressed && mouseIn(b.quit)) setScene(SCENE.MENU);
  },
  levelup() {
    autoPickForBots();
    const offer = run.offer; // this screen's hero
    if (!offer) return; // already chosen: waiting for the others
    offer.hover = hoveredIndex(levelCardRects());
    let chosen = mouse.leftPressed ? offer.hover : -1;
    OFFER_KEYS.forEach((k, i) => { if (keysPressed[k]) chosen = i; });
    if (chosen >= 0 && offer.items[chosen]) applyPick(offer.items[chosen]);
    else if (keysPressed.r || (mouse.leftPressed && mouseIn(rerollButtonRect()))) tryReroll();
  },
  lobby() { updateLobby(); },
  join() { updateJoin(CLASS_ORDER[menuSelection]); },
  result() {
    if (net.mode === 'host') { updateHostResult(); return; }
    const b = resultButtons();
    if ((mouse.leftPressed && mouseIn(b.again)) || keysPressed.enter) newRun(run.classId);
    else if ((mouse.leftPressed && mouseIn(b.menu)) || keysPressed.escape) setScene(SCENE.MENU);
  },
};

const GAME_SCENES: SceneId[] = [SCENE.PLAY, SCENE.LEVEL_UP, SCENE.PAUSE, SCENE.RESULT];

export function update(dt: number): void {
  // a joined player never simulates: it sends input and shows the host's snapshots
  if (net.mode === 'client' && GAME_SCENES.includes(scene)) updateClientScene(dt);
  else SCENE_UPDATE[scene](dt);
  netTick(dt);
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
  if (scene === SCENE.LOBBY) drawLobby();
  else if (scene === SCENE.JOIN) drawJoin();
  else if (scene === SCENE.MENU || !hasRun()) drawMenu();
  else {
    drawWorld();
    drawHUD();
    if (scene === SCENE.LEVEL_UP) drawLevelUp();
    if (scene === SCENE.PAUSE) drawPause();
    if (scene === SCENE.RESULT) drawResult();
    if (scene === SCENE.PLAY && net.menuOpen) drawOnlineMenu();
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
  window.addEventListener('paste', (e) => pasteIntoJoin(e.clipboardData?.getData('text') ?? ''));
  installTestHooks();
  joinFromUrl(CLASS_ORDER[menuSelection]);
}

// ------------------------------------------------------------ debug and test hooks (harmless in normal play)

/** Test helper: every hero with an offer picks a random card. */
function pickRandomForEveryone(): void {
  for (const h of run.heroes) if (h.offer) withHero(h, () => applyPick(randPick(h.offer!.items)));
}

declare global {
  interface Window {
    __SR: unknown;
  }
}

function installTestHooks(): void {
  window.__SR = {
    DEBUG, CLASSES, newRun, newRunWith, step, update, render, makeOffer, applyPick, spawnEnemy, pickRandomForEveryone, hurtHero,
    /** Online session (tests connect two game instances in memory). */
    net, hostGame, acceptConnection, connectToHost, startOnlineGame, leaveOnline, encodeSnapshot,
    /** Held / pressed-this-frame keys, so tests can play like a person. */
    keysDown, keysPressed,
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
        if (scene === SCENE.LEVEL_UP) { pickRandomForEveryone(); continue; }
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
