# 8-bit-FM data contract

The shape of the payload that crosses the IPC boundary. All three of us code against
this file: `models.rs` serializes to it, `state.ts` and `tree.tsx` consume it, `scene.tsx`
reads the same nodes.

`src/mock-repo.json` is the **executable** version of this document. If the two ever
disagree, the mock wins and this file is stale — fix it.

Status: **frozen** where marked. Frozen means nobody changes it without telling the
other two. Open questions are listed at the bottom.

---

## Payload

```json
{
  "repo": { "name": "8-bit-FM", "branch": "main", "is_dirty": true },
  "root": { /* a node */ }
}
```

## Node shape — FROZEN

Sparse: **files omit `children` and `file_count` entirely.**

```json
// directory
{ "name": "src", "path": "8-bit-FM/src", "kind": "dir",
  "git_status": "modified", "file_count": 8, "children": [ /* nodes */ ] }

// file
{ "name": "main.js", "path": "8-bit-FM/src/main.js", "kind": "file",
  "git_status": "modified" }
```

- `kind` is `"dir"` or `"file"`. It is the discriminator — not the presence of `children`.
  Chosen over an `is_dir` boolean so symlinks and unreadable entries can be added later
  without a contract change.
- An empty directory has `"children": []`, not a missing key.
- **Rust:** `children` is `Option<Vec<FileNode>>` with
  `#[serde(skip_serializing_if = "Option::is_none")]`. Without the attribute you emit
  `"children": null`. **The frontend does not survive that.** `FileNode` is a
  discriminated union on `kind`, so `children` exists only on the dir variant — narrow
  on `kind` first and `.children` is simply there. There is no `node.children || []`
  fallback to absorb a `null`, and the payload enters TypeScript through a single
  unchecked cast, so the boundary will not catch it either — it throws in the tree walk.
  Keep the attribute.
- Field names are snake_case throughout — serde's default, so no `rename_all` attributes
  to get out of sync.

## Paths — FROZEN

`path` is the **identity key**. `expanded` is a `Set` of these strings and `selectedPath`
is one of them, so a mismatch here silently breaks expansion with no error anywhere.

- Every path is **prefixed with the repo folder name**. Root is `8-bit-FM`, its children
  are `8-bit-FM/src`, and so on. A relative walk naturally emits `src/main.js` — that
  will not match.
- One join rule, no special case for root:
  `child.path = parent.path + "/" + child.name`, with `root.path = repo.name`.
- **Forward slashes always**, including on Windows. `PathBuf` inside Rust, `/`-joined
  strings across IPC.
- Ancestor tests must append the separator:
  `child.path.startsWith(dir.path + "/")`. Without the trailing `/`,
  `8-bit-FM/src-tauri` reads as a descendant of `8-bit-FM/src`. That pair is in the mock
  on purpose as a regression test.

## Sorting — FROZEN

**The backend sorts. The frontend never re-sorts.** Two renderers sorting independently
is how the snowman ends up highlighting a different node than the focused treeitem.

Order: directories first, then case-insensitive name.

Check: `Cargo.toml` must come before `CLAUDE.md`. A byte-wise sort flips them
(`'L'` = 76 beats `'a'` = 97).

## `file_count` — FROZEN

Recursive count of **files** in the entire subtree, directories excluded from the count.
Present on directories only.

It must match what the tree renders. The announcement consumes it, so if a screen-reader
user hears "docs, directory, 3 files" and then arrows through four children, the count
has actively misled them. Anything rendered gets counted.

## `git_status` — FROZEN

Always present. Never `null`, never a missing key. `clean` is a real value.

**Files:** `clean` · `modified` · `added` · `untracked` · `deleted`

**Directories:** `clean` · `modified` only — a rollup meaning *contains changes*. Git
does not track directories, so a directory is never itself modified. The tree announces
directories as "contains changes", never "modified".

### Unknown values degrade, they don't crash

Any value outside the list above is treated as unknown: the status clause is **omitted**
from the announcement and no status class is applied. `"src, directory, 8 files"` is
still true, so nothing lies and nothing throws.

```js
const STATUS_LABEL = {
  clean: null,                 // announce nothing — "clean" on every node is noise
  modified: "modified",
  added: "added",
  deleted: "deleted",
  untracked: "untracked",
};
const label = STATUS_LABEL[node.git_status] ?? null;   // unknown → no clause
```

This is what makes the frozen list safe to freeze. The backend can start emitting
`conflicted`, `renamed`, or `typechange` tomorrow and nothing breaks — those values just
won't be *displayed* until the frontend is taught about them.

### Adding a status value later

Deliberately a four-step checklist, because three separate things key off these strings
and two of them fail **silently** (no announcement, no color) rather than throwing:

1. Agree on the string and add it to the list above.
2. Add it to `STATUS_LABEL` in `tree.tsx` — otherwise it degrades to no announcement.
3. Add a CSS class for it in `styles.css`.
4. Tell the canvas owner so the snowman gets a color for it.

Currently deferred on purpose: `conflicted`. It degrades cleanly until step 1 happens.

---

## Open — needs an answer

**For the Rust dev**, roughly in priority order:

1. **Staged vs unstaged collapse.** `git status --porcelain` gives two-axis `XY` pairs, so
   a file can be `MM` (staged then modified again), `AM`, `MD`. Five flat values can't
   express that. Which axis wins, or what's the rule? *Highest priority — this produces
   wrong-but-plausible statuses nobody notices.*
2. **`R` (renamed), `C` (copied), `T` (typechange)** — collapsed into `modified`, or new
   values?
3. **Untracked directories.** `git status --porcelain` prints a new directory as a single
   `newdir/` line and does not enumerate its contents. Does the walk descend and mark each
   child `untracked`, or does it arrive as one node with no children?
4. **Ignored files** — excluded from the walk, or returned with a status? If returned, we
   need a sixth value.
5. **Who computes the directory rollup?** If Rust: `modified` when any descendant is
   non-clean, else `clean`. If frontend: drop `git_status` from directory nodes entirely.
6. **Deleted-but-tracked files.** A tracked-but-deleted file is not on disk, so a
   directory walk can never find it. Supporting it means merging the walk with the git
   index *and* synthesizing phantom parent directories when a whole directory is gone.
   In scope or out? The answer decides whether `docs/old-plan.md` stays in the mock.
   *Dropping that node moves five numbers in the fixture — total nodes 35→34, `docs`
   children 4→3, `docs.file_count` 4→3, `root.file_count` 25→24, and the `old-plan.md`
   row itself — so whoever answers this owns a fixture re-verify.*
7. **`changed_count` per directory**, to announce "8 files, 3 changed"? Must be decided
   before `git.rs` is written or it won't happen.

**For the accessibility owner:**

- Status in the accessible **name**, or in `aria-describedby`? Name is simpler;
  description keeps the name stable across git refreshes so screen readers don't
  re-announce nodes that didn't change.
