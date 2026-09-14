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
