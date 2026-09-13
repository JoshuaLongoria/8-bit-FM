import { useEffect, useRef, useState } from 'react'
import type { RepositoryScene } from '../scene/sceneTypes'
import { loadWorldAssets, type LoadedAssets } from './assetLoader'
import { buildWorldLayout } from './mapLayout'
import { drawMap } from './drawMap'

interface WorldCanvasProps {
  readonly scene: RepositoryScene
}

interface Size {
  readonly width: number
  readonly height: number
}

/**
 * The visual map.
 *
 * ACCESSIBILITY BOUNDARY: this canvas is decorative and carries `aria-hidden`. A
 * canvas is a single opaque image to a screen reader, so exposing it would announce
 * nothing useful while getting in the way. Developer 3's HTML/ARIA tree is the
 * accessible route through the same data; this is the picture of it.
 *
 * The component owns only browser concerns — measuring, scaling, and when to
 * repaint. Where things go is `mapLayout.ts`, and how they look is `drawMap.ts`.
 */
export default function WorldCanvas({ scene }: WorldCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  const [assets, setAssets] = useState<LoadedAssets | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load and repaint the sheets once. The loader caches internally, so a remount
  // reuses the same prepared canvases rather than fetching again.
  useEffect(() => {
    let cancelled = false
    loadWorldAssets()
      .then((loaded) => {
        if (!cancelled) setAssets(loaded)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not load world assets.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Track the container's size. ResizeObserver fires for any cause — window
  // resize, sidebar opening, zoom — which a window 'resize' listener would miss.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      setSize((current) => {
        const next = { width: Math.floor(width), height: Math.floor(height) }
        // Skip no-op updates so we do not repaint on every sub-pixel jitter.
        return current.width === next.width && current.height === next.height ? current : next
      })
    })

    observer.observe(container)
    return () => {
      observer.disconnect()
    }
  }, [])

  // Repaint whenever the size, the data, or the loaded assets change.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !assets || size.width <= 0 || size.height <= 0) return

    // A CSS pixel is not always a device pixel: on a high-resolution display one
    // CSS pixel may be two or three real ones. Sizing the backing store by that
    // ratio and then scaling the context keeps the art crisp instead of doubled
    // and soft, while every coordinate below stays in CSS pixels.
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(size.width * dpr)
    canvas.height = Math.floor(size.height * dpr)
    canvas.style.width = `${size.width}px`
    canvas.style.height = `${size.height}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setError('This browser did not provide a 2D canvas context.')
      return
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.width, size.height)

    // One layout object, used here for drawing and — in the next phase — for hit
    // testing, so the picture and the click targets cannot disagree.
    const layout = buildWorldLayout(scene, size.width, size.height)
    drawMap(ctx, layout, assets)
  }, [assets, scene, size])

  return (
    <div className="world" ref={containerRef}>
      <canvas className="world__canvas" ref={canvasRef} aria-hidden="true" />
      {error ? (
        <p className="world__message world__message--error" role="status">
          {error}
        </p>
      ) : null}
      {!assets && !error ? (
        <p className="world__message" role="status">
          Loading map…
        </p>
      ) : null}
    </div>
  )
}
