/**
 * The adapter between the backend payload and the frontend view model.
 *
 * This is the single door the two shapes meet at. `RepoPayload` is the wire
 * format described by `docs/contract.md` — snake_case, a recursive tree, sparse
 * nodes. `RepositoryScene` is what the map wants to draw — flat, camelCase, only
 * the facts the scene uses. Keeping the translation here means that when the Rust
 * scanner's output changes, this file changes and `mapLayout`, `drawMap` and
 * `hitTest` do not.
 *
 * PATH IDENTITY IS FROZEN. `docs/contract.md` fixes `path` as the identity key
 * shared by the accessible tree's `expanded`/`selectedPath` and by the map's hit
 * testing. Every path is prefixed with the repository folder name — root is
 * `8-bit-FM`, its children `8-bit-FM/src`. This adapter therefore copies `path`
 * through completely unchanged. Stripping the prefix to make map paths prettier
 * would silently break selection sync: the canvas would report `src` while the
 * tree looked for `8-bit-FM/src`, matching nothing, with no error anywhere.
 */
import type { DirNode, FileNode, RepoPayload } from '../types'
import type { RepositoryScene, SceneFolder } from './sceneTypes'

/**
 * Narrow a node to a directory.
 *
 * `kind` is the discriminator, not the presence of `children` — the contract is
 * explicit about that, because files omit `children` and `file_count` entirely.
 */
function isDirectory(node: FileNode): node is DirNode {
  return node.kind === 'dir'
}

/**
 * Convert one backend payload into a scene the map can draw.
 *
 * The payload is only ever read: every array and object returned is newly built,
 * so the caller's payload — which the accessible tree is also holding — is never
 * mutated.
 */
export function parseRepoScan(payload: RepoPayload): RepositoryScene {
  const { repo, root } = payload

  // Only a directory has children. A file as the scan root is legal in the type
  // system, and yields a scene with no folders rather than an error.
  const children: readonly FileNode[] = isDirectory(root) ? root.children : []

  // Immediate directory children only — the map draws one house per top-level
  // folder, not the whole recursive tree.
  //
  // Order is preserved exactly as received. The contract is explicit that the
  // backend sorts and the frontend never re-sorts, so nothing is reordered here.
  const folders: readonly SceneFolder[] = children.filter(isDirectory).map(
    (node): SceneFolder => ({
      name: node.name,
      // Copied through verbatim: this is the shared selection identity.
      path: node.path,
      fileCount: node.file_count,
    }),
  )

  return {
    repositoryName: repo.name,
    currentPath: root.path,
    folders,
    // The payload carries no special-file information yet, so these are the
    // conservative defaults: claim nothing rather than draw a decoration for a
    // README that may not exist. When the scanner reports them, only this block
    // changes.
    indicators: {
      hasReadme: false,
      hasGitignore: false,
      hasWorkflows: false,
      configFileCount: 0,
    },
    git: {
      branch: repo.branch,
      dirty: repo.is_dirty,
      // Contributor data is not in the payload yet; an empty list is honest,
      // whereas invented names would be drawn as cabins.
      contributors: [],
    },
    // Likewise: the payload has no truncation signal, so the scan is reported as
    // complete with no warning rather than a fabricated one.
    scan: {
      truncated: false,
      warning: null,
    },
  }
}
