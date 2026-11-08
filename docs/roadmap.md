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

> **Superseded by [`progression.md`](progression.md)** (approved direction, Nov 2026): its build steps A–H replace
> phases 2–4 below.

**Goal:** every run, win or lose, gives something that lasts.

- ✅ Save gold and Specialist EXP after each run (new formulas in `progression.md`)
- ✅ **Specialist level** per class (cap 15), shown on class select and the result screen
- ✅ Result screen: rewards reel (gold, class EXP and level-ups, unlocks, next goal)
- 🟡 **Accessories** as final-boss loot (changed from a shop, see `progression.md`): 8 + Shard of the Crown, Lv 1–3
- ✅ 3 accessory slots on class select; equipped accessories apply in runs (and in co-op, per player)
- ✅ Gold option for unlocking classes (Vampire 500, Necromancer 800)
- 🟡 Save versioning ✅ (v2, migration, backup); a "reset progress" option in settings ⬜

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

- ✅ Map select (M on class select); maps unlock in order (wave 6 on the previous map, or gold)
- ✅ 5 maps with their modifier and reward multiplier (Forest, Crypt, Grotto, Ember Wastes, Bloodmoon); map levels 1–10
- ⬜ Obstacles and per-map enemy recolours
- ⬜ Remaining 5 maps (Frostpeak, Clockwork, Carnival, Sky Ruins, Void Rift)

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
| Nov 2026 | **Fewer, tougher monsters, each with a role and a weakness** (healer to kill first, archer that telegraphs its shot, imp to pop from range, shield orc to flank) instead of a big horde. Every ranged or area attack shows a warning first |
| Nov 2026 | Scoreboard: end-of-run player stats and local top-10 high scores. **Online leaderboard deferred** (needs hosting; preferred option when revisited: a Cloudflare Worker kept in one switchable module) |
| Nov 2026 | **Progression plan** (`progression.md`): accessories drop from the final boss (one per player, up to 3 equipped per run); Slayer achievements give up to +5% damage per monster type; all cards stay available; every map has levels 1–10; co-op gives +10% gold |

Open questions live in section 13 of the design plan.
