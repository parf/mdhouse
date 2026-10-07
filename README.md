<p align="center">
  <img src="doc/logo.png" alt="mdhouse — a house with .md inside" width="260">
</p>

# ❖ mdhouse

**Every Markdown file under a folder, as a fast little website on your own machine.**

> ✦ **In ten seconds.** Point it at a folder — notes, a repo, a pile of repos — and get one
> browser tab with a file tree, instant search, and a live *what changed lately* view fed by
> git. Nothing is imported, indexed or copied anywhere: it reads the folder as it is right
> now, and never writes to it unless you ask.

```bash
mdhouse ~/notes
```

![mdhouse showing a docs tree, a rendered document with its table of contents, and the file's git history](doc/screenshot.png)

For people who read and write a lot of Markdown and are tired of `cat`, `less`, and editor
previews that show one file at a time. Made for docs trees and `Plans/` folders; happy with any
directory that has `.md` files in it.

---

## ▸ Install

```bash
bun install -g mdhouse      # or: npm install -g mdhouse
```

Needs [Bun](https://bun.sh) ≥ 1.4 and git; optional: ripgrep (`rg`).

<details>
<summary>…or run it from a clone</summary>

```bash
git clone https://github.com/parf/mdhouse
cd mdhouse
bun install
sudo ln -sfn "$PWD/bin/mdhouse" /usr/local/bin/mdhouse   # or put bin/ on your PATH
```

</details>

## ▸ Start

```bash
mdhouse ~/notes ~/src -P     # serve these folders, and save them for every later start
mdhouse service install      # starts now and at every login, serving the saved folders
```

- Open <http://127.0.0.1:7777>.
- It runs in the background; `mdhouse <folder>` again adds that folder to the running one.
- Leave out `-P` to serve folders for this session only; add `--rw` to
  [edit and answer on the page](#-editing-docs--answering--asking-questions).
- More in [Running it](#-running-it).

---

## ❖ What you get

**Browse.** A sidebar tree of `.md` and `.mdx` files, nothing else, in three widths — a single
top bar, compact, or open with search and filters — cycled with `Ctrl+B` and remembered. The
open sidebar shows each file's age and size; compact shows the size. Stubs stand out: a pink
**∅** and a double strike-through under 101 bytes, the size in violet and one strike under 500.
Empty files are left out of the tree. The folders on the way to what you are reading are bold,
git status shows as `M` / `U` / `S` / `D`, and in the open sidebar hovering a file offers ★ and 🔇.

**Search.** File names match as you type, with no request to the server at all. Full text goes
through ripgrep with line numbers and highlighted context, and clicking a hit opens the file
*at that line*. Four chips narrow it: *names* / *contents* pick which half you see, *recent* /
*mine* restrict it to the files the Recent and Mine tabs list.

**Two kinds of recent**, as sidebar tabs — **🕐 Recent**, everything that changed here, and
**👤 Mine**, only your own work (anything uncommitted counts as yours). Uncommitted files come
first, colour-coded by git status, then the files touched by the last N commits, filterable by
committer; `❖` marks the ones that are yours. The other two tabs are **📄 Files** and
**★ Favs**.

![The Recent tab in the compact sidebar: file, folder and commit subject per row, a diamond on your own files, and ages that run from red to grey](doc/recent.png)

**A front page** — the root's name in the sidebar. A band at the top says where the checkout
stands: the branch, when it last pulled, and the commit it is on. Below, what changed, grouped
by **commit**: each with its subject, age, author and the documents it is the newest change to.
Yours are tinted green. **Favs / Recent / Mine** narrow it. A folder git knows nothing about
gets its twenty most recently changed files instead.

**A page per folder.** Click the count on a closed folder in the tree, any folder in a
document's breadcrumb, or **DIR** beside the front page's title, and you get every `.md` beneath
that folder in one table: subfolder, name, age and size. Newest first, or A–Z in `ls -lR` order.
Past 50 files it grows two filters, one per column, that match like `LIKE '%text%'` — `^` and `$`
anchor, `%` and `_` are wildcards. From the root's own page, **GIT** goes back to the front page.

**The document page.** Above the text: a breadcrumb that opens each folder's page, how long ago
the file changed, who started it and when, and an `N/M done` count when it has task checkboxes —
which you can tick, in a folder served with `--rw`: the file is saved with that one line changed.
Beside it: a table of contents (H1–H2, with an `H3` chip when the document goes deeper) and the
last five commits to that file, each a button that shows what that commit did. Renames are
followed, so a moved file keeps its history.

**The buttons above a document**, left to right:

- **↔ Full width** — the whole window instead of a reading column, for wide tables and long
  code lines. It stays on as you move between documents.
- **⊟ Patch** — what changed, as a diff: two line-number gutters, GitHub's green and red, and
  the line content *rendered* — headings, bold, code, links and task boxes look like themselves.
- **▤ Marked-up document** — the same change laid over the whole document in its normal styling:
  new blocks tinted green, deleted text struck through where it used to be.
- **★ Favourite** — pin the file to the Favs tabs.
- **🔇 Mute** — drop it out of Recent without deleting anything.
- **🔗 Copy link** — the document's URL.

A file with uncommitted work opens on its diff, in whichever view you used last; a clean file
opens as a document. Beside the title, **✎** opens the file in your editor through an `edit:`
link (see [Settings](#-settings)).

**Ages read like a heat map** — red under ten minutes, orange this hour, amber today, grey this
week, faint for older — with 🔥 on anything touched in the last ten minutes and ♨️ for the rest
of the hour, in the tree as well as the lists.

**Renders properly.** CommonMark and GFM through markdown-it — everything beyond plain CommonMark
is listed, with live examples, in [**Markdown in mdhouse**](doc/markdown.md). In short: nested lists, tables, footnotes,
task lists, GitHub alerts (`> [!NOTE]`), front matter set aside, syntax highlighting via shiki,
and mermaid diagrams. Question, disagreement and answer blocks — `> [!QUESTION]`, `::: q`,
`**Q:**` lines, `> ?` / `> ?!` / `> 💬`, `- [ ]` / `- ✅` items — have [their own page](doc/qa.md); in a
`--rw` folder you can answer them right on the page. Relative links and images
between documents just work. Light and dark follow your system.

**Finds your repos.** Hand it a directory of repositories and it discovers each one, listing
files with `git ls-files`, so `.gitignore` is honoured with zero configuration. Ignored files
are one toggle (or `--all`) away.

**Live.** Edit a file in your editor and the open page, the tree and the front page follow,
pushed over a WebSocket. No polling; a dot in the sidebar footer says the connection is up.

**Around the edges.** The house in front of every title opens version, links and the shortcut
list (`?` from anywhere). The folder dropdown switches between served folders — more of each
path as the sidebar widens, the whole path with the sidebar off. With the sidebar off, a single
top bar keeps ☰, the dropdown, 🔍 and ⚙.

---

## ✎ Editing docs & answering / asking questions

With `--rw` (**still in testing** — use it on folders under git):

- ☑️ **Tick a checkbox** — that one line is saved.
- ❓ ⁉️ **Answer a question** — click the icon, write, **Save** (Ctrl+Enter). Written in the
  question's own syntax; an answered one opens for editing.
- `- [ ]` `- ✅` `- ⚠️` … **Checkbox and status items are questions too** — **Check & Save**
  answers and ticks in one go. [Details](doc/qa.md#checkbox-and-status-items)

<img src="doc/rw-answer.png" alt="An answered question with bullets, and a checkbox question with the answer editor open under it: Save, Check &amp; Save and Cancel" width="560">

- Hover a heading for three buttons after its `#`:
  - ✎ open the file at that line in your editor (`edit:/path:line`)
  - ↓ add a block right under the heading
  - ⇊ add one at the end of its section
- **Add as** ¶ text · ❝ quote · ✍️ my quote (signed) · 💡 tip · ❓ question · ⁉️ disagreement ·
  💬 answer

<img src="doc/rw-add.png" alt="A heading with its edit, add-below and add-at-end buttons, and the add editor open at the end of its section with the Add as buttons" width="560">

- 🛡 Each edit changes only its own lines; if the file changed meanwhile it is refused and your
  text is kept. Esc cancels.
- 🧪 Try every form on the [Q&A playground](doc/qa-playground.md); syntax in
  [Questions and answers](doc/qa.md).

---

## ▸ Running it

```bash
mdhouse                          # serve the saved folders (or this one, when nothing is saved)
mdhouse ~/src                    # add a folder to the running one — never a second server
mdhouse ~/notes -P --port 8080   # save folders, and the port / host, for every later start
mdhouse --rm ~/notes             # forget a folder and stop serving it
mdhouse exit                     # stop it (--all: every port)
mdhouse service install          # systemd: now and at every login; also status, uninstall
```

- Runs in the background; `--fg` keeps it in the foreground. The start message says where its
  log is (`journalctl -t mdhouse -f`, or `journalctl --user -u mdhouse -f` for the service).
- Saved folders, port, host and settings live in `~/.config/mdhouse/prefs.json`.
- The service serves only saved folders, writes only to those saved with `-P --rw`, and stays
  stopped after `mdhouse exit` — `systemctl --user start mdhouse` brings it back.
  `loginctl enable-linger $USER` starts it at boot.

### ⚙ Settings

The **⚙** on each page's title line (in the top bar when the sidebar is off):

- **Directories** — what is served, which folders are saved and which are only for this session,
  and a button to remove one. Adding is done from a terminal, with `-P`.
- **Documents → Edit link** — on by default: the ✎ beside each title, linking to
  `edit:/full/path`. It needs something on your machine that opens `edit:` URLs in your editor;
  turn it off if nothing does.

---

## 🔒 Read-only unless you say, and local

**mdhouse does not write to a folder unless you started it with `--rw`.** Point it at someone
else's checkout, a mounted share, a directory you would rather not touch — the worst it can do is
read. Write access belongs to a folder, not to mdhouse: `mdhouse ~/notes --rw` makes `~/notes`
writable and nothing else, `-P --rw` saves it that way, and saving it again without `--rw`
takes write access away. A writable folder has a green `RW` badge; the Settings page shows which
they are, but write access is only ever granted from a terminal.

> [!WARNING]
> **`--rw` is still in testing.** Writing works and is guarded as described here, but it is new:
> use it on folders under git, where any change is one `git diff` away from being seen or undone.

It writes three things: a ticked checkbox, only that line; an answer saved from the page, only
the answer's lines; and a block added under a heading. The page sends the line and a fingerprint
of what it showed, and the server refuses if the file no longer matches — a stale tab can never
change whatever now sits on that line; it reloads and keeps what you typed. Every write goes
through one function that refuses a read-only folder and resolves symlinks before it decides.
Your favourites, saved folders and settings live in `~/.config/mdhouse/`, never inside a tree.

**It answers only your own machine.** It binds `127.0.0.1` unless you pass `--host`. Requests
addressed to any name other than `localhost`, an IP address, or (with `--host`) this machine's
own hostname are refused — that is what stops a web page from re-pointing its domain at your
machine to read your files. Anything that changes state must come from mdhouse's own page. On a
LAN, reach it by IP address or by this machine's own hostname; other DNS names for the machine
are refused.

---

## ⌨ Keyboard

| Keys | |
| --- | --- |
| `Ctrl+B` / `⌘B` | cycle the sidebar: bar → compact → open |
| `/`, `Ctrl+K`, `Ctrl+P` | open the sidebar and focus search |
| `?` | version, links and this list |
| `Esc` | clear the search query, or close the dialog |

## ▸ Options

| Flag | Default | |
| --- | --- | --- |
| `-p, --port <n>` | `7777` | one mdhouse per port; a second one hands over its folders |
| `-h, --host <addr>` | `127.0.0.1` | `0.0.0.0` to share on your LAN. `-h` is the host, not help |
| `-o, --open` | off | open a browser on start |
| `-a, --all` | off | include gitignored `.md` files — with `exit`, stop every mdhouse |
| `-f, --fg` | off | stay in the foreground instead of detaching |
| `--git-log <n>` | `200` | commits scanned for recents and the front page |
| `--no-git` | off | skip git entirely; recents by modification time only |
| `--rw` | off | **testing** — the folders named may be written: checkbox ticks and answers are saved; with `-P`, saved so |
| `-P, --perm` | off | save the folders, and any `--port` / `--host` given: used on every start |
| `--rm` | off | forget the folders and stop serving them |
| `--help` | | the usage text |

Port and host come from the flag, else `MDHOUSE_PORT` / `MDHOUSE_HOST`, else what `-P` saved,
else `7777` on `127.0.0.1`. `MDHOUSE_ROOT` is the folder used when none is named and none is
saved.

A root may carry a **`.mdhouseignore`**: one directory name per line, `#` for comments, `!name`
to bring back a directory the built-in deny list hides (`node_modules`, `vendor`, build output
and the like).

Addresses: a document is `/d/<root>/<path>/<file>.md` and a folder's page `/d/<root>/<path>/` —
the `<root>/` part only when more than one folder is served — so pages can be linked and
bookmarked.

---

## ▸ Status

**1.2** — in folders served with `--rw` (still in testing) you can tick checkboxes and answer
questions right on the page; everything else is read-only. In daily use. Next:

- a changed / added / removed listing for a whole root, on top of the per-file diffs
- pushing a selected section to Claude or Codex for feedback, streamed back over the WebSocket

What changed in each release: [`CHANGELOG.md`](CHANGELOG.md). If you try it on your own tree and
something looks off, an issue describing the shape of the directory is the most useful thing you
can send.

## ▸ Development

```bash
bun install
bun run dev          # serves this repo with hot reload, in the foreground
bun test
bunx tsc --noEmit
```

No build step: `Bun.serve` bundles `src/index.html` and everything it imports, so what you run is
what you edited. How it is built and why is in
[`Plans/PRF-55-md-viewer-web/`](Plans/PRF-55-md-viewer-web/README.md), with what is next in
[`TODO.md`](Plans/PRF-55-md-viewer-web/TODO.md).

Licensed under the **GNU General Public License v2** — see [`LICENSE`](LICENSE).
