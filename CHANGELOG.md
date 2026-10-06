# Changelog

## Unreleased

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
