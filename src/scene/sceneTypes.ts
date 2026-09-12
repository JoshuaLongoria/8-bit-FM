/**
 * PROVISIONAL FRONTEND VIEW MODEL — THIS IS NOT THE BACKEND CONTRACT.
 *
 * These types describe the shape the *frontend* wants to draw from. Developer 1's
 * Rust scanner has not frozen its JSON output yet, so nothing here should be
 * treated as the agreed API.
 *
 * When the Rust contract is finalised, we do NOT rewrite the scene code. Instead a
 * single adapter function (planned: `parseRepoScan()`) converts Developer 1's raw
 * response into a `RepositoryScene`. That adapter becomes the only file that needs
 * to change, which is the whole reason this view model exists as its own layer.
 *
 * Rules this file deliberately follows:
 * - Facts only. Rust owns every value in here.
 * - No Canvas layout data (x, y, radius, colour). Layout is computed in Phase 3
 *   by `calculateLayout.ts` from these facts.
 * - No React/UI state (selectedPath, hoveredPath, loading). That lives in the
 *   shared app state, not in repository data.
 * - Everything is `readonly`: once scanned, the scene data is never mutated in
 *   place. A new scan produces a new object.
 */

/**
 * One complete scanned directory — the whole snowman.
 *
 * `git` is `null` when the chosen folder is not a Git repository (a plain folder
 * is a valid target), so every consumer must handle its absence.
 */
export interface RepositoryScene {
  /** Display name of the scanned repository or folder, e.g. "8-bit-FM". */
  readonly repositoryName: string
  /**
   * The directory this scan describes.
   *
   * Path conventions for the entire view model:
   * - Paths in `RepositoryScene` are repository-relative, never absolute.
   * - The repository root is represented by ".".
   * - Forward slashes are used on every operating system, Windows included.
   */
  readonly currentPath: string
  /**
   * Immediate child folders of `currentPath`.
   *
   * No ordering is promised here — do not rely on the order the backend happens
   * to send. Phase 3 (`buildSceneModel.ts`) makes its own sorted copy, ranking by
   * `fileCount` descending and then by `name` alphabetically when counts are
   * equal, so the scene stays stable no matter what order arrives.
   */
  readonly folders: readonly SceneFolder[]
  /** Special-file findings that drive the snowman's decorations. */
  readonly indicators: RepositoryIndicators
  /** Git facts, or `null` when the target is not a Git repository. */
  readonly git: SceneGitInfo | null
  /** Whether the scan was complete, and any warning to surface. */
  readonly scan: SceneScanStatus
}

/**
 * A single child folder — a candidate snowball.
 *
 * MVP ranking decision: visual size comes from `fileCount`, the recursive count of
 * files beneath this folder. Disk bytes are explicitly NOT used, because byte size
 * is dominated by a few large binaries and would rank a folder holding one video
 * above a folder holding a thousand source files.
 */
export interface SceneFolder {
  /** Folder name only, no path separators, e.g. "src-tauri". */
  readonly name: string
  /**
   * The complete repository-relative path to this folder, using forward slashes
   * on every operating system.
   *
   * This is the shared selection identity: the Canvas scene and Developer 3's
   * accessible tree both identify a folder by this exact string, so the two sides
   * must produce it identically, character for character.
   */
  readonly path: string
  /** Recursive number of files beneath this folder. Drives ranking and radius. */
  readonly fileCount: number
}

/**
 * Presence of special files. Each flag maps to one snowman decoration in Phase 7:
 * README -> carrot nose, .gitignore -> scarf, workflows -> top hat,
 * config files -> coal buttons.
 */
export interface RepositoryIndicators {
  readonly hasReadme: boolean
  readonly hasGitignore: boolean
  readonly hasWorkflows: boolean
  /** How many config files were found; drives the number of coal buttons drawn. */
  readonly configFileCount: number
}

/** Git facts for a scanned repository. */
export interface SceneGitInfo {
  /** Current branch name, e.g. "main". */
  readonly branch: string
  /** True when there are uncommitted changes; drives chimney smoke in Phase 8. */
  readonly dirty: boolean
  readonly contributors: readonly SceneContributor[]
}

/**
 * One Git contributor — a cabin in the scene (Phase 8).
 *
 * Deliberately carries no email address or other personal detail: the scene only
 * ever needs a display name and a couple of flags.
 */
export interface SceneContributor {
  /** Display name only. No email addresses. */
  readonly name: string
  readonly commitCount: number
  /** Recent activity; drives the lit cabin window. */
  readonly activeRecently: boolean
  /** Marks the cabin belonging to the person running the app. */
  readonly isCurrentUser: boolean
}

/**
 * Scan completeness. Large or permission-restricted trees may be cut short, and
 * the UI must be able to say so rather than silently showing a wrong snowman.
 */
export interface SceneScanStatus {
  /** True when the scanner stopped early, so counts are lower bounds. */
  readonly truncated: boolean
  /** Human-readable warning to display, or `null` when the scan was clean. */
  readonly warning: string | null
}
