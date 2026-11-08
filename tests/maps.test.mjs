// Maps and map levels (step G of docs/progression.md): modifiers, hazards, unlocks, rewards, online.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './headless.mjs';

const FRAME = 1 / 60;

/** A bot (god mode) plays `seconds` on a map and level, picking random cards. */
function soak(mapId, level, seconds, seed = 3) {
  const game = loadGame({ seed });
  const { sr } = game;
  sr.DEBUG.god = true;
  sr.DEBUG.bot = true;
  sr.newRunWith([{ classId: 'cleric' }], 0, { mapId, level });
  for (let t = 0, f = 0; t < seconds; f++) {
    if (sr.scene === 'levelup') { sr.pickRandomForEveryone(); continue; }
    if (sr.scene !== 'play') break;
    sr.step(FRAME);
    t += FRAME;
    for (const e of sr.run.enemies) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.hp), `${mapId} ${level}: enemy state valid`);
    if (f % 60 === 0) sr.render();
  }
  return game;
}

/** A quiet arena on a map: no wave spawns, the hero standing still. */
function quietMap(mapId, level = 1) {
  const game = loadGame({ seed: 4 });
  const { sr } = game;
  sr.newRunWith([{ classId: 'traveler' }], 0, { mapId, level });
  sr.run.spawnBudget = -1e9;
  for (const e of sr.run.enemies) e.dead = true;
  sr.step(FRAME);
  return game;
}

test('every map plays at level 1 and level 10 without breaking', () => {
  for (const def of loadGame().sr.maps.MAPS) {
    for (const level of [1, 10]) {
      const { sr } = soak(def.id, level, 70);
      assert.equal(sr.run.mapId, def.id);
      assert.equal(sr.run.mapLevel, level);
      assert.ok(sr.run.kills > 10, `${def.id} ${level}: the bot fights`);
    }
  }
});

test('map levels: level 1 changes nothing; each level adds its modifier', () => {
  const { sr } = loadGame();
  const m1 = sr.maps.levelMods(1), m10 = sr.maps.levelMods(10);
  assert.deepEqual({ ...m1 }, { enemyHp: 1, enemyDamage: 1, enemySpeed: 1, eliteFromWave: 7, healMul: 1, channelMul: 1, healOrbMul: 1, spawnMul: 1, bossHp: 1 });
  assert.ok(Math.abs(m10.enemyHp - 1.15 * 1.15) < 1e-9);
  assert.equal(m10.eliteFromWave, 4);
  assert.equal(m10.healOrbMul, 0.5);
  assert.equal(m10.bossHp, 1.3);

  const hp = (level) => {
    const { sr: g } = quietMap('forest', level);
    return g.spawnEnemy('orc', 100, 100, false).maxHp;
  };
  assert.ok(Math.abs(hp(2) / hp(1) - 1.15) < 1e-9, 'level 2: enemies +15% HP');
});

test('map levels: from level 3, elites can appear from wave 4', () => {
  const elitesOnWave4 = (level) => {
    const { sr } = loadGame({ seed: 8 });
    sr.DEBUG.god = true;
    sr.newRunWith([{ classId: 'oathknight' }], 0, { mapId: 'forest', level });
    sr.run.wave = 4;
    let elites = 0;
    for (let i = 0; i < 60 * 40; i++) {
      if (sr.scene === 'levelup') { sr.pickRandomForEveryone(); continue; }
      sr.run.waveTime = 0; // stay on wave 4
      sr.step(FRAME);
      elites = Math.max(elites, sr.run.enemies.filter((e) => e.elite).length);
    }
    return elites;
  };
  assert.equal(elitesOnWave4(1), 0, 'level 1: no elites before wave 7');
  assert.ok(elitesOnWave4(3) > 0, 'level 3: elites on wave 4');
});

test('Fungal Grotto: a mushroom warns, then bursts into a poison pool', () => {
  const { sr } = quietMap('grotto');
  const shroom = sr.run.hazards.find((h) => h.kind === 'mushroom');
  assert.ok(shroom, 'the grotto has mushrooms');
  assert.ok(!sr.run.hazards.some((h) => Math.hypot(h.x - sr.run.player.x, h.y - sr.run.player.y) < 150), 'none at the start');
  sr.run.player.x = shroom.x + 30;
  sr.run.player.y = shroom.y;
  sr.step(FRAME);
  assert.equal(shroom.state, 'fuse');
  assert.ok(sr.run.telegraphs.some((t) => t.kind === 'circle' && t.x === shroom.x), 'a warning circle first');
  for (let i = 0; i < 60; i++) sr.step(FRAME);
  assert.ok(sr.run.zones.some((z) => z.owner === 'enemy' && z.x === shroom.x), 'then a poison pool');
  sr.render();
});

test('Ember Wastes: standing in lava burns', () => {
  const { sr } = quietMap('ember');
  sr.DEBUG.god = false;
  const lava = sr.run.hazards.find((h) => h.kind === 'lava');
  assert.ok(lava);
  Object.assign(sr.run.player, { x: lava.x, y: lava.y });
  const hp = sr.run.player.hp;
  for (let i = 0; i < 30; i++) { sr.run.player.x = lava.x; sr.run.player.y = lava.y; sr.step(FRAME); }
  assert.ok(sr.run.player.hp < hp - 4, 'about 14 HP per second');
});

test('Bloodmoon Village: wounded enemies heal over time; the Crypt draws its darkness', () => {
  const { sr } = quietMap('bloodmoon');
  const orc = sr.spawnEnemy('orc', sr.run.player.x + 400, sr.run.player.y, false);
  orc.hp = orc.maxHp / 2;
  orc.speed = 0;
  for (let i = 0; i < 120; i++) sr.step(FRAME);
  assert.ok(orc.hp > orc.maxHp / 2 + orc.maxHp * 0.02, 'about 1.5% of max HP per second');

  const crypt = quietMap('crypt');
  crypt.counter.drawCalls = 0;
  crypt.sr.render();
  assert.ok(crypt.counter.drawCalls > 0);
});

test('map progress: reach wave 6 to open the next map; win a level to unlock the next; mastery stars', () => {
  const { sr } = loadGame();
  const P = sr.progress;
  const play = (mapId, level, { waves = 2, win = false } = {}) => {
    sr.DEBUG.god = false;
    sr.newRunWith([{ classId: 'cleric' }], 0, { mapId, level });
    sr.run.wavesCleared = waves;
    sr.run.bossesKilled = Math.floor(waves / 3);
    sr.endRunForTest(win);
    return P.lastRewards;
  };
  assert.ok(P.isMapOpen('forest'));
  assert.equal(P.isMapOpen('crypt'), false);
  assert.equal(P.selectMap('crypt', 1), false, 'a locked map can\'t be picked');
  assert.match(P.mapUnlockText('crypt'), /wave 6 on Whispering Forest/);

  const r = play('forest', 1, { waves: 5 });
  assert.ok(r.mapNews.some((n) => /Sunken Crypt/.test(n)), 'the reel says so');
  assert.ok(P.isMapOpen('crypt'));

  assert.equal(P.selectMap('forest', 2), false, 'level 2 is locked until level 1 is won');
  const w = play('forest', 1, { waves: 12, win: true });
  assert.ok(w.mapNews.some((n) => /level 2 unlocked/.test(n)));
  assert.equal(P.mapProgress('forest').level, 2);
  assert.equal(P.masteryStars('forest', 'cleric'), 2, 'won, with nobody downed');
  assert.equal(P.selectMap('forest', 2), true);
  assert.deepEqual({ ...P.selectedMap() }, { mapId: 'forest', level: 2 });

  // rewards: map multiplier x level bonus
  const base = P.runRewards({ wavesCleared: 4, bossesKilled: 1, win: false, myKills: 0, players: 1 });
  const crypt3 = P.runRewards({ wavesCleared: 4, bossesKilled: 1, win: false, myKills: 0, players: 1, mapId: 'crypt', mapLevel: 3 });
  assert.equal(crypt3.gold, Math.round(base.gold * 1.15 * 1.3));
  assert.equal(P.getProgress().highScores[0].mapId, 'forest', 'high scores remember the map');
});

test('map progress: open a map with gold; harder maps and levels shift loot toward Rare and Epic', () => {
  const { sr } = loadGame();
  sr.progress.importSave(JSON.stringify({ version: 2, gold: 1000 }));
  assert.equal(sr.progress.buyMap('grotto'), true, '800 gold');
  assert.equal(sr.progress.getProgress().gold, 200);
  assert.equal(sr.progress.buyMap('ember'), false, 'not enough gold');
  assert.equal(sr.maps.lootShift('forest', 1), 0, 'the first map at level 1: the normal odds');
  assert.ok(sr.maps.lootShift('bloodmoon', 10) >= 40);
});

test('map select panel: M opens it, keys pick maps and levels, and it never starts a run', () => {
  const { sr } = loadGame();
  sr.progress.importSave(JSON.stringify({ version: 2, maps: { forest: { open: true, level: 3, won: 2, bestWave: 12 }, crypt: { open: true, level: 1 } } }));
  sr.keysPressed.m = true;
  sr.update(FRAME);
  sr.render();
  sr.keysPressed['2'] = true; // Sunken Crypt
  sr.update(FRAME);
  assert.equal(sr.scene, 'menu');
  assert.equal(sr.progress.selectedMap().mapId, 'crypt');
  sr.keysPressed['1'] = true;
  sr.update(FRAME);
  for (let i = 0; i < 3; i++) { sr.keysPressed.arrowright = true; sr.update(FRAME); }
  assert.deepEqual({ ...sr.progress.selectedMap() }, { mapId: 'forest', level: 3 }, 'up to the highest unlocked level');
  sr.keysPressed.m = true;
  sr.update(FRAME);
  sr.keysPressed['1'] = true;
  sr.update(FRAME);
  assert.equal(sr.scene, 'play');
  assert.equal(sr.run.mapLevel, 3, 'the solo run uses the selection');
});
