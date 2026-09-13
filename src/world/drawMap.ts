/**
 * Paints a `WorldLayout` onto a canvas.
 *
 * This module makes no decisions about *where* things go — `mapLayout.ts` already
 * decided that, paths included. It only turns the plan into pixels, in
 * back-to-front order: ground, then paths, then buildings, then labels. That order
 * is what keeps paths underneath the buildings, the player and the labels.
 *
 * Architectural reference (concepts only, no code copied): pokeemerald's
 * `src/sprite.c` draws sprites from a sheet in a fixed priority order; the same
 * back-to-front discipline is what stops a tree covering a house here.
 */
import { GRASS_TILE, PATH_TILE, POKE_CENTER_SIGN } from './tileCatalog'
import { sheetFor, type LoadedAssets } from './assetLoader'
import type { PixelBounds, TileSprite, WorldLayout, WorldObject } from './worldTypes'

/** Colour used behind labels so names stay readable over any terrain. */
const LABEL_BACKGROUND = 'rgba(16, 22, 34, 0.85)'
const LABEL_TEXT = '#f4f8ff'
const LABEL_BORDER = '#f8f0d0'

/**
 * Build a small canvas holding one tile drawn at the current zoom, so it can be
 * repeated across a large area in a single fill instead of thousands of draws.
 */
function makeTilePattern(
  ctx: CanvasRenderingContext2D,
  sprite: TileSprite,
  assets: LoadedAssets,
  zoom: number,
): CanvasPattern | null {
  const sheet = sheetFor(assets, sprite)
  if (!sheet) return null

  const tile = document.createElement('canvas')
  tile.width = sprite.rect.sw * zoom
  tile.height = sprite.rect.sh * zoom
  const tileCtx = tile.getContext('2d')
  if (!tileCtx) return null

  tileCtx.imageSmoothingEnabled = false
  tileCtx.drawImage(
    sheet,
    sprite.rect.sx,
    sprite.rect.sy,
    sprite.rect.sw,
    sprite.rect.sh,
    0,
    0,
    tile.width,
    tile.height,
  )
  return ctx.createPattern(tile, 'repeat')
}

/** Draw one sprite into a rectangle, nearest-neighbour so pixels stay sharp. */
function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: TileSprite,
  assets: LoadedAssets,
  bounds: PixelBounds,
): void {
  const sheet = sheetFor(assets, sprite)
  if (!sheet) return
  if (bounds.width <= 0 || bounds.height <= 0) return
  ctx.drawImage(
    sheet,
    sprite.rect.sx,
    sprite.rect.sy,
    sprite.rect.sw,
    sprite.rect.sh,
    Math.round(bounds.x),
    Math.round(bounds.y),
    Math.round(bounds.width),
    Math.round(bounds.height),
  )
}

/**
 * Draw a label plate on the side of the object its anchor names.
 *
 * The anchor is decided by the layout, not here: the repository name goes above
 * the Poké Center so it cannot cover the Centre's door or the player standing on
 * the path below, while folder names go beneath their houses.
 */
function drawLabel(
  ctx: CanvasRenderingContext2D,
  object: WorldObject,
  layout: WorldLayout,
): void {
  if (!object.label) return

  const fontSize = Math.max(11, 5 * layout.zoom)
  ctx.font = `${fontSize}px ui-monospace, "Cascadia Mono", Consolas, monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'

  const padX = 6
  const padY = 3
  const boxWidth = ctx.measureText(object.label).width + padX * 2
  const boxHeight = fontSize + padY * 2
  const centreX = object.bounds.x + object.bounds.width / 2
  const gap = 4

  // Keep the plate inside the canvas even for objects near an edge.
  const boxX = clamp(centreX - boxWidth / 2, 2, Math.max(2, layout.widthPx - boxWidth - 2))
  const rawY =
    object.labelAnchor === 'above'
      ? object.bounds.y - boxHeight - gap
      : object.bounds.y + object.bounds.height + gap
  const boxY = clamp(rawY, 2, Math.max(2, layout.heightPx - boxHeight - 2))

  ctx.fillStyle = LABEL_BACKGROUND
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight)
  ctx.strokeStyle = LABEL_BORDER
  ctx.lineWidth = 1
  ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxWidth - 1, boxHeight - 1)

  ctx.fillStyle = LABEL_TEXT
  ctx.fillText(object.label, boxX + boxWidth / 2, boxY + padY)
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value))
}

/**
 * Paint a whole frame.
 *
 * `ctx` is expected to already be scaled for the device pixel ratio, so every
 * number used here is in CSS pixels and matches the layout exactly.
 */
export function drawMap(
  ctx: CanvasRenderingContext2D,
  layout: WorldLayout,
  assets: LoadedAssets,
): void {
  // Nearest-neighbour scaling. Without this the browser smooths every sprite and
  // the 8-bit art turns into a blur.
  ctx.imageSmoothingEnabled = false

  // --- Ground ------------------------------------------------------------
  const grass = makeTilePattern(ctx, GRASS_TILE, assets, layout.zoom)
  if (grass) {
    ctx.fillStyle = grass
    ctx.fillRect(0, 0, layout.widthPx, layout.heightPx)
  } else {
    // Assets missing: a flat field is still better than an empty canvas.
    ctx.fillStyle = '#68b860'
    ctx.fillRect(0, 0, layout.widthPx, layout.heightPx)
  }

  // --- Walking paths -----------------------------------------------------
  // Every rectangle comes straight from the layout, including the spurs joining
  // each building to the main path. Nothing is recomputed here.
  const path = makeTilePattern(ctx, PATH_TILE, assets, layout.zoom)
  if (path) {
    ctx.fillStyle = path
    for (const band of layout.paths) {
      if (band.width > 0 && band.height > 0) {
        ctx.fillRect(band.x, band.y, band.width, band.height)
      }
    }
  }

  // --- Objects -----------------------------------------------------------
  // `layout.objects` is already in back-to-front order, and each object carries
  // the pieces it is assembled from.
  for (const object of layout.objects) {
    for (const part of object.parts) {
      drawSprite(ctx, part.sprite, assets, part.bounds)
    }

    // The Poké Center gets its "P.C" signboard hung on the roof above the door.
    if (object.kind === 'pokeCenter') {
      const signWidth = POKE_CENTER_SIGN.rect.sw * layout.zoom
      const signHeight = POKE_CENTER_SIGN.rect.sh * layout.zoom
      drawSprite(ctx, POKE_CENTER_SIGN, assets, {
        x: object.bounds.x + (object.bounds.width - signWidth) / 2,
        y: object.bounds.y + object.bounds.height - signHeight - 16 * layout.zoom,
        width: signWidth,
        height: signHeight,
      })
    }
  }

  // --- Labels ------------------------------------------------------------
  // Drawn last so no building can cover a name.
  for (const object of layout.objects) {
    drawLabel(ctx, object, layout)
  }
}
