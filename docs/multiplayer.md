# Online co-op

2-4 players, browser to browser, with nothing to host. Not part of the original design plan; added to the
prototype in November 2026.

## Player flow

1. Class select → **Create room** (C). The host gets a 5-letter code (no look-alike letters: no 0/O, 1/I/L).
2. Friends → **Join room** (J) and type the code, paste it, or open the invite link `…/shattered-realm/?room=CODE`
   (the link joins straight away, then clears itself from the address bar).
3. Lobby: everyone changes class with 1-4 or ←/→. The host presses **Start** (Enter).
4. After a run, the host can **Play again** with the same group or go **Back to room**.

Rooms close to new players once a run starts. A player who leaves mid-run is marked `gone`; the others continue.

## Co-op rules

| Rule | Where |
|---|---|
| Enemies chase the **nearest living** hero; bosses target the nearest and their area attacks hit every hero in range | `world/enemies.ts`, `world/bosses.ts` |
| Scaling per extra player: enemy HP +50%, boss HP +70%, spawn rate +60%, enemy cap +25% | `partyScale()` in `core/state.ts` |
| XP is shared; coins and heal orbs go to whoever collects them; magnet effects pull to their owner | `world/pickups.ts` |
| Each player picks their own card; the game waits for all; bots and departed players auto-pick | `progression/cards.ts`, `game/loop.ts` |
| At 0 HP a hero is **down**. A teammate standing within 46 px for 3 s revives them (40% HP); everyone downed returns at the next wave (50% HP) | `world/combat.ts`, `game/loop.ts`, `world/waves.ts` |
| The run ends when no hero is standing | `checkPlayerDeath` |
| Boss card-slot reward goes to every hero | `onBossDefeated` |
| Online games don't pause: Esc opens a leave panel (L to leave) while the game runs on | `updateOnlineMenu` |

## Connection (`net/transport.ts`)

- [PeerJS](https://peerjs.com) 1.5.4 (bundled, pinned). Its free public signalling server introduces the browsers;
  then they talk directly over a WebRTC data channel. If a network blocks direct links, PeerJS's default config
  falls back to its public TURN relay (`eu-0` / `us-0.turn.peerjs.com`) after Google STUN.
- The host opens a peer with id `sr-<CODE>`; a joiner opens an anonymous peer and connects to that id.
- Channel options: `reliable: true` (ordered, retransmitted) and `serialization: 'raw'` (we send JSON strings).
- `Conn` is a tiny interface (`send`, `close`, `onMessage`, `onClose`), so tests can use an in-memory pipe.

## Authority and messages

The **host is authoritative**: it runs the only simulation (`step`). Joiners never simulate.

| Direction | Message | Meaning |
|---|---|---|
| client → host | `{t:'hello', classId}` | Join the lobby |
| client → host | `{t:'class', classId}` | Change class in the lobby |
| client → host | `{t:'input', input, seq}` | One frame of `HeroInput` (move, aim, fire, heavy, dash, ult) + its sequence number. Sent every frame |
| client → host | `{t:'pick', i}` / `{t:'reroll'}` | Level-up choice |
| host → client | `{t:'lobby', code, players, you}` | Lobby state; `you` is the client's slot (= hero index) |
| host → client | `{t:'snap', …}` | A snapshot (below), 20 per second while in a game scene |
| host → client | `{t:'kick', reason}` | Room full, or the game already started |

The host clamps every number it receives (`sanitizeInput`) and ignores messages that don't fit the current scene.
One-shot presses (dash, ult) are **latched** by `applyInput` until the next step uses them, so none are lost when
several inputs arrive between host frames.

## Snapshots (`net/snapshot.ts`)

`encodeSnapshot(run, scene)` sends what screens need to draw, not the full simulation:

- Scalars: scene, time, wave and timers, kills, shake, banner, safe zone, result.
- Heroes: full (`player`, `stats`, cards, relics, `offer`, `classState`, `allies`, `ack`, down/revive/gone).
  `classState` goes through a JSON replacer: numbers rounded to 2 decimals, functions dropped, `Set`s sent as a marker
  and revived as empty `Set`s (class drawing code expects them to exist).
- Busy lists packed into arrays: mobs `[id, type, x, y, face, hpFrac, flags, r]`, shots, zones, gems, coins.
  Bosses are sent whole (few fields, needed for the boss bar and AI-driven drawing).
- Particles and floating texts: **only new ones** (a `WeakSet` remembers what was sent; capped per snapshot). Clients
  age them locally with `ageVisualEffects`.

Measured in a 4-player bot run to wave 7: average **~12 KB**, max **~24 KB** per snapshot, i.e. about
**2 Mbit/s upload per friend** for the host. Keep messages under 64 KB (the safe cross-browser WebRTC message size);
`tests/net.test.mjs` asserts it.

`decodeSnapshot` rebuilds a `Run` with `createRunShell` (same hero accessors as the host), so the normal renderer
draws it unchanged.

## Smoothness on a joined player's screen (`net/session.ts`, `net/prediction.ts`)

- **Enemies and other players glide** from where they were drawn to the new snapshot position over one snapshot
  interval (matched by enemy `id` / hero index). Shots keep flying by their velocity between snapshots.
- **Own aim** is applied instantly (the hero faces the mouse locally).
- **Own movement is predicted** (client-side prediction with reconciliation):
  1. Each frame the client reads input, numbers it (`seq`), sends it, and moves its own hero right away with the
     same `moveHero` / `startDash` the host uses, using the class's side-effect-free `dashShape`.
  2. It remembers its predicted position for each `seq`.
  3. Every snapshot carries `ack`: the latest `seq` the host has applied for that hero. The client compares the host's
     position with its own prediction for `ack`. The difference is the error: the logical position (and the
     predictions still in flight) shift by it, while the drawn position slides over ~0.1 s.
  4. Errors over 160 px (revive, new run, a lunge) snap instead of slide. Being down or the result screen resets it.

Not predicted (they appear after a round trip): attack visuals and damage, getting hit, heavy-strike lunges,
pickups, level-ups. Ideas for later: show the client's own slash/bolt effects immediately (cosmetic only).

## Pitfalls when changing code

- New thing a screen draws? It must be in the snapshot or derivable from it, or joined players won't see it.
- Changed hero movement or a dash? Keep `moveHero`, `startDash` and every class's `dashShape` in agreement with
  the real `dash` hook, or prediction will rubber-band. The 100 ms-lag test in `tests/net.test.mjs` catches drift.
- Something per-player stored on `Run`? Put it on `Hero` (and in `HERO_FIELDS` if classes read it via `run.x`).
- Anything a player causes must run as that player (`withHero` / `asHero`), or credit, lifesteal and class hooks go
  to the wrong hero.
- The host's tab must stay in the foreground: browsers throttle background tabs, which stalls the game for everyone.
- The free PeerJS cloud server is a dependency: if it's down, rooms can't be created (running games continue).

## Tests

`tests/net.test.mjs` loads two separate game instances (each in its own `node:vm` sandbox) and links them with an
in-memory `Conn` pair that can add latency:

- a friend joins and shows up in the lobby; class changes reach the host
- a full minute online: friend's input moves their hero on the host, snapshots stream and stay < 64 KB, the friend
  sees level-ups and their picks land on their hero, both screens agree on wave/kills/enemies
- disconnects: a friend leaving mid-run is dropped; the host leaving sends the friend to the menu with a message
- the room is closed once a game starts
- prediction with 100 ms lag each way: instant response, dash shown at once, screens agree within 3 px afterwards
