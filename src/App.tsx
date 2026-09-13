/**
 * Application shell. Mounts the accessible tree and the scene placeholder,
 * and hosts the single aria-live region — everything routes through
 * announce() in state.ts rather than writing to the DOM directly.
 *
 * The region has no React key on purpose: a keyed element gets remounted and
 * arrives already populated, which screen readers usually don't announce. The
 * nonce varies the text instead.
 */

import repoJson from './mock-repo.json'
import type { RepoPayload } from './types'
import { Tree } from './tree'
import { useSyncExternalStore } from 'react'
import { subscribe, getSnapshot, load } from './state'

const payload = repoJson as unknown as RepoPayload
load(payload.repo, payload.root)



export default function App() {
  const { announcement } = useSyncExternalStore(subscribe, getSnapshot)

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">8-bit FM</h1>
        <p className="app__subtitle">
          A read-only file explorer that turns a folder into an 8-bit winter scene.
        </p>
      </header>

      <main className="app__main">
        <Tree />
        <div className="scene-placeholder">
          <p className="scene-placeholder__label">Scene placeholder</p>
          <p className="scene-placeholder__hint">The Canvas winter scene renders here.</p>
        </div>
      </main>
        <div role="status" aria-live="polite" className="sr-only">
      {announcement.nonce % 2 ? announcement.text + '\u00A0' : announcement.text}
    </div>
    </div>
  )
}
