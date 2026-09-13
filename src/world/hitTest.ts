/**
 * Working out what the pointer is over.
 *
 * Like `mapLayout.ts`, this module is PURE: no React, no canvas, no DOM types. It
 * reads the rectangles the layout already produced — it never recomputes a
 * position of its own. That is the whole point: `drawMap.ts` draws a house from
 * `object.bounds`, and this file tests clicks against the very same `object.bounds`,
 * so the picture and the click targets cannot drift apart.
 *
 * Being DOM-free also means it can be checked with plain assertions in Node,
 * without a browser or a test framework.
 */
import type { PixelBounds, WorldLayout } from './worldTypes'

/** A point in logical canvas space (CSS pixels, matching the layout). */
export interface CanvasPoint {
  readonly x: number
  readonly y: number
}

/**
 * The parts of a `DOMRect` we need.
 *
 * Declared structurally rather than importing `DOMRect` so this file stays free of
 * DOM types and remains testable outside a browser. A real `DOMRect` satisfies it.
 */
export interface ElementRect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** Is a point inside a rectangle? Left/top edges count, right/bottom do not. */
export function containsPoint(bounds: PixelBounds, point: CanvasPoint): boolean {
  return (
    point.x >= bounds.x &&
    point.x < bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y < bounds.y + bounds.height
  )
}

/**
 * Convert a browser pointer position into logical canvas coordinates.
 *
 * A pointer event reports `clientX`/`clientY` relative to the viewport. Three
 * things stand between that and the coordinates the layout uses:
 *
 * 1. The canvas is somewhere on the page, so subtract the element's top-left.
 * 2. The element's displayed size may not equal the layout's size — browser zoom,
 *    a CSS transform, or a stale measurement can all stretch it — so scale by
 *    `layout.widthPx / rect.width` rather than assuming they match.
 * 3. Device pixel ratio must NOT appear here. The drawing context is already
 *    scaled by `ctx.setTransform(dpr, ...)`, which means every coordinate the
 *    layout and the drawing code use is a CSS pixel. Multiplying by the ratio
 *    again — for instance by using `canvas.width`, which is in device pixels —
 *    would apply it twice and put every hit target at roughly half position on a
 *    retina display.
 *
 * Because the scale is derived from the live `rect` on every event, the result
 * stays correct after a resize without any extra bookkeeping.
 *
 * Returns `null` for a degenerate rect, which a hidden or unmeasured element can
 * report, rather than dividing by zero.
 */
export function toCanvasPoint(
  clientX: number,
  clientY: number,
  rect: ElementRect,
  layout: Pick<WorldLayout, 'widthPx' | 'heightPx'>,
): CanvasPoint | null {
  if (rect.width <= 0 || rect.height <= 0) {
    return null
  }
  return {
    x: (clientX - rect.left) * (layout.widthPx / rect.width),
    y: (clientY - rect.top) * (layout.heightPx / rect.height),
  }
}

/**
 * What the pointer is over, as a typed result.
 *
 * Replaces the earlier arrangement where the Poké Center was signalled by
 * returning a sentinel string in the same slot as a folder path. A sentinel is
 * indistinguishable from a real path to the type system, so nothing stopped it
 * being stored as a selection or compared against tree node paths. Worse, the old
 * check returned it for *every* non-house object, which meant clicking a tree or
 * the player opened the directory picker. The two outcomes are genuinely
 * different kinds of thing, so they are now different shapes — and scenery is
 * neither.
 */
export type MapHit =
  | { readonly kind: 'folder'; readonly path: string }
  | { readonly kind: 'repository' }
  | null

/**
 * Find what is under a point.
 *
 * Interactive: folder houses (a folder) and the Poké Center (the repository as a
 * whole). Everything else — trees, the player, paths, labels, grass, empty
 * space — produces `null`, and a click there clears the selection.
 *
 * Objects are tested in REVERSE of draw order. `layout.objects` is ordered
 * back-to-front for painting, so walking backwards means the first hit found is
 * the one drawn on top, which is the one the user can actually see.
 *
 * Non-interactive objects are transparent rather than blocking: the loop skips
 * them and keeps looking underneath. That matters now the player moves — it comes
 * to rest against a house, and a player that swallowed clicks would make the very
 * house it is standing at unclickable.
 */
export function hitTestMap(layout: WorldLayout, point: CanvasPoint | null): MapHit {
  if (!point) {
    return null
  }
  for (let i = layout.objects.length - 1; i >= 0; i--) {
    const object = layout.objects[i]
    if (!object || !containsPoint(object.bounds, point)) {
      continue
    }
    if (object.kind === 'house' && object.folderPath !== null) {
      return { kind: 'folder', path: object.folderPath }
    }
    if (object.kind === 'pokeCenter') {
      return { kind: 'repository' }
    }
    // Trees, the player, and anything else: scenery. Keep looking underneath.
  }
  return null
}

/**
 * Convenience for pointer handlers: convert and hit-test in one step.
 */
export function mapHitAtClientPoint(
  clientX: number,
  clientY: number,
  rect: ElementRect,
  layout: WorldLayout,
): MapHit {
  return hitTestMap(layout, toCanvasPoint(clientX, clientY, rect, layout))
}

/** The folder path from a hit, or `null` for the repository and for misses. */
export function folderPathOf(hit: MapHit): string | null {
  return hit !== null && hit.kind === 'folder' ? hit.path : null
}
