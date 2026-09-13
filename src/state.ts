import type { FileNode, RepoMeta } from './types'

export interface AppState {
  repo: RepoMeta | null
  tree: FileNode | null
  expanded: ReadonlySet<string>
  selectedPath: string | null
}

// ── the single source of truth ──────────────────────────
let snapshot: AppState = {
  repo: null,
  tree: null,
  expanded: new Set(),
  selectedPath: null,
}

const listeners = new Set<() => void>()

// ── what React binds to ─────────────────────────────────
export function subscribe(onChange: () => void): () => void {
  // add onChange to listeners
  // return a function that removes it
  listeners.add(onChange)
    return () => {
      listeners.delete(onChange)
    }
}

export function getSnapshot(): AppState {
    // return the current snapshot object
  return snapshot
}

function emit(): void {
    // call all the listeners
    [...listeners].forEach((fn) => fn())
}

// ── intents the renderers dispatch ──────────────────────
export function load(repo: RepoMeta, tree: FileNode): void {
  // new snapshot object, expanded seeded with the root path
  const expanded = new Set([tree.path])
  snapshot = { repo, tree, expanded, selectedPath: null }
  emit()
}

// `null` clears the selection: the map reports it when the user clicks empty
// grass. Widening the parameter rather than adding a second `clearSelection()`
// keeps one intent for "the selection is now X" and lets the canvas pass its
// hit-test result straight through, hit or miss.
export function select(path: string | null): void {
  // new snapshot object with selectedPath changed
  if(path === snapshot.selectedPath) return
  snapshot = { ...snapshot, selectedPath: path }
  emit()
}

export function toggle(path: string): void {
  // NEW Set, then NEW snapshot object
  const expanded = new Set(snapshot.expanded)
  if (expanded.has(path)) {
    expanded.delete(path)
  } else {
    expanded.add(path)
  }
  snapshot = { ...snapshot, expanded }
  emit()
}