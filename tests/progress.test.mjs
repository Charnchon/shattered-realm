// Saved progress (step A of docs/progression.md): rewards, Specialist levels, save versions and migration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeStorage, loadGame } from './headless.mjs';

const KEY = 'shattered-realm.progress';
const BACKUP = KEY + '.backup';

/** End a real (not test-mode) run with these numbers, as the local player. */
function finishRun(sr, classId, { waves = 4, bosses = 1, kills = 150, win = false, coop = false } = {}) {
  sr.DEBUG.god = false;
  sr.DEBUG.bot = false;
  if (coop) sr.newRunWith([{ classId }, { classId: 'cleric' }], 0);
  else sr.newRun(classId);
  sr.run.wavesCleared = waves;
  sr.run.bossesKilled = bosses;
  sr.run.hero.score.kills = kills;
  sr.endRunForTest(win);
  return sr.progress.lastRewards;
}

test('rewards: every run pays gold and class EXP by the formulas, co-op adds 10% gold', () => {
  const { sr } = loadGame();
  const r = finishRun(sr, 'cleric');
  assert.equal(r.gold, 15 * 4 + 60 * 1 + 150 / 5, 'gold = 15/wave + 60/boss + kills/5');
  assert.equal(r.exp, 20 * 4 + 80 * 1 + 150 / 5, 'EXP = 20/wave + 80/boss + kills/5');
  assert.equal(r.saved, true);
  const p = sr.progress.getProgress();
  assert.equal(p.gold, 150);
  assert.equal(p.classes.cleric.exp, 190);
  assert.deepEqual({ ...sr.progress.specialistLevel(190) }, { level: 2, into: 90, need: 200 }, 'one level-up after the first run');

  const coop = finishRun(sr, 'oathknight', { coop: true });
  assert.equal(coop.gold, Math.round(150 * 1.1), 'co-op bonus');
  assert.equal(coop.coopBonus, true);
  assert.equal(sr.progress.getProgress().gold, 150 + 165, 'gold adds up across runs');
  sr.render(); // the result screen with the rewards reel
});

test('rewards: test-mode runs show what they would pay but save nothing', () => {
  const { sr } = loadGame();
  sr.DEBUG.god = true;
  sr.newRun('traveler');
  sr.run.wavesCleared = 3;
  sr.endRunForTest(false);
  const r = sr.progress.lastRewards;
  assert.equal(r.saved, false);
  assert.ok(r.gold > 0);
  assert.equal(sr.progress.getProgress().gold, 0);
  assert.equal(sr.progress.getProgress().runs, 0);
  sr.render();
});

test('Specialist levels: 100 x level EXP each, capped at 15', () => {
  const { sr } = loadGame();
  const lv = (exp) => sr.progress.specialistLevel(exp).level;
  assert.equal(lv(0), 1);
  assert.equal(lv(99), 1);
  assert.equal(lv(100), 2);
  assert.equal(lv(300), 3);
  assert.equal(lv(10500), 15, '10,500 EXP maxes a class');
  assert.equal(sr.progress.specialistLevel(1e9).need, 0, 'nothing more to earn at max level');
});

test('saves: a version 1 save is migrated, keeping unlocks and high scores', () => {
  const v1 = JSON.stringify({
    version: 1, runs: 3, wins: 0, bestWave: 5, unlocked: ['vampire'],
    highScores: [{ score: 4200, classId: 'traveler', wave: 5, win: false, time: 300, players: 1, date: '2026-11-01' }],
  });
  const storage = fakeStorage({ [KEY]: v1 });
  const { sr } = loadGame({ storage });
  const p = sr.progress.getProgress();
  assert.equal(p.version, 2);
  assert.ok(sr.progress.isClassUnlocked('vampire'), 'unlocks survive');
  assert.equal(p.highScores[0].score, 4200, 'high scores survive');
  assert.equal(p.gold, 0, 'gold starts at zero');
  finishRun(sr, 'cleric');
  const saved = JSON.parse(storage.data[KEY]);
  assert.equal(saved.version, 2);
  assert.equal(saved.runs, 4);
  assert.equal(saved.gold, 150);
  assert.equal(storage.data[BACKUP], v1, 'the previous save is kept as a backup');
});

test('saves: a corrupt save falls back to the backup; garbage fields are cleaned', () => {
  const backup = JSON.stringify({ version: 2, runs: 7, gold: 900, unlocked: ['necro', 42], classes: { cleric: { exp: 450 }, traveler: { exp: 'lots' } } });
  const { sr } = loadGame({ storage: fakeStorage({ [KEY]: '{not json', [BACKUP]: backup }) });
  const p = sr.progress.getProgress();
  assert.equal(p.runs, 7);
  assert.equal(p.gold, 900);
  assert.deepEqual([...p.unlocked], ['necro'], 'non-string unlocks are dropped');
  assert.equal(p.classes.cleric.exp, 450);
  assert.equal(p.classes.traveler.exp, 0, 'a bad number becomes 0');
});

test('saves: a save from a newer version of the game is never overwritten', () => {
  const newer = JSON.stringify({ version: 99, runs: 50, gold: 5000, unlocked: [], somethingNew: true });
  const storage = fakeStorage({ [KEY]: newer });
  const { sr } = loadGame({ storage });
  finishRun(sr, 'cleric');
  assert.equal(storage.data[KEY], newer, 'left exactly as it was');
});

test('saves: two tabs never wipe each other\'s progress', () => {
  const storage = fakeStorage();
  const tabA = loadGame({ storage, seed: 1 }).sr;
  const tabB = loadGame({ storage, seed: 2 }).sr;
  tabA.progress.getProgress();
  tabB.progress.getProgress(); // both loaded before either saved
  finishRun(tabA, 'traveler', { waves: 3, bosses: 1 }); // unlocks the Vampire
  finishRun(tabB, 'cleric', { waves: 2, bosses: 0, kills: 50 });
  const saved = JSON.parse(storage.data[KEY]);
  assert.ok(saved.unlocked.includes('vampire'), 'tab A\'s unlock survives tab B\'s save');
  assert.equal(saved.runs, 2);
  assert.equal(saved.gold, (15 * 3 + 60 + 30) + (15 * 2 + 10), 'both runs\' gold');
  assert.ok(saved.classes.traveler.exp > 0 && saved.classes.cleric.exp > 0);
});

test('saves: export and import move a save between browsers; garbage is refused', () => {
  const { sr } = loadGame();
  finishRun(sr, 'cleric');
  const text = sr.progress.exportSave();
  const other = loadGame({ storage: fakeStorage() }).sr;
  assert.equal(other.progress.importSave('hello'), false);
  assert.equal(other.progress.importSave('[1,2]'), false);
  assert.equal(other.progress.getProgress().gold, 0, 'a refused import changes nothing');
  assert.equal(other.progress.importSave(text), true);
  assert.equal(other.progress.getProgress().gold, 150);
  assert.equal(other.progress.getProgress().classes.cleric.exp, 190);
});

// ------------------------------------------------------------ step B: accessories (final-boss loot), loadout, gold

/** A save with these accessories owned (id -> level), these worn, and this much gold. */
function withGear(sr, owned, loadout = [], gold = 0) {
  assert.equal(sr.progress.importSave(JSON.stringify({ version: 2, gold, accessories: owned, loadout })), true);
}

test('loot: the first win drops the Shard of the Crown, later wins roll the loot table', () => {
  const { sr } = loadGame({ seed: 3 });
  const first = finishRun(sr, 'cleric', { waves: 12, bosses: 4, win: true });
  assert.deepEqual({ ...first.loot }, { id: 'shard_of_the_crown', level: 1, isNew: true, gold: 0 });
  const second = finishRun(sr, 'cleric', { waves: 12, bosses: 4, win: true });
  assert.notEqual(second.loot.id, 'shard_of_the_crown');
  assert.equal(sr.progress.getProgress().accessories[second.loot.id] >= 1, true, 'kept forever');
  const loss = finishRun(sr, 'cleric', { waves: 8, bosses: 2 });
  assert.equal(loss.loot, null, 'only the final boss drops loot');
  sr.render(); // the reel shows the loot line
});

test('loot: a duplicate levels the accessory up; at max level it turns into gold', () => {
  const { sr } = loadGame({ seed: 5 });
  const all = Object.fromEntries(['titan_belt', 'wind_boots', 'monocle', 'clover_charm', 'fang_pendant', 'scholars_tome', 'feather_anklet', 'glass_heart'].map((id) => [id, 1]));
  withGear(sr, { ...all, shard_of_the_crown: 1 });
  const dup = finishRun(sr, 'cleric', { waves: 12, bosses: 4, win: true }).loot;
  assert.equal(dup.isNew, false);
  assert.equal(dup.level, 2, 'Lv 1 -> 2');
  assert.equal(sr.progress.getProgress().accessories[dup.id], 2);

  const maxed = Object.fromEntries(Object.keys(all).map((id) => [id, 3]));
  withGear(sr, { ...maxed, shard_of_the_crown: 1 });
  const goldBefore = sr.progress.getProgress().gold;
  const r = finishRun(sr, 'cleric', { waves: 12, bosses: 4, win: true });
  assert.ok(r.loot.gold > 0, 'a duplicate at max level becomes gold');
  assert.equal(sr.progress.getProgress().gold, goldBefore + r.gold + r.loot.gold);
});

test('loadout: worn accessories change the hero\'s stats; at most 3; only owned ones', () => {
  const { sr } = loadGame();
  sr.newRun('oathknight');
  const plain = { ...sr.run.stats };
  withGear(sr, { glass_heart: 2, titan_belt: 1, wind_boots: 1, monocle: 1 }, []);
  assert.equal(sr.progress.toggleEquip('glass_heart'), true);
  assert.equal(sr.progress.toggleEquip('fang_pendant'), false, 'not owned');
  sr.newRun('oathknight');
  assert.ok(Math.abs(sr.run.stats.damage / plain.damage - 1.2) < 1e-9, 'Glass Heart II: +20% damage');
  assert.ok(Math.abs(sr.run.stats.maxHp / plain.maxHp - 0.75) < 1e-9, 'trade-off: -25% max HP');
  assert.equal(sr.run.player.hp, sr.run.stats.maxHp, 'starts at full (lower) HP');
  sr.progress.toggleEquip('titan_belt');
  sr.progress.toggleEquip('wind_boots');
  assert.equal(sr.progress.toggleEquip('monocle'), false, 'all 3 slots are full');
  assert.deepEqual([...sr.progress.getProgress().loadout], ['glass_heart', 'titan_belt', 'wind_boots']);
  sr.progress.toggleEquip('glass_heart'); // take it off
  assert.equal(sr.progress.toggleEquip('monocle'), true);
});

test('gold: upgrades cost 50% then 100% of the accessory\'s value; classes can be bought', () => {
  const { sr } = loadGame();
  withGear(sr, { fang_pendant: 1 }, [], 1000);
  assert.equal(sr.progress.upgradeAccessory('fang_pendant'), true, 'Rare: 400 gold to Lv 2');
  assert.equal(sr.progress.getProgress().gold, 600);
  assert.equal(sr.progress.upgradeAccessory('fang_pendant'), false, 'Lv 3 costs 800: not enough gold');
  assert.equal(sr.progress.getProgress().accessories.fang_pendant, 2);

  assert.equal(sr.progress.classPrice('vampire'), 500);
  assert.equal(sr.progress.buyClass('vampire'), true);
  assert.ok(sr.progress.isClassUnlocked('vampire'));
  assert.equal(sr.progress.getProgress().gold, 100);
  assert.equal(sr.progress.buyClass('necro'), false, '800 gold: not enough');
  assert.equal(sr.progress.buyClass('cleric'), false, 'already open');
});

test('accessories panel: E opens it, a click wears an accessory, and it never starts a run', () => {
  const { sr } = loadGame();
  withGear(sr, { titan_belt: 1 });
  sr.keysPressed.e = true;
  sr.update(1 / 60);
  sr.render();
  sr.keysPressed['1'] = true; // row 1 = Titan Belt, not the Traveler's hotkey
  sr.update(1 / 60);
  assert.equal(sr.scene, 'menu');
  assert.deepEqual([...sr.progress.getProgress().loadout], ['titan_belt']);
  sr.keysPressed.escape = true;
  sr.update(1 / 60);
  sr.keysPressed['1'] = true;
  sr.update(1 / 60);
  assert.equal(sr.scene, 'play', 'closed: the menu works again');
  assert.equal(sr.run.hero.accessories[0].id, 'titan_belt', 'the run wears the loadout');
});
