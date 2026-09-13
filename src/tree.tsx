import { useSyncExternalStore, useMemo, useEffect, useRef } from 'react'
import { subscribe, getSnapshot, select, toggle, announce } from './state'
import type { FileNode, DirNode } from './types'
import { visibleNodes } from './visibleNodes'
import { invoke } from '@tauri-apps/api/core'
import './a11y.css'

const STATUS_LABEL: Record<string, string | null> = {
  clean: null,
  modified: 'modified',
  added: 'added',
  deleted: 'deleted',
  untracked: 'untracked',
}

function expandDir(node: DirNode) {
  toggle(node.path)
  announce(`${node.children.length} immediate entries`)
}

/**
 * A node's path is its identity: it drives the React key, the data-path
 * attribute used for focus restoration, and the expanded/selected sets in
 * state. If it is missing, React reports "Each child in a list should have a
 * unique key" even though a key prop is present, because an undefined key
 * counts as no key at all.
 *
 * The fallback below keeps rendering stable, but it is a stopgap: the real fix
 * is whatever is producing a node without a path. The warning points at it.
 */
function rowKey(node: FileNode, level: number, posinset: number): string {
  if (typeof node.path === 'string' && node.path.length > 0) return node.path
  return `missing-path:${level}:${posinset}:${node.name ?? 'unnamed'}`
}

interface TreeProps {
  // Currently unused — the tree reads from the external store, not props.
  // Remove it once no call site passes it.
  nodes?: FileNode[]
  onOpenFile?: (name: string, content: string) => void
  onSelect?: (path: string) => void
}

async function handleFileOpen(
  path: string,
  name: string,
  onOpenFile?: (name: string, content: string) => void,
) {
  if (!path) {
    console.error('handleFileOpen called without a path', { name })
    announce(`Cannot load ${name}`)
    return
  }
  try {
    const content = await invoke<string>('read_file_content', { path })
    if (onOpenFile) {
      onOpenFile(name, content)
    }
    announce(`Loaded file ${name}`)
  } catch (err) {
    console.error('Failed to read file:', err)
    announce(`Failed to load ${name}`)
  }
}

export function Tree({ onOpenFile, onSelect }: TreeProps) {
  const state = useSyncExternalStore(subscribe, getSnapshot)

  const rows = useMemo(
    () => (state.tree ? visibleNodes(state.tree, state.expanded) : []),
    [state.tree, state.expanded],
  )

  // Diagnostic: surfaces the nodes responsible for the key warning.
  // Safe to delete once the payload is confirmed clean.
  useEffect(() => {
    if (!import.meta.env.DEV) return

    const missing = rows.filter(
      r => typeof r.node.path !== 'string' || r.node.path.length === 0,
    )
    if (missing.length > 0) {
      console.warn(
        `[Tree] ${missing.length} node(s) have no path. These break React keys, ` +
          `focus restoration, and the expanded/selected sets.`,
        missing.map(r => r.node),
      )
    }

    const seen = new Set<string>()
    const duplicates = new Set<string>()
    for (const r of rows) {
      const p = r.node.path
      if (typeof p !== 'string' || p.length === 0) continue
      if (seen.has(p)) duplicates.add(p)
      seen.add(p)
    }
    if (duplicates.size > 0) {
      console.warn('[Tree] duplicate paths:', [...duplicates])
    }
  }, [rows])

  const selectedIsVisible = rows.some(row => row.node.path === state.selectedPath)
  const focusedPath = selectedIsVisible
    ? state.selectedPath
    : rows[0]?.node.path ?? null

  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (typeof focusedPath !== 'string' || focusedPath.length === 0) return
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
        if (node.children.length === 0) {
          announce(`${node.name} is empty`)
          break
        }
        if (!state.expanded.has(node.path)) {
          expandDir(node)
        } else {
          const n = rows[i + 1]
          if (n) select(n.node.path)
        }
        break
      }
      case 'ArrowLeft': {
        if (isDir && state.expanded.has(node.path)) {
          toggle(node.path)
        } else {
          let p = i - 1
          while (p >= 0 && (rows[p]?.level ?? 0) >= level) p--
          const parent = rows[p]
          if (parent) select(parent.node.path)
        }
        break
      }

      case 'Enter': {
        select(node.path)
        onSelect?.(node.path)
        if (isDir) {
          if (node.children.length > 0) {
            if (state.expanded.has(node.path)) {
              toggle(node.path)
            } else {
              expandDir(node)
            }
          }
        } else {
          handleFileOpen(node.path, node.name, onOpenFile)
        }
        break
      }

      default:
        return
    }

    e.preventDefault()
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
            key={rowKey(node, level, posinset)}
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
            onClick={() => {
              select(node.path)
              onSelect?.(node.path)
              if (isDir) {
                toggle(node.path)
              } else {
                handleFileOpen(node.path, node.name, onOpenFile)
              }
            }}
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