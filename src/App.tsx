/**
 * Phase 1 shell: application name, subtitle, and an empty box reserving the
 * space where the Canvas winter scene will live (Phase 4).
 *
 * Intentionally absent until their own phases: Canvas, sprites, animation,
 * mock data, shared state, and Developer 3's accessible file tree.
 */
export default function App() {
  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">8-bit FM</h1>
        <p className="app__subtitle">
          A read-only file explorer that turns a folder into an 8-bit winter scene.
        </p>
      </header>

      <main className="app__main">
        <div className="scene-placeholder">
          <p className="scene-placeholder__label">Scene placeholder</p>
          <p className="scene-placeholder__hint">The Canvas winter scene renders here.</p>
        </div>
      </main>
    </div>
  )
}
