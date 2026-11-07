// ============================================================ client-side prediction (joined players)
// Without this, a joined player's hero only moves once their input has travelled to the host and the
// host's snapshot has travelled back. Instead, the joiner's screen moves their own hero immediately,
// with the same movement code the host uses, and remembers where it put the hero for each input.
// When a snapshot says "the host has applied your input #n and you are at S", the difference between
// S and our guess for #n is the prediction error: we shift our hero by it (and replay nothing, since
// later inputs were already applied on top). The visible correction is blended out over ~0.1 s.
import type { Hero, HeroInput } from '../types';
import { withHero } from '../core/state';
import { dashDirection, moveHero, startDash, type Motion } from '../world/player';

/** Errors bigger than this are teleports (revive, a new run, a lunge): jump instead of blending. */
const SNAP_DISTANCE = 160;
/** Blend-out rate for corrections: the remaining offset after one second. */
const CORRECTION_DECAY = 0.0005;
/** Don't predict a second dash before the host has confirmed the first used a charge. */
const DASH_LOCK = 0.3;
const MAX_HISTORY = 240;

interface Predicted { seq: number; x: number; y: number }

const state = {
  active: false,
  seq: 0,
  motion: { x: 0, y: 0, r: 12, dashTime: 0, dashVx: 0, dashVy: 0 } as Motion,
  history: [] as Predicted[],
  /** Visual offset still to blend out after a correction. */
  offsetX: 0,
  offsetY: 0,
  dashLock: 0,
};

/** Forget everything (left the game, new run, knocked out). */
export function resetPrediction(): void {
  state.active = false;
  state.history = [];
  state.offsetX = state.offsetY = 0;
  state.dashLock = 0;
}

/** Number for the next input message, so the host can tell us which one it has applied. */
export const nextInputSeq = (): number => ++state.seq;

/** Move our own hero for one frame of `input` (already sent to the host as input number `seq`). */
export function predictLocalHero(me: Hero, input: HeroInput, seq: number, dt: number): void {
  if (me.down) { resetPrediction(); return; }
  const m = state.motion;
  if (!state.active) {
    Object.assign(m, { x: me.player.x, y: me.player.y, r: me.player.r, dashTime: 0, dashVx: 0, dashVy: 0 });
    state.active = true;
  }
  state.dashLock -= dt;
  if (input.dash && m.dashTime <= 0 && state.dashLock <= 0 && me.player.dashCharges > 0) {
    const dir = dashDirection(input.moveX, input.moveY, me.player.face);
    // the class's side-effect-free dash shape, run against this screen's copy of the hero
    const shape = me.cls.dashShape ? withHero(me, () => me.cls.dashShape!(dir.x, dir.y)) : null;
    startDash(m, dir.x, dir.y, shape);
    state.dashLock = DASH_LOCK;
  }
  moveHero(m, input.moveX, input.moveY, me.stats.moveSpeed, dt);
  state.history.push({ seq, x: m.x, y: m.y });
  if (state.history.length > MAX_HISTORY) state.history.shift();
}

/** A snapshot arrived: compare the host's position for our latest applied input with our guess. */
export function reconcile(me: Hero): void {
  if (!state.active) return;
  if (me.down) { resetPrediction(); return; }
  const ack = me.ack ?? 0;
  let guess: Predicted | undefined;
  while (state.history.length && state.history[0].seq <= ack) guess = state.history.shift();
  if (!guess) return; // the host hasn't applied any input we still remember: nothing to compare yet
  const ex = me.player.x - guess.x, ey = me.player.y - guess.y;
  if (Math.hypot(ex, ey) > SNAP_DISTANCE) {
    // too far off to blend: start again from the host's position
    resetPrediction();
    return;
  }
  // shift our current position (and the guesses still in flight) by the error...
  state.motion.x += ex;
  state.motion.y += ey;
  for (const h of state.history) { h.x += ex; h.y += ey; }
  // ...but keep drawing the hero where it was, and slide it over smoothly
  state.offsetX -= ex;
  state.offsetY -= ey;
}

/** Put our hero where this screen thinks it is. Call every frame and after each snapshot. */
export function placeLocalHero(me: Hero, dt: number): void {
  if (!state.active) return;
  const keep = Math.pow(CORRECTION_DECAY, dt);
  state.offsetX *= keep;
  state.offsetY *= keep;
  me.player.x = state.motion.x + state.offsetX;
  me.player.y = state.motion.y + state.offsetY;
}

/** True while this screen is moving its own hero ahead of the host. */
export const isPredicting = (): boolean => state.active;
