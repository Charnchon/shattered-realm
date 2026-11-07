// ============================================================ canvas
import { VIEW_H, VIEW_W } from './constants';

function getCanvas(): HTMLCanvasElement {
  const el = document.getElementById('game');
  if (!el) throw new Error('Missing <canvas id="game">');
  return el as HTMLCanvasElement;
}

function get2dContext(el: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = el.getContext('2d');
  if (!context) throw new Error('2D canvas is not supported');
  return context;
}

export const canvas = getCanvas();
export const ctx = get2dContext(canvas);

/** How the logical VIEW_W x VIEW_H view maps onto the window (letterboxed). */
export const viewport = { scale: 1, offsetX: 0, offsetY: 0, pixelRatio: 1 };

function resizeCanvas(): void {
  viewport.pixelRatio = window.devicePixelRatio || 1;
  const ww = window.innerWidth, wh = window.innerHeight;
  viewport.scale = Math.min(ww / VIEW_W, wh / VIEW_H);
  canvas.width = Math.round(ww * viewport.pixelRatio);
  canvas.height = Math.round(wh * viewport.pixelRatio);
  canvas.style.width = ww + 'px';
  canvas.style.height = wh + 'px';
  viewport.offsetX = (ww - VIEW_W * viewport.scale) / 2;
  viewport.offsetY = (wh - VIEW_H * viewport.scale) / 2;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();
