# TODO — mdhouse

Goal: PRF-55 Phase 1 — browse, search, filesystem recents, git recents, the 3-state sidebar
and the WebSocket channel later phases ride on. **Phase 1 is complete and verified**, and a
run of polish on top of it is too (`N.1`–`N.20` in `DONE.md`).

Next step: **I.1** — clickable checkboxes written back to disk, the first thing that needs
`data-line` and the first thing that needs the write chokepoint.

---

## A–H, K.1, K.2a, N.1–N.20 — closed

See [`DONE.md`](DONE.md). Scaffold, roots and path jail, scanner, renderer, search, git and
recents, server and client, live channel, marks, README — all built and verified end to end
against the docs tree, the scratch tree and `~/src`. 60 tests pass; `tsc --noEmit` is clean.

Since the ship: per-file history (**K.1**), clickable breadcrumbs, authorship in the document
header, an H3 contents mode, full-width reading, a front page grouped by commit, age colouring,
one aligned table for every file list, one mdhouse per port, a history panel that opens itself
and shows five revisions, a server that runs in the background until `mdhouse exit`, the root
switcher in every sidebar state, and per-file diffs (**K.2a**) in two views — a patch with its
lines rendered, and the whole document with the change marked on it.

## I. Checkbox write-back

Depends on nothing outstanding — `data-line` and `Registry.writeFile()` both already exist.

- **I.1** Client enables checkboxes only when `doc.writable`; a click POSTs
  `{path, line, checked}`.
- **I.2** Server patches exactly that source line (`[ ]` <-> `[x]`), refusing if the line no
  longer looks like a task item — a stale page must not corrupt a file.
- **I.3** Write through `Registry.writeFile()`; echo the change over the existing WebSocket
  so other tabs follow.

**Acceptance I:** ticking a box changes one line and nothing else (`git diff` shows a
one-line change); a read-only root renders the boxes disabled and rejects the POST with 403;
two open tabs stay in step.

## J. Section → AI

- **J.1** Select a block; `data-line` gives its source range.
- **J.2** A panel takes a comment and runs `claude -p` or `codex exec` with the section plus
  file context.
- **J.3** Stream the reply back over the existing WebSocket channel.

**Acceptance J:** feedback on a section of a real plan document returns something useful
without the file being modified unless explicitly applied.

## K. Git beyond recents

- ~~**K.1** Per-file history panel~~ — shipped; see `DONE.md`.
- ~~**K.2a** Per-file diff view~~ — shipped; see `DONE.md`.
- **K.2b** Changed/added/removed listing for a whole root, reusing the same diff view.

## L. Plans-convention awareness

Detect `Plans/<project>/` — the convention this very directory follows — and render it as a
project card: TODO checkbox progress, DONE count, open-QUESTIONS badge, `done/` archive link.
The highest-value thing the viewer this replaces cannot do.

## M. Smaller wins

- **M.1** Task progress in the *tree* (`12/34` beside any file with checkboxes), computed
  during the scan. The document header already shows its own count.
- **M.2** Backlinks and a broken-link report; links are already parsed at render time.
- **M.3** Scroll the tree to the open document; remember scroll position per file.
- **M.4** Editor (CodeMirror 6) with live preview and scroll-sync — `data-line` makes it cheap.
- **M.5** The **Ignore** button in the tree writes an `ignored` mark that nothing filters on.
  Either wire it up or take the button away.
- **M.6** The ripgrep fallback is silent: `SearchResult.degraded` is computed and never
  rendered. The README claims a footer note; make it true or drop the claim.

## Review findings, not yet acted on

From an external review of the code, kept here so they are not lost:

- `Registry.resolve()` falls back to the lexical path when `realpath` fails, which is right for
  a file that does not exist yet but fails open if a parent is a symlink out of the root.
- `lib/prefs.ts` writes to `~/.config/mdhouse/` directly rather than through the chokepoint;
  `XDG_CONFIG_HOME` therefore decides where it lands.
- `searchInProcess()` reads paths without resolving symlinks.
- `lib/watch.ts` watches `root.path` only, so the `.git` of a parent repository is missed and
  a commit made outside the root does not refresh anything.
- Smaller: double-encoded links for non-ASCII and spaces in `render.ts`, `repoFor()` producing
  `../` paths for nested repos, quoted non-ASCII filenames in `--name-status` output, and
  `collapseChains()` duplicating directory nodes.

---

## Blockers

None. Phase 1 ships; everything above is new work.
