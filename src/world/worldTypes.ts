/**
 * Types for the tile-based world view.
 *
 * Architectural reference (concepts only, no code copied): pokeemerald's
 * `src/fieldmap.c` separates the *map* (a grid of blocks) from the *objects* drawn
 * on top of it, and `src/sprite.c` describes a sprite as "a rectangle cut out of a
 * sheet, drawn at a position". This file encodes that same split.
 *
 * Boundary reminder: `RepositoryScene` in `../scene/sceneTypes.ts` holds repository
 * FACTS and never holds pixels. Everything in this file is PRESENTATION — pixels,
 * grids and rectangles — and never holds facts. `buildWorldLayout()` is the one
 * function that turns the former into the latter.
 */

/** Which downloaded image a rectangle is cut from. */
export type SheetId = 'general' | 'petalburg' | 'brendan'

/**
 * Which colour ramp to paint a greyscale tile with.
 *
 * The pokeemerald tilesets ship as greyscale shapes; the real colours live in
 * separate palette files we have not imported. `assetLoader.ts` therefore applies
 * one of these ramps at load time, which is the same pairing of "tile data" with
 * "palette" that `src/tilesets.c` performs on hardware.
 *
 * 'none' means "already in colour" — used for the Brendan sprite sheet.
 */
export type PaletteId =
  | 'none'
  | 'grass'
  | 'path'
  | 'tree'
  | 'roofRed'
  | 'roofBlue'
  | 'roofOrange'
  | 'pokeCenter'
  | 'sign'

/** A rectangle cut out of a sheet, in unscaled source pixels. */
export interface SourceRect {
  readonly sx: number
  readonly sy: number
  readonly sw: number
  readonly sh: number
}

/** A named, palette-paired cutout — one entry in the tile catalogue. */
export interface TileSprite {
  readonly sheet: SheetId
  readonly palette: PaletteId
  readonly rect: SourceRect
}

/** What a placed object represents, which decides how it is drawn and labelled. */
export type WorldObjectKind = 'house' | 'pokeCenter' | 'tree' | 'player'

/** A rectangle in CSS pixels within the canvas. */
export interface PixelBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/**
 * One thing standing on the map.
 *
 * `bounds` is the single source of truth for where this object sits. `drawMap.ts`
 * draws from it, and Phase UI-2's hit testing will read the same numbers, so the
 * picture and the click targets can never disagree.
 *
 * `folderPath` is present only for objects that stand for a folder (the houses).
 * It carries the repository-relative path from `SceneFolder.path`, which is the
 * shared selection identity with Developer 3's accessible tree.
 */
export interface WorldObject {
  readonly kind: WorldObjectKind
  readonly sprite: TileSprite
  readonly bounds: PixelBounds
  /** Text drawn beneath the object, or `null` when it needs no label. */
  readonly label: string | null
  /** Repository-relative folder path, or `null` for scenery and the player. */
  readonly folderPath: string | null
}

/**
 * The complete, already-computed picture.
 *
 * Everything needed to draw a frame is here as plain numbers: no React, no canvas,
 * no image objects. That keeps `buildWorldLayout()` a pure function which can be
 * unit-tested without a browser.
 */
export interface WorldLayout {
  /** Canvas size in CSS pixels (not device pixels). */
  readonly widthPx: number
  readonly heightPx: number
  /** Integer magnification: 1 source pixel becomes `zoom` screen pixels. */
  readonly zoom: number
  /** Size of one grid cell in CSS pixels. */
  readonly cellPx: number
  readonly cols: number
  readonly rows: number
  /** Horizontal path centre lines, in CSS pixels, drawn under the objects. */
  readonly paths: readonly PixelBounds[]
  /** Everything standing on the ground, in draw order (back to front). */
  readonly objects: readonly WorldObject[]
}
