/**
 * Turns repository facts into a picture plan: where every building, tree, path and
 * label sits, in CSS pixels.
 *
 * Architectural reference (concepts only, no code copied): pokeemerald's
 * `src/fieldmap.c` builds a grid of blocks and then places objects onto it. Same
 * idea here, except the object positions are derived from folder data.
 *
 * This module is deliberately PURE: it imports no React, touches no canvas, and
 * loads no images. Give it a scene and a size, get back plain numbers. That means
 * it can be unit-tested without a browser, and — importantly — the same returned
 * object feeds both drawing and hit testing, so what you see and what you can
 * click can never drift apart. Path rectangles live here too, rather than being
 * recomputed inside the drawing code.
 */
import type { RepositoryScene, SceneFolder } from '../scene/sceneTypes'
import {
  BUILDING_ROWS,
  DOOR_TILES,
  HOUSE_DESIGNS,
  POKE_CENTER_DESIGN,
  PLAYER_SPRITE,
  ROOF_ROWS,
  SOURCE_CELL,
  SOURCE_TILE,
  TREE_SPRITE,
  doorSprite,
  wallSprite,
  type BuildingDesign,
} from './tileCatalog'
import type { PixelBounds, SpritePart, WorldLayout, WorldObject } from './worldTypes'

/** Magnification bounds. Integers only, so pixels stay square and crisp. */
export const MIN_ZOOM = 1
export const MAX_ZOOM = 4

/** How many folders can become houses. */
export const MAX_HOUSES = 3

/** Building widths in source tiles. Wide enough to read as buildings, not towers. */
export const HOUSE_TILES = 6
export const CENTER_TILES = 8

/**
 * Vertical space the scene needs, in source pixels before magnification:
 * label (16) + Poké Center (48) + gap (8) + path (16) + gap (8) + house (48)
 * + label (16). The two label allowances are why the Centre's name can sit above
 * its roof without being pushed into the tree line.
 */
const STACK_SOURCE_HEIGHT = 160

/**
 * Vertical space the tree border eats. The top and bottom rows are deliberately
 * half off-canvas — a clipped tree line is how the edge of a Pokémon map reads —
 * so together they cost one tree height (48) rather than two.
 */
const BORDER_SOURCE_HEIGHT = 48

/** Rough source width needed before another magnification step is worthwhile. */
const WIDTH_PER_ZOOM_STEP = 320

/** Label allowance in source pixels, above the Centre and below each house. */
const LABEL_SOURCE_HEIGHT = 16

/**
 * Rank folders for display: most files first, ties broken alphabetically.
 *
 * The alphabetical tie-break is what makes the map stable. Without it, two folders
 * holding the same number of files could swap houses between renders depending on
 * the order the backend happened to send them.
 *
 * `folders` is `readonly`, so we sort a copy rather than mutating the caller's
 * array — scene data is never modified in place.
 */
export function rankFolders(folders: readonly SceneFolder[]): readonly SceneFolder[] {
  return [...folders].sort((a, b) => {
    if (b.fileCount !== a.fileCount) {
      return b.fileCount - a.fileCount
    }
    // Plain code-unit comparison rather than localeCompare: the ordering must be
    // identical on every machine, and locale rules vary between them.
    if (a.name < b.name) return -1
    if (a.name > b.name) return 1
    return 0
  })
}

/**
 * Pick an integer magnification that suits the container.
 *
 * Only whole numbers are allowed: a fractional zoom would land sprite edges
 * between physical pixels and produce the blurry seams this art style must avoid.
 *
 * Height matters as much as width. Choosing on width alone lets a short, wide
 * container pick a magnification whose buildings cannot possibly fit between the
 * tree lines, and they end up stacked on top of one another. Taking the smaller of
 * the two limits guarantees the scene always has room for itself.
 */
export function chooseZoom(widthPx: number, heightPx: number): number {
  const byWidth = Math.floor(widthPx / WIDTH_PER_ZOOM_STEP)
  const byHeight = Math.floor(heightPx / (STACK_SOURCE_HEIGHT + BORDER_SOURCE_HEIGHT))
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(byWidth, byHeight)))
}

/** Round down to a whole grid cell so objects line up with the ground tiles. */
function snapToCell(value: number, cellPx: number): number {
  return Math.floor(value / cellPx) * cellPx
}

/**
 * Snap to the *nearest* grid cell rather than the one below.
 *
 * Buildings are centred in a slot and then snapped. Flooring always pushes them
 * left, by up to a whole cell, which is enough to make three evenly-spaced houses
 * look visibly unevenly spaced. Rounding keeps them near their true centres while
 * still landing on the tile grid.
 */
function snapToCellRound(value: number, cellPx: number): number {
  return Math.round(value / cellPx) * cellPx
}

/** Keep a value inside a range; used so nothing escapes the canvas. */
function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value))
}

/**
 * Assemble one building: a roof of repeated middle slices between two edge
 * slices, a body of repeated wall segments, and a door centred at the bottom.
 *
 * Building it from parts is what gives every house a visible roof, body and door
 * at any width.
 */
function buildingParts(
  design: BuildingDesign,
  x: number,
  y: number,
  widthTiles: number,
  zoom: number,
): readonly SpritePart[] {
  const tile = SOURCE_TILE * zoom
  const roofH = ROOF_ROWS * SOURCE_TILE * zoom
  const bodyH = BUILDING_ROWS * SOURCE_TILE * zoom - roofH
  const parts: SpritePart[] = []
  const palette = design.palette === 'none' ? 'roofRed' : design.palette

  // Roof: left edge, as many middles as needed, right edge.
  for (let i = 0; i < widthTiles; i++) {
    const sprite =
      i === 0 ? design.roofLeft : i === widthTiles - 1 ? design.roofRight : design.roofMid
    parts.push({
      sprite,
      bounds: { x: x + i * tile, y, width: tile, height: roofH },
    })
  }

  // Body: a plain wall right across, so the door can sit on top of it.
  const wall = wallSprite(palette)
  for (let i = 0; i < widthTiles; i++) {
    parts.push({
      sprite: wall,
      bounds: { x: x + i * tile, y: y + roofH, width: tile, height: bodyH },
    })
  }

  // Door: centred, and snapped to a whole tile so it lines up with the wall.
  const doorTiles = Math.min(DOOR_TILES, widthTiles)
  const doorOffset = Math.floor((widthTiles - doorTiles) / 2)
  parts.push({
    sprite: doorSprite(palette),
    bounds: {
      x: x + doorOffset * tile,
      y: y + roofH,
      width: doorTiles * tile,
      height: bodyH,
    },
  })

  return parts
}

/** A single-sprite object, used for trees and the player. */
function simpleObject(
  kind: WorldObject['kind'],
  sprite: SpritePart['sprite'],
  bounds: PixelBounds,
): WorldObject {
  return {
    kind,
    parts: [{ sprite, bounds }],
    bounds,
    label: null,
    labelAnchor: 'below',
    folderPath: null,
  }
}

/**
 * Build the complete picture plan.
 *
 * Layout, top to bottom: a ring of trees around the edge, the Poké Center standing
 * for the whole repository with its name above it, a walking path across the
 * middle with the player on it, and up to three houses below — one per largest
 * folder, each joined to the main path by its own spur.
 */
export function buildWorldLayout(
  scene: RepositoryScene,
  widthPx: number,
  heightPx: number,
): WorldLayout {
  // Guard against zero or negative sizes, which a container can briefly report
  // before it has been measured.
  const width = Math.max(1, Math.floor(widthPx))
  const height = Math.max(1, Math.floor(heightPx))

  const zoom = chooseZoom(width, height)
  const cellPx = SOURCE_CELL * zoom
  const tilePx = SOURCE_TILE * zoom
  const cols = Math.max(1, Math.floor(width / cellPx))
  const rows = Math.max(1, Math.floor(height / cellPx))

  const treeW = TREE_SPRITE.rect.sw * zoom
  const treeH = TREE_SPRITE.rect.sh * zoom
  const buildingH = BUILDING_ROWS * SOURCE_TILE * zoom
  const houseW = HOUSE_TILES * SOURCE_TILE * zoom
  const centerW = CENTER_TILES * SOURCE_TILE * zoom
  const playerW = PLAYER_SPRITE.rect.sw * zoom
  const playerH = PLAYER_SPRITE.rect.sh * zoom

  // The tree border sits half off-canvas on every edge, so the map reads as a
  // clearing inside a forest rather than a rectangle of trees. Half a tree is
  // therefore the usable margin.
  const halfTreeW = treeW / 2
  const halfTreeH = treeH / 2

  // Inner region: the clearing the buildings stand in.
  const innerTop = halfTreeH
  const innerBottom = Math.max(innerTop + 1, height - halfTreeH)
  const innerLeft = halfTreeW
  const innerRight = Math.max(innerLeft + 1, width - halfTreeW)
  const innerWidth = innerRight - innerLeft

  // --- Vertical stack ----------------------------------------------------
  // Positions are derived from a budget that is known to fit, because
  // `chooseZoom` already refused any magnification too large for this height.
  // Deriving them from percentages of the height instead would let the Centre,
  // the path and the houses land on top of one another on short canvases.
  const gap = 8 * zoom
  const labelSpace = LABEL_SOURCE_HEIGHT * zoom
  const pathBandH = cellPx
  const stackHeight = labelSpace + buildingH + gap + pathBandH + gap + buildingH + labelSpace

  const stackTop = innerTop + Math.max(0, (innerBottom - innerTop - stackHeight) / 2)
  // The Centre's label sits above its roof, so the roof starts one label down.
  const centerY = clamp(
    snapToCell(stackTop + labelSpace, cellPx),
    labelSpace,
    Math.max(0, height - buildingH),
  )
  const pathY = clamp(centerY + buildingH + gap, 0, Math.max(0, height - pathBandH))
  const houseY = clamp(pathY + pathBandH + gap, 0, Math.max(0, height - buildingH))

  const objects: WorldObject[] = []
  const paths: PixelBounds[] = []

  // --- Tree border -------------------------------------------------------
  // Pushed first so the buildings overlap them rather than the other way round.
  // Rows start half a tree off the edge and run one past it, so no gap can open
  // up in a corner whatever the canvas size.
  for (let x = -halfTreeW; x < width + halfTreeW; x += treeW) {
    objects.push(simpleObject('tree', TREE_SPRITE, { x, y: -halfTreeH, width: treeW, height: treeH }))
    objects.push(
      simpleObject('tree', TREE_SPRITE, { x, y: height - halfTreeH, width: treeW, height: treeH }),
    )
  }
  for (let y = halfTreeH; y < height - halfTreeH; y += treeH) {
    objects.push(simpleObject('tree', TREE_SPRITE, { x: -halfTreeW, y, width: treeW, height: treeH }))
    objects.push(
      simpleObject('tree', TREE_SPRITE, { x: width - halfTreeW, y, width: treeW, height: treeH }),
    )
  }

  // --- Main path ---------------------------------------------------------
  paths.push({ x: 0, y: pathY, width, height: pathBandH })

  // --- Poké Center: the repository itself --------------------------------
  const centerX = clamp(
    snapToCellRound((width - centerW) / 2, cellPx),
    0,
    Math.max(0, width - centerW),
  )
  const centerBounds: PixelBounds = { x: centerX, y: centerY, width: centerW, height: buildingH }
  objects.push({
    kind: 'pokeCenter',
    parts: buildingParts(POKE_CENTER_DESIGN, centerX, centerY, CENTER_TILES, zoom),
    bounds: centerBounds,
    label: scene.repositoryName,
    // Above the roof, which keeps the repository name clear of the player and the
    // door standing directly beneath it.
    labelAnchor: 'above',
    folderPath: null,
  })

  // Spur joining the Centre's door down to the main path.
  paths.push(spur(centerX + centerW / 2, centerY + buildingH, pathY, tilePx * DOOR_TILES, width))

  // --- Houses: one per largest folder ------------------------------------
  // `slice` copes with fewer than three folders on its own — an empty repository
  // simply produces no houses rather than an error.
  const ranked = rankFolders(scene.folders).slice(0, MAX_HOUSES)
  const slotWidth = ranked.length > 0 ? innerWidth / ranked.length : innerWidth

  ranked.forEach((folder, index) => {
    // One design per slot; fall back to the first so an unexpected index can
    // never produce an undefined design.
    const design = HOUSE_DESIGNS[index] ?? HOUSE_DESIGNS[0]
    if (!design) return

    const slotCentre = innerLeft + slotWidth * index + slotWidth / 2
    const x = clamp(
      snapToCellRound(slotCentre - houseW / 2, cellPx),
      innerLeft,
      Math.max(innerLeft, innerRight - houseW),
    )
    objects.push({
      kind: 'house',
      parts: buildingParts(design, x, houseY, HOUSE_TILES, zoom),
      bounds: { x, y: houseY, width: houseW, height: buildingH },
      label: folder.name,
      labelAnchor: 'below',
      folderPath: folder.path,
    })

    // Spur joining this house's door up to the main path.
    paths.push(spur(x + houseW / 2, pathY + pathBandH, houseY, tilePx * DOOR_TILES, width))
  })

  // --- Player: stationary, standing on the path --------------------------
  // Placed clear of the Poké Center's footprint, not merely offset from its
  // centre: the player is two tiles tall and the path runs close under the
  // building, so an offset alone leaves the player standing inside the wall.
  // Prefer the right of the building, and fall back to its left when a narrow
  // canvas leaves no room there.
  const rightOfCentre = centerX + centerW + tilePx
  const leftOfCentre = centerX - playerW - tilePx
  const playerX = clamp(
    Math.round(
      rightOfCentre + playerW <= width ? rightOfCentre : leftOfCentre >= 0 ? leftOfCentre : rightOfCentre,
    ),
    0,
    Math.max(0, width - playerW),
  )
  const playerY = clamp(pathY + pathBandH - playerH, 0, Math.max(0, height - playerH))
  objects.push(
    simpleObject('player', PLAYER_SPRITE, {
      x: playerX,
      y: playerY,
      width: playerW,
      height: playerH,
    }),
  )

  return {
    widthPx: width,
    heightPx: height,
    zoom,
    cellPx,
    cols,
    rows,
    paths,
    objects,
  }
}

/**
 * A vertical path segment joining a building to the main path.
 *
 * `fromY` and `toY` may arrive in either order — a house sits below the path and
 * the Centre above it — so the segment is normalised rather than trusted.
 */
function spur(
  centreX: number,
  fromY: number,
  toY: number,
  width: number,
  canvasWidth: number,
): PixelBounds {
  const top = Math.min(fromY, toY)
  const bottom = Math.max(fromY, toY)
  const x = clamp(Math.round(centreX - width / 2), 0, Math.max(0, canvasWidth - width))
  return { x, y: top, width, height: Math.max(0, bottom - top) }
}
