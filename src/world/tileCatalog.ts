/**
 * The catalogue: which rectangle of which downloaded image is which thing, and
 * what colour ramp to paint it with.
 *
 * Architectural reference (concepts only, no code copied): pokeemerald's
 * `src/graphics.c` is one central registry naming every graphic, and
 * `src/tilesets.c` pairs tile data with a palette. This file plays both roles.
 *
 * WHY THE RECTANGLES ARE HERE AND NOWHERE ELSE
 * Every source rectangle below was chosen by inspecting the downloaded sheets, not
 * guessed. They live in this one table so a wrong pick is a one-line fix that
 * changes nothing else — no drawing code contains a magic number.
 *
 * Sheet grids (each source tile is 8x8 pixels):
 *   general-tiles.png    128x256  ->  16 x 32 tiles
 *   petalburg-tiles.png  128x80   ->  16 x 10 tiles
 *   brendan-walking.png  144x32   ->   9 frames of 16x32
 */
import type { PaletteId, TileSprite } from './worldTypes'

/** Source tile size in the pokeemerald sheets. */
export const SOURCE_TILE = 8

/** One grid cell is a 16x16 "metatile", matching Emerald's block size. */
export const SOURCE_CELL = 16

/**
 * The 16 grey levels the pokeemerald tilesets are stored with, lightest first.
 *
 * These sheets are 4-bit indexed images whose stored palette is a plain greyscale
 * ramp — the real colours live in `.pal` files we have deliberately not imported.
 * Matching a pixel's grey back to its index lets us repaint it with a real colour.
 */
export const GREY_LEVELS: readonly number[] = [
  255, 238, 222, 205, 189, 172, 156, 139, 115, 98, 82, 65, 49, 32, 16, 0,
]

/** RGB triple, 0-255. */
export type Rgb = readonly [number, number, number]

/**
 * Build a 16-entry colour ramp by interpolating between a few anchor colours.
 *
 * Writing 16 colours by hand for every palette would be tedious and hard to tweak;
 * two or three anchors describe a believable ramp and are easy to adjust by eye.
 */
function ramp(...anchors: readonly Rgb[]): readonly Rgb[] {
  const first = anchors[0]
  const last = anchors[anchors.length - 1]
  if (first === undefined || last === undefined) {
    throw new Error('ramp() needs at least one anchor colour')
  }
  const out: Rgb[] = []
  for (let i = 0; i < GREY_LEVELS.length; i++) {
    // Position along the ramp, 0 at the lightest grey and 1 at the darkest.
    const t = i / (GREY_LEVELS.length - 1)
    const span = (anchors.length - 1) * t
    const lowIndex = Math.min(Math.floor(span), anchors.length - 2)
    const from = anchors[lowIndex] ?? first
    const to = anchors[lowIndex + 1] ?? last
    const localT = span - lowIndex
    out.push([
      Math.round(from[0] + (to[0] - from[0]) * localT),
      Math.round(from[1] + (to[1] - from[1]) * localT),
      Math.round(from[2] + (to[2] - from[2]) * localT),
    ])
  }
  return out
}

/**
 * Colour ramps, keyed by palette name. Index 0 of every tileset ramp is the
 * transparency key and is never painted, so its value here is irrelevant.
 *
 * 'none' is a marker handled separately by the loader: the Brendan sheet already
 * carries real colours and must not be repainted.
 */
export const PALETTES: Readonly<Record<Exclude<PaletteId, 'none'>, readonly Rgb[]>> = {
  grass: ramp([168, 216, 128], [104, 184, 96], [56, 128, 72]),
  path: ramp([248, 232, 184], [224, 200, 144], [176, 152, 104]),
  tree: ramp([128, 200, 112], [56, 144, 80], [24, 72, 48]),
  roofRed: ramp([248, 200, 168], [208, 96, 80], [112, 40, 48]),
  roofBlue: ramp([200, 224, 248], [88, 136, 208], [40, 56, 112]),
  roofOrange: ramp([248, 224, 168], [232, 160, 72], [136, 80, 40]),
  pokeCenter: ramp([255, 255, 255], [232, 96, 88], [120, 40, 48]),
  sign: ramp([255, 255, 255], [216, 216, 224], [64, 64, 80]),
}

/** Relative paths to the imported sheets, served from `public/`. */
export const SHEET_URLS: Readonly<Record<'general' | 'petalburg' | 'brendan', string>> = {
  general: 'assets/pokemon/general-tiles.png',
  petalburg: 'assets/pokemon/petalburg-tiles.png',
  brendan: 'assets/pokemon/brendan-walking.png',
}

/**
 * The colour that means "transparent" in the Brendan sheet. It is palette index 0
 * of that image — a green screen the GBA never draws.
 */
export const BRENDAN_TRANSPARENT: Rgb = [115, 197, 164]

/** Helper so each entry below reads as a grid position rather than raw pixels. */
function cells(col: number, row: number, wCols: number, hRows: number) {
  return {
    sx: col * SOURCE_TILE,
    sy: row * SOURCE_TILE,
    sw: wCols * SOURCE_TILE,
    sh: hRows * SOURCE_TILE,
  }
}

/** Flat two-tone ground tile, general sheet col 6 row 27. Tiled to cover the map. */
export const GRASS_TILE: TileSprite = {
  sheet: 'general',
  palette: 'grass',
  rect: cells(6, 27, 1, 1),
}

/** Flat light tile, general sheet col 6 row 16. Tiled to draw walking paths. */
export const PATH_TILE: TileSprite = {
  sheet: 'general',
  palette: 'path',
  rect: cells(6, 16, 1, 1),
}

/**
 * The full tree canopy at general sheet cols 0-4, rows 4-9 (40x48 pixels).
 *
 * The whole blob is taken rather than a chunk of its middle: the outer ring is
 * what carries the rounded silhouette and the lit edge, and the corners are
 * transparent, so trees placed side by side still read as separate trees.
 */
export const TREE_SPRITE: TileSprite = {
  sheet: 'general',
  palette: 'tree',
  rect: cells(0, 4, 5, 6),
}

/** The "P.C" signboard, general sheet cols 6-8 rows 19-20. */
export const POKE_CENTER_SIGN: TileSprite = {
  sheet: 'general',
  palette: 'sign',
  rect: cells(6, 19, 3, 2),
}

/**
 * Three visually distinct house fronts from the Petalburg sheet, each three tiles
 * wide and six tall. One per folder, so the three biggest folders are told apart
 * by shape as well as by label.
 */
export const HOUSE_SPRITES: readonly TileSprite[] = [
  { sheet: 'petalburg', palette: 'roofRed', rect: cells(2, 0, 3, 6) },
  { sheet: 'petalburg', palette: 'roofBlue', rect: cells(5, 0, 3, 6) },
  { sheet: 'petalburg', palette: 'roofOrange', rect: cells(8, 0, 3, 6) },
]

/** The Poké Center building: a house front repainted in Center red-and-white. */
export const POKE_CENTER_SPRITE: TileSprite = {
  sheet: 'petalburg',
  palette: 'pokeCenter',
  rect: cells(5, 0, 3, 6),
}

/**
 * Brendan standing still, facing the camera.
 *
 * The sheet holds nine 16x32 frames. Reference: pokeemerald's
 * `src/field_player_avatar.c` treats the avatar as a state machine picking a frame;
 * we are static in this phase, so frame 0 (facing south) is the only one used.
 */
export const PLAYER_SPRITE: TileSprite = {
  sheet: 'brendan',
  palette: 'none',
  rect: { sx: 0, sy: 0, sw: 16, sh: 32 },
}

/** Every distinct sheet/palette pairing the loader must prepare up front. */
export const REQUIRED_VARIANTS: readonly TileSprite[] = [
  GRASS_TILE,
  PATH_TILE,
  TREE_SPRITE,
  POKE_CENTER_SIGN,
  POKE_CENTER_SPRITE,
  PLAYER_SPRITE,
  ...HOUSE_SPRITES,
]

/** Cache key identifying one recoloured sheet. */
export function variantKey(sheet: string, palette: PaletteId): string {
  return `${sheet}:${palette}`
}
