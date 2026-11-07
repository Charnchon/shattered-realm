// ============================================================ input
import type { Rect } from '../types';
import { canvas, viewport } from './canvas';
import { VIEW_H, VIEW_W } from './constants';

/** Keys currently held, by normalised name ('w', 'space', 'arrowleft', ...). */
export const keysDown: Record<string, boolean> = {};
/** Keys that went down this frame. Cleared at the end of every update. */
export const keysPressed: Record<string, boolean> = {};

/** Mouse position in view coordinates, plus held / pressed-this-frame buttons. */
export const mouse = { x: VIEW_W / 2, y: VIEW_H / 2, left: false, right: false, leftPressed: false, rightPressed: false };

const MOUSE_LEFT = 0;
const MOUSE_RIGHT = 2;
const SCROLL_KEYS = ['space', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab'];

function keyName(e: KeyboardEvent): string {
  return e.key === ' ' ? 'space' : e.key.toLowerCase();
}

function setMouseFromEvent(e: MouseEvent): void {
  mouse.x = (e.clientX - viewport.offsetX) / viewport.scale;
  mouse.y = (e.clientY - viewport.offsetY) / viewport.scale;
}

/** True when the mouse is inside the rect (view coordinates). */
export function mouseIn(rect: Rect): boolean {
  return mouse.x >= rect.x && mouse.x <= rect.x + rect.w && mouse.y >= rect.y && mouse.y <= rect.y + rect.h;
}

/** Forget this frame's one-shot presses. */
export function clearFrameInput(): void {
  for (const k in keysPressed) delete keysPressed[k];
  mouse.leftPressed = mouse.rightPressed = false;
}

window.addEventListener('keydown', (e) => {
  const k = keyName(e);
  if (!keysDown[k]) keysPressed[k] = true;
  keysDown[k] = true;
  if (SCROLL_KEYS.includes(k)) e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  keysDown[keyName(e)] = false;
});
window.addEventListener('blur', () => {
  for (const k in keysDown) keysDown[k] = false;
  mouse.left = mouse.right = false;
});

canvas.addEventListener('mousemove', setMouseFromEvent);
canvas.addEventListener('mousedown', (e) => {
  setMouseFromEvent(e);
  if (e.button === MOUSE_LEFT) { mouse.left = true; mouse.leftPressed = true; }
  if (e.button === MOUSE_RIGHT) { mouse.right = true; mouse.rightPressed = true; }
});
window.addEventListener('mouseup', (e) => {
  if (e.button === MOUSE_LEFT) mouse.left = false;
  if (e.button === MOUSE_RIGHT) mouse.right = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
