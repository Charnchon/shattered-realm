// ============================================================ drawing primitives (view space)
import type { Rect } from '../types';
import { ctx } from '../core/canvas';
import { COLOR, FONT_BODY, FONT_PIXEL } from '../core/constants';
import { mouseIn } from '../core/input';
import { clamp } from '../core/math';

/** Draw one line of text. `weight` is a CSS font weight such as '700'. */
export function drawText(text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left', font: string = FONT_BODY, weight = ''): void {
  ctx.font = weight + ' ' + size + 'px ' + font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
}

/** Below this size, pixel text is hard to read, so it is drawn in the body font (bold) instead. */
const SMALL_TEXT = 12;

/**
 * Display text: titles, numbers, labels. Big text uses the pixel font; small text (tags, name
 * plates, tiny numbers) uses the body font in extra-bold, which stays readable at 9-12 px.
 */
export function drawPixelText(text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left'): void {
  if (size <= SMALL_TEXT) drawText(text, x, y, size, color, align, FONT_BODY, '800');
  else drawText(text, x, y, size, color, align, FONT_PIXEL, '400');
}

/** Word-wrap `text` to `maxWidth`. Returns the y of the last line drawn. */
export function drawWrappedText(text: string, x: number, y: number, maxWidth: number, lineHeight: number, size: number, color: string, align: CanvasTextAlign = 'left', font: string = FONT_BODY): number {
  ctx.font = size + 'px ' + font;
  const words = text.split(' ');
  let line = '', lineY = y;
  for (const word of words) {
    const candidate = line ? line + ' ' + word : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      drawText(line, x, lineY, size, color, align, font);
      line = word;
      lineY += lineHeight;
    } else {
      line = candidate;
    }
  }
  if (line) drawText(line, x, lineY, size, color, align, font);
  return lineY;
}

/** Filled box with optional inset border and a 4px accent strip on top. */
export function drawPanel(x: number, y: number, w: number, h: number, fill: string, stroke?: string | null, lineWidth = 2, accent: string | null = null): void {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(x + lineWidth / 2, y + lineWidth / 2, w - lineWidth, h - lineWidth);
  }
  if (accent) {
    ctx.fillStyle = accent;
    ctx.fillRect(x, y, w, 4);
  }
}

/** Horizontal meter filled to `frac` (0-1). */
export function drawBar(x: number, y: number, w: number, h: number, frac: number, color: string, bg: string = COLOR.line): void {
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
}

/** Diamond path centred on (x, y) with half-size `s`. Caller fills / strokes. */
export function diamondPath(x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.lineTo(x + s, y);
  ctx.lineTo(x, y + s);
  ctx.lineTo(x - s, y);
  ctx.closePath();
}

export function drawDiamond(x: number, y: number, s: number, fill: string | null, stroke: string | null): void {
  diamondPath(x, y, s);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
}

export function drawDashedRect(x: number, y: number, w: number, h: number, dash: number[], color: string, lineWidth: number): void {
  ctx.setLineDash(dash);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
}

/** Button: panel that lights up on hover, with a centred label. */
export function drawButton(rect: Rect, label: string, color: string, labelColor: string = color): void {
  drawPanel(rect.x, rect.y, rect.w, rect.h, mouseIn(rect) ? COLOR.panelHover : COLOR.panel, color, 2);
  drawCenteredLabel(label, rect, 16, labelColor);
}

/**
 * Pixel text centred in `rect` both ways. The baseline comes from the label's measured ink
 * (ascent and descent), so every button lines up without hand-tuned offsets.
 */
export function drawCenteredLabel(label: string, rect: Rect, size: number, color: string): void {
  drawPixelText('', 0, 0, size, color); // sets the font that drawPixelText will use, for measuring
  const m = ctx.measureText(label);
  const ascent = m.actualBoundingBoxAscent ?? size * 0.7, descent = m.actualBoundingBoxDescent ?? 0;
  drawPixelText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + (ascent - descent) / 2, size, color, 'center');
}
