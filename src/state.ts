import type { FileNode, RepoMeta } from './types'

export interface AppState {
  repo: RepoMeta | null
  tree: FileNode | null
  expanded: ReadonlySet<string>
  selectedPath: string | null
  // nonce changes on every announce so a repeated message still re-announces
  announcement: { text: string; nonce: number }
}

// ── the single source of truth ──────────────────────────
let snapshot: AppState = {
  repo: null,
  tree: null,
  expanded: new Set(),
  selectedPath: null,
  announcement: { text: '', nonce: 0 },
}

const listeners = new Set<() => void>()

function emit(): void {
  [...listeners].forEach((fn) => fn())
}

// ── what React binds to ─────────────────────────────────
export function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

export function getSnapshot(): AppState {
  return snapshot
}

// ── intents the renderers dispatch ──────────────────────
export function load(repo: RepoMeta, tree: FileNode): void {
  const expanded = new Set([tree.path])
  snapshot = {
    repo,
    tree,
    expanded,
    selectedPath: null,
    announcement: { text: '', nonce: 0 },
  }
  emit()
}

export function select(path: string | null): void {
  if (path === snapshot.selectedPath) return
  snapshot = { ...snapshot, selectedPath: path }
  emit()
}

export function toggle(path: string): void {
  const expanded = new Set(snapshot.expanded)   // NEW Set, then NEW snapshot
  if (expanded.has(path)) {
    expanded.delete(path)
  } else {
    expanded.add(path)
  }
  snapshot = { ...snapshot, expanded }
  emit()
}

export function announce(text: string): void {
  const nonce = snapshot.announcement.nonce + 1
  snapshot = { ...snapshot, announcement: { text, nonce } }
  emit()
}