# CLAUDE.md – context for AI assistants

Shattered Realm is a 2D top-down **wave-survival roguelike** for the browser, written in TypeScript and drawn
with simple shapes on a `<canvas>` (no art yet). This repo is a **playable prototype** of a much larger plan.

| Read this | For |
|---|---|
| `roguelike-game-design.md` | The full design and build plan (the target game: 11 classes, 10 maps, meta progression, art) |
| `docs/roadmap.md` | **The phased roadmap and decisions log.** Work on the current phase unless asked otherwise |
| `docs/plan-status.md` | **What is built vs. the plan**, and where the prototype deliberately differs. Check it before assuming a planned feature exists |
| `docs/architecture.md` | How the code fits together (run state, heroes, simulation step, rendering) |
| `docs/multiplayer.md` | Online co-op: rooms, host-authoritative snapshots, client prediction |
| `docs/development.md` | Setup, commands, tests, branches and deploy, recipes for adding content |

## Commands

```
npm install          # once (Node 22+; CI uses Node 24)
npm run build        # bundles src/main.ts → game.js, inlined into index.html (open it in a browser)
npm run typecheck    # tsc --strict; esbuild only strips types, so run this
npm test             # headless tests (~4 s); needs a fresh build first
npm run check        # typecheck + build + test: run before every commit
```

`game.js` and `index.html` are build outputs (git-ignored). Tests fail with "game.js is older than src/" if you forget to build.

## Current phase (phase 1, see `docs/roadmap.md`)

- Roster: **Traveler, Oathknight, Bounty Hunter, Cleric** open from the start; **Vampire** and **Necromancer** unlock at
  boss milestones (`UNLOCKS` in `src/meta/progress.ts`). The **Merchant was replaced by the Bounty Hunter** (bow + falcon pet).
- Progress (runs, unlocks, gold, class EXP, high scores) is saved in the browser's `localStorage` as a versioned save
  (`src/meta/progress.ts`: `migrate` upgrades old saves; bump `SAVE_VERSION` when the shape changes). Test-mode (`DEBUG.god`) and bot runs
  never count. Tests run with fresh, in-memory progress.
- Focus: keep the game easy to develop. Prefer small, data-driven changes over new systems.

## Ground rules

- **The design doc is the target, not the current state.** When the doc and code disagree, the code is the truth for
  behaviour; `docs/plan-status.md` records the known gaps. Don't "fix" code to match the plan unless asked.
- **Tech stack is vanilla**: Canvas 2D + esbuild + `node:test`. The plan's Phaser / Vite / Zod / Vitest / Playwright
  are *not* used. Don't add frameworks or dependencies without asking. The only runtime dependency is `peerjs`.
- **Shared code never checks a class id.** Classes plug in through optional hooks on `ClassDef` (`src/types.ts`).
- **Data first**: enemies, bosses, relics, stat cards and each class's 16 cards are plain tables.
- **Keep single-player identical.** Co-op features must not change a 1-player run (the soak tests guard this).
- Keep the style: short functions, a doc comment on anything non-obvious, `// ======` file banners, no `any`.

## The one concept you must know: heroes and `withHero`

Every player is a `Hero` in `run.heroes` (1 in single player, 2-4 in co-op). Fields such as `run.player`,
`run.stats`, `run.cls`, `run.cards`, `run.relics`, `run.offer`, `run.classState`, `run.allies`, `run.coinsHeld` are
**accessors for the current hero** (`run.hero`), installed by `attachHeroAccessors` in `src/game/run.ts`.

- `withHero(hero, fn)` (in `src/core/state.ts`) switches the current hero while `fn` runs, then restores it.
  Outside of it, `run.hero` is the **local** hero (this screen's player), which is what the HUD and menus draw.
- Anything that acts *for* a player must run as that player: class hooks, `hitEnemy` (damage credit, lifesteal,
  ult charge, `onKill`), healing, card picks.
- Things a player creates remember their owner and replay as them: `PlayerShot.hero`, `Zone.hero`, `Timer.hero`,
  `Enemy.bleedOwner`. Use `asHero(idx, fn)` to run as a stored index.
- To hurt a specific player use `hurtHero(hero, dmg)`; enemies target `nearestHero(x, y)`; iterate `livingHeroes()`.
- **Never cache `run.player` across a `withHero` boundary**, and never write `run.cardSlots++` meaning "everyone"
  (it only changes the current hero; loop over `run.heroes` instead).

## Online co-op in one paragraph

The host's browser runs the only simulation. Friends send `HeroInput` (+ a sequence number) and card picks; the host
sends a compact JSON snapshot 20×/s (`src/net/snapshot.ts`). A joined player **never simulates**: it rebuilds a
read-only `run` from each snapshot and renders it, gliding enemies between snapshots and **predicting its own hero's
movement** (`src/net/prediction.ts`). PeerJS connects the browsers; the room code is the host's peer id `sr-CODE`.
Details and pitfalls: `docs/multiplayer.md`.

When you change anything a screen draws, check it still reaches a joined player: either it's in the snapshot,
or it's derived from something that is. When you change hero movement or a class's dash, keep
`moveHero` / `startDash` / `dashShape` in agreement (prediction depends on it).

## Randomness and tests

Game code uses `Math.random` through `src/core/math.ts` helpers. The tests replace `Math.random` with a seeded PRNG
inside a `node:vm` sandbox (`tests/headless.mjs`), so runs are reproducible. Keep randomness inside the simulation
deterministic for a given seed (no `Date.now()` or `performance.now()` in gameplay).

Tests (`tests/*.test.mjs`) run the **built** `game.js` headless through `window.__SR` (hooks in `src/game/loop.ts`):
bot soaks for every class, 4-bot co-op, revive/defeat rules, and online tests that link two game instances with an
in-memory connection (including a 100 ms lag prediction test). Add a test with every gameplay or netcode change.

## Git and deploy

- Work on **`develop`** (CI runs `npm run check`). **`production`** deploys to GitHub Pages:
  https://charnchon.github.io/shattered-realm/
- Release: merge `develop` into `production` and push. Only do this when the user asks.
- Remote uses the SSH alias `git@github.com-personal:Charnchon/shattered-realm.git` (the owner has several GitHub
  accounts; this alias picks the personal key).
- Commit messages: short summary line, then what and why. End with the co-author line the session asks for.
