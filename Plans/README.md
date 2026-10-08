# mdhouse — project knowledge

Stable knowledge for working on mdhouse. Open work is in [`TODO.md`](TODO.md), finished work in
[`DONE.md`](DONE.md), decisions in [`DECISIONS.md`](DECISIONS.md), and what each release changed
for users in [`CHANGELOG.md`](../CHANGELOG.md).

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
  lib/           server side: roots, ignore, prefs, scan, render, qa, qa-html, legacy, insert, git, search, store, watch,
                 control (unix socket), service (systemd unit), loghint (where output goes)
  ui/            client side: Sidebar, Tree, Doc, Diff, Home, DirPage, Settings, AboutModal, QaEditor, QaStrip, qa-page,
                 RootSelect, tree building, icons, formatting
  styles/        one stylesheet, CSS custom properties, light and dark
```

`lib/` is imported by the client for its **types only** — those imports erase at build time.
No server code ships to the browser.

## Contracts and invariants

### Never write to a tree that did not ask for it

Writability belongs to a **folder**, never to the process. A folder named on a command gets
that command's `--rw`; a saved folder is writable only if it was saved with `-p --rw`
(`writable` in prefs); `--rw` for an already-served folder upgrades it in place
(`Registry.setWritable`), never downgrades. Write access is granted only from a terminal — no
page can turn it on.

Every disk write to a served tree goes through the one chokepoint `Registry.writeFile()`, which
refuses a read-only root and writes whole or not at all — a temp file beside the document, renamed
over it (through a symlink to its target, the mode kept). Its callers are `POST /api/task` (a checkbox tick),
`POST /api/qa` (a change to one Q&A item) and `POST /api/insert` (a block added
under a heading). mdhouse's own config (`prefs.json`, the
control socket) lives outside every tree.

### A Q&A change touches its item, or nothing

- `src/lib/qa.ts` — the item model of the markup (`Plans/brainstorm/markup.md`): `qaItems` on markdown-it's
  block tokens, shared by the renderer and the server; `stateOf` (qa-states.md); `applyQa` — say ·
  verdict · pick · tick · done · target · edit
- `src/lib/qa-html.ts` — an item as HTML: `data-qa`, `data-line`, `data-hash` (`lineHash` of the item's
  lines), `data-k`; every reply / option / 💡 its own `data-line`
- `src/lib/legacy.ts` — `convertLegacy`: the old forms rewritten into the markup; every read of a doc goes
  through it (`readDoc` in server.ts), so a write writes it converted
- `GET /api/qa` → `{me, text?}` (a reply's text to edit); `POST /api/qa` writes only if the item's
  fingerprint still matches — else `409`; shares the per-file queue with ticks
- client: `ui/qa-page.ts` (delegated buttons), `ui/QaEditor.tsx` (the form, Alt+1…9, Alt+E), `ui/QaStrip.tsx`
  (counts, filter); drafts live in `Doc`, kept per document when the reader leaves

### An added block goes where the heading says, or nowhere

`src/lib/insert.ts`: top-level headings render with `data-hash` (`lineHash` of the heading line);
`insertBlock` re-checks it, then inserts right under the heading or at the end of its section —
the next top-level heading of its level or higher, from the renderer's block parse (`sectionOf`),
trailing blank lines kept after the block — separated by blank lines, in the chosen kind's syntax;
new lines end as the line before them (`insertLines`, shared with `applyQa`). A signed quote takes
the repository's `git config user.name` (else the login), resolved on the server.

### A tick changes one line, or nothing

`toggleTask(src, line, hash)` in `render.ts` flips one bracket, nothing else. The rendered
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
  every route.
- **Then access** — `admit()`, `lib/access.ts`, off until set from the CLI: an address outside
  `--allow` (this machine always passes) is `403`; with any user, no valid Basic login is `401`.
  Read from `prefs.json` for every request (re-read when its mtime changes), so `user-add`
  applies to a running server at once. The page routes hand out the HTML bundle's page from a
  hidden `/__app/` route, so the page is behind both checks too; the bundle and its chunks are
  code with no data, and stay open. [doc/access.md](../doc/access.md).
- **State-changing requests** — `POST /api/marks`, `/api/task`, `/api/qa/answer`, `/api/insert`, `/api/roots/remove`, `/api/settings` — and the
  WebSocket upgrade also pass `sameOrigin()`: `Origin` and `Sec-Fetch-Site` must not name another
  site. Bun parses a body whatever its content-type, so this is the only thing standing between
  a cross-site form post and the handler.
- `/api/files?p=<root>/<dir>` lists every file under a folder (the folder page's ALL view): git's list
  in a repo (`.gitignore` holds), else a walk without dot-folders and `node_modules`; at most 5000.
  `lib/scan.ts` `listFiles()`.
- `/api/doc` renders Markdown only (`MD_EXT`); any other path is 404.
- `/api/raw` serves a linked non-Markdown file from a short list (`RAW_EXT` in `lib/filetypes.ts`: txt, json, yaml, css,
  scss, …) as `text/plain`; `.html` is rendered, under `Content-Security-Policy: sandbox
  allow-scripts` — an opaque origin, so its requests back are cross-site: writes refused,
  reads unreadable.
- `/api/asset` serves an image (`ASSET_EXT`) under `Content-Security-Policy: sandbox` — an SVG opened
  on its own runs no script.
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
  (`port`, `host`) saved by `-p --port/--host`, and `access` (`allow` networks, `users` login →
  argon2id hash), and `autoRw` paths (`--auto-rw`; `settings.autoRw` switches them), and
  `settings.me` — the name a signed Q&A reply carries (empty: git, else the login). A root's
  `writable` is a getter — `--rw` asked, or under an auto-rw path with the switch on — so the
  switch and the CLI apply to a running server at once (`Prefs.refresh()` re-reads the file
  when it changed). Read as JSON with comments; every key is in `doc/prefs.json.dist`. Port and host resolve as flag → env → config →
  `127.0.0.1:7777`, the same in every command, so the unpinned systemd unit (`mdhouse --fg`)
  comes up where a start by hand does. Beside it, `control-<port>.sock`. Never a dotfile inside a
  browsed tree.
- **Git view** — `/d/<root>/<dir>/?git`, `/` redirects to the root's: `Home` scoped to a folder,
  plus `GitPanel.tsx` (remote check, commit / pull / push, Commits, Files). Server:
  `lib/gitpage.ts` behind `/api/git`, `/api/git/commits|files|remote`, POST
  `/api/git/commit|pull|push|reset` (reset: one `.md` file, `git checkout HEAD -- file`, only if it still has the shown diff's `hash` — else 409) — writable folder, same origin, one at a time per repo; commit refuses (409) a file outside the root or in a read-only root, pull a repo holding a read-only root or files outside the root; network
  git never prompts (`GIT_TERMINAL_PROMPT=0`, ssh `BatchMode`). Host links from `origin`.
  Tab in the url: `?git` Recent, `?git=favs|mine|commits|files`.
- **One header** (`PageHead.tsx`) for a folder page and its git view: logo; folder name —
  on the folder page a link to its git view, everywhere else to the folder page; on the right
  GIT / Favs / Recent / Mine / Commits / Files (GIT, Commits, Files only inside a repo) and ⚙.
  A document's header has a git button before ✎: the root's git view.
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
  written over. The CLI still sends `-p` / `--rm` to a running daemon, so its open tabs update.
- The systemd unit (`MDHOUSE_SERVICE=1`) is stopped by `systemctl` only: `mdhouse exit` sees
  `service` in the ping and names the command instead (exit 1); its `--fg` with the port taken
  exits 1 instead of handing over, so `Restart=on-failure` retries.
- A control call times out — ping / exit 2 s, add / remove 60 s: a daemon that does not answer
  (Ctrl+Z) is `{error}` "not answering", its socket kept; every command says so and exits 1.
- Tests: `bun test`, against a temp config dir (`test/preload.ts`); types: `npx tsc --noEmit -p .`, which covers `src/` and `test/`.
