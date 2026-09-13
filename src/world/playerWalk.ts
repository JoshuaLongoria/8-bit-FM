/**
 * The maths behind walking the player to a house.
 *
 * PURE on purpose — no React, no canvas, no `requestAnimationFrame`. The
 * component owns the clock; this module only answers "given a plan and how long
 * it has been running, where is the player?". That keeps the movement testable
 * with plain assertions, and it means the animation loop contains no geometry.
 *
 * All coordinates are CSS/layout pixels, the same space `WorldLayout` uses.
 */
import type { PixelBounds, WorldLayout, WorldObject } from './worldTypes'

export interface Point {
  readonly x: number
  readonly y: number
}

/**
 * A two-leg walk: horizontally along the main path, then vertically to the house.
 *
 * The corner is where the player turns. Walking in two straight legs rather than
 * diagonally is what makes it read as a tile-grid game character.
 */
export interface WalkPlan {
  readonly from: Point
  readonly corner: Point
  readonly to: Point
  readonly horizontalMs: number
  readonly verticalMs: number
  readonly totalMs: number
}

/** Pixels per millisecond. Brisk enough to feel responsive, slow enough to read. */
const SPEED = 0.9

/** A leg that moves at all takes at least this long, so short hops are visible. */
const MIN_LEG_MS = 70

/** Nothing may take longer than this, however far the walk. */
const MAX_TOTAL_MS = 900

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Where the player should stand to have "arrived" at a house.
 *
 * Centred on the house horizontally, and stopped just ABOVE its top edge — the
 * side the path spur arrives from. The player therefore never overlaps the
 * building at all: it cannot walk into it, and because the walk approaches from
 * the path above, it never crosses the roof either.
 *
 * Stopping below the house instead would look like the player had walked straight
 * through the building to reach the door on the far side.
 */
export function entranceFor(
  house: PixelBounds,
  playerWidth: number,
  playerHeight: number,
  layout: Pick<WorldLayout, 'widthPx' | 'heightPx'>,
): Point {
  const x = clamp(
    Math.round(house.x + house.width / 2 - playerWidth / 2),
    0,
    Math.max(0, layout.widthPx - playerWidth),
  )
  const y = clamp(
    Math.round(house.y - playerHeight),
    0,
    Math.max(0, layout.heightPx - playerHeight),
  )
  return { x, y }
}

/**
 * Build a walk from one point to another.
 *
 * Each leg's duration is proportional to its distance, so the player moves at a
 * constant speed through the turn instead of visibly accelerating. A leg of zero
 * length costs zero time rather than a pause.
 */
export function planWalk(from: Point, to: Point): WalkPlan {
  const corner: Point = { x: to.x, y: from.y }

  const dx = Math.abs(to.x - from.x)
  const dy = Math.abs(to.y - from.y)

  let horizontalMs = dx === 0 ? 0 : Math.max(MIN_LEG_MS, dx / SPEED)
  let verticalMs = dy === 0 ? 0 : Math.max(MIN_LEG_MS, dy / SPEED)

  // Scale both legs down together if the total would drag on, so the ratio
  // between them — and therefore the constant speed — is preserved.
  const total = horizontalMs + verticalMs
  if (total > MAX_TOTAL_MS) {
    const scale = MAX_TOTAL_MS / total
    horizontalMs *= scale
    verticalMs *= scale
  }

  return {
    from,
    corner,
    to,
    horizontalMs,
    verticalMs,
    totalMs: horizontalMs + verticalMs,
  }
}

/** Has the walk finished? A zero-length walk is complete immediately. */
export function isWalkComplete(plan: WalkPlan, elapsedMs: number): boolean {
  return elapsedMs >= plan.totalMs
}

/**
 * Where the player is, `elapsedMs` into the plan.
 *
 * Clamped at both ends: a negative elapsed time returns the start, and anything
 * past the end returns the exact destination rather than overshooting it. That
 * exactness matters — the final frame must land on the entrance, not near it.
 */
export function walkPositionAt(plan: WalkPlan, elapsedMs: number): Point {
  if (elapsedMs <= 0) return plan.from
  if (elapsedMs >= plan.totalMs) return plan.to

  if (elapsedMs < plan.horizontalMs) {
    const t = plan.horizontalMs === 0 ? 1 : elapsedMs / plan.horizontalMs
    return { x: lerp(plan.from.x, plan.corner.x, t), y: plan.from.y }
  }

  const verticalElapsed = elapsedMs - plan.horizontalMs
  const t = plan.verticalMs === 0 ? 1 : verticalElapsed / plan.verticalMs
  return { x: plan.corner.x, y: lerp(plan.corner.y, plan.to.y, t) }
}

/** The player object in a layout, if there is one. */
export function findPlayer(layout: WorldLayout): WorldObject | null {
  return layout.objects.find((object) => object.kind === 'player') ?? null
}

/** The house standing for a given folder path, if it is on the map. */
export function findHouse(layout: WorldLayout, folderPath: string): WorldObject | null {
  return (
    layout.objects.find(
      (object) => object.kind === 'house' && object.folderPath === folderPath,
    ) ?? null
  )
}

/**
 * Plan a walk from the player's current position to a folder's house.
 *
 * Returns `null` when either end is missing — a folder with no house on the map,
 * for instance, which happens for any folder outside the largest three.
 */
export function planWalkToFolder(
  layout: WorldLayout,
  folderPath: string,
  currentPosition: Point | null,
): WalkPlan | null {
  const player = findPlayer(layout)
  const house = findHouse(layout, folderPath)
  if (!player || !house) return null

  const from = currentPosition ?? { x: player.bounds.x, y: player.bounds.y }
  const to = entranceFor(house.bounds, player.bounds.width, player.bounds.height, layout)
  return planWalk(from, to)
}
