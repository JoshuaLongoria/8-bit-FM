/**
 * Turns repository facts into a picture plan: where every building, tree and path
 * sits, in CSS pixels.
 *
 * Architectural reference (concepts only, no code copied): pokeemerald's
 * `src/fieldmap.c` builds a grid of blocks and then places objects onto it. Same
 * idea here, except the object positions are derived from folder data.
 *
 * This module is deliberately PURE: it imports no React, touches no canvas, and
 * loads no images. Give it a scene and a size, get back plain numbers. That means
 * it can be unit-tested in Phase UI-2 without a browser, and — importantly — the
 * same returned object feeds both drawing and hit testing, so what you see and
 * what you can click can never drift apart.
 */
import type { RepositoryScene, SceneFolder } from '../scene/sceneTypes'
import {
  HOUSE_SPRITES,
  POKE_CENTER_SPRITE,
  PLAYER_SPRITE,
  SOURCE_CELL,
  TREE_SPRITE,
} from './tileCatalog'
import type { PixelBounds, WorldLayout, WorldObject } from './worldTypes'

/** Magnification bounds. Integers only, so pixels stay square and crisp. */
export const MIN_ZOOM = 1
export const MAX_ZOOM = 4

/** How many folders can become houses. */
export const MAX_HOUSES = 3

/**
 * Vertical space the scene needs, in source pixels before magnification:
 * Poké Center (48) + gap (8) + path (16) + gap (8) + house (48) + label (16).
 */
const STACK_SOURCE_HEIGHT = 144

/**
 * Vertical space the tree border eats. The top and bottom rows are deliberately
 * half off-canvas — a clipped tree line is how the edge of a Pokémon map reads —
 * so together they cost one tree height (48) rather than two.
 */
const BORDER_SOURCE_HEIGHT = 48

/** Rough source width needed before another magnification step is worthwhile. */
const WIDTH_PER_ZOOM_STEP = 320

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

/** Keep a value inside a range; used so nothing escapes the canvas. */
function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value))
}

/**
 * Build the complete picture plan.
 *
 * Layout, top to bottom: a ring of trees around the edge, the Poké Center standing
 * for the whole repository, a walking path across the middle with the player on it,
 * and up to three houses below — one per largest folder.
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
  const cols = Math.max(1, Math.floor(width / cellPx))
  const rows = Math.max(1, Math.floor(height / cellPx))

  const treeW = TREE_SPRITE.rect.sw * zoom
  const treeH = TREE_SPRITE.rect.sh * zoom
  const houseW = HOUSE_SPRITES[0] ? HOUSE_SPRITES[0].rect.sw * zoom : 0
  const houseH = HOUSE_SPRITES[0] ? HOUSE_SPRITES[0].rect.sh * zoom : 0
  const centerW = POKE_CENTER_SPRITE.rect.sw * zoom
  const centerH = POKE_CENTER_SPRITE.rect.sh * zoom
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
  const labelSpace = 16 * zoom
  const pathBandH = SOURCE_CELL * zoom
  const stackHeight = centerH + gap + pathBandH + gap + houseH + labelSpace

  // Centre the stack in whatever room the clearing has.
  const stackTop = innerTop + Math.max(0, (innerBottom - innerTop - stackHeight) / 2)
  const centerY = clamp(snapToCell(stackTop, cellPx), 0, Math.max(0, height - centerH))
  const pathY = clamp(centerY + centerH + gap, 0, Math.max(0, height - pathBandH))
  const houseY = clamp(pathY + pathBandH + gap, 0, Math.max(0, height - houseH))

  const objects: WorldObject[] = []

  // --- Tree border -------------------------------------------------------
  // Drawn first so the buildings overlap them rather than the other way round.
  // Rows start half a tree off the edge and run one past it, so no gap can open
  // up in a corner whatever the canvas size.
  for (let x = -halfTreeW; x < width + halfTreeW; x += treeW) {
    objects.push(makeTree(x, -halfTreeH, treeW, treeH))
    objects.push(makeTree(x, height - halfTreeH, treeW, treeH))
  }
  for (let y = halfTreeH; y < height - halfTreeH; y += treeH) {
    objects.push(makeTree(-halfTreeW, y, treeW, treeH))
    objects.push(makeTree(width - halfTreeW, y, treeW, treeH))
  }

  // --- Poké Center: the repository itself --------------------------------
  const centerX = clamp(
    snapToCell((width - centerW) / 2, cellPx),
    0,
    Math.max(0, width - centerW),
  )
  objects.push({
    kind: 'pokeCenter',
    sprite: POKE_CENTER_SPRITE,
    bounds: { x: centerX, y: centerY, width: centerW, height: centerH },
    label: scene.repositoryName,
    folderPath: null,
  })

  // --- Houses: one per largest folder ------------------------------------
  // `slice` copes with fewer than three folders on its own — an empty repository
  // simply produces no houses rather than an error.
  const ranked = rankFolders(scene.folders).slice(0, MAX_HOUSES)
  const slotWidth = ranked.length > 0 ? innerWidth / ranked.length : innerWidth

  ranked.forEach((folder, index) => {
    // `HOUSE_SPRITES` has one design per slot; fall back to the first so an
    // unexpected index can never produce an undefined sprite.
    const sprite = HOUSE_SPRITES[index] ?? HOUSE_SPRITES[0]
    if (!sprite) {
      return
    }
    const slotCentre = innerLeft + slotWidth * index + slotWidth / 2
    const x = clamp(
      snapToCell(slotCentre - houseW / 2, cellPx),
      innerLeft,
      Math.max(innerLeft, innerRight - houseW),
    )
    objects.push({
      kind: 'house',
      sprite,
      bounds: { x, y: houseY, width: houseW, height: houseH },
      label: folder.name,
      folderPath: folder.path,
    })
  })

  // --- Player: stationary, standing on the path below the Center ---------
  const playerX = clamp(
    Math.round(centerX + (centerW - playerW) / 2),
    0,
    Math.max(0, width - playerW),
  )
  const playerY = clamp(pathY + pathBandH - playerH, 0, Math.max(0, height - playerH))
  objects.push({
    kind: 'player',
    sprite: PLAYER_SPRITE,
    bounds: { x: playerX, y: playerY, width: playerW, height: playerH },
    label: null,
    folderPath: null,
  })

  // --- Paths -------------------------------------------------------------
  // One horizontal road, plus a short spur linking the Poké Center door to it.
  const paths: PixelBounds[] = [
    { x: 0, y: pathY, width, height: pathBandH },
    {
      x: snapToCell(centerX + centerW / 2 - cellPx / 2, cellPx),
      y: Math.min(centerY + centerH, pathY),
      width: cellPx,
      height: Math.max(0, pathY - (centerY + centerH)),
    },
  ]

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

function makeTree(x: number, y: number, width: number, height: number): WorldObject {
  return {
    kind: 'tree',
    sprite: TREE_SPRITE,
    bounds: { x, y, width, height },
    label: null,
    folderPath: null,
  }
}
