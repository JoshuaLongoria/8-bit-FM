import { useState } from 'react'
import { mockRepository } from './fixtures/mockRepository'
import WorldCanvas from './world/WorldCanvas'

/**
 * Application shell.
 *
 * Still reading from the provisional mock fixture — no Tauri or backend calls yet.
 * When Developer 1's scanner lands, the adapter swaps in here and nothing below
 * this line needs to change, because `WorldCanvas` only ever sees a
 * `RepositoryScene`.
 */
export default function App() {
  const scene = mockRepository

  /**
   * TEMPORARY OWNER OF THE SELECTION.
   *
   * Developer 3's shared store will replace this `useState`. It lives here — above
   * the map rather than inside it — precisely so that swap is a small one: the
   * accessible tree and the canvas both need to read the same `selectedPath` and
   * report changes the same way, and a selection kept inside `WorldCanvas` could
   * never be shared with the tree.
   *
   * Deliberately NOT a second store: when the shared one arrives, these two lines
   * are deleted and the same two props are wired to it. Nothing else changes.
   */
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  const selectedFolder = scene.folders.find((folder) => folder.path === selectedPath) ?? null

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">8-bit FM</h1>
        <p className="app__subtitle">
          A read-only file explorer that turns a folder into an explorable map.
        </p>
      </header>

      <main className="app__main">
        <WorldCanvas scene={scene} selectedPath={selectedPath} onSelectPath={setSelectedPath} />
      </main>

      {/*
        The status line is ordinary HTML outside the aria-hidden canvas, so the
        selection is announced to assistive technology even though the picture
        itself is not. `aria-live` reports changes without stealing focus.
      */}
      <footer className="app__footer">
        <p className="app__status" role="status" aria-live="polite">
          {selectedFolder ? (
            <>
              <span className="app__status-label">Selected</span>
              <span className="app__status-value">{selectedFolder.name}</span>
              <span className="app__status-path">{selectedFolder.path}</span>
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
