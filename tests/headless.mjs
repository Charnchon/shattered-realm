// Runs the built game.js headless in Node: a stub canvas/DOM and a seeded Math.random,
// so runs are fast and fully reproducible. Used by game.test.mjs.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const GAME_JS = path.join(ROOT, 'game.js');

/** A 2D context that accepts every call and records how many draw calls were made. */
function stubContext(counter) {
  const known = {
    measureText: (s) => ({ width: String(s).length * 7 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    drawImage: (...args) => { counter.drawCalls++; counter.images.push(args.slice(1, 5)); },
  };
  return new Proxy(known, {
    get: (target, key) => (key in target ? target[key] : () => { counter.drawCalls++; }),
    set: () => true,
  });
}

/** Seeded PRNG (mulberry32), installed as Math.random inside the sandbox. */
const SEEDED_RANDOM = (seed) => `(() => {
  let a = ${seed | 0};
  Math.random = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();`;

/** An Image stand-in that "loads" as soon as its src is set (for testing sprite drawing). */
class FakeImage {
  set src(value) { this._src = value; if (this.onload) this.onload(); }
  get src() { return this._src; }
}

/**
 * A localStorage stand-in backed by a plain object (`data`), so tests can read, preload and share saves.
 * Two games given the same storage behave like two tabs of one browser.
 */
export function fakeStorage(data = {}) {
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}

/**
 * Load a fresh game instance. Returns the window.__SR test API plus helpers.
 * `images: true` gives the sandbox a fake Image, so sprites draw instead of falling back to circles.
 * `storage` (from `fakeStorage`) gives it a localStorage; without one, progress lives in memory.
 */
export function loadGame({ seed = 1, images = false, storage = null } = {}) {
  const counter = { drawCalls: 0, images: [] };
  const canvas = { getContext: () => stubContext(counter), addEventListener() {}, style: {}, width: 0, height: 0 };
  const sandbox = {
    console,
    performance: { now: () => 0 },
    requestAnimationFrame: () => 0,
    setTimeout: () => 0,
    clearTimeout: () => {},
    ...(images ? { Image: FakeImage } : {}),
    ...(storage ? { localStorage: storage } : {}),
    document: { getElementById: () => canvas },
    window: { addEventListener() {}, innerWidth: 960, innerHeight: 540, devicePixelRatio: 1 },
  };
  vm.createContext(sandbox);
  vm.runInContext(SEEDED_RANDOM(seed), sandbox);
  vm.runInContext(fs.readFileSync(GAME_JS, 'utf8'), sandbox, { filename: 'game.js' });
  const sr = sandbox.window.__SR;
  const randomIndex = vm.runInContext('(n) => Math.floor(Math.random() * n)', sandbox);
  return { sr, counter, randomIndex };
}

/**
 * Co-op: one bot-played hero per class id, in god mode, everyone picking random cards.
 * Calls `onFrame(run)` after each simulated frame.
 */
export function playCoopWithBots(game, classIds, seconds, { onFrame, onLevelUp, renderEvery = 30 } = {}) {
  const { sr } = game;
  sr.DEBUG.god = true;
  sr.newRunWith(classIds.map((classId, i) => ({ classId, name: 'Bot ' + (i + 1), bot: true })), 0);
  const dt = 1 / 60;
  let t = 0, frame = 0;
  while (t < seconds) {
    if (sr.scene === 'levelup') {
      sr.render();
      if (onLevelUp) onLevelUp(sr.run);
      sr.pickRandomForEveryone();
      continue;
    }
    if (sr.scene !== 'play') break;
    sr.step(dt);
    t += dt;
    frame++;
    if (onFrame) onFrame(sr.run);
    if (frame % renderEvery === 0) sr.render();
  }
  return sr.run;
}

/**
 * Play `seconds` with the test bot in god mode, picking random level-up cards.
 * Calls `onFrame(run)` after each simulated frame and renders every `renderEvery` frames.
 */
export function playWithBot(game, classId, seconds, { onFrame, onOffer, renderEvery = 30 } = {}) {
  const { sr, randomIndex } = game;
  sr.DEBUG.god = true;
  sr.DEBUG.bot = true;
  sr.newRun(classId);
  const dt = 1 / 60;
  let t = 0, frame = 0;
  while (t < seconds) {
    if (sr.scene === 'levelup') {
      sr.render();
      if (onOffer) onOffer(sr.run.offer);
      const items = sr.run.offer.items;
      sr.applyPick(items[randomIndex(items.length)]);
      continue;
    }
    if (sr.scene !== 'play') break;
    sr.step(dt);
    t += dt;
    frame++;
    if (onFrame) onFrame(sr.run);
    if (frame % renderEvery === 0) sr.render();
  }
  return sr.run;
}
