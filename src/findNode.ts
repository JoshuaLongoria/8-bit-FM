/**
 * Looking a node up by its path.
 *
 * PURE: walks the tree and returns what it finds. Nothing is mutated, nothing is
 * re-sorted, and no copy of the tree is kept anywhere. `docs/contract.md` is
 * explicit that the backend sorts and the frontend never re-sorts — two renderers
 * ordering independently is how the map ends up highlighting a different node than
 * the tree has focused.
 */
import type { DirNode, FileNode } from './types'

/**
 * Find the node at an exact path, or `null`.
 *
 * Matching is exact string equality. `path` is the identity key shared by the
 * tree's `expanded`/`selectedPath` and the map's hit testing, so a "close enough"
 * match — a prefix, a case-insensitive compare, a trailing-slash tolerance —
 * would quietly return the wrong node. `8-bit-FM/src-tauri` is in the fixture
 * precisely because it looks like a child of `8-bit-FM/src` to sloppy matching.
 *
 * The walk descends only into directories, since only they have children.
 */
export function findNodeByPath(root: FileNode | null, path: string | null): FileNode | null {
  if (!root || path === null) {
    return null
  }
  if (root.path === path) {
    return root
  }
  if (root.kind !== 'dir') {
    return null
  }
  for (const child of root.children) {
    const found = findNodeByPath(child, path)
    if (found) {
      return found
    }
  }
  return null
}

/** Narrow a node to a directory. `kind` is the discriminator, per the contract. */
export function isDirectory(node: FileNode | null): node is DirNode {
  return node !== null && node.kind === 'dir'
}

/**
 * Find the directory at a path, or `null`.
 *
 * Returns `null` for a file as well as for a miss, which is what gates the folder
 * dialog: it opens for directories only, and a path that no longer exists after a
 * rescan simply stops resolving.
 */
export function findDirectoryByPath(root: FileNode | null, path: string | null): DirNode | null {
  const node = findNodeByPath(root, path)
  return isDirectory(node) ? node : null
}
