# ❖ mdhouse

**Every Markdown file under a folder, as a fast little website on your own machine.**

> ✦ **In ten seconds.** Point it at a folder — notes, a repo, a pile of repos — and get one
> browser tab with a file tree, instant search, and a live *what changed lately* view fed by
> git. Nothing is imported, indexed or copied anywhere: it reads the folder as it is right
> now, and never writes to it unless you ask. So you can point it at anything, including a
> directory you only have read access to.

```bash
mdhouse ~/notes
```

![mdhouse showing a docs tree, a rendered document with its table of contents, and the file's git history](doc/screenshot.png)

For people who read and write a lot of Markdown and are tired of `cat`, `less`, and editor
previews that show one file at a time. Made for docs trees and `Plans/` folders; happy with
any directory that has `.md` files in it.

---

## ▸ Try it in a minute

```bash
bun install -g mdhouse      # or: npm install -g mdhouse
```

<details>
<summary>…or run it from a clone</summary>

```bash
git clone https://github.com/parf/mdhouse
cd mdhouse
bun install
sudo ln -sfn "$PWD/bin/mdhouse" /usr/local/bin/mdhouse   # or put bin/ on your PATH
```

</details>

```bash
mdhouse                 # this folder
mdhouse ~/notes ~/src   # any folders at once — plain notes, a repo, a pile of repos
```

Then open <http://127.0.0.1:7777>. Every document has an address — `/d/<path>/<file>.md` — so
pages can be linked, bookmarked and typed by hand.

### It runs in the background

The terminal comes straight back, and the server outlives the shell that started it:

```bash
mdhouse exit            # stop it   (--all stops every one you have running)
```

That line is printed on start, so there is nothing to remember. `--fg` keeps it in the
foreground, where Ctrl+C stops it; detached, everything it says goes to the system log
(`journalctl -t mdhouse`).

### Run it again and it adds, never replaces

```bash
mdhouse ~/notes         # starts on 7777
mdhouse ~/src           # 7777 is taken — hands ~/src to the one already running
```

No error and no rival server: the running mdhouse serves that folder too, and your open tabs
keep the tree they were reading. The request travels over a `0600` unix socket in
`~/.config/mdhouse/`, so only a process running as you can ask — a web page cannot reach a
unix socket at all.

---

## ❖ What you get

**Browse.** A sidebar tree of `.md` and `.mdx` files, nothing else. Three widths — a single top
bar, compact, or open with search and filters — cycled with `Ctrl+B` and remembered.

**Search.** File names match as you type, with no request to the server at all. Full text goes
through ripgrep with line numbers and highlighted context, and clicking a hit opens the file
*at that line*. Four chips narrow it: *names* / *contents* pick which half you see, *recent* /
*mine* restrict it to the files the Recent and Mine tabs list.

**Two kinds of recent**, side by side in the sidebar tabs — **🕐 Recent**, everything that
changed here, and **👤 Mine**, only your own work (anything uncommitted counts as yours). The
clock list puts uncommitted files first, colour-coded by git status, then the files touched by
the last N commits, filterable by committer; `❖` marks the ones that are yours. Each row is
three lines: file, folder, commit subject. The other two tabs are **📄 Files** — the tree — and
**★ Favs**. Compact keeps all four as icons.

![The Recent tab in the compact sidebar: file, folder and commit subject per row, a diamond on your own files, and ages that run from red to grey](doc/recent.png)

**A front page.** Click the root name and the same material arrives grouped by **commit**
instead of by file: each commit with its subject, its age and the documents it is the newest
change to, in one aligned table. Yours are tinted green. A tree git knows nothing about falls
back to the twenty most recently changed files.

**The document page.** Above the text: clickable breadcrumbs, how long ago the file changed,
who started it and when, and an `N/M done` count when it has task checkboxes. Beside it: a
table of contents (H1–H2, with an `H3` chip when the document goes deeper) and the last five
commits to that file, each row a button that diffs that commit. `--follow` is used, so a
renamed file keeps its history.

**The buttons above a document**, left to right:

- **↔ Full width** — trade the reading column for the whole window, for wide tables and long
  code lines. It stays on as you move between documents: a way of reading, not a property of
  one file.
- **⊟ Patch** — what changed, as a diff: two line-number gutters, a `+`/`-` column, GitHub's
  green and red. The line content is *rendered* — headings, bold, inline code, links and task
  boxes look like themselves, with the source markers (`##`, `-`, `>`) kept beside them in
  grey. Fenced code stays exactly as typed.
- **▤ Marked-up document** — the same change laid over the whole document in its normal
  styling: new blocks tinted green with a bar in the margin, deleted text struck through in
  the place it used to be. Nothing is hidden — you read the file *and* see what moved.
- **★ Favourite** — pin the file to the Favs tab and the front page.
- **🔇 Mute** — drop it out of Recent without deleting anything.
- **🔗 Copy link** — the document's URL, ready to paste into a ticket or a chat.

Both marks live in `~/.config/mdhouse/`, never inside the tree you are reading, so they work on
a directory you cannot write to.

**And the bar along the top** — the whole sidebar, when it is collapsed:

- **☰ Panel** — cycle bar → compact → open (`Ctrl+B`).
- **The root name** — the front page: what changed in this tree lately.
- **The root dropdown** — switch between the folders being served, when there is more than one.
- **🔍 Search** — open the sidebar with the cursor in the search box (`/`).

**Diffs open themselves when they should.** A file with uncommitted work opens on its diff — if
you have edited it and come back to look at it, the edit is what you came for — in whichever of
the two views you last used. A clean file opens as a document and compares with the previous
revision when you ask. An older revision from the history panel is a text the page is not
showing, so that one always arrives as a patch.

**Ages read like a heat map.** Every "3 h ago" is coloured by how fresh it is — red under ten
minutes, orange this hour, amber today, grey this week, faint for older — and the first hour
also carries an icon: **🔥 hot** for the last ten minutes, **♨️ warm** for the rest of the hour.
The same two badges appear beside a file in the tree, so a fresh file is visible without
opening anything. A column of timestamps is legible before you read a single one.

**Renders properly.** CommonMark and GFM through markdown-it: nested lists, tables, footnotes,
task lists, GitHub alerts (`> [!NOTE]`), front matter set aside, syntax highlighting via shiki,
and mermaid diagrams. Relative links and images between documents just work. Light and dark
follow your system.

**Finds your repos.** Hand it a directory of repositories and it discovers each one, listing
files with `git ls-files`, so `.gitignore` is honoured with zero configuration. Ignored files
are one toggle (or `--all`) away, not invisible.

**Live.** A WebSocket pushes filesystem changes: edit a file in your editor and the open page,
the tree and the front page follow. No polling anywhere; a dot in the sidebar footer says the
connection is up.

---

## 🔒 Read-only by default

**mdhouse does not write to the trees it serves.** Point it at someone else's checkout, a
mounted share, a directory you would rather not touch — the worst it can do is read. `--rw`
allows writing and puts a green `RW` badge beside the root name; no badge means no writes.

It is structural, not a matter of care: every write in the codebase goes through one function
that refuses a read-only root.

---

## ⌨ Keyboard

| Keys | |
| --- | --- |
| `Ctrl+B` / `⌘B` | cycle the sidebar: bar → compact → open |
| `/`, `Ctrl+K`, `Ctrl+P` | open the sidebar and focus search |
| `Esc` in the search box | clear the query |

---

## ▸ Requirements

- **[Bun](https://bun.sh) ≥ 1.4** — the only hard requirement.
- **git** — optional. Without it you still get the tree and search; recents fall back to
  modification time and the sidebar footer says `no git`.
- **ripgrep** (`rg`) — optional. Without it full-text search uses a slower in-process scan that
  gives the same answers.

---

## ▸ Options

| Flag | Default | |
| --- | --- | --- |
| `-p, --port <n>` | `7777` | one mdhouse per port; a second one hands over its directories |
| `-h, --host <addr>` | `127.0.0.1` | local-only by default; `0.0.0.0` to share on your LAN |
| `-o, --open` | off | open a browser on start |
| `-a, --all` | off | include gitignored `.md` files — with `exit`, stop every mdhouse |
| `-f, --fg` | off | stay in the foreground instead of detaching |
| `--git-log <n>` | `200` | commits scanned for recents and the front page |
| `--no-git` | off | skip git entirely; recents by modification time only |
| `--rw` | off | allow mdhouse to write to the trees it serves |

`MDHOUSE_PORT`, `MDHOUSE_HOST` and `MDHOUSE_ROOT` set the defaults for the port, the bind
address and the folder used when none is given.

A root may also carry a **`.mdhouseignore`**: one directory name per line, `#` for comments,
`!name` to bring back a directory the built-in deny list hides (`node_modules`, `vendor`, build
output and the like).

---

## ▸ Development

```bash
bun install
bun run dev          # serves this repo with hot reload, in the foreground
bun test
bunx tsc --noEmit
```

No build step: `Bun.serve` bundles `src/index.html` and everything it imports, so what you run
is what you edited. Mermaid is served separately and fetched only by pages that use it.

The shape of it: `src/cli.ts` (flags, the background start, `exit`) → `src/server.ts` (routes,
WebSocket) → `src/lib/` (roots and the path jail, scanner, renderer, search, git and diffs,
store, watcher, prefs, the control socket) → `src/ui/` (Preact). Every rendered block carries a
`data-line` attribute pointing back at its source line — that is how the marked-up diff finds
the paragraph a change belongs to, and what makes the Phase 2 features cheap.

Planning documents live in [`Plans/PRF-55-md-viewer-web/`](Plans/PRF-55-md-viewer-web/):
[`README.md`](Plans/PRF-55-md-viewer-web/README.md) for how it is built and why,
[`DONE.md`](Plans/PRF-55-md-viewer-web/DONE.md) for everything shipped and how it was verified,
[`TODO.md`](Plans/PRF-55-md-viewer-web/TODO.md) for what is next.

---

## ▸ Status

**Phase 1 is shipped** and in daily use. Next, in this order:

- checkboxes you can tick, written back to disk (only with `--rw` — a stale page must never
  corrupt a file)
- a changed / added / removed listing for a whole root, on top of the per-file diffs
- pushing a selected section to Claude or Codex for feedback, streamed back over the WebSocket
  that is already there

If you try it on your own tree and something looks off, an issue with the shape of the
directory is the most useful thing you can send.

Licensed under the **GNU General Public License v2** — see [`LICENSE`](LICENSE).
