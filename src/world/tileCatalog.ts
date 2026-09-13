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

/**
 * The "P.C" signboard, general sheet cols 7-8 row 19-20.
 *
 * It starts at column 7, not column 6. Column 6 holds the left half of a
 * *different* signboard, and including it put a stray glyph beside the "P.C".
 */
export const POKE_CENTER_SIGN: TileSprite = {
  sheet: 'general',
  palette: 'sign',
  rect: cells(7, 19, 2, 2),
}

/* --------------------------------------------------------------------------
 * Building parts
 *
 * The sheets contain no whole houses — only roof edges, roof middles, wall
 * segments and doors. A building is assembled from those, which is what lets it
 * be any width. Taking a single fixed cutout instead is what made the first
 * attempt look like a narrow tower.
 *
 * Every building is four tiles of roof (32px) above two tiles of body (16px).
 * ----------------------------------------------------------------------- */

/** Rows 0-3 of the Petalburg sheet are roof; rows 4-5 are body. */
export const ROOF_ROWS = 4
export const BODY_ROWS = 2
export const BUILDING_ROWS = ROOF_ROWS + BODY_ROWS

/** One building design: a roof in three horizontal slices, plus a colour. */
export interface BuildingDesign {
  readonly palette: PaletteId
  readonly roofLeft: TileSprite
  readonly roofMid: TileSprite
  readonly roofRight: TileSprite
}

function roofDesign(startCol: number, palette: Exclude<PaletteId, 'none'>): BuildingDesign {
  const part = (col: number): TileSprite => ({
    sheet: 'petalburg',
    palette,
    rect: cells(col, 0, 1, ROOF_ROWS),
  })
  return {
    palette,
    roofLeft: part(startCol),
    roofMid: part(startCol + 1),
    roofRight: part(startCol + 2),
  }
}

/** A plain wall segment (Petalburg col 9, rows 4-5) that repeats cleanly. */
export function wallSprite(palette: Exclude<PaletteId, 'none'>): TileSprite {
  return { sheet: 'petalburg', palette, rect: cells(9, 4, 1, BODY_ROWS) }
}

/** A framed double door (Petalburg cols 8-9, rows 8-9), two tiles square. */
export function doorSprite(palette: Exclude<PaletteId, 'none'>): TileSprite {
  return { sheet: 'petalburg', palette, rect: cells(8, 8, 2, 2) }
}

/** Width of the door in source tiles. */
export const DOOR_TILES = 2

/**
 * Three visually distinct house designs. Each pairs a different roof pattern with
 * a different colour, so the three biggest folders are told apart at a glance and
 * not only by their labels.
 */
export const HOUSE_DESIGNS: readonly BuildingDesign[] = [
  roofDesign(2, 'roofRed'),
  roofDesign(5, 'roofBlue'),
  roofDesign(8, 'roofOrange'),
]

/** The Poké Center: the banded roof repainted in Centre red-and-white. */
export const POKE_CENTER_DESIGN: BuildingDesign = roofDesign(5, 'pokeCenter')

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
  PLAYER_SPRITE,
  ...[...HOUSE_DESIGNS, POKE_CENTER_DESIGN].flatMap((design) => [
    design.roofLeft,
    design.roofMid,
    design.roofRight,
  ]),
]

/** Cache key identifying one recoloured sheet. */
export function variantKey(sheet: string, palette: PaletteId): string {
  return `${sheet}:${palette}`
}
