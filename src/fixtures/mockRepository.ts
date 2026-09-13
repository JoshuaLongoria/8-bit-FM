/**
 * Typed entry point for the frontend scene fixture.
 *
 * PROVISIONAL: `./mockScene.json` is a frontend-only `RepositoryScene` fixture —
 * hand-written, already in the shape the Canvas scene wants to draw from. It exists
 * so the scene can be built and tested before the Rust backend is finished. It is
 * NOT the agreed backend contract.
 *
 * Do not confuse it with `src/mock-repo.json`, which is a different file owned by a
 * teammate: that one holds the RAW backend/tree fixture (nested `children`,
 * `snake_case` keys such as `file_count` and `git_status`, repository-prefixed
 * paths). The two are deliberately separate shapes. Converting raw backend output
 * into a `RepositoryScene` is the job of the planned `parseRepoScan()` adapter, and
 * that adapter is the only place the two shapes should ever meet.
 *
 * This file intentionally contains no logic — no sorting, no ranking, no defaults.
 * Its only job is to attach a type to the fixture so the compiler guards the two
 * against drifting apart. Ranking and layout happen in Phase 3.
 */
import mockSceneJson from './mockScene.json'
import type { RepositoryScene } from '../scene/sceneTypes'

/**
 * The `: RepositoryScene` annotation is the safety check. TypeScript infers the
 * exact shape of `mockScene.json`, then verifies it satisfies the view model.
 * If the fixture loses a required field, misspells a key, or changes a value's type,
 * this assignment fails to compile — so `npm run typecheck` catches the mismatch
 * instead of the scene breaking at runtime.
 *
 * Note the absence of `as RepositoryScene`: a type assertion would silence exactly
 * the errors this line exists to surface.
 */
export const mockRepository: RepositoryScene = mockSceneJson
