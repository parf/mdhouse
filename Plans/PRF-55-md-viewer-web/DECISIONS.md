# Decisions

## 2026-09-13

- **Bun + Preact SPA, no separate build step.** `Bun.serve` bundles `index.html` and its
  imports natively with hot reload. Landed in `src/server.ts`, `src/index.html`.
- **markdown-it over remark and marked.** Block tokens carry `.map = [startLine, endLine]`,
  which is what checkbox write-back and section→AI need; remark is heavier and async, marked
  has weaker position data. Landed in `src/lib/render.ts`.
- **Local-first, network-ready.** Binds `127.0.0.1`; the path jail, the read-only flag and
  the write chokepoint are built now so LAN exposure later needs no rework.
- **WebSockets, never polling.** The channel ships in Phase 1 even though Phase 1 barely uses
  it, so later interactive features have no new plumbing to build. `src/lib/watch.ts`.
- **`/rd` is hard-coded read-only.** It is both the main development target and someone's
  working checkout. `READ_ONLY_ROOTS` in `src/lib/roots.ts`; `--writable` is the only override.
- **`git ls-files` is the scanner, not a glob.** `.gitignore` is honoured for free and it is
  far faster; the deny list only covers ground outside any repo. Measured 1 036 files in 51 ms
  on `/rd/vhosts/realty`. `src/lib/scan.ts`.
- **One git process per repo.** The r-doc viewer shells out per displayed row; recents,
  authors and status all come from one `git log` and one `git status` here, with committer
  filtering done client-side. `src/lib/git.ts`.
- **URL shape `/d/<path>/<file>.md`.** Root-relative with one root; a `/<rootId>/` segment
  only when there is more than one. `Registry.docUrl()` / `fromDocUrl()`.
- **Marks live in `~/.config/mdhouse/`,** never as a dotfile in a browsed tree — that is what
  makes favorite/mute/ignore work on a read-only root. `src/lib/prefs.ts`.
- **One anchor scheme,** generated server-side. r-doc has two that disagree; links break
  between them.


## Read-only is the default, and the badge marks the exception

Roots were writable unless they were under `/rd`, and the UI advertised the read-only ones
with a badge. Both halves were wrong.

The badge was noise: it appeared on essentially every root, which is the state a *viewer* is
in by definition. What is worth announcing is the rare tree mdhouse may write to, so the
badge inverted — a green `RW` when a root is writable, nothing at all otherwise.

`Root.writable` inverted with it: a root is writable only when `--writable` names it. That
also removed a contradiction — `--writable /rd/...` used to set `writable: true` while
`writeFile()` refused the write anyway, so the UI would have offered an edit that could not
happen. `/rd` is now not eligible for the flag at all, and says so.


## No tree is special; `--rw` is the whole policy

The read-only rule was a hard-coded path list — one particular checkout mdhouse would refuse
to write to. That was the wrong shape twice over: it protected exactly one tree while leaving
every other one writable by default, and it baked a local path into a general tool.

The list is gone. `Registry.create(specs, writable)` takes a single boolean from `--rw`, every
root is read-only without it, and `writeFile()` refuses a read-only root — which is every root
unless the user asked otherwise. The protection is stronger than the path list ever was,
because it now covers everything rather than one directory, and it is a single flag to reason
about instead of a list to maintain.


## Headings get their own ink — one hue per level

H1–H3 now use `--h1` / `--h2` / `--h3` rather than the body colour, in the document *and* in
the contents list, so a row and the heading it points at are visibly the same thing.

Two attempts failed the same way. A warm graphite ramp — three near-blacks a few percent
apart — was invisible. Three tints of one navy were still too close: varying only lightness
means telling a level apart requires a neighbour to compare it with.

So one hue per level. All three stay dark enough to be ink rather than decoration, but the
level of a heading is now recognisable on its own, which is the whole job.

| | light | dark |
| --- | --- | --- |
| H1 | `#123a6b` navy | `#9dc4f5` |
| H2 | `#1d6f5e` teal | `#79d3bb` |
| H3 | `#8a5a1f` ochre | `#e0b978` |
| body | `#1c1c1a` | `#e4e4e2` |

Sizes went up with the colours — 1.9 / 1.52 / 1.28em in the document, 14.5 / 13.5 / 12.5px in
the contents list — so the two signals reinforce each other instead of one carrying it alone.

H4–H6 keep the body and muted colours: they are rare in these documents and already separated
by size, and continuing the ramp would land them on the grey they already use.
