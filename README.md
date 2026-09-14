# mdhouse

Point it at a directory and get every `.md` file under it as a browsable, searchable site
in your browser.

```bash
mdhouse ~/notes                  # one docs tree
mdhouse ~/src                    # a folder full of git repos — all of them
mdhouse ~/src ~/notes --port 7777   # several roots at once
```

Then open <http://127.0.0.1:7777>. Documents live at `/d/<path>/<file>.md`, so any page can
be linked, bookmarked and typed by hand.

## What it does

- **Browse** — a sidebar tree of `.md` files only, in three states: collapsed to a single
  top bar, compact (navigation), or open (wide, with search, tabs and filters). `Ctrl+B`
  cycles; the choice is remembered.
- **Search** — filenames match instantly as you type with no round-trip at all; full text
  goes through ripgrep, with line numbers and highlighted context. Four chips narrow it:
  *names* / *contents* pick which half you get, *recent* / *mine* restrict the results to
  the same files the Recent and Mine tabs list.
- **Recents** — one list: everything uncommitted in your working tree, colour-coded by git
  status, then the files touched by the last N commits, filterable by committer. *Mine*
  narrows it to your own work — all uncommitted changes count as yours.
- **A front page** — the root name in the sidebar opens it. The same material grouped by
  commit rather than by file: each commit with its subject and the documents it is the newest
  change to. A commit that only repeats files you have already seen above is left out, and a
  tree git knows nothing about falls back to the twenty most recently changed files.
- **Mark things** — favorite, mute or ignore any file or directory. Marks live in
  `~/.config/mdhouse/`, never inside the tree you are reading, so they work on a directory
  you cannot write to at all.
- **Renders properly** — CommonMark and GFM through markdown-it: nested lists, tables,
  footnotes, GitHub alerts (`> [!NOTE]`), syntax highlighting, and mermaid diagrams.
- **Finds your repos** — hand it a directory of repositories and it discovers each one,
  using `git ls-files` so `.gitignore` is honoured without any configuration. Ignored files
  are one toggle away, not invisible.
- **Live** — a WebSocket pushes changes. Edit a file in your editor and the page follows.
  No polling anywhere.

Every rendered block carries a `data-line` attribute pointing back at its source line. That
is what the next phase is built on.

## Read-only by default

**mdhouse does not write to the trees it serves.** Point it at anything — someone else's
working checkout, a mounted share, a directory you would rather not touch — and the worst it
can do is read. Pass `--rw` to allow writing; the sidebar then shows a green `RW` beside the
root name. No badge means no writes, which is the normal case.

This is structural, not a matter of care: every write in the codebase goes through one
function that refuses a read-only root.

## Requirements

Bun ≥ 1.4. `git` and `ripgrep` are used when present and degraded gracefully when not — the
sidebar footer says so when a fallback is in effect.

## Options

| Flag | Default | |
| --- | --- | --- |
| `-p, --port <n>` | `7777` | |
| `-h, --host <addr>` | `127.0.0.1` | local-only by default |
| `-o, --open` | off | open a browser on start |
| `-a, --all` | off | include gitignored `.md` files |
| `--git-log <n>` | `200` | commits scanned for git recents |
| `--no-git` | off | skip git entirely; filesystem recents only |
| `--rw` | off | allow mdhouse to write to the trees it serves |

A root may also carry a `.mdhouseignore` — one directory name per line, `!name` to unhide one.

## Development

```bash
bun install
bun run dev          # serves this repo with hot reload
bun test
bunx tsc --noEmit
```

There is no build step: `Bun.serve` bundles `src/index.html` and everything it imports.

Planning documents live in [`Plans/PRF-55-md-viewer-web/`](Plans/PRF-55-md-viewer-web/) —
[`README.md`](Plans/PRF-55-md-viewer-web/README.md) for how it is built and why,
[`TODO.md`](Plans/PRF-55-md-viewer-web/TODO.md) for what is next.

## Status

Phase 1 — viewer, search, recents. Next: clickable checkboxes written back to disk, git
diffs and history, and pushing a selected section to Claude or Codex for feedback.
