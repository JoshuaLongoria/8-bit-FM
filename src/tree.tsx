import { useSyncExternalStore, useMemo } from 'react'
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

  if (rows.length === 0) return <p>No repository loaded.</p>

  const selectedIsVisible = rows.some(row => row.node.path === state.selectedPath)
  const focusedPath = selectedIsVisible ? state.selectedPath : rows[0]?.node.path ?? null

  
  return (
    <div role="tree" aria-label="Repository files">
      {rows.map(row => {
        const { node, level, posinset, setsize } = row
        const isDir = node.kind === 'dir'
        const status = isDir ? (node.git_status === 'modified' ? 'contains changes' : null) : (STATUS_LABEL[node.git_status] ?? null)
        const detail = isDir ? `directory, ${node.file_count} files` : 'file'

        return (
          <div
            key={node.path}
            role="treeitem"
            aria-level={level}
            aria-posinset={posinset}
            aria-setsize={setsize}
            aria-selected={node.path === state.selectedPath || undefined}
            aria-expanded={isDir && node.children.length > 0 ? state.expanded.has(node.path) : undefined}
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