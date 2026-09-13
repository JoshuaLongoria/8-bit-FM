import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import { invoke } from '@tauri-apps/api/core'
import repoJson from './mock-repo.json'
import type { RepoPayload } from './types'
import { announce, expand, getSnapshot, load, select, subscribe } from './state'
import { Tree } from './tree'
import { parseRepoScan } from './scene/parseRepoScan'
import { parseRepoTree } from './repoTree'
import { findDirectoryByPath } from './findNode'
import {
  fileDialogFor,
  folderDialogFor,
  visibleDialog,
  type ActiveDialog,
} from './dialogState'
import type { RepositoryScene } from './scene/sceneTypes'
import WorldCanvas from './world/WorldCanvas'
import Dialog from './Dialog'
import FolderDetails from './FolderDetails'

/**
 * Application shell — two views of one repository.
 *
 * The accessible tree and the visual map are the same data drawn two ways. Both
 * read from `state.ts` and both report back to it, so whichever one the user
 * touches, the other follows.
 *
 * This component owns every side effect: Tauri commands, the shared store, which
 * dialog is open, and the single live region. `WorldCanvas` stays a controlled
 * presentation component that only reports what the user did — it never receives
 * the repository tree.
 */
const payload = repoJson as unknown as RepoPayload

// Seed the store with the bundled fixture so there is something to look at
// before any real directory is chosen.
load(payload.repo, payload.root)

/** Shown while the store is empty — a real, valid, entirely blank scene. */
const EMPTY_SCENE: RepositoryScene = {
  repositoryName: '',
  currentPath: '',
  folders: [],
  indicators: { hasReadme: false, hasGitignore: false, hasWorkflows: false, configFileCount: 0 },
  git: null,
  scan: { truncated: false, warning: null },
}

export default function App() {
  /**
   * `state.ts` is the ONE owner of selection, expansion and announcements. Both
   * this component and `Tree` subscribe with `useSyncExternalStore`, which is
   * what keeps the canvas and the tree in agreement.
   */
  const state = useSyncExternalStore(subscribe, getSnapshot)
  const { announcement } = state

  const [dialog, setDialog] = useState<ActiveDialog>(null)
  const [busy, setBusy] = useState(false)

  /**
   * The map's view of whatever is in the store RIGHT NOW.
   *
   * Derived from `state.repo`/`state.tree` rather than the module-scope fixture,
   * which is what makes choosing a new directory update the map as well as the
   * tree. Memoised so the identity only changes when the repository does —
   * `WorldCanvas` memoises its layout on this object, and a fresh one per render
   * would rebuild the layout constantly and reset the player mid-walk.
   */
  const scene = useMemo<RepositoryScene>(
    () =>
      state.repo && state.tree ? parseRepoScan({ repo: state.repo, root: state.tree }) : EMPTY_SCENE,
    [state.repo, state.tree],
  )

  /**
   * What should actually render, derived from the stored state and the CURRENT
   * tree.
   *
   * This is how a dialog closes itself when new repository data no longer
   * contains its path: rendering is derived from the lookup, so a path that stops
   * resolving stops being shown. Correcting it afterwards with an effect that
   * called setState would render the stale dialog for one frame first, then
   * re-render to remove it.
   */
  const shown = useMemo(() => visibleDialog(dialog, state.tree), [dialog, state.tree])

  /** The directory the folder dialog is showing, or `null`. */
  const folderNode = useMemo(
    () => (shown?.kind === 'folder' ? findDirectoryByPath(state.tree, shown.path) : null),
    [shown, state.tree],
  )

  // The selection may be any node in the tree — a nested folder or a file — not
  // just one of the top-level folders that get a house, so the display name comes
  // from the path itself rather than a lookup that would miss most nodes.
  const selectedName = state.selectedPath?.split('/').pop() ?? null

  /**
   * The player reached a house. Open that folder, in both senses.
   *
   * `expand` and not `toggle`: arriving at a house means "show me what is in
   * here", so clicking a house whose folder is already open must leave it open.
   *
   * `WorldCanvas` only calls this once movement has finished — and only for the
   * newest destination, because starting a second walk cancels the first before
   * it can report. So an interrupted walk never opens a dialog.
   */
  const handleArriveFolder = useCallback((path: string) => {
    expand(path)

    // Resolved at the moment of arrival rather than when the walk began: the
    // dialog is for directories only, and the repository may have been replaced
    // while the player was walking. `folderDialogFor` returns null for a file or
    // a missing path, so nothing opens in those cases.
    const next = folderDialogFor(getSnapshot().tree, path)
    if (next) {
      // Opening folder details replaces any file preview: one dialog at a time.
      setDialog(next)
    }
  }, [])

  /**
   * Choose a directory and load it into both interfaces.
   *
   * `pick_directory` returns the chosen path or null when the dialog is
   * cancelled; `walk_repo` then scans it. The response crosses the process
   * boundary as `unknown` and is validated by `parseRepoTree` before anything
   * else sees it.
   */
  const handleChooseRepository = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      const picked = await invoke<string | null>('pick_directory')
      if (!picked) {
        // Cancelled: leave the current repository exactly as it was.
        return
      }

      announce('Scanning folder…')
      const response: unknown = await invoke('walk_repo', { path: picked })
      const next = parseRepoTree(response)

      // Any open dialog belongs to the previous repository.
      setDialog(null)
      // One call, so the tree and the map switch together in a single update.
      load(next.repo, next.root)
      announce(`Loaded ${next.repo.name}`)
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : String(cause)
      announce(`Could not open that folder. ${message}`)
    } finally {
      setBusy(false)
    }
  }, [busy])

  const closeDialog = useCallback(() => {
    setDialog(null)
  }, [])

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">8-bit FM</h1>
        <p className="app__subtitle">
          A read-only file explorer that turns a folder into an explorable map.
        </p>
      </header>

      <main className="app__main">
        {/* The accessible tree: the keyboard and screen-reader route. */}
        <div className="app__tree">
          <Tree
            onOpenFile={(name, content) => {
              // Opening a file preview replaces any folder details.
              setDialog(fileDialogFor(name, content))
            }}
          />
        </div>

        <WorldCanvas
          scene={scene}
          selectedPath={state.selectedPath}
          onSelectPath={select}
          onActivateFolder={handleArriveFolder}
          onChooseRepository={() => {
            void handleChooseRepository()
          }}
        />
      </main>

      {shown?.kind === 'file' ? (
        <Dialog
          title={shown.name}
          closeLabel={`Close preview of ${shown.name}`}
          onClose={closeDialog}
          className="dialog--file"
        >
          {/* Read-only by construction: <pre> renders text, it never edits it. */}
          <pre className="file-preview__content" tabIndex={0}>
            {shown.content}
          </pre>
        </Dialog>
      ) : null}

      {folderNode ? <FolderDetails node={folderNode} onClose={closeDialog} /> : null}

      {/*
        Visible status. NOT a live region: there is exactly one of those, below.
        Two overlapping regions make a screen reader announce the same change
        twice, or interrupt itself mid-sentence.
      */}
      <footer className="app__footer">
        <p className="app__status">
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
        <span className="app__meta">{scene.repositoryName || 'No repository'}</span>
        {scene.git && scene.git.branch ? (
          <span className="app__meta">
            branch {scene.git.branch}
            {scene.git.dirty ? ' · uncommitted changes' : ''}
          </span>
        ) : null}
        <span className="app__meta">{scene.folders.length} folders</span>
      </footer>

      {/* THE single live region for the whole application. */}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement.nonce % 2 ? announcement.text + ' ' : announcement.text}
      </div>
    </div>
  )
}
