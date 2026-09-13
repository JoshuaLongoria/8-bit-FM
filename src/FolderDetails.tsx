import Dialog from './Dialog'
import {
  MAX_VISIBLE_ENTRIES,
  NO_ENTRIES_MESSAGE,
  contentsState,
  overflowMessage,
  statusLabel,
} from './folderModel'
import type { DirNode } from './types'

interface FolderDetailsProps {
  readonly node: DirNode
  readonly onClose: () => void
}

/**
 * Read-only details for one directory.
 *
 * Children are listed in the order the backend sent them and are not
 * interactive in this phase — opening files stays with the accessible tree,
 * which already has the keyboard model for it.
 */
export default function FolderDetails({ node, onClose }: FolderDetailsProps) {
  const status = statusLabel(node)
  const contents = contentsState(node)
  const visible = node.children.slice(0, MAX_VISIBLE_ENTRIES)
  const hidden = node.children.length - visible.length

  return (
    <Dialog
      title={node.name}
      describedById="folder-details-summary"
      closeLabel={`Close details for ${node.name}`}
      onClose={onClose}
      className="dialog--folder"
    >
      <dl className="folder-details__summary" id="folder-details-summary">
        <div className="folder-details__row">
          <dt>Path</dt>
          <dd className="folder-details__path">{node.path}</dd>
        </div>
        <div className="folder-details__row">
          <dt>Files</dt>
          <dd>
            {node.file_count} {node.file_count === 1 ? 'file' : 'files'}
          </dd>
        </div>
        <div className="folder-details__row">
          <dt>Status</dt>
          <dd>{status ?? 'no changes'}</dd>
        </div>
        <div className="folder-details__row">
          <dt>Entries</dt>
          <dd>
            {node.children.length} immediate {node.children.length === 1 ? 'entry' : 'entries'}
          </dd>
        </div>
      </dl>

      <div className="folder-details__contents">
        {contents.kind === 'none' ? (
          <p className="folder-details__note">{NO_ENTRIES_MESSAGE}</p>
        ) : null}

        {contents.kind === 'entries' ? (
          <>
            <ul className="folder-details__list">
              {visible.map((child) => {
                const childStatus = statusLabel(child)
                const isDir = child.kind === 'dir'
                return (
                  <li className="folder-details__entry" key={child.path}>
                    {/* The marker is decorative: the words after it already say
                        "folder" or "file", so a screen reader is not given a
                        symbol to puzzle over. */}
                    <span className="folder-details__marker" aria-hidden="true">
                      {isDir ? '▸' : '·'}
                    </span>
                    <span className="folder-details__kind">{isDir ? 'folder' : 'file'}</span>
                    <span className="folder-details__name">{child.name}</span>
                    {childStatus ? (
                      <span className="folder-details__status">{childStatus}</span>
                    ) : null}
                  </li>
                )
              })}
            </ul>
            {hidden > 0 ? (
              <p className="folder-details__note">{overflowMessage(hidden)}</p>
            ) : null}
          </>
        ) : null}
      </div>
    </Dialog>
  )
}
