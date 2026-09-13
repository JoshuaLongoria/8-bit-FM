import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { RepositoryScene } from '../scene/sceneTypes'
import { loadWorldAssets, type LoadedAssets } from './assetLoader'
import { buildWorldLayout } from './mapLayout'
import { drawMap } from './drawMap'
import { folderAtClientPoint } from './hitTest'

interface WorldCanvasProps {
  readonly scene: RepositoryScene
  /**
   * The currently selected folder path, or `null`.
   *
   * This component is CONTROLLED: it never stores the selection itself, it only
   * renders what it is given and reports what the user did. That is what will let
   * Developer 3's accessible tree and this map show the same selection — both
   * read one value from one owner above them.
   */
  readonly selectedPath: string | null
  /** Called with the clicked folder's path, or `null` when empty ground is clicked. */
  readonly onSelectPath: (path: string | null) => void
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
 * nothing useful while getting in the way. It takes no keyboard focus and contains
 * no controls; the pointer handlers below are a mouse convenience layered on top of
 * the picture. Developer 3's HTML/ARIA tree is the accessible route to the same
 * selection, driven by the same `selectedPath`/`onSelectPath` pair.
 *
 * The component owns only browser concerns — measuring, scaling, pointer events and
 * when to repaint. Where things go is `mapLayout.ts`, what is under the pointer is
 * `hitTest.ts`, and how it all looks is `drawMap.ts`.
 */
export default function WorldCanvas({ scene, selectedPath, onSelectPath }: WorldCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  const [assets, setAssets] = useState<LoadedAssets | null>(null)
  const [error, setError] = useState<string | null>(null)

  /**
   * Hover is local on purpose. It changes on every mouse move, and pushing that
   * through the shared store would re-render Developer 3's tree continuously for
   * something only the picture cares about. Selection is the shared value; hover
   * is not.
   */
  const [hoveredPath, setHoveredPath] = useState<string | null>(null)

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

  /**
   * The single layout, shared by drawing and hit testing.
   *
   * Memoised on the data and the size alone, so moving the pointer does not
   * rebuild it — and, more importantly, so the rectangles a click is tested
   * against are the exact ones that were drawn.
   */
  const layout = useMemo(
    () => buildWorldLayout(scene, Math.max(1, size.width), Math.max(1, size.height)),
    [scene, size.width, size.height],
  )

  // Repaint whenever the picture or the highlighting changes.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !assets || size.width <= 0 || size.height <= 0) return

    // A CSS pixel is not always a device pixel: on a high-resolution display one
    // CSS pixel may be two or three real ones. Sizing the backing store by that
    // ratio and then scaling the context keeps the art crisp instead of doubled
    // and soft, while every coordinate below stays in CSS pixels — which is also
    // why hit testing must not apply the ratio a second time.
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
    drawMap(ctx, layout, assets, { hoveredPath, selectedPath })
  }, [assets, layout, size, hoveredPath, selectedPath])

  /** Which folder, if any, sits under a pointer event. */
  const folderAtEvent = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>): string | null => {
      const canvas = canvasRef.current
      if (!canvas) return null
      // Measured fresh on every event, so the mapping is automatically correct
      // after a resize, a scroll, or a zoom without any cached state.
      return folderAtClientPoint(
        event.clientX,
        event.clientY,
        canvas.getBoundingClientRect(),
        layout,
      )
    },
    [layout],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const path = folderAtEvent(event)
      // Only update on a real change, so an idle sweep across one roof does not
      // trigger a repaint per pixel.
      setHoveredPath((current) => (current === path ? current : path))
    },
    [folderAtEvent],
  )

  const handlePointerLeave = useCallback(() => {
    setHoveredPath(null)
  }, [])

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      // Ignore anything but the primary button; a right-click should not select.
      if (event.button !== 0) return
      // Clicking empty ground reports `null`, which clears the selection.
      onSelectPath(folderAtEvent(event))
    },
    [folderAtEvent, onSelectPath],
  )

  return (
    <div className="world" ref={containerRef}>
      <canvas
        className={`world__canvas${hoveredPath ? ' world__canvas--over-folder' : ''}`}
        ref={canvasRef}
        aria-hidden="true"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerDown}
      />
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
