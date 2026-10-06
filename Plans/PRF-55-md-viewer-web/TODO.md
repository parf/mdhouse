# TODO — mdhouse

**1.1.1** — checkboxes written back to disk in `--rw` folders (I.0–I.3, done; see
[`DONE.md`](DONE.md)). User-facing history is in [`CHANGELOG.md`](../../CHANGELOG.md).

Next step: **K.2b** or **J** — your pick.

## J. Section → AI

- **J.1** Select a block; `data-line` gives its source range.
- **J.2** A panel takes a comment and runs `claude -p` or `codex exec` with the section plus
  file context.
- **J.3** Stream the reply back over the WebSocket.

**Acceptance:** feedback on a section of a real plan document comes back without the file being
modified, unless the user explicitly applies it.

## K.2b Changes across a root

A changed / added / removed listing for a whole root, opening the existing per-file diff views.

## L. Plans-convention awareness

Detect `Plans/<project>/` — the convention this directory follows — and show it as a project
card: TODO checkbox progress, DONE count, an open-QUESTIONS badge, a link to the `done/` archive.

## M. Smaller

- **M.1** Task progress in the tree (`12/34` beside a file with checkboxes), computed during
  the scan. The document header already shows its own count.
- **M.2** Backlinks and a broken-link report; links are already parsed at render time.
- **M.3** Opening a document scrolls the tree to it, as a breadcrumb click already does.
- **M.4** An editor (CodeMirror 6) with live preview and scroll-sync, built on `data-line`.
- **M.5** An ignore that works. The old button was removed in 0.4.0: it wrote a mark nothing
  read and could not be undone. A real one needs tree and search filtering on the mark, a view
  of what is hidden, and a way to bring it back. The `ignored` mark is still in `prefs.ts`, so
  existing prefs files keep meaning something.
- **M.6** The ripgrep fallback is silent: `SearchResult.degraded` is computed and never shown.
  Say so in the search results, or drop the field.
- **M.7** The in-process search fallback reads the scanned file list without resolving
  symlinks, so a `.md` symlink pointing outside the root is searched. Ripgrep does not follow
  symlinks by default; the fallback should behave the same.
