/**
 * Which dialog is open, and the rules for changing that.
 *
 * Pure and DOM-free, so the transitions can be checked with plain assertions
 * instead of being re-implemented inside a test and proved only against
 * themselves.
 */
import { findDirectoryByPath } from './findNode'
import type { FileNode } from './types'

/**
 * A discriminated union rather than two independent pieces of state, because
 * "either one or neither" is the actual rule. Two booleans would make "both open
 * at once" representable, and then it would eventually happen.
 *
 * The folder variant stores only a PATH, never a node. Nodes go stale: after a
 * rescan a stored node would be a detached copy of a tree that no longer exists.
 * Holding the path and resolving it against the current tree on every render
 * means the dialog always reflects live data.
 */
export type ActiveDialog =
  | { readonly kind: 'folder'; readonly path: string }
  | { readonly kind: 'file'; readonly name: string; readonly content: string }
  | null

/**
 * The dialog to show when the player arrives at `path`.
 *
 * Returns `null` — meaning "open nothing" — when the path is a file or is not in
 * this repository. The folder dialog is for directories only, and the repository
 * can change while the player is walking, so the decision is made against the
 * tree as it is at the moment of arrival rather than when the walk began.
 */
export function folderDialogFor(tree: FileNode | null, path: string): ActiveDialog {
  return findDirectoryByPath(tree, path) ? { kind: 'folder', path } : null
}

/** The dialog for a file the user opened from the accessible tree. */
export function fileDialogFor(name: string, content: string): ActiveDialog {
  return { kind: 'file', name, content }
}

/**
 * Does this dialog still make sense against the current tree?
 *
 * A file preview holds its own content and stays valid regardless. A folder
 * dialog is only valid while its path still resolves to a directory — which is
 * how it closes itself when a new repository no longer contains that path.
 */
export function isDialogValid(dialog: ActiveDialog, tree: FileNode | null): boolean {
  if (dialog === null) return false
  if (dialog.kind === 'file') return true
  return findDirectoryByPath(tree, dialog.path) !== null
}

/**
 * Narrow the state down to what should actually render.
 *
 * Rendering is DERIVED from this rather than corrected afterwards by an effect
 * that calls setState — an effect would render the stale dialog for one frame
 * and then re-render to remove it.
 */
export function visibleDialog(dialog: ActiveDialog, tree: FileNode | null): ActiveDialog {
  return isDialogValid(dialog, tree) ? dialog : null
}
