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
  const sources = Math.max(newestSourceTime(path.join(ROOT, 'src')), newestSourceTime(path.join(ROOT, 'assets')), fs.statSync(path.join(ROOT, 'shell.html')).mtimeMs);
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
    // reach the first boss; melee bots beat it within the time on about half of the seeds (boss tuning is separate)
    assert.ok(run.wave >= 3, `expected to reach the wave 3 boss, got wave ${run.wave}`);
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

test('cards: every class names its abilities, and every card text is short and says what it does', () => {
  const { sr } = loadGame();
  for (const id of CLASS_IDS) {
    const cls = sr.CLASSES[id];
    for (const part of ['strike', 'heavy', 'dash', 'ultimate', 'passive']) {
      assert.ok(cls.abilities[part], `${id}: ability name for ${part}`);
    }
    assert.equal(cls.cards.length, 16, `${id} has 16 cards`);
    for (const card of cls.cards) {
      assert.ok(card.desc.length >= 20 && card.desc.length <= 110, `${id}/${card.id}: description should be 20-110 characters (${card.desc.length})`);
      assert.match(card.desc, /\.$|\)$/, `${id}/${card.id}: description ends with a full stop`);
      if (card.evo) assert.ok(card.evo.desc.length <= 90, `${id}/${card.id}: evolution text is short`);
    }
  }
});

test('sprites: every class draws its own row of the hero sheet, facing and walking', () => {
  const { sr, counter } = loadGame({ images: true });
  sr.DEBUG.god = true;
  sr.newRunWith(CLASS_IDS.map((classId) => ({ classId })), 0);
  const heroes = sr.run.heroes;
  // face each hero a different way, and make half of them walk
  const faces = [Math.PI / 2, -Math.PI / 2, 0, Math.PI, Math.PI / 2, 0];
  heroes.forEach((h, i) => { h.player.face = faces[i]; h.player.moveX = i % 2; });
  sr.render(); // starts the image loads
  counter.images.length = 0; counter.imageCalls.length = 0;
  sr.render();
  // Traveler and Vampire have their own 8-direction sets (whole image, 5 arguments); the rest use the sheet (9)
  const fromSheet = counter.images.filter((_, i) => counter.imageCalls[i].argc === 9);
  assert.equal(counter.imageCalls.filter((c) => c.argc === 5).length, 2, 'Traveler and Vampire draw from their 8-direction sets');
  const rows = fromSheet.map(([sx, sy]) => [sx / 32, sy / 32]);
  assert.equal(rows.length, CLASS_IDS.length - 2, 'one sheet sprite per other hero');
  assert.deepEqual(rows.map(([, row]) => row).sort(), [1, 2, 3, 5], 'each other class uses its own row');
  for (const [col] of rows) assert.ok(col >= 0 && col <= 10 && Number.isInteger(col), `valid frame column ${col}`);
});

for (const classId of ['traveler', 'vampire']) test(`sprites: the ${classId} turns through 8 different images as it aims around`, () => {
  const { sr, counter } = loadGame({ images: true });
  sr.newRun(classId);
  const p = sr.run.player;
  sr.render(); // starts the image loads
  const seen = new Set();
  for (let i = 0; i < 8; i++) {
    p.face = (i * Math.PI) / 4;
    counter.imageCalls.length = 0;
    sr.render();
    const call = counter.imageCalls.find((c) => c.argc === 5);
    assert.ok(call, 'drawn from the 8-direction set');
    seen.add(call.img);
  }
  assert.equal(seen.size, 8, 'a different image for each of the 8 directions');
});

test('sprites: without images (or switched off) heroes fall back to circles', () => {
  const { sr, counter } = loadGame();
  sr.newRun('traveler');
  sr.render();
  assert.equal(counter.images.length, 0);
  assert.ok(counter.drawCalls > 0);
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

test('a long frame is split into 1/60 s steps, so a slow frame rate plays the same as a fast one', () => {
  const play = (stepOnce) => {
    const { sr } = loadGame({ seed: 11 });
    sr.DEBUG.god = true;
    sr.DEBUG.bot = true;
    sr.newRun('bounty_hunter');
    for (let i = 0; i < 200 && sr.scene === 'play'; i++) stepOnce(sr);
    return sr.run;
  };
  const oneLongFrame = play((sr) => sr.stepFrame(0.05));
  const threeShortSteps = play((sr) => { for (let i = 0; i < 3 && sr.scene === 'play'; i++) sr.step(0.05 / 3); });
  assert.ok(oneLongFrame.time > 1, 'the run should play for a while');
  assert.equal(oneLongFrame.time, threeShortSteps.time);
  assert.equal(oneLongFrame.kills, threeShortSteps.kills);
  assert.deepEqual([oneLongFrame.player.x, oneLongFrame.player.y], [threeShortSteps.player.x, threeShortSteps.player.y]);
  const positions = (run) => JSON.stringify(Array.from(run.enemies, (e) => [e.x, e.y]));
  assert.equal(positions(oneLongFrame), positions(threeShortSteps));
});

test('level-up: a click or key right as the cards appear is ignored, so a card is never picked unread', () => {
  const { sr } = loadGame();
  sr.newRun('traveler');
  sr.run.hero.pendingLevelUps = 1;
  sr.update(1 / 60);
  assert.equal(sr.scene, 'levelup');
  const offer = sr.run.offer;
  sr.keysPressed['1'] = true; // e.g. still clicking/pressing from the fight
  sr.update(1 / 60);
  assert.equal(sr.scene, 'levelup', 'the press is ignored');
  assert.equal(sr.run.offer, offer, 'the offer is still open');
  for (let t = 0; t < 0.4; t += 1 / 60) sr.update(1 / 60);
  sr.keysPressed['1'] = true;
  sr.update(1 / 60);
  assert.equal(sr.run.offer, null, 'after a short wait the press picks the card');
  assert.equal(sr.scene, 'play');
});

test('healing: elites drop a heal orb and bosses drop several, so every class can recover HP', () => {
  const { sr } = loadGame();
  sr.DEBUG.god = true;
  sr.newRun('oathknight');
  const elite = sr.spawnEnemy('goblin', sr.run.player.x + 300, sr.run.player.y, true);
  sr.hitEnemy(elite, 1e9);
  assert.equal(sr.run.coins.filter((c) => c.kind === 'heal').length, 1, 'an elite drops one heal orb');
  const normal = sr.spawnEnemy('goblin', sr.run.player.x + 300, sr.run.player.y, false);
  sr.hitEnemy(normal, 1e9);
  assert.equal(sr.run.coins.filter((c) => c.kind === 'heal').length, 1, 'normal enemies drop none');

  // a cleric bot clears the first boss; it drops heal orbs (the cleric drops no coins of its own)
  const game = loadGame({ seed: 7 });
  let orbsAtBossKill = -1;
  playWithBot(game, 'cleric', 240, {
    onFrame(r) { if (orbsAtBossKill < 0 && r.bossesKilled > 0) orbsAtBossKill = r.coins.filter((c) => c.kind === 'heal').length; },
  });
  assert.ok(orbsAtBossKill >= 3, `the boss should drop at least 3 heal orbs (saw ${orbsAtBossKill})`);
});

test('the first card comes early: levels 1 and 2 are cheap', () => {
  // median over a few seeds (one unlucky seed can be slow); it was ~18 s before levels 1-2 got cheaper
  const times = [1, 2, 3, 4, 5].map((seed) => {
    const game = loadGame({ seed });
    let firstOfferAt = Infinity;
    playWithBot(game, 'traveler', 40, { onOffer() { firstOfferAt = Math.min(firstOfferAt, game.sr.run.time); } });
    return firstOfferAt;
  }).sort((a, b) => a - b);
  assert.ok(times[2] < 16, `median first card at ${times[2].toFixed(1)} s, expected under 16 s`);
});

test('screen shake never uses the game\'s random numbers, so drawing can\'t change a seeded run', () => {
  const runWith = (renderEveryFrame) => {
    const { sr } = loadGame({ seed: 3 });
    sr.DEBUG.god = true;
    sr.DEBUG.bot = true;
    sr.newRun('cleric');
    for (let i = 0; i < 60 * 40; i++) {
      if (sr.scene === 'levelup') { sr.pickRandomForEveryone(); continue; }
      sr.run.shake = 5; // shaking the whole time
      sr.step(1 / 60);
      if (renderEveryFrame) sr.render();
    }
    return sr.run;
  };
  const drawn = runWith(true), notDrawn = runWith(false);
  assert.equal(drawn.kills, notDrawn.kills);
  assert.deepEqual([drawn.player.x, drawn.player.y], [notDrawn.player.x, notDrawn.player.y]);
});

// ------------------------------------------------------------ monster roles and warnings

/** A quiet arena: one hero standing still, no wave spawns, so a test controls every enemy. */
function quietArena(classId = 'oathknight') {
  const game = loadGame({ seed: 4 });
  const { sr } = game;
  sr.newRun(classId);
  sr.run.spawnBudget = -1e9; // no wave spawns
  for (const e of sr.run.enemies) e.dead = true;
  sr.step(1 / 60);
  return game;
}
const stepFor = (sr, seconds, each) => { for (let t = 0; t < seconds; t += 1 / 60) { sr.step(1 / 60); if (each) each(); } };

test('archers stop and show a thin aim line before they shoot, then fire a fast arrow along it', () => {
  const { sr } = quietArena();
  const p = sr.run.player;
  const archer = sr.spawnEnemy('archer', p.x + 320, p.y, false);
  archer.attackTimer = 0.05;
  let warned = null, shotAt = -1, warnedAt = -1, arrowSpeed = 0;
  stepFor(sr, 1.5, () => {
    const line = sr.run.telegraphs.find((t) => t.kind === 'aim');
    if (line && !warned) { warned = { ...line, ax: archer.x, ay: archer.y }; warnedAt = sr.run.time; }
    const arrow = sr.run.shots.find((s) => s.owner === 'enemy');
    if (shotAt < 0 && arrow) { shotAt = sr.run.time; arrowSpeed = Math.hypot(arrow.vx, arrow.vy); }
  });
  assert.ok(warned, 'a warning line appears');
  assert.ok(shotAt - warnedAt >= 0.6, `the shot comes at least 0.6 s after the warning (got ${(shotAt - warnedAt).toFixed(2)})`);
  assert.ok(Math.abs(Math.cos(warned.a) + 1) < 0.05, 'the line points at the hero (to the left)');
  assert.ok(arrowSpeed >= 500, `arrows are fast (got ${arrowSpeed.toFixed(0)} px/s)`);
  assert.ok(sr.encodeSnapshot(sr.run, 'play').length > 0);
});

test('healers channel a green circle that heals nearby enemies, and any hit interrupts it', () => {
  const setUp = () => {
    const game = quietArena();
    const { sr } = game, p = sr.run.player;
    const healer = sr.spawnEnemy('cultist', p.x + 330, p.y, false);
    const hurt = sr.spawnEnemy('orc', p.x + 380, p.y + 40, false);
    hurt.hp = hurt.maxHp * 0.3;
    hurt.speed = 0; // stays inside the healer's circle
    healer.attackTimer = 0.05;
    return { sr, healer, hurt };
  };
  // left alone, the heal lands
  const a = setUp();
  stepFor(a.sr, 0.2);
  assert.ok(a.sr.run.telegraphs.some((t) => t.kind === 'circle' && t.r === 150), 'the channel shows its heal circle');
  const before = a.hurt.hp;
  stepFor(a.sr, 1.4);
  assert.ok(a.hurt.hp > before + a.hurt.maxHp * 0.3, 'the wounded orc is healed');

  // hit during the channel: no heal, and the warning is gone
  const b = setUp();
  stepFor(b.sr, 0.2);
  b.sr.hitEnemy(b.healer, 1);
  const hpBefore = b.hurt.hp;
  stepFor(b.sr, 1.4);
  assert.equal(b.hurt.hp, hpBefore, 'an interrupted heal does nothing');
});

test('imps light a fuse with a blast circle before exploding; killed first, they blow up their neighbours', () => {
  const { sr } = quietArena('traveler'); // (the Oathknight would block the blast)
  sr.DEBUG.god = false;
  const p = sr.run.player, hp = p.hp;
  sr.spawnEnemy('imp', p.x + 40, p.y, false);
  sr.step(1 / 60);
  assert.ok(sr.run.telegraphs.some((t) => t.kind === 'circle'), 'the fuse shows its blast circle');
  stepFor(sr, 0.3);
  assert.equal(p.hp, hp, 'no damage before the fuse runs out (time to dash away)');
  stepFor(sr, 0.5);
  assert.ok(p.hp < hp, 'the blast hurts a hero who stayed inside');

  const imp = sr.spawnEnemy('imp', p.x + 300, p.y, false);
  const neighbour = sr.spawnEnemy('orc', p.x + 330, p.y, false);
  sr.hitEnemy(imp, 1e9);
  assert.ok(neighbour.hp < neighbour.maxHp, 'killing the imp damages the enemy next to it');
});

test('fewer monsters: a long run never floods the screen, and healers stay rare', () => {
  const game = loadGame({ seed: 9 });
  let peak = 0, peakHealers = 0;
  playWithBot(game, 'cleric', 400, {
    onFrame(r) {
      const alive = r.enemies.filter((e) => !e.dead);
      peak = Math.max(peak, alive.length);
      peakHealers = Math.max(peakHealers, alive.filter((e) => e.type === 'cultist').length);
    },
  });
  assert.ok(peak <= 75, `at most ~70 enemies at once (saw ${peak})`); // slime splits can go a little over
  assert.ok(peakHealers <= 2, `at most 2 healers at once in solo (saw ${peakHealers})`);
});

test('boars show a lane, charge down it, then stand dazed and take extra damage', () => {
  const { sr } = quietArena();
  const p = sr.run.player;
  const boar = sr.spawnEnemy('boar', p.x - 250, p.y, false);
  boar.attackTimer = 0.05;
  stepFor(sr, 0.2);
  const lane = sr.run.telegraphs.find((t) => t.kind === 'line');
  assert.ok(lane && lane.w > 20, 'a wide lane shows where its body will charge');
  const startX = boar.x;
  stepFor(sr, 0.8);
  stepFor(sr, 0.7);
  assert.ok(boar.x - startX > 200, `it charges a long way (${(boar.x - startX).toFixed(0)} px)`);
  assert.ok(boar.dazedTime > 0, 'then it is dazed');
  const dazedHit = sr.hitEnemy(boar, 10, { noCrit: true });
  boar.dazedTime = 0;
  const normalHit = sr.hitEnemy(boar, 10, { noCrit: true });
  assert.ok(Math.abs(dazedHit / normalHit - 1.5) < 1e-6, 'dazed boars take +50% damage');
});

test('toads lob poison at where the hero stood: a circle first, then a pool', () => {
  const { sr } = quietArena();
  const p = sr.run.player, at = { x: p.x, y: p.y };
  const toad = sr.spawnEnemy('toad', p.x + 320, p.y, false);
  toad.attackTimer = 0.05;
  stepFor(sr, 0.2);
  assert.ok(sr.run.telegraphs.some((t) => t.kind === 'circle' && Math.hypot(t.x - at.x, t.y - at.y) < 1), 'a circle marks the landing spot');
  assert.ok(!sr.run.zones.some((z) => z.owner === 'enemy'), 'no pool before the glob lands');
  stepFor(sr, 1.1);
  assert.ok(sr.run.zones.some((z) => z.owner === 'enemy' && z.kind === 'pool' && Math.hypot(z.x - at.x, z.y - at.y) < 1), 'a poison pool lands there');
});

test('attack cues: a monster that hits you lunges and claws, hostile ground and shots are marked, and joiners see it', () => {
  const { sr } = quietArena();
  const p = sr.run.player;
  const goblin = sr.spawnEnemy('goblin', p.x + 40, p.y, false);
  for (let i = 0; i < 60 && !goblin.strikeTime; i++) sr.step(1 / 60);
  assert.ok(goblin.strikeTime > 0, 'the goblin that touched the hero is mid-lunge');
  assert.ok(Math.abs(Math.cos(goblin.face) + 1) < 0.2, 'it lunges at the hero (to its left)');
  assert.ok(sr.run.fx.some((f) => f.kind === 'slash' && Math.hypot(f.x - goblin.x, f.y - goblin.y) < 60), 'a claw slash comes from the attacker');
  const toad = sr.spawnEnemy('toad', p.x + 320, p.y, false);
  toad.attackTimer = 0.05;
  stepFor(sr, 1.3, () => { goblin.contactCooldown = 0; });
  const snap = JSON.parse(sr.encodeSnapshot(sr.run, 'play'));
  assert.ok(snap.zones.some((z) => z[8] === 1), 'the poison pool is sent as hostile ground');
  assert.ok(snap.mobs.some((m) => m[0] === goblin.id && m[6] & 256), 'the lunge reaches joined players');
  sr.render(); // hostile edges, lunges and halos draw without errors
});

test('wraiths turn ethereal (immune, harmless) and back', () => {
  const { sr } = quietArena();
  const p = sr.run.player;
  const wraith = sr.spawnEnemy('wraith', p.x + 300, p.y, false);
  stepFor(sr, 2.7);
  assert.equal(wraith.phased, true, 'ethereal after its solid time');
  assert.equal(sr.hitEnemy(wraith, 50), 0, 'it cannot be hurt while ethereal');
  assert.equal(wraith.hp, wraith.maxHp);
  assert.ok(sr.encodeSnapshot(sr.run, 'play').length > 0);
  stepFor(sr, 1.6);
  assert.equal(wraith.phased, false, 'solid again');
  assert.ok(sr.hitEnemy(wraith, 5) > 0, 'and can be hurt');
});

test('grave callers channel, then raise bats; a hit interrupts the summon', () => {
  const setUp = () => {
    const { sr } = quietArena();
    const p = sr.run.player;
    const caller = sr.spawnEnemy('caller', p.x + 330, p.y, false);
    caller.attackTimer = 0.05;
    return { sr, caller };
  };
  const bats = (sr) => sr.run.enemies.filter((e) => e.type === 'bat' && !e.dead).length;
  const a = setUp();
  stepFor(a.sr, 1.5);
  assert.equal(bats(a.sr), 3, 'three bats are raised');
  const b = setUp();
  stepFor(b.sr, 0.3);
  b.sr.hitEnemy(b.caller, 1);
  stepFor(b.sr, 1.3);
  assert.equal(bats(b.sr), 0, 'an interrupted summon raises nothing');
});

// ------------------------------------------------------------ scoreboard and high scores

test('scoreboard: every player\'s kills, damage and damage taken are tracked, and kills add up to the team total', () => {
  const game = loadGame({ seed: 11 });
  const run = playCoopWithBots(game, CORE_CLASSES, 90);
  const sum = run.heroes.reduce((n, h) => n + h.score.kills, 0);
  assert.equal(sum, run.kills, 'each kill is credited to exactly one player');
  for (const h of run.heroes) {
    assert.ok(h.score.kills > 0 && h.score.damage > 0, `${h.name} has kills and damage`);
    assert.ok(Number.isFinite(h.score.taken) && h.score.taken >= 0);
  }
  const host = game.sr.encodeSnapshot(run, 'play');
  assert.match(host, /"score":\{"kills":\d+/, 'the scoreboard is in the online snapshot');
  game.sr.endRunForTest(false);
  game.sr.render(); // the result screen draws a row per player
});

test('scoreboard: reviving a teammate counts for the player who stood next to them', () => {
  const { sr } = loadGame();
  sr.DEBUG.god = false;
  sr.DEBUG.bot = false;
  sr.newRunWith([{ classId: 'cleric' }, { classId: 'vampire' }], 0);
  const [a, b] = sr.run.heroes;
  b.down = true;
  b.player.hp = 0;
  a.player.x = b.player.x + 20;
  a.player.y = b.player.y;
  for (let i = 0; i < 60 * 3.2 && b.down; i++) { sr.run.enemies.length = 0; sr.step(1 / 60); }
  assert.equal(a.score.revives, 1);
  assert.equal(b.score.revives, 0);
});

test('high scores: real runs are saved best-first (top 10), test-mode runs are not', () => {
  const { sr } = loadGame();
  const finish = (classId, waves, bosses, { god = false } = {}) => {
    sr.DEBUG.god = god;
    sr.newRun(classId);
    sr.run.wavesCleared = waves;
    sr.run.bossesKilled = bosses;
    sr.endRunForTest(false);
    return sr.run.kills;
  };
  finish('cleric', 2, 0);
  const travelerKills = finish('traveler', 5, 1);
  finish('oathknight', 1, 0, { god: true }); // test mode: not saved
  const list = sr.progress.getProgress().highScores;
  assert.deepEqual(Array.from(list, (h) => h.classId), ['traveler', 'cleric'], 'best first, test mode left out');
  assert.equal(sr.progress.lastRank, -1, 'the test-mode run has no rank');
  assert.equal(list[0].score, 500 * 5 + 2000 * 1 + 10 * travelerKills, 'score = 500/wave cleared + 2000/boss + 10/kill');
  assert.equal(list[0].wave, 6, 'the wave it ended on');
  for (let i = 0; i < 12; i++) finish('bounty_hunter', 3, 1);
  assert.equal(sr.progress.getProgress().highScores.length, 10, 'only the top 10 are kept');
  assert.equal(sr.progress.getProgress().highScores[0].classId, 'traveler');
});

test('high scores: H opens the panel on the menu; a click closes it without starting a run', () => {
  const { sr } = loadGame();
  sr.keysPressed.h = true;
  sr.update(1 / 60);
  sr.render();
  sr.keysPressed['1'] = true; // ignored while the panel is open
  sr.update(1 / 60);
  assert.equal(sr.scene, 'menu');
  sr.keysPressed.escape = true;
  sr.update(1 / 60);
  sr.keysPressed['1'] = true;
  sr.update(1 / 60);
  assert.equal(sr.scene, 'play', 'once closed, the menu works again');
});

test('run counters: interrupts, dazed hits, imp chain kills, shield breaks and arrow hits are credited to the player', () => {
  const { sr } = quietArena('traveler');
  sr.DEBUG.god = false;
  const p = sr.run.player, t = sr.run.hero.tally;
  // interrupt a healer's channel
  const healer = sr.spawnEnemy('cultist', p.x + 330, p.y, false);
  const hurt = sr.spawnEnemy('orc', p.x + 370, p.y + 30, false);
  hurt.hp = hurt.maxHp / 2; hurt.speed = 0; healer.attackTimer = 0.05;
  stepFor(sr, 0.2);
  sr.hitEnemy(healer, 1);
  sr.step(1 / 60);
  assert.equal(t.interrupts, 1);
  // break the orc's shield with a heavy hit
  sr.hitEnemy(hurt, 1, { heavy: true });
  assert.equal(t.shieldBreaks, 1);
  // hit a dazed boar
  const boar = sr.spawnEnemy('boar', p.x - 300, p.y, false);
  boar.dazedTime = 1;
  sr.hitEnemy(boar, 1);
  assert.equal(t.dazedHits, 1);
  // an imp's blast kills its neighbour
  const imp = sr.spawnEnemy('imp', p.x, p.y + 300, false), bat = sr.spawnEnemy('bat', p.x + 20, p.y + 300, false);
  bat.hp = 1;
  sr.hitEnemy(imp, 1e9);
  assert.equal(t.impChainKills, 1);
  assert.ok(t.killsByType.imp >= 1 && t.killsByType.bat >= 1, 'kills by monster type');
  // an arrow that hurts
  const archer = sr.spawnEnemy('archer', p.x + 250, p.y, false);
  archer.attackTimer = 0.05;
  for (let i = 0; i < 120 && t.arrowHits === 0; i++) { p.iframes = 0; sr.step(1 / 60); }
  assert.equal(t.arrowHits, 1);
});

test('slimes come in three sizes: a Big Slime splits into two Slimes; Slimes split into small ones from wave 4', () => {
  const { sr } = quietArena('traveler');
  const p = sr.run.player;
  const big = sr.spawnEnemy('bigslime', p.x + 300, p.y, false);
  const mid = sr.spawnEnemy('slime', p.x - 300, p.y, false);
  const small = sr.spawnEnemy('mini', p.x, p.y + 300, false);
  assert.ok(big.r > mid.r && mid.r > small.r, `sizes: big ${big.r} > slime ${mid.r} > small ${small.r}`);
  assert.equal(mid.r, 15, 'the normal slime is bigger than before (was 11)');
  const slimes = () => sr.run.enemies.filter((e) => e.type === 'slime' && !e.dead).length;
  const before = slimes();
  sr.hitEnemy(big, 1e9);
  assert.equal(slimes(), before + 2, 'a Big Slime always splits into two Slimes');
  const minis = () => sr.run.enemies.filter((e) => e.type === 'mini' && !e.dead).length;
  const m0 = minis();
  sr.hitEnemy(mid, 1e9);
  assert.equal(minis(), m0, 'on wave 1 a Slime does not split yet');
  assert.equal(sr.run.hero.tally.killsByType.slime, 2, 'every size counts as a slime (Slayer, bestiary)');
  sr.render();
});
