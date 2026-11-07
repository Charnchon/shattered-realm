# Roadmap

The path from today's prototype to the full game in `../roguelike-game-design.md`. Each phase ends with something
playable on the live site. Phases are in order; inside a phase, items can move around.

Legend: ✅ done · 🔨 in progress · ⬜ to do

**Guiding rule (from the plan):** make it fun first. A phase isn't done until it feels good to play, not just
when the checklist is ticked.

---

## Phase 0 · Prototype foundation ✅

The engine everything else builds on.

- ✅ Canvas game loop, 960×540 view, 2400×1600 arena, placeholder shapes
- ✅ Move, aim, dash, Strike, Heavy Strike, Ultimate with charge
- ✅ 12 waves, 8 enemy types + elites, 4 bosses (troll, colossus, wyvern, Hollow King)
- ✅ Level-up offers: 16 class cards, upgrades by rarity, evolutions, 8 relics, stat cards, rerolls, card slots
- ✅ Combat stats with hard caps, HUD, pause, result screen
- ✅ Online co-op 2–4 players (room codes, revive, shared XP, client prediction)
- ✅ Headless tests + bot soak tests, CI on `develop`, deploy from `production` to GitHub Pages

## Phase 1 · Core four classes 🔨

**Goal:** a small, clear roster that is easy to develop and balance, with the first taste of unlocking.

- ✅ Starting roster: **Traveler** (starter, simple), **Oathknight** (tank), **Bounty Hunter** (ranged + falcon pet,
  replaces Merchant), **Cleric** (holy magic + healing)
- ✅ **Vampire** and **Necromancer** become unlockable classes
- ✅ Progress is saved in the browser (unlocks, best wave, bosses defeated)
- ✅ Class select screen for 6 classes, showing locks and how to unlock
- ⬜ Playtest pass on the 4 core classes: each should be able to win, each should feel different
- ⬜ First balance numbers for Traveler / Oathknight / Bounty Hunter from playtests

**Done when:** a new player starts with 4 classes, can unlock the other 2, and all 6 are fun to play.

## Phase 2 · Rewards after every run

**Goal:** every run, win or lose, gives something that lasts.

- ⬜ Save gold and Specialist EXP after each run (formulas already exist; plan section 7)
- ⬜ **Specialist level** per class (cap 15), shown on class select and the result screen
- ⬜ Result screen: "+120 gold · Vampire Lv 3 → 4", new unlocks, best wave
- ⬜ **Accessory shop**: the plan's ~20 accessories (upside + trade-off, Lv1–3), 1 slot at start, 2nd for 1,000 gold
- ⬜ Accessory slots on class select; equipped accessories apply in runs (and in co-op, per player)
- ⬜ Gold option for unlocking classes (plan: "a milestone **or** gold, so players never get stuck")
- ⬜ Save versioning and a "reset progress" option in settings

**Done when:** players have a reason to start the next run (something to buy or level).

## Phase 3 · Skill trees and Run Builds

**Goal:** permanent choices that change *how* a class plays (plan section 6.0).

- ⬜ Skill tree screen: 6 tiers × 3 themes, pick 1 per tier, Skill Points from Specialist levels
- ⬜ Skill trees for the core 4 (Traveler's mini tree: 2 themes × 3 tiers)
- ⬜ Run Builds: 1–3 per class with favored card parts and a small perk; one skill setup per build
- ⬜ Card-part tags: +15% skill effect per matching card in the run
- ⬜ Balance check: meta stays about 30% of player power at wave 12

**Done when:** two players with the same class can feel different because of their tree and build.

## Phase 4 · Maps

**Goal:** variety between runs (plan section 5).

- ⬜ Map select screen; maps unlock in order
- ⬜ First 3 maps with their modifier and reward multiplier (Whispering Forest, Sunken Crypt, Frostpeak Pass)
- ⬜ Obstacles and per-map enemy recolours
- ⬜ Remaining 7 maps

**Done when:** picking a map changes how a run plays, not just its colours.

## Phase 5 · Art and feel

**Goal:** replace the shapes with the Dusk Fantasy 64×64 chibi pixel art (plan section 9).

- ⬜ Decide the engine for art: keep Canvas, or move rendering to Phaser (simulation stays engine-free)
- ⬜ Sprite pipeline: Aseprite export, palette check, atlas
- ⬜ Player classes, enemies, bosses, pickups, effects
- ⬜ Animations, hit flash, freeze frames, sound and music

## Phase 6 · More content

- ⬜ More classes from the plan: Pirate, Jester, Alchemist, Tinkerer, Outsider (and a new home for the Merchant idea?)
- ⬜ Ability Codex (cards found, evolution hints)
- ⬜ Cosmetics: costumes and pets (shop)

## Phase 7 · Balance and polish

- ⬜ Balance simulator (`tools/sim`): power budget, average waves reached, gold per run
- ⬜ Gamepad, auto-aim option, settings (volume, screen shake), accessibility
- ⬜ Main menu, settings, and the remaining screens from the plan
- ⬜ Online polish: reconnect, show own attacks instantly, host migration?

## Phase 8 · Ship

- ⬜ Web release (own site / itch.io)
- ⬜ Desktop builds (Tauri or Electron), Steam page

---

## Decisions log

| When | Decision |
|---|---|
| Nov 2026 | Online co-op added (not in the original plan) |
| Nov 2026 | Phase-1 roster: Traveler, Oathknight, Bounty Hunter, Cleric; Vampire and Necromancer unlockable |
| Nov 2026 | **Merchant replaced by Bounty Hunter** (bow + falcon pet): easier to understand, still ranged with a pet |
| Nov 2026 | Scout renamed **Bounty Hunter** (same kit: bow, falcon, Mark Prey) |
| Nov 2026 | Unlocks: Vampire = beat Boss 1 as Traveler; Necromancer = beat Boss 2 with any class |

Open questions live in section 13 of the design plan.
