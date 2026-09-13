import { useState, useSyncExternalStore } from 'react'
import repoJson from './mock-repo.json'
import type { RepoPayload } from './types'
import { getSnapshot, load, select, subscribe } from './state'
import { Tree } from './tree'
import { parseRepoScan } from './scene/parseRepoScan'
import WorldCanvas from './world/WorldCanvas'


/**
 * Application shell — two views of one repository.
 */
const payload = repoJson as unknown as RepoPayload

// Seed the single store with the raw payload. The tree walks this tree directly.
load(payload.repo, payload.root)

/**
 * The map's view of the same payload, built once at module scope.
 */
const scene = parseRepoScan(payload)

export default function App() {
  const state = useSyncExternalStore(subscribe, getSnapshot)
  const { announcement } = state
  const selectedName = state.selectedPath?.split('/').pop() ?? null

  // State to track the currently open file content for the preview modal
  const [activeFile, setActiveFile] = useState<{ name: string; content: string } | null>(null)

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">8-bit FM</h1>
        <p className="app__subtitle">
          A read-only file explorer that turns a folder into an explorable map.
        </p>
      </header>

      <main className="app__main">
        {/* Pass the file open handler down to Tree */}
        <div className="app__tree">
          <Tree onOpenFile={(name, content) => setActiveFile({ name, content })} />
        </div>

        <WorldCanvas scene={scene} selectedPath={state.selectedPath} onSelectPath={select} />
      </main>

      {/* File Preview Modal Overlay */}
      {activeFile && (
        <div className="file-modal-overlay" style={modalOverlayStyle}>
          <div className="file-modal" style={modalStyle}>
            <div style={modalHeaderStyle}>
              <h3>{activeFile.name}</h3>
              <button onClick={() => setActiveFile(null)} style={closeBtnStyle}>✕</button>
            </div>
            <pre style={preStyle}>{activeFile.content}</pre>
          </div>
        </div>
      )}

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

      <div role="status" aria-live="polite" className="sr-only">
        {announcement.nonce % 2 ? announcement.text + '\u00A0' : announcement.text}
      </div>
    </div>
  )
}

// Inline styles for the preview modal
const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
}
const modalStyle: React.CSSProperties = {
  backgroundColor: '#1e1e2e', color: '#cdd6f4', width: '70%', height: '70%',
  borderRadius: '8px', display: 'flex', flexDirection: 'column', border: '2px solid #45475a', overflow: 'hidden'
}
const modalHeaderStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: '#11111b'
}
const closeBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: '#cdd6f4', fontSize: '18px', cursor: 'pointer'
}
const preStyle: React.CSSProperties = {
  padding: '16px', margin: 0, overflow: 'auto', flex: 1, fontFamily: 'monospace', fontSize: '14px'
}