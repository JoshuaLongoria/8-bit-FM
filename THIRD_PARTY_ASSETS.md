# Third-Party Assets

This project imports a small number of graphics from the **pokeemerald** disassembly
project for prototype purposes. This file records exactly what was taken, from where,
and under what understanding.

## Source

| | |
| --- | --- |
| Repository | <https://github.com/pret/pokeemerald> |
| Pinned commit | `5eff78649e7170a877b961ef0b3da13b81a16038` |
| Retrieved via | `raw.githubusercontent.com` at the pinned commit |

The full repository has **not** been cloned, vendored, or copied into this project, and
none of its C source files have been added. Only the three image files listed below were
downloaded.

## Imported files

| Source path in pokeemerald | Stored here as | SHA-256 |
| --- | --- | --- |
| `data/tilesets/primary/general/tiles.png` | `public/assets/pokemon/general-tiles.png` | `365ba5482e7564763e614a0009900d1c317790dcd9f7a06c4ab74c363a3ba2f5` |
| `data/tilesets/secondary/petalburg/tiles.png` | `public/assets/pokemon/petalburg-tiles.png` | `5f7427dfdd227f6f048b5ee9aa167144672a228dbc5bd25a84a6e348d62429d9` |
| `graphics/object_events/pics/people/brendan/walking.png` | `public/assets/pokemon/brendan-walking.png` | `f33ec07a5fd17f4422455f8bc55cd3d3522fa65c3bf740ecbdc00da705eaa0d1` |

No other assets were imported, and no assets were substituted for these.

### A note on colour

The two tileset files are 4-bit indexed images stored with a **greyscale placeholder
palette**. In pokeemerald the real colours come from separate `.pal` palette files that
are applied at build time. Those palette files were **not** imported, so this project
applies its own colour ramps at load time in `src/world/tileCatalog.ts`. The colours you
see in the running app are therefore ours; only the tile *shapes* come from the source
material. The Brendan sprite sheet does carry its original palette and is used as-is,
apart from making its backdrop colour transparent.

## Architectural references only

The following pokeemerald C source files were consulted as **design references** for how
a tile-based map engine is structured. No code from them was copied, translated, or
included in this project:

- `src/tilesets.c` — pairing tile data with a palette
- `src/fieldmap.c` — separating the map grid from the objects placed on it
- `src/sprite.c` — treating a sprite as a rectangle cut from a sheet
- `src/field_player_avatar.c` — the player as a state machine selecting a frame
- `src/graphics.c` — a single central registry naming every graphic
- `src/trainer_pokemon_sprites.c` — sprite sheet loading patterns

## Copyright and usage

Pokémon and all related characters, artwork, sprites, tilesets, names, and trademarks are
the property of **Nintendo, Creatures Inc., Game Freak, and The Pokémon Company**. This
project is not affiliated with, endorsed by, or sponsored by any of them.

These assets are used here **only** as temporary placeholder graphics in a
non-commercial hackathon prototype, to establish visual proportions and art direction
while the project's own artwork is produced. They are **not licensed for redistribution**
and must be removed and replaced with original or properly licensed artwork before this
project is published, distributed, or used for any commercial purpose.

The pokeemerald project itself is a disassembly whose repository licence covers its own
source code; it does not grant rights to Nintendo's copyrighted artwork.

## Action required before release

- [ ] Replace all three imported files with original or properly licensed artwork.
- [ ] Delete `public/assets/pokemon/`.
- [ ] Confirm no Pokémon-derived graphics remain in the built output.
