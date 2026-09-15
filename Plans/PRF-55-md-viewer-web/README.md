# mdhouse — project knowledge

Stable knowledge for working on mdhouse. Active work is in [`TODO.md`](TODO.md); finished
work in [`DONE.md`](DONE.md); decisions in [`DECISIONS.md`](DECISIONS.md).

## Purpose

Point mdhouse at a directory and every `.md` file under it becomes a browsable, searchable
site in the browser. Later: tick checkboxes and they are written back to disk, see what
changed via git, select a section and push it to Claude or Codex for feedback.

Ticket: PRF-55 — <https://linear.app/realmo-product/issue/PRF-55/md-files-viewereditor-web-mdhouse>

## Architecture

One Bun process. `Bun.serve` bundles `src/index.html` and everything it imports natively,
so there is no separate build step, no vite and no webpack — `bun run src/cli.ts <dir>` is
the whole thing. Preact SPA on the client, JSON API plus a WebSocket on the server.

```
src/
  cli.ts        argument parsing, root resolution, startup banner
  server.ts     Bun.serve — routes, static bundle, WebSocket
  index.html    the bundle entry point
  app.tsx       shell: routing, data loading, keyboard, live channel
  lib/          server-side: roots, ignore, prefs, scan, render, git, search, store, watch
  ui/           client-side: Sidebar, Tree, Doc, tree building, icons, formatting
  styles/       one stylesheet, CSS custom properties, light and dark
```

`lib/` is imported by the client for its **types only** — those imports erase at build time.
No server code ships to the browser.

## Contracts and invariants

### Never write to a tree that did not ask for it

Every root is read-only unless the user passed `--rw`: mdhouse is a viewer, and the trees it
is pointed at are usually someone's working checkout. `Registry.create(specs, writable)` takes
that single boolean, and every disk write in the codebase goes through the one chokepoint
`Registry.writeFile()`, which refuses a read-only root. Phase 1 calls it nowhere; it exists so
that write-back, when it lands, cannot reach a read-only tree by forgetting a check.

### The path jail

`Registry.resolve()` is the only way a request value becomes an absolute path. Two gates: a
textual one (no `..`, no NUL) and a filesystem one (`realpath`, then the result must still be
inside the root). Nothing outside `roots.ts` may join a request string onto a root path.

### URL shape

`localhost:<port>/d/<path>/<file>.md`. With a single root the path is simply root-relative.
Extra roots earn a leading `/<rootId>/` segment. `Registry.docUrl()` and
`Registry.fromDocUrl()` are the only places that know this.

### One git process per repository

Recents, authors and status badges all come from a single `git log` and a single
`git status` per repo. The PHP viewer this replaces shells out once per displayed row; that is
the thing not to repeat. Committer filtering happens client-side on data already
fetched.

### `data-line` on every rendered block

A `markdown-it` core rule copies `token.map[0]` onto each block element as `data-line`. Every
paragraph, list item and checkbox in the DOM therefore knows its source line. Nothing in
Phase 1 consumes it; it is what makes checkbox write-back, section→AI and editor scroll-sync
cheap later. Do not remove it.

### One anchor scheme

Heading slugs are generated server-side by `markdown-it-anchor` and used unchanged by the ToC.
The viewer this replaces has two competing schemes (`header-N` from PHP, slugs from JS) and
links break between them. There is exactly one here.

## Data sources

- **File list** — `git ls-files -co --exclude-standard` per repository, so `.gitignore` is
  honoured with no configuration. A directory walk with a deny list covers ground that is not
  in any repo. `lib/scan.ts`.
- **Git history and status** — `git log --name-status` and `git status --porcelain`,
  batched. `lib/git.ts`.
- **Content search** — `rg --json` when ripgrep is installed, an in-process scan when it is
  not. `lib/search.ts`.
- **User marks** — `~/.config/mdhouse/prefs.json`, keyed by absolute root path. Never a
  dotfile inside a browsed tree; that is what makes marks work on a read-only root.

## Operational rules

- Everything cached per root in `lib/store.ts`, invalidated by the filesystem watcher —
  never rebuilt per request.
- Live updates are WebSocket pushes. **No polling anywhere**, by decision.
- `git` and `ripgrep` are used when present and degraded gracefully when absent. The sidebar
  footer shows `no git` when the git path was unavailable; the ripgrep fallback is currently
  silent (`SearchResult.degraded` is never rendered).

## Canonical links

- Prior art analysed: `rd-md-viewer.local.md` in the repository root — how the PHP viewer this
  replaces works, what to steal and what to avoid. Local only; gitignored.
- Plans convention this directory follows: the `Plans/README.md` of the docs tree — a
  `Plans/<project>/` folder with `README` / `TODO` / `DONE` / `DECISIONS` and friends.
