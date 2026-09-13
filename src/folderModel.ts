/**
 * Pure presentation rules for the folder-details dialog.
 *
 * Separate from `FolderDetails.tsx` so the component file exports only a
 * component — React Fast Refresh cannot update a module that mixes the two — and
 * so these rules can be checked without rendering anything.
 */
import type { DirNode, FileNode } from './types'

/** Cap on rows rendered, so a folder with thousands of entries stays usable. */
export const MAX_VISIBLE_ENTRIES = 50

/**
 * Human-readable git status, or `null` when there is nothing worth saying.
 *
 * Per `docs/contract.md`: git does not track directories, so a directory is never
 * itself "modified" — a modified directory is a rollup meaning it *contains*
 * changes, and must be described that way. `clean` announces nothing at all,
 * because "clean" on every row is noise. An unrecognised value also announces
 * nothing rather than throwing, which is what lets the backend start emitting
 * new statuses before the frontend learns about them.
 */
export function statusLabel(node: FileNode): string | null {
  if (node.kind === 'dir') {
    return node.git_status === 'modified' ? 'Contains changes' : null
  }
  switch (node.git_status) {
    case 'modified':
      return 'modified'
    case 'added':
      return 'added'
    case 'deleted':
      return 'deleted'
    case 'untracked':
      return 'untracked'
    default:
      return null
  }
}

/** What the dialog should say about a directory's contents. */
export type ContentsState = { kind: 'entries' } | { kind: 'none' }

/**
 * Shown whenever a directory lists no children.
 *
 * Carefully worded to describe the SCAN, not the directory. The backend walk may
 * be depth-limited, so "no children in this payload" does not imply "empty on
 * disk" — and a folder that reports a recursive `file_count` of eight while
 * listing nothing was plainly not empty, merely not descended into. Saying
 * "empty" would be a flat lie to someone who cannot see the map, so no branch
 * here ever says it.
 */
export const NO_ENTRIES_MESSAGE = 'No visible entries in the current scan.'

/** Shown when the listing is capped: "Plus 87 more entries." */
export function overflowMessage(hiddenCount: number): string {
  return `Plus ${hiddenCount} more ${hiddenCount === 1 ? 'entry' : 'entries'}.`
}

/**
 * Decide between listing entries and saying nothing is visible.
 *
 * Deliberately only two outcomes. An earlier version distinguished "genuinely
 * empty" from "not walked" by checking `file_count`, but both cases have to be
 * described without asserting emptiness, so they collapse to one honest message.
 */
export function contentsState(node: DirNode): ContentsState {
  return node.children.length > 0 ? { kind: 'entries' } : { kind: 'none' }
}
