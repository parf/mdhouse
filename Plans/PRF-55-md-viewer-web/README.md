# mdhouse — project knowledge

Stable knowledge for working on mdhouse. Open work is in [`TODO.md`](TODO.md), finished work in
[`DONE.md`](DONE.md), decisions in [`DECISIONS.md`](DECISIONS.md), and what each release changed
for users in [`CHANGELOG.md`](../../CHANGELOG.md).

## Purpose

Point mdhouse at a directory and every `.md` file under it becomes a browsable, searchable site
in the browser, live, with git history and diffs beside each document. In folders served with
`--rw`, ticking a checkbox saves the file. Next: a changes listing per root, and pushing a
section to Claude or Codex for feedback.

Ticket: PRF-55 — <https://linear.app/realmo-product/issue/PRF-55/md-files-viewereditor-web-mdhouse>

## Architecture

One Bun process. `Bun.serve` bundles `src/index.html` and everything it imports natively, so
there is no separate build step — `bun run src/cli.ts <dir>` is the whole thing. A Preact SPA on
the client; a JSON API and a WebSocket on the server; a unix socket for the CLI to talk to a
running daemon.

```
src/
  cli.ts         arguments, launcher (detach, hand-over, exit), `service` subcommand
  server.ts      Bun.serve — routes, API, WebSocket, roots added and removed at runtime
  index.html     the bundle entry point
  app.tsx        shell: routing, data loading, keyboard, live channel
  lib/           server side: roots, ignore, prefs, scan, render, git, search, store, watch,
                 control (unix socket), service (systemd unit), loghint (where output goes)
  ui/            client side: Sidebar, Tree, Doc, Diff, Home, DirPage, Settings, AboutModal,
                 RootSelect, tree building, icons, formatting
  styles/        one stylesheet, CSS custom properties, light and dark
```

`lib/` is imported by the client for its **types only** — those imports erase at build time.
No server code ships to the browser.

## Contracts and invariants

### Never write to a tree that did not ask for it

Writability belongs to a **folder**, never to the process. A folder named on a command gets
that command's `--rw`; a saved folder is writable only if it was saved with `-P --rw`
(`writable` in prefs); `--rw` for an already-served folder upgrades it in place
(`Registry.setWritable`), never downgrades. Write access is granted only from a terminal — no
page can turn it on.

Every disk write to a served tree goes through the one chokepoint `Registry.writeFile()`, which
refuses a read-only root. Its only caller is `POST /api/task` (a checkbox tick). mdhouse's own
config (`prefs.json`, the control socket) lives outside every tree.

### A tick changes one line, or nothing

`toggleTask(src, line, hash)` in `render.ts` is the only edit made to a document. The rendered
checkbox carries `data-line` (1-based, within the body) and `data-hash` (FNV-1a of the raw source
line); the server re-reads the file, counts front matter back in, and flips the bracket only if
that line still hashes the same and still looks like a task item — else `409`, and the page
reloads. Writes to one file are queued; `\r\n` and every other byte are kept.

### The path jail

`Registry.resolve()` is the only way a request value becomes an absolute path. Two gates: a
textual one (no `..`, no NUL) and a filesystem one — the nearest existing ancestor is
`realpath`ed and the result must still be inside the root, so a not-yet-existing file under a
symlink is judged by where it would really land. Nothing outside `roots.ts` may join a request
string onto a root path.

### URL shape

- `/d/<path>/<file>.md` — a document. With a single root the path is root-relative; extra roots
  earn a leading `/<rootId>/` segment. `Registry.docUrl()` / `fromDocUrl()` on the server.
- `/d/<path>/` — a folder's page; the trailing slash is what makes it one. A single root's own
  page is `/d/`. Parsed client-side in `app.tsx` (`dirTarget`), by the same root-segment rule.
- `/` — the front page; `/settings` — settings.

### Git is batched

Recents, authors and status badges come from one `git log` and one `git status` per repository,
never one call per displayed row. Committer filtering happens client-side on data already
fetched. Every git call goes through one wrapper that sets `core.quotepath=false`, and every
diff passes `--no-ext-diff --no-textconv`.

### `data-line` on every rendered block

A `markdown-it` core rule copies `token.map[0]` onto each block element. The marked-up diff view
already uses it; checkbox write-back, section → AI and editor scroll-sync will. Do not remove it.

### One anchor scheme

Heading slugs are generated server-side by `markdown-it-anchor` and used unchanged by the
contents list, so a heading link and its contents entry cannot disagree.

### Who may talk to the server

- **Every route** (and the WebSocket) first passes `trustedHost()`: the `Host` header must be
  `localhost`, an IP literal, or — when bound to the network with `--host` — this machine's own
  name. Anything else is `421`. This is the DNS-rebinding guard: a rebound page looks
  same-origin in every header except the name it was addressed to. `guard()` in `server.ts` wraps
  every route; the HTML bundle is left alone.
- **State-changing requests** — `POST /api/marks`, `/api/task`, `/api/roots/remove`, `/api/settings` — and the
  WebSocket upgrade also pass `sameOrigin()`: `Origin` and `Sec-Fetch-Site` must not name another
  site. Bun parses a body whatever its content-type, so this is the only thing standing between
  a cross-site form post and the handler.
- The CLI goes over the `0600` unix socket instead, which a browser cannot reach at all.

## Data sources

- **File list** — `git ls-files -co --exclude-standard` per repository, so `.gitignore` is
  honoured with no configuration; a directory walk with a deny list covers ground that is not in
  any repo, or that its repo ignores. `lib/scan.ts`.
- **Git history, status, HEAD** — `git log --name-status`, `git status --porcelain`, and
  `rev-parse` plus `FETCH_HEAD`'s mtime for the front page's branch and last pull. `lib/git.ts`.
- **Content search** — `rg --json` when ripgrep is installed, an in-process scan when it is not.
  `lib/search.ts`.
- **Config** — one file, `~/.config/mdhouse/prefs.json` (`$XDG_CONFIG_HOME` respected): marks
  keyed by absolute root path, the saved directories, the settings page's options, and `server`
  (`port`, `host`) saved by `-P --port/--host`. Port and host resolve as flag → env → config →
  `127.0.0.1:7777`, the same in every command, so the unpinned systemd unit (`mdhouse --fg`)
  comes up where a start by hand does. Beside it, `control-<port>.sock`. Never a dotfile inside a
  browsed tree.
- **Folder pages** are built in the browser from the tree payload it already holds; they cost
  no request.

## Operational rules

- Everything is cached per root in `lib/store.ts` and invalidated by the filesystem watcher —
  never rebuilt per request. A root removed at runtime drops its cache and its watchers.
- Live updates are WebSocket pushes. **No polling anywhere**, by decision.
- `git` and `ripgrep` are used when present and degrade gracefully when absent. The sidebar
  footer shows `no git` when the git path was unavailable; the ripgrep fallback is currently
  silent (TODO M.6).
- `prefs.json` has several writers (the CLI, a daemon per port, the systemd service). Every
  change is read–apply–write against the file as it is now, one at a time within a process
  (`Prefs.queue`), written to a uniquely named temp file and renamed
  into place; a file that does not parse is moved aside as `prefs.json.broken-<time>`, never
  written over. The CLI still sends `-P` / `--rm` to a running daemon, so its open tabs update.
- Tests: `bun test`; types: `npx tsc --noEmit -p .`, which covers `src/` and `test/`.
