// ============================================================ world rendering (world space)
import type { Boss, BossKind, Enemy, EnemyTypeId, Mob, Player } from '../types';
import { ctx } from '../core/canvas';
import { ARENA_H, ARENA_W, COLOR, TAU, VIEW_H, VIEW_W } from '../core/constants';
import { run, withHero } from '../core/state';
import { diamondPath, drawBar, drawPixelText } from './primitives';
import { drawHeroSprite } from './sprites';

const GROUND_TILE = 64;

/** Static ground speckles, scattered once at load. */
const GROUND_DECOR: { x: number; y: number; s: number; c: string }[] = [];
for (let i = 0; i < 420; i++) {
  GROUND_DECOR.push({
    x: Math.random() * ARENA_W,
    y: Math.random() * ARENA_H,
    s: Math.random() < 0.8 ? 2 : 4,
    c: Math.random() < 0.5 ? '#231b2e' : '#1f2a26',
  });
}

/**
 * Screen shake offset: two sine waves per axis instead of fresh random numbers each frame, so it
 * rolls instead of buzzing, and drawing never consumes the simulation's random numbers.
 * Uses the wall clock: it's cosmetic, and must keep moving while a joined player waits for snapshots.
 */
function shakeOffset(): { x: number; y: number } {
  if (!run.shake) return { x: 0, y: 0 };
  const t = performance.now() / 1000, amp = run.shake * 0.5;
  return {
    x: amp * (0.6 * Math.sin(t * 47) + 0.4 * Math.sin(t * 83 + 1.3)),
    y: amp * (0.6 * Math.sin(t * 53 + 2.1) + 0.4 * Math.sin(t * 71 + 0.4)),
  };
}

export function drawWorld(): void {
  const { x: shakeX, y: shakeY } = shakeOffset();
  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.save();
  ctx.translate(-run.camera.x + shakeX, -run.camera.y + shakeY);
  drawGround();
  drawSafeZone();
  drawZones();
  drawTelegraphs();
  drawPickups();
  for (const e of run.enemies) drawEnemy(e);
  for (const h of run.heroes) {
    if (h.gone) continue;
    withHero(h, () => {
      if (!h.down) run.cls.draw();
      drawPlayer();
    });
  }
  drawShots();
  drawEffects();
  drawFloatingTexts();
  ctx.restore();
}

function isOnScreen(x: number, y: number, margin: number): boolean {
  const cam = run.camera;
  return !(x < cam.x - margin || x > cam.x + VIEW_W + margin || y < cam.y - margin || y > cam.y + VIEW_H + margin);
}

function drawGround(): void {
  const cam = run.camera;
  ctx.fillStyle = '#17121e';
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);
  // grid lines, only the visible ones
  ctx.strokeStyle = '#1f1828';
  ctx.lineWidth = 1;
  const x0 = Math.floor(cam.x / GROUND_TILE) * GROUND_TILE, y0 = Math.floor(cam.y / GROUND_TILE) * GROUND_TILE;
  ctx.beginPath();
  for (let x = x0; x < cam.x + VIEW_W + GROUND_TILE; x += GROUND_TILE) { ctx.moveTo(x, cam.y - 10); ctx.lineTo(x, cam.y + VIEW_H + 10); }
  for (let y = y0; y < cam.y + VIEW_H + GROUND_TILE; y += GROUND_TILE) { ctx.moveTo(cam.x - 10, y); ctx.lineTo(cam.x + VIEW_W + 10, y); }
  ctx.stroke();
  for (const d of GROUND_DECOR) {
    if (!isOnScreen(d.x, d.y, 10)) continue;
    ctx.fillStyle = d.c;
    ctx.fillRect(d.x, d.y, d.s, d.s);
  }
  // arena border
  ctx.strokeStyle = COLOR.frame;
  ctx.lineWidth = 4;
  ctx.strokeRect(-2, -2, ARENA_W + 4, ARENA_H + 4);
}

/** Final boss phase: everything outside the safe circle is tinted and hurts. */
function drawSafeZone(): void {
  const z = run.safeZone;
  if (!z) return;
  ctx.fillStyle = 'rgba(224,98,62,0.14)';
  ctx.beginPath();
  ctx.rect(-50, -50, ARENA_W + 100, ARENA_H + 100);
  ctx.arc(z.x, z.y, z.r, 0, TAU, true);
  ctx.fill('evenodd');
  ctx.strokeStyle = COLOR.ember;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.stroke();
}

function drawZones(): void {
  for (const z of run.zones) {
    ctx.globalAlpha = Math.min(1, z.life / 0.3);
    if (z.kind === 'ring') {
      ctx.strokeStyle = COLOR.ember;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.currentR, 0, TAU); ctx.stroke();
    } else if (z.kind === 'trap') {
      ctx.fillStyle = '#8f96a6';
      ctx.fillRect(z.x - 9, z.y - 5, 18, 10);
      ctx.fillStyle = '#d0d6e0';
      for (let i = 0; i < 4; i++) ctx.fillRect(z.x - 8 + i * 5, z.y - 8, 2, 4);
    } else if (z.kind === 'mine') {
      ctx.fillStyle = Math.floor(z.t * 10) % 2 ? COLOR.gold : '#a8781e';
      ctx.beginPath(); ctx.arc(z.x, z.y, 5, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = z.color || 'rgba(255,255,255,0.15)';
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

/** Outline plus a fill that grows as the attack approaches. */
/**
 * A ranged enemy's sight line: thin (it warns of one projectile, not an area), fading in as the shot
 * nears, and thicker and brighter for the last moment so the player knows when to sidestep.
 */
function drawAimLine(x: number, y: number, a: number, len: number, k: number, color: string): void {
  const last = k > 0.75;
  ctx.globalAlpha = 0.3 + 0.6 * k;
  ctx.strokeStyle = color;
  ctx.lineWidth = last ? 2.5 : 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
  ctx.stroke();
}

function drawTelegraphs(): void {
  for (const t of run.telegraphs) {
    const k = t.t / t.dur;
    ctx.globalAlpha = 0.25 + 0.35 * k;
    ctx.fillStyle = t.color;
    ctx.strokeStyle = t.color;
    ctx.lineWidth = 2;
    if (t.kind === 'circle') {
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, TAU); ctx.stroke();
      ctx.globalAlpha *= 0.5;
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r * k, 0, TAU); ctx.fill();
    } else if (t.kind === 'line') {
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(t.a);
      ctx.strokeRect(0, -t.w / 2, t.len, t.w);
      ctx.globalAlpha *= 0.5;
      ctx.fillRect(0, -t.w / 2, t.len * k, t.w);
      ctx.restore();
    } else if (t.kind === 'aim') {
      drawAimLine(t.x, t.y, t.a, t.len, k, t.color);
    } else if (t.kind === 'cone') {
      ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.arc(t.x, t.y, t.r, t.a - t.arc / 2, t.a + t.arc / 2); ctx.closePath(); ctx.stroke();
      ctx.globalAlpha *= 0.5;
      ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.arc(t.x, t.y, t.r * k, t.a - t.arc / 2, t.a + t.arc / 2); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

function drawPickups(): void {
  for (const g of run.gems) {
    ctx.fillStyle = g.big ? COLOR.gold : COLOR.teal;
    diamondPath(g.x, g.y, g.big ? 5 : 3.5);
    ctx.fill();
  }
  for (const c of run.coins) {
    const heal = c.kind === 'heal';
    ctx.fillStyle = heal ? COLOR.green : COLOR.gold;
    ctx.beginPath(); ctx.arc(c.x, c.y, heal ? 5 : 4, 0, TAU); ctx.fill();
  }
}

function drawShots(): void {
  for (const s of run.shots) {
    ctx.fillStyle = s.color || '#fff';
    if (s.kind === 'bolt' || s.kind === 'heavybolt') {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(Math.atan2(s.vy, s.vx));
      ctx.fillRect(-s.r * 2.5, -s.r * 0.45, s.r * 4, s.r * 0.9);
      ctx.restore();
    } else {
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
    }
  }
}

function drawEffects(): void {
  for (const f of run.fx) {
    const k = f.life / f.max;
    ctx.globalAlpha = Math.max(0, k);
    switch (f.kind) {
      case 'slash':
        ctx.strokeStyle = f.color;
        ctx.lineWidth = f.w;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.05 - 0.15 * k), f.face - f.arc / 2, f.face + f.arc / 2); ctx.stroke();
        break;
      case 'ring':
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.1 - 0.2 * k), 0, TAU); ctx.stroke();
        break;
      case 'line':
        ctx.strokeStyle = f.color;
        ctx.lineWidth = f.w;
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke();
        break;
      case 'pillar':
        ctx.fillStyle = f.color;
        ctx.fillRect(f.x - f.r * 0.35, f.y - 220, f.r * 0.7, 220);
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU);
        ctx.globalAlpha *= 0.4;
        ctx.fill();
        break;
      default:
        if (f.ghost) {
          ctx.globalAlpha = k * 0.35;
          ctx.fillStyle = f.color;
          ctx.beginPath(); ctx.arc(f.x, f.y, f.size, 0, TAU); ctx.fill();
        } else {
          ctx.fillStyle = f.color;
          ctx.fillRect(f.x - f.size / 2, f.y - f.size / 2, f.size, f.size);
        }
    }
  }
  ctx.globalAlpha = 1;
}

function drawFloatingTexts(): void {
  for (const t of run.floatingTexts) {
    ctx.globalAlpha = Math.min(1, t.life * 2);
    drawPixelText(t.text, t.x, t.y, t.size, t.color, 'center');
  }
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------ player

/** The current hero: a downed body with its revive ring, or the living hero. Name tags in co-op. */
function drawPlayer(): void {
  const p = run.player, hero = run.hero, coop = run.heroes.length > 1;
  if (hero.down) { drawDownedHero(); return; }
  const sprite = drawLivingHero();
  if (coop) drawPixelText(hero.name, p.x, p.y - (sprite ? 34 : p.r + 10), 10, hero.idx === run.localHero ? COLOR.gold : COLOR.text, 'center');
}

function drawDownedHero(): void {
  const p = run.player, hero = run.hero;
  drawShadow(p.x, p.y + 8, 12, 4, 0.35);
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = run.cls.color;
  ctx.beginPath(); ctx.ellipse(p.x, p.y + 3, p.r + 2, p.r * 0.55, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = COLOR.line;
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(p.x, p.y, 22, 0, TAU); ctx.stroke();
  if (hero.revive > 0) {
    ctx.strokeStyle = COLOR.green;
    ctx.beginPath(); ctx.arc(p.x, p.y, 22, -Math.PI / 2, -Math.PI / 2 + TAU * hero.revive); ctx.stroke();
  }
  drawPixelText(hero.name + ' · down', p.x, p.y - 30, 10, COLOR.red, 'center');
}

/** Draws the living hero. Returns true if it used a sprite (taller than the circle). */
function drawLivingHero(): boolean {
  const p = run.player;
  const blinking = p.iframes > 0 && p.dashTime <= 0 && Math.floor(run.time * 20) % 2 === 1;
  if (blinking) ctx.globalAlpha = 0.5;
  drawShadow(p.x, p.y + 11, 11, 4, 0.35);
  if (drawHeroSprite(p, run.classId, run.time)) {
    drawAimPointer(p, p.hitFlash > 0 ? COLOR.red : run.cls.color);
    drawBoneShield(p);
    ctx.globalAlpha = 1;
    return true;
  }
  ctx.fillStyle = p.hitFlash > 0 ? '#ffffff' : run.cls.color;
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
  ctx.strokeStyle = COLOR.ink;
  ctx.lineWidth = 2;
  ctx.stroke();
  // facing arrow
  ctx.fillStyle = COLOR.ink;
  ctx.beginPath();
  ctx.moveTo(p.x + Math.cos(p.face) * (p.r + 7), p.y + Math.sin(p.face) * (p.r + 7));
  ctx.lineTo(p.x + Math.cos(p.face + 2.5) * (p.r - 2), p.y + Math.sin(p.face + 2.5) * (p.r - 2));
  ctx.lineTo(p.x + Math.cos(p.face - 2.5) * (p.r - 2), p.y + Math.sin(p.face - 2.5) * (p.r - 2));
  ctx.closePath();
  ctx.fillStyle = COLOR.text;
  ctx.fill();
  drawBoneShield(p);
  ctx.globalAlpha = 1;
  return false;
}

/** A small arrow on the ground showing where a sprite hero is aiming. */
function drawAimPointer(p: Player, color: string): void {
  const d = p.r + 12, a = p.face, x = p.x + Math.cos(a) * d, y = p.y + 6 + Math.sin(a) * d;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6);
  ctx.lineTo(x + Math.cos(a + 2.4) * 5, y + Math.sin(a + 2.4) * 5);
  ctx.lineTo(x + Math.cos(a - 2.4) * 5, y + Math.sin(a - 2.4) * 5);
  ctx.closePath();
  ctx.fill();
}

function drawBoneShield(p: Player): void {
  if (p.boneShield <= 0) return;
  ctx.strokeStyle = '#e8e0c8';
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 6, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
}

function drawShadow(x: number, y: number, rx: number, ry: number, alpha: number): void {
  ctx.fillStyle = 'rgba(0,0,0,' + alpha + ')';
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
}

// ------------------------------------------------------------ enemies

type ShapeDrawer = (e: Mob, r: number, col: string, flashing: boolean) => void;

function drawSlime(_e: Mob, r: number): void {
  ctx.beginPath(); ctx.ellipse(0, 2, r, r * 0.8, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = COLOR.ink;
  ctx.fillRect(-r * 0.4, -r * 0.1, 2, 3);
  ctx.fillRect(r * 0.25, -r * 0.1, 2, 3);
}

/** Shape per enemy type, drawn centred at the origin. `col` already accounts for hit flash. */
const ENEMY_SHAPES: Record<EnemyTypeId, ShapeDrawer> = {
  slime: drawSlime,
  mini: drawSlime,
  goblin(e, r) {
    ctx.rotate(e.face);
    ctx.beginPath(); ctx.moveTo(r + 3, 0); ctx.lineTo(-r, -r * 0.85); ctx.lineTo(-r * 0.6, 0); ctx.lineTo(-r, r * 0.85); ctx.closePath(); ctx.fill();
  },
  bat(_e, r) {
    ctx.beginPath(); ctx.moveTo(-r * 1.8, -2); ctx.lineTo(0, r); ctx.lineTo(r * 1.8, -2); ctx.lineTo(0, -r * 0.4); ctx.closePath(); ctx.fill();
  },
  archer(e, r) {
    ctx.fillRect(-r * 0.7, -r, r * 1.4, r * 2);
    ctx.strokeStyle = '#a07a50';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(Math.cos(e.face) * r, Math.sin(e.face) * r, r * 0.8, e.face - 1.2, e.face + 1.2); ctx.stroke();
  },
  cultist(_e, r) {
    ctx.beginPath(); ctx.arc(0, 2, r, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-r * 0.7, -r * 0.3); ctx.lineTo(0, -r * 1.6); ctx.lineTo(r * 0.7, -r * 0.3); ctx.fill();
  },
  orc(e, r, _col, flashing) {
    ctx.fillRect(-r, -r, r * 2, r * 2);
    if (!e.shieldBroken) {
      ctx.rotate(e.face);
      ctx.fillStyle = flashing ? '#fff' : '#8f96a6';
      ctx.fillRect(r - 2, -r, 6, r * 2);
    }
  },
  imp(_e, r, col) {
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    // blinking fuse sparks
    ctx.fillStyle = Math.floor(run.time * 8) % 2 ? '#ffe066' : col;
    for (let i = 0; i < 6; i++) {
      const a = (i * TAU) / 6;
      ctx.fillRect(Math.cos(a) * r - 1.5, Math.sin(a) * r - 1.5, 3, 3);
    }
  },
  boar(e, r, _col, flashing) {
    ctx.save();
    ctx.rotate(e.face);
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.25, r * 0.9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = flashing ? '#fff' : '#f2ead8'; // tusks
    ctx.beginPath(); ctx.moveTo(r * 1.1, -4); ctx.lineTo(r * 1.7, -8); ctx.lineTo(r * 1.15, -1); ctx.fill();
    ctx.beginPath(); ctx.moveTo(r * 1.1, 4); ctx.lineTo(r * 1.7, 8); ctx.lineTo(r * 1.15, 1); ctx.fill();
    ctx.restore();
    if ((e.dazedTime ?? 0) > 0) drawDazedStars(r);
  },
  toad(_e, r, col) {
    ctx.beginPath(); ctx.ellipse(0, 2, r * 1.2, r * 0.85, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = col === '#ffffff' ? col : '#2f6a58'; // spots
    ctx.beginPath(); ctx.arc(-r * 0.4, 0, 2.5, 0, TAU); ctx.arc(r * 0.35, 4, 2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffe066'; // eyes
    ctx.fillRect(-r * 0.6, -r * 0.7, 3, 3); ctx.fillRect(r * 0.4, -r * 0.7, 3, 3);
  },
  wraith(e, r) {
    if (e.phased) ctx.globalAlpha = 0.3; // ethereal: see-through, can't be hit
    ctx.beginPath();
    ctx.arc(0, -r * 0.2, r, Math.PI, 0);
    for (let i = 0; i <= 4; i++) ctx.lineTo(r - (i * r) / 2, r * (i % 2 ? 0.7 : 1.1));
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1b1024';
    ctx.fillRect(-r * 0.45, -r * 0.4, 3, 4); ctx.fillRect(r * 0.2, -r * 0.4, 3, 4);
    ctx.globalAlpha = 1;
  },
  caller(_e, r) {
    ctx.beginPath(); ctx.moveTo(0, -r * 1.7); ctx.lineTo(r, r); ctx.lineTo(-r, r); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8e0d0'; // skull face in the hood
    ctx.beginPath(); ctx.arc(0, -r * 0.2, r * 0.38, 0, TAU); ctx.fill();
    ctx.fillStyle = '#b07ae0';
    ctx.fillRect(-r * 0.22, -r * 0.3, 2, 2); ctx.fillRect(r * 0.1, -r * 0.3, 2, 2);
  },
};

/** Little stars circling a dazed enemy's head. */
function drawDazedStars(r: number): void {
  ctx.fillStyle = COLOR.gold;
  for (let i = 0; i < 3; i++) {
    const a = run.time * 5 + (i * TAU) / 3;
    ctx.fillRect(Math.cos(a) * r * 0.8 - 1.5, -r - 6 + Math.sin(a) * 3 - 1.5, 3, 3);
  }
}

function drawEnemy(e: Enemy): void {
  const flashing = e.flash > 0, col = flashing ? '#ffffff' : e.color, r = e.r;
  ctx.save();
  ctx.translate(e.x, e.y);
  drawShadow(0, r * 0.9, r * 0.9, r * 0.3, 0.3);
  if (e.elite) { ctx.strokeStyle = COLOR.gold; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r + 4, 0, TAU); ctx.stroke(); }
  if (e.charmTime > 0) { ctx.strokeStyle = '#ff7ad0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r + 6, 0, TAU); ctx.stroke(); }
  if (e.rootTime > 0) { ctx.strokeStyle = COLOR.gold; ctx.lineWidth = 2; ctx.strokeRect(-r - 3, r - 2, r * 2 + 6, 4); }
  ctx.fillStyle = col;
  if (e.boss) drawBossShape(e);
  else ENEMY_SHAPES[e.type](e, r, col, flashing);
  ctx.restore();
  // health bar for tougher enemies once damaged
  if (!e.boss && e.hp < e.maxHp && (e.elite || e.maxHp > 30)) drawBar(e.x - 14, e.y - e.r - 9, 28, 3, e.hp / e.maxHp, COLOR.ember, COLOR.barBg);
}

const BOSS_SHAPES: Record<BossKind, (e: Boss, r: number) => void> = {
  troll(_e, r) {
    ctx.fillRect(-r, -r * 0.8, r * 2, r * 1.7);
    ctx.fillStyle = '#4a5a2a';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(-r + i * r * 0.45, -r * 0.8);
      ctx.lineTo(-r + i * r * 0.45 + 8, -r * 1.3);
      ctx.lineTo(-r + i * r * 0.45 + 16, -r * 0.8);
      ctx.fill();
    }
  },
  colossus(_e, r) {
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1b1024';
    ctx.fillRect(-r * 0.5, -r * 0.3, r * 0.35, r * 0.4);
    ctx.fillRect(r * 0.15, -r * 0.3, r * 0.35, r * 0.4);
    ctx.fillRect(-r * 0.4, r * 0.35, r * 0.8, r * 0.15);
  },
  wyvern(e, r) {
    ctx.rotate(e.face);
    ctx.beginPath(); ctx.moveTo(r * 1.4, 0); ctx.lineTo(-r * 0.6, -r * 1.6); ctx.lineTo(-r * 0.2, 0); ctx.lineTo(-r * 0.6, r * 1.6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff9a5a';
    ctx.beginPath(); ctx.arc(r * 0.6, 0, 5, 0, TAU); ctx.fill();
  },
  king(_e, r) {
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    // crown
    ctx.fillStyle = COLOR.gold;
    ctx.beginPath();
    ctx.moveTo(-r * 0.7, -r * 0.7); ctx.lineTo(-r * 0.5, -r * 1.3); ctx.lineTo(-r * 0.2, -r * 0.85); ctx.lineTo(0, -r * 1.4);
    ctx.lineTo(r * 0.2, -r * 0.85); ctx.lineTo(r * 0.5, -r * 1.3); ctx.lineTo(r * 0.7, -r * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#cbb8e8';
    ctx.fillRect(-r * 0.4, -r * 0.15, r * 0.25, r * 0.2);
    ctx.fillRect(r * 0.15, -r * 0.15, r * 0.25, r * 0.2);
  },
};

function drawBossShape(e: Boss): void {
  const r = e.r;
  ctx.fillStyle = e.flash > 0 ? '#ffffff' : e.color;
  BOSS_SHAPES[e.kind](e, r);
  if (e.stunTime > 0) {
    // stars circling a stunned boss
    ctx.rotate(0);
    ctx.fillStyle = COLOR.gold;
    for (let i = 0; i < 3; i++) {
      const a = run.time * 4 + (i * TAU) / 3;
      ctx.fillRect(Math.cos(a) * r * 0.8 - 3, -r - 12 + Math.sin(a) * 4, 6, 6);
    }
  }
}
