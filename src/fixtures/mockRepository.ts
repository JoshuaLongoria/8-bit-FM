/**
 * Typed entry point for the mock repository fixture.
 *
 * PROVISIONAL: `mock-repo.json` is a hand-written stand-in for Developer 1's Rust
 * scanner output. It lets the Canvas scene be built and tested before the backend
 * exists. It is NOT the agreed backend contract.
 *
 * This file intentionally contains no logic — no sorting, no ranking, no defaults.
 * Its only job is to attach a type to the raw JSON so the compiler guards the two
 * against drifting apart. Ranking and layout happen in Phase 3.
 */
import mockRepositoryJson from '../mock-repo.json'
import type { RepositoryScene } from '../scene/sceneTypes'

/**
 * The `: RepositoryScene` annotation is the safety check. TypeScript infers the
 * exact shape of the imported JSON, then verifies it satisfies the view model.
 * If the JSON loses a required field, misspells a key, or changes a value's type,
 * this assignment fails to compile — so `npm run typecheck` catches the mismatch
 * instead of the scene breaking at runtime.
 *
 * Note the absence of `as RepositoryScene`: a type assertion would silence exactly
 * the errors this line exists to surface.
 */
export const mockRepository: RepositoryScene = mockRepositoryJson
