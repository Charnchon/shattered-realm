// Headless smoke tests. Build first, then run from the project root:
//   npm run build
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, GAME_JS, loadGame, playCoopWithBots, playWithBot } from './headless.mjs';

const CLASS_IDS = ['vampire', 'merchant', 'necro', 'cleric'];
const RARITIES = ['common', 'rare', 'epic', 'legendary'];
const SOAK_SECONDS = 240;

function newestSourceTime(dir) {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestSourceTime(full) : fs.statSync(full).mtimeMs);
  }
  return newest;
}

test('game.js is built and up to date', () => {
  assert.ok(fs.existsSync(GAME_JS), 'game.js missing: run `npm run build` first');
  const sources = Math.max(newestSourceTime(path.join(ROOT, 'src')), fs.statSync(path.join(ROOT, 'shell.html')).mtimeMs);
  assert.ok(fs.statSync(GAME_JS).mtimeMs >= sources, 'game.js is older than src/: run `npm run build`');
});

test('the menu lists every class and renders', () => {
  const { sr, counter } = loadGame();
  assert.deepEqual(Object.keys(sr.CLASSES), CLASS_IDS);
  sr.render();
  assert.ok(counter.drawCalls > 0);
});

for (const classId of CLASS_IDS) {
  test(`${classId}: bot soak keeps the game state valid`, () => {
    const game = loadGame({ seed: 7 });
    const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
    let offers = 0;
    const run = playWithBot(game, classId, SOAK_SECONDS, {
      onFrame(r) {
        const p = r.player;
        assert.ok(isFiniteNumber(p.x) && isFiniteNumber(p.y), 'player position must be finite');
        assert.ok(isFiniteNumber(p.hp) && p.hp <= r.stats.maxHp + 1e-6, 'player HP must be finite and <= max');
        for (const e of r.enemies) assert.ok(isFiniteNumber(e.x) && isFiniteNumber(e.y) && !Number.isNaN(e.hp), `enemy ${e.type} has invalid state`);
      },
      onOffer(offer) {
        offers++;
        assert.equal(offer.items.length, 3, 'an offer has 3 choices');
        for (const item of offer.items) assert.ok(RARITIES.includes(item.rarity), `unknown rarity ${item.rarity}`);
      },
    });
    assert.ok(run.wave >= 4, `expected to reach wave 4+, got ${run.wave}`);
    assert.ok(run.kills > 100, 'the bot should kill plenty of enemies');
    assert.ok(offers > 5, 'several level-ups should happen');
    assert.ok(Object.keys(run.cards).length > 0, 'cards should be picked');
  });
}

test('the same seed gives the same run', () => {
  const summary = (seed) => {
    const run = playWithBot(loadGame({ seed }), 'cleric', 90);
    return JSON.stringify({ wave: run.wave, kills: run.kills, level: run.player.level, hp: run.player.hp, cards: run.cards });
  };
  assert.equal(summary(3), summary(3));
});

test('pause and result screens render', () => {
  const game = loadGame();
  const { sr } = game;
  playWithBot(game, 'merchant', 20);
  sr.scene = 'pause';
  sr.render();
  sr.run.result = { win: true, gold: 1, exp: 1, time: 20 };
  sr.scene = 'result';
  sr.render();
  assert.ok(game.counter.drawCalls > 0);
});

test('shield orcs turn slowly, so the player can get behind the shield', () => {
  const { sr } = loadGame();
  sr.DEBUG.god = true;
  sr.newRun('cleric');
  const p = sr.run.player;
  const orc = sr.spawnEnemy('orc', p.x + 100, p.y, false);
  assert.ok(Math.abs(Math.abs(orc.face) - Math.PI) < 1e-9, 'spawns facing the player');
  // jump behind the orc: it must not snap around instantly
  p.x += 200;
  const before = orc.face;
  sr.step(1 / 60);
  const turned = Math.abs(orc.face - before);
  assert.ok(turned > 0 && turned <= 1.2 / 60 + 1e-9, `turned ${turned} rad in one frame`);
});

// ------------------------------------------------------------ co-op

test('co-op: four bots (one per class) keep the game state valid and level together', () => {
  const game = loadGame({ seed: 11 });
  const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
  let levelUps = 0;
  const run = playCoopWithBots(game, CLASS_IDS, SOAK_SECONDS, {
    onFrame(r) {
      for (const h of r.heroes) {
        const p = h.player;
        assert.ok(isFiniteNumber(p.x) && isFiniteNumber(p.y), `${h.name}: position must be finite`);
        assert.ok(isFiniteNumber(p.hp) && p.hp <= h.stats.maxHp + 1e-6, `${h.name}: HP must be finite and <= max`);
      }
      for (const e of r.enemies) assert.ok(isFiniteNumber(e.x) && isFiniteNumber(e.y) && !Number.isNaN(e.hp), `enemy ${e.type} has invalid state`);
      // `run.player` and friends must point back at the local hero between steps
      assert.equal(r.hero, r.heroes[r.localHero], 'the current hero is restored after each step');
    },
    onLevelUp(r) {
      levelUps++;
      for (const h of r.heroes) if (h.offer) assert.equal(h.offer.items.length, 3, `${h.name}: an offer has 3 choices`);
    },
  });
  assert.ok(run.wave >= 4, `expected to reach wave 4+, got ${run.wave}`);
  assert.ok(levelUps > 5, 'several level-ups should happen');
  const levels = new Set(run.heroes.map((h) => h.player.level));
  assert.equal(levels.size, 1, 'XP is shared, so every hero has the same level');
  for (const h of run.heroes) {
    assert.ok(Object.keys(h.cards).length > 0, `${h.name} should own cards`);
    assert.ok(h.cards && Object.keys(h.cards).every((id) => h.cls.cards.some((c) => c.id === id)), `${h.name} only owns their own class's cards`);
  }
});

test('co-op: a downed hero is revived by a teammate standing next to them', () => {
  const { sr } = loadGame();
  sr.DEBUG.god = false;
  sr.DEBUG.bot = false;
  sr.newRunWith([{ classId: 'cleric' }, { classId: 'vampire' }], 0);
  const [a, b] = sr.run.heroes;
  sr.run.enemies.length = 0;
  b.down = true;
  b.player.hp = 0;
  a.player.x = b.player.x + 20;
  a.player.y = b.player.y;
  for (let i = 0; i < 60 * 3.2 && b.down; i++) {
    sr.run.enemies.length = 0; // keep it about reviving
    sr.step(1 / 60);
  }
  assert.equal(b.down, false, 'revived after ~3 s next to a teammate');
  assert.ok(b.player.hp > 0);
  assert.equal(sr.scene, 'play');
});

test('co-op: the run only ends when every hero is down', () => {
  const { sr } = loadGame();
  sr.DEBUG.god = false;
  sr.DEBUG.bot = false;
  sr.newRunWith([{ classId: 'merchant' }, { classId: 'necro' }], 0);
  const [a, b] = sr.run.heroes;
  // knock out one hero with a hit far bigger than their HP
  const hit = (hero) => { hero.player.iframes = 0; sr.hurtHero(hero, 1e6); };
  hit(a);
  assert.equal(a.down, true);
  assert.equal(sr.scene, 'play', 'one hero down: the run goes on');
  hit(b);
  assert.equal(sr.scene, 'result', 'everyone down: the run is over');
  assert.equal(sr.run.result.win, false);
});

test('simulate() test hook still works', () => {
  const { sr } = loadGame();
  sr.DEBUG.god = true;
  sr.DEBUG.bot = true;
  sr.newRun('vampire');
  const summary = sr.simulate(30);
  assert.equal(summary.scene, 'play');
  assert.ok(summary.kills > 0);
});
