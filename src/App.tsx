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

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">8-bit FM</h1>
        <p className="app__subtitle">
          A read-only file explorer that turns a folder into an explorable map.
        </p>
      </header>

      <main className="app__main">
        <WorldCanvas scene={scene} />
      </main>

      <footer className="app__footer">
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
