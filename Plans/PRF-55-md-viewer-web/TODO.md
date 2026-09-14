# TODO — mdhouse

Goal: PRF-55 Phase 1 — browse, search, filesystem recents, git recents, the 3-state sidebar
and the WebSocket channel later phases ride on. **Phase 1 is complete and verified.**

Next step: **I.1** — clickable checkboxes written back to disk, the first thing that needs
`data-line` and the first thing that needs the write chokepoint.

---

## A–H — closed

See `DONE.md`. Scaffold, roots and path jail, scanner, renderer, search, git and recents,
server and client, live channel, marks, README — all built and verified end to end against
`/rd/vhosts/realty` and `~/src`. 27 tests pass; `tsc --noEmit` is clean.

**H.1** closed the follow-up: the tab strip works in the compact sidebar and favourites are a
tab reading the stored mark list. **H.2** collapsed the two recents tabs into one — uncommitted
work, colour-coded, then git history — leaving four tabs: Files / Favs / Recent / Mine.

## I. Checkbox write-back

Depends on nothing outstanding — `data-line` and `Registry.writeFile()` both already exist.

- **I.1** Client enables checkboxes only when `doc.writable`; a click POSTs
  `{path, line, checked}`.
- **I.2** Server patches exactly that source line (`[ ]` <-> `[x]`), refusing if the line no
  longer looks like a task item — a stale page must not corrupt a file.
- **I.3** Write through `Registry.writeFile()`; echo the change over the existing WebSocket
  so other tabs follow.

**Acceptance I:** ticking a box changes one line and nothing else (`git diff` shows a
one-line change); a read-only root renders the boxes disabled and rejects the POST with 403;
two open tabs stay in step.

## J. Section → AI

- **J.1** Select a block; `data-line` gives its source range.
- **J.2** A panel takes a comment and runs `claude -p` or `codex exec` with the section plus
  file context.
- **J.3** Stream the reply back over the existing WebSocket channel.

**Acceptance J:** feedback on a section of a real plan document returns something useful
without the file being modified unless explicitly applied.

## K. Git beyond recents

- **K.1** Per-file history panel (the endpoint `/api/git/log` already exists and is lazy).
- **K.2** Diff view for changed files; changed/added/removed listing for a root.

## L. Plans-convention awareness

Detect `Plans/<project>/` per `/rd/vhosts/realty/Plans/README.md` and render it as a project
card: TODO checkbox progress, DONE count, open-QUESTIONS badge, `done/` archive link. The
highest-value thing the r-doc viewer cannot do.

## M. Smaller wins

- **M.1** Task progress (`12/34`) beside any file with checkboxes — computed during the scan.
- **M.2** Backlinks and a broken-link report; links are already parsed at render time.
- **M.3** Scroll the tree to the open document; remember scroll position per file.
- **M.4** Editor (CodeMirror 6) with live preview and scroll-sync — `data-line` makes it cheap.

---

## Blockers

None. Phase 1 ships; everything above is new work.
