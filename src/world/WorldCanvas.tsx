import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { RepositoryScene } from '../scene/sceneTypes'
import { announce } from '../state'
import { loadWorldAssets, type LoadedAssets } from './assetLoader'
import { buildWorldLayout } from './mapLayout'
import { drawMap } from './drawMap'
import { folderAtClientPoint } from './hitTest'


/**Impelementation for PC folder picker */
import { open } from '@tauri-apps/plugin-dialog';
import{invoke} from '@tauri-apps/api/core';
import{load} from '../state'
import type{RepoPayload} from '../types'

// 1. Place the helper function here (outside the component)
function normalizeNode(node: any): any {
  if (!node) return node;
  return {
    ...node,
    path: typeof node.path === 'string' ? node.path.replace(/\\/g, '/') : node.path,
    root: typeof node.root === 'string' ? node.root.replace(/\\/g, '/') : node.root,
    children: Array.isArray(node.children) ? node.children.map(normalizeNode) : node.children,
  };
}


import { mapHitAtClientPoint, folderPathOf } from './hitTest'
import {
  isWalkComplete,
  planWalkToFolder,
  walkPositionAt,
  type Point,
  type WalkPlan,
} from './playerWalk'

interface WorldCanvasProps {
  readonly scene: RepositoryScene
  /**
   * The currently selected folder path, or `null`.
   *
   * This component is CONTROLLED: it never stores the selection itself, never
   * talks to Tauri, and never writes to the shared store. It renders what it is
   * given and reports what the user did through the callbacks below.
   */
  readonly selectedPath: string | null
  /** Empty ground reports `null`, which clears the selection. */
  readonly onSelectPath: (path: string | null) => void
  /** The player has arrived at this folder's house: open it. */
  readonly onActivateFolder: (path: string) => void
  /** The Poké Center was clicked: choose a different repository. */
  readonly onChooseRepository: () => void
}

interface Size {
  readonly width: number
  readonly height: number
}

/** Does the user want animation suppressed? Read live, not cached at mount. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * The visual map.
 *
 * ACCESSIBILITY BOUNDARY: this canvas is decorative and carries `aria-hidden`. A
 * canvas is a single opaque image to a screen reader, so exposing it would announce
 * nothing useful while getting in the way. It takes no keyboard focus and contains
 * no controls; the pointer handlers below are a mouse convenience layered on top of
 * the picture. The accessible tree is the route to the same actions, driven by the
 * same store. Nothing here is its own live region — messages go through the shared
 * `announce()`.
 *
 * The component owns only browser concerns — measuring, scaling, pointer events,
 * the animation clock, and when to repaint. Where things go is `mapLayout.ts`,
 * what is under the pointer is `hitTest.ts`, how far along a walk is
 * `playerWalk.ts`, and how it all looks is `drawMap.ts`.
 */
export default function WorldCanvas({
  scene,
  selectedPath,
  onSelectPath,
  onActivateFolder,
  onChooseRepository,
}: WorldCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  const [assets, setAssets] = useState<LoadedAssets | null>(null)
  const [error, setError] = useState<string | null>(null)

  /**
   * Hover is local on purpose. It changes on every mouse move, and pushing that
   * through the shared store would re-render the tree continuously for something
   * only the picture cares about. Selection is the shared value; hover is not.
   */
  const [hoveredPath, setHoveredPath] = useState<string | null>(null)

  /**
   * Walk state lives in refs, not React state.
   *
   * The animation updates roughly sixty times a second. Through `useState` that
   * would be sixty renders a second of the whole map for a change only the
   * canvas cares about. Refs let the loop paint directly.
   */
  const frameRef = useRef<number | null>(null)
  const playerPositionRef = useRef<Point | null>(null)

  /**
   * The activation callback, mirrored into a ref.
   *
   * The animation loop is started once per click and runs across renders. Reading
   * the prop through a ref means a walk that finishes after a re-render calls the
   * current callback, not the one captured when the walk began.
   */
  const onActivateFolderRef = useRef(onActivateFolder)
  useEffect(() => {
    onActivateFolderRef.current = onActivateFolder
  }, [onActivateFolder])

  // Load and repaint the sheets once. The loader caches internally, so a remount
  // reuses the same prepared canvases rather than fetching again.
  useEffect(() => {
    let cancelled = false
    loadWorldAssets()
      .then((loaded) => {
        if (!cancelled) setAssets(loaded)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        const message = cause instanceof Error ? cause.message : 'Could not load world assets.'
        setError(message)
        // Through the one shared live region rather than a second one here.
        announce(`Map could not be loaded. ${message}`)
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
   * The single layout, shared by drawing, hit testing and walk planning.
   *
   * Memoised on the data and the size alone, so neither moving the pointer nor
   * animating rebuilds it — and, more importantly, so the rectangles a click is
   * tested against are the exact ones that were drawn.
   */
  const layout = useMemo(
    () => buildWorldLayout(scene, Math.max(1, size.width), Math.max(1, size.height)),
    [scene, size.width, size.height],
  )

  /** Stop any walk in progress. Safe to call when nothing is running. */
  const cancelWalk = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [])

  /** Paint one frame from the current layout, highlight and player position. */
  const paint = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !assets || size.width <= 0 || size.height <= 0) return

    // A CSS pixel is not always a device pixel: on a high-resolution display one
    // CSS pixel may be two or three real ones. Sizing the backing store by that
    // ratio and then scaling the context keeps the art crisp instead of doubled
    // and soft, while every coordinate stays in CSS pixels — which is also why
    // hit testing must not apply the ratio a second time.
    const dpr = window.devicePixelRatio || 1
    const backingWidth = Math.floor(size.width * dpr)
    const backingHeight = Math.floor(size.height * dpr)

    // Only resize the backing store when it actually changed: assigning to
    // canvas.width clears the canvas, and doing that every animation frame
    // would throw away the frame we are about to draw.
    if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
      canvas.width = backingWidth
      canvas.height = backingHeight
      canvas.style.width = `${size.width}px`
      canvas.style.height = `${size.height}px`
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setError('This browser did not provide a 2D canvas context.')
      return
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.width, size.height)
    drawMap(ctx, layout, assets, {
      hoveredPath,
      selectedPath,
      playerPosition: playerPositionRef.current,
    })
  }, [assets, layout, size, hoveredPath, selectedPath])

  // Repaint whenever the picture or the highlighting changes.
  useEffect(() => {
    paint()
  }, [paint])

  /**
   * Reset the walk whenever the world underneath it changes.
   *
   * A position from the old layout is meaningless in the new one — after a resize
   * or a new repository the player would be left standing at coordinates that no
   * longer correspond to anything. Cancelling and clearing returns it to wherever
   * the fresh layout puts it.
   */
  useEffect(() => {
    cancelWalk()
    playerPositionRef.current = null
  }, [layout, cancelWalk])

  // Never leave a frame scheduled after unmount.
  useEffect(() => cancelWalk, [cancelWalk])

  /**
   * Walk the player to a folder's house, then activate the folder.
   *
   * Any walk already running is cancelled first, so clicking a second house
   * redirects the player from wherever it currently is instead of starting two
   * loops that fight over the same position.
   */
  const walkToFolder = useCallback(
    (path: string) => {
      cancelWalk()

      const plan: WalkPlan | null = planWalkToFolder(layout, path, playerPositionRef.current)
      if (!plan) {
        // No house for this folder — it is outside the largest three, or the map
        // has not been measured yet. Activate straight away so the tree still
        // opens; the map simply has nothing to show walking.
        onActivateFolderRef.current(path)
        return
      }

      // Reduced motion: no in-between frames at all. Land on the destination and
      // open the folder immediately, so the outcome is identical and only the
      // travel is skipped.
      if (prefersReducedMotion()) {
        playerPositionRef.current = plan.to
        paint()
        onActivateFolderRef.current(path)
        return
      }

      const startedAt = performance.now()
      const step = () => {
        const elapsed = performance.now() - startedAt
        playerPositionRef.current = walkPositionAt(plan, elapsed)
        paint()

        if (isWalkComplete(plan, elapsed)) {
          frameRef.current = null
          // Snap to the exact destination: the last frame may have landed a
          // fraction short of it.
          playerPositionRef.current = plan.to
          onActivateFolderRef.current(path)
          return
        }
        frameRef.current = requestAnimationFrame(step)
      }
      frameRef.current = requestAnimationFrame(step)
    },
    [cancelWalk, layout, paint],
  )

  /** What sits under a pointer event. */
  const hitAtEvent = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return null
      // Measured fresh on every event, so the mapping is automatically correct
      // after a resize, a scroll, or a zoom without any cached state.
      return mapHitAtClientPoint(event.clientX, event.clientY, canvas.getBoundingClientRect(), layout)
    },
    [layout],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const path = folderPathOf(hitAtEvent(event))
      // Only update on a real change, so an idle sweep across one roof does not
      // trigger a repaint per pixel.
      setHoveredPath((current) => (current === path ? current : path))
    },
    [hitAtEvent],
  )

  const handlePointerLeave = useCallback(() => {
    setHoveredPath(null)
  }, [])

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      // Ignore anything but the primary button; a right-click should not select.
      if (event.button !== 0) return

      const hit = hitAtEvent(event)

      if(clickedPath === '__PC_HOUSE__'){
        try{
          const selectedDirectory = await open({
            directory: true,
            multiple: false
          })

          if(selectedDirectory && typeof selectedDirectory === 'string'){
            console.log('DEBUG: Selected Directory ->', selectedDirectory)

            // Scan that directory using the registered Rust command 'walk_repo'
            const newPayload = await invoke<RepoPayload>('walk_repo', { path: selectedDirectory })
            console.log('DEBUG: walk_repo Payload ->', newPayload)

            const payloadAny = newPayload as any;
            const normalizedNode = normalizeNode(payloadAny.node);
            
            load(newPayload.repo, normalizedNode);
          }
        }catch(err){
          console.error('Failed to pick directory:', err)
        }
      if (hit === null) {
        // Grass, a tree, a path, the player: not a target. Clear the selection.
        onSelectPath(null)
        return
      }

      if (hit.kind === 'repository') {
        onChooseRepository()
        return
      }

      
      // Clicking empty ground reports `null`, which clears the selection.
      onSelectPath(clickedPath)

      // Selection is immediate; opening the folder waits for the player to arrive.
      onSelectPath(hit.path)
      walkToFolder(hit.path)
    },
    [hitAtEvent, onChooseRepository, onSelectPath, walkToFolder],
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
      {/*
        Visible messages only. Deliberately NOT role="status": there is exactly
        one live region in the app, in App.tsx, and anything worth announcing is
        sent there through announce().
      */}
      {error ? <p className="world__message world__message--error">{error}</p> : null}
      {!assets && !error ? <p className="world__message">Loading map…</p> : null}
    </div>
  )
}