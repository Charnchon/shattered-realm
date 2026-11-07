# Plan vs. prototype

The design plan (`../roguelike-game-design.md`) describes the full game. This page tracks what the prototype
actually has, as of **November 2026**. Update it when a planned feature lands or the plan changes.

Legend: ✅ built as planned · 🟡 built, differs from the plan · ⬜ not started · ➕ not in the plan (added)

## Roadmap position

The plan's roadmap: 0 Setup → 1 Core loop → 2 Content → 3 Meta → 4 Balance & polish → 5 Ship.

The prototype covers most of **phase 1** (and a slice of phase 2 content), on a **different tech stack** than phase 0
planned, plus online co-op that the plan doesn't have. It started with 4 test classes instead of the planned
starter-only Traveler, to try the card system on very different kits.

## Tech stack

| Plan (section 10) | Prototype | Notes |
|---|---|---|
| Phaser + TypeScript + Vite | 🟡 TypeScript + **Canvas 2D by hand** + **esbuild**, one self-contained `index.html` | Fine for shapes; revisit when real sprites/animation arrive |
| Tauri or Electron desktop | ⬜ | Browser only; deployed to GitHub Pages |
| Zod data validation | ⬜ | TypeScript types + discriminated unions instead |
| `SaveService` (localStorage / file) | ⬜ | Nothing is saved yet |
| Vitest unit tests | 🟡 `node:test` | |
| Playwright E2E | 🟡 Headless `node:vm` runner with a stub canvas | No real-browser tests; online play is tested in memory |
| Seeded RNG (`systems/rng.ts`, never `Math.random`) | 🟡 Game uses `Math.random`; tests swap in a seeded PRNG | Same effect for tests; a real `rng.ts` is still needed for replays/daily seeds |
| Project structure `data/ schemas/ scenes/ systems/ platform/` | 🟡 `core/ world/ progression/ classes/ render/ game/ net/` | See `architecture.md` |
| Art: 64×64 chibi pixel sprites, Aseprite pipeline | ⬜ Placeholder shapes only | |
| Balance simulator (`tools/sim`, 30/70 power budget) | ⬜ | The test bot is a starting point |
| — | ➕ Online co-op with PeerJS | See `multiplayer.md` |

The plan's `CLAUDE.md` rules in section 11 (`npm run validate`, `npm run check-art`, `npm run balance`,
`systems/stats.ts`, `systems/rng.ts`) describe the **target** setup; those scripts don't exist yet. The real
`CLAUDE.md` describes the current one.

## Combat and controls (plan section 3)

| Feature | Status | Notes |
|---|---|---|
| WASD move, mouse aim, LMB attack (hold), RMB Heavy Strike (hold), Space/Shift dash, Q ultimate, Esc pause | ✅ | |
| Gamepad | ⬜ | |
| Auto-aim option | ⬜ | (The test bot aims automatically) |
| Dash: 1 charge, 1.5 s cooldown, invulnerable, per-class variant | ✅ | |
| Heavy Strike per class, breaks shields, staggers elites, boss stagger bar → 2 s stun | ✅ | |
| Ultimate charge: kills +1% (elites +5%), boss damage, damage taken; 0.5 s i-frames | ✅ | |
| Combat stats, no attributes; caps (crit 75%, move +80%, attack speed +200%, cooldown −50%) | ✅ | Projectile Speed stat not implemented |
| Pause screen lists combat stats | ✅ | |
| Level-up cards preview stat changes ("1.40 → 1.55") | 🟡 | Cards show level change and upgrade text, not before/after numbers |

## Run structure (plan section 4)

| Feature | Status | Notes |
|---|---|---|
| Menu → class → run build → map → 12 waves → result | 🟡 | Menu → class → 12 waves → result. No run builds, no map select |
| 12 waves, bosses on 3 / 6 / 9 / 12, wave lengths 45–75 s | ✅ | |
| 4 bosses: Thornback Troll, Bone Colossus, Crimson Wyvern, Hollow King (3 phases, shrinking arena) | ✅ | |
| All 8 enemy types + elites from wave 7 | ✅ | Cultists don't heal allies yet |
| Level-ups, no level cap | ✅ | |
| XP curve `10 + 6L + 0.6L²` | 🟡 `8 + 5L + 0.5L²` | Tuned for the prototype |
| 16 class cards per class, 5 slots, 6th after Boss 2, upgrades by rarity, evolutions | ✅ | |
| 8 shared relics, 4 relic slots; stat cards as filler | ✅ | |
| First offer = 3 different parts; owned cards weighted up once 3+ slots used | ✅ | |
| Rarity weights Common 60 / Rare 28 / Epic 10 / Legendary 2 | 🟡 | Common/Rare/Epic only (Luck shifts them); Legendary is only for evolutions |
| 1 free reroll | ✅ | Trade Coin rerolls left with the Merchant; the `rerollCost` hook remains for later |
| Run Build favored parts (~60% of new-card offers) | 🟡 | Each class has fixed `favoredParts` with a ×1.4 weight |
| Ability Codex | ⬜ | |

## Classes (plan section 6)

| Class | Status |
|---|---|
| Traveler (starter) | ✅ Full kit + 16 cards (staff combo, Rally Cry, +10% XP). Open from the start |
| Oathknight | ✅ Full kit + 16 cards (sword sweep, Shield Slam, Bulwark block, Unbreakable Oath). Open from the start. The Oath doesn't taunt enemies yet |
| Bounty Hunter (replaces Merchant) | ✅ Full kit + 16 cards (bow, Mark Prey, falcon pet, Sky Hunt). Open from the start |
| Cleric | ✅ Full kit + 16 cards (holy bolts, Faith, healing). Open from the start |
| Vampire | ✅ Full kit + 16 cards. **Unlock:** beat Boss 1 as the Traveler |
| Necromancer | ✅ Full kit + 16 cards. **Unlock:** beat Boss 2 with any class |
| Merchant | ➖ Removed (replaced by Bounty Hunter, Nov 2026); code is in git history |
| Pirate, Jester, Alchemist, Tinkerer, Outsider | ⬜ |
| Run Builds (1–4 per class) | ⬜ |
| Skill trees (6 tiers × 3 themes, card-part tags) | ⬜ |
| Class unlock rules | 🟡 Milestone unlocks for Vampire and Necromancer, saved in the browser; no gold option yet |

The class select screen is a row of 6 tiles plus a detail panel; more classes need the planned class grid.

## Maps (plan section 5)

⬜ One plain 2400×1600 arena. No map modifiers, obstacles, palettes or reward multipliers.

## Rewards and meta progression (plan section 7)

| Feature | Status |
|---|---|
| Gold and Specialist EXP formulas | 🟡 Calculated and shown on the result screen (no map multiplier), **not saved** |
| Saved progress | 🟡 Runs, wins, best wave and unlocked classes, in `localStorage` (`src/meta/progress.ts`) |
| Specialist levels, skill points, skill trees | ⬜ |
| Shop, costumes, pets, accessories | ⬜ |
| Power budget 30% meta / 70% in-run, balance simulator | ⬜ |

## UI (plan section 8)

| Screen | Status |
|---|---|
| In-run HUD (portrait + ult ring, HP/XP, wave timer, boss bar, card + relic slots, ability bar, class resource) | ✅ |
| Level-up card pick (rarity frame, part tag, level/upgrade, slot counter, reroll) | ✅ |
| Class select | 🟡 6 class tiles + detail panel (kit, ratings, how to unlock); no run build tabs or accessory slots |
| Pause (stats, cards, relics), result | ✅ |
| Main menu, map select, shop, skill tree, Codex, settings | ⬜ |
| ➕ Online: create/join room, lobby, code entry, teammate HP list, downed/revive UI, leave panel | ✅ |

## Additions not in the plan

- ➕ **Online co-op, 2–4 players**: room codes, host-authoritative, client-side prediction. See `multiplayer.md`.
- ➕ **Co-op rules**: shared XP, own card picks, revive by standing next to a teammate, enemy scaling per player.
- ➕ **Test bot and headless soak tests** for every class, solo and co-op.

## Open questions this raises for the plan

- Should co-op become part of the design (it affects balance, the power budget, map modifiers and rewards)?
- Does the final engine choice (Phaser vs. staying on Canvas) need to support the netcode's "rebuild a run from a
  snapshot and render it" approach? Phaser scenes would need the same separation of simulation and drawing.
- Starter flow: the plan starts with only the Traveler; phase 1 starts with 4 classes open (decided Nov 2026).
