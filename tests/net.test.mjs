// Online co-op, end to end: two separate game instances (host and friend) linked by an in-memory
// connection that carries the same JSON text messages PeerJS would.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './headless.mjs';

/**
 * Two connected ends. Messages queue up until `pump()`, like a real network between frames.
 * With `latencyFrames`, each message waits that many `pump()` calls first (one-way delay).
 */
function linkedConnections({ latencyFrames = 0 } = {}) {
  const queue = [];
  let now = 0;
  const stats = { maxBytes: 0, snapshots: 0 };
  const makeEnd = () => ({ onMsg: [], onClose: [], closed: false, peer: null });
  const a = makeEnd(), b = makeEnd();
  a.peer = b; b.peer = a;
  const api = (end) => ({
    send(text) {
      if (end.closed) return;
      if (text.startsWith('{"t":"snap"')) { stats.snapshots++; stats.maxBytes = Math.max(stats.maxBytes, text.length); }
      const deliver = () => { if (!end.peer.closed) end.peer.onMsg.forEach((cb) => cb(text)); };
      deliver.at = now + latencyFrames;
      queue.push(deliver);
    },
    close() {
      if (end.closed) return;
      end.closed = true;
      // like a real data channel, both ends hear about it
      queue.push(() => {
        end.peer.closed = true;
        end.peer.onClose.forEach((cb) => cb());
        end.onClose.forEach((cb) => cb());
      });
    },
    onMessage(cb) { end.onMsg.push(cb); },
    onClose(cb) { end.onClose.push(cb); },
  });
  /** Deliver everything that is due (in order), then advance the clock one step. */
  const pump = () => {
    while (queue.length && (queue[0].at === undefined || queue[0].at <= now)) queue.shift()();
    now++;
  };
  return { hostEnd: api(a), friendEnd: api(b), pump, stats };
}

/** Host (bot-played cleric) and a friend (vampire), in the lobby. */
function setUpRoom({ latencyFrames = 0 } = {}) {
  const host = loadGame({ seed: 5 });
  const friend = loadGame({ seed: 6 });
  const link = linkedConnections({ latencyFrames });
  host.sr.DEBUG.god = true;
  host.sr.DEBUG.bot = true;
  host.sr.hostGame('cleric', false);
  host.sr.acceptConnection(link.hostEnd);
  friend.sr.connectToHost(link.friendEnd, 'vampire');
  for (let i = 0; i <= latencyFrames * 2 + 1; i++) link.pump();
  return { host, friend, link };
}

const sendAsFriend = (link, msg) => link.friendEnd.send(JSON.stringify(msg));
const FRAME = 1 / 60;

test('online: a friend joins the room and shows up in the lobby', () => {
  const { host, friend } = setUpRoom();
  assert.equal(host.sr.scene, 'lobby');
  assert.equal(host.sr.net.players.length, 2);
  assert.equal(host.sr.net.players[1].classId, 'vampire');
  assert.equal(friend.sr.scene, 'lobby');
  assert.equal(friend.sr.net.you, 1);
  assert.equal(friend.sr.net.code, host.sr.net.code);
});

test('online: the friend plays a full minute from snapshots, moves, and picks cards', () => {
  const { host, friend, link } = setUpRoom();
  sendAsFriend(link, { t: 'class', classId: 'merchant' });
  link.pump();
  assert.equal(host.sr.net.players[1].classId, 'merchant', 'class change reaches the host');

  host.sr.startOnlineGame();
  assert.equal(host.sr.scene, 'play');
  assert.equal(host.sr.run.heroes.length, 2);

  // friend holds "right" for the first two seconds
  const start = { ...host.sr.run.heroes[1].player };
  let friendPicks = 0, levelUpsSeenByFriend = 0;
  for (let frame = 0; frame < 60 * 60; frame++) {
    const moving = frame < 120;
    sendAsFriend(link, { t: 'input', input: { moveX: moving ? 1 : 0, moveY: 0, aimX: 0, aimY: 0, fire: true, heavy: false, dash: false, ult: false } });
    if (friend.sr.scene === 'levelup' && friend.sr.run.offer) {
      levelUpsSeenByFriend++;
      sendAsFriend(link, { t: 'pick', i: 0 });
      friendPicks++;
    }
    link.pump();
    host.sr.update(FRAME);
    link.pump();
    friend.sr.update(FRAME);
    link.pump();
    if (frame === 119) assert.ok(host.sr.run.heroes[1].player.x > start.x + 100, 'the friend\'s input moves their hero on the host');
    if (frame % 30 === 0) { friend.sr.render(); host.sr.render(); }
    if (host.sr.scene === 'result') break;
  }

  assert.ok(link.stats.snapshots > 500, `snapshots should stream (got ${link.stats.snapshots})`);
  assert.ok(link.stats.maxBytes < 64 * 1024, `snapshots must fit a WebRTC message (biggest was ${link.stats.maxBytes} bytes)`);
  assert.ok(friendPicks > 0 && levelUpsSeenByFriend > 0, 'the friend sees level-ups and picks cards');
  const remoteHero = host.sr.run.heroes[1];
  assert.ok(Object.keys(remoteHero.cards).length > 0, 'the friend\'s picks land on their hero');
  assert.ok(Object.keys(remoteHero.cards).every((id) => remoteHero.cls.cards.some((c) => c.id === id)), 'merchant cards only');

  // the friend's screen mirrors the host's world
  const fr = friend.sr.run;
  assert.equal(fr.heroes.length, 2);
  assert.equal(fr.hero, fr.heroes[1], 'the friend\'s screen follows their own hero');
  assert.equal(fr.wave, host.sr.run.wave);
  assert.equal(fr.kills, host.sr.run.kills);
  assert.ok(Math.abs(fr.enemies.length - host.sr.run.enemies.length) <= 12, 'about the same enemies on both screens');
  assert.ok(friend.counter.drawCalls > 1000, 'the friend\'s screen renders the world');
  assert.equal(friend.sr.scene, host.sr.scene);
});

test('online: a friend who disconnects mid-run is dropped, and the host leaving sends the friend to the menu', () => {
  const { host, friend, link } = setUpRoom();
  host.sr.startOnlineGame();
  for (let i = 0; i < 30; i++) { host.sr.update(FRAME); link.pump(); friend.sr.update(FRAME); link.pump(); }
  assert.equal(friend.sr.scene, 'play');

  link.friendEnd.close();
  link.pump();
  assert.equal(host.sr.run.heroes[1].gone, true, 'the friend\'s hero is marked as gone');
  assert.equal(host.sr.scene, 'play', 'the host keeps playing');
  assert.equal(friend.sr.scene, 'menu');

  // a second room: this time the host leaves
  const room = setUpRoom();
  room.host.sr.startOnlineGame();
  for (let i = 0; i < 10; i++) { room.host.sr.update(FRAME); room.link.pump(); room.friend.sr.update(FRAME); room.link.pump(); }
  room.host.sr.leaveOnline();
  room.link.pump();
  assert.equal(room.friend.sr.scene, 'menu');
  assert.match(room.friend.sr.net.notice, /host/i);
});

test('online prediction: with 100 ms lag each way, the friend moves instantly on their screen and ends up where the host has them', () => {
  const { host, friend, link } = setUpRoom({ latencyFrames: 6 });
  host.sr.DEBUG.bot = false; // nobody fights, so no level-up interrupts the test
  host.sr.startOnlineGame();
  const friendView = () => friend.sr.run.heroes[1].player;
  const onHost = () => host.sr.run.heroes[1].player;
  const tick = () => { host.sr.update(FRAME); link.pump(); friend.sr.update(FRAME); link.pump(); };
  for (let i = 0; i < 40; i++) tick(); // first snapshots arrive
  assert.equal(friend.sr.scene, 'play');

  // walk right: the friend's own screen reacts on the very first frames, the host hasn't heard yet
  const startView = friendView().x, startHost = onHost().x;
  friend.sr.keysDown.d = true;
  for (let i = 0; i < 3; i++) tick();
  assert.ok(friendView().x - startView > 5, `friend's hero should move at once (moved ${friendView().x - startView})`);
  assert.equal(onHost().x, startHost, 'the input is still on its way to the host');

  for (let i = 0; i < 90; i++) tick();
  friend.sr.keysDown.d = false;
  // dash: also predicted
  const beforeDash = friendView().x;
  friend.sr.keysPressed.space = true;
  tick();
  for (let i = 0; i < 4; i++) tick();
  assert.ok(Math.abs(friendView().x - beforeDash) > 60, 'the dash shows up right away on the friend\'s screen');

  for (let i = 0; i < 60; i++) tick(); // settle
  const gap = Math.hypot(friendView().x - onHost().x, friendView().y - onHost().y);
  assert.ok(gap < 3, `both screens agree on where the friend is (gap ${gap.toFixed(2)} px)`);
  assert.ok(onHost().x - startHost > 200, 'and the host really moved them');
});

test('online: the room is closed to new players once the game starts', () => {
  const { host, link } = setUpRoom();
  host.sr.startOnlineGame();
  const late = loadGame({ seed: 9 });
  const lateLink = linkedConnections();
  host.sr.acceptConnection(lateLink.hostEnd);
  late.sr.connectToHost(lateLink.friendEnd, 'necro');
  lateLink.pump();
  link.pump();
  assert.equal(host.sr.run.heroes.length, 2);
  assert.equal(late.sr.scene, 'menu');
  assert.match(late.sr.net.notice, /already started/);
});
