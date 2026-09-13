import { useSyncExternalStore, useMemo, useEffect } from 'react'
import { subscribe, getSnapshot, select, toggle } from './state'
import { visibleNodes } from './visibleNodes'
import './a11y.css'

const STATUS_LABEL: Record<string, string | null> = {
  clean: null,          // announce nothing — "clean" everywhere is noise
  modified: 'modified',
  added: 'added',
  deleted: 'deleted',
  untracked: 'untracked',
}

export function Tree() {
  const state = useSyncExternalStore(subscribe, getSnapshot)

  // derive here, never in the store
  const rows = useMemo(
    () => (state.tree ? visibleNodes(state.tree, state.expanded) : []),
    [state.tree, state.expanded],
  )

  const selectedIsVisible = rows.some(row => row.node.path === state.selectedPath)
  const focusedPath = selectedIsVisible
    ? state.selectedPath
    : rows[0]?.node.path ?? null

  // state changes tabIndex; this moves real DOM focus, which is what
  // screen readers follow
  useEffect(() => {
    if (!focusedPath) return
    const el = document.querySelector<HTMLElement>(
      `[role="treeitem"][data-path="${CSS.escape(focusedPath)}"]`,
    )
    el?.focus()
  }, [focusedPath])

  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = rows.findIndex(r => r.node.path === focusedPath)
    if (i === -1) return

    const row = rows[i]
    if (!row) return
    const { node, level } = row
    const isDir = node.kind === 'dir'

    switch (e.key) {
      case 'ArrowDown': { const n = rows[i + 1]; if (n) select(n.node.path); break }
      case 'ArrowUp':   { const n = rows[i - 1]; if (n) select(n.node.path); break }
      case 'Home':      { const n = rows[0]; if (n) select(n.node.path); break }
      case 'End':       { const n = rows[rows.length - 1]; if (n) select(n.node.path); break }

      case 'ArrowRight': {
        if (!isDir) break
        if (!state.expanded.has(node.path)) {
          toggle(node.path)                     // collapsed -> expand
        } else {
          const n = rows[i + 1]                 // expanded -> first child
          if (n) select(n.node.path)
        }
        break
      }

      case 'ArrowLeft': {
        if (isDir && state.expanded.has(node.path)) {
          toggle(node.path)                     // expanded -> collapse
        } else {
          let p = i - 1                         // otherwise -> parent
          while (p >= 0 && (rows[p]?.level ?? 0) >= level) p--
          const parent = rows[p]
          if (parent) select(parent.node.path)
        }
        break
      }

      case 'Enter': {
        if (isDir) toggle(node.path)
        break
      }

      default:
        return                                  // unhandled key: let it through
    }

    e.preventDefault()                          // stop arrows scrolling the page
  }

  if (rows.length === 0) return <p>No repository loaded.</p>

  return (
    <div role="tree" aria-label="Repository files" onKeyDown={onKeyDown}>
      {rows.map(row => {
        const { node, level, posinset, setsize } = row
        const isDir = node.kind === 'dir'
        const status = isDir
          ? (node.git_status === 'modified' ? 'contains changes' : null)
          : (STATUS_LABEL[node.git_status] ?? null)
        const detail = isDir ? `directory, ${node.file_count} files` : 'file'

        return (
          <div
            key={node.path}
            data-path={node.path}
            role="treeitem"
            aria-level={level}
            aria-posinset={posinset}
            aria-setsize={setsize}
            aria-selected={node.path === state.selectedPath || undefined}
            aria-expanded={isDir && node.children.length > 0
              ? state.expanded.has(node.path)
              : undefined}
            tabIndex={node.path === focusedPath ? 0 : -1}
            style={{ paddingLeft: `${(level - 1) * 16}px` }}
            onClick={() => { select(node.path); if (isDir) toggle(node.path) }}
          >
            <span>{node.name}</span>
            <span className="sr-only">
              {status ? `${detail}, ${status}` : detail}
            </span>
          </div>
        )
      })}
    </div>
  )
}