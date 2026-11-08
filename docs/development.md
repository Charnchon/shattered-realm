# Development guide

## Setup

Needs [Node.js](https://nodejs.org) 22 or newer (CI uses 24).

```
npm install
npm run build        # writes game.js and index.html
```

Open `index.html` in a browser. `npm run build -- --watch` rebuilds on every save.

| Command | What it does |
|---|---|
| `npm run typecheck` | `tsc` in strict mode. esbuild only strips types, so this is the only type check |
| `npm run build` | Bundle `src/main.ts` (+ peerjs) into `game.js` and inline it into `index.html` |
| `npm test` | Headless tests with `node --test` (~4 s). Uses the **built** `game.js`, so build first |
| `npm run check` | All three. Run before every commit; CI runs the same |

Test hooks in the browser console:

```
__SR.DEBUG.god = true   // can't die (or press G on the menu)
__SR.DEBUG.bot = true   // the bot plays your hero
__SR.simulate(60)       // fast-forward 60 s, picking random cards
__SR.run                // current run state
__SR.net                // online session state
```

Online play needs two browser windows (two tabs work, but keep the host's tab in front). For quick local checks,
the in-memory tests in `tests/net.test.mjs` are faster than two real browsers.

## Branches, CI and deploy

| Branch | Purpose | On push |
|---|---|---|
| `develop` | Day-to-day work | **CI** (`.github/workflows/ci.yml`): `npm ci` + `npm run check` |
| `production` | The live game | **Deploy** (`.github/workflows/deploy.yml`): check, build, publish `index.html` to GitHub Pages |
| `main` | GitHub's default branch from the first push; not updated since (`develop` and `production` are ahead) | CI |

Live site: https://charnchon.github.io/shattered-realm/

Release:

```
git switch production
git merge --ff-only develop
git push
git switch develop
```

GitHub settings this relies on: Pages source = **GitHub Actions**, and the `github-pages` environment allows the
`production` branch to deploy.

The remote uses the SSH host alias `github.com-personal` from `~/.ssh/config` (the owner has a personal and an
Atiom work GitHub account, each with its own key).

## Tests

All tests run the built game inside a `node:vm` sandbox with a stub canvas and a **seeded `Math.random`**
(`tests/headless.mjs`), so every run is reproducible.

| File | Covers |
|---|---|
| `tests/game.test.mjs` | build is fresh; menu renders; 4-min bot soak per class (valid state, reaches wave 4+, picks cards); same seed = same run; pause/result render; shield orc turn rate; co-op 4-bot soak (shared levels, own cards); revive; run ends only when everyone is down; `simulate()` |
| `tests/net.test.mjs` | online lobby, a full minute of online play, disconnects, room closed after start, prediction under 100 ms lag |

Write tests against `window.__SR`; add new hooks in `installTestHooks` (`src/game/loop.ts`) if needed.

## Recipes

### New class

1. Copy a file in `src/classes/`. Change `id`, name, colours, `base` stats, `heavyCooldown`, `ratings`, `kit`,
   `keys`, `favoredParts`, the state interface and the 16 cards (1 passive, 3 strike, 3 heavy, 3 dash, 3 ultimate,
   3 wild with `evo`), and the hooks.
2. If the class overrides `dash`, also give it a side-effect-free `dashShape` returning the same geometry.
3. Import it in `src/classes/index.ts`. The menu shows classes in import order.
4. Add the id to `CLASS_IDS` in `tests/game.test.mjs` so it gets a soak test.

The class select row fits 6 tiles; a 7th class needs a narrower tile or a second row (see `MENU_TILE` in `render/screens.ts`).
New classes are open from the start unless you add an unlock rule (next recipe).

### Hero sprites (placeholder art)

Player classes are drawn from `assets/sprites/heroes.png` (free CC0 art, see `assets/sprites/CREDITS.md`) by
`src/render/sprites.ts`, which is the only file that knows about them. A class without a row in `HERO_ROWS`, or any
failure to load the image, falls back to the coloured circle. To give a new class a sprite, add its 11 frames as a
new row in `heroes.png` and a line in `HERO_ROWS`.

- Switch off: `SPRITES_ENABLED = false` in `src/render/sprites.ts`.
- Remove: delete `src/render/sprites.ts` and `assets/sprites/`, and the `drawHeroSprite` import + call in
  `src/render/world.ts`.

### Lock a class behind a milestone

Add an entry to `UNLOCKS` in `src/meta/progress.ts` (`classId`, the text players see, and `isMet(run)` using
`classId`, `wavesCleared`, `bossesKilled`, `win`). Classes in `STARTER_CLASSES` are always open. Test-mode and bot
runs never unlock anything. Console helpers: `__SR.progress.unlockAll()`, `__SR.progress.resetProgress()`.

### New card

Add an entry to the class's `*_CARDS` table (`part`, `ups`, optional `evo` with `need: { card | part | relic }`).
Read it in the class hooks with `hasCard(id)`, `cardMul(id, 'damage')`, `cardExtraProjectiles(id)` or `isEvolved(id)`.

### New enemy

Add its id to `EnemyTypeId` in `types.ts`, an entry **at the end** of `ENEMY_TYPES` (a `role`, a `weakness`, and traits: `undead`, `shot`, `healer`,
`shield`, `turnRate`, `bomber`, `splitInto`, `charge`, `mortar`, `phase`, `summon`, `maxAlive`), a weight in `spawnWeights()` and a shape in `ENEMY_SHAPES` (`render/world.ts`). TypeScript
points out anything you forget. The snapshot sends enemy types by index into `ENEMY_TYPES`, so nothing else is needed
for online play.

### New boss

Add its kind to `BossKind`, an entry to `BOSS_DEFS`, then `BOSS_AI[kind]` and `BOSS_SHAPES[kind]`. Boss AI runs as its
target hero (`run.player` is the target). Use `hurtHeroesWhere` for attacks that should hit every hero in range.

### New accessory

Add an entry to `ACCESSORIES` in `src/meta/accessories.ts`: `rarity` (sets its drop weight and gold value), an upside
for Lv 1 / 2 / 3, a trade-off, and `apply(stats, level)` (runs in `recalcStats`). It joins the final boss's loot table
and the accessories panel (E) by itself. Keep a real trade-off: accessories count toward the 30% meta power budget.

### New bounty or milestone

Bounties: add an entry to `BOUNTIES` in `src/meta/goals.ts` (`text`, `goal`, `gold`, and `measure(run)`, which reads
the run's counters: `run.tally`, `wavesCleared`, `bossesKilled`). Keep every bounty doable solo. If it needs a new
counter, add it to `RunTally` (`types.ts`), start it in `createHero` (`game/run.ts`) and count it where it happens, as
the current hero (`run.hero.tally`). Milestones (one-off) go in `milestonesFor`.

### New map

Add an entry to `MAPS` in `src/world/maps.ts`: name, stars, reward multiplier, gold price, ground colours, an optional
`spawnMul` (its usual crowd) and its modifier (`vision`, `mushrooms`, `lavaCracks`, `enemyRegen`, or a new field read
in `src/world/hazards.ts`). Maps unlock in table order. A modifier that changes how heroes move must also go into
`moveHero` and online prediction, so prefer hazards and enemy rules. Map levels (`LEVEL_LADDER`) apply to every map.

### New relic or stat card

Add to `RELICS` / `STAT_CARDS` in `progression/cards.ts` and apply the effect in `recalcStats` (`core/state.ts`).

### Anything per player

Put the field on `Hero` (`types.ts`, `createHero` in `game/run.ts`). If gameplay code should reach it as
`run.<field>`, also add it to `HERO_FIELDS` in `game/run.ts` and to `Run`. Send it in `snapHero`
(`net/snapshot.ts`) if screens draw it.
