// ============================================================ local controls: keyboard + mouse -> HeroInput
import type { HeroInput, Offer, Point } from '../types';
import { keysDown, keysPressed, mouse } from '../core/input';

/** Read this computer's keyboard and mouse. `camera` turns the mouse into a world-space aim point. */
export function readLocalInput(camera: Point): HeroInput {
  const right = keysDown.d || keysDown.arrowright, left = keysDown.a || keysDown.arrowleft;
  const down = keysDown.s || keysDown.arrowdown, up = keysDown.w || keysDown.arrowup;
  return {
    moveX: (right ? 1 : 0) - (left ? 1 : 0),
    moveY: (down ? 1 : 0) - (up ? 1 : 0),
    aimX: mouse.x + camera.x,
    aimY: mouse.y + camera.y,
    fire: mouse.left,
    heavy: mouse.right || mouse.rightPressed,
    dash: !!(keysPressed.space || keysPressed.shift),
    ult: !!keysPressed.q,
  };
}

/**
 * Merge a new frame of input into a hero's input. One-shot presses stay set until the
 * simulation uses them, so a press that arrives between steps is never lost.
 */
export function applyInput(target: HeroInput, next: HeroInput): void {
  const dash = target.dash || next.dash, ult = target.ult || next.ult;
  Object.assign(target, next);
  target.dash = dash;
  target.ult = ult;
}

// ------------------------------------------------------------ level-up pick guard

/** Seconds a new card offer ignores clicks and keys, so a click meant as an attack can't pick a card unread. */
export const OFFER_PICK_DELAY = 0.35;

/** Identifies an offer by its contents (the same offer arrives as a new object in every online snapshot). */
export const offerKey = (offer: Offer): string => offer.items.map((i) => i.kind + ':' + i.def.id + ':' + i.rarity).join('|');

let guardKey = '';
let guardAge = 0;

/**
 * Call once per frame on the level-up screen. Returns true once this screen has shown the
 * current offer for `OFFER_PICK_DELAY`; a new offer (next level, reroll) starts the wait again.
 */
export function offerReady(offer: Offer, dt: number): boolean {
  const key = offerKey(offer);
  if (key !== guardKey) { guardKey = key; guardAge = 0; } else guardAge += dt;
  return guardAge >= OFFER_PICK_DELAY;
}

/** Leaving the level-up screen: the next offer waits again even if it happens to hold the same cards. */
export function forgetOffer(): void { guardKey = ''; guardAge = 0; }

/** 0 → 1 as the current offer becomes pickable (the cards fade in over the wait). */
export const offerFadeIn = (): number => Math.min(1, guardAge / OFFER_PICK_DELAY);
