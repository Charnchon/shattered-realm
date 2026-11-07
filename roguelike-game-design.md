# Roguelike Game – Design & Build Plan

> Working title: **Shattered Realm** (placeholder)
> Genre: 2D top-down arena wave roguelike, fantasy setting
> Platforms: Browser + Desktop (one codebase)

**Contents:** 1. Game Summary · 2. Setting · 3. Controls & Combat · 4. Run Structure (waves, level-ups, Ability List) · 5. Maps · 6. Classes (skill trees, Run Builds, in-run cards) · 7. Rewards & Meta Progression · 8. UI & Screens · 9. Art Style · 10. Tech Stack · 11. Using Claude to Build It · 12. Roadmap · 13. Open Decisions

---

## 1. Game Summary

The player picks **1 of 11 classes** (10 classes + the starter Traveler), **1 Run Build** for that class, and **1 of 10 maps**, then fights through **12 waves** in a fantasy world. They move, **dash**, **hit or shoot** enemies, use a **Heavy Strike** (right click), and fire an **Ultimate** when its charge reaches 100%. Killing enemies gives XP. Every level-up shows **3 cards** to pick 1 from: **class-unique** ability cards (passive, strike, heavy strike, dash, ultimate, wild), upgrades, evolutions, and relics. A run holds at most **5–6 cards**. There is **no level cap** inside a run. **4 bosses** appear in the 12 waves.

Permanent progression gives only about **30%** of a character's power; the other **70%** comes from choices inside the run (see 7, Power budget).

After every run (win or lose), the player gets:
- **Gold** → spend in the shop on costumes and pets (cosmetic) and **accessories (gear that changes your build)**
- **Specialist EXP** → level up the played class. Each Specialist Level gives a **Skill Point** for the class skill tree

---

## 2. Setting – Fantasy World

The world of **the Shattered Realm** broke into floating pieces after a crown of power was destroyed. Each piece is a different land full of monsters. Heroes of many kinds travel these lands to collect the crown's shards.

Tone: **Dusk Fantasy**: warm and cozy where there is light, dark and a little dangerous everywhere else. Close to dark fantasy, but not grim. **64×64 chibi pixel art** (see section 9).

Common enemy types (shared across maps, recolored per map):

| Enemy | Behavior |
|---|---|
| Slime | Slow, walks to player, splits on death (later waves) |
| Goblin | Fast melee runner |
| Skeleton Archer | Keeps distance, shoots arrows |
| Bat | Flies in groups, zig-zag movement |
| Cultist | Casts slow magic bolts, sometimes heals allies |
| Shield Orc | Tanky, blocks shots from the front |
| Imp Bomber | Runs to player and explodes |
| Elite (any) | Bigger, glowing outline, extra HP, drops more XP (waves 7+) |

---

## 3. Core Controls & Combat

### Controls

| Action | Keyboard + Mouse | Gamepad |
|---|---|---|
| Move | WASD | Left stick |
| Aim | Mouse cursor | Right stick |
| Attack (hit / shoot) | Left click (hold = repeat) | Right trigger |
| **Heavy Strike** | **Right click** | Left trigger |
| Dash | Space or Shift | A or Right bumper |
| **Ultimate** | **Q** (when charge is 100%) | Y |
| Pause | Esc | Start |

Accessibility option: **Auto-aim** toggle (aims at nearest enemy).

### Attack types

- **Melee (hit):** swing in an arc toward the cursor. Has a combo (e.g. hit 1 → 2 → 3, last hit is stronger).
- **Ranged (shoot):** fires projectiles toward the cursor.
- **Magic:** projectiles or area spells, often with a special resource or charge mechanic.

### Dash (all classes)

- Short fast move in the movement direction (or toward cursor if not moving)
- **Invulnerable** during the dash (~0.2 s)
- Base: **1 charge**, **1.5 s** cooldown
- Cards and class upgrades can add charges, lower cooldown, or add effects
- Every class has its **own dash variant** (see classes)

### Heavy Strike (right click)

- A strong second attack with a **short cooldown (0.5–3 s)**. It is meant to **blend into normal play**: the player weaves it between normal attacks all the time, not saves it for big moments.
- **Hold right click** to use it again as soon as it is ready
- **Each class has its own cooldown and damage** (see the table below)
- Damage is a % of the class's base weapon damage, and all damage bonuses apply
- Balance rule: Heavy Strike damage ÷ cooldown should be about **60% weapon damage per second**. Heavy Strikes with strong extra effects (stun, pull, heal) deal less damage per second.
- **Breaks enemy shields** (Shield Orc) and **staggers elites** (interrupts their attack)
- Hits on bosses fill a **Stagger bar**; when it is full, the boss is stunned for 2 s
- Every class has its **own Heavy Strike** (see classes)
- HUD: a cooldown icon next to the dash icon

| Class | Heavy Strike | Cooldown | Damage | Extra effect | Damage / s |
|---|---|---|---|---|---|
| Tinkerer | Overcharged Shot | **0.5 s** | 30% | Small shrapnel burst | 60% |
| Vampire | Crimson Rend | **1 s** | 55% | Heals 1% max HP per enemy hit | 55% |
| Jester | Boomerang Blade | **1 s** | 2 × 30% | Hits going out and coming back | 60% |
| Traveler | Staff Slam | **1.5 s** | 75% | Small shockwave | 50% |
| Necromancer | Command: March | **2 s** | 40% per skeleton (120% with 3) | Moves every skeleton to the cursor | 60% |
| Oathknight | Shield Slam | **2 s** | 90% | Cone stun 0.3 s | 45% |
| Cleric | Smite | **2 s** | 125% | Area hit, Purify applies | 63% |
| Bounty Hunter | Mark Prey | **2 s** | 120% | Marks the target; the falcon dives on it | 60% |
| Alchemist | Big Flask | **2.5 s** | 125% (over time) | Fire, poison, and slow puddles at once | 50% |
| Outsider | Void Lance | **3 s** | 190% | Long piercing beam | 63% |
| Pirate | Keelhaul | **3 s** | 60% | Pulls an enemy to you and stuns 0.5 s (elites are pulled halfway) | 20% |

How it feels: at 0.5–1 s (Tinkerer, Vampire, Jester) it works like an **alt-fire** mixed into every few attacks. At 2–3 s (Bounty Hunter, Outsider, Pirate) it is a **strong hit every few seconds** that still comes back fast enough to use all the time.

### Ultimate (Q, at 100% charge)

- Every class has **1 Ultimate**: a big, run-saving move (see classes)
- **Ultimate Charge** fills from 0% to 100%:
  - Kills: +1% (elites +5%)
  - Damage to bosses: +1% for each 1% of boss HP removed
  - Taking damage: +1% for each 5% of max HP lost (helps when things go badly)
- Target: about **1 Ultimate every 60 s** in normal waves, and **1–2 per boss fight**
- Charge carries over between waves and resets at the start of each run
- 0.5 s of invulnerability when the Ultimate starts
- Some cards, skills, relics, and accessories make it charge faster (Ultimate Charge Rate)
- HUD: a charge ring around the player portrait; it glows and plays a sound at 100%

### Combat stats

There are **no attributes** (no STR, DEX, INT…). Characters have simple **combat stats**, and cards, relics, skills, and accessories change them directly.

| Stat | What it does | Base |
|---|---|---|
| Max HP | How much damage you can take | Per class (section 6) |
| Armor | Reduces damage taken | 0 |
| HP Regen | HP healed per second | 0 |
| Damage | % bonus to all damage | Per class |
| Attack Speed | How fast basic attacks come out | Per class |
| Crit Chance / Crit Damage | Chance for a critical hit, and how hard it hits | 5% / 150% |
| Move Speed | How fast you move | Per class |
| Dash Cooldown / Charges | How often you can dash | Per class |
| Heavy Strike Cooldown | See the Heavy Strike table | Per class |
| Ultimate Charge Rate | How fast the Ultimate fills | 100% |
| Area Size | Size of explosions, auras, and areas | 100% |
| Projectile Speed | How fast projectiles fly | 100% |
| Pickup Radius | How far XP gems and coins are pulled in | Per class |
| Lifesteal | % of damage healed | 0 (Vampire: 4%) |
| Luck | Better card rarity and upgrade rolls, more drops | 0 |

**Damage formula:** `damage = base damage × (1 + all % damage bonuses) × any multipliers from cards` (e.g. "deals double damage")

**Where stats come from**
- **In-run:** class ability cards, relics, stat cards
- **Meta:** skill tree, accessories, Run Build perk
- **Class base stats** are the starting point (section 6)

**Limits (because there is no level cap):** crit chance max 75%, move speed max +80%, attack speed max +200%, cooldowns max −50%

UI: the pause screen shows all combat stats. On the level-up screen, each card shows a preview of what changes ("Attack speed 1.40 → 1.55").

---

## 4. Run Structure

```
Main Menu → Choose Class (11) → Choose Run Build (1–4) → Choose Map (10) → Waves 1–12 → Result Screen → Shop / Class Upgrade
```

### Waves and bosses

| Wave | Content | Length (draft) |
|---|---|---|
| 1–2 | Normal enemies | 40–50 s |
| **3** | **Boss 1** | until boss dies |
| 4–5 | Normal, new enemy types | 55–60 s |
| **6** | **Boss 2** | until boss dies |
| 7–8 | Normal + elites | 60–70 s |
| **9** | **Boss 3** | until boss dies |
| 10–11 | Hardest normal waves | 70–75 s |
| **12** | **Final Boss** – killing it wins the run | until boss dies |

During boss waves, a few small enemies still spawn so the player keeps getting XP.

### The 4 bosses (draft)

| Wave | Boss | Idea |
|---|---|---|
| 3 | **Thornback Troll** | Charges in straight lines, throws boulders. Teaches dodging with dash. |
| 6 | **Bone Colossus** | Giant skeleton, ground slam shockwaves, summons skeleton archers. |
| 9 | **Crimson Wyvern** | Flies around the arena, fire breath lines, dive attacks. |
| 12 | **The Hollow King** | Final boss, 3 phases: sword attacks → shard magic → arena shrinks. |

Later idea: each map gives the bosses a small twist (color, one extra attack) so they feel fresh.

### Leveling (no cap)

- XP curve (draft): `xpToNext(L) = 10 + 6·L + 0.6·L²`
- Each level-up pauses the game and shows **3 cards**; the player picks 1
- Each card shows its part (Strike, Dash…), its level ("Lv 2 → 3"), and a preview of what changes
- **What the 3 cards can be:** see **The Ability List** below

### The Ability List (in-run level-up cards)

Level-ups should feel exciting: the player knows the list of cool cards that **might** show up for their class, and hopes to find the ones they want. Some runs find them, some don't.

**Every ability card is unique to its class.** Each class has its own **16 cards** (listed in its class section, section 6). Only **Relics** and **Stat cards** are shared by all classes.

**The 16 cards of each class**

| Card part | Kinds per class | What they do |
|---|---|---|
| **Passive** | 1 | Powers up the class passive |
| **Strike** (basic attack) | 3 | 3 different ways to power up the basic attack |
| **Heavy Strike** | 3 | 3 different ways to power up the Heavy Strike |
| **Dash** | 3 | 3 different ways to power up the dash |
| **Ultimate** | 3 | 3 different ways to power up the Ultimate |
| **Wild** | 3 | Unique class powers that add something new; they can **evolve** |

**Card slots: pick at most 5–6 cards per run**
- **5 card slots** at the start of a run. The **6th slot opens after beating Boss 2** (wave 6).
- Any mix is allowed: e.g. 2 Strike cards + 2 Dash cards + 1 Ultimate card + 1 Wild card. Cards for the same part **combine** (two Dash cards both change the dash).
- With 16 cards and only 5–6 slots, every run is a **different build**.
- **When all slots are full, ability cards only upgrade the cards you selected.** No new ability card appears for the rest of the run.

**Other card types**

| Card | What it does | Limit |
|---|---|---|
| **Same card again** | Upgrades a card you own by 1 level (see Upgrading below) | Lv1 → Lv5 |
| **Evolution** (Legendary) | A **Wild** card at Lv5 whose **condition** is met (owning a certain other card, or a relic) evolves into a much stronger version | When ready, it is **always** in the next offer |
| **Relic** | A passive item shared by all classes (more HP, speed, projectiles…) | **4 relic slots**, separate from card slots; each Lv1–5 |
| **Stat card** | A small boost: +5% damage, +8% max HP, +5% move speed, +5% attack speed, +3% crit chance… | Only fills offers when there are not enough other cards (mostly late in long runs); infinite, so the pool never runs out |

**Offer rules**
- 3 cards per level-up, no duplicates in one offer
- The **first offer** of a run shows 3 cards from 3 different parts, so the player chooses the run's direction
- Cards you already own show **"Lv 2 → 3"** and the upgrade they will give
- Once 3+ slots are used, cards you own show up more often, so builds can come together
- When all slots are full: offers are **upgrades of your selected cards** and relics (stat cards fill any gaps)
- When every selected card is Lv5: offers are evolutions, evolved-card upgrades, relics, and stat cards
- New cards of the Run Build's **2 favored parts** show up more often (about 60% of new-card offers)

**Upgrading (finding the same card again)**

Finding a card you already own **does not add a new one**. It raises that card by 1 level and gives **one upgrade**. The card shows the upgrade before you pick it, e.g. *Bat Swarm · Lv 2 → 3 · +1 bat*.

| Upgrade | Effect (Common card) |
|---|---|
| **Damage** | +20% damage |
| **Projectiles** | +1 projectile (bat, bolt, knife, skeleton, cannonball…) |
| **Heal** | Heals more (or starts to heal), e.g. +1 HP per trigger |
| **Range** | +15% range or area size |
| **Speed** | +15% speed: faster cooldown, faster projectiles, or faster spin |
| **Duration** | +25% duration (burn, stun, buff, summon) |
| **Effect** | +25% of the card's special effect (chance, coins, stacks, charge) |

- Each card only rolls the upgrades that make sense for it (see the **Upgrades** column in each class's card table)
- The upgrade is rolled when the card appears. Card rarity makes it better:
  - **Common:** 1 upgrade
  - **Rare:** 1 upgrade at ×1.5 strength
  - **Epic:** 2 different upgrades at once
- The **Luck** stat raises the chance of Rare and Epic upgrade cards
- After a Wild card **evolves**, its card can still appear and gives **5 more levels** for the evolved version
- **Relics** work the same way: finding the same relic again adds its bonus again

**Relics (draft, 8)**

| Relic | Each time it is found (per level) |
|---|---|
| Heart Gem | +8% max HP |
| Swift Feather | +6% move speed |
| Whetstone | +10% crit damage |
| Magnet Stone | +20% pickup radius |
| Echo Stone | +5% ability area; +1 projectile at Lv3 and Lv5 |
| Arcane Ink | −5% ability cooldowns |
| Four-Leaf | +5% Luck |
| Iron Buckle | +2 armor |

**Ability Codex**
- A menu per class that lists all 16 of its cards and the Wild evolutions, plus all relics
- Things not found yet show as **"???"** with a small hint ("Something that burns where you walk…")
- After a Wild card is found, its evolution's **condition is revealed**, so the player knows what to hope for next time
- Finding everything unlocks cosmetic rewards

- Card rarity weights: Common 60 / Rare 28 / Epic 10 / Legendary 2 (the Luck stat shifts these)
- 1 free **reroll** per run (more from upgrades)
- Enemy strength scales with **wave number**, not player level

---

## 5. Maps (10)

Each map has its own palette, obstacles, enemy mix, and **one modifier**. Each map has a **reward multiplier** based on difficulty.

| # | Map | Modifier | Difficulty | Reward × |
|---|---|---|---|---|
| 1 | Whispering Forest | None (tutorial-friendly) | ★ | 1.0 |
| 2 | Sunken Crypt | Dark edges, limited vision | ★★ | 1.1 |
| 3 | Frostpeak Pass | Ice patches: slippery movement | ★★ | 1.1 |
| 4 | Clockwork Bazaar | Moving gears that push units | ★★ | 1.2 |
| 5 | Fungal Grotto | Mushrooms burst into poison clouds | ★★★ | 1.3 |
| 6 | Carnival of Masks | Random event every 20 s (fast enemies, double XP, etc.) | ★★★ | 1.3 |
| 7 | Ember Wastes | Lava cracks deal damage | ★★★ | 1.4 |
| 8 | Bloodmoon Village | Enemies heal a little over time | ★★★★ | 1.5 |
| 9 | Sky Ruins | Arena edges crumble over time | ★★★★ | 1.6 |
| 10 | The Void Rift | Gravity wells pull the player | ★★★★★ | 1.8 |

Suggestion: unlock maps in order by beating the previous one, or by reaching wave 6 on it.

---

## 6. Classes (10 + 1 starter)

Roster: **3 melee, 4 ranged, 3 magic**, plus the starter **Traveler**. There is room for 1 more melee and 1 more magic class later (see Open Decisions).

### Overview

| Class | Type | Role | Attack | Difficulty |
|---|---|---|---|---|
| **Traveler** (starter) | Melee | All-rounder, weak on purpose | Walking staff (hit) | ★ |
| **Vampire** | Melee | Sustain | Blood claws (hit) | ★★ |
| **Oathknight** | Melee | Tank | Sword sweep (hit) | ★ |
| **Pirate** | Melee | Cutlass + pistol | Cutlass (hit), pistol shot on dash | ★★ |
| **Bounty Hunter** | Ranged | Bow + falcon pet | Shortbow (shoot) | ★★ |
| **Jester** | Ranged | Chaos / luck | Thrown knives (shoot) | ★★★ |
| **Alchemist** | Ranged | Area damage | Thrown potions (shoot) | ★★ |
| **Tinkerer** | Ranged | Turrets & gadgets | Rivet gun (shoot) | ★★ |
| **Outsider** | Magic | Burst / control | Void orbs (shoot) | ★★★ |
| **Necromancer** | Magic | Skeleton commander | Commands skeletons: Strike 1 = attack, Strike 2 = march to cursor | ★★★ |
| **Cleric** | Magic | Holy damage & healing | Holy bolt (shoot) | ★★ |

### Base stats (draft)

Relative values, 1–5. Each class feels different from its base stats; there are no attributes to raise.

| Class | Max HP | Move speed | Damage | Attack speed | Range | Note |
|---|---|---|---|---|---|---|
| Traveler (starter) | 2 | 3 | 2 | 3 | 2 | Weaker on purpose |
| Vampire | 3 | 4 | 3 | 4 | 1 | 4% lifesteal |
| Oathknight | 5 | 2 | 3 | 2 | 2 | +5 armor |
| Pirate | 3 | 3 | 3 | 3 | 2 | Pistol shot on dash |
| Bounty Hunter | 2 | 4 | 3 | 4 | 5 | Falcon pet |
| Jester | 2 | 4 | 3 | 3 | 3 | +10% Luck |
| Alchemist | 3 | 3 | 3 | 2 | 3 | Area damage |
| Tinkerer | 3 | 3 | 2 | 5 | 4 | Turrets |
| Outsider | 1 | 3 | 5 | 2 | 4 | Lowest HP |
| Necromancer | 3 | 3 | 2 | 3 | 3 | Skeletons |
| Cleric | 4 | 2 | 4 | 2 | 3 | Healing |

Max HP by rating (draft): 1 = 60, 2 = 80, 3 = 100, 4 = 120, 5 = 150.

### Run Builds (chosen before each run)

Before each run, the player picks **1 Run Build** for the class. The build says what this run is going for.

**What a Run Build gives**
- **2 favored card parts** (e.g. Dash + Strike): new cards of these parts show up more often (about 60% of new-card offers)
- **A small perk** (see table)
- **Its own skill setup** (see 6.0)

**Rules**
- The build is a direction and a small bonus, **not a lock**. The player can still pick any card.
- Build unlocks per class: **Build 1** at start, **Build 2** at Specialist Lv 3, **Build 3** at Specialist Lv 6. A class can have a **4th build**, unlocked at Specialist Lv 9 (currently: Cleric's War Priest)
- The game remembers the last build used for each class

**Builds per class (draft)**

| Class | Build | Favored parts | Perk | Best-fit theme |
|---|---|---|---|---|
| Traveler | **Free Spirit** (only build) | Any 2, picked at run start | None | – |
| Vampire | **Blood Lord** | Heavy Strike + Ultimate | +1% lifesteal | Blood |
| | **Night Stalker** | Dash + Strike | Mist Step cooldown −10% | Night |
| | **Swarm Master** | Wild + Ultimate | Start the run with 1 bat | Swarm |
| Oathknight | **Bulwark** | Heavy Strike + Ultimate | +3 armor | Shield |
| | **Blademaster** | Strike + Dash | +10% swing size | Blade |
| | **Crusader** | Strike + Wild | +0.5 HP regen/s | Oath |
| Pirate | **Swashbuckler** | Strike + Dash | +5% attack speed | Cutlass |
| | **Deadeye** | Dash + Heavy Strike | Pistol reload −0.5 s | Gunpowder |
| | **Captain** | Ultimate + Wild | Broadside needs 5 fewer kills | Crew |
| Bounty Hunter | **Sharpshooter** | Strike + Heavy Strike | Arrows +10% damage | Archery |
| | **Falconer** | Wild + Ultimate | Falcons +20% damage | Falconry |
| | **Pathfinder** | Dash + Heavy Strike | Marks last +2 s | Tracking |
| Jester | **Trickster** | Dash + Ultimate | Decoy lasts +0.5 s | Trickster |
| | **High Roller** | Strike + Wild | +1 reroll | Gambler |
| | **Knife Juggler** | Strike + Heavy Strike | +1 knife per throw | Showman |
| Alchemist | **Firebrewer** | Strike + Dash | +10% fire damage | Fire |
| | **Plague Doctor** | Heavy Strike + Wild | Poison lasts +1 s | Toxin |
| | **Mad Mixer** | Ultimate + Wild | Combo effects +10% damage | Mixology |
| Tinkerer | **Engineer** | Wild + Ultimate | Turrets last +5 s | Turret |
| | **Gadgeteer** | Dash + Heavy Strike | Mine damage +15% | Gadget |
| | **Gunslinger** | Strike + Heavy Strike | +10% attack speed | Gunner |
| Outsider | **Riftcaller** | Ultimate + Wild | Rift Energy +10% faster | Rift |
| | **Phase Walker** | Dash + Strike | Blink cooldown −10% | Blink |
| | **Mad Scholar** | Heavy Strike + Wild | +10% XP | Knowledge |
| Necromancer | **Legion Lord** | Ultimate + Wild | +1 max skeleton | Legion |
| | **Spearmaster** | Strike + Heavy Strike | +10% skeleton attack reach | Bone |
| | **Soul Reaper** | Dash + Wild | Heal 1 HP every 10 kills | Soul |
| Cleric | **Lightbringer** | Strike + Heavy Strike | +10% holy damage | Light |
| | **Lifewarden** | Dash + Ultimate | +15% healing received | Mercy |
| | **Inquisitor** | Ultimate + Wild | Faith fills 10% faster | Judgment |
| | **War Priest** (4th build) | Heavy Strike + Wild | Holy Bolt becomes a short-range **hammer swing** (+40% damage, knockback) – the melee Cleric | Judgment |

Example: the same Vampire can play **Blood Lord** (tanky, heals a lot) in one run and **Night Stalker** (fast, fragile, big dash damage) in the next, depending on the map and what the player wants.

---

### 6.0 Skill Tree Rules (all classes)

The Specialist skill tree **changes how the class plays**, not only its numbers. Every skill does one of these:
- **Upgrade** a part of the kit (Heavy Strike, Dash, Ultimate) in a way you can see
- **Change weapon behavior** (e.g. claws fire a blood wave, the crossbow fires 3 quick bolts)
- **Add a weapon condition** ("when / while X, your weapon does Y")
- **Add a new ability** that is always part of the class

Every class has **6 tiers** with **3 skills in each tier**. Each tier changes **one part of the kit**, so the tree is easy to read:

| Tier | Part of the kit | Example (Vampire) |
|---|---|---|
| 1 | **Weapon** – how the basic attack works | *Blood Claws*: the 3rd hit fires a blood wave |
| 2 | **Condition** – when / while X, the weapon does Y | *Predator*: hits on enemies below 50% HP always crit |
| 3 | **New ability** – a permanent extra power | *Bat Familiar*: a bat orbits you and attacks |
| 4 | **Heavy Strike & Dash** – change one of them | *Bat Dash*: dashing releases bats |
| 5 | **Ultimate** – change how it works | *Night Flock*: Blood Moon summons 20 bats |
| 6 | **Capstone** – a big, build-defining power | *Undying*: revive once per run |

There are **no branches to commit to**. The 3 columns are only **themes** (e.g. Blood / Night / Swarm). The player can mix themes in any way.
(The starter **Traveler** has a smaller tree: 2 themes × 3 tiers, Specialist Lv cap 5. See 6.1.)

**Every skill is good, but the best one depends on your cards**
- Every skill has a **card-part tag**, shown in the column header (e.g. `Dash`). The skill gets **+15% effect for each card of that part you hold in the run** (max +45%, since each part has 3 cards).
- A few themes have **2 tags** and count cards of both parts (Cleric Judgment: `Heavy Strike / Ultimate`).
- In each class, the 3 themes use **different tags**, so the best pick in each tier depends on which cards you plan to take.
- Without matching cards, a skill still works, just weaker. **No skill is a trap.**

Example – Vampire, tier 2 (Condition):
- *Thirst* (`Heavy Strike`): while Blood Shield is up, claw hits cause bleeding → best when you take Heavy Strike cards
- *Predator* (`Dash`): hits on enemies below 50% HP always crit → best when you take Dash cards
- *Feeding Time* (`Wild`): bat kills make your next claw hit heal → best when you take Wild cards

**Skill levels**
- **Lv1 unlocks the change.** Lv2 and Lv3 make its numbers **+25% each** (unless the skill says otherwise).

| Tier | Max level |
|---|---|
| 1–4 | Lv 3 |
| 5 | Lv 2 |
| 6 (capstone) | Lv 1 |

**How the player selects skills**
1. Each Specialist Level gives **1 Skill Point (SP)**. Specialist Level cap: **15** (15 SP). All meta progression together is kept to about **30% of player power** (see 7, Power budget). Specialist EXP curve (draft): `expToNext(L) = 300 + 150 × (L − 1)`.
2. Open the class **Skill screen**: 6 tiers from top to bottom, 3 skills in each, with a short **preview animation** showing the change.
3. Tap a skill to see what it does, its card-part tag, and how much stronger it gets per matching card.
4. **Pick 1 skill per tier** and spend SP to level it. The other 2 skills in that tier stay unused in this setup.
5. Skills tagged with one of the selected Run Build's favored parts show a **★ Good fit** mark. It is only a hint.

**Unlocking tiers**

| Tier | Needs |
|---|---|
| 1 | Nothing |
| 2 | Tier 1 skill at Lv1+, 1 SP spent in total |
| 3 | Tier 2 skill at Lv1+, 3 SP spent |
| 4 | Tier 3 skill at Lv1+, 6 SP spent |
| 5 | Tier 4 skill at Lv1+, 9 SP spent |
| **6 · Capstone** | **A pick in every tier 1–5** and 13 SP spent. Any mix of themes is allowed. |

**Skill setups (one per Run Build)**
- Each Run Build keeps its **own setup** of skill picks. All setups use the same SP.
- Choosing a Run Build before a run loads its setup.
- Setups can be changed **for free** outside a run. Inside a run, the setup is locked.

> The skill tree is **meta progression** (permanent). The **Ability List** is **in-run** progression. Skill names are different from ability and card names to avoid confusion.

---

### 6.1 Traveler — *Starter class*

> Someone who left home with no title yet. Only a walking staff, worn boots, and a big dream. Every hero in the Shattered Realm started somewhere.

The Traveler is the **only class unlocked at the start**. It is **weaker on purpose**: lower base stats, a simple weapon, no class resource, and a small skill tree. Its job is to teach the basics and unlock the first real class.

- **Attack – Walking Staff (hit):** simple 2-hit combo, medium range, no special effects.
- **Dash – Roll:** basic dash with no extra effect.
- **Heavy Strike – Staff Slam (1.5 s cooldown):** an overhead slam that makes a small shockwave.
- **Ultimate – Rally Cry:** heal 30% HP and push all nearby enemies away. Simple, but it saves runs.
- **Passive – Quick Learner:** +10% XP in runs, so new players level a bit faster and see more cards.
- **Why it is weaker:** lower base stats (see the base stats table), no class resource, simpler in-run cards, a small skill tree, and Specialist Level cap **5**.

**In-run cards (unique to this class)**

| Card | Part | What it does | Upgrades | Evolution → condition |
|---|---|---|---|---|
| **Wanderlust** | Passive | Quick Learner gives more XP, plus a little move speed | Effect, Speed | – |
| **Sturdy Staff** | Strike | Staff combo hits harder and wider | Damage, Range | – |
| **Quick Jab** | Strike | Faster combo; the last hit pokes far | Speed, Damage | – |
| **Knock Away** | Strike | Hits knock back and stagger small enemies | Range, Duration | – |
| **Big Slam** | Heavy Strike | Staff Slam shockwave grows | Damage, Range | – |
| **Pebble Shower** | Heavy Strike | Staff Slam also throws 3 pebbles | Projectiles, Damage | – |
| **Ground Crack** | Heavy Strike | Staff Slam leaves a crack that slows enemies | Range, Duration | – |
| **Dust Roll** | Dash | Roll kicks up dust that slows enemies | Range, Duration | – |
| **Rolling Bump** | Dash | Roll damages enemies you pass | Damage, Range | – |
| **Light Feet** | Dash | Shorter dash cooldown; +1 charge at Lv5 | Speed | – |
| **Loud Rally** | Ultimate | Rally Cry heals more and gives speed afterward | Heal, Speed | – |
| **Rally Wave** | Ultimate | The push becomes a damaging wave | Damage, Range | – |
| **Hopeful Cry** | Ultimate | Rally Cry refunds part of its charge | Effect | – |
| **Lucky Coin** | Wild | Every 8 s, flip a coin: heads = damage buff, tails = heal | Heal, Duration, Effect | **Fortune's Favor** → + Wanderlust card |
| **Campfire** | Wild | Every 10 s, a small fire burns enemies and heals you nearby | Damage, Heal, Duration | **Hearthfire** → + any Ultimate card |
| **Thrown Stones** | Wild | Throw stones at the nearest enemy | Damage, Projectiles, Speed | **Rockslide** → + any Heavy Strike card |

- **Skill tree (mini)** – themes: **Grit** · **Wit**. 3 tiers, pick 1 of 2 per tier. Tier 3 needs a pick in tiers 1 and 2. Specialist Lv cap 5 → 5 SP.

| Tier | Grit · `Heavy Strike` | Wit · `Wild` |
|---|---|---|
| 1 · Weapon | **Heavy Staff** (Lv2): the 2nd combo hit knocks enemies back | **Pebble Sling** (Lv2): Staff Slam also throws a pebble at the nearest enemy |
| 2 · New ability | **Second Breath** (Lv2): heal 10 / 20% after each boss | **Map Reading** (Lv2): see the next wave's enemies; +1 free reroll per wave |
| **3 · Capstone** | **Late Bloomer**: every 10 in-run levels, +5% damage, max HP, and move speed | **Jack of All Trades**: level-up offers can include Wild cards from other classes |

- **Unlocking the first class:** beat Boss 1 (wave 3) with the Traveler → pick 1 free class: **Oathknight, Bounty Hunter, or Vampire**.
- **Late-game reason to play it:** the "Humble Beginnings" challenge. Win on The Void Rift with the Traveler to get a unique costume and title.

---

### 6.2 Vampire — *Sustain*

> A noble of the night who feeds on battle. Stays alive by hurting enemies.

- **Attack – Blood Claws (hit):** fast 3-hit combo. 3rd hit slashes wider.
- **Dash – Mist Step:** turns into mist and passes through enemies. Each enemy passed takes small damage and heals the Vampire a little.
- **Heavy Strike – Crimson Rend (1 s cooldown):** a lunging claw slash; heals 1% max HP for each enemy hit.
- **Ultimate – Blood Moon:** for 8 s, lifesteal ×3 and Blood Shield can grow to 100% of max HP. When it ends, the shield explodes and damages everything nearby.
- **Passive – Blood Thirst:** 4% lifesteal. Healing above max HP becomes a **Blood Shield** (up to 30% of max HP).
- **Weakness:** no natural HP regen; healing pickups are 50% weaker.

**In-run cards (unique to this class)**

| Card | Part | What it does | Upgrades | Evolution → condition |
|---|---|---|---|---|
| **Crimson Feast** | Passive | +1% lifesteal, and kills heal 1 HP | Heal, Effect | – |
| **Razor Claws** | Strike | Claws hit harder; the 3rd hit is wider | Damage, Range, Speed | – |
| **Bleeding Claws** | Strike | Claw hits cause bleeding | Damage, Duration | – |
| **Hemorrhage** | Strike | Crits make enemies burst in blood that heals you | Heal, Effect | – |
| **Rending Lunge** | Heavy Strike | Crimson Rend lunges farther and causes bleeding | Damage, Range, Duration | – |
| **Feeding Rend** | Heavy Strike | Crimson Rend heals more per enemy hit | Heal, Effect | – |
| **Twin Rend** | Heavy Strike | Crimson Rend strikes twice | Damage, Projectiles | – |
| **Mist Form** | Dash | Mist Step deals more damage and heals more per enemy | Damage, Heal, Range | – |
| **Blood Trail** | Dash | Mist Step leaves a blood trail that hurts enemies | Damage, Duration | – |
| **Swift Mist** | Dash | Shorter Mist Step cooldown; +1 charge at Lv5 | Speed | – |
| **Hunger Moon** | Ultimate | Blood Moon lasts longer with more lifesteal | Heal, Duration | – |
| **Red Moon Burst** | Ultimate | The shield explosion at the end is bigger | Damage, Range | – |
| **Thrall Moon** | Ultimate | During Blood Moon, killed enemies rise as thralls for 5 s | Projectiles, Duration | – |
| **Bat Swarm** | Wild | Bats circle you; their hits lifesteal | Damage, Projectiles, Speed | **Bat Storm** → + any Dash card |
| **Blood Rain** | Wild | Every 6 s, blood drops fall on enemies; each hit heals | Damage, Projectiles, Heal | **Red Monsoon** → Heart Gem relic |
| **Gaze of the Count** | Wild | Every 8 s, charm the nearest elite to fight for you for 3 s | Duration, Speed | **Thrall Master** → + Thrall Moon card |

- **Skill tree** – themes (mix freely; card-part tag in each column header): **Blood** (survive) · **Night** (damage) · **Swarm** (bats)

| Tier | Blood · `Heavy Strike` | Night · `Dash` | Swarm · `Wild` |
|---|---|---|---|
| 1 · Weapon | **Blood Claws** (Lv3): the 3rd combo hit fires a short blood wave | **Fang Flurry** (Lv3): the combo becomes 4 hits; the 4th is a quick lunge | **Bat Claws** (Lv3): every 3rd hit releases a bat that hunts for 3 s |
| 2 · Condition | **Thirst** (Lv3): while Blood Shield is up, claw hits cause bleeding | **Predator** (Lv3): hits on enemies below 50% HP always crit | **Feeding Time** (Lv3): when a bat kills, your next claw hit heals 2 HP |
| 3 · New ability | **Blood Pool** (Lv3): every 8 s, leave a blood pool; inside it, lifesteal ×2 | **Shadow Hunt** (Lv3): every 10 s, mark an elite; killing it resets dash and Heavy Strike | **Bat Familiar** (Lv3): a bat orbits you and attacks (Lv3: +1 bat) |
| 4 · Heavy Strike & Dash | **Drain Rend** (Lv3): Crimson Rend pulls a blood orb from each enemy hit; orbs heal | **Mist Clone** (Lv3): Mist Step leaves a clone that strikes once | **Bat Dash** (Lv3): dashing releases 2 bats along your path |
| 5 · Ultimate | **Crimson Moon** (Lv2): during Blood Moon, kills explode in blood and heal 1 HP each | **Eclipse** (Lv2): during Blood Moon, enemies lose track of you | **Night Flock** (Lv2): Blood Moon summons 20 bats |
| **6 · Capstone** | **Undying**: once per run, revive with 50% HP and a full Blood Shield | **Eternal Night**: every 30 s, 5 s of night: +50% damage and no dash cooldown | **Lord of Bats**: bats deal double damage; bat kills summon a temporary bat (max +5) |

---

### 6.3 Bounty Hunter — *Bow + Falcon* (replaces the Merchant)

> A sharp-eyed bounty hunter who tracks wanted monsters across the Shattered Realm, never far from Kestrel, her falcon. She marks the bounty; Kestrel does the rest.

Easy to read on purpose: **you shoot, you mark a target, and your bird attacks what you marked.**

- **Attack – Shortbow (shoot):** quick arrows toward the cursor.
- **Pet – Kestrel the falcon:** circles above you, dives on enemies (marked prey first), and fetches XP gems for you.
- **Dash – Feather Step:** a quick hop.
- **Heavy Strike – Mark Prey (2 s cooldown):** a heavy arrow that **marks** the first enemy it hits for 6 s. Kestrel dives on it at once.
- **Ultimate – Sky Hunt:** for 8 s, a flock of falcons dives on enemies all over the screen (marked prey more often).
- **Passive – Hawk Eye:** you deal **+50% damage to marked prey**.

**In-run cards (unique to this class)**

| Card | Part | What it does | Upgrades | Evolution → condition |
|---|---|---|---|---|
| **Keen Eye** | Passive | Marked prey takes +25% more damage; marks last longer | Effect, Duration | – |
| **Twin Arrows** | Strike | Shoot 2 arrows at once | Projectiles, Damage | – |
| **Piercing Arrows** | Strike | Arrows pass through 2 more enemies and fly farther | Damage, Range | – |
| **Quick Nock** | Strike | Shoot 25% faster | Speed | – |
| **Barbed Mark** | Heavy Strike | Mark Prey also makes the target bleed | Damage, Duration | – |
| **Spread Mark** | Heavy Strike | Mark Prey fires 3 arrows and can mark 3 enemies | Projectiles, Damage | – |
| **Pinning Shot** | Heavy Strike | Mark Prey pins the target in place for 1.5 s | Duration, Range | – |
| **Swoop Guard** | Dash | When you dash, your falcon swoops through enemies around you | Damage, Range | – |
| **Feather Fall** | Dash | After a dash, your next 3 arrows deal double damage | Damage, Effect | – |
| **Wind Step** | Dash | Shorter dash cooldown; +1 charge at Lv5 | Speed | – |
| **Long Hunt** | Ultimate | Sky Hunt lasts 3 s longer and dives hit harder | Damage, Duration | – |
| **Talon Storm** | Ultimate | More falcons join the Sky Hunt | Projectiles, Speed | – |
| **Feather Rain** | Ultimate | When Sky Hunt ends, sharp feathers rain around you | Damage, Range | – |
| **Second Falcon** | Wild | Another falcon joins you | Damage, Speed, Projectiles | **Falcon Pair** (dive twice as often, +50% damage) → + any Ultimate card |
| **Volley** | Wild | Every 6 s, arrows rain on the biggest group of enemies | Damage, Projectiles, Speed | **Arrow Storm** (twice the arrows, every 3 s) → + Twin Arrows card |
| **Feather Fetch** | Wild | Falcons fetch from farther and sometimes bring back a heal orb | Heal, Range | **Golden Feather** (heal orbs twice as often, double healing) → Magnet Stone relic |

- **Skill tree (draft)** – themes (mix freely; card-part tag in each column header): **Archery** (the bow) · **Falconry** (the birds) · **Tracking** (marks)

| Tier | Archery · `Strike` | Falconry · `Wild` | Tracking · `Heavy Strike` |
|---|---|---|---|
| 1 · Weapon | **Longbow** (Lv3): arrows fly 30% farther and hit harder at long range | **Talon Arrows** (Lv3): every 4th arrow is carried by Kestrel and homes in | **Tracer Arrows** (Lv3): every 5th arrow marks what it hits for 2 s |
| 2 · Condition | **Steady Aim** (Lv3): while standing still, arrows pierce 1 more enemy | **Together** (Lv3): while Kestrel is above you, you shoot 20% faster | **Bloodhound** (Lv3): marked enemies below 30% HP take double damage from Kestrel |
| 3 · New ability | **Trick Shot** (Lv3): every 8 s, an arrow bounces between 4 enemies | **Lookout** (Lv3): every 10 s, Kestrel dives on the nearest elite and stuns it 1 s | **Snare Line** (Lv3): every 12 s, lay a snare in front of you that roots the first enemy |
| 4 · Heavy Strike & Dash | **Recoil Shot** (Lv3): Feather Step fires a spread of 3 arrows backward | **Swoop Step** (Lv3): Feather Step sends Kestrel diving at the cursor | **Chain Mark** (Lv3): when marked prey dies, the mark jumps to the nearest enemy |
| 5 · Ultimate | **Rain of Arrows** (Lv2): during Sky Hunt, your arrows split in 2 | **King of the Sky** (Lv2): Sky Hunt calls a giant eagle that dives 3 times for huge damage | **Open Season** (Lv2): Sky Hunt marks every enemy it hits |
| **6 · Capstone** | **Deadeye**: every 10th arrow is a guaranteed crit that pierces everything | **Flock Leader**: +1 falcon; falcon kills shorten your Heavy Strike cooldown | **Apex Predator**: killing marked prey refunds Mark Prey and heals 2% max HP |

*Why the Merchant was replaced (Nov 2026):* the crossbow charge, Trade Coins, rerolls and pet-mimic jobs were too much to learn at once. The Bounty Hunter keeps "ranged + pet" with one simple loop. Trade Coins can come back later as a shop or map mechanic.

---

### 6.4 Jester — *Chaos / Luck*

> A royal fool who turned tricks into weapons. Nobody, not even the Jester, knows what happens next.

- **Attack – Juggling Knives (shoot):** throws 3 knives in a fan. Every 3rd throw adds a random effect: fire, ice, poison, or confetti (stun).
- **Dash – Cartwheel:** leaves a **decoy clone** that enemies attack. The decoy pops in confetti and damages nearby enemies.
- **Heavy Strike – Boomerang Blade (1 s cooldown):** throws a spinning blade that flies out and comes back, hitting twice.
- **Ultimate – Curtain Call:** 6 decoys appear around you and every enemy attacks them for 6 s. Then the show ends with a confetti explosion of random effects.
- **Passive – Wild Card:** level-up offers sometimes include a **Joker card**: a random Legendary card, or a funny curse with a big reward. +1 free reroll every wave.

**In-run cards (unique to this class)**

| Card | Part | What it does | Upgrades | Evolution → condition |
|---|---|---|---|---|
| **Loaded Dice** | Passive | +Luck and more Joker cards | Effect | – |
| **Sharper Knives** | Strike | Knives hit harder and fly faster | Damage, Speed | – |
| **Extra Knife** | Strike | +1 knife per throw | Projectiles | – |
| **Trick Knives** | Strike | The random effect comes every 2nd throw instead of every 3rd | Effect, Duration | – |
| **Wide Arc** | Heavy Strike | Boomerang Blade is bigger and flies farther | Damage, Range, Speed | – |
| **Double Boomerang** | Heavy Strike | Throw 2 Boomerang Blades | Projectiles, Damage | – |
| **Hover Blade** | Heavy Strike | The blade hovers for 1 s at the end, cutting everything near it | Duration, Damage | – |
| **Decoy Show** | Dash | The decoy lasts longer and pops bigger | Damage, Range, Duration | – |
| **Banana Peel** | Dash | Cartwheel leaves a peel that trips enemies | Range, Duration | – |
| **Quick Cartwheel** | Dash | Shorter dash cooldown; +1 charge at Lv5 | Speed | – |
| **Encore** | Ultimate | Curtain Call lasts longer and ends with a bigger blast | Damage, Duration | – |
| **Bigger Cast** | Ultimate | More decoys in the show | Projectiles, Range | – |
| **Fireworks Finale** | Ultimate | The final blast launches fireworks across the screen | Damage, Projectiles | – |
| **Prank Box** | Wild | Spring traps launch enemies into the air | Damage, Projectiles, Range | **Surprise Party** → + Banana Peel card |
| **Juggling Balls** | Wild | 3 balls bounce around the arena | Damage, Projectiles, Speed | **Cannonball Juggle** → + any Strike card |
| **Laughing Gas** | Wild | A cloud makes enemies laugh and stop attacking for 1 s | Range, Duration | **Hysteria** → + any Ultimate card |

- **Skill tree** – themes (mix freely; card-part tag in each column header): **Trickster** (decoys) · **Gambler** (luck & cards) · **Showman** (knives)

| Tier | Trickster · `Dash` | Gambler · `Wild` | Showman · `Strike` |
|---|---|---|---|
| 1 · Weapon | **Sticky Knives** (Lv3): knives stick in enemies and pop after 1 s | **Wild Knives** (Lv3): every knife rolls its own random effect | **Fan Dance** (Lv3): knives fly in a full circle instead of a fan |
| 2 · Condition | **Distraction** (Lv3): enemies attacking a decoy take +20% damage from you | **Seven's Grace** (Lv3): every 7th throw has all random effects at once | **Applause** (Lv3): each kill without getting hit gives +2% damage (max 20%); lost when hit |
| 3 · New ability | **Puppet Show** (Lv3): every 10 s, a puppet walks toward enemies and explodes | **Dice Roll** (Lv3): every 15 s, roll a die for a random 5 s buff | **Spotlight** (Lv3): a moving spotlight; inside it, knives pierce and fly faster |
| 4 · Heavy Strike & Dash | **Busy Decoy** (Lv3): the Cartwheel decoy throws knives | **Loaded Boomerang** (Lv3): Boomerang Blade gets a random effect each throw | **Ricochet Blade** (Lv3): Boomerang Blade bounces between 2 enemies before returning |
| 5 · Ultimate | **Second Act** (Lv2): Curtain Call decoys copy your attacks | **Grand Lottery** (Lv2): the final explosion rolls 3 random effects | **Standing Ovation** (Lv2): when the show ends, knives rain over the screen |
| **6 · Capstone** | **Hall of Mirrors**: dash leaves 3 decoys that copy your attacks for 3 s | **All In**: level-ups show 4 cards and one is always Legendary, but you take +10% damage | **Grand Finale**: every 50 kills, your next throw is 20 knives with all effects |

---

### 6.5 Outsider — *Magic*

> A stranger from beyond the stars who fell into the Shattered Realm. Uses magic that does not follow this world's rules.

- **Attack – Void Orbs (shoot):** slow homing orbs that pulse damage around them.
- **Resource – Rift Energy:** fills as you cast. When full, your next cast opens a **Rift** – a large area that pulls enemies in and damages them.
- **Dash – Blink:** instant teleport a short distance with longer invulnerability. Leaves a small rift that pulls enemies.
- **Heavy Strike – Void Lance (3 s cooldown):** a piercing beam in a straight line toward the cursor.
- **Ultimate – Event Horizon:** a black hole opens at the cursor, pulls enemies in for 5 s, then collapses for huge damage.
- **Passive – Strange Knowledge:** +2% spell damage for every **different** card you own (rewards variety).
- **Weakness:** lowest HP of all classes.

**In-run cards (unique to this class)**

| Card | Part | What it does | Upgrades | Evolution → condition |
|---|---|---|---|---|
| **Unknowable Mind** | Passive | Bigger Strange Knowledge bonus and faster Rift Energy | Effect, Speed | – |
| **Dense Orbs** | Strike | Orbs pulse harder and wider | Damage, Range | – |
| **Twin Orbs** | Strike | Fire 2 orbs at once | Projectiles | – |
| **Lingering Orbs** | Strike | Orbs stay longer before fading | Duration, Damage | – |
| **Long Lance** | Heavy Strike | Void Lance is longer and wider | Damage, Range | – |
| **Void Burn** | Heavy Strike | Void Lance leaves a burning void line | Damage, Duration | – |
| **Quick Lance** | Heavy Strike | Shorter Void Lance cooldown | Speed | – |
| **Far Blink** | Dash | Blink goes farther; its rift pulls longer | Range, Duration | – |
| **Twin Blink** | Dash | Shorter Blink cooldown; +1 charge at Lv5 | Speed | – |
| **Void Wake** | Dash | After Blink, orbs appear where you were | Projectiles, Damage | – |
| **Deeper Void** | Ultimate | Event Horizon pulls harder and lasts longer | Damage, Range, Duration | – |
| **Spaghettify** | Ultimate | Pulled enemies take damage over time | Damage, Duration | – |
| **Rebound Rift** | Ultimate | When Event Horizon ends, refund part of the charge | Effect | – |
| **Gravity Well** | Wild | Orbs pull enemies together | Range, Effect | **Crushing Gravity** → + Deeper Void card |
| **Starfall** | Wild | Stars fall on random enemies | Damage, Projectiles, Speed | **Cosmic Rain** → + Unknowable Mind card |
| **Watcher Eye** | Wild | A floating eye fires beams at elites | Damage, Projectiles, Speed | **Thousand Eyes** → + any Heavy Strike card |

- **Skill tree** – themes (mix freely; card-part tag in each column header): **Rift** (big area spells) · **Blink** (movement & survival) · **Knowledge** (variety & scaling)

| Tier | Rift · `Ultimate` | Blink · `Dash` | Knowledge · `Wild` |
|---|---|---|---|
| 1 · Weapon | **Heavy Orbs** (Lv3): orbs move slower but pulse twice as big | **Seeker Orbs** (Lv3): orbs become fast homing darts | **Split Orbs** (Lv3): orbs split into 3 small orbs on the first hit |
| 2 · Condition | **Resonance** (Lv3): orbs inside a Rift deal double damage | **Phase Charge** (Lv3): after Blink, the next 3 orbs are instant and pierce | **Cross Study** (Lv3): enemies hit by 3 different sources take +25% damage |
| 3 · New ability | **Small Singularity** (Lv3): every 10 s, a mini Rift opens on a group of enemies | **Afterimage** (Lv3): Blink leaves an afterimage that fires orbs for 3 s | **Meteor Mind** (Lv3): a star falls on an enemy every 4 s |
| 4 · Heavy Strike & Dash | **Lance Rift** (Lv3): Void Lance opens small Rifts along its line | **Blink Lance** (Lv3): Blink fires a Void Lance backward | **Prism Lance** (Lv3): Void Lance splits into 3 beams |
| 5 · Ultimate | **Twin Horizons** (Lv2): Event Horizon opens 2 black holes | **Moving Singularity** (Lv2): Event Horizon follows you | **Deep Knowledge** (Lv2): Event Horizon +5% damage per ability you own |
| **6 · Capstone** | **Open Door**: Rifts last twice as long and also pull bosses | **Elsewhere**: kills reset Blink; for 2 s after Blink, spells deal +40% | **Infinite Library**: every 5 levels in a run, gain a free random Epic card |

---

### 6.6 Oathknight — *Tank* (draft)

> A knight who swore to protect the broken kingdom. Slow but very hard to kill.

- **Attack – Sword Sweep (hit):** wide, slow swing that hits many enemies.
- **Dash – Shield Charge:** pushes enemies back and stuns them briefly.
- **Heavy Strike – Shield Slam (2 s cooldown):** a cone slam that stuns enemies for 0.3 s and breaks enemy shields.
- **Ultimate – Unbreakable Oath:** for 6 s you take no damage and every enemy targets you. Each blocked hit powers a giant sword wave at the end.
- **Passive – Bulwark:** after 4 s without taking damage, gain a shield that blocks the next hit.

**In-run cards (unique to this class)**

| Card | Part | What it does | Upgrades | Evolution → condition |
|---|---|---|---|---|
| **Bulwark Vow** | Passive | Bulwark recharges faster and blocks more | Speed, Effect | – |
| **Holy Blade** | Strike | Swings send a light wave | Damage, Range | – |
| **Heavy Swings** | Strike | Swings hit harder and knock back | Damage, Range | – |
| **Quick Strokes** | Strike | Faster swings | Speed | – |
| **Crushing Slam** | Heavy Strike | Shield Slam is bigger and stronger | Damage, Range, Duration | – |
| **Shield Toss** | Heavy Strike | Shield Slam throws the shield, which bounces between enemies | Projectiles, Damage | – |
| **Rally Slam** | Heavy Strike | Shield Slam heals you per enemy hit | Heal, Effect | – |
| **Thunder Charge** | Dash | Shield Charge goes farther and stuns longer | Damage, Range, Duration | – |
| **Iron Charge** | Dash | You block all damage during Shield Charge and for a moment after | Duration, Effect | – |
| **Double Charge** | Dash | Shorter cooldown; +1 charge at Lv5 | Speed | – |
| **Vow of Iron** | Ultimate | Unbreakable Oath lasts longer; the final wave is bigger | Damage, Duration | – |
| **Vengeance Waves** | Ultimate | The final wave splits into 3 waves | Projectiles, Damage | – |
| **Holy Ground** | Ultimate | During the Oath, holy ground burns enemies around you | Damage, Range | – |
| **Thorns** | Wild | Attackers take damage back | Damage, Effect | **Bramble Plate** → + Bulwark Vow card |
| **Spinning Shields** | Wild | 2 shields orbit you and block projectiles | Projectiles, Speed, Range | **Aegis Ring** → + any Dash card |
| **Light of the Order** | Wild | Every 10 s, a holy beam hits the nearest elite | Damage, Speed | **Order's Judgment** → + Holy Blade card |

- **Skill tree** – themes (mix freely; card-part tag in each column header): **Shield** (defense) · **Blade** (sword damage) · **Oath** (healing & holy)

| Tier | Shield · `Heavy Strike` | Blade · `Strike` | Oath · `Wild` |
|---|---|---|---|
| 1 · Weapon | **Bash Combo** (Lv3): the 3rd swing is a shield bash that knocks back | **Twin Swing** (Lv3): swings hit in front and behind | **Radiant Edge** (Lv3): swings send a light wave |
| 2 · Condition | **Counter** (Lv3): after Bulwark blocks a hit, the next swing deals +100% | **Momentum** (Lv3): each swing that hits 3+ enemies makes the next one 15% faster (max 3) | **Righteous** (Lv3): while below 50% HP, swings send 2 light waves |
| 3 · New ability | **War Banner** (Lv3): every 15 s, plant a banner; near it, +armor and regen | **Spectral Sword** (Lv3): a ghost sword copies every 3rd swing | **Holy Aura** (Lv3): nearby enemies take holy damage every second |
| 4 · Heavy Strike & Dash | **Shield Wall** (Lv3): Shield Slam leaves a wall for 2 s that blocks projectiles | **Charge Cut** (Lv3): Shield Charge ends with a spin slash | **Consecrate** (Lv3): Shield Slam leaves holy ground that heals you |
| 5 · Ultimate | **Iron Oath** (Lv2): Unbreakable Oath reflects all blocked damage | **Blade Oath** (Lv2): during Unbreakable Oath, swings are huge and fast | **Sacred Oath** (Lv2): Unbreakable Oath heals 3% per blocked hit |
| **6 · Capstone** | **Last Stand**: once per run at 0 HP, become immune for 5 s and heal 50% | **Kingsblade**: each kill in a wave gives +2% sword size and damage (max +40%) | **Oath of Light**: every 20 s, a holy nova hits all enemies on screen and heals you 15% |

---

### 6.7 Pirate — *Cutlass + Pistol*

> A sky pirate whose flying ship crashed when the realm broke. Fights dirty with a cutlass and an old flintlock pistol. The crew still flies above and helps with cannons.

- **Attack – Cutlass (hit):** 3-hit combo with wide slashes.
- **Dash – Swashbuckle:** a quick dash that ends with a **pistol shot** toward the cursor (one big bullet). The pistol reloads in 3 s; dashing while not loaded is a normal dash.
- **Heavy Strike – Keelhaul (3 s cooldown):** throw a hook that pulls one enemy to you and stuns it for 0.5 s (elites are pulled halfway).
- **Ultimate – Fire All Cannons:** the ship fires a huge barrage around the cursor for 5 s.
- **Passive – Broadside:** every 25 kills, the crew fires a **cannon barrage** around you from the ship.
- **Weakness:** medium HP. The pistol reload makes dash timing important.

**In-run cards (unique to this class)**

| Card | Part | What it does | Upgrades | Evolution → condition |
|---|---|---|---|---|
| **Loaded Broadside** | Passive | Broadside needs fewer kills and fires more cannonballs | Damage, Projectiles, Speed | – |
| **Salt Steel** | Strike | Cutlass hits harder and swings wider | Damage, Range, Speed | – |
| **Plank Walk** | Strike | Knocked-back enemies hurt the enemies they hit | Damage, Range | – |
| **Cutthroat** | Strike | The 3rd hit causes bleeding | Damage, Duration | – |
| **Long Rope** | Heavy Strike | Keelhaul reaches farther and stuns longer | Range, Duration | – |
| **Double Hook** | Heavy Strike | Keelhaul pulls 2 enemies | Projectiles, Range | – |
| **Powder Hook** | Heavy Strike | The pulled enemy explodes when it reaches you | Damage, Range | – |
| **Grapeshot** | Dash | The Swashbuckle shot spreads into pellets | Damage, Projectiles, Range | – |
| **Quick Reload** | Dash | The pistol reloads faster | Speed | – |
| **Trick Shot** | Dash | The pistol bullet bounces to more enemies | Projectiles, Damage | – |
| **Bigger Barrage** | Ultimate | Fire All Cannons fires more cannonballs for longer | Damage, Projectiles, Duration | – |
| **Chain Shot** | Ultimate | Cannonballs bounce | Projectiles, Damage | – |
| **Plunder** | Ultimate | Fire All Cannons kills drop coins (+attack speed) | Speed, Effect | – |
| **Monkey Mate** | Wild | A monkey throws coconuts at enemies | Damage, Projectiles, Speed | **Monkey Mutiny** → + any Dash card |
| **Rum Barrel** | Wild | Every 12 s, roll a barrel that explodes in fire | Damage, Range, Duration | **Barrel Bombardment** → + Powder Hook card |
| **Ghost Crew** | Wild | Every 15 s, a ghost pirate fights with you for 5 s | Damage, Projectiles, Duration | **Flying Dutchman** → + any Ultimate card |

- **Skill tree** – themes (mix freely; card-part tag in each column header): **Cutlass** (sword) · **Gunpowder** (pistol & explosions) · **Crew** (cannons)

| Tier | Cutlass · `Strike` | Gunpowder · `Dash` | Crew · `Wild` |
|---|---|---|---|
| 1 · Weapon | **Dual Cutlass** (Lv3): the combo becomes 5 fast hits with two blades | **Powder Blade** (Lv3): the 3rd hit makes a small powder explosion | **Crew Shout** (Lv3): every 3rd hit calls a cannonball on the target |
| 2 · Condition | **Riposte** (Lv3): after a dash, the next cutlass hit deals +50% | **Point Blank** (Lv3): the pistol shot deals +50% to very close enemies | **Rally the Crew** (Lv3): while below 50% HP, Broadside needs half the kills |
| 3 · New ability | **Sea Spray** (Lv3): every 6 s, a spin slash around you | **Powder Kegs** (Lv3): kegs drop every 10 s; hit them to explode | **Boarding Party** (Lv3): each barrage drops a crew member who fights for 8 s |
| 4 · Heavy Strike & Dash | **Keelhaul Slash** (Lv3): after Keelhaul pulls, you slash automatically | **Second Pistol** (Lv3): Swashbuckle stores 2 shots | **Anchor Drop** (Lv3): Keelhaul throws an anchor that smashes an area |
| 5 · Ultimate | **Boarding Action** (Lv2): during Fire All Cannons, cutlass hits make shockwaves | **Hot Shot** (Lv2): cannonballs leave burning ground | **Full Crew** (Lv2): Fire All Cannons lasts 3 s longer and follows the cursor |
| **6 · Capstone** | **Pirate King's Blade**: every cutlass kill makes your next pistol shot +20% (stacks up to 5) and cuts reload by 0.3 s | **Blackpowder Storm**: the pistol reloads instantly on kill, and every shot explodes | **Full Broadside**: the ship also fires every 15 s without kills, and barrages are twice as big |

---

### 6.8 Alchemist — *Area Damage* (draft)

> A scholar who throws bottles of strange liquids. Every fight is an experiment.

- **Attack – Potion Throw (shoot):** lobs a potion at the cursor. It breaks and leaves a puddle (fire, poison, or slow – cycles).
- **Dash – Smoke Bomb:** leaves a smoke cloud. Enemies inside lose track of you and move slower.
- **Heavy Strike – Big Flask (2.5 s cooldown):** a large flask that leaves fire, poison, and slow puddles at once (an instant combo).
- **Ultimate – Grand Experiment:** 20 random potions rain over the screen for 6 s.
- **Passive – Mixology:** when two different puddles touch, they make a combo effect (fire + poison = toxic explosion, slow + fire = steam burst).

**In-run cards (unique to this class)**

| Card | Part | What it does | Upgrades | Evolution → condition |
|---|---|---|---|---|
| **Master Mixer** | Passive | Mixology combos are stronger | Damage, Effect | – |
| **Volatile Flask** | Strike | Potions splash wider and hit harder | Damage, Range | – |
| **Quick Hands** | Strike | Throw 2 potions at once | Projectiles, Speed | – |
| **Lingering Brew** | Strike | Puddles last longer | Duration | – |
| **Bigger Bottles** | Heavy Strike | Big Flask puddles are bigger and last longer | Damage, Range, Duration | – |
| **Cluster Flask** | Heavy Strike | Big Flask breaks into 3 smaller flasks | Projectiles, Damage | – |
| **Healing Splash** | Heavy Strike | Big Flask also leaves a healing puddle for you | Heal, Duration | – |
| **Smokescreen** | Dash | Smoke Bomb is bigger and lasts longer | Range, Duration | – |
| **Slippery Oil** | Dash | The dash leaves oil; fire potions ignite it | Damage, Range | – |
| **Quick Vanish** | Dash | Shorter dash cooldown; +1 charge at Lv5 | Speed | – |
| **Overbrew** | Ultimate | Grand Experiment throws more potions for longer | Projectiles, Duration | – |
| **Aimed Rain** | Ultimate | Potions fall around the cursor | Damage, Range | – |
| **Golden Batch** | Ultimate | Each potion can be golden (all effects at once) | Effect | – |
| **Philosopher's Stone** | Wild | Some kills drop heal potions | Heal, Effect | **Elixir of Life** → + Healing Splash card |
| **Acid Rain** | Wild | Every 8 s, acid falls on an area and lowers armor | Damage, Range, Duration | **Corrosive Storm** → + any Ultimate card |
| **Homunculus** | Wild | A small helper throws potions with you | Damage, Projectiles, Speed | **Golem Brew** → + any Strike card |

- **Skill tree** – themes (mix freely; card-part tag in each column header): **Fire** (burst) · **Toxin** (poison spread) · **Mixology** (combos & utility)

| Tier | Fire · `Strike` | Toxin · `Heavy Strike` | Mixology · `Ultimate` |
|---|---|---|---|
| 1 · Weapon | **Molotov** (Lv3): potions burst into a line of fire | **Gas Flask** (Lv3): potions become gas clouds that drift toward enemies | **Random Brew** (Lv3): each potion is a random type; small chance of a golden potion |
| 2 · Condition | **Hot Hands** (Lv3): burning enemies take +20% damage from potions | **Weak Spot** (Lv3): potion impacts deal +30% to poisoned enemies | **Catalyst** (Lv3): combos refresh the puddles they touch |
| 3 · New ability | **Fire Imp** (Lv3): a small imp follows you and throws embers | **Toxic Aura** (Lv3): you leak poison while moving | **Cauldron** (Lv3): every 15 s, place a cauldron that throws potions |
| 4 · Heavy Strike & Dash | **Napalm Flask** (Lv3): Big Flask's fire puddle grows over time | **Poison Smoke** (Lv3): Smoke Bomb also poisons | **Quick Brew** (Lv3): Big Flask cooldown halved, but its puddles are random |
| 5 · Ultimate | **Firestorm** (Lv2): Grand Experiment potions are all fire and leave burning ground | **Plague Rain** (Lv2): Grand Experiment potions are all poison and spread | **Mad Science** (Lv2): Grand Experiment throws 10 more potions; combos ×2 |
| **6 · Capstone** | **Inferno**: fire puddles merge into one big blaze that keeps growing | **Pandemic**: poison spreads to every nearby enemy with no limit | **Grand Reaction**: combos deal double damage; all 3 puddle types together make a golden explosion |

---

### 6.9 Necromancer — *Skeleton Commander*

> A dark mage who commands a small squad of skeleton soldiers. The Necromancer stays back and gives orders; the skeletons do the fighting.

**How it plays (like Azir in League of Legends):** the skeletons are **soldiers you place and command**. **Strike 1** makes them attack, **Strike 2** moves them to the cursor. Good play is about putting the squad in the right spot.

- **Skeleton soldiers:** you start with **3 skeletons** (more from cards and skills). They **stand where you put them** and do not wander. Enemies cannot target them.
  - **Command range:** skeletons only obey when they are within about 6 tiles of you. If you move too far away (about 10 tiles), a skeleton crumbles and rises again next to you after 3 s.
- **Strike 1 – Command: Attack (left click):** every skeleton in command range thrusts its spear toward the cursor, hitting enemies in a short line in front of it. If no skeleton is in range, the Necromancer throws a weak bone shard instead.
- **Strike 2 – Command: March (right click, 2 s cooldown):** all skeletons in command range **rush to the cursor**, damaging enemies they pass through, then hold that new spot.
- **Dash – Grave Step:** a short dash toward the cursor. If a skeleton is near the end point, you dash **to that skeleton** and knock nearby enemies back.
- **Ultimate – Army of the Dead:** raise 10 extra skeletons for 12 s around the cursor. They follow your Attack and March commands like the rest of the squad.
- **Passive – Raise Dead:** kills have a 10% chance to raise a **temporary** extra skeleton for 10 s (max 2 extra at once).
- **Weakness:** the Necromancer's own attack is very weak. Bad skeleton placement means very little damage.

**In-run cards (unique to this class)**

| Card | Part | What it does | Upgrades | Evolution → condition |
|---|---|---|---|---|
| **Restless Graves** | Passive | +1 max skeleton; temporary skeletons rise more often | Projectiles, Effect | – |
| **Sharpened Spears** | Strike | Skeleton attacks hit harder and reach farther | Damage, Range | – |
| **Phalanx** | Strike | Skeleton thrusts become wide sweeps that hit more enemies | Range, Damage | – |
| **Quick Orders** | Strike | Skeletons attack faster | Speed | – |
| **Trampling March** | Heavy Strike | Enemies hit by the March take more damage and are knocked aside | Damage, Range | – |
| **Grave Rush** | Heavy Strike | Skeletons march faster and land with a small shockwave | Speed, Damage | – |
| **Dread March** | Heavy Strike | Enemies the March passes through are slowed | Duration, Range | – |
| **Spiked Grave** | Dash | Grave Step leaves bone spikes where you land | Damage, Range, Duration | – |
| **Long Leash** | Dash | Grave Step can reach skeletons much farther away | Range | – |
| **Bone Shield** | Dash | After dashing, gain a bone shield that blocks 1 hit | Duration, Effect | – |
| **Grand Army** | Ultimate | Army of the Dead raises more skeletons for longer | Projectiles, Duration | – |
| **Bone Giants** | Ultimate | Some raised skeletons are big brutes | Damage, Effect | – |
| **Last Rites** | Ultimate | When the Army ends, heal for each skeleton | Heal | – |
| **Corpse Explosion** | Wild | Corpses explode | Damage, Range | **Chain Detonation** → + any Heavy Strike card |
| **Bone Armor** | Wild | +armor for each skeleton near you | Effect, Duration | **Ossified** → Iron Buckle relic |
| **Wraith** | Wild | A wraith flies through enemies and drains them | Damage, Heal, Speed | **Banshee** → + any Dash card |

- **Skill tree** – themes (mix freely; card-part tag in each column header): **Legion** (more and tougher skeletons) · **Bone** (skeleton attacks) · **Soul** (healing & XP)

| Tier | Legion · `Ultimate` | Bone · `Strike` | Soul · `Wild` |
|---|---|---|---|
| 1 · Weapon | **Shield Bearers** (Lv3): skeletons carry shields and block enemy projectiles near them | **Bone Javelins** (Lv3): skeletons throw their spears at range (longer reach, a bit less damage) | **Soul Spears** (Lv3): skeleton kills release a wisp that seeks enemies |
| 2 · Condition | **Strength in Numbers** (Lv3): skeletons standing close together deal +25% | **Crossfire** (Lv3): an enemy hit by 3 skeletons in one attack takes bonus damage | **Soul Debt** (Lv3): enemies killed near your skeletons heal you 1 HP |
| 3 · New ability | **Skeleton Archer** (Lv3): one squad member becomes an archer that shoots from far | **Bone Ring** (Lv3): bone blades circle you | **Spirit Wolf** (Lv3): a ghost wolf hunts nearby enemies |
| 4 · Heavy Strike & Dash | **Grave Call** (Lv3): Grave Step raises a temporary skeleton where you land | **Spike Trail** (Lv3): the March leaves a trail of bone spikes | **Soul March** (Lv3): March kills drop soul orbs (heal + Ultimate charge) |
| 5 · Ultimate | **Endless Army** (Lv2): Army of the Dead skeletons stay until killed | **Bone Burst** (Lv2): when Army of the Dead ends, skeletons explode into shards | **Reaper's Harvest** (Lv2): Army of the Dead kills refund 1% Ultimate charge each |
| **6 · Capstone** | **Lord of the Dead**: +3 max skeletons, and crumbled skeletons rise instantly | **Bone Storm**: a ring of bone blades always circles you | **Lich Form**: once per run at 0 HP, become a Lich for 15 s (immune, every kill raises), then revive with 40% HP |

---

### 6.10 Cleric — *Holy Light*

> A priest of the old sun temple who carries the last light of the broken crown. Burns monsters with holy light and keeps herself standing through the long fights.

- **Attack – Holy Bolt (shoot):** a bolt of light that bursts in a small area on hit. Slow attack speed, strong hits.
- **Dash – Radiant Step:** the dash leaves a trail of light. Enemies on the trail take damage, and you heal 1 HP for each enemy it hits.
- **Heavy Strike – Smite (2 s cooldown):** a holy hammer falls from the sky at the cursor. Purify applies.
- **Ultimate – Divine Intervention:** heal to full, then pillars of light hit every enemy on screen for 5 s. Undead take double damage.
- **Resource – Faith:** kills fill Faith. When Faith is full, **Judgment** fires automatically: a pillar of light on the strongest enemy nearby.
- **Passive – Purify:** +25% damage to undead and dark enemies (skeletons, bats, cultists, Bone Colossus, The Hollow King).
- **Weakness:** slow attack speed. Purify does nothing against beasts and slimes.

**In-run cards (unique to this class)**

| Card | Part | What it does | Upgrades | Evolution → condition |
|---|---|---|---|---|
| **Devout** | Passive | Faith fills faster; Purify is stronger | Speed, Effect | – |
| **Sacred Flame** | Strike | Bolts leave burning holy ground | Damage, Range, Duration | – |
| **Twin Bolts** | Strike | Fire 2 bolts at once | Projectiles | – |
| **Swift Prayer** | Strike | Faster attack speed | Speed | – |
| **Heavier Smite** | Heavy Strike | Smite hits harder over a bigger area | Damage, Range | – |
| **Echo Smite** | Heavy Strike | Smite hits again 1 s later | Damage, Effect | – |
| **Healing Smite** | Heavy Strike | Smite heals you per enemy hit | Heal | – |
| **Blessed Path** | Dash | Radiant Step trail hurts more and heals more | Damage, Heal, Duration | – |
| **Holy Leap** | Dash | Dash farther and land with a burst of light | Range, Damage | – |
| **Light Step** | Dash | Shorter dash cooldown; +1 charge at Lv5 | Speed | – |
| **Greater Intervention** | Ultimate | More pillars, and it lasts longer | Damage, Heal, Duration | – |
| **Wrath of Heaven** | Ultimate | Pillars deal extra damage to undead and bosses | Damage, Effect | – |
| **Afterglow** | Ultimate | After Divine Intervention, strong regen for 5 s | Heal, Duration | – |
| **Guardian Angel** | Wild | Once per wave, survive a killing blow with 1 HP | Effect | **Seraph** → + Afterglow card |
| **Holy Orbs** | Wild | 2 orbs circle you and burn enemies (extra vs undead) | Damage, Projectiles, Speed | **Sun Ring** → + any Strike card |
| **Falling Bell** | Wild | Every 10 s, a holy bell drops on enemies | Damage, Range, Speed | **Cathedral Bells** → + any Heavy Strike card |

- Judgment skills count both Heavy Strike and Ultimate cards, so both War Priest and Inquisitor use them.
- **Skill tree** – themes (mix freely; card-part tag in each column header): **Light** (damage) · **Mercy** (healing) · **Judgment** (Faith & pillars)

| Tier | Light · `Strike` | Mercy · `Dash` | Judgment · `Heavy Strike / Ultimate` |
|---|---|---|---|
| 1 · Weapon | **Beam of Light** (Lv3): hold attack to channel Holy Bolt as a beam | **Healing Bolts** (Lv3): bolt hits leave a healing spark to pick up | **Holy Hammer** (Lv3): Holy Bolt becomes a thrown hammer that returns |
| 2 · Condition | **Radiance** (Lv3): while at full HP, bolts pierce | **Martyr** (Lv3): taking damage makes the next bolt +50% and fills Faith | **Condemn** (Lv3): enemies hit by Judgment take +20% damage for 5 s |
| 3 · New ability | **Halo** (Lv3): a halo circles you and burns enemies | **Cherub** (Lv3): a small angel heals 1 HP every 3 s and blocks a projectile every 10 s | **Bell of Judgment** (Lv3): every 20 kills, a bell rings and stuns nearby enemies |
| 4 · Heavy Strike & Dash | **Prism Smite** (Lv3): Smite splits into 3 smaller smites | **Sanctuary Step** (Lv3): Radiant Step trail heals double and lasts longer | **Hammer Smite** (Lv3): Smite lands with a shockwave and knockback |
| 5 · Ultimate | **Dawn** (Lv2): Divine Intervention pillars become a sweeping sun beam | **Miracle** (Lv2): Divine Intervention also gives a 5 s shield | **Final Judgment** (Lv2): Divine Intervention pillar kills fill Faith |
| **6 · Capstone** | **Dawnbringer**: bolts become a steady beam that pierces every enemy in a line | **Saint**: all overhealing becomes holy damage around you | **Day of Judgment**: Judgment strikes 3 times, and each pillar kill gives back 10% Faith |

---

### 6.11 Tinkerer — *Turrets & Gadgets*

> A gnome inventor from the Clockwork Bazaar who builds small machines from the realm's broken pieces.

- **Attack – Rivet Gun (shoot):** fast small bolts, low damage per shot.
- **Dash – Rocket Boots:** a quick boost that drops a small mine where you started.
- **Heavy Strike – Overcharged Shot (0.5 s cooldown):** a heavier rivet that bursts into a little shrapnel; works like an alt-fire.
- **Ultimate – Mech Suit:** pilot a mech for 10 s with a big shield, rocket punches, and rocket volleys.
- **Passive – Builder:** every 8 s, builds a **Turret** where you stand (max 2). Turrets shoot nearby enemies and last 20 s.
- **Weakness:** strongest when fighting near turrets; weaker when always running.

**In-run cards (unique to this class)**

| Card | Part | What it does | Upgrades | Evolution → condition |
|---|---|---|---|---|
| **Better Builder** | Passive | Turrets build faster and last longer | Speed, Duration | – |
| **Hot Rivets** | Strike | Rivets hit harder and burn | Damage, Duration | – |
| **Spread Shot** | Strike | Fire 3 rivets in a spread | Projectiles, Range | – |
| **Rapid Rivets** | Strike | Faster fire rate | Speed | – |
| **Big Shrapnel** | Heavy Strike | Overcharged Shot bursts into more shrapnel | Damage, Projectiles, Range | – |
| **Magnet Shot** | Heavy Strike | Overcharged Shot pulls enemies together | Range, Effect | – |
| **Sticky Charge** | Heavy Strike | The shot sticks to an enemy, then explodes | Damage, Duration | – |
| **Rocket Fuel** | Dash | Rocket Boots go farther; the mine is bigger | Damage, Range | – |
| **Mine Layer** | Dash | Rocket Boots drop 3 mines | Projectiles | – |
| **Jet Trail** | Dash | Rocket Boots leave a fire trail | Damage, Duration | – |
| **Mech Upgrade** | Ultimate | Mech Suit lasts longer with a bigger shield | Damage, Heal, Duration | – |
| **Rocket Volley** | Ultimate | The mech fires more rockets | Projectiles, Damage | – |
| **Self-Destruct** | Ultimate | The mech explodes when it ends | Damage, Range | – |
| **Flame Turret** | Wild | Turrets shoot short flames | Damage, Range | **Inferno Tower** → + Jet Trail card |
| **Shield Drone** | Wild | A drone blocks a projectile every few seconds | Effect, Speed | **Aegis Swarm** → + Better Builder card |
| **Rocket Pod** | Wild | Shoulder rockets fire every 6 s | Damage, Projectiles, Speed | **Missile Swarm** → + Rocket Volley card |

- **Skill tree** – themes (mix freely; card-part tag in each column header): **Turret** (builds) · **Gadget** (mines & drones) · **Gunner** (rivet gun)

| Tier | Turret · `Wild` | Gadget · `Dash` | Gunner · `Strike` |
|---|---|---|---|
| 1 · Weapon | **Tracer Rounds** (Lv3): rivets mark enemies; turrets focus marked ones | **Rivet Mines** (Lv3): rivets that miss become tiny mines | **Burst Fire** (Lv3): the rivet gun fires 3-round bursts |
| 2 · Condition | **Defense Grid** (Lv3): near a turret, take 10% less damage | **Afterburner** (Lv3): after dashing, +30% attack speed for 2 s | **Hot Barrel** (Lv3): after 3 s of shooting, +20% damage until you stop |
| 3 · New ability | **Tesla Coil** (Lv3): Builder sometimes makes a Tesla Coil that zaps chains | **Drone Buddy** (Lv3): a small drone shoots with you | **Ammo Belt** (Lv3): every 50th shot is a big explosive round |
| 4 · Heavy Strike & Dash | **Deploy!** (Lv3): Rocket Boots place a turret instead of a mine | **Cluster Mine** (Lv3): the Rocket Boots mine splits into 3 | **Rail Shot** (Lv3): Overcharged Shot pierces every enemy in a line |
| 5 · Ultimate | **Turret Mode** (Lv2): when Mech Suit ends, it stays as a giant turret for 10 s | **Drone Carrier** (Lv2): Mech Suit launches drones | **Minigun Mech** (Lv2): Mech Suit arms become miniguns |
| **6 · Capstone** | **Fortress**: +2 max turrets and turrets never expire | **Swarm Protocol**: every 15 s, release 6 mini-drones that fly into enemies and explode | **Gatling Mode**: hold attack for 2 s to spin up: +100% attack speed while you keep holding |

---

## 7. Rewards & Meta Progression

### Power budget: 30% meta / 70% in-run

A run should be won by the **choices made inside the run**. Permanent progression helps, but it must not carry the player.

| Source | Type | Share of player power at the end of a run |
|---|---|---|
| Specialist skill tree, Run Build perk, accessories | **Meta** (permanent, outside the run) | **about 30%** |
| The Ability List (class ability cards, evolutions, relics, stat cards) | **In-run** (resets every run) | **about 70%** |

The class base stats, starting weapon, Heavy Strike, and Ultimate are the starting point and are not counted. Cards, skills, or accessories that boost the Heavy Strike or Ultimate count normally.

Draft split inside the 30% meta: **skill tree ~22%**, **accessories + Run Build perk ~8%**.

**How it is measured**
- Reference point: the end of wave 12 in a normal winning run (about level 35)
- Power score: `power = √(DPS × effective HP)`, where effective HP includes max HP, armor, and healing
- The balance simulator builds the same character 3 ways: **base only**, **meta only** (no in-run gains), and **full**
- `metaShare = log(metaOnly ÷ base) ÷ log(full ÷ base)` (log, because bonuses multiply)
- Target: **metaShare between 25% and 35%** for every class and Run Build

**What this means for the numbers**
- Specialist levels give only Skill Points, so the skill tree carries most of the meta power and its numbers are tuned to stay near 22%.
- Skill tree skills change **how the kit works** but keep their numbers modest. The big power spikes come from in-run abilities and evolutions.
- Accessories are part of the meta 30%, so strong ones (Glass Heart, Echo Bell) must keep real trade-offs.
- Early in a run the meta share is higher, because at level 1 everything is meta. This is expected: meta helps players get through the first waves, then the run takes over. Rough targets: wave 3 ~50%, wave 6 ~40%, wave 12 ~30%.
- A new player with no meta progress can still win the first map with good play. A fully upgraded player still needs good level-up choices to win the harder maps.

### After every run (win or lose)

```
gold          = (10 × wavesCleared + 50 × bossesKilled + (win ? 150 : 0)) × mapRewardMultiplier
specialistExp = 20 × wavesCleared + 80 × bossesKilled + (win ? 200 : 0)
```

- Specialist EXP goes to **the class that was played**
- Each class has its own **Specialist Level** (cap 15). Each level gives **1 Skill Point** for that class's skill tree (see 6.0)

### Shop (meta, outside the run)

| Category | Effect |
|---|---|
| Costumes | Cosmetic only |
| Pets | Cosmetic only, follows the player (separate from the Bounty Hunter's falcon) |
| **Accessories** | **Gear – gives stats and special effects that change the build** |

### Accessories (gear that changes your build)

**Rules**
- **Slots:** 1 slot at start. 2nd slot costs 1,000 gold. 3rd slot unlocks after the first win on a ★★★★ map.
- Equip on the Class Select screen. Cannot change during a run.
- Most accessories have an **upside and a trade-off**, so they push you toward a build instead of being pure power.
- Upgrade with gold, **Lv1 → Lv3**. The upside grows, the trade-off stays the same.
- Upgrade cost: Lv2 = 50% of price, Lv3 = 100% of price.
- Cannot equip 2 of the same accessory.
- Draft prices: Common 300, Rare 800, Epic 2,000 gold.

**Accessory list (draft)**

| Accessory | Rarity | Upside (Lv1 → Lv3) | Trade-off | Good with |
|---|---|---|---|---|
| Iron Gauntlet | Common | +8 → 16% melee damage | −10% ranged damage | Melee |
| Hawk Eye Ring | Common | +8 → 16% ranged damage | −10% melee damage | Ranged |
| Sage Circlet | Common | +8 → 16% magic damage | −8% max HP | Magic |
| Titan Belt | Common | +12 → 24% max HP | −5% move speed | Oathknight, Vampire |
| Wind Boots | Common | +6 → 12% move speed | −8% max HP | Pirate, Jester |
| Clover Charm | Common | +5 → 10% Luck | −5% damage | Jester, Bounty Hunter |
| Collector's Monocle | Common | Pickup radius +30 → 60% | −3% move speed | Everyone |
| Ember Ring | Rare | Attacks have 10 → 20% chance to burn | −5% attack speed | Alchemist, Jester |
| Frost Band | Rare | Hits slow enemies 10 → 20% for 1 s | −5% damage | Tinkerer, Bounty Hunter |
| Fang Pendant | Rare | +2 → 4% lifesteal | −8% max HP | Vampire, Pirate |
| Feather Anklet | Rare | +1 dash charge, +3 → 9% move speed | Dash cooldown +20% | Pirate, Outsider |
| Hourglass | Rare | +1 reroll per wave (Lv3: +2) | −10% XP gain | Jester, card builds |
| Beast Whistle | Rare | Pets and summons +15 → 30% damage | Your own attacks −10% damage | Bounty Hunter, Necromancer |
| Berserker Mask | Rare | +2 → 3% damage per 10% missing HP | Heal pickups don't work | Vampire, Oathknight |
| Scholar's Tome | Rare | +10 → 20% XP gain, +3 → 8% Ultimate charge rate | −5% damage | Outsider, card builds |
| Glass Heart | Epic | +15 → 25% damage | −25% max HP | Skilled players |
| Gambler's Charm | Epic | +10 → 20% Luck | Level-ups show only 2 cards | Jester |
| Storm Prism | Epic | +1 chain / bounce / pierce (Lv3: +2) | −15% projectile speed | Tinkerer, Bounty Hunter |
| Echo Bell | Epic | Every 10th → 7th attack repeats | −5% attack speed | Fast attackers |
| Balance Stone | Epic | +3 → 6% damage, max HP, move speed, and attack speed | Stat cards never appear | All-round builds |
| **Shard of the Crown** | Unique | Pick 1 card part at run start: its cards appear 2× as often and start at Lv2 | None | Everyone (reward for first final-boss win, not sold) |

Costumes and accessories are drawn as **separate sprite layers** over the player, so any combination works.

### Class unlocks

| Class | How to unlock |
|---|---|
| **Traveler** (starter) | Unlocked at start |
| Oathknight, Bounty Hunter, Vampire | Beat Boss 1 with the Traveler → pick 1 free. The other 2 cost 500 gold each |
| Alchemist, Necromancer | 800 gold each |
| Pirate | Reach wave 9 with any class, or 1,500 gold |
| Jester | Win a run with any class, or 1,500 gold |
| Tinkerer | Win a run on Clockwork Bazaar, or 2,000 gold |
| Cleric | Win a run on Bloodmoon Village, or 2,000 gold |
| Outsider | Reach wave 6 on The Void Rift, or 3,000 gold |

Every class has a milestone **or** a gold option, so players never get stuck.

> **Phase 1 (current prototype):** Traveler, Oathknight, Bounty Hunter and Cleric are open from the start. Vampire unlocks
> by beating Boss 1 as the Traveler; Necromancer by beating Boss 2 with any class. Gold options come in phase 2
> (see `docs/roadmap.md`).

---

## 8. UI & Screens

Wireframes for these screens are in the team proposal deck (slides 4, 6, 11, 13). They show layout only, not the final look.

**General rules**
- Keep the middle of the screen clear during a run; the HUD lives in the corners
- Pixel font for headings and numbers, a clean font for body text
- Colors carry meaning, always with a label too: **gold** = rewards and highlights, **teal** = player UI and selected items, **ember red** = HP, danger and bosses
- Card rarity is shown by border color: **Common** grey, **Rare** teal, **Epic** purple
- Everything works with mouse, keyboard and gamepad

### Class & Run Build select (before a run)

| # | Element | Notes |
|---|---|---|
| 1 | Class grid | 11 portraits; locked classes are dashed and show how to unlock (e.g. "Win on Bloodmoon Village or 2,000 gold") |
| 2 | Selected class | Name and role (e.g. Vampire · Melee · Sustain) |
| 3 | Base stats | Bars for HP, speed, damage, attack speed, range |
| 4 | Run Build tabs | 1–4 builds; shows favored card parts and perk; locked builds are dashed |
| 5 | Accessory slots | 1–3 slots for gear |
| 6 | Choose map | Goes to map select |

### In-run HUD

| # | Position | Element | Notes |
|---|---|---|---|
| 1 | Top left | Portrait + Ultimate ring | The ring fills with Ultimate charge and glows at 100% |
| 2 | Top left | HP bar, XP bar, level | |
| 3 | Top center | Wave and timer ("Wave 4 / 12 · 0:42") | The boss HP bar appears here only on boss waves |
| 4 | Center | Arena | Player, enemies, XP gems, damage numbers; keep clear |
| 5 | Bottom left | Card slots (5–6) + relic slots (4) | Each card shows its level; the 6th slot is locked until Boss 2 |
| 6 | Bottom center | Ability bar | LMB Strike 1 · RMB Heavy Strike with cooldown · Space dash with charges · Q Ultimate % |
| 7 | Bottom right | Class resource | e.g. Faith (Cleric), Rift Energy (Outsider) |
| – | Top right | Pause button | |

### Level-up card pick

| # | Element | Notes |
|---|---|---|
| 1 | Title | "LEVEL UP! · Lv 12"; the game pauses |
| 2 | Rarity | Card border color: Common, Rare, Epic |
| 3 | Part tag | Strike, Heavy Strike, Dash, Ultimate, Passive or Wild |
| 4 | Level and upgrade | "NEW", or "Lv 2 → 3" plus the upgrade it gives (e.g. "+20% damage") |
| 5 | Slot counter | "Cards 4/5"; when full, only upgrades are offered |
| 6 | Reroll | Limited rerolls per run |

### Skill tree (between runs)

| # | Element | Notes |
|---|---|---|
| 1 | Run Build tabs + Skill Points | Each build saves its own skill picks |
| 2 | Theme columns | Each column shows its card-part tag (e.g. Night · Dash) |
| 3 | Tiers 1–6 | Pick 1 of 3 per tier; picked = teal fill, available = dashed teal, locked = dashed grey |
| 4 | Capstone (tier 6) | Locked until tiers 1–5 have a pick |
| 5 | Skill detail | Name, tag, level, description, and "+15% per matching card" |
| 6 | Preview + level up | Short preview animation, and a "Level up · 1 SP" button |

### Other screens still to wireframe

Main menu, map select, pause menu, result screen (gold and EXP earned), shop, Ability Codex, settings.

---

## 9. Art Style – Dusk Fantasy, 64×64 Chibi Pixel Art

### Style direction

Reference feel: cozy tavern pixel art (chibi heroes, thick outlines, warm lamp light), pushed **darker**.

| Keep from the reference | Make darker |
|---|---|
| Chibi proportions: big head (about 40% of body height), small body | Muted, less saturated colors |
| Expressive faces with clear eyes | **Cool, deep shadows** (blue/purple), warm highlights |
| Thick dark outline (`#0f0b12`) | Darker backgrounds and maps; light comes from torches, lamps, and magic |
| 3–4 tone shading on every material | **Glows only for fire, magic, and eyes** (fel green, void purple, holy gold, blood red, teal) |
| Readable silhouettes and props | A little grime and wear: rust, torn cloaks, old wood |

Rules:
- Light comes from the **top-left**; every shape gets 4 tones: highlight, base, shade, deep shade
- Bright, saturated pixels are saved for **things that matter**: glowing eyes, magic, fire, pickups, and danger
- Characters must still read clearly on dark maps: use a lighter highlight on the head and shoulders, and a soft ground shadow
- Not grim: no gore, faces stay friendly, and the heroes look like heroes

### Sprite sizes

| Thing | Canvas size | Notes |
|---|---|---|
| Player (all 11 classes) | **64×64** | Chibi body about 46 px tall (head about 18 px); the extra space is for weapon swings, hats, and accessories |
| Small enemies (slime, bat, imp) | 32×32 | |
| Normal enemies (goblin, skeleton, cultist, orc) | 64×64 | |
| Elites | 96×96 | Redrawn bigger, not scaled up |
| Bosses | 128×128 – 192×192 | |
| Pets (Kestrel the falcon, cosmetic pets) | 32×32 | |
| Projectiles | 8×8 – 16×16 | |
| Pickups (XP gems, coins, heal orbs) | 16×16 | |
| Floor tiles | 32×32 | |
| Card, skill, and accessory icons | 32×32 | Shown at ×2 in menus |

**Pixel rule:** every sprite uses the same pixel size. Never scale a sprite by a non-integer amount, and never mix higher-resolution art with the pixel art.

### Screen and scaling

- Internal resolution: **960×540**
- Scale by whole numbers with nearest-neighbor: ×2 = 1080p, ×4 = 4K. Letterbox the leftover space.
- Optional "Fill screen" setting for non-integer scaling (pixels become slightly uneven)
- Phaser config: `pixelArt: true`, `roundPixels: true`
- The camera follows the player. The arena is larger than the screen (e.g. 2400×1600).

### Palette and readability

- One custom **Dusk palette**: about 19 color ramps of 4 tones each (skin, pale skin, steel, black cloth, red, blue, slate, purple, green, leather, gold, ginger, blonde, bone, white cloth, wood, rust, orange) plus a few **glow colors** (fel, void, holy, blood, teal, ember). Ramps are in `assets/palette`.
- Shadows lean cool (blue/purple), highlights lean warm
- Dark 1 px outline (`#0f0b12`) on characters, enemies, and pickups
- Enemy projectiles are always warm colors (red/orange). Player projectiles use the class color. The player can always tell what is dangerous.
- Bosses and elites get a glow or outline color that normal enemies never use

### Animations

Top-down view with **3/4 front-facing chibi sprites**, turned slightly to the right. Left is the right sprite flipped horizontally, so only one direction is drawn.

| Animation | Frames |
|---|---|
| Idle | 4 |
| Run | 6 |
| Attack | 4–6 (each melee combo hit has its own frames) |
| Dash | 3 |
| Heavy Strike | 5 |
| Ultimate | 8 (plus effect sprites) |
| Hit | 2 |
| Death | 6 |

About 38–43 frames per class. Rough total for the game: 11 classes (~450 frames) + 8 enemies (~110) + elites + 4 bosses (~160) + pets, projectiles, pickups, icons → **800+ frames**. Plan the art time early.

### Costume and accessory layers

- All 11 classes share the **same base body**: same frame counts and same timing
- Each frame stores **anchor points** (head, back, hand) in JSON
- Hats and visible accessories are single 32×32 sprites placed at the anchor point, so **one sprite works for every class and every frame**
- Start costumes as **palette swaps** (recolor shader). Full redrawn outfits per class are expensive, so add them later.

### Juice

White hit flash (1 frame), small screen shake, pixel-font damage numbers, small particle bursts, short freeze frame on boss hits.

### Where the art comes from

| Option | Pros | Cons |
|---|---|---|
| Draw it yourself in Aseprite (or free LibreSprite) | Full control, consistent style | Slow, needs practice |
| Buy 64×64 packs on itch.io | Fast | Mixing packs breaks the style; check the license for commercial use |
| Hire a pixel artist | Best quality | Cost |
| AI pixel art tools + manual cleanup | Fast drafts | Must clean up and recolor to the palette; check the license |

### Claude in the art pipeline

- **Placeholder sprites:** Claude generates 64×64 colored silhouettes with code, with the right sizes, frame counts, and anchors, so the game is playable before the real art exists
- **Aseprite export script (Lua):** exports sprite sheets + JSON (frames, tags, anchors) in one step
- **Palette check script:** fails the build if any sprite uses a color outside the palette, or has a non-standard size
- **Atlas packing** and the Phaser loader code
- **Art briefs:** a spec per sprite (size, frames, colors, reference) for you or an artist

---

## 10. Tech Stack

| Part | Choice |
|---|---|
| Engine | Phaser + TypeScript + Vite |
| Desktop | Tauri (small app, needs Rust toolchain to build) or Electron (pure Node, bigger, easier for Steam) |
| Data validation | Zod |
| Save | `SaveService` interface: localStorage / IndexedDB on web, file on desktop |
| Unit tests | Vitest |
| E2E tests | Playwright |
| RNG | Seeded RNG (for replays and debugging) |
| Art | Aseprite (or LibreSprite) for 64×64 pixel art, texture atlas packer |

### Project structure

```
src/
  data/        classes.ts skillTrees/ maps.ts waves.ts bosses.ts enemies.ts cards.ts accessories.ts cosmetics.ts
  schemas/     zod schemas for every data file
  scenes/      Boot, Menu, ClassSelect, MapSelect, Game, LevelUp, Result, Shop, ClassUpgrade
  systems/     input, movement, dash, stats (combat stats + formulas), combat, projectile, wave, spawn, xp, cards, rewards, rng
  platform/    save.web.ts  save.desktop.ts
assets/
  source/      .aseprite files
  sprites/     exported sheets + JSON (frames, tags, anchors)
  palette/     the 32-color palette (.gpl / .png)
tools/art/     Aseprite export script, palette + size check
src-tauri/     desktop shell
tools/sim/     headless balance simulator
tests/
  unit/        Vitest
  e2e/         Playwright
```

### Example data types

```ts
type AttackType = 'melee' | 'ranged' | 'magic';

type CardPart = 'passive' | 'strike' | 'heavyStrike' | 'dash' | 'ultimate' | 'wild';

interface Stats {
  maxHp: number; armor: number; hpRegen: number; damage: number; attackSpeed: number;
  critChance: number; critDamage: number; moveSpeed: number; luck: number; /* … */
}

interface ClassDef {
  id: ClassId;
  name: string;
  attackType: AttackType;
  isStarter?: boolean;                     // true only for Traveler
  baseStats: Stats;
  builds: RunBuild[];                      // 1–3 Run Builds (a 4th is allowed)
  weapon: WeaponDef;
  dash: DashDef;            // charges, cooldown, effect id
  heavyStrike: HeavyStrikeDef; // cooldown, damage %, effect id
  ultimate: UltimateDef;    // effect id, duration
  passive: PassiveDef;
  cards: string[];          // the class's 16 in-run card ids
  skillTree: SkillTree;
}

interface RunBuild {
  id: string;
  name: string;
  favored: [CardPart, CardPart] | 'player-choice'; // Traveler picks at run start
  perk: Effect[];
  bestTheme?: string;                      // hint only
  unlockAtSpecialistLevel: 1 | 3 | 6 | 9;
}

interface SkillNode {
  id: string;
  name: string;
  tier: 1 | 2 | 3 | 4 | 5 | 6;
  theme: string;                // label only, e.g. 'blood' | 'night' | 'swarm'
  partTags: CardPart[];         // +15% effect per held card of these parts
  maxLevel: number;             // 3 for tiers 1-4, 2 for tier 5, 1 for tier 6
  effectsPerLevel: Effect[][];
}

interface SkillTree {
  themes: { name: string; partTags: CardPart[] }[];  // 3 themes (Traveler: 2)
  nodes: SkillNode[];           // 3 per tier × 6 tiers = 18 (Traveler: 2 × 3 = 6)
}

interface AccessoryDef {
  id: string;
  name: string;
  rarity: 'common' | 'rare' | 'epic' | 'unique';
  price: number;
  maxLevel: 3;
  effectsPerLevel: Effect[][];  // e.g. [{ stat: 'maxHp', addPercent: 12 }]
  drawbacks: Effect[];
}

type CardType = CardPart | 'evolution' | 'relic' | 'stat';

interface PowerCard {
  id: string;
  name: string;
  type: CardType;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  classId?: ClassId;        // set for class cards and evolutions; empty for relics and stat cards
  maxLevel: number;         // 5 for class cards and relics (+5 after evolving), Infinity for stat cards
  upgradeTypes?: ('damage' | 'projectiles' | 'heal' | 'range' | 'speed' | 'duration' | 'effect')[]; // what a repeat card can roll
  weight: number;
  effectsPerLevel: Effect[][];
  evolution?: {             // Wild cards only
    into: string;           // evolved ability id
    needs: { relic?: string; card?: string; anyCardOfPart?: CardPart };
  };
  codexHint: string;        // shown as "???" hint before discovery
}

interface SaveData {
  version: number;
  gold: number;
  owned: {
    costumes: string[];
    pets: string[];
    accessories: Record<string, number>;   // accessory id → level
  };
  equipped: { costume?: string; pet?: string; accessories: string[] };
  accessorySlots: number;
  classes: Record<ClassId, {
    exp: number;
    level: number;                                             // Specialist Level
    setups: Record<string, {                                   // Run Build id → setup
      skills: Record<number, { nodeId: string; level: number }>; // tier → pick
    }>;
    lastBuild?: string;                                        // last Run Build used
  }>;
  codex: string[];                          // discovered abilities, relics, evolutions
  unlockedMaps: MapId[];
  unlockedClasses: ClassId[];
}
```

---

## 11. Using Claude to Build It

1. **Claude Code in the repo** as the main builder. Add a `CLAUDE.md`:
   ```
   - All content lives in src/data and must pass `npm run validate`
   - Game logic never reads storage directly; use SaveService
   - Use systems/rng.ts, never Math.random
   - Art is 64×64 pixel art (player and normal enemies); sprites must use assets/palette and pass `npm run check-art`
   - Every class must define base stats, 1–3 Run Builds (max 4), attack, dash, passive, 16 in-run cards (1 passive, 3 strike, 3 heavy strike, 3 dash, 3 ultimate, 3 wild with evolutions), and a skill tree (3 themes × 6 tiers, every theme has 1–2 card-part tags; the starter Traveler has 2 themes × 3 tiers)
   - All damage and stats go through systems/stats.ts (damage formula, hard caps)
   - Power budget: meta must stay 25–35% of player power at wave 12; run `npm run balance` after changing skills, accessories, or Specialist rewards
   - After changes, run `npm test` and `npm run validate`
   ```
2. **Custom commands / skills:** `/new-ability`, `/new-relic`, `/new-card`, `/new-enemy`, `/new-boss`, `/new-map`, `/new-class`, `/balance-report`
3. **Balance simulator** (`tools/sim`): checks the **30% meta / 70% in-run power budget** for every class and Run Build (CI fails outside 25–35%), and runs many fake runs and reports average level, waves reached, gold per run, and runs needed to buy shop items. It also compares Run Builds, card combinations, skill tree routes, and accessories to find options that are too strong or too weak
4. **Playwright smoke tests:** start game → pick class and map → reach wave 2 → attack, heavy strike, dash, and ultimate work → open shop → reload → save is still there
5. **claude.ai chat** for design: boss patterns, card ideas, map themes, quick prototypes of one mechanic

---

## 12. Roadmap

> The detailed, up-to-date roadmap (with what is done) lives in **`docs/roadmap.md`**. The table below is the
> original high-level plan.

| Phase | Goal |
|---|---|
| 0. Setup | Vite + TS + Phaser, Tauri shell, Zod, Vitest, Playwright, CLAUDE.md |
| 1. Core loop | Placeholder 64×64 sprites, the starter class Traveler, 1 map: move, dash, attack, heavy strike, ultimate + charge meter, combat stats + damage formula, level-up screen (pick 1 of 3 cards), 1 Run Build, enemies, XP, 3-card level-up, 12 waves with placeholder bosses, win/lose |
| 2. Content | 10 classes, 10 maps, 4 real bosses, 16 in-run cards per class (176 total) + 33 Wild evolutions, 8 shared relics, skill trees |
| 3. Meta | Rewards, save, Specialist Levels, skill trees, accessories, shop, cosmetics, unlocks |
| 4. Balance & polish | Simulator tuning, sound, juice, menus, gamepad |
| 5. Ship | Web build (itch.io / own site) + desktop builds (Windows, macOS, Linux) |

Make Phase 1 fun first. If moving, dashing, and leveling up feel good with one class, the other classes are mostly data.

---

## 13. Open Decisions

- [ ] Final game name
- [x] Art style: 64×64 pixel art
- [ ] Art source: draw yourself, asset packs, pixel artist, or AI drafts + cleanup?
- [x] Art style: Dusk Fantasy chibi pixel art, custom Dusk palette (draft ramps in the sprite pack)
- [ ] Internal resolution 960×540, or 1280×720 if big enemy crowds feel too packed
- [x] Start with only the starter class (Traveler)
- [x] Starter class: Traveler
- [ ] Add 1 more melee and 1 more magic class, or keep 10 classes? (ideas: Berserker, Dragon Knight, Ronin / Druid, Chronomancer, Witch)
- [ ] Are bosses the same on every map, or does each map change them?
- [ ] Tauri or Electron for desktop?
- [ ] Do cosmetic pets ever give a small bonus, or stay 100% cosmetic?
- [ ] Split inside the 30% meta budget (skill tree 22% / accessories + perk 8% is a draft)
- [ ] Number of accessory slots (2 or 3) and their unlock cost
- [x] No respec cost: skill setups are free to change outside a run
- [x] No attributes: combat stats only
- [ ] Skill card-part bonus (+15% per matching card, max +45%, is a draft)
- [ ] Mobile / touch controls later?
- [ ] Wireframe the remaining screens (main menu, map select, pause, results, shop, Codex, settings)
- [ ] Card slots: 5 at start + 6th after Boss 2 (draft), or a flat 5 or 6?
- [ ] Relics: keep shared by all classes, or make them class-unique too?
- [ ] Ultimate charge rate (target: about 1 Ultimate every 60 s)
- [ ] Heavy Strike cooldown (0.5–3 s) and damage per class (draft table in section 3)
