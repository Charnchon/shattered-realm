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
| `SaveService` (localStorage / file) | 🟡 `src/meta/progress.ts` | Versioned save (v2) with migration, a backup copy, newer-version protection, merge with other tabs, export/import (no UI yet) |
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
| Menu → class → run build → map → 12 waves → result | 🟡 | Menu → class (+ map and level, M) → 12 waves → result. No run builds |
| 12 waves, bosses on 3 / 6 / 9 / 12, wave lengths 45–75 s | ✅ | |
| 4 bosses: Thornback Troll, Bone Colossus, Crimson Wyvern, Hollow King (3 phases, shrinking arena) | ✅ | HP raised 1.5× after playtesting (1350 / 3600 / 4800 / 9750) |
| All 8 enemy types + elites from wave 7 | 🟡 | **Fewer, tougher enemies with one role and one weakness each** (cap 70, half the spawn rate, ~2× HP and XP; see `role`/`weakness` in `ENEMY_TYPES`). From wave 7, slimes/goblins fade out and orcs/cultists grow; elite chance rises 6% → 10% by wave 11 |
| Enemy attack warnings | ➕ | Archers stop and show a thin red aim line for 0.7 s, then fire a fast arrow (520 px/s) along it. Imps light a 0.6 s fuse with a blast circle; killed first, they blow up nearby enemies. Telegraphs are in the snapshot, so co-op players see them |
| 4 new enemy types | ➕ | **Tusk Boar** (charges down a shown lane, then dazed: +50% damage taken), **Bog Toad** (lobs poison at your spot: circle, then a pool), **Wraith** (ethereal and immune 1.5 s, solid 2.5 s), **Grave Caller** (channels, then raises 3 bats; a hit interrupts). From waves 2 / 4 / 5 / 7 |
| Cultist heals allies | ✅ | Channels a 1.2 s green circle, heals enemies inside by 35%; any hit interrupts. At most 2 alive per player |
| Accessories | 🟡 | **Final-boss loot** (one per player who wins; the first win always drops the Shard of the Crown), **up to 3 worn per run** (E on class select), Lv 1–3: duplicates level up, gold upgrades (50% / 100% of value), a Lv 3 duplicate becomes gold. 8 of the plan's ~20 + the Shard (`src/meta/accessories.ts`). Online players bring their own (checked by the host). Plan's shop and slot prices replaced (see `progression.md` 5.0) |
| Bounties | ➕ | 3 always active on class select, in table order (14 in `src/meta/goals.ts`), progress adds up across runs; a finished one pays gold and is replaced right away. Fed by per-player run counters (`hero.tally`) |
| First-time milestones | ➕ | One-off gold or class EXP: first boss per class, first win (and per class), first co-op win, waves 6 and 9, first revive, Codex 50/100% |
| Slayer achievements | ➕ | Lifetime kills per monster; Slayer I–V at 25/100/250/500/1,000 kills (bosses 1/3/5/10/20) = +1% to +5% damage against that monster. Online players bring their tiers (checked by the host) |
| Codex | 🟡 | B on class select. Bestiary (15 monsters: name and role after 1 kill, weakness after 10, Slayer progress) and cards per class (??? until you finish a run holding it; evolutions). No lore yet |
| Class unlocks for gold | ✅ | Vampire 500, Necromancer 800 (U on a locked class), or the milestone |
| Live scoreboard | ➕ | The HUD shows the run score (top right); **hold Tab** for every player's level, kills, damage, damage taken and revives while the game keeps running. Works for joined players (it reads only snapshot data) |
| End-of-run scoreboard | ➕ | Result screen shows the run score and a row per player: level, kills, damage dealt, damage taken, revives (★ = top damage in co-op). Sent in the snapshot, so joined players see it |
| Local high scores | ➕ | Top 10 runs on this browser, saved with progress (score = 500/wave cleared + 2000/boss + 10/kill + 5000 for a win). H on the menu opens the table. Test-mode and bot runs don't count |
| Ultimate charge per kill | 🟡 2% (elites 10%) | Doubled from the plan's 1% / 5% because there are about half as many kills |
| — | ➕ Heal orbs | Elites drop one (10 HP) and bosses drop three (15 HP each), so every class can recover HP |
| Level-ups, no level cap | ✅ | |
| XP curve `10 + 6L + 0.6L²` | 🟡 `8 + 5L + 0.5L²`, levels 1–2 cost 7 and 11 | Tuned for the prototype; the cheap first levels bring the first card in ~13 s |
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

🟡 **5 of the 10 maps**, each a 2400×1600 arena with its own palette, enemy mix, reward multiplier and one modifier
(`src/world/maps.ts`, hazards in `src/world/hazards.ts`). M on class select (or click the map badge) picks the map and level.

| Map | Stars | Reward × | Modifier | Opens by |
|---|---|---|---|---|
| Whispering Forest | ★ | 1.0 | None | Open from the start |
| Sunken Crypt | ★★ | 1.15 | Darkness around you (warnings, enemy shots and teammates still show); more undead | Wave 6 on the Forest, or 400 gold |
| Fungal Grotto | ★★★ | 1.3 | Mushrooms warn, then burst into poison pools; more toads and slimes | Wave 6 on the Crypt, or 800 gold |
| Ember Wastes | ★★★ | 1.4 | Lava cracks burn; more imps and boars | Wave 6 on the Grotto, or 1,200 gold |
| Bloodmoon Village | ★★★★ | 1.5 | Enemies heal 1.5% HP/s; more wraiths and healers | Wave 6 on Ember, or 1,800 gold |

- **Differs from the plan:** Frostpeak Pass (ice) and the other movement-changing maps (Clockwork gears, Void Rift
  gravity) are left out for now: online movement prediction would have to copy their physics exactly. Maps unlock at
  wave 6 *or* gold.
- **Map levels 1–10 on every map** (`LEVEL_LADDER`): win level N to unlock N+1. Each level adds one modifier (enemy HP,
  elites from wave 4, stronger healers, faster enemies, weaker heal orbs, more damage, more enemies, boss HP) and
  +15% gold/EXP/score. **Differs from `progression.md` 5.3:** the plan's "shorter telegraphs", "one fewer card choice",
  "bosses gain a new attack" and "a 4th Hollow King phase" were swapped for number-only modifiers (warnings stay
  readable; no new boss AI yet).
- Harder maps and levels shift loot odds toward Rare and Epic. **Mastery stars** per map per class: win · win with
  nobody downed · win on level 5+.

## Rewards and meta progression (plan section 7)

| Feature | Status |
|---|---|
| Gold and Specialist EXP formulas | 🟡 Calculated and shown on the result screen (no map multiplier), **not saved** |
| Saved progress | 🟡 Runs, wins, best wave, unlocked classes, high scores, **gold** and **Specialist EXP per class** (levels 1–15, `100 × level` EXP each), in `localStorage` (`src/meta/progress.ts`). Gold buys accessory upgrades and locked classes |
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
