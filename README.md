# Shattered Realm – playable prototype

A wave-survival action game for the browser, written in TypeScript. No art yet: everything is drawn with simple
shapes on a canvas. There are 6 classes with 16 cards each: Traveler, Oathknight, Bounty Hunter and Cleric to start, plus Vampire and Necromancer to unlock. 12 waves
and 4 bosses.

## Docs

| File | What's in it |
|---|---|
| [roguelike-game-design.md](roguelike-game-design.md) | The full design and build plan (the target game) |
| [docs/roadmap.md](docs/roadmap.md) | The phased roadmap: what is done, what is next |
| [docs/plan-status.md](docs/plan-status.md) | What the prototype has built so far vs. the plan |
| [docs/architecture.md](docs/architecture.md) | How the code fits together |
| [docs/multiplayer.md](docs/multiplayer.md) | Online co-op: rooms, snapshots, prediction |
| [docs/development.md](docs/development.md) | Setup, tests, branches and deploy, how to add content |
| [CLAUDE.md](CLAUDE.md) | Context and rules for AI assistants working in this repo |

## Setup, build and play

Needs [Node.js](https://nodejs.org) 22 or newer.

    npm install          # once: installs TypeScript and esbuild
    npm run build        # writes index.html (and game.js)

Open `index.html` in a browser. It is fully self-contained apart from Google Fonts.
`npm run build -- --watch` rebuilds on every save.

## Online co-op (2-4 players, nothing to host)

On the class screen, **Create room** (C) gives you a 5-letter room code; friends choose **Join room** (J) and type
it, or open the invite link (`…/?room=CODE`). Everyone picks a class in the room, then the host presses Start.

- Browsers connect directly with WebRTC. [PeerJS](https://peerjs.com)'s free public server only introduces
  them (the room code becomes the host's PeerJS id, `sr-CODE`), and its public TURN relay is the fallback
  when a network blocks direct links. Nothing runs on our side: the game stays a static page.
- The host's browser runs the only simulation. Friends send their controls and card picks; the host sends
  a snapshot of the world 20 times a second (about 12 KB each, so roughly 2 Mbit/s of upload per friend).
- Co-op rules: XP is shared, everyone picks their own cards (the game waits for all), enemies chase the
  nearest player and get tougher per player. At 0 HP you're down: a teammate standing next to you for
  3 s revives you, or you return at the next wave. The run ends when everyone is down.
- The host's tab must stay in front: browsers pause background tabs, which pauses the game for everyone.

## Check

    npm run typecheck    # tsc, strict mode (esbuild only strips types, it doesn't check them)
    npm test             # headless smoke tests, ~2 s (build first)
    npm run check        # all three: typecheck, build, test

The tests run the built game in Node with a fake canvas and a seeded random generator. The bot plays every class
and the tests check that the game state stays valid, that level-up offers are well formed, that every screen renders,
and that runs are reproducible.

## Project layout

Standard ES modules: each file imports what it uses. esbuild bundles `src/main.ts` into one IIFE, which
`scripts/build.mjs` inlines into `shell.html` at `/*__GAME__*/`.

```
src/
  main.ts       entry: registers the classes, then boots the loop
  types.ts      the data model: Run, Player, Enemy (Mob | Boss), Shot, Zone, Fx, cards, ClassDef hooks, ...
  core/         constants (palette, sizes, rarities, scenes), math helpers, canvas, input, run state + stats
  world/        the simulation: enemies, bosses, waves, combat (damage/heal), projectiles, zones, pickups, effects, player
  progression/  cards, relics, stat cards, level-up offers, rerolls
  classes/      registry + index (menu order) + one file per class
  render/       drawing primitives, world, HUD, screens (level up, menu, pause, result)
  game/         run lifecycle, controls, test bot, main loop
  net/          online co-op: PeerJS transport, snapshots, rooms / lobby / host / client
  meta/         saved progress and class unlocks (localStorage)
scripts/        build script
tests/          headless runner + smoke tests
```

Key conventions:

- **State:** `run` (in `core/state.ts`) holds everything about the current run. `scene` is the current screen.
  Other modules read them directly but change them through `setRun()` / `setScene()`, since ES modules can't
  assign another module's variables. A class keeps its own typed state in `run.classState`.
- **Heroes:** each player is a `Hero` in `run.heroes`. `run.player`, `run.stats`, `run.cls`, `run.cards`, …
  read the *current* hero, which `withHero(hero, fn)` switches while the game acts for that player. Shots,
  zones and timers remember the hero who made them, so class code written for one player works in co-op.
- **Data first:** enemies (`ENEMY_TYPES`), bosses (`BOSS_DEFS`), relics, stat cards and each class's cards are plain data tables.
- **Discriminated unions** model the variants (`Enemy = Mob | Boss`, zone kinds, effect kinds, telegraphs, offer items),
  so TypeScript checks each variant's fields.
- **Hooks, not special cases:** shared code never checks for a class id. Classes plug in through optional hooks
  (`onKill`, `absorb`, `onLethal`, `drawHpOverlay`, …), all typed and documented on `ClassDef` in `src/types.ts`.
- **Layout functions** such as `levelCardRects()` and `pauseButtons()` are used by both drawing and input, so
  click areas always match what's drawn.

## Extending

- **New class:** copy one file from `src/classes/`, change the id, data, state type and hooks, then import it in
  `src/classes/index.ts`. The menu shows classes in that import order.
- **New card:** add an entry to the class's `*_CARDS` table (`part`, `ups`, optional `evo`), then read it in the
  class's hooks with `hasCard(id)`, `cardMul(id, 'damage')`, `cardExtraProjectiles(id)` or `isEvolved(id)`.
- **New enemy:** add its id to `EnemyTypeId` in `types.ts`, an entry to `ENEMY_TYPES` (traits: `undead`, `shot`,
  `shield`, `turnRate`, `bomber`, `splitInto`), a weight in `spawnWeights()` and a shape in `ENEMY_SHAPES`.
  TypeScript will point out anything you forget.
- **New boss:** add its kind to `BossKind`, an entry to `BOSS_DEFS`, then `BOSS_AI[kind]` and `BOSS_SHAPES[kind]`.

## Test hooks (browser console)

    __SR.DEBUG.god = true   // can't die (or press G on the menu)
    __SR.DEBUG.bot = true   // the game plays itself
    __SR.simulate(60)       // fast-forward 60 s (picks random cards)
    __SR.run                // current run state
