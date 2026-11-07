# Architecture

How the prototype's code fits together. For what the game *should* become, see `../roguelike-game-design.md`;
for the gap between the two, `plan-status.md`.

## Build and runtime

```
src/main.ts ──esbuild (IIFE, es2022)──▶ game.js ──inlined at /*__GAME__*/──▶ shell.html ──▶ index.html
```

- `scripts/build.mjs` bundles everything (including `peerjs`) into one script and writes a self-contained
  `index.html`. The only external request is Google Fonts (and the PeerJS server, only when playing online).
- PeerJS is loaded with a dynamic `import()`. esbuild inlines it, but its code only runs when someone opens or
  joins a room, so single player and the Node test sandbox never touch WebRTC.
- The view is a fixed 960×540 logical canvas, scaled to fit the window (`core/canvas.ts`). The arena is 2400×1600.
- `game/loop.ts` runs `update(dt)` then `render()` on every `requestAnimationFrame`, with `dt` capped at 50 ms.

## Source layout

```
src/
  main.ts          entry: registers the classes, then boots the loop
  types.ts         the data model (Run, Hero, Player, Enemy = Mob | Boss, Shot, Zone, Fx, cards, ClassDef hooks…)
  core/            constants, math + random helpers, canvas, keyboard/mouse input, global state (run, scene, withHero)
  world/           the simulation: player movement, enemies, bosses, waves, combat, projectiles, zones, pickups, effects
  progression/     cards, relics, stat cards, level-up offers, rerolls
  classes/         registry + one file per class (traveler, oathknight, bountyhunter, cleric, vampire, necromancer) + index (menu order)
  render/          drawing primitives, world, HUD, screens (menu, level-up, pause, result, lobby, join)
  game/            run lifecycle (newRun / newRunWith / endRun), local controls, test bot, main loop + scenes
  net/             online co-op: transport (PeerJS), snapshot encode/decode, prediction, session (lobby/host/client)
  meta/            saved progress (localStorage) and class unlock rules
tests/             headless runner (node:vm sandbox) + tests
scripts/build.mjs  build script
```

## State

`core/state.ts` owns the globals. ES modules can't assign another module's variables, so changes go through setters.

| Global | What it is |
|---|---|
| `run` | Everything about the current run (`Run` in `types.ts`). Built by `newRunWith`. `hasRun()` before reading it from menus |
| `scene` | `'menu' \| 'play' \| 'pause' \| 'levelup' \| 'result' \| 'lobby' \| 'join'` |
| `DEBUG` | `god` (can't die), `bot` (the local hero is played by the test bot) |

### Shared vs. per-hero state

`Run` holds the shared world: wave and timers, enemies, shots, zones, gems, coins, effects, telegraphs, timers,
camera, banner, kills, safe zone, result.

Each `Hero` (in `run.heroes`) holds one player's body and build: `player` (position, HP, XP, level, ult, cooldowns),
`stats`, `cls`, `cards`, `relics`, `statCards`, `cardSlots`, `offer`, `rerolls`, `pendingLevelUps`, `coinsHeld`,
`magnetAllTime`, `allies` (vampire thralls), `classState`, `input`, plus co-op flags `down`, `revive`, `gone`, `bot`.

`run.player`, `run.stats`, `run.cls`, … are **property accessors** that read and write `run.hero` (the current
hero). That is how classes written for one player work unchanged in co-op:

```ts
withHero(hero, () => {
  run.player.hp;      // hero.player.hp
  run.cls.heavy();    // hero's class hook, seeing hero's cards and classState
});
```

Ownership is remembered on anything a player creates, and replayed with `asHero(idx, fn)`:

| Thing | Owner field | Replayed in |
|---|---|---|
| Player projectile | `PlayerShot.hero` (set by `fireShot`) | `updateShots` |
| Player ground zone | `Zone.hero` (set by `addZone`) | `updateZones` |
| Scheduled callback | `Timer.hero` (set by `schedule`) | `updateEffects` |
| Bleed on an enemy | `Enemy.bleedOwner` (set by `applyBleed`) | `updateEnemies` |

## One simulation step (`step(dt)` in `game/loop.ts`)

Only the single-player game and the online **host** call `step`. A joined player never does.

1. Bots think (`botThink`) for bot-controlled heroes; they write `hero.input` like a keyboard would.
2. Each living hero: `updatePlayer` (move/dash via `moveHero`, cooldowns, regen, heavy, ult, strike) as that hero.
3. Each living hero: `cls.update` (pets, orbiting things, timers) as that hero.
4. `updateEnemies` (chase the nearest living hero; bosses run their AI *as* their target, so `run.player` is the target),
   `updateShots`, `updateZones`, `updatePickups`.
5. `updateWave` (spawning, wave end, bosses), `updateEffects` (particles, texts, telegraphs, scheduled timers),
   `updateRevives`, safe-zone damage.
6. Clean-up, banner, screen shake, camera (follows the local hero).
7. `offerPendingLevelUps()`: every hero with level-ups gets an offer; the game switches to `levelup` and only
   resumes when **every** hero has picked (`everyoneHasChosen`).

### Combat flow

- `hitEnemy(e, amount, opts)` runs as the attacker: damage × stats, class `damageMod`, crits, shield-orc frontal block,
  heavy-hit effects (break shields, boss stagger), knockback, lifesteal, ult charge from boss damage, `onCrit`,
  `onHit`, then `killEnemy` (gems, ult charge, split slimes, `onKill`).
- `hurtPlayer(amount)` hurts the current hero: i-frames, dash, armor, bone shield, class `absorb`, then
  `checkPlayerDeath` → class `onLethal`, else the hero is **down**. The run ends when no hero is left standing.
- Area helpers: `damageInCircle`, `damageInArc`, `damageInLine`.

### Progression

- XP gems are **shared**: every hero gets every gem's XP, so the party levels together.
- `makeOffer` builds 3 items: ready evolutions first (legendary), the first-offer starter picks (3 different parts),
  weighted cards/relics, then stat cards as filler. `applyPick` applies one, `tryReroll` rerolls.
- `recalcStats` rebuilds the current hero's `Stats` from class base, relics, stat cards and level, then the class's
  `modifyStats`, then hard caps.

## Classes

A class is one file that calls `registerClass({...})` with data (`base`, `cards`, `ratings`, `kit`, `keys`,
`favoredParts`, `heavyCooldown`) and hooks. Required: `init`, `strike`, `heavy`, `ult`, `update`, `draw`, `resource`.
Optional hooks are documented on `ClassDef` in `types.ts` (`dash`, `dashShape`, `onDashMove`, `onDashEnd`,
`modifyStats`, `bonusArmor`, `damageMod`, `lifestealMul`, `onHit`, `onCrit`, `onKill`, `onHeal`, `absorb`,
`onLethal`, `onWaveStart`, `onCoin`, `pickupHelpers`, `rerollCost`, `drawHpOverlay`, `botRallyPoint`).

Each class keeps its own typed state in `run.classState` (`const state = () => run.classState as XState`).
Class card helpers: `hasCard(id)`, `cardLevel(id)`, `cardMul(id, 'damage')`, `cardExtraProjectiles(id)`, `isEvolved(id)`.

`dashShape` must return the same geometry as `dash` **without side effects**. Online clients call it to predict their
own dash (a `dash` hook may hit enemies or drop zones, e.g. the Bounty Hunter's Swoop Guard, so it can't be run on a client).

## Rendering

`render()` picks the screen by scene. In-game: `drawWorld()` (ground, safe zone, zones, telegraphs, pickups, enemies,
then each hero's class `draw` + body + name tag, shots, effects, floating texts), `drawHUD()` (local hero's portrait,
vitals, teammates, wave, boss bar, cards, ability bar, class resource, banner), then overlays (level-up, pause,
result, online leave panel).

Layout functions (`levelCardRects`, `menuCardRects`, `lobbyButtons`, …) are used by both drawing and input, so
click areas always match what is drawn.

## Test hooks

`window.__SR` (installed by `installTestHooks`) exposes the run, scene, `DEBUG`, `step`, `update`, `render`,
`newRun`, `newRunWith`, `simulate(seconds)`, `pickRandomForEveryone`, `hurtHero`, the online session functions and
`keysDown` / `keysPressed`. The headless tests drive the game only through this object.
