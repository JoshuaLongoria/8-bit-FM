import type { FileNode, Row } from './types'

export function visibleNodes(root: FileNode, expanded: ReadonlySet<string>): Row[] {
  const rows: Row[] = []

  function walk(node: FileNode, level: number, posinset: number, setsize: number): void {
   rows.push({ node, level, posinset, setsize })
   if (node.kind === 'dir' && expanded.has(node.path)) {
      const kids = node.children
      kids.forEach((kid, i) => walk(kid, level + 1, i + 1, kids.length))
    }
  }

  walk(root, 1, 1, 1)
  return rows
}