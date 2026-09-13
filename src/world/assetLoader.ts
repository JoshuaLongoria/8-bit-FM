/**
 * Loads the imported sheets once, repaints them, and caches the result.
 *
 * WHY REPAINTING IS NEEDED
 * The pokeemerald tilesets are stored as greyscale shapes; their real colours live
 * in separate `.pal` palette files which we have deliberately not imported. Drawing
 * the sheets as-is would produce a grey map. So at load time we match each pixel's
 * grey back to its palette index and paint it with a colour from
 * `tileCatalog.ts`. That is the same pairing of "tile data" with "palette" that
 * pokeemerald's `src/tilesets.c` performs on hardware — done once, in software.
 *
 * The Brendan sprite sheet is the exception: it already carries real colours, so it
 * is only made transparent, never repainted.
 *
 * WHY IT IS CACHED
 * Repainting means reading and rewriting every pixel, which is far too slow to do
 * per frame. Each sheet/palette pairing is prepared once into an offscreen canvas
 * and reused for the lifetime of the page. Canvas can draw from another canvas just
 * as happily as from an image.
 */
import {
  BRENDAN_TRANSPARENT,
  GREY_LEVELS,
  PALETTES,
  REQUIRED_VARIANTS,
  SHEET_URLS,
  variantKey,
} from './tileCatalog'
import type { PaletteId, SheetId, TileSprite } from './worldTypes'

/** Every repainted sheet, keyed by `"<sheet>:<palette>"`. */
export type LoadedAssets = ReadonlyMap<string, HTMLCanvasElement>

/** Look up the repainted sheet a sprite needs. */
export function sheetFor(assets: LoadedAssets, sprite: TileSprite): HTMLCanvasElement | undefined {
  return assets.get(variantKey(sprite.sheet, sprite.palette))
}

/** Load one image and wait for it to decode. */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      resolve(image)
    }
    image.onerror = () => {
      reject(new Error(`Could not load world asset: ${url}`))
    }
    image.src = url
  })
}

/** Create an offscreen canvas and its 2D context, or throw with a clear message. */
function makeCanvas(width: number, height: number): {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
} {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  // `willReadFrequently` tells the browser we are about to read pixels back, which
  // keeps the surface in main memory instead of on the GPU.
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    throw new Error('Could not create a 2D canvas context for world assets.')
  }
  return { canvas, ctx }
}

/**
 * Map any grey value (0-255) to its index in the 16-step pokeemerald ramp.
 *
 * Built once as a 256-entry table so the per-pixel loop does a single array lookup
 * rather than searching the ramp for every pixel.
 */
const GREY_TO_INDEX: readonly number[] = (() => {
  const table: number[] = []
  for (let value = 0; value < 256; value++) {
    let best = 0
    let bestDistance = Number.POSITIVE_INFINITY
    for (let i = 0; i < GREY_LEVELS.length; i++) {
      const level = GREY_LEVELS[i]
      if (level === undefined) continue
      const distance = Math.abs(level - value)
      if (distance < bestDistance) {
        bestDistance = distance
        best = i
      }
    }
    table.push(best)
  }
  return table
})()

/**
 * Repaint a greyscale sheet with a colour ramp.
 *
 * Palette index 0 is the transparency key in every pokeemerald tileset — it is the
 * backdrop the hardware never draws — so those pixels become fully transparent
 * rather than white.
 */
function repaintGreyscale(image: HTMLImageElement, palette: Exclude<PaletteId, 'none'>): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(image.width, image.height)
  ctx.drawImage(image, 0, 0)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const pixels = imageData.data
  const ramp = PALETTES[palette]

  for (let i = 0; i < pixels.length; i += 4) {
    const grey = pixels[i] ?? 0
    const index = GREY_TO_INDEX[grey] ?? 0
    if (index === 0) {
      pixels[i + 3] = 0 // transparency key
      continue
    }
    const colour = ramp[index]
    if (!colour) continue
    pixels[i] = colour[0]
    pixels[i + 1] = colour[1]
    pixels[i + 2] = colour[2]
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas
}

/**
 * Keep an already-coloured sheet as it is, but knock out its key colour.
 *
 * The Brendan sheet uses a flat green as its backdrop; without this the sprite
 * would be drawn inside a green rectangle.
 */
function keyOutBackdrop(image: HTMLImageElement): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(image.width, image.height)
  ctx.drawImage(image, 0, 0)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const pixels = imageData.data
  const [kr, kg, kb] = BRENDAN_TRANSPARENT

  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] === kr && pixels[i + 1] === kg && pixels[i + 2] === kb) {
      pixels[i + 3] = 0
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas
}

/**
 * Module-level cache. The first caller starts the work; every later caller — a
 * remount, a second canvas — receives the very same promise and the very same
 * canvases. Images are never re-fetched or repainted.
 */
let cache: Promise<LoadedAssets> | null = null

export function loadWorldAssets(): Promise<LoadedAssets> {
  if (!cache) {
    cache = buildAssets()
  }
  return cache
}

async function buildAssets(): Promise<LoadedAssets> {
  // `BASE_URL` keeps the paths correct if the app is ever served from a
  // subdirectory rather than the site root.
  const base = import.meta.env.BASE_URL
  const sheetIds: readonly SheetId[] = ['general', 'petalburg', 'brendan']

  const images = new Map<SheetId, HTMLImageElement>()
  await Promise.all(
    sheetIds.map(async (id) => {
      images.set(id, await loadImage(`${base}${SHEET_URLS[id]}`))
    }),
  )

  const variants = new Map<string, HTMLCanvasElement>()
  for (const sprite of REQUIRED_VARIANTS) {
    const key = variantKey(sprite.sheet, sprite.palette)
    if (variants.has(key)) {
      continue // this sheet/palette pairing is already prepared
    }
    const image = images.get(sprite.sheet)
    if (!image) {
      throw new Error(`Missing sheet for sprite: ${sprite.sheet}`)
    }
    variants.set(
      key,
      sprite.palette === 'none' ? keyOutBackdrop(image) : repaintGreyscale(image, sprite.palette),
    )
  }

  return variants
}
