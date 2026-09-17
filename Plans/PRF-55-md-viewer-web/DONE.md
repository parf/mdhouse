# DONE

Sections **A–M** follow the plan's own lettering in [`TODO.md`](TODO.md); **N** is everything
done after Phase 1 shipped that was never on it.

Two trees recur in the verification notes. **The docs tree** is the primary target: about a
thousand `.md` files in one repository, with tables, nested lists, task lists, `<details>`
blocks and Cyrillic text. **The scratch tree** is a directory its own repository ignores —
the case where git can see nothing at all. `~/src` is a folder of ~30 sibling repositories,
which is what proves multi-repo discovery.

## A — Scaffold
Bun project with TypeScript strict mode and Preact JSX; dependencies pinned
(`markdown-it` + anchor/attrs/footnote, `preact`, `shiki`). `package.json`, `tsconfig.json`.

## B.1–B.3 — Roots and the file list
`lib/roots.ts` (registry, path jail, write chokepoint, URL mapping),
`lib/ignore.ts` (deny list seeded from r-doc's `docsSkipPatterns()` plus `.mdhouseignore`),
`lib/scan.ts` (`git ls-files` per repo, directory walk elsewhere).

Measured: **the docs tree** 1 036 files / 51 ms, 1 repo. `~/src` 1 051 files / 172 ms,
30 repos discovered in one shallow pass. Both correctly reported non-writable.

## C — Rendering
`lib/render.ts`. Verified on `Plans/RLM-1125-attom-tax-assessor/TODO.md` (9.4 KB, 70 ms,
10 headings, Cyrillic slugs, local `.md` links rewritten) and on a synthetic fixture covering
GitHub alerts, nested task lists, pipe tables with inline HTML, mermaid passthrough, and a
fenced language (`rust`) loaded on demand.

Nested lists and multi-line blockquotes render correctly — both are r-doc parser failures.
`data-line` lands on every block element as designed.

## D — Search
`lib/search.ts`. ripgrep `--json` driver, streamed and capped, plus an in-process fallback.
Verified against **the docs tree**: `?q=owner2_name` returns 16 hits across **6** files,
matching `rg -l owner2_name --glob '*.md'` exactly.

Bug found and fixed during verification: ripgrep reports match offsets in **bytes** while
JavaScript strings index in UTF-16 code units, so highlights slid off the match on Cyrillic
lines. `byteOffsetMapper()` converts per line; regression tests cover both engines.

## E — Git and recents
`lib/git.ts`, `lib/store.ts`. One `git log --name-status` and one `git status --porcelain`
per repo; committer filtering client-side.

Bug found and fixed: a literal NUL cannot travel inside an argv string, so the record
separator truncated `--format` and every query returned nothing. Git's own `%x00` / `%x1f`
escapes fixed it. 465 markdown changes parsed from a 1 300-file repository in 48 ms.

Verified: 30 repos under `~/src` aggregate correctly; per-file history returns 13 commits
for `Plans/RLM-1125-attom-tax-assessor/TODO.md`.

## F — Server and client
`server.ts`, `cli.ts`, `app.tsx`, `ui/*`, `styles/app.css`. Every endpoint exercised:
roots, tree, doc, raw, asset, search, recents (both kinds), git/log, marks. Path jail returns
403 for `../../../etc/passwd`. Multi-root mode tested with `~/src` + **the docs tree**
together, including the root-prefixed URL form.

Two fixes during bring-up: `ui/tree.ts` collided case-insensitively with `ui/Tree.tsx` and
broke the bundler's resolver (renamed to `tree-model.ts`); mermaid was being inlined into the
bundle at 5.4 MB, so it is now served from `/vendor/mermaid/` behind a runtime URL import —
the app bundle is **62 KB**.

All three sidebar states confirmed in the browser: `off` collapses to the single top strip
with the document path, `compact` is navigation only, `open` adds search, tabs and filters.

## G — Live channel
`lib/watch.ts` + WebSocket. Confirmed: writing a file in a watched root pushes
`{"t":"fs","root":"mdhouse","paths":["Plans/PRF-55-md-viewer-web/TODO.md"]}` to a connected
client, with no polling.

Fix during verification: the client effect listed changing values in its dependencies, so the
socket was torn down and reopened on every data load. The handler now lives in a ref and the
connection is opened once.

## B.4 — Marks
`lib/prefs.ts`. Favorite / muted / ignored persisted to `~/.config/mdhouse/prefs.json`, keyed
by absolute root path. Confirmed working on a **read-only** root, which is the point
of keeping them outside the tree.

## H — Phase 1 shipped
README rewritten. 27 tests across roots, render and search; `tsc --noEmit` clean.

Read-only proof: after a full browsing session against **the docs tree**,
`git -C <tree> status --porcelain` is empty — zero modified, zero untracked.

Startup on the primary target: 1 036 files ready in ~50 ms, well inside the budget.

## H.1 — Sidebar navigation in compact
The tab strip was gated on the open state, so recents and favourites were unreachable
without widening the sidebar first. It now renders in compact too, icon-only; search and the
committer/ignored filters stay open-only because they need the width. Hit rows drop the
directory line and the commit subject at compact width.

Favourites became a tab of its own rather than an inline group inside the tree, reading the
stored mark list (`TreePayload.marks`) instead of per-file marks: a directory rule such as
`Plans/` marks the 797 files beneath it, which would otherwise flood the list with entries
the user never picked. Directory favourites render as one folder row.

Added a **Mine** tab: the git recents already fetched, filtered to the current git identity
(by email, falling back to the name). No extra request — it is the same payload the Git tab
uses, which is why committer filtering was kept client-side in E.

Verified in the browser at compact width: all five tabs switch, Mine lists only
`parf@realmo.com` commits, Favourites shows `Plans/` as a single row.

## H.2 — One recents list
Filesystem recents (mtime order) and git recents (commit order) were two tabs showing mostly
the same files in a different sequence. They are now one list: **uncommitted work first**,
newest mtime first, then the files touched by the last N commits, deduplicated against it.

Uncommitted entries are colour-coded by git status — amber `modified`, green `new`, blue
`staged` — with a left rule that survives the compact width, where the status word is the
first thing cut. Deleted files are left out: there is nothing to open.

All uncommitted work counts as the user's own — nobody else's edits are in your working tree
— so *Mine* is uncommitted plus commits matching the git identity, and needs no committer
filter of its own. The committer dropdown stays on *Recent*.

`Store.recentsFs` / `Store.recentsGit` collapsed into `Store.recents`, `/api/recents` lost its
`kind` parameter, and the client holds one array instead of a record of two.

Verified against `~/src`: 8 untracked files sort above 72 commit entries; touching
`mdhouse/README.md` makes it appear as `modified` through the watcher without a reload.

## H.3 — Reading a recents row at a glance
Three small things, all about the compact width where a recents list is a column of
`README.md` / `TODO.md` / `DONE.md` rows that look identical:

- **`❖` marks your own rows** in *Recent* — uncommitted work plus commits matching the git
  identity. It takes the status colour on uncommitted entries and the accent colour otherwise.
  *Mine* does not draw it: everything there is yours already.
- **The parent folder is shown** when the full path is not, right-aligned so the folders line
  up as a column, in a smaller face than the file name, and the first thing trimmed when the
  row runs out of room.

Verified in the compact sidebar against **the docs tree**: rows read
`❖ DONE.md · RLM-1125-attom-tax-assessor`, and Kirill's commits are unmarked.

## K.1 — Per-file git history
The panel the r-doc viewer gets right, rebuilt: who created the file, and the last 20 commits
touching it with author, age, short hash and the lines added and removed. It sits to the
right of the table of contents and both stack when the column is narrow.

`--follow` chases renames, which matters in this tree: a plan folder is renamed when its
ticket is. One `git log --follow --numstat` per open panel, fetched only when the panel is
first expanded — a reader who never asks never pays. A second process runs only for a file
whose history is longer than the window, to find the creating commit.

`fileHistory()` now returns `{commits, created, truncated}` with `added`/`deleted` per commit.

## N.1 — Clickable breadcrumbs
The directory crumbs above a document title are buttons: a click switches the sidebar to the
tree, expands the path down to that folder, scrolls it into view and flashes the row. There
is no directory page to link to — the tree *is* the directory view.

## D.1 — Search filters
Four chips under the search box: **names** and **contents** choose which half of the result
is shown — turning contents off also stops the request, since name matching never needed the
server — and **recent** / **mine** narrow both halves to the files the neighbouring tabs
list. They reuse the recents payload rather than asking the server a second question, so
"search within recent" means exactly what the Recent tab means, and the filter is instant.

Verified on **the docs tree**: `nginx` matches 93 lines in 41 files; with *recent* on, 6
lines in 1 file, matching the recents list by hand.

## B.5 — A root its own repository ignores
Pointed at **the scratch tree**, mdhouse listed nothing. The repository's own `.gitignore`
ignores that directory, so `git ls-files -co --exclude-standard` correctly reported zero files
for the whole root — and the scanner took that as the answer.

Git is not wrong: nothing there is tracked and nothing there will be. But the user pointed
mdhouse at that directory deliberately. `scanRoot()` now asks `git check-ignore -q .` for the
root itself and, when the repository ignores it, falls through to the filesystem walk instead
of the git listing. `repos` stays empty for such a root, which is accurate — an ignored
directory has no history, so recents and the history panel correctly offer nothing.

Verified: **the scratch tree** 13 files, matching `find <tree> -name '*.md' | wc -l`. No
regression — **the docs tree** 1 047 / 1 repo, `~/src` 1 039 / 26 repos. `test/scan.test.ts`
covers both halves: a tracked root ignores its `tmp/`, and that same `tmp/` as a root lists
its files.

## B.6 — Recent on a root git knows nothing about
**The scratch tree** listed its files but had an empty Recent: with no repository there is no
working status and no log, and the mtime list had been dropped when the two recents tabs were
collapsed into one.

`Store.recents()` now tops the list up by modification time once git has said everything it
has to say. A root git covers fully is unaffected — the commits fill the limit first. A file
in no repository is untracked by definition, so it is labelled and coloured as such, which
also makes it yours: nobody else has a claim on a file that was never committed.

Verified: **the scratch tree** 13 entries, newest first, all marked untracked; **the docs tree**
unchanged at 80 entries, all from commits.

## H.4 — Recents rows, three lines
A recents row now reads as three lines instead of a name with a trailing dump of metadata:

```
❖ TODO                         13 min ago  Serg Parf
Plans/**RLM-1125-attom-tax-assessor**
RLM-1125: preserve absent ATTOM fields and recover …
```

The file name is a link colour, the age and committer sit at the right edge of the same line,
the containing directory gets a line of its own in the body colour with the *last* folder in
bold — in a column of `README` rows from a dozen plan folders that segment is the only part
carrying information — and the commit subject is clamped to one line with the full text in
the tooltip, so a row is always exactly three lines tall.

`.md` is dropped from every file name shown in the sidebar: in a viewer where everything is
Markdown the extension is three characters of noise. `.mdx` keeps its extension, where the
distinction still says something.

The uncommitted colour coding moved to the left rule and the status tag, since the file name
now carries the link colour instead.

## N.2 — Authorship in the document header
Beside the age, the document header now names who wrote the file and who last touched it:
`6 d ago · Serg Parf … Iaroslav Argunov`, collapsed to a single name when they are the same
person — which inside one plan folder they usually are.

`authorship()` runs the two `git log` shapes in parallel: `-1` for the newest commit, and
`--follow --diff-filter=A --reverse` for the commit that added the file, so a rename does not
reset a document's authorship. Both are `-1`-shaped, because this runs on every document open;
the heavier `fileHistory()` is still what the history panel asks for when it is expanded.

A root git knows nothing about reports no authors, and the header simply omits them.

## N.3 — H3 in the table of contents
The contents list shows H1 and H2, which is right for most documents and wrong for the long
reference ones: a heading like `### Advanced: Z-order curves (Morton codes)` was reachable by
URL fragment but invisible in the ToC.

An `H3` chip in the contents header widens the list to three levels and back. It only appears
when the document has H3 headings at all, it resets to the default on every document — a depth
is a per-document choice, not a mode — and its click handler stops the event, since a click
inside a `<summary>` would otherwise fold the whole section away.

The ToC's visibility threshold counts to three levels too, so a document whose structure lives
entirely in H3 now gets a contents list instead of none.

Verified on `.claude/GeoQ.md` (1 H1, 11 H2, 12 H3): 12 entries by default, 24 with the chip on,
and the previously-missing anchor present in the widened list.

## N.4 — Full-width reading
A fit-to-width button in the document meta line drops the 900px measure and lets the document fill
the pane, keeping the 30px side padding. Prose reads better in a column, which is why the cap
is there — but a document that is mostly wide tables or long code lines would rather have the
window, and `.claude/GeoQ.md` is exactly that document.

The choice survives navigation: it is a way of reading, not a property of one file. It is not
persisted across reloads, which keeps the default honest for a page someone opens from a link.

The control is an inline SVG like every other icon in the header rather than a text `<=>`:
two margins with an arrow pushing out to them, reversed to point inward once the document
already fills the pane.

## N.5 — Contents list, styled by depth
The ToC distinguished levels by indentation alone, which reads as one grey block once a
document has twenty headings. Depth is now carried by weight and colour as well: H1 bold in
the body colour with a little air above it, H2 medium grey, H3 smaller and fainter with a
short tick before it so a third-level row is recognisable without measuring its indent.

Rows became full-width links with a hover background, so the click target is the row rather
than the words.

## N.6 — The front page
`/` used to say "pick a file on the left". It now shows what changed in this root, grouped by
**commit** rather than by file — the sidebar's Recent tab answers *which files changed*, this
answers *what was done*, and a commit carrying its subject plus the four plan files it touched
says more than those four files listed separately.

- **Favs / Recent / Mine** across the top, Recent by default. Favourites read the tree's
  resolved per-file marks, so a starred *folder* contributes its files without re-implementing
  the directory-rule matching. Mine filters by git identity, and keeps all uncommitted work.
- **Uncommitted** first, as `dir/file — status — age`.
- **Commits** below: subject clamped to two lines with the age and committer beside it, then
  the documents that commit is the newest change to. A file appears exactly once, under its
  newest commit, and **a commit that contributes nothing new is dropped entirely** — on a busy
  day twenty commits touch the same four plan files and nineteen of those rows say nothing.
- **No git at all** — a root outside any repository, or one its repository ignores — falls back
  to the twenty most recently changed files, rather than an empty page.

The root name in the sidebar header is the link to it. The page refetches on live events.

Verified: **the docs tree** 28 commit cards (9 under *Mine*), **the scratch tree** 13 files under
*Recently changed*, and the empty states differ per view.

## N.7 — Age as a temperature
Every "3 h ago" in the app now goes through one `<Ago>` component that colours the label by how
recent it is, so a column of timestamps reads as a gradient before a single one has been read.

Five buckets, the ones people actually think in: **under ten minutes** (bright red, with a 🔥),
**this hour** (burnt orange), **today** (amber), **this week** (the ordinary muted grey), and
**older** (faint). The flame is the point — something touched in the last ten minutes is
usually the thing you opened the page to find — so it is suppressed only in the per-file git
history, where every row is a commit and the newest one is already first.

Used by the front page (uncommitted, recently-changed and commit cards), the sidebar's Recent
and Mine tabs, and the document header.

## N.8 — One table for the whole page
The front page's three ragged runs of text became a single `<table>`: **directory | file | age**.
Section titles and commit headers are rows that span all three columns; everything else is a
file row.

One table rather than one per commit is the point. A table per commit sizes its own columns,
so the file names step left and right down the page; sharing one means the directory, the name
and the age each keep a single position from the top of the page to the bottom.

- The directory is **right**-aligned against the names, with the last segment bold, so every
  file name starts on the same straight edge and the folder reads as the label of a group.
- A run of files from the same folder states it **once**, via `rowspan`, restarting at each
  header. Eight repetitions of `my-daily-work-review` were what made the list hard to scan; the
  folder is only worth printing where it changes.
- File rows under a commit leave the age cell empty — the commit's own age heads its block —
  but the cell stays, so the columns hold.
- **Every commit line is a band** — its own background, border and rounded top — so the page
  reads as blocks of work rather than one long list.
- **Yours are green**, and carry the **❖** the sidebar already puts on your files. The band
  alone is enough — the file rows under it stay plain, so the page keeps one reading colour.
  A page of a team's work shows your part of it without the Mine tab, and the symbol says it
  where colour alone would not.

Verified on **the scratch tree** (13 rows collapsing to three directory cells: ×5, `/`, ×7,
every file name on one left edge) and on **the docs tree** (28 commit cards, files by folder,
the five commits of the current author tinted).

## N.9 — One mdhouse per port
Bun turns `SO_REUSEPORT` on by default, so a second `mdhouse` binds a port that is already
serving and the kernel splits requests between the two processes. With two trees open on 7777,
roughly every other request landed in the wrong one and the document it asked for was "not
found" — the tree in the sidebar and the document being fetched came from different servers.

`Bun.serve` now passes `reusePort: false`, and the CLI turns the resulting `EADDRINUSE` into
the message that actually helps: *port 7777 is already in use — another mdhouse is probably
running there. Use that one, stop it, or pass --port <n>.*

## N.10 — History opens itself
The git history panel waited for a click. It now renders open and fetches as soon as the
document is up, because the click bought nothing: the document was already on screen, so the
only thing the wait produced was a wait.

It stays its own request — a `git log --follow --numstat` on a long history is slow enough
that the document must never queue behind it — and collapsing the panel still means the next
document skips the call.

## N.11 — Five revisions, not twenty
The history panel asked for twenty commits. On `claude-worklog.md` that filled the whole right
column and turned the page into a history browser with a document attached. It asks for **five**
now — the panel answers "what happened to this file lately", and five answers it — with the
creating commit and an "older commits exist" line still below them. `/api/git/log` takes a
`limit` (1-50) for anything that wants more later.

## N.12 — Say the authorship once
The header said "6 d ago · Andrei" and the history panel repeated it as "created by Andrei,
1 mo ago". Now the header carries both halves — **`6 d ago · Andrei (1 mo ago) · 73/74 done`**,
last change above, the name that started it and when beside it — and the panel is five commits
and nothing else: no creation row, no "older commits exist".

That also costs one git process less per document. `fileHistory()` is a single `git log` now;
the creating commit comes from `authorship()`, which the page fetches anyway for the header.

## N.13 — The document stops waiting for git
Opening a document took **950 ms** of which 930 was one git command. `/api/doc` called
`authorship()`, whose second half is

    git log --follow --diff-filter=A --reverse -- <path>

— the commit that created the file. `--reverse` cannot stop early: git has to walk to the root
of the history to know which end is the oldest. On a 108 000-commit repository that is most of
a second, spent before a word of the document is rendered, for two names in the header.

Authorship moved to the history request, which the page already fires separately, and the
`Doc` component now owns that one request and feeds both the header and the panel from it.
`Store.authorship()` caches the answer per file and the watcher drops it when git moves — the
creating commit is the same answer every time until something changes.

| | before | after |
| --- | --- | --- |
| `/api/doc` | 950 ms | **10 ms** |
| `/api/git/log` | 20 ms | 1.5 s first, **20 ms** cached |

Measured on a 33 KB document in a 108 000-commit repository. In the browser the document now
paints on the first frame and the authorship line and history panel fill in behind it.

## N.14 — A contents list from two headings
The table of contents appeared only above **three** H1–H3 headings, so a document with exactly
two — a title and one section — lost the whole panel, which reads as a bug rather than as a
rule: the history panel beside it stays, and the page looks like the contents list broke.

The threshold is now two. A two-line contents list is cheap; a panel that vanishes without
explanation is not.

## N.15 — A second mdhouse hands over its directories
`mdhouse <dir>` on a port already serving used to be an error telling you to pick another
port. It now asks the daemon that holds the port to serve that directory as well, prints the
URL and exits 0 — the command ends on a page, which is the only thing anyone runs it for.

**It adds; it never replaces.** A tab open on one tree should not turn into a different tree
because a terminal somewhere ran another command: the reader loses their place, the open
document 404s and nothing says why. mdhouse already serves several roots with a switcher, so
the new directory simply joins them. `Registry.add()` is the new door — an already-served
directory returns the root it already has rather than a duplicate.

**No key, no signature, no clock.** Control goes over a unix socket at
`~/.config/mdhouse/control-<port>.sock`, mode `0600`: the only process that can ask a daemon
to do anything is one running as the user who started it, which is what a shared secret in
that same directory would have been standing in for. A browser cannot open a unix socket, so
the CSRF and DNS-rebinding routes into a local HTTP control endpoint do not exist. A socket
file left behind by a `kill -9` is detected and removed rather than blocking the next start.

Open tabs hear about it: the daemon publishes `{t:'roots'}`, the client refetches the root
list and reconnects — which is how it subscribes to the new root's topic, so live updates work
on a tree added an hour after the server started. Verified end to end: edits to a file in a
root added at runtime arrive as `{"t":"fs","root":"livetest","paths":["a.md"]}`.

The CLI says which is which: `+` for a root just added, `·` for one already served, and a note
when `--rw` was asked for a tree the daemon is already serving read-only — writability belongs
to the root that exists, and pretending otherwise would be a lie about what it will let you do.

## N.16 — It runs in the background, and `mdhouse exit` stops it
`mdhouse <dir>` used to hold the terminal until Ctrl+C. It now starts the server detached and
returns: the launcher waits until the daemon answers on the control socket, prints the URL,
the roots, the pid and the line telling you how to stop it, then exits 0.

**Detached properly.** The spawn goes through `setsid`, so the daemon gets a session of its
own: closing the terminal does not take it with it, and a later Ctrl+C in that terminal never
reaches it. Without `setsid` (macOS has none) a `detached` child still outlives its parent,
which is the part that matters.

**Output goes to syslog**, through `logger -t mdhouse`, not to a file of our own — a
background process that writes somewhere only it knows about is a process whose failures
nobody reads. `journalctl -t mdhouse -f` follows it; the start banner, the read-only note and
any crash land there.

**Stopping is a command, not a signal.** `/exit` joined `/add` on the control socket, plus a
side-effect-free `/ping` that doubles as the liveness probe the stale-socket cleanup already
needed. `mdhouse exit` stops the daemon on `--port` and prints what it was serving;
`mdhouse exit --all` sweeps every `control-*.sock`; with nothing there it names the ports that
do have one instead of failing silently. It stops a `--fg` server just as well as a detached
one — same handler, same shutdown path.

**The port taken by something else is answered in the terminal, not in the log.** The launcher
binds the port for a moment before spawning: if that fails and nothing answered on the control
socket, the process holding it is not mdhouse, and saying so directly beats a detached child
failing into syslog.

`--fg` keeps everything in one process; `bun run dev` uses it, because `bun --hot` must own the
process it reloads.

Verified: the daemon survives its launcher (`ps -o sid` shows a session of its own), the page
and `/api/roots` answer, a second `mdhouse <dir>` hands over without binding, `mdhouse exit`
and `exit --all` stop one and both and remove the sockets, a port held by `python -m
http.server` produces the right sentence in the terminal, and the journal carries the banner.

## N.17 — The root switcher in every sidebar state
With several directories served, the switcher existed in one place only: the row of chips in
the open sidebar. Compact and off had no way to change root at all, so switching meant
widening the panel first, and from the top bar it meant two widenings.

The chips stay where they fit. Where they do not, the same list folds into a `<select>`
(`ui/RootSelect.tsx`): full width at the top of the compact sidebar, and in the top bar
immediately right of the name, where it takes over holding the search button out at the right
edge. One root renders nothing anywhere — the widget appears exactly when it means something.

Verified in the browser across all three states: the select carries every root, sits where it
should (top bar `x=120` against a name ending at `110`, search button still at the far right),
and changing it swaps the tree without disturbing the open document.

## N.18 — Diffs, where the document is
A button left of the star turns the document into a patch and back. What it shows depends on
the file, because the useful comparison does:

- **Uncommitted work opens on the diff, unasked.** If you have edited a file and come back to
  look at it, the edit is what you came for — the working tree against `HEAD`, staged or not.
- **A clean file opens as a document** and diffs its last commit only when asked. "Compare
  with the previous revision" is the only comparison with a sensible default for a file nobody
  has touched, and it is one click away rather than in your way.
- **A file git has never seen** is the whole file, added — synthesised rather than shelled out
  to `git diff --no-index`, which also covers a file in no repository at all.
- **Any revision on demand:** the history rows are buttons now, and clicking one shows what
  that commit did to this file. Clicking it again puts the document back.

GitHub's colours (`#e6ffec` / `#ffebe9`, stronger tints in the gutters, the same values dark
mode uses at 15 % and 30 % alpha) and two line-number gutters, because "which line is this
now" and "which line was it before" are different questions.

**The landmine:** `diff.external` — difftastic, delta — is set in plenty of real `~/.gitconfig`
files, and `git diff` honours it, so the parser was handed a side-by-side rendering with no
`@@` in it. Every diff command now passes `--no-ext-diff --no-textconv`. (`git show` ignores
`diff.external` by default, which is why the commit path worked while the working-tree path
silently produced nothing.)

`/api/git/diff?p=&rev=` is one process per view; `rev` is accepted only as a hash, since it
reaches a git command line. `/api/doc` now carries the file's working-tree status, from the
map the tree badges are already built from, which is what decides the opening view.

Six tests cover the patch parser: two gutters, hunk headings, several hunks each with their own
numbering, git chatter dropped, a missing final newline, the 4000-line cut, and the whole-file
case. One of them caught a phantom blank line at the end of every diff — the trailing newline
of the patch, split into an empty context line.
