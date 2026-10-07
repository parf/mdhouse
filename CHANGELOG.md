# Changelog

## Unreleased

### Changed

- A folder page and its git view share one header: logo; the folder name (folder page → its
  git view, git view → the folder page); GIT / Favs / Recent / Mine / Commits / Files and ⚙ on
  the right, links each — the tab is in the url (`?git=favs|mine|commits|files`)
- A document's header: a git button before ✎, to the root's git view (inside a repo only)

## 1.4.0 — 2026-10-07

### Added

- **The git view of a folder** — `/d/<root>/<dir>/?git`, and `/` goes to the root's:
  - branch, HEAD, the repo on its host (`origin`); origin is asked whether it moved (`git ls-remote`, no fetch)
  - **Commits** — every commit that touched the folder, any file type; a click lists its files,
    Markdown opening here, the rest on the host (GitHub, GitLab, Bitbucket, Gitea, or a likely url)
  - **Files** — every file git tracks under the folder
  - in `--rw`: **Commit** (`git commit -a`, the files listed first, non-Markdown ones confirmed),
    **Pull** (`--ff-only`), **Push** — with uncommitted files only when all Markdown, and confirmed
  - a **GIT** link on every folder page inside a repo
  - how the branch stands with origin, from the last exchange either way: **pulled** or
    **pushed** and when; **unpushed** in yellow on red when the branch is not on origin; ↑N
    unpushed, ↓N to pull, ✎ N uncommitted. The line is green when all is committed and
    pushed, yellow when not
  - two lists: **Unpushed commits**, and **Changed / added files** of any type — folder, file,
    age, size, as a folder page shows them
  - origin is asked by itself once the page is up (ls-remote, kept 30 seconds); ↻ asks again
  - **Pull** is off when origin has nothing new, and stands out when it has; **Push** is off
    when there is nothing to push
  - file links go by branch (`…/blob/main/src/cli.ts`); a commit not on origin yet is not linked
  - a merge, rebase or conflict under way is said, and commit / pull / push wait for it
  - git over ssh finds your ssh agent even under the systemd service, which does not inherit
    `SSH_AUTH_SOCK` (`/run/user/<uid>/ssh-agent.socket`, `gcr/ssh`, `keyring/ssh`)
- **Access control** — [doc/access.md](doc/access.md): `mdhouse user-add login:passwd` turns
  on a login (Basic auth, the password kept as an argon2id hash); `mdhouse --allow <cidr,…>`
  lets in only those networks, this machine always. Both off by default; changes apply to a
  running mdhouse at once
- **[doc/prefs.json.dist](doc/prefs.json.dist)** — every config key, with comments; prefs.json
  may hold comments now (a save writes plain JSON)
- **auto-rw paths** — `mdhouse --auto-rw ~/src`: every folder served from under one is
  writable without `--rw`; a switch on the settings page turns it off and on, at once
- **`e` opens the document in the editor**, as the ✎ beside the title does
- **The answer and add forms have a ✎** (and Alt+E) that opens the file at that line in the
  editor; the form gives way to an "Opened in external editor" notice, with Back to return to
  your text
- **Ctrl+Shift+Enter in the answer form** saves and opens the next unanswered question
- **The History panel shows its state** — a grey eye when shown, crossed out when hidden
- **Wide mode is remembered** in this browser, one setting for all documents

### Changed

- **The answer button of a checkbox item is a small grey 💬**, not ❓ — an item is not a
  question; it turns green once the item has an answer

### Fixed

- **Checkbox items hang:** a wrapped line and a nested item start under the item's text, not
  under the box

## 1.3.0 — 2026-10-06

### Changed — the command line

- **`-p` is now save** (`--perm`); `-P` is gone. The short forms `-p` (port), `-h` (host) and
  `-f` (foreground) are gone too: use `--port`, `--host`, `--fg`. The old spellings say what
  replaced them instead of doing anything.
- **`MDHOUSE_ROOT` is gone, and so is serving the current folder by default.** With no folder
  named and none saved, `mdhouse` asks for one (`mdhouse <dir> -p`); with one already running,
  it says what that one serves.
- **`--help` and the README are much shorter.**

### Fixed

- A list item opening with a status glyph (`- ✅ …`) keeps its bullet, as on GitHub.

## 1.2.1 — 2026-10-06

The same as 1.2.0, published again while the registry was still processing 1.2.0.

## 1.2.0 — 2026-10-06

**Read/Write support added.** In folders served with `--rw`: answer questions and add notes
right on the page. **`--rw` is still in testing** — writing is guarded (a fingerprint check per
save, read-only folders refused), but new: use it on folders under git.

### Added

- **Answer questions on the page.** In a folder served with `--rw`, every ❓ and ⁉️ is a
  button: click it and an editor opens under the question, loaded with the existing answer if
  there is one. Save (or Ctrl+Enter) writes the answer into the file **in the question's own
  syntax** — `> 💬` lines in a quote, a `> [!ANSWER]` block, an `**A:**` line, a `::: a` block,
  an indented `> 💬` inside a list item — replacing the old answer in place and touching nothing
  else. Esc cancels. If the question or its answer changed on disk meanwhile, the editor says so
  or the server refuses (`409`); the text you typed is kept either way.
- **Checkbox and status items are questions.** Every `- [ ]` / `- [x]` item, and every list
  item opening with a status glyph — `✅ ⚠️ ⏳ 🎫 ❌ 🚫 ⛔ ❓ ⁉️ ☐ ☑️ ☒ ✔️` — can be answered the
  same way. **Check & Save** also ticks the box, or turns the glyph into ✅.
- **`- **Q:**` / `- **A:**` list items** are full question and answer blocks.
- **[Q&A playground](doc/qa-playground.md)** — every form, answered and not, to try it on.
- **Add under a heading.** Hovering a heading shows ✎ ↓ ⇊ after its `#`: ✎ opens the file at
  that line in your editor (`edit:/path:line`), ↓ adds a block right under the heading, ⇊ at the
  end of its section — after its subsections, before the next heading of its level. The block is written as ¶ text, ❝ a quote, ✍️ a quote signed with your git name
  (`> **name:** …`), 💡 a tip, ❓ a question, ⁉️ a disagreement or 💬 an answer, separated by
  blank lines; refused if the heading changed since the page was loaded.

### Fixed

- Bullets and further paragraphs after an answer (`> 💬 Yes:` then `> - a`, or `**A:** Yes:`
  then `- a`) render inside the answer instead of falling out under it.

## 1.1.1 — 2026-10-06

The first release that writes — tick a checkbox in a `--rw` folder and that line is saved — and
a much richer Markdown: `/rd`-style alerts, question / disagreement / answer blocks in four
forms, and two new docs. 1.1.0 was never published; its changes are part of this release.

### Added

- **Tick a checkbox and the file is saved.** In a folder served with `--rw`, task checkboxes in
  a document are live: a tick changes `[ ]` ↔ `[x]` on that one line and nothing else, and every
  open tab follows. The page sends the line with a fingerprint of it; if the file changed since
  the page was loaded, the server refuses (`409`), the page reloads, and nothing is written.
- **`--rw` belongs to a folder, not to mdhouse.** It applies to the folders named on that
  command only — saved folders are no longer made writable by it. `-P --rw` saves a folder
  writable (`writable` in `prefs.json`); saving it again without `--rw` takes write access
  away. `mdhouse <served folder> --rw` makes it writable on the running mdhouse, no restart. The
  systemd service writes only to folders saved writable.

- **`> [!QUESTION]` and `> [!ANSWER]`** alerts, coloured like GitHub's five (❓ teal, 💬 green)
  but one line each — the icon in front of the text, no title row. Lines starting with `**Q:**` /
  `**A:**` render as the same blocks, and so does a quote opening with a Q&A glyph: `> ?` / `❓`
  / `Q:` / `Q` a question, `> ?!` / `!?` / `⁉️` a **disagreement** (two sources that contradict,
  orange), `> 💬` / `A:` the answer. A bare `> A …` stays a quote.
- **One bright palette for Q&A**: every question, disagreement and answer — whichever form it
  was written in, `::: q` blocks included — has the same bright red / orange / green fill and
  4px edge, from shared `--qa-*` tokens; an answer is indented a little under what it settles.
- **[Markdown in mdhouse](doc/markdown.md)** — every syntax mdhouse supports beyond CommonMark,
  with live examples, and what it does not support. Linked from the README.
- **[Questions and answers in mdhouse](doc/qa.md)** — every Q&A form, what ❓ / ⁉️ / 💬 mean, and
  the shared palette, on a page of its own; linked from the Markdown page and the README.

### Changed

- **GitHub alerts** (`> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`) look like
  the `/rd` docs viewer's: an icon on the title (ℹ️ 💡 📣 ⚠️ 🛑, added in CSS), GitHub's colours, a
  tinted background and a 4px edge — with darker-theme colours in dark mode. NOTE and TIP are
  one line (icon, then text, no title row); IMPORTANT, WARNING and CAUTION keep their title.

### Fixed

- Opening a document with uncommitted changes shows its diff, as before — but a file that
  becomes modified while it is open (by a tick) no longer throws the page into the diff view.
- The About box puts the author on a line of its own.

## 1.0.1 — 2026-10-06

### Fixed

- **Installed with npm on a machine without Bun**, `mdhouse` failed with the shell's
  `env: 'bun': No such file or directory`. It now says it needs Bun ≥ 1.4 and where to get it,
  and names the version when an older Bun is found. The README says Bun is needed with npm too.
- **The "watch what it does" hint fits the machine.** It said `journalctl -t mdhouse -f`
  everywhere, including macOS and containers with no journald. Now it is `log stream` on macOS,
  `journalctl` only where journald runs, a `grep` of `/var/log/syslog` or `/var/log/messages`
  where that is the log, and — where nothing keeps the output — a pointer to `--fg`.

### Added

- **Question and answer blocks**: `::: q` / `::: question` and `::: a` / `::: answer`, closed by
  `:::` — the VuePress / VitePress container syntax, via markdown-it-container. A block holds
  any Markdown, carries `data-line` like every other block, and text on the opening line
  (`::: q Do we keep it?`) becomes its first line, in bold for a question. The inline
  `**Q:**` / `**A:**` form still works.

## 1.0.0 — 2026-10-06

The first stable release, and a **read-only** one: nothing in 1.0 writes to the folders it
serves. `--rw` is reserved for 1.1, where ticked checkboxes will be saved.

### Security

- **Requests addressed to a foreign host name are refused** (`421`). A web page could re-point
  its own domain at 127.0.0.1 (DNS rebinding) and then read every served file and change
  settings — the browser treats that as same-origin, so no origin check could tell. Only
  `localhost`, IP addresses and, with `--host`, the machine's own name are accepted.
- **Favourite / mute / ignore changes and the live-update channel** now refuse other sites, as
  removing a folder and changing settings already did.

### Fixed

- **Installed from npm, mdhouse could not show its page** — `/` answered `500 Build Failed`.
  The package left out `tsconfig.json`, which tells Bun to compile the UI's JSX for Preact; a
  clone has it, which is why this went unseen. Every earlier npm release is affected; upgrade.
- **`prefs.json` can no longer be wiped.** A file that fails to parse is moved aside as
  `prefs.json.broken-<time>` rather than written over; every save is a temp file renamed into
  place, so no reader sees half a file; and each change is made against the file as it is now,
  so the CLI, the service and a second daemon no longer undo each other's changes.
- Picking a root in the dropdown on a folder page left the page waiting on a spinner; it now
  moves to that root's folder page. On a document page the breadcrumb stays with the document's
  own root.
- The ✎ link cut a path at `#` or `?`.
- `mdhouse <folder>` run just after the service started said the port was held by "something
  that is not mdhouse": the port is bound a moment before the control socket. It now waits for
  the socket before deciding.
- `mdhouse service --port 8080 install` failed when the flag came before the action.
- Paths with `'`, `%` or `$` broke the systemd unit; they are escaped the way systemd expects.
- In a linked git worktree the front page never showed when it last pulled.
- The ✎ no longer flashes on pages where it is turned off; the tab title no longer keeps the
  last folder page's name; the count on a folder in the tree can be opened from the keyboard.

### Added

- **The port and host can be saved.** `-P` with `--port` / `--host` stores them in `prefs.json`,
  and plain `mdhouse`, `mdhouse exit` and the systemd service all use them — so the service
  comes up exactly where a start by hand does. Order: flag, then `MDHOUSE_PORT` /
  `MDHOUSE_HOST`, then the saved value, then `127.0.0.1:7777`. `mdhouse service install` now
  writes an unpinned `mdhouse.service` that follows the config; `service install --port <n>`
  still makes a pinned `mdhouse-<n>.service`.
- **✎ Edit link** beside each document's title, opening `edit:/full/path` in whatever handles
  `edit:` URLs. On by default; **Settings → Documents** turns it off.
- A leading `**Q:**` / `**A:**` renders as ❓ / 💬, each on its own line. Raw `<pre>` blocks are
  left alone.

## 0.8.0 — 2026-10-06

0.7.0–0.7.2 were never published; their changes are part of this release.

### Added

- **Saved folders.** `mdhouse <dir> -P` (`--perm`) serves a folder now and on every start;
  `mdhouse --rm <dir>` forgets it and stops serving it. They live in
  `~/.config/mdhouse/prefs.json`, beside the favourites. A plain `mdhouse` serves the saved
  folders — and any you name are served alongside them — falling back to the current folder
  only when nothing is saved. A saved folder that has since been deleted is skipped.
- **A systemd user service.** `mdhouse service install` writes and starts `mdhouse.service`
  (`mdhouse-<port>.service` for another port), serving the saved folders from login on;
  `uninstall` and `status` too. It refuses to install with nothing saved, so it never serves
  all of `$HOME`.
- **Settings**, behind a ⚙ on each page's title line: the served folders, saved or just for this
  session, each with a remove button. Removing is refused from any other site.
- **A page for every folder** at `/d/<root>/<dir>/`: every Markdown file beneath it in one
  table — subfolder (named once per run), name, age, size.
  - Newest first, or A–Z in `ls -lR` order; a button over the age column flips them, and the
    choice is remembered.
  - Past 50 files, a filter over each of the first two columns, matching like
    `LIKE '%text%'`: `^` and `$` anchor, `%` and `_` are wildcards. An ⓘ explains it.
  - Reached from the count on a closed folder in the tree, every folder in a document's
    breadcrumb, the root at the head of that breadcrumb, and **DIR** beside the front page's
    title. **GIT** on the root's page leads back.
  - The tree marks it as it marks a document: the way down bold and tinted, the folder
    highlighted.
- **The open sidebar shows each file's age** (`5m`, `22h`, `1d`, `2mo`) before its size.

### Changed

- **The root dropdown is used in every sidebar state** and shows as much of each path as fits:
  folder and parent in compact, two parents in the open sidebar (replacing the row of chips),
  the whole path with home as `~` in the top bar. A long label loses its left end.
- **Small files:** under 101 bytes a bold pink **∅** and a double strike-through; 101–499 bytes
  the size in violet and one strike — the S tile is gone.
- The breadcrumb's last folder is brown, like folders in the tree; a document's title is green;
  the contents and history panels start at the same height.

### Fixed

- Long folder paths and long unbroken file names no longer push tables wider than the page.

## 0.6.0 — 2026-10-05

- **The front page shows where the checkout stands.** A band above the commits: the branch and
  when it last pulled, then HEAD's commit with its subject, age and author (❖ when it is yours).
  It is the newest commit of any kind, not just the newest that touched Markdown, so it shows
  whether the checkout is current. The pull time comes from `FETCH_HEAD`. A root holding several
  repos shows whichever moved last, named.
- **"Pulled" is precise:** `29m`, `7h 12m`, `1d 7h ago` for the first week, not "yesterday".
- **Ages are tighter everywhere:** `22h ago`, `5m ago`, `3d ago`, with no space before the unit.

## 0.5.0 — 2026-10-01

Documentation catch-up. No code changes over 0.4.0.

- README covers the about box and `?`, and its keyboard table is complete again.
- The read-only section says what the jail actually does now: it resolves symlinks before
  deciding, including for a file that does not exist yet.
- Status points at the three fixes most likely to have bitten someone, and at the changelog.
- `DONE.md` gains N.22 and N.23, `DECISIONS.md` gains the rule the review round settled on —
  reproduce before editing, since two of the eleven recommendations were wrong.

## 0.4.0 — 2026-10-01

An About box, and a round of fixes from an outside code review. Every item below was
reproduced before it was changed, and each now has a test.

### Added

- **About box.** The house in front of a title, on the front page and in the sidebar is now a
  button; `?` opens the same dialog from anywhere. It carries the version, the repository, the
  author and the keyboard shortcuts.

### Fixed

- **Folders were listed inside themselves.** A collapsed chain like `Plans/PRF-55` contained a
  second `PRF-55` holding the files. Collapsing and descending were both applied to the
  uncollapsed children.
- **No git history for a repo inside the root.** `mdhouse ~/src` — a directory of repositories,
  the case the README advertises — showed an empty history and no diffs for every file in it.
  The path handed to git was measured through the root, which is not inside the repo, and came
  out as `../…`.
- **The path jail could be walked out of.** A path that did not exist yet was trusted as
  written, so with a symlink out of the tree, `root/link/new.md` read as inside the root and a
  write landed outside it. The jail now resolves the nearest ancestor that does exist. Reads
  were already safe; this closes the write that checkbox write-back will need.
- **Links and images with a space, or any non-ASCII, 404ed.** `My Notes/doc.md` was encoded
  twice, to `My%2520Notes`.
- **Deletions were marked at the top of the file.** A change that only removes lines gives git
  nothing on the new side to anchor to; the hunk header carries it and was being ignored.
- **Non-ASCII filenames came back from git quoted and octal-escaped**, so those rows in Recent
  and Mine matched no file and would not open.
- **`mdhouse -o` opened two tabs** — the launcher opened one and passed `-o` to the daemon,
  which opened another.
- **A transient control-socket error deleted the socket** of a daemon that was still running,
  after which no `mdhouse` could reach it.

### Removed

- **The Ignore button** in the tree. It wrote a mark nothing read, and had no way to undo
  itself. The mark stays in prefs; the feature needs designing before it has a button.

### Internal

- The test suite is typechecked now — `tsconfig.json` covered only `src/`.
- `.git` is watched when it sits above the root, so serving a subdirectory of a checkout still
  goes live on commit.


## 0.3.3 — 2026-09-29

The sidebar shows file sizes and makes stubs stand out.

- **Sizes.** Every file shows its size in at most three digits: `87`, `1.1K`, `150K`, `1.2M`.
  Bare numbers are bytes. The compact sidebar leaves the size off files that carry a stub mark.
- **Stubs.** A file under 101 bytes gets a white **∅** on hot pink, and one under 500 a white
  **S** on violet. Its name is struck through. The mark appears in the tree and in search,
  Favorites, Recent and Mine.
- **Empty files** are left out of the tree and its folder counts.
- **No page icon on file rows.** Every row is Markdown, so the icon said nothing, and it looked
  like the folder icon. Names move left into its space. A favourite's star now sits in the
  chevron's slot.
- **Folders** are dark brown, with bold file counts. The folders above the open document are
  bold.
- **Favicon** redrawn as the logo's house, with its source kept in `doc/favicon.svg`.

## 0.3.2 — 2026-09-17

- A logo, at the top of the README and in front of every document title.
- Relative `<img src>` inside raw HTML now resolves. Before, the logo was a broken image in
  mdhouse while GitHub showed it fine.

## 0.3.0 — 2026-09-17

0.2.0 was never published; this release replaces it.

- **Diffs on the document page.** The document can be shown as a patch, or as the whole document
  with the change marked on it: added blocks tinted, deleted text put back struck through.
  Patch lines are rendered as Markdown. Uncommitted files open on their diff. Rows in the
  history panel open that commit's change.
- **Runs in the background** until `mdhouse exit`, with output going to syslog.
- **A second `mdhouse <dir>`** hands its directories to the server already running on that port.
- **The root switcher** is available in every sidebar state.
- **The contents list** appears from two headings, down from three.

## 0.1.2 — 2026-09-16

- Opening a document no longer waits for git to find the file's first commit. The document
  loads in 10 ms instead of 950 ms, and authorship arrives with the history panel.

## 0.1.0 — 2026-09-14

First release. A Bun server that browses and searches every `.md` and `.mdx` file under a
directory. It is read-only unless started with `--rw`.

- **Browse.** A sidebar tree, cycled between bar, compact and open with `Ctrl+B`. It covers
  git-tracked files, plus untracked files git does not ignore, and falls back to a directory walk
  where there is no repository. It also works in a directory its own repository ignores.
- **Search.** File names match as you type. Full text goes through ripgrep, and a hit opens the
  file at its line. Chips narrow it to names or contents, and to recent files or your own.
- **Recent and Mine.** Uncommitted work first, then the files touched by recent commits, with
  modification times filling in when git runs out. Each row shows file, folder and commit
  subject, and `❖` marks your own work. Ages are coloured by heat.
- **Favorites**, plus mute and ignore marks.
- **Document page.** A breadcrumb, the original and last author, a table of contents (the H3
  level can be toggled), per-file git history, and a full-width toggle. Headings get one colour
  per level.
- **Front page.** What changed in this root, grouped by commit, with your own commits
  highlighted.
- One mdhouse per port.
