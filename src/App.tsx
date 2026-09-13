import { useSyncExternalStore } from 'react'
import repoJson from './mock-repo.json'
import type { RepoPayload } from './types'
import { getSnapshot, load, select, subscribe } from './state'
import { Tree } from './tree'
import { parseRepoScan } from './scene/parseRepoScan'
import WorldCanvas from './world/WorldCanvas'

/**
 * Application shell — two views of one repository.
 *
 * The accessible tree and the visual map are the same data drawn two ways. Both
 * read their selection from `state.ts` and both report changes back to it, so
 * whichever one the user touches, the other follows.
 *
 * Still reading from the provisional mock fixture — no Tauri or backend calls
 * yet. When Developer 1's scanner lands it replaces `repoJson` here and nothing
 * downstream changes: the tree already consumes `RepoPayload`, and the map only
 * ever sees the `RepositoryScene` that `parseRepoScan` produces from it.
 */
const payload = repoJson as unknown as RepoPayload

// Seed the single store with the raw payload. The tree walks this tree directly.
load(payload.repo, payload.root)

/**
 * The map's view of the same payload, built once at module scope.
 *
 * Deliberately not computed during render: `WorldCanvas` memoises its layout on
 * the identity of this object, so rebuilding it every render would throw the
 * layout away on every keystroke and hover.
 */
const scene = parseRepoScan(payload)

export default function App() {
  /**
   * `state.ts` is the ONE selection owner.
   *
   * Both this component and `Tree` subscribe to it with `useSyncExternalStore`,
   * which is what makes the canvas and the tree agree: there is no second copy of
   * the selection anywhere to drift out of sync.
   */
  const state = useSyncExternalStore(subscribe, getSnapshot)

  // The selection may be any node in the tree — a nested folder or a file — not
  // just one of the top-level folders that get a house, so the display name comes
  // from the path itself rather than from a lookup that would miss most nodes.
  const selectedName = state.selectedPath?.split('/').pop() ?? null

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">8-bit FM</h1>
        <p className="app__subtitle">
          A read-only file explorer that turns a folder into an explorable map.
        </p>
      </header>

      <main className="app__main">
        {/* Developer 3's accessible tree: the keyboard and screen-reader route. */}
        <div className="app__tree">
          <Tree />
        </div>

        {/*
          The visual map. `aria-hidden` inside, and driven by the same store —
          `select` accepts `null`, so clicking empty grass clears the selection.
        */}
        <WorldCanvas scene={scene} selectedPath={state.selectedPath} onSelectPath={select} />
      </main>

      {/*
        The status line is ordinary HTML outside the aria-hidden canvas, so the
        selection is announced to assistive technology even though the picture
        itself is not. `aria-live` reports changes without stealing focus.
      */}
      <footer className="app__footer">
        <p className="app__status" role="status" aria-live="polite">
          {state.selectedPath ? (
            <>
              <span className="app__status-label">Selected</span>
              <span className="app__status-value">{selectedName}</span>
              <span className="app__status-path">{state.selectedPath}</span>
            </>
          ) : (
            <span className="app__status-empty">No folder selected</span>
          )}
        </p>
        <span className="app__meta">{scene.repositoryName}</span>
        {scene.git ? (
          <span className="app__meta">
            branch {scene.git.branch}
            {scene.git.dirty ? ' · uncommitted changes' : ''}
          </span>
        ) : null}
        <span className="app__meta">{scene.folders.length} folders</span>
      </footer>
    </div>
  )
}
