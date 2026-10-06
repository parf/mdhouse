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

## N.19 — The whole document, with the diff on it
The patch view answers "what changed"; it is a poor way to answer "what does this say now".
A second button beside it keeps the document exactly as it renders — headings, lists, tables,
links — and marks the change on it:

- new blocks tinted green with a bar in the margin, at the **deepest** block that owns the
  line, so a changed list item is marked rather than the whole list;
- deleted runs put back as raw markdown, struck through, in the place they were taken from —
  the one thing a rendered document cannot show by itself.

**This is what `data-line` was for.** Every block the renderer emits carries its source line,
so an added line number resolves to the element containing it: each element's span runs from
its own line to the line of the next element in document order, which is what makes the nested
one win. Front matter is handled by `doc.lineOffset` — verified on a file with four lines of
it, where the marks land on exactly the right paragraph.

The marks are applied to the live DOM and taken off again on the way out, rather than the body
being re-rendered: the rendered body carries the link handler, the mermaid diagrams and the
scroll position, and a view toggle should not rebuild any of that.

**An older revision cannot be marked up** — its diff describes a text the page is not showing.
`/api/git/diff` now says whether the new side is the file on disk (`current`), and the marked
view falls back to the patch with an amber note when it is not.

The chosen view sticks: a file with uncommitted work opens in whichever of the two you last
used. Four more tests cover the placement logic — added lines, an anchored removal run, a
replacement, and deletions at the end of a hunk — from a pure `changesOf()` split out of the
DOM work for exactly that reason. 51 tests pass.

## N.20 — The patch is Markdown too
Reading `**bold**`, `[text](url)` and `## Heading` as source is a needless tax on someone who
came to see what a document says, so the patch view renders its lines. The gutters and the
`+`/`-` column keep their monospace and their alignment — they *are* the patch — and only the
content of each line becomes text: headings in the document's own heading colours, list bullets
and blockquote markers muted beside their rendered body, inline code, task boxes as ☑ / ☐,
links underlined but inert.

**Inline, one line at a time.** A patch row is a line, not a block, and a line pulled out of
its list or its table cannot be parsed as one anyway; what block context there is comes from
the line's own prefix. Leading indentation is preserved in `ch` units so nesting still lines
up. Fenced code is left exactly as typed, tracked per hunk — best effort, since a hunk starts
wherever git chose to start it.

**Two deliberate limits.** Links render as `<span>`, not `<a>`: a relative href would not
resolve from a diff row, and nothing in this view should navigate anywhere. Raw HTML in the
source is escaped and shown, because in a diff the markup *is* the content.

Rendered server-side, by the renderer that already renders the document — `markupHunks()` in
`render.ts`, applied to every diff before it is served. Nine more tests: inline markup, kept
markers, task boxes, indentation, fenced lines, inert links, escaped HTML, empty lines, and a
fence switching rendering off and on again inside one hunk. 60 tests pass.

---

## N.21 A face

A house with `.md` glowing inside it. It appears twice, at two sizes, from two sources.

**At the top of the README**, 640×362 and 51 KB — the full mark, centred. Centring in Markdown
means a raw `<p align="center">` block, and that turned up a hole in the renderer: `<img src>`
inside raw HTML was left alone, so the logo was a broken image in mdhouse while GitHub rendered
it fine. `rewriteHtmlImages()` now sends relative sources through `/api/asset`, the same route
markdown images already took, and leaves external, root-absolute and `data:` URLs alone. Two
tests.

**In front of every document title**, 124×72 and 4 KB, inlined as a `data:` URI in the
stylesheet. The client has no static-asset route — `/api/asset` only resolves paths inside a
served root, and the app chrome is not inside one — and the favicon in `index.html` was already
an inline data URI, so this follows it. `.doc-title` becomes a flex row and `.mark` is sized in
`em` (`1.55em × 0.9em`), so it tracks the title rather than fixing a pixel size beside it.

The image is a raster with a white ground, not a transparency. A transparent cut was tried and
rejected: the roof and outline are dark navy and disappear against a dark background. So the
small copy is rounded into a tile instead — a logo badge in either theme, rather than a white
rectangle in one of them.

---

## N.22 — Sizes, and stubs that stand out

A plans tree fills up with `QUESTIONS.md` files holding one line: "no open questions". They
looked exactly like the documents beside them.

**Sizes.** `fileSize()` in `ui/format.ts` gives at most three digits: `87`, `1.1K`, `100K`,
`1.2M`. Bytes carry no unit, and rounding that would reach four digits moves up a unit instead.
The open sidebar shows a size on every file. Compact shows it on everything the stub marks do not
already cover. `test/format.test.ts` has the edge cases.

**Stubs.** Under 101 bytes a file gets a white **∅** on hot pink; under 500, a white **S** on
violet; and in both cases the name is struck through. The mark sits at the right end of the row,
in the tree and in search, Favorites, Recent and Mine. The route to it was not direct. Shrunken
and half-filled page icons came first, and at 14 pixels nobody could tell them from the normal
page. Only a coloured tile with a letter on it read as different.

**Empty files** are dropped from the tree and its folder counts. Search and recents still list
them.

**Less chrome.** The page icon on file rows is gone: every row is Markdown, and the icon looked
like the folder icon. File names move up into its space, and a favourite's star takes the
chevron slot, which a file row never uses. Folder names and counts are dark brown, with the
counts in bold. The folders above the open document are bold too, so the way down to it reads at
a glance.

---

## N.22 About, on the mark that was already there

The house in front of a document title, on the front page heading and in the sidebar brand was
decoration. It is a button now — the same one in all three places — and `?` opens it from
anywhere. Inside: version, repository, author, and the keyboard shortcuts, which until then
lived only in the README, where nobody using the app is looking.

The version is imported from `package.json` rather than written out a second time. Bun
tree-shakes the import: the bundle gets the string and nothing else — checked by grepping the
served chunk for the dependency list, the scripts and the keywords, none of which are in it.

## N.23 What an outside review found

Eleven findings came back from a review by another model. **Ten were real.** Each was
reproduced before anything was edited — a script against the real function, a scratch git repo,
or the running server — and each now has a test that fails against the old code.

**Folders contained themselves.** `buildTree` collapsed a single-child chain into `Plans/PRF-55`
and then walked the *uncollapsed* children, re-adding the directory the collapse had just folded
away. Every collapsed row in the sidebar held a copy of itself.

**A repository inside the root had no history at all.** `repoFor` measured the file's path from
the repo to the *root* — but when the root contains the repo, as in `mdhouse ~/src`, the root is
not inside the repo and the answer was `..`. git rejected `../mdhouse/README.md` and the panel
came back empty. It now measures from the repo to the file. This is the case the README leads
with, and it was broken for every file in it.

**The path jail could be walked out of.** `realpath` only answers for a path that exists, and
the fallback trusted the lexical path — so if any directory in the root was a symlink out of the
tree, `root/link/new.md` read as inside the root and `writeFile` put the bytes outside it.
Reproduced, then closed: the jail walks up to the nearest ancestor that does exist, resolves
*that*, and rebuilds the tail onto it. Reads were never affected, because a file that exists
resolves. This is the guarantee checkbox write-back is going to stand on, so it mattered now
rather than later.

**Links with a space 404ed.** markdown-it hands back `My%20Notes/doc.md` even when the source
wrote the space literally, and every rewrite here re-encodes what it is given: `%2520`. Decoding
now happens once, per path segment, inside `resolveRelative` — the single funnel all three
rewrites share.

**Deletions were marked at the top of the file.** A hunk of nothing but deletions has no line
carrying a new-side number, so `changesOf` fell back to 1. git puts it in the header instead —
`@@ -5,2 +4,0 @@` means the text sat just after line 4 — so `DiffHunk` carries `b` now.

**Non-ASCII filenames came back from git quoted and octal-escaped**, matching no file that was
ever scanned. `-c core.quotepath=false` goes on every git call, in the one wrapper.

Also: `-o` opened two browser tabs, because the launcher opened one and passed `-o` to the
daemon, which opened another; and any transient control-socket error deleted the socket of a
daemon that was still running.

**Where the review was wrong.** It recommended unlinking a control socket only on `ECONNREFUSED`
or `ENOENT`. Bun reports a dead unix socket as `FailedToOpenSocket`, so following that literally
would have left stale sockets forever and broken hand-over after a crash — the opposite of the
fix. And its eleventh finding, an infinite loop on an empty search query, is unreachable:
`searchContent` already refuses one. A guard went in regardless, since the function is exported.

**The Ignore button is gone** rather than wired up. It wrote a mark nothing read and had no way
to undo itself; wiring it up would have hidden files permanently with no way back. The mark
stays in `prefs.ts` so existing prefs files keep meaning something, and `TODO.md` says what a
real one needs.

**The tests were never typechecked** — `tsconfig.json` included only `src/`. It covers `test/`
now, which immediately caught the diff helpers going stale against the new hunk field. 78 tests.

---

## N.24 Where the checkout stands

The front page said what changed in the docs, but not whether the checkout was current. One
band above the commits now does, in their style. The top row has the branch and the last pull;
the second has HEAD's commit (subject, age, author, ❖ when yours), laid out like the commit
bands below. That second row is the newest commit of any kind, not the newest Markdown one.

`repoHead()` in `git.ts` makes two calls: `rev-parse --abbrev-ref HEAD --absolute-git-dir
--git-common-dir`, then `commitInfo('HEAD')`. A detached HEAD shows its short hash as the
branch. It is cached per root next to the other git derivatives and cleared by the same
watcher event, so a commit or a pull updates the band live.

**The pull time is `FETCH_HEAD`, not `.git`.** The request was `.git`'s mtime, but measured on a
live repo that tracks the last commit (15:27), not the last pull (14:38). Creating and renaming
lock files touches the directory on every commit, stage and checkout. `FETCH_HEAD` is rewritten
by fetch and pull only. Linked worktrees share it through the common dir, so both are checked.
A repo that has never fetched shows no pull time, rather than a misleading one.

For a root holding many repos (`~/src`), the band shows whichever repo committed last, with
its path in front of the branch.

`preciseAgo()` gives the pull two units for the first week (`29m`, `7h 12m`, `1d 7h ago`),
because "yesterday" covered anything from two to forty-seven hours. `timeAgo()` dropped the
space before its units throughout: `22h ago`. `test/head.test.ts` has five cases. 85 tests.

---

## N.25 Folders that come back, and a service to bring them

Every restart used to forget what mdhouse served. `prefs.json` now carries `saved`, a list of
realpaths, beside the marks: one config file rather than two. `mdhouse <dir> -P` adds to it and
`mdhouse --rm <dir>` takes away. `-p` stays the port, since moving it would have broken every
existing `mdhouse -p 8080`. A bare `mdhouse` serves the saved list, and the current directory only
when the list is empty. The daemon always serves what it was given plus what is saved, and a
saved folder that has since gone is skipped with a warning, not a failed start.

**Who writes the file.** The daemon holds prefs in memory and rewrites the whole file on every
mark, so a CLI edit made under a running daemon would be undone by the next star. With a daemon
up, `-P` and `--rm` go over the control socket (`save` on `/add`, and a new `/remove`) and the
daemon writes. With none up, the CLI edits the file itself. Removal needed `Registry.remove`,
`Watcher.unwatch` (watchers are now kept per root) and `Store.drop`. The last root is never
removed, because a server with no roots cannot answer anything: it is unsaved and served until
exit, and the reply says so.

**The service** is `mdhouse --fg` under systemd, writing to the journal. `Environment=PATH` is
copied from the installing shell, since systemd's own PATH has no git, rg or bun.
`XDG_CONFIG_HOME` is carried over when set, so the service reads the same prefs. Under systemd the
working directory is `$HOME`, so the empty-list fallback would serve all of it. So `install`
refuses with nothing saved, and a service that finds the list emptied since exits 0, which
`Restart=on-failure` leaves alone. `mdhouse exit` stops it the same way. A port other than 7777
gets `mdhouse-<port>.service`, which is also how it was tested without touching the real one.

**Settings** is `/settings`, reached by a ⚙ fixed to the top-right corner. One section for now,
Directories, with saved / this-session / RW tags and a delete button (disabled on the last root).
Adding is left to the terminal, where a path can be tab-completed and checked. `POST
/api/roots/remove` is the first request a page can make that changes what is served, so it is
refused when `Origin` names another host or `Sec-Fetch-Site` says cross-site.

**S → size.** Once small names were struck through, the S tile repeated them. Files of 101–499
bytes now show their byte count in violet, in both sidebar widths and in every list. ∅ stays: it
means "stub", which a number does not.

Tests: `prefs.test.ts` (round-trip, duplicates, marks kept, old files), `Registry.remove`, the
`/remove` control round-trip, and `service.test.ts` for the unit text. 94 tests. End to end on
port 7791 with an isolated config: save, restart, bare start, add while running, remove,
remove-last, remove with no daemon, service install/exit/uninstall, a UI delete, and a
cross-origin POST refused with 403.

---

## N.26 A page for every folder

`/d/<root>/<dir>/`: the trailing slash is what makes it a folder rather than a document, and a
single root's own page is plain `/d/`. `DirPage.tsx` builds the table from the tree payload
the client already holds, so it costs no request and updates live with the tree. The table is
the front page's: a subfolder is named once per run of rows, in a cell spanning them.

Newest first by default, since a folder is usually opened to see what moved. A–Z sorts by
folder and then name, not by whole path. Comparing whole paths put `infra/colo/x` before
`infra/y`, a subfolder ahead of its parent's own files. That is not `ls -lR` order.

The filters (`likeMatcher` in `format.ts`) are LIKE with implied `%` around the text, plus `^`
and `$` borrowed from regex. Everything else is escaped, so `.` and `(` are literal. They appear
only past 50 files, where a list stops being scannable. The ⓘ is a CSS popup rather than a
`title`: a native tooltip waits, and the first report was that it did not show at all.

Ways in: the count badge on a tree row (a `span` with `role="link"`, since a row is a button and
cannot hold another), breadcrumb folders, the root at the head of the breadcrumb, and DIR beside
the front page's title. GIT goes back from the root's page. A folder page passes `dir/` to the
tree as its current path, so the existing bolding of the way down applies unchanged.

Two layout bugs only showed on `/d/rd/`, the biggest page. A folder path inside a button did
not truncate, because the button grew to fit it. A file name of underscores
(`110_REY_ANALYTICS_…_2026-07-30`) could not wrap. Either one pushed the table past the page.
Separately, the filter row was first named `filters`, a class the sidebar already used with
`display: flex`, which stacked its cells.
