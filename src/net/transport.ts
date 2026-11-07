// ============================================================ transport: browser-to-browser connections
// PeerJS gives each browser an id on its free public signalling server, then connects two browsers
// directly over WebRTC (falling back to its public TURN relay when a network blocks direct links).
// The host's id is `sr-<ROOM CODE>`, so a friend only needs the code to find the room. Nothing to host.
import type { DataConnection, Peer } from 'peerjs';

/** A text message pipe to one other player. Tests use an in-memory version. */
export interface Conn {
  send(text: string): void;
  close(): void;
  onMessage(cb: (text: string) => void): void;
  onClose(cb: () => void): void;
}

const ID_PREFIX = 'sr-';
/** Room codes skip look-alike characters (0/O, 1/I/L). */
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;

export function randomRoomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

/** Keep only characters a room code can contain, upper-cased. */
export const cleanRoomCode = (text: string): string =>
  text.toUpperCase().split('').filter((c) => CODE_CHARS.includes(c)).join('').slice(0, CODE_LENGTH);

// PeerJS is bundled but only loaded when someone goes online.
let peerModule: Promise<typeof import('peerjs')> | null = null;
const loadPeerJs = (): Promise<typeof import('peerjs')> => (peerModule ??= import('peerjs'));

/** Readable reasons for the PeerJS errors players can actually hit. */
function describePeerError(err: { type?: string; message?: string }): string {
  switch (err.type) {
    case 'peer-unavailable': return 'No room with that code. Check the code and try again.';
    case 'unavailable-id': return 'That room code is taken. Try again.';
    case 'browser-incompatible': return 'This browser does not support online play.';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed': return 'Could not reach the matchmaking server. Check your internet connection.';
    default: return 'Connection error: ' + (err.message || err.type || 'unknown');
  }
}

/** One open PeerJS identity (a host's room, or a joining player). */
export interface PeerHandle {
  close(): void;
}

function wrap(dc: DataConnection): Conn {
  return {
    send: (text) => { if (dc.open) dc.send(text); },
    close: () => dc.close(),
    onMessage: (cb) => { dc.on('data', (data) => cb(String(data))); },
    onClose: (cb) => { dc.on('close', cb); dc.on('error', cb); },
  };
}

/** Open a room with this code. `onConnection` gets each friend who joins. */
export async function openRoom(code: string, onConnection: (conn: Conn) => void, onError: (message: string) => void): Promise<PeerHandle> {
  const { Peer } = await loadPeerJs();
  return new Promise((resolve, reject) => {
    const peer: Peer = new Peer(ID_PREFIX + code, { debug: 1 });
    let opened = false;
    peer.on('open', () => { opened = true; resolve({ close: () => peer.destroy() }); });
    peer.on('connection', (dc) => {
      dc.on('open', () => onConnection(wrap(dc)));
    });
    peer.on('error', (err) => {
      const message = describePeerError(err);
      if (opened) onError(message);
      else { peer.destroy(); reject(new Error(message)); }
    });
    // Lost the signalling server: friends who already joined stay connected, new ones can't join.
    peer.on('disconnected', () => { if (opened && !peer.destroyed) peer.reconnect(); });
  });
}

/** Connect to the room with this code. */
export async function joinRoom(code: string): Promise<{ conn: Conn; handle: PeerHandle }> {
  const { Peer } = await loadPeerJs();
  return new Promise((resolve, reject) => {
    const peer: Peer = new Peer({ debug: 1 });
    const fail = (message: string): void => { peer.destroy(); reject(new Error(message)); };
    const timer = setTimeout(() => fail('Could not connect to the room. The host may be behind a strict network, or the code is wrong.'), 20000);
    peer.on('error', (err) => { clearTimeout(timer); fail(describePeerError(err)); });
    peer.on('open', () => {
      const dc = peer.connect(ID_PREFIX + code, { reliable: true, serialization: 'raw' });
      dc.on('open', () => {
        clearTimeout(timer);
        resolve({ conn: wrap(dc), handle: { close: () => peer.destroy() } });
      });
    });
  });
}
