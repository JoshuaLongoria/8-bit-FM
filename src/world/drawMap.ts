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

/** Hover is a light hint; selection is a strong, unmistakable marker. */
const HOVER_COLOUR = '#fdf6c8'
const SELECT_COLOUR = '#ffd23f'
const SELECT_SHADOW = '#3a2a06'

/** What the pointer is currently over and what is chosen. */
export interface MapHighlight {
  readonly hoveredPath: string | null
  readonly selectedPath: string | null
  /**
   * Where to draw the player right now, overriding its resting place in the
   * layout.
   *
   * The layout is rebuilt only when the data or the canvas size changes, never
   * per animation frame — so a walking player cannot be expressed by moving its
   * bounds. Instead the animation passes its current position here and the parts
   * are drawn offset by the difference. The layout stays the stable description
   * of where things live; this is the transient runtime position.
   */
  readonly playerPosition?: { readonly x: number; readonly y: number } | null
}

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
 * Draw a chunky outline around a building.
 *
 * Everything is snapped to whole pixels and drawn with `fillRect` rather than
 * `strokeRect`, because a stroke straddles its path and lands on half pixels,
 * which is exactly the soft edge this art style must avoid. Thickness scales with
 * zoom so the marker stays proportional to the sprites.
 *
 * `corners` adds L-shaped brackets at the four corners — a selection marker that
 * stays legible against a busy roof, and readable for anyone who cannot easily
 * distinguish the hover and selection colours.
 */
function drawOutline(
  ctx: CanvasRenderingContext2D,
  bounds: PixelBounds,
  colour: string,
  thickness: number,
  corners: boolean,
): void {
  const x = Math.round(bounds.x)
  const y = Math.round(bounds.y)
  const w = Math.round(bounds.width)
  const h = Math.round(bounds.height)
  const t = Math.max(1, Math.round(thickness))

  ctx.fillStyle = colour
  // Four sides, drawn just outside the sprite so it never covers the artwork.
  ctx.fillRect(x - t, y - t, w + t * 2, t)
  ctx.fillRect(x - t, y + h, w + t * 2, t)
  ctx.fillRect(x - t, y, t, h)
  ctx.fillRect(x + w, y, t, h)

  if (!corners) return

  const arm = Math.max(t * 2, Math.round(Math.min(w, h) / 5))
  const o = t * 2
  // Top-left, top-right, bottom-left, bottom-right brackets.
  ctx.fillRect(x - o, y - o, arm, t)
  ctx.fillRect(x - o, y - o, t, arm)
  ctx.fillRect(x + w + o - arm, y - o, arm, t)
  ctx.fillRect(x + w + o - t, y - o, t, arm)
  ctx.fillRect(x - o, y + h + o - t, arm, t)
  ctx.fillRect(x - o, y + h + o - arm, t, arm)
  ctx.fillRect(x + w + o - arm, y + h + o - t, arm, t)
  ctx.fillRect(x + w + o - t, y + h + o - arm, t, arm)
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
  highlight: MapHighlight = { hoveredPath: null, selectedPath: null },
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
    // A walking player is drawn offset from where it rests in the layout. Every
    // other object, and a player that is standing still, draws exactly as laid out.
    const offset =
      object.kind === 'player' && highlight.playerPosition
        ? {
            x: highlight.playerPosition.x - object.bounds.x,
            y: highlight.playerPosition.y - object.bounds.y,
          }
        : null

    for (const part of object.parts) {
      drawSprite(
        ctx,
        part.sprite,
        assets,
        offset
          ? { ...part.bounds, x: part.bounds.x + offset.x, y: part.bounds.y + offset.y }
          : part.bounds,
      )
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

  // --- Hover and selection markers ---------------------------------------
  // Drawn after the buildings so a neighbouring roof cannot cover the marker,
  // but before the labels so a name is never obscured by an outline.
  //
  // Selection is checked first and wins: when the pointer rests on the already
  // selected house only the stronger marker is drawn, rather than two outlines
  // fighting over the same edge.
  for (const object of layout.objects) {
    if (object.kind !== 'house' || object.folderPath === null) continue

    if (object.folderPath === highlight.selectedPath) {
      // A dark pass first, offset outward, so the bright marker keeps its
      // contrast over pale roofs as well as dark grass.
      drawOutline(ctx, object.bounds, SELECT_SHADOW, layout.zoom * 3, true)
      drawOutline(ctx, object.bounds, SELECT_COLOUR, layout.zoom * 2, true)
    } else if (object.folderPath === highlight.hoveredPath) {
      drawOutline(ctx, object.bounds, HOVER_COLOUR, layout.zoom, false)
    }
  }

  // --- Labels ------------------------------------------------------------
  // Drawn last so no building can cover a name.
  for (const object of layout.objects) {
    drawLabel(ctx, object, layout)
  }
}
