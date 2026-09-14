# DONE

## A — Scaffold
Bun project with TypeScript strict mode and Preact JSX; dependencies pinned
(`markdown-it` + anchor/attrs/footnote, `preact`, `shiki`). `package.json`, `tsconfig.json`.

## B.1–B.3 — Roots and the file list
`lib/roots.ts` (registry, path jail, `/rd` read-only, write chokepoint, URL mapping),
`lib/ignore.ts` (deny list seeded from r-doc's `docsSkipPatterns()` plus `.mdhouseignore`),
`lib/scan.ts` (`git ls-files` per repo, directory walk elsewhere).

Measured: `/rd/vhosts/realty` 1 036 files / 51 ms, 1 repo. `~/src` 1 051 files / 172 ms,
30 repos discovered in one shallow pass. `/rd` correctly reported non-writable.

## C — Rendering
`lib/render.ts`. Verified on `Plans/RLM-1125-attom-tax-assessor/TODO.md` (9.4 KB, 70 ms,
10 headings, Cyrillic slugs, local `.md` links rewritten) and on a synthetic fixture covering
GitHub alerts, nested task lists, pipe tables with inline HTML, mermaid passthrough, and a
fenced language (`rust`) loaded on demand.

Nested lists and multi-line blockquotes render correctly — both are r-doc parser failures.
`data-line` lands on every block element as designed.

## D — Search
`lib/search.ts`. ripgrep `--json` driver, streamed and capped, plus an in-process fallback.
Verified against `/rd/vhosts/realty`: `?q=owner2_name` returns 16 hits across **6** files,
matching `rg -l owner2_name --glob '*.md'` exactly.

Bug found and fixed during verification: ripgrep reports match offsets in **bytes** while
JavaScript strings index in UTF-16 code units, so highlights slid off the match on Cyrillic
lines. `byteOffsetMapper()` converts per line; regression tests cover both engines.

## E — Git and recents
`lib/git.ts`, `lib/store.ts`. One `git log --name-status` and one `git status --porcelain`
per repo; committer filtering client-side.

Bug found and fixed: a literal NUL cannot travel inside an argv string, so the record
separator truncated `--format` and every query returned nothing. Git's own `%x00` / `%x1f`
escapes fixed it. 465 markdown changes parsed from `/rd` in 48 ms.

Verified: 30 repos under `~/src` aggregate correctly; per-file history returns 13 commits
for `Plans/RLM-1125-attom-tax-assessor/TODO.md`.

## F — Server and client
`server.ts`, `cli.ts`, `app.tsx`, `ui/*`, `styles/app.css`. Every endpoint exercised:
roots, tree, doc, raw, asset, search, recents (both kinds), git/log, marks. Path jail returns
403 for `../../../etc/passwd`. Multi-root mode tested with `~/src` + `/rd/vhosts/realty`
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
by absolute root path. Confirmed working on the **read-only** `/rd` root, which is the point
of keeping them outside the tree.

## H — Phase 1 shipped
README rewritten. 27 tests across roots, render and search; `tsc --noEmit` clean.

Read-only proof: after a full browsing session against `/rd/vhosts/realty`,
`git -C /rd status --porcelain` is empty — zero modified, zero untracked.

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

Verified in the compact sidebar against `/rd/vhosts/realty`: rows read
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

## M.3 — Clickable breadcrumbs
The directory crumbs above a document title are buttons: a click switches the sidebar to the
tree, expands the path down to that folder, scrolls it into view and flashes the row. There
is no directory page to link to — the tree *is* the directory view.

## D.1 — Search filters
Four chips under the search box: **names** and **contents** choose which half of the result
is shown — turning contents off also stops the request, since name matching never needed the
server — and **recent** / **mine** narrow both halves to the files the neighbouring tabs
list. They reuse the recents payload rather than asking the server a second question, so
"search within recent" means exactly what the Recent tab means, and the filter is instant.

Verified on `/rd/vhosts/realty`: `nginx` matches 93 lines in 41 files; with *recent* on, 6
lines in 1 file, matching the recents list by hand.

## B.5 — A root its own repository ignores
`mdhouse /rd/tmp` listed nothing. `/rd/.gitignore:81` ignores `tmp`, so
`git ls-files -co --exclude-standard` correctly reported zero files for the whole root — and
the scanner took that as the answer.

Git is not wrong: nothing there is tracked and nothing there will be. But the user pointed
mdhouse at that directory deliberately. `scanRoot()` now asks `git check-ignore -q .` for the
root itself and, when the repository ignores it, falls through to the filesystem walk instead
of the git listing. `repos` stays empty for such a root, which is accurate — an ignored
directory has no history, so recents and the history panel correctly offer nothing.

Verified: `/rd/tmp` 13 files, matching `find /rd/tmp -name '*.md' | wc -l`. No regression —
`/rd/vhosts/realty` 1 047 / 1 repo, `~/src` 1 039 / 26 repos. `test/scan.test.ts` covers both
halves: a tracked root ignores its `tmp/`, and that same `tmp/` as a root lists its files.

## B.6 — Recent on a root git knows nothing about
`mdhouse /rd/tmp` listed its files but had an empty Recent: with no repository, there is no
working status and no log, and the mtime list had been dropped when the two recents tabs were
collapsed into one.

`Store.recents()` now tops the list up by modification time once git has said everything it
has to say. A root git covers fully is unaffected — the commits fill the limit first. A file
in no repository is untracked by definition, so it is labelled and coloured as such, which
also makes it yours: nobody else has a claim on a file that was never committed.

Verified: `/rd/tmp` 13 entries, newest first, all marked untracked; `/rd/vhosts/realty`
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

## K.2 — Authorship in the document header
Beside the age, the document header now names who wrote the file and who last touched it:
`6 d ago · Serg Parf … Iaroslav Argunov`, collapsed to a single name when they are the same
person — which inside one plan folder they usually are.

`authorship()` runs the two `git log` shapes in parallel: `-1` for the newest commit, and
`--follow --diff-filter=A --reverse` for the commit that added the file, so a rename does not
reset a document's authorship. Both are `-1`-shaped, because this runs on every document open;
the heavier `fileHistory()` is still what the history panel asks for when it is expanded.

A root git knows nothing about (`/rd/tmp`) reports no authors and the header simply omits them.

## M.5 — H3 in the table of contents
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

## M.6 — Full-width reading
A fit-to-width button in the document meta line drops the 900px measure and lets the document fill
the pane, keeping the 30px side padding. Prose reads better in a column, which is why the cap
is there — but a document that is mostly wide tables or long code lines would rather have the
window, and `.claude/GeoQ.md` is exactly that document.

The choice survives navigation: it is a way of reading, not a property of one file. It is not
persisted across reloads, which keeps the default honest for a page someone opens from a link.

The control is an inline SVG like every other icon in the header rather than a text `<=>`:
two margins with an arrow pushing out to them, reversed to point inward once the document
already fills the pane.

## M.7 — Contents list, styled by depth
The ToC distinguished levels by indentation alone, which reads as one grey block once a
document has twenty headings. Depth is now carried by weight and colour as well: H1 bold in
the body colour with a little air above it, H2 medium grey, H3 smaller and fainter with a
short tick before it so a third-level row is recognisable without measuring its indent.

Rows became full-width links with a hover background, so the click target is the row rather
than the words.

## L.1 — The front page
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

Verified: `/rd/vhosts/realty` 28 commit cards (9 under *Mine*), `/rd/tmp` 13 files under
*Recently changed*, and the empty states differ per view.

## L.2 — Age as a temperature
Every "3 h ago" in the app now goes through one `<Ago>` component that colours the label by how
recent it is, so a column of timestamps reads as a gradient before a single one has been read.

Five buckets, the ones people actually think in: **under ten minutes** (bright red, with a 🔥),
**this hour** (burnt orange), **today** (amber), **this week** (the ordinary muted grey), and
**older** (faint). The flame is the point — something touched in the last ten minutes is
usually the thing you opened the page to find — so it is suppressed only in the per-file git
history, where every row is a commit and the newest one is already first.

Used by the front page (uncommitted, recently-changed and commit cards), the sidebar's Recent
and Mine tabs, and the document header.

## L.3 — File lists as a table
The front page's three ragged runs of text became one `FileTable`: **directory | file | age**,
in real table columns that line up down the page.

- The directory is **right**-aligned against the names, so every file name starts on the same
  straight edge and the folder reads as a label attached to the group.
- A run of files from the same folder states it **once**, via `rowspan`. In a plans tree most
  consecutive rows share a parent, and eight repetitions of `my-daily-work-review` were the
  reason the list was hard to scan; the folder is only worth printing where it changes.
- The last path segment stays bold, as in the sidebar's Recent rows.
- Commit cards use the same table, minus the age column — the commit's own age heads the card.

Verified on `/rd/tmp` (13 rows collapsing to three directory cells: ×5, `/`, ×7) and on
`/rd/vhosts/realty` (28 commit cards, files grouped by folder inside each).
