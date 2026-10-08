# Changelog

## 2.0.3 — 2026-10-08

### Fixed

- A finding's line ending in `\` showed the `\` (`… terminal \` before `Evidence:`)
- `> t:` / `> a:` … inside a quote opening with a glyph (`> ⚪ A17 …`) are read too

## 2.0.2 — 2026-10-08

### Added

- `> q:` / `> a:` read as `> Q:` / `> A:`; `> T:` / `> t:` / `> [!TIP] t` (text on the line; a bare `[!TIP]` stays an alert) → `> 💡` (a tip); `> ! x` → `> 🟠 x`, `> !! x` → `> 🔴 x`
- A quote opening with a severity — `> 🟠 …` — is an issue, as a list item is
- [Syntax](doc/syntax.md) — every syntax mdhouse reads, on one page

### Fixed

- `\` at the end of a line or `\ ` is a line break — in questions and answers too

## 2.0.1 — 2026-10-08

### Added

- `--host-name <name,…>` — behind a reverse proxy (nginx → `notes.example`): only these names get
  in, localhost and IP addresses are refused; saved. `--host-name reset` undoes it

### Changed

- `--allow reset`, `--auto-rw reset` clear the saved list (`none` still works)

## 2.0.0 — 2026-10-08

Breaking: addresses lose `/d/` — `/d/…` links redirect (301); a folder can no longer be named
`api`, `ws`, `vendor`, `settings`, `d` … as a root id (it gets `-2`). 1.5.0 was never published: its
changes are here.

### Changed

- **Breaking — addresses without `/d/`:** `/<root>/<path>` — `/mdhouse/doc/access.md`,
  `/mdhouse/doc/`; the root's id always leads. Old `/d/…` links → 301 to the new address. A folder
  named `api`, `settings`, `d` … gets a suffixed id (`api-2`)
- **Every file opens at its own address** — `/mdhouse/src/cli.ts` highlighted with line numbers
  (`#L557` lands on and marks the line), `/mdhouse/doc/logo.png`, PDFs, video, audio; HTML
  rendered sandboxed, ⟨/⟩ shows its source; anything else: type, size, Download. Header, ★ / mute,
  copy link, ✎ (at the line), History and the patch work for every file; a file over 300 kB is shown
  plain, not highlighted
- Links in a document to any file — `cli.ts`, `logo.png` — open its page; a mention `src/x.ts:3`
  opens it at line 3
- Folder page ALL and the git view (Files, commit files, changed files) open every file's page;
  the links to GitHub & co. are gone
- Nothing under `.git` is shown
- A document's meta line no longer shows `RW` — the sidebar has it
- **One Q&A markup** (`.claude/skills/markup.md`): a list item opening with a glyph — `- ❓ …`,
  `- 🔴 D1 …`, `- ✅ 🟠 …` — or a `> ❓` quote; its thread quoted under it, one `💬` per turn,
  badges `👤name` `👾`; options `( )` / `[ ]`; `💡` proposals; 🎯 selected
- Settled items (✅ 🚫 ⏸️, an answered ❓, 🔵 notes) fold, muted; open questions and 🔴 / 🟠 issues
  are tinted; an issue id (`B44`) is the item's anchor
- A strip over a page with items: the total, 🔴 🟠 ⚪ ✅ 🚫 🎯 — counts and a filter; ✅ done, 🚫 closed
  not as ✅ (🚫 ⏸️ 🔵); a level with 0 is not shown
- An issue's 💡: ✓ accept (the agent does it) / ✗ ignore (the issue closes 🚫); a question's: ✓ agree / ✗ cancel (the question closes 🚫)
- The old forms — `> ?`, `> [!QUESTION]` / `[!ANSWER]`, `**Q:**` / `**A:**`, `::: q` / `::: a`,
  ☐ ☑ ☒ — are read as the new markup; the next write to the file writes it converted
- Answering on the page (`--rw`): an item's first glyph, its 💬 / 💡 buttons and its replies open
  a form — 💬 save, then ✅ 🚫 ⏸️ ⏳ ⚠️ 🎫 🔍 🎯 (Alt+1…9), ESC, `[ ] 👤` signs the reply; ✓ agree / ✗ cancel on a
  💡 answer at once (💬 reply opens the form); a click picks `( )` or ticks `[ ]`; ✓ done; 🎯 and a double-click select; a click on a reply edits
  it. Alt+E and ✎ open the file at the item. The signer: `settings.me`, else git, else the login
- A file named in a document — `Plans/README.md`, `src/server.ts:557`, `CHANGELOG.md` — is a green link to it
  when the file exists; `:557` goes to that line
- `CHANGELOG.md`, `setup.py`, `run.sh` are no longer linked as web addresses (.md is a country zone);
  `github.com/…` still is
- With the sidebar closed, the top strip has no folder dropdown (it did not work there)
- A link to a folder without its trailing slash (`[x](sub)`) opens the folder page, not "not found"
- A document's History panel stays hidden (or shown) for every document, kept per browser like wide mode
- Leaving a document with a form open keeps the draft; back on it, the form opens again with it
- A tick or an answer always goes to the document on screen, even when the previous one had the
  same HTML
- Check & Save is gone: closing an item is ✅ in its form; a plain `- [ ]` is ticked, not answered
- `mdhouse user-add <login>` asks for the password (echo off) or reads it from stdin — not in
  shell history or the process list; `<login:pwd>` still works
- A folder page and its git view share one header: logo; the folder name (folder page → its
  git view, git view → the folder page); GIT / Favs / Recent / Mine / Commits / Files and ⚙ on
  the right, links each — the tab is in the url (`?git=favs|mine|commits|files`)
- A folder page and its git view honor wide mode
- A folder page: **ALL | MD** over the size column — every file under the folder, or Markdown only;
  images and text files open in a tab, the rest are listed
- Folder page table sized by its content: age and size right after the names
- Git view: Unpushed commits fold (▸ in its heading), remembered
- Commits tab: an `unpushed` badge on each commit not on origin; the Unpushed commits block is
  left out there
- History: a file changed locally has an **Uncommitted changes** row on top (+x −y), shown
  even with the panel hidden; a click shows the changes
- **Reset file** in the head of a document's uncommitted changes (`--rw`): back to the last
  commit, after a confirm — `POST /api/git/reset`
- A document's header: a git button before ✎, to the root's git view (inside a repo only)
- A document's title: the folder page's size and logo, in the same dark green
- Settings: each folder's name links to its folder page
- The ❓ / ⁉️ / 💬 / heading-add buttons close their open form when clicked again, as Cancel does
- List items opening with a severity glyph — `🔴 🟠 ⚪ 🟢` — can be answered too
- A linked `.html` file opens rendered, sandboxed — its scripts run, but cannot reach mdhouse;
  `.css`, `.scss`, `.sass`, `.less` open as text
- The npm package leaves out the README screenshots (833 kB → 184 kB); npmjs shows them from GitHub

### Fixed

- A favorite or muted file that no longer exists: its "Can’t open that" page offers ★ Remove from
  favorites / Unmute
- A read of `prefs.json` while another mdhouse process saves it no longer sees half a file and
  moves the config aside (saved folders, users and the allow list kept)
- A hand-edited `prefs.json` root entry without all three mark lists no longer makes that folder
  fail to open (500)
- A save keeps `prefs.json` keys this version does not know; a `prefs.json` from a newer mdhouse
  (`version` above 1) is read, never written over
- `prefs.json` is written 0600 (its folder created 0700): other local users can no longer read the
  password hashes
- A symlinked `prefs.json` (stow, chezmoi) stays a link; a save writes its target
- Two mdhouse processes saving `prefs.json` at once (the service and `-p`, `--allow`, `user-add`)
  no longer lose a change: `prefs.json.lock`; one left by a killed process is taken over after 2 s
- A root inside a repo lists the repos nested below it, and a repo lists its submodules — was an
  empty tree
- The ALL view of a folder its repo ignores lists its files, as the tree does
- Search finds what the tree lists: dot-folders (`.github/`, `.claude/`) and `.Md` / `.MDX` in,
  denied folders (`dist/`, `vendor/`, `.mdhouseignore`) out
- A History row older than a rename shows its change, not "No changes"; the rename commit shows
  the rename, not the whole file as added
- A root in a linked worktree (`git worktree add`) updates on a commit — badges and recents were
  stale
- An edited `.mdhouseignore` or `.gitignore` applies at once — was on restart / the next `.md` change
- A document open no longer runs the show-ignored scan when the setting is off (big ignored trees:
  ~240 ms → 0); a root of many repos asks them in parallel (40 repos: ~225 → ~50 ms)
- The git view's Files tab lists the first 5000 files and says so — 100k tracked files froze it
  (2.7 s, 1.9 MB → 0.4 s, 94 kB)
- A folder or file named `:memo` or `notes[1]` shows in every git view; Reset of `notes[1]/b.md`
  no longer also resets `notes1/b.md` (nor `:memo/a.md` → `memo/a.md`)
- A `{word}` at the end of a line stays on the page (`GET /users/{id}`, a `{placeholder}`, a table
  cell); only `{#id .class key=value}` is an attribute list
- A tick, an answer or an added block is written whole or not at all: a write cut short (disk
  full, a crash) leaves the document as it was
- An SVG in a served folder, opened on its own, can no longer run its scripts as mdhouse — every
  `/api/asset` reply is sandboxed
- A tick, an answer or an add on a document that is gone (renamed, deleted, another branch) says
  404 "not a document" instead of "internal error"
- **Reset file** throws away only the changes it showed: a file saved again since is kept, and the
  page says so
- Commit and pull no longer write past a `--rw` folder: commit refuses a change outside it or in a
  read-only folder, pull a repo that holds a read-only folder or files outside it (409)
- A document URL renders Markdown only: `/d/<root>/.git/config` and other non-Markdown files are 404
- `mdhouse <dir> --rw` for a folder already writable by auto-rw keeps it writable when auto-rw is
  turned off
- `--host ::1` prints and opens `http://[::1]:<port>`, a valid URL
- ⇊ (add at the end of a section) finds the section as the page shows it: a `#` in an HTML comment
  or a fence is no heading, a setext heading ends a section, a two-line setext heading takes a block
- A document that opens with a `---` rule shows its text: front matter is a `---` line, a YAML key
  right after it, through `---` or `...`
- An alert that quotes something keeps the rest of its text inside the box
- A code block over 100 KB is shown plain, not highlighted: a pasted log or dump no longer takes
  seconds and tens of MB per view
- An added block that starts with Enter no longer opens with an empty line
- A file with mixed line endings: an answer or an added block takes the ending of the line next
  to it and changes no other line; answering at the end of a CRLF file without a final newline
  writes CRLF
- A link with an encoded slash (`a%2Fb.md`) is left as written, not turned into a path
- `--rw` and `-p` apply to the folders named only: `mdhouse -p --port <n>` keeps each saved
  folder writable or read-only as it was saved
- `-p` on a port held by something else saves nothing — neither the folders nor the port
- Handing folders to a running mdhouse names the flags it did not apply (`--host`, `--no-git`,
  `--git-log`, `-a`): they take effect after `mdhouse exit` and a fresh start
- A stopped (Ctrl+Z) or hung mdhouse no longer hangs `mdhouse exit`, `exit --all` or a start:
  they say "not answering" within 2 s and exit 1
- A `--fg` on another host but the same port no longer takes the running mdhouse's control socket
  (which left that one reachable only by `kill`); it says `mdhouse exit` cannot reach it
- `journalctl -t mdhouse -f` shows the systemd service too (`SyslogIdentifier=mdhouse`; it was
  tagged `bun`) — an installed unit: `mdhouse service install`, then
  `systemctl --user restart mdhouse`
- `service install` with `MDHOUSE_PORT` set, or `--port 7777` over a saved port, pins that port into
  the unit: it listens where install stops and pings, not on the saved port
- `service install` stops a hand-started mdhouse only after `systemctl daemon-reload` succeeded:
  a failing systemctl leaves it running
- `--git-log` takes a positive whole number, else exits 2 — `abc` silently turned git recents off
- Under systemd the start banner says `systemctl --user stop <unit>`, not `mdhouse exit` (which
  refuses the unit)
- Without journald, a syslog file this user cannot read (`/var/log/messages` on Fedora) is no longer
  offered as the log; the hint says to run it with `--fg`
- A slow refresh of the open document no longer replaces the page you moved to; an older search
  answer no longer replaces the one for the query in the box
- A commit from a terminal or an agent updates the open document: its "Uncommitted changes" row
  goes, its History shows the commit
- A document's ★ / mute marks the document's own folder, not the one picked in the switcher
- The front page keeps its scroll when a file changes — was thrown to the top on each write
- A folder page filter's `_` matches an emoji too
- The folder switcher writes `~` for the home folder when `$HOME` ends in `/`
- At ≤720px the sidebar lies over the page, which keeps the whole width (a 400px phone had an 80px
  text column); a tap beside it closes it
- Every file in the tree, search, Favs / Recent / Mine, the front page, folder pages and the git
  view, and a document's breadcrumb folders, is a real link: middle-click, Ctrl-click and copy link work
- `mdhouse exit` no longer stops the systemd service — it would stay down, and the next
  `mdhouse <dir>` started a copy outside systemd; it names `systemctl --user stop …` instead
- The service, with its port taken, fails so systemd retries, instead of handing its folders to
  whatever copy holds the port and ending "successfully"
- A login that does not exist answers as slowly as a wrong password — the delay no longer tells
  which logins exist
- `limit` that is not a number (`/api/search`, recents, digest, history) falls back to the default
  cap instead of no cap
- **Reset file** waits for a commit / pull / push in the same repo, as they wait for each other
- A favorite path and a commit message have a length cap (413)

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

1.1.0 and 1.1.1 were never published; their changes, below, are part of this release.

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

## 1.1.1 — never published

The first release that writes — tick a checkbox in a `--rw` folder and that line is saved — and
a much richer Markdown: `/rd`-style alerts, question / disagreement / answer blocks in four
forms, and two new docs. Neither 1.1.0 nor 1.1.1 reached npm: they shipped in 1.2.0.

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

## Before 1.0

The 0.x betas: [`Plans/done/CHANGELOG-beta.md`](Plans/done/CHANGELOG-beta.md).
