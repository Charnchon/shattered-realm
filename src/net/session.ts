// ============================================================ online session: rooms, lobby, host and client
// Host: runs the game for everyone. Applies each friend's controls and card picks, sends snapshots.
// Client: sends its controls and card picks, draws the host's snapshots. Never simulates.
import type { HeroInput, Run, SceneId } from '../types';
import { SCENE } from '../core/constants';
import { keysPressed, mouse, mouseIn } from '../core/input';
import { clamp } from '../core/math';
import { hasRun, livingHeroes, localHero, mouseWorld, run, scene, setRun, setScene, showBanner, updateCamera, withHero } from '../core/state';
import { CLASSES, CLASS_ORDER } from '../classes/registry';
import { applyInput, readLocalInput } from '../game/controls';
import { endRun, newRunWith } from '../game/run';
import { applyPick, tryReroll } from '../progression/cards';
import { joinButtons, levelCardRects, lobbyButtons, rerollButtonRect, resultButtons } from '../render/screens';
import { ageVisualEffects } from '../world/effects';
import { decodeSnapshot, encodeSnapshot, parseMessage, type Snapshot } from './snapshot';
import { CODE_LENGTH, cleanRoomCode, joinRoom, openRoom, randomRoomCode, type Conn, type PeerHandle } from './transport';

export const MAX_PLAYERS = 4;
/** Seconds between snapshots (20 per second). */
const SNAPSHOT_INTERVAL = 0.05;
const OFFER_KEYS = ['1', '2', '3'];

export interface LobbyEntry {
  name: string;
  classId: string;
  /** Left during a run; dropped when the lobby is next shown. */
  left?: boolean;
}

/** What the screens need to know about the online session. */
export const net = {
  mode: 'offline' as 'offline' | 'host' | 'client',
  code: '',
  /** Status or error line shown on the lobby and join screens. */
  status: '',
  players: [] as LobbyEntry[],
  /** This screen's slot in `players` (and `run.heroes`). */
  you: 0,
  /** The in-game "Leave game?" panel (online games don't pause). */
  menuOpen: false,
  /** Code typed on the join screen. */
  joinText: '',
  /** Shown on the class select screen, e.g. after the host leaves. */
  notice: '',
};

let peer: PeerHandle | null = null;
/** Host: connection per lobby slot (slot 0 is the host, so null). */
let remotes: (Conn | null)[] = [];
/** Client: the connection to the host. */
let hostConn: Conn | null = null;
let snapshotTimer = 0;
/** Client: seconds since the latest snapshot arrived, for smoothing movement between snapshots. */
let sinceSnapshot = 0;
/** Client: the offer we already picked from, until the host's reply arrives. */
let pickedOfferKey = '';

export const isOnline = (): boolean => net.mode !== 'offline';
const isGameScene = (s: SceneId): boolean => s === SCENE.PLAY || s === SCENE.LEVEL_UP || s === SCENE.RESULT || s === SCENE.PAUSE;
const send = (conn: Conn | null, msg: object): void => { if (conn) conn.send(JSON.stringify(msg)); };
const nameFor = (slot: number): string => (slot === 0 ? 'Host' : 'Player ' + (slot + 1));

function reset(): void {
  if (peer) peer.close();
  for (const conn of remotes) if (conn) conn.close();
  if (hostConn) hostConn.close();
  peer = null;
  remotes = [];
  hostConn = null;
  Object.assign(net, { mode: 'offline', code: '', status: '', players: [], you: 0, menuOpen: false });
  pickedOfferKey = '';
  sinceSnapshot = 0;
}

/** Close the session and go back to class select, optionally with a message. */
export function leaveOnline(notice = ''): void {
  reset();
  net.notice = notice;
  setScene(SCENE.MENU);
}

// ------------------------------------------------------------ host

/** Create a room. `openNetwork: false` skips PeerJS (tests connect in memory). */
export function hostGame(classId: string, openNetwork = true): void {
  reset();
  net.mode = 'host';
  net.code = randomRoomCode();
  net.players = [{ name: nameFor(0), classId }];
  remotes = [null];
  net.notice = '';
  setScene(SCENE.LOBBY);
  if (openNetwork) openHostRoom(2);
}

function openHostRoom(attemptsLeft: number): void {
  net.status = 'Opening the room…';
  openRoom(net.code, acceptConnection, (message) => { net.status = message; })
    .then((handle) => {
      if (net.mode !== 'host') { handle.close(); return; } // left while it was opening
      peer = handle;
      net.status = '';
    })
    .catch((err: Error) => {
      if (net.mode !== 'host') return;
      if (attemptsLeft > 1 && /taken/i.test(err.message)) { net.code = randomRoomCode(); openHostRoom(attemptsLeft - 1); return; }
      net.status = err.message;
    });
}

/** A friend connected to the room. They become a player once they say hello. */
export function acceptConnection(conn: Conn): void {
  conn.onMessage((text) => {
    try { onClientMessage(conn, parseMessage(text)); } catch (err) { console.error('bad message from a player', err); }
  });
  conn.onClose(() => onClientLeft(conn));
}

function onClientMessage(conn: Conn, msg: ReturnType<typeof parseMessage>): void {
  if (msg.t === 'hello') { addPlayer(conn, String(msg.classId)); return; }
  const slot = remotes.indexOf(conn);
  if (slot <= 0) return;
  switch (msg.t) {
    case 'class':
      if (scene === SCENE.LOBBY && CLASSES[String(msg.classId)]) {
        net.players[slot].classId = String(msg.classId);
        broadcastLobby();
      }
      break;
    case 'input': {
      const hero = hasRun() ? run.heroes[slot] : undefined;
      if (hero && scene === SCENE.PLAY) applyInput(hero.input, sanitizeInput(msg.input));
      break;
    }
    case 'pick': {
      const hero = hasRun() ? run.heroes[slot] : undefined;
      const item = hero?.offer?.items[Number(msg.i)];
      if (hero && item && scene === SCENE.LEVEL_UP) withHero(hero, () => applyPick(item));
      break;
    }
    case 'reroll': {
      const hero = hasRun() ? run.heroes[slot] : undefined;
      if (hero?.offer && scene === SCENE.LEVEL_UP) withHero(hero, () => tryReroll());
      break;
    }
  }
}

function addPlayer(conn: Conn, classId: string): void {
  if (remotes.includes(conn)) return;
  if (scene !== SCENE.LOBBY) { kick(conn, 'That game has already started.'); return; }
  if (net.players.length >= MAX_PLAYERS) { kick(conn, 'That room is full (' + MAX_PLAYERS + ' players).'); return; }
  net.players.push({ name: nameFor(net.players.length), classId: CLASSES[classId] ? classId : CLASS_ORDER[0] });
  remotes.push(conn);
  broadcastLobby();
}

function kick(conn: Conn, reason: string): void {
  send(conn, { t: 'kick', reason });
  setTimeout(() => conn.close(), 500);
}

function onClientLeft(conn: Conn): void {
  const slot = remotes.indexOf(conn);
  if (slot <= 0 || net.mode !== 'host') return;
  remotes[slot] = null;
  if (scene === SCENE.LOBBY) {
    compactLobby();
    broadcastLobby();
    return;
  }
  net.players[slot].left = true;
  if (!hasRun() || !run.heroes[slot]) return;
  const hero = run.heroes[slot];
  hero.gone = true;
  showBanner(hero.name + ' left the game', 2.5);
  if (scene === SCENE.PLAY && livingHeroes().length === 0) endRun(false);
}

/** Drop players who left; everyone after them moves up a slot. */
function compactLobby(): void {
  const keep = net.players.map((p, i) => i === 0 || (!p.left && remotes[i] !== null));
  net.players = net.players.filter((_, i) => keep[i]).map((p, i) => ({ ...p, name: nameFor(i), left: false }));
  remotes = remotes.filter((_, i) => keep[i]);
}

function broadcastLobby(): void {
  remotes.forEach((conn, slot) => send(conn, { t: 'lobby', code: net.code, players: net.players, you: slot }));
}

/** Host: start the run for everyone in the lobby. */
export function startOnlineGame(): void {
  compactLobby();
  broadcastLobby();
  newRunWith(net.players.map((p) => ({ classId: p.classId, name: p.name })), 0);
  net.menuOpen = false;
  snapshotTimer = 0;
}

/** Host: back to the lobby after a run, keeping everyone connected. */
export function returnToLobby(): void {
  compactLobby();
  setScene(SCENE.LOBBY);
  broadcastLobby();
}

/** Never trust numbers from the network: clamp them into range. */
function sanitizeInput(raw: unknown): HeroInput {
  const i = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, lim: number): number => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, -lim, lim) : 0);
  return {
    moveX: num(i.moveX, 1), moveY: num(i.moveY, 1), aimX: num(i.aimX, 1e5), aimY: num(i.aimY, 1e5),
    fire: !!i.fire, heavy: !!i.heavy, dash: !!i.dash, ult: !!i.ult,
  };
}

function hostTick(dt: number): void {
  if (!isGameScene(scene) || !hasRun()) return;
  snapshotTimer -= dt;
  if (snapshotTimer > 0) return;
  snapshotTimer = SNAPSHOT_INTERVAL;
  if (!remotes.some((c) => c)) return;
  const text = encodeSnapshot(run, scene);
  for (const conn of remotes) if (conn) conn.send(text);
}

// ------------------------------------------------------------ client

/** Join the room with this code. */
export function joinGame(code: string, classId: string): void {
  reset();
  net.mode = 'client';
  net.code = cleanRoomCode(code);
  net.notice = '';
  net.status = 'Connecting to room ' + net.code + '…';
  setScene(SCENE.JOIN);
  joinRoom(net.code)
    .then(({ conn, handle }) => {
      if (net.mode !== 'client') { handle.close(); return; } // gave up while connecting
      peer = handle;
      connectToHost(conn, classId);
    })
    .catch((err: Error) => { if (net.mode === 'client') net.status = err.message; });
}

/** Use an open connection to the host (also how tests join). */
export function connectToHost(conn: Conn, classId: string): void {
  net.mode = 'client';
  hostConn = conn;
  net.status = 'Joining…';
  conn.onMessage((text) => {
    try { onHostMessage(parseMessage(text)); } catch (err) { console.error('bad message from the host', err); }
  });
  conn.onClose(() => { if (net.mode === 'client') leaveOnline('Lost the connection to the host (they may have left the room).'); });
  send(conn, { t: 'hello', classId });
}

function onHostMessage(msg: ReturnType<typeof parseMessage>): void {
  switch (msg.t) {
    case 'lobby':
      net.players = msg.players as LobbyEntry[];
      net.you = Number(msg.you);
      net.code = String(msg.code);
      net.status = '';
      if (scene !== SCENE.LOBBY) setScene(SCENE.LOBBY);
      break;
    case 'kick':
      leaveOnline(String(msg.reason));
      break;
    case 'snap':
      applySnapshot(msg as unknown as Snapshot);
      break;
  }
}

/** Where each moving thing was drawn, and where the new snapshot says it is. */
interface Glide { fromX: number; fromY: number; toX: number; toY: number }
const glides = new WeakMap<object, Glide>();

function applySnapshot(snap: Snapshot): void {
  const previous = hasRun() && isGameScene(scene) ? run : null;
  const next: Run = decodeSnapshot(snap, net.you, previous);
  // glide enemies and heroes from where they were drawn to their new position
  const before = new Map<number, { x: number; y: number }>();
  if (previous) for (const e of previous.enemies) before.set(e.id, { x: e.x, y: e.y });
  for (const e of next.enemies) {
    const from = before.get(e.id) ?? e;
    glides.set(e, { fromX: from.x, fromY: from.y, toX: e.x, toY: e.y });
  }
  next.heroes.forEach((h, i) => {
    const from = previous?.heroes[i]?.player ?? h.player;
    glides.set(h.player, { fromX: from.x, fromY: from.y, toX: h.player.x, toY: h.player.y });
  });
  // our pick is on its way to the host: keep showing "chosen" instead of the old cards
  const mine = next.heroes[net.you];
  if (mine?.offer && offerKey(mine.offer) === pickedOfferKey) mine.offer = null;
  else pickedOfferKey = '';
  setRun(next);
  sinceSnapshot = 0;
  const shown: SceneId = snap.scene === SCENE.PAUSE ? SCENE.PLAY : snap.scene;
  if (scene !== shown) setScene(shown);
  smoothPositions(0);
}

const offerKey = (offer: NonNullable<Run['offer']>): string => offer.items.map((i) => i.kind + ':' + i.def.id + ':' + i.rarity).join('|');

/** Move everything part of the way from its old to its new position. Shots just keep flying. */
function smoothPositions(dt: number): void {
  const k = clamp(sinceSnapshot / SNAPSHOT_INTERVAL, 0, 1);
  const glide = (obj: { x: number; y: number }): void => {
    const g = glides.get(obj);
    if (!g) return;
    obj.x = g.fromX + (g.toX - g.fromX) * k;
    obj.y = g.fromY + (g.toY - g.fromY) * k;
  };
  for (const e of run.enemies) glide(e);
  for (const h of run.heroes) glide(h.player);
  for (const s of run.shots) { s.x += s.vx * dt; s.y += s.vy * dt; }
}

function clientTick(dt: number): void {
  if (!isGameScene(scene) || !hasRun()) return;
  sinceSnapshot += dt;
  smoothPositions(dt);
  ageVisualEffects(dt);
  updateCamera();
  // aim feels instant: point our own hero at the mouse without waiting for the host
  const me = localHero();
  if (me && !me.down) {
    const aim = withHero(me, mouseWorld);
    me.player.face = Math.atan2(aim.y - me.player.y, aim.x - me.player.x);
  }
}

// ------------------------------------------------------------ per-frame input handling for online screens

/** Lobby: change class, start (host), copy the invite link, leave. */
export function updateLobby(): void {
  const mySlot = net.mode === 'host' ? 0 : net.you;
  const me = net.players[mySlot];
  if (me) {
    let next = -1;
    CLASS_ORDER.forEach((_, i) => { if (keysPressed[String(i + 1)]) next = i; });
    const current = CLASS_ORDER.indexOf(me.classId);
    if (keysPressed.arrowright || keysPressed.d) next = (current + 1) % CLASS_ORDER.length;
    if (keysPressed.arrowleft || keysPressed.a) next = (current + CLASS_ORDER.length - 1) % CLASS_ORDER.length;
    if (next >= 0) setMyClass(CLASS_ORDER[next]);
  }
  const b = lobbyButtons();
  if (keysPressed.escape || (mouse.leftPressed && mouseIn(b.leave))) { leaveOnline(); return; }
  if (mouse.leftPressed && mouseIn(b.copy)) copyInviteLink();
  if (net.mode === 'host' && (keysPressed.enter || (mouse.leftPressed && mouseIn(b.start)))) startOnlineGame();
}

function setMyClass(classId: string): void {
  if (net.mode === 'host') { net.players[0].classId = classId; broadcastLobby(); return; }
  if (net.players[net.you]) net.players[net.you].classId = classId;
  send(hostConn, { t: 'class', classId });
}

export const inviteLink = (): string => {
  const loc = typeof location !== 'undefined' ? location : null;
  return (loc ? loc.origin + loc.pathname : '') + '?room=' + net.code;
};

function copyInviteLink(): void {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  if (!nav?.clipboard) { net.status = 'Copy failed. The link is ' + inviteLink(); return; }
  nav.clipboard.writeText(inviteLink()).then(
    () => { net.status = 'Invite link copied. Send it to your friends.'; },
    () => { net.status = 'Copy failed. The link is ' + inviteLink(); },
  );
}

/** Join screen: type the code, Enter to join. `classId` is the class highlighted on the menu. */
export function updateJoin(classId: string): void {
  const b = joinButtons();
  if (keysPressed.escape || (mouse.leftPressed && mouseIn(b.back))) { leaveOnline(); return; }
  if (net.mode === 'client') return; // connecting: just wait
  for (const key of Object.keys(keysPressed)) {
    if (key === 'backspace') net.joinText = net.joinText.slice(0, -1);
    else if (key.length === 1) net.joinText = cleanRoomCode(net.joinText + key);
  }
  const ready = net.joinText.length === CODE_LENGTH;
  if (ready && (keysPressed.enter || (mouse.leftPressed && mouseIn(b.join)))) joinGame(net.joinText, classId);
}

/** Paste a room code (or a whole invite link) on the join screen. */
export function pasteIntoJoin(text: string): void {
  if (scene !== SCENE.JOIN || net.mode === 'client') return;
  const fromLink = /room=([A-Za-z0-9]+)/.exec(text);
  net.joinText = cleanRoomCode(fromLink ? fromLink[1] : net.joinText + text);
}

/** Esc opens the leave panel; online games never pause. Returns true while it's open. */
export function updateOnlineMenu(): boolean {
  if (keysPressed.escape || keysPressed.p) net.menuOpen = !net.menuOpen;
  if (net.menuOpen && keysPressed.l) leaveOnline();
  return net.menuOpen;
}

/** Client: what this screen does in play, level-up and result. */
export function updateClientScene(): void {
  if (!hasRun()) return;
  if (scene === SCENE.PLAY) {
    const menuOpen = updateOnlineMenu();
    const me = localHero();
    // read this frame's keys now: one-shot presses are cleared at the end of the frame
    const input = readLocalInput(run.camera);
    me.input = menuOpen ? { ...input, moveX: 0, moveY: 0, fire: false, heavy: false, dash: false, ult: false } : input;
    send(hostConn, { t: 'input', input: me.input });
  } else if (scene === SCENE.LEVEL_UP) {
    const offer = run.offer;
    if (!offer) return;
    offer.hover = levelCardRects().findIndex((r) => mouseIn(r));
    let chosen = mouse.leftPressed ? offer.hover : -1;
    OFFER_KEYS.forEach((k, i) => { if (keysPressed[k]) chosen = i; });
    if (chosen >= 0 && offer.items[chosen]) {
      send(hostConn, { t: 'pick', i: chosen });
      pickedOfferKey = offerKey(offer);
      run.hero.offer = null; // shows "waiting" until the host answers
    } else if (keysPressed.r || (mouse.leftPressed && mouseIn(rerollButtonRect()))) {
      send(hostConn, { t: 'reroll' });
    }
  } else if (scene === SCENE.RESULT) {
    const b = resultButtons();
    if (keysPressed.escape || (mouse.leftPressed && mouseIn(b.menu))) leaveOnline();
  }
}

/** Host: result screen. Play again with the same group, or go back to the lobby. */
export function updateHostResult(): void {
  const b = resultButtons();
  if (keysPressed.enter || (mouse.leftPressed && mouseIn(b.again))) startOnlineGame();
  else if (keysPressed.escape || (mouse.leftPressed && mouseIn(b.menu))) returnToLobby();
}

/** Once per frame, after the scene update: send snapshots (host) or animate them (client). */
export function netTick(dt: number): void {
  if (net.mode === 'host') hostTick(dt);
  else if (net.mode === 'client') clientTick(dt);
}

/** Opened with ?room=CODE: join straight away. */
export function joinFromUrl(classId: string): void {
  if (typeof location === 'undefined') return;
  const code = cleanRoomCode(new URLSearchParams(location.search).get('room') || '');
  if (code.length !== CODE_LENGTH) return;
  // drop ?room= from the address bar so a reload doesn't rejoin a finished room
  if (typeof history !== 'undefined') history.replaceState(null, '', location.pathname);
  joinGame(code, classId);
}
