// ============================================================ local controls: keyboard + mouse -> HeroInput
import type { HeroInput, Point } from '../types';
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
