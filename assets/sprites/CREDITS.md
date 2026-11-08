# Sprite credits

## heroes.png (player classes, placeholder art)

- **Source:** "32x32 RPG character sprites" on OpenGameArt: https://opengameart.org/content/32x32-rpg-character-sprites
- **License:** CC0 (public domain). Free for any use, including commercial; no credit required.
- **What we changed:** kept 6 of the 20 characters (one per class), made the magenta background transparent.
  Original sheet rows used: Traveler 2, Oathknight 4, Bounty Hunter 9, Cleric 6, Vampire 19, Necromancer 5.

| Row in heroes.png | Class |
|---|---|
| 0 | Traveler |
| 1 | Oathknight |
| 2 | Bounty Hunter |
| 3 | Cleric |
| 4 | Vampire |
| 5 | Necromancer |

Columns in each row: 0-3 facing down (walk, stand, walk, charge), 4-7 facing up (same), 8-10 facing right
(walk, stand, walk). The Vampire has no column 8.

## Removing these sprites

- Switch off: set `SPRITES_ENABLED = false` in `src/render/sprites.ts`. Heroes go back to coloured circles.
- Remove completely: delete `src/render/sprites.ts` and this folder (`assets/sprites/`), then remove the
  `drawHeroSprite` import and the one `if (drawHeroSprite(...))` block in `src/render/world.ts`.
