/**
 * The IPC boundary: Rust's `RepoTree` -> the frontend's `RepoPayload`.
 *
 * THIS IS THE ONE PLACE untrusted data enters the app. `invoke` hands back
 * `unknown` and this module is what turns it into a typed payload, by checking
 * rather than by asserting. There is no `as RepoTree` anywhere: a cast would
 * simply promise the compiler that a value from another process has the right
 * shape, and be wrong silently the first time the Rust side changed.
 *
 * The two shapes differ in several ways that matter:
 *
 * - Rust serialises with `rename_all = "camelCase"`, so its node fields are
 *   `fileCount`/`sizeBytes`, while `types.ts` (written against the mock fixture
 *   and `docs/contract.md`) uses snake_case `file_count`.
 * - Rust's `FileNode` has no `git_status` at all; the frontend type requires one.
 *   Missing status becomes `"clean"`, which `docs/contract.md` defines as the
 *   value that announces nothing — so nothing is invented and nothing lies.
 * - Rust always sends `children`, even for files. The frontend type is a
 *   discriminated union where only directories have children, so file nodes are
 *   built without them.
 * - `RepoTree` carries no branch or dirty flag. Those are left blank here rather
 *   than guessed; the separate `get_status` command is where they would come from.
 *
 * Paths are passed through EXACTLY as Rust emits them. They are the shared
 * identity for the tree's `expanded`/`selectedPath` and for the map's hit
 * testing, so both sides get the same strings and neither rewrites them.
 */
import type { DirNode, FileLeaf, FileNode, RepoMeta, RepoPayload } from './types'

/** Thrown when the payload from Rust is not the shape we can use. */
export class RepoTreeFormatError extends Error {
  constructor(message: string) {
    super(`Unexpected response from walk_repo: ${message}`)
    this.name = 'RepoTreeFormatError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(source: Record<string, unknown>, key: string, where: string): string {
  const value = source[key]
  if (typeof value !== 'string') {
    throw new RepoTreeFormatError(`${where}.${key} should be a string`)
  }
  return value
}

/** Non-negative integer, defaulting to 0 when absent or unusable. */
function readCount(source: Record<string, unknown>, key: string): number {
  const value = source[key]
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}

/** `git_status` is absent from the Rust node; "clean" announces nothing. */
function readStatus(source: Record<string, unknown>): string {
  const value = source['git_status'] ?? source['gitStatus']
  return typeof value === 'string' && value.length > 0 ? value : 'clean'
}

/**
 * Convert one node and, recursively, its children.
 *
 * `kind` is the discriminator per the contract. Anything that is not exactly
 * `"dir"` is treated as a file, which is the safe direction: a mystery node
 * renders as a leaf instead of being walked into.
 */
function convertNode(value: unknown, where: string): FileNode {
  if (!isRecord(value)) {
    throw new RepoTreeFormatError(`${where} should be an object`)
  }

  const name = readString(value, 'name', where)
  const path = readString(value, 'path', where)
  const git_status = readStatus(value)

  if (value['kind'] !== 'dir') {
    const leaf: FileLeaf = { kind: 'file', name, path, git_status }
    return leaf
  }

  const rawChildren = value['children']
  const childList = Array.isArray(rawChildren) ? rawChildren : []
  const children = childList.map((child, index) => convertNode(child, `${where}.children[${index}]`))

  const directory: DirNode = {
    kind: 'dir',
    name,
    path,
    git_status,
    // Rust sends camelCase `fileCount`; the snake_case key is accepted too so
    // this keeps working if the serialisation is ever aligned with the contract.
    file_count: readCount(value, 'fileCount') || readCount(value, 'file_count'),
    children,
  }
  return directory
}

/**
 * Validate and convert a `walk_repo` response.
 *
 * Accepts `unknown` deliberately — that is what crosses the process boundary —
 * and throws a descriptive `RepoTreeFormatError` rather than producing a
 * half-built tree that fails somewhere deep in a render.
 */
export function parseRepoTree(value: unknown): RepoPayload {
  if (!isRecord(value)) {
    throw new RepoTreeFormatError('response should be an object')
  }

  const root = convertNode(value['node'], 'node')

  // Prefer the repository name Rust derived from the folder; fall back to the
  // root node's own name so a blank never reaches the UI.
  const nameValue = value['name']
  const name = typeof nameValue === 'string' && nameValue.length > 0 ? nameValue : root.name

  const repo: RepoMeta = {
    name,
    // Not carried by RepoTree. Left empty rather than guessed; the UI omits the
    // branch line when it is blank.
    branch: '',
    is_dirty: false,
  }

  return { repo, root }
}
