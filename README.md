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
bun install -g mdhouse      #  bun 1.4+ required
```

## ▸ Start

```bash
mdhouse ~/notes ~/src -p     # serve folders, -p = save them for every later start, start in background
mdhouse service install      # starts now and at every login, serving the saved folders
```

- Open <http://127.0.0.1:7777>
- `mdhouse --rw <folder>` - add new folder and allow to [edit and answer on the page](#-editing-docs--answering--asking-questions)
- More in [Running it](#-running-it)

---

## ❖ What you get

Live, git-aware Markdown viewer — GithubMarkdown and more flavours

- 📁 **Browse** — a sidebar tree of `.md` / `.mdx` files only, in three widths (`Ctrl+B`), with
  age, size, git status (`M` `U` `S` `D`), and stubs marked **∅**
- 🔍 **Search** — file names as you type; full text through ripgrep, a hit opens *at that line*
- 🕐 **Recent** and 👤 **Mine** — what changed here, and your own work, uncommitted first; plus
  📄 **Files** and ★ **Favs**

![The Recent tab in the compact sidebar: file, folder and commit subject per row, a diamond on your own files, and ages that run from red to grey](doc/recent.png)

- 🏠 **Front page** — branch, last pull and commit; then what changed, grouped by commit
- 📂 **Folder pages** — every `.md` under a folder in one table, newest first or A–Z, with filters
- 📄 **Document page** — breadcrumb, age, author, `N/M done` for checkboxes, a table of contents
  and the file's last five commits
- ⊟ **Diffs** — what changed, as a patch or ▤ laid over the whole document, rendered
- ↔ full width · ★ favourite · 🔇 mute · 🔗 copy link · ✎ open in your editor
- 🔥 **Ages as a heat map** — red under ten minutes, fading to grey over the week
- 🖋 **Renders properly** — GFM, alerts, footnotes, shiki highlighting, mermaid, front matter,
  [and more](doc/markdown.md); [questions and answers](doc/qa.md) in several forms
- 🗂 **Finds your repos** — point it at a folder of repositories; `.gitignore` is honoured
- ⚡ **Live** — edit in your editor and the page follows, over a WebSocket
- ☀️ / 🌙 light and dark follow your system; `?` shows the shortcuts

---

## ✎ Editing docs & answering / asking questions

With `--rw`:

- ☑️ **Tick a checkbox** — that one line is saved
- ❓ ⁉️ **Answer a question** — click the icon, write, **Save** (Ctrl+Enter). Written in the
  question's own syntax; an answered one opens for editing
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
  text is kept. Esc cancels
- 🧪 Try every form on the [Q&A playground](doc/qa-playground.md); syntax in
  [Questions and answers](doc/qa.md)

---

## 🔒 Read-only unless you say, and local

- 📖 **Read-only by default.** Write access - cli only `mdhouse -p --rw dir` (-p = save)
- ✏️ **Small, checked writes** — a ticked checkbox, an answer, a block under a heading
- 🏠 **Local.** Binds `127.0.0.1` unless you pass `--host`
- ⚙ Your settings live in `~/.config/mdhouse/`, never inside a served folder

---

## ⌨ Keyboard

| Keys | |
| --- | --- |
| `Ctrl+B` / `⌘B` | cycle the sidebar: bar → compact → open |
| `/`, `Ctrl+K`, `Ctrl+P` | open the sidebar and focus search |
| `?` | version, links and this list |
| `Esc` | clear the search query, or close the dialog |

## ▸ Running it

```bash
mdhouse                          # serve the saved folders
mdhouse ~/src                    # add a folder to the running one — never a second server
mdhouse ~/notes -p --port 8080   # save folders, and the port / host, for every later start
mdhouse --rm ~/notes             # forget a folder and stop serving it
mdhouse exit                     # stop it (--all: every port)
mdhouse service install          # systemd: now and at every login; also status, uninstall
```

Log: `journalctl -t mdhouse -f` · Config: `~/.config/mdhouse/prefs.json`

---

## ▸ Options

| Flag | |
| --- | --- |
| `-p, --perm` | save the folders, and any `--port` / `--host` given, for every later start |
| `--rw <folder(s)>` | allow editing |
| `--rm <folder(s)>` | forget the folders and stop serving them |
| `--host <addr>` | address to bind — default `127.0.0.1`; `0.0.0.0` to share on your LAN |
| `--port <n>` | default 7777 |

A root may carry a **`.mdhouseignore`**: one directory name per line, `#` for comments, `!name`
to bring back a directory the built-in deny list hides (`node_modules`, `vendor`, build output
and the like)

---

## ▸ Development

Run it from a clone:

```bash
git clone https://github.com/parf/mdhouse
cd mdhouse
bun install
sudo ln -sfn "$PWD/bin/mdhouse" /usr/local/bin/mdhouse    # put on your PATH
mdhouse dir  # run it
```

Want to debug:

```bash
bun run dev          # serves this repo with hot reload, in the foreground
bun test
bunx tsc --noEmit
```

What changed in each release: [`CHANGELOG.md`](CHANGELOG.md)

Licensed under the **GNU General Public License v2** — see [`LICENSE`](LICENSE)
