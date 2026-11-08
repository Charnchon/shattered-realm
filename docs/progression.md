# Progression plan (draft for approval)

How Shattered Realm keeps players coming back: **every run, win or lose, pays out something the player can spend or
use before the next run**, and there is always a visible next goal. This builds on the design doc
(`../roguelike-game-design.md`, sections 5–7) and keeps its rule that **meta progression is at most ~30% of player
power**. The run is still won by the choices made inside it.

Status: **approved direction, November 2026** (owner's answers are in section 10). Nothing here is built yet except
what `plan-status.md` lists. The build steps at the end replace phases 2–4 of `roadmap.md`.

---

## 1. Principles

1. **Every run pays.** A wave-2 death still gives gold, class EXP and progress on a goal. The result screen shows it.
2. **Three clocks always running.** Something short (this run's rewards), something medium (an unlock 1–3 runs away)
   and something long (mastery, the next difficulty level). At least one bar is always close to full.
3. **Unlock options more than power.** Most rewards are *new ways to play* (builds, skills, accessories with trade-offs,
   maps, monsters, cards). Pure stat growth stays inside the 30% budget, so a new player can still win map 1 with skill.
4. **Show the next thing.** Locked items are visible with their requirement ("Night Stalker build: Vampire Lv 3,
   80 EXP to go"). Hidden things show as silhouettes (`???`) in the Codex.
5. **Respect the player.** No energy timers, no paid currency, no loot boxes, no streaks that punish a break,
   no "log in or lose it". The hook is the next interesting choice, not fear of missing out.

## 2. Currencies (keep it to two)

| Currency | Scope | Earned from | Spent on |
|---|---|---|---|
| **Gold** | Account (all classes) | Every run, bounties, first-time milestones, duplicate accessories at max level | Accessory upgrades (Lv 1–3), class unlocks, map unlocks (alternative to milestones), cosmetics |
| **Specialist EXP** | Per class (the class you played) | Every run | Nothing directly: levels give Skill Points and unlock Run Builds |

Everything else is **earned**, not bought: **accessories (boss loot)**, Codex entries, Slayer achievements, bounties,
map mastery and map levels.

### Formulas (replace the design doc's draft; tune with the balance sim)

```
gold          = (15 × wavesCleared + 60 × bossesKilled + kills / 5 + (win ? 250 : 0)) × mapMultiplier × mapLevelMultiplier × coopBonus
specialistExp =  20 × wavesCleared + 80 × bossesKilled + kills / 5 + (win ? 200 : 0)
expToNext(L)  = 100 × L        (Lv 1→2 = 100 … Lv 14→15 = 1,400; 10,500 EXP to max a class)
```

Why: the old curve (`300 + 150 × (L − 1)`) made the first level take 2+ runs. With this one a typical first run
(dies on wave 4, ~150 kills) gives **~135 gold and ~170 EXP: a level-up after run 1** and a second level after run 2.

## 3. What a run gives (the result screen)

The result screen becomes a short **rewards reel** (skippable with a click), in this order:

1. **Score and scoreboard** (built).
2. **Loot**: the accessory the final boss dropped (new, or "duplicate: Ember Ring → Lv 2").
3. **Gold** counts up, with the breakdown (waves, bosses, kills, win, map ×, map level ×, co-op bonus).
4. **Class EXP bar** fills; each level-up pops: "+1 Skill Point", "Night Stalker build unlocked".
5. **Codex and Slayer progress**: "New evolution: Crimson Moon", "Cultist Slayer II: +2% damage to Cultists".
6. **Bounties** ticked off, with their reward.
7. **Unlocks**: class, map, map level.
8. **Next goal teaser**: the closest unfinished goal, e.g. "Bounty Hunter Lv 6 in 1 run: Falconer build".

Buttons: **Play again** · **Shop** · **Skills** · **Change class**. "Play again" stays the default (Enter).

## 4. What players spend it on between runs

| System | What it is | Source in the design doc | Notes |
|---|---|---|---|
| **Accessories (boss loot)** | ~20 items with an upside and a trade-off, Lv 1–3. **Dropped by the final boss** (see 5.0), not sold. **Equip up to 3 per run** | §7 (changed) | Start with 8 to ship sooner. Gold upgrades them |
| **Skill tree** | 6 tiers × 3 themes per class, 1 pick per tier, Skill Points from Specialist levels | §6.0 | Start with tiers 1–3 for the core 4 |
| **Run Builds** | 1–4 per class: favored card parts + a small perk; unlocked at Specialist Lv 3 / 6 / 9 | §6 | Already a light version in code (`favoredParts`) |
| **Class unlocks** | Milestone **or** gold, so nobody gets stuck | §7 | The current Vampire/Necromancer rules plus a gold price |
| **Maps** | 10 maps, each with a modifier and a reward multiplier; unlock in order | §5 | Map clear or reach wave 6 on the previous map, or gold |
| **Cosmetics** | Costumes, pets, dash trails, titles | §7 | No power; mostly from mastery and achievements, a few for gold |

## 5. New systems this plan adds

### 5.0 Accessory loot (owner's decision)

- **The final boss (the Hollow King, wave 12) drops one accessory for every player** who is in the run when it dies
  (co-op: each player rolls their own). It is shown on the result screen and kept forever.
- **Rarity improves with the map and its level**: on map 1, level 1 the drop is mostly Common; high map levels lean
  Rare and Epic. Draft weights: Common 70 / Rare 25 / Epic 5, shifting 4 points from Common to Rare and Epic per map
  level and per map star rating above ★.
- **Duplicates level the accessory up** (Lv 1 → 2 → 3). A duplicate of a Lv 3 accessory turns into gold
  (Common 150, Rare 400, Epic 1,000). Gold can also upgrade an accessory (Lv 2 = 50% of its value, Lv 3 = 100%).
- **Loadout: up to 3 accessories per run**, all 3 slots open from the start, chosen on class select and locked during
  the run. You can't equip two of the same accessory.
- **Shard of the Crown** (the design doc's unique accessory) is the guaranteed drop of the **first** final-boss kill.
- Accessories count toward the 30% meta budget, so the strong ones keep real trade-offs (design doc §7).


### 5.1 Bounties (always 3 active goals)

- Three bounties are always on the class select screen. Finishing one replaces it **right away** (no timers).
- Small rewards (gold, class EXP, sometimes a cosmetic or Codex entry). They **teach the game**: most are about monster
  weaknesses and class mechanics.
- Data-first: a table in `src/meta/bounties.ts` of `{ id, text, goal, check(runStats), reward }`, fed by counters the
  run already tracks (kills by type, interrupts, dazed hits, revives).

| Example bounty | Teaches | Reward |
|---|---|---|
| Interrupt 5 Cultist heals | Kill the healer first | 100 gold |
| Hit 3 dazed Tusk Boars | Sidestep, then punish | 80 gold |
| Kill 2 Imps that blow up another enemy | Pop imps from range | 80 gold |
| Break 10 Shield Orc shields | Heavy strike | Oathknight +150 EXP |
| Revive a teammate (co-op) | Co-op | Title "Lifeline" |
| Reach wave 6 without being hit by an archer arrow | Read the aim line | 200 gold |

### 5.2 Codex (collection)

Three tabs, each with silhouettes until discovered and a completion % (a strong long-term pull):

- **Cards**: every class card and evolution. Evolutions show as `???` with a hint until first made in a run.
- **Bestiary**: the 12 monsters and 4 bosses. The first kill shows the **name and role**; 10 kills show the
  **weakness tip**; 25 show the **lore**. Kills also count toward that monster's **Slayer achievement** (5.2a).
- **Relics and accessories**: owned / seen / locked.

Rewards: gold at 25 / 50 / 75 / 100% per tab, and a cosmetic at 100%.

### 5.2a Slayer achievements (owner's decision)

Kill enough of one monster type and you get a small **permanent damage bonus against that type**, at most **+5%**.

| Tier | Monster kills | Boss kills | Bonus vs that type |
|---|---|---|---|
| Slayer I | 25 | 1 | +1% |
| Slayer II | 100 | 3 | +2% |
| Slayer III | 250 | 5 | +3% |
| Slayer IV | 500 | 10 | +4% |
| Slayer V | 1,000 | 20 | +5% (and a title, e.g. "Bane of Cultists") |

- **Why 5%:** one level of a damage card is +20% damage, and a full card stack is far more. So a maxed Slayer bonus is
  about a quarter of a single card level, and only against one monster type. It rewards long-term play without
  deciding runs.
- Kills count for the player who lands them (co-op too; `hero.score` already credits kills per player). Test-mode and
  bot runs don't count.
- Shown in the bestiary, and on the result screen when a tier is reached.
- Code: a `SLAYER_TIERS` table plus `slayerBonus(type)` read in `hitEnemy` (one multiply, like the dazed bonus).

### 5.3 Map mastery and map levels (the endgame)

- Each map has **3 mastery stars per class**: ★ clear it, ★★ clear it with nobody downed, ★★★ clear it on map level 5.
  Stars show on map select and class select, and give gold and cosmetics. That's 10 maps × up to 11 classes for a
  completionist.
- **Every map has its own levels, 1–10** (owner's decision). Level 1 is the normal map. **Winning a map at level N
  unlocks level N+1 on that map.** Each level adds one fixed modifier (the same ladder on every map, on top of the
  map's own modifier), and rewards grow **+15% gold and EXP per level**. Better accessory drops too (5.0):

| Map level | Adds |
|---|---|
| 1 | Enemies +15% HP |
| 2 | Elites from wave 4 |
| 3 | Healers heal 50% more; casters channel 20% faster |
| 4 | Telegraphs are 20% shorter |
| 5 | Bosses gain a new attack in phase 2 |
| 6 | Heal orbs restore half |
| 7 | One fewer card choice on the first level-up of each wave |
| 8 | Enemies +15% damage |
| 9 | A random elite modifier each wave (fast / armored / splitting) |
| 10 | The Hollow King has a 4th phase |

- The highest level cleared shows per map and per class, on map select, the scoreboard and the high-score table.

### 5.4 First-time milestones

One-off rewards so the first ~5 hours are packed: first boss kill per class (+300 EXP), first win (Shard of the Crown,
the design doc's unique accessory), first co-op win (title), first map level 2 clear, first Slayer V, first full Codex tab, and so on.
They live in the same table as bounties but never rotate.

### 5.5 Daily run (optional, later)

- The same seed, class, map and one modifier for every player each day. One scored attempt (practice after that).
- Bonus gold for the first attempt. **No streaks.** Local best now; the online leaderboard later (deferred, see the roadmap).
- Needs the seeded RNG module the design doc calls `systems/rng.ts` (see `plan-status.md`).

## 6. Pacing targets (an average player)

The rule: **in the first 10 hours, something unlocks or levels up in at least every other run.**

| By run | The player has… |
|---|---|
| 1 | ~135 gold, class Lv 2 (first Skill Point), 3–5 Codex entries, usually 1 bounty done |
| 2–3 | Class Lv 3: **2nd Run Build**; first bounties done |
| 5 | First boss kill → Vampire unlocked (or 500 gold), map 2 unlocked |
| 10 | Main class Lv 6 (3rd build), first Slayer I–II achievements, a few accessory upgrades' worth of gold saved |
| ~20 | **First win: first accessory (Shard of the Crown)**, map 1 level 2 unlocked, ★ mastery |
| ~50 | Main class Lv 15 (full tree), 4–5 maps, map levels 3–5, a 3-accessory loadout |
| 100+ | Map level 10, Slayer V titles, full Codex and accessory collection, ★★★ mastery |

The balance simulator (roadmap phase 7) checks these with bot runs: gold and EXP per run by class and map, and the
meta power share at waves 3 / 6 / 12 (targets ~50% / 40% / 30%, design doc §7).

## 7. Co-op

- **Everyone earns their own rewards** from the team's result (gold, EXP for the class they played, bounties, Codex).
  A **co-op bonus of +10% gold** for 2+ players (approved). A solo run is unchanged.
- **Loadouts travel with the player.** When joining, each player sends their accessories, skill setup and Run Build to
  the host (extends the lobby's `class` message). The host applies them, so the simulation stays host-authoritative.
- Bounties count each player's own actions (`hero.score` already tracks kills, damage and revives per player).

## 8. Saves (do this first)

All of this needs a save format that can grow without losing anyone's progress:

- `Progress` v2: `gold`, per-class `{ exp, level, skills, buildSetups, lastBuild }`, `accessories` (owned, levels,
  equipped loadout of up to 3), `kills` per monster type (Slayer), `codex`, `bounties`, `mastery`, `mapLevels`,
  `cosmetics`, `highScores`, `settings`.
- **Migration** from v1 (current saves keep their unlocks and high scores), validated fields, a backup copy of the
  last good save, and refuse to overwrite a save from a newer version (also an audit finding).
- **Export / import** a save as text (moving between browsers, and a safety net).
- Tests: v1 → v2 migration, corrupt data, two tabs not wiping each other's unlocks.

## 9. Build order

Each step ships on its own, is data-first (tables, not new systems where possible), and adds tests.

| Step | Contents | Why first |
|---|---|---|
| **A. Foundation** ✅ | Save v2 + migration; persistent gold and class EXP/levels with the new formulas; the rewards reel and "next goal" teaser on the result screen | Makes every run pay immediately |
| **B. Loot and loadout** ✅ | 8 accessories (Lv 1–3); final-boss drop per player; duplicates level up; 3-slot loadout on class select; gold upgrades; gold prices for class unlocks | The reward for winning, and gold has a use |
| **C. Goals** | Bounties (3 active) + first-time milestones; run counters for monster mechanics | Always a next goal; teaches weaknesses |
| **D. Collection** | Slayer achievements (+1–5% per monster type); Codex: cards/evolutions, bestiary | Long-term pull, cheap to build |
| **E. Builds** | Run Builds (2 per core class), unlocked by Specialist level, chosen on class select | Medium-term unlocks |
| **F. Skill trees** | Core 4, tiers 1–3 first, then 4–6 | The main meta system (~22% power) |
| **G. Maps + map levels** | Map select, maps 2–3, mastery stars, map levels 1–10 per map | Endgame |
| **H. Later** | Remaining accessories and maps, cosmetics, daily run, online leaderboard, achievements | Polish and long tail |

## 10. Decisions (November 2026)

| # | Question | Decision |
|---|---|---|
| 1 | Where do accessories come from? | **Dropped by the final boss**, one per player; equip **up to 3 per run** (5.0) |
| 2 | Permanent bonus from killing monsters? | **Yes, small:** Slayer achievements, up to **+5%** damage per monster type (5.2a) |
| 3 | Unlock part of the card pool? | **Skipped:** all 16 cards per class stay available from the start |
| 4 | Difficulty ladder? | **Levels per map**, 1–10; winning level N unlocks N+1 on that map (5.3) |
| 5 | Co-op gold bonus? | **Yes, +10%** |

### Still open

- **Early accessories.** With drops only from the final boss, a new player gets their first accessory at the first
  win (~run 20), so the 3 slots stay empty for a long time. Suggestion: the wave 3 / 6 / 9 bosses get a **15% chance
  to drop a Common**, the final boss stays the main source. Owner's call.
- **Gold pace** (question 1 of the first draft) wasn't answered; the formulas in section 2 stand until playtests say
  otherwise.
