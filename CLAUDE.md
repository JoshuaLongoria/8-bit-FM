# 8-bit-FM

Read-only desktop file and git repository explorer that renders a folder as a retro 8-bit
winter scene. **Tauri v2** shell, **React 19 + TypeScript 6 + Vite 8** frontend.

3-person hackathon team, 24 hours, started 2026-09-12.

## Architecture — two renderers over one state tree

```
  mock-repo.json  ──or──  invoke("walk_dir")     ← swappable; App.tsx only
                │
                ▼
   ┌────────────────────────────┐
   │        state.ts            │   the ONLY source of truth
   │  tree, repo                │   { expanded: Set<path>, selectedPath }
   │  subscribe() / getSnapshot │   plain TS — no React, no DOM, no fetch
   └────────────────────────────┘
            │                │
       ┌────┘                └────┐
       ▼                          ▼
    tree.tsx                   scene.tsx
    role="tree"                <canvas> via ref
    keyboard + ARIA            aria-hidden="true"
    THE actual UI              decorative only
```

Five rules hold this together:

1. **One-way flow.** State → renderers, always. Renderers read state and dispatch intents
   back (`select(path)`, `toggle(path)`); they never mutate it and never keep their own
   copy. The flat visible-node array is *derived* on every render, never stored as truth.
2. **Renderers never reference each other.** `tree.tsx` must not know the canvas exists,
   in either direction. This is what makes "delete the scene and still demo" true by
   construction rather than by luck.
3. **`App.tsx` is the loading seam.** The only file that knows where data comes from.
   Swapping the mock for `invoke()` later touches one import, and `state.ts` / `tree.tsx`
   never learn Tauri exists.
4. **`state.ts` imports neither React nor the DOM.** It is a plain external store —
   `subscribe(fn)` + `getSnapshot()` — which keeps it console-testable in isolation.
   That's how it gets debugged at 3am.
5. **Every state change produces new object identities.** This one breaks in both
   directions and neither failure throws. Derive inside `getSnapshot()` and you hand
   `useSyncExternalStore` a freshly-built array every time it checks — nothing is equal
   to anything, so React re-renders forever. Mutate in place (`expanded.add(path)`) and
   the Set *and* the enclosing state object stay referentially equal — React sees no
   change, nothing re-renders, and it presents as a `toggle()` that does nothing.
   Replace rather than mutate (`new Set(expanded)`), return a stable snapshot, and
   derive the visible-node array outside the store.

### Why an external store instead of React state

`tree.tsx` binds to it with `useSyncExternalStore(store.subscribe, store.getSnapshot)`.
The canvas subscribes to the same store directly from a `useEffect`, since it draws
imperatively. Both renderers see identical state and neither owns it — rule 1 holds, and
rule 4 survives, which it would not if state lived in a React hook.

## Ownership — do not cross these lines

| Dev | Files |
|---|---|
| **1** — Rust backend | `src-tauri/**` |
| **2** — canvas scene | `src/scene.tsx`, `src/styles.css` |
| **3** — accessibility + state | `src/state.ts`, `src/tree.tsx`, `src/visibleNodes.ts`, `src/types.ts`, `src/mock-repo.json`, `src/a11y.css` |
| shared | `src/App.tsx`, `index.html` |

`src/a11y.css` is split out of `styles.css` on purpose. Focus rings, `:focus-visible`,
`.sr-only`, `prefers-reduced-motion` and the high-contrast theme are correctness for the
accessibility layer, not styling — a well-meant edit to a focus outline is a demo-breaking
bug. Dev 2 owns how the scene looks; Dev 3 owns anything that decides whether the tree is
operable.

## Hard constraints

Demo-survival requirements, not preferences:

- **The ARIA tree must be fully demoable with the canvas removed.** If the scene breaks at
  hour 17, the semantic tree *is* the demo. In React that means: don't render the
  component. Nothing else may depend on it.
- **Nothing outside `App.tsx` may reference `invoke()`.** The frontend must run with no
  Rust and no Tauri.
- **A self-contained demo artifact must exist** — see below.

### The offline demo artifact

`file://` no longer works for `index.html`: module scripts are CORS-blocked from an opaque
origin, and `vite build` also emits module scripts. The replacement is a **single-file
build** — the CORS block only applies to *fetching* a script, so a bundle inlined into the
HTML is immune.

**Not set up yet.** What it needs:

- `base: './'`, `build.assetsInlineLimit: Infinity`, `build.cssCodeSplit: false`
- `rollupOptions.output.format: 'iife'` + `inlineDynamicImports: true` — classic script,
  no reliance on inline-module behavior
- `vite-plugin-singlefile` (one dev dep) or a small post-build inline script
- the fixture **imported**, never fetched, so the page makes zero network calls

Produces one `.html` that can be double-clicked, emailed, or carried on a USB stick —
and unlike the old `file://` route it doesn't need the repo checked out. It's a snapshot,
so regenerate it at checkpoints. `dist/` is gitignored; commit the artifact under `demo/`
deliberately.

### Loading the fixture

`import repo from './mock-repo.json'` — `resolveJsonModule` is on, so it typechecks and
gets bundled. **Do not `fetch()` it**; that breaks the single-file build and reintroduces
a network dependency.

There is exactly one copy of the fixture. `src/mock-repo.js` (a `window.MOCK_REPO` global
from the pre-React vanilla setup) has been deleted. `src/mock-repo.json` is committed with
content as of `fdee582` — 35 nodes, verified against every FROZEN rule in the contract.

## Data contract

**See [docs/contract.md](docs/contract.md)** — node shape, path rules, sorting,
`file_count` semantics, the frozen `git_status` vocabulary, and the open questions for
Dev 1. Stack-agnostic; the React move changed none of it.

`src/mock-repo.json` is the executable version. If the doc and the mock disagree, the mock
wins and the doc is stale.

The three things most likely to break silently:

- **`path` is the identity key.** `expanded` is a `Set` of these strings. Every path is
  prefixed with the repo folder name (`8-bit-FM`, `8-bit-FM/src`, …), joined by
  `parent.path + "/" + child.name` with no special case for root. Forward slashes always,
  including on Windows.
- **Ancestor tests must append the separator** — `startsWith(dir.path + "/")`. Without it,
  `8-bit-FM/src-tauri` reads as a descendant of `8-bit-FM/src`. That pair is in the mock
  deliberately as a regression test.
- **The backend sorts; the frontend never re-sorts.** Dirs first, then case-insensitive
  name. Check: `Cargo.toml` before `CLAUDE.md`.

## Current state

Written: `index.html`, `src/main.tsx`, `src/App.tsx` (Phase 1 shell with a scene
placeholder), `src/styles.css`, the Vite/TS/ESLint config, `src/mock-repo.json`
(35 nodes, verified), `docs/contract.md`.

Absent: `src/state.ts`, `src/tree.tsx`, `src/visibleNodes.ts`, `src/types.ts`,
`src/scene.tsx`, `src/a11y.css`. The seven `.rs` files under `src-tauri/src/` are still
0 bytes — `Cargo.toml` (301 B) and `tauri.conf.json` (835 B) do have content — so the Rust
crate does not resolve yet and `cargo tauri dev` cannot run.

Build order for the accessibility layer, each step testable before the next:

1. `visibleNodes(root, expanded)` → flat `{ node, level, posinset, setsize }[]`. Comes
   before any JSX, because it turns every keyboard case into array arithmetic.
   `posinset`/`setsize` are computed in the walk, from the siblings the walk actually
   emits. ← **next**
2. `state.ts` — external store: subscribe/getSnapshot, selection, expansion.
3. `tree.tsx` — ARIA tree with roving tabindex, bound via `useSyncExternalStore`.
4. Keyboard handler — up/down/left/right/Enter/Escape/Home/End.
5. `aria-live` announcement region.

## Conventions

**TypeScript** — `tsconfig.json` is strict, and two flags shape the code:

- **`noUncheckedIndexedAccess`** makes `flat[i + 1]` typed `T | undefined`. This is a
  feature for the keyboard handler: every boundary case has to be handled explicitly
  instead of producing `undefined` at runtime. Don't reach for `!` to silence it.
- **`noUnusedLocals` / `noUnusedParameters`** fail the typecheck, not just the lint.
- `verbatimModuleSyntax` — use `import type { … }` for type-only imports.

**Frontend**

- `children` is **absent** on file nodes (the contract is deliberately sparse), and
  `FileNode` is a discriminated union on `kind` (`"dir"` / `"file"`) — never on the
  presence of `children`. There is therefore no `(node.children ?? [])` idiom: it does
  not compile, because `children` is not on the file variant to be optional about.
  Narrow on `kind` first, then `.children` is simply there.
- Types mirroring the contract live in `src/types.ts`, hand-written — not inferred from
  the JSON import, since the mock is a sample and the Rust payload is the real source.
- CSS uses BEM-ish class names (`app__header`, `scene-placeholder__label`).

**Rust**

- Rust 2021. `main.rs` stays thin — it calls into `lib.rs`, so logic is testable without
  launching a window.
- `models.rs` holds every type that crosses IPC, deriving `Serialize`/`Deserialize`.
- `commands/*` are the only frontend entry points, each a `#[tauri::command]` registered
  in `lib.rs`. The frontend never touches the filesystem directly.
- Errors cross IPC as `Result<T, String>` — map with `.map_err(|e| e.to_string())` at the
  command boundary.
- snake_case field names throughout, matching serde's default, so there are no
  `rename_all` attributes to fall out of sync with the frontend.

## Run it

```sh
npm install
npm run dev          # Vite on port 1420 (strictPort — Tauri's devUrl expects it)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint .
npm run build        # typecheck + production build to dist/

cargo tauri dev      # full app — needs src-tauri/ populated first
```

`cargo tauri dev` also needs the Tauri CLI (`cargo install tauri-cli`) and the system
webview.
