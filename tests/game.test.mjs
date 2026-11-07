// Headless smoke tests. Build first, then run from the project root:
//   npm run build
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, GAME_JS, loadGame, playCoopWithBots, playWithBot } from './headless.mjs';

/** Menu order: the core four, then the two unlockable classes. */
const CLASS_IDS = ['traveler', 'oathknight', 'bounty_hunter', 'cleric', 'vampire', 'necro'];
const CORE_CLASSES = CLASS_IDS.slice(0, 4);
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
  playWithBot(game, 'bounty_hunter', 20);
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

test('co-op: four bots (the core four classes) keep the game state valid and level together', () => {
  const game = loadGame({ seed: 11 });
  const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
  let levelUps = 0;
  const run = playCoopWithBots(game, CORE_CLASSES, SOAK_SECONDS, {
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
  // XP is shared: heroes without an XP bonus are level with each other; the Traveler (+XP) is ahead or level
  const plain = run.heroes.filter((h) => h.stats.xpGain === 1);
  assert.ok(plain.length >= 2, 'at least two heroes without an XP bonus');
  assert.equal(new Set(plain.map((h) => h.player.level)).size, 1, 'shared XP keeps heroes without bonuses at the same level');
  const traveler = run.heroes.find((h) => h.classId === 'traveler');
  assert.ok(traveler.player.level >= plain[0].player.level, 'Quick Learner never puts the Traveler behind');
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
  sr.newRunWith([{ classId: 'bounty_hunter' }, { classId: 'necro' }], 0);
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

// ------------------------------------------------------------ unlocks

test('unlocks: Vampire and Necromancer start locked and open at their milestones', () => {
  const { sr } = loadGame();
  const p = sr.progress;
  for (const id of CORE_CLASSES) assert.ok(p.isClassUnlocked(id), `${id} is open from the start`);
  assert.equal(p.isClassUnlocked('vampire'), false);
  assert.equal(p.isClassUnlocked('necro'), false);
  assert.match(p.unlockText('vampire'), /Traveler/);

  // beating Boss 1 with another class doesn't unlock the Vampire
  assert.deepEqual([...p.recordRun({ classId: 'cleric', wavesCleared: 3, bossesKilled: 1, win: false })], []);
  assert.equal(p.isClassUnlocked('vampire'), false);
  // ...as the Traveler it does
  assert.deepEqual([...p.recordRun({ classId: 'traveler', wavesCleared: 3, bossesKilled: 1, win: false })], ['vampire']);
  assert.ok(p.isClassUnlocked('vampire'));
  // Boss 2 with any class unlocks the Necromancer
  assert.deepEqual([...p.recordRun({ classId: 'bounty_hunter', wavesCleared: 6, bossesKilled: 2, win: false })], ['necro']);
  assert.ok(p.isClassUnlocked('necro'));
  assert.equal(p.getProgress().runs, 3);
  assert.equal(p.getProgress().bestWave, 7);
});

test('unlocks: a locked class cannot be started from the menu, and test-mode runs never unlock anything', () => {
  const { sr } = loadGame();
  sr.keysPressed['5'] = true; // Vampire's hotkey
  sr.update(1 / 60);
  assert.equal(sr.scene, 'menu', 'a locked class does not start');
  assert.match(sr.net.notice, /locked/i);

  sr.keysPressed['1'] = true; // Traveler
  sr.update(1 / 60);
  assert.equal(sr.scene, 'play', 'an open class starts');

  // a test-mode Traveler run that beats Boss 1 doesn't count...
  sr.DEBUG.god = true;
  sr.run.bossesKilled = 1;
  sr.run.wavesCleared = 3;
  sr.endRunForTest(false);
  assert.equal(sr.progress.isClassUnlocked('vampire'), false, 'test mode never unlocks');

  // ...the same run for real does, and the result screen says so
  sr.DEBUG.god = false;
  sr.newRun('traveler');
  sr.run.bossesKilled = 1;
  sr.run.wavesCleared = 3;
  sr.endRunForTest(false);
  assert.equal(sr.scene, 'result');
  assert.ok(sr.progress.isClassUnlocked('vampire'));
  assert.deepEqual([...sr.progress.lastUnlocked], ['vampire']);
  sr.render();
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
