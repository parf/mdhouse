# Decisions

Each entry is a choice that shapes the code, and why. When a later decision replaces an
earlier one, the earlier one is rewritten to say what holds now.

## Foundations — 2026-09-13

- **Bun + Preact SPA, no separate build step.** `Bun.serve` bundles `index.html` and its
  imports natively, with hot reload. `src/server.ts`, `src/index.html`.
- **markdown-it over remark and marked.** Block tokens carry `.map = [startLine, endLine]`,
  which is what checkbox write-back and section → AI need; remark is heavier and async, marked
  has weaker position data. `src/lib/render.ts`.
- **Local-first, network-ready.** Binds `127.0.0.1`; the path jail, the read-only flag and the
  write chokepoint exist now, so LAN exposure later needs no rework.
- **WebSockets, never polling.** `src/lib/watch.ts`.
- **`git ls-files` is the scanner, not a glob.** `.gitignore` is honoured for free and it is far
  faster; the deny list only covers ground outside any repo. `src/lib/scan.ts`.
- **Git is batched:** one `git log` and one `git status` per repo, never a call per displayed
  row. Committer filtering is client-side. `src/lib/git.ts`.
- **URL shape `/d/<path>/<file>.md`.** Root-relative with one root; a `/<rootId>/` segment only
  when there is more than one. `Registry.docUrl()` / `fromDocUrl()`.
- **Config lives in `~/.config/mdhouse/`,** never as a dotfile in a browsed tree — that is what
  makes marks work on a read-only root. `src/lib/prefs.ts`.
- **One anchor scheme,** generated server-side and used unchanged by the contents list.

## `--rw` is the whole write policy

Every root is read-only unless `--rw` was passed; `Registry.create(specs, writable)` takes that
one boolean, and `writeFile()` refuses a read-only root. The UI marks the exception — a green
`RW` on a writable root — and nothing at all on the usual read-only one.

This replaced a hard-coded list of protected paths, which protected exactly one tree, left every
other one writable by default, and baked a local path into a general tool.

## Headings get their own ink — one hue per level

H1–H3 use `--h1` / `--h2` / `--h3` in the document *and* the contents list, so a row and the
heading it points at are visibly the same thing. One hue per level, because tints of one colour
need a neighbour to compare against before a level can be told apart.

| | light | dark |
| --- | --- | --- |
| H1 | `#123a6b` navy | `#9dc4f5` |
| H2 | `#1d6f5e` teal | `#79d3bb` |
| H3 | `#8a5a1f` ochre | `#e0b978` |

Sizes went up with the colours — 1.9 / 1.52 / 1.28em in the document — so the two signals
reinforce each other. H4–H6 keep body colours. A document's own title (`.doc-title`, the file
name above the text) is green, so it is not mistaken for the document's first heading.

## One mdhouse per port

Bun enables `SO_REUSEPORT` by default, so a second `mdhouse` bound an already-serving port and
the kernel split requests between the two: every other request reached the wrong tree and a file
that plainly existed came back *not found*. `Bun.serve` passes `reusePort: false`.

## The control channel is a unix socket, and it adds rather than replaces

A second `mdhouse` reaches the first over `~/.config/mdhouse/control-<port>.sock`, mode `0600`.
Filesystem permissions are the authentication, there is nothing to sign, and a browser cannot
open a unix socket at all. (A shared-secret HTTP endpoint was considered and rejected: its MAC
would have signed a timestamp rather than the request, in a length-extension-prone form, with the
key in a file the server partly serves.)

When it gets there it **adds** the directory and never swaps trees: replacing would turn a tab
someone is reading into a different tree with no explanation, and means rebuilding every cache
keyed by root id.

Keyed by port only, not host: `mdhouse exit` / `mdhouse <dir>` without `--host` must find a daemon
started with `--host 0.0.0.0`, and an older daemon's socket keeps its name. A second server on the
port (another host) never takes a live socket over — it runs without one; Ctrl+C stops it.

## Background by default, logging to syslog

A viewer is left running for days, so the default detaches; `mdhouse exit` stops it and is
printed on start. Output goes through `logger -t mdhouse` — timestamped, rotated, and readable
with a command the user already knows — not to a file only mdhouse knows about. `--fg` is for
`bun --hot` and for supervisors.

## Saved directories live in `prefs.json`

One config file, not two. `-P` and `--rm` go to a running daemon over the control socket, so it
starts or stops serving the folder at once. `-P` rather than `-p`, because `-p` has always been
the port.

## Write access belongs to a folder, and is granted only from a terminal

`--rw` used to be one flag for the whole process, so starting one scratch folder with `--rw`
made every saved folder writable too. Now it covers the folders named on that command; a saved
folder carries its own flag (`-P --rw`), and `-P` records the folder exactly as asked, so
re-saving without `--rw` is how write access is taken away. A running daemon can be told to make
a folder writable (`mdhouse <dir> --rw`, over the user-only socket) but never the reverse, and the
Settings page shows `RW` without a switch: no browser click can ever enable writing.

## A checkbox write is checked against the line it was rendered from

The page may be older than the file. A line number alone would let a stale tab flip whatever now
sits on that line, so each checkbox carries a fingerprint of its source line and the server
refuses (`409`) when the line no longer matches. Cheaper and stricter than comparing whole-file
mtimes: only a change to *that* line, or one that moves it, refuses the click.

## The systemd service serves only what is saved

Under systemd the working directory is `$HOME`, and the "no directory given" fallback would
serve all of it. So `mdhouse service install` refuses until something is saved, and a service
that finds the list emptied exits 0 — which `Restart=on-failure` leaves alone, as it does
`mdhouse exit`.

## The last pull is `FETCH_HEAD`, not `.git`

`.git`'s own mtime moves on every commit, stage and checkout, so it repeats the last commit's
age. `FETCH_HEAD` is rewritten by fetch and pull only.

## Folder pages are built in the browser

The client already holds the whole tree, so a folder's page is a filter over it — no endpoint,
no request, and live updates for free. Its address is the folder's path with a trailing slash.

## Only trusted host names, and state changes only from mdhouse's own page

Every request must be addressed to `localhost`, an IP address, or (with `--host`) the machine's
own name. DNS rebinding makes a hostile page same-origin with the local server in every header
but `Host`, so the name is the one thing to check; an allow-list of names, rather than a
deny-list, because the attacker picks the name.

On top of that, `POST /api/marks`, `/api/roots/remove`, `/api/settings` and the WebSocket refuse
a request whose `Origin` or `Sec-Fetch-Site` names another site — the requests a stray web page
could otherwise send to a local server.

## `prefs.json` is changed by read–apply–write, never by rewriting a held copy

Several processes write it. Each change re-reads the file, applies itself, and replaces the file
atomically (temp file + rename). A file that does not parse is moved aside, not overwritten: it
holds every mark and saved folder, and an empty file saved over a typo would destroy them.

## One palette for questions, disagreements and answers

A Q&A item looks the same however it was written — `> [!QUESTION]`, `> ?` / `> ?!` / `> 💬`,
`**Q:**` lines, `::: q` blocks — and its colours are tokens, not literals, because later features
(a Q&A view, open-question counts, filters) will reuse them:

| | edge | fill (light) | edge / fill (dark) |
| --- | --- | --- | --- |
| ❓ question | `--qa-question` `#dc2626` | `--qa-question-bg` `#fee2e2` | `#f87171` / `#7f1d1d` |
| ⁉️ disagreement | `--qa-disagreement` `#ea580c` | `--qa-disagreement-bg` `#ffedd5` | `#fb923c` / `#7c2d12` |
| 💬 answer | `--qa-answer` `#16a34a` | `--qa-answer-bg` `#dcfce7` | `#4ade80` / `#14532d` |

The fills are bright on purpose — a Q&A log should read at a glance, and stand apart from the
pale GitHub alerts. Questions are red, like the ❓ glyph; an answer is indented a little, under
what it settles. Meanings follow `/rd/.claude/Glyphs.md`: ❓ open question, ⁉️ open
disagreement, 💬 the answer that settles either.

## An answer is written in the question's own syntax — 2026-10-06

Saving from the page writes `> 💬` under a quote question, `> [!ANSWER]` under an alert,
`**A:**` under a bold line, `::: a` under a container, an indented `> 💬` inside a checkbox or
status item. The file stays in the style its author chose, and the result reads the same on
GitHub as the hand-written answers around it. `> A:` answers are read but 💬 is written.

- **Checkbox and status-glyph list items are questions** (the QUESTIONS.md convention): the box
  or glyph is the item's status, the answer an indented quote inside it. The glyphs are the
  status vocabulary of `/rd/.claude/Glyphs.md`; any other emoji leaves an item a plain one.
  Check & Save ticks `[ ]`, or turns a glyph into ✅.
- **The draft outlives the HTML.** The page is re-rendered whenever the file changes; the
  editor's text lives in `Doc` and is mounted again under its question (found by fingerprint,
  then line). A changed question or a meanwhile answer is said in the editor before Save, and a
  stale POST is refused — the draft is kept in every case.

## One Q&A markup; the old forms converted on load — 2026-10-07

Replaces "An answer is written in the question's own syntax".

- The markup of `Plans/brainstorm/markup.md`, states of `skills/qa-states.md`. Items are found on
  markdown-it's block parse (`qa.ts` `qaItems`) — the renderer and the server read the same
  parse, so a lazy line, a blank line before a thread, a sub-item's reply never split them.
- Old forms are rewritten into it on every read (`legacy.ts`); a write writes the converted file.
- 🔵 an informational note — treated as done or not relevant.
- A plain `- [ ]` (not under a ❓) is ticked only, never answered.

## Access, auto-rw and the git page — 2026-10-07

Planned, not built.

- **For trusted networks and developers, no TLS.** Outside the intranet, forward the port with
  ssh.
- **CIDR allow list and users are set from the CLI, kept in `prefs.json`.** Localhost is always
  allowed; out of CIDR or no passwd = access denied; 404 only when the file is missing and
  access is granted. Users (`user:passwd`) are asked from localhost too — a misconfigured
  nginx or alike proxy makes every request local. With both set, both are required.
- **auto-rw-path is a list:** any folder added from under it is writable; the web config can
  turn it off.
- **Wide mode is one setting for all documents, in localStorage.**
- **Shortcuts:** `e` opens the document in the editor (not while typing). In the forms — where
  `e` types — Alt+E (by key code: on a Mac Option+E types an accent) opens `edit:/path.md:line`
  and shows "opened in external editor" instead of the form;
  Ctrl+Shift+Enter in the answer form saves and opens the next unanswered question.
- **Git page at `/<root>/?git`** — `/<root>/` is the dir view. All commits, even ones with no
  `.md`; it lists all files of the repo, each linked to the repo's web view (GitHub, GitLab,
  the popular ones, or a built URL) — viewers for other file types are not the goal.
  The remote check is read-only, `git ls-remote`, no fetch. In `--rw`: commit, pull
  (`--ff-only`), push.
  Commit and pull stay inside the root: 409 while the repo holds a read-only served root or
  files outside the root (pull), or a change there (commit) — 2026-10-08.

## A review is a list of claims, not a list of changes

Reproduce before editing. Every finding from an outside review gets a script against the real
function, a scratch repo or the running server *first* — which is also how the regression tests
get written, since a reproduction is a failing test with the assertion left off. Of eleven
findings in the 0.4.0 review, two recommendations were wrong, and this step caught both.
