---
name: find-issues
description: Reviews what changed, one read-only reviewer per touched subsystem (a map it keeps in Plans/subsystems.md), and writes verified issues to the day's file, Plans/issues/YYYY-MM-DD.md, in the Q&A markup — severity first, file:line, a 💡 fix the user can accept or decline on the page. Never edits code. Pair: /fix-issues acts on the user's triage.
argument-hint: "[scope] [mine] [focus]"
disable-model-invocation: true
---

# /find-issues [scope] [mine] [focus]

Writes issues for the user to triage on the page; `/fix-issues` acts on the triage. States, identities,
committing: [qa-states.md](qa-states.md) (shipped: `../qa-states.md`). Never edits code or docs.

- `scope` — default: **since the last review** — `<sha>..HEAD`, the `<sha>` from the last `## … · <sha>`
  heading of the newest `Plans/issues/*.md`. The very first run (no issues file yet) reviews the whole
  project at HEAD — once. Or: `release`, `all`, a `<rev>..` range, a path
- `mine` — only the git user's own commits (a repo others commit to, or with merge traffic)
- `focus` — the rest: subsystems to review; default every touched one

## Subsystems — the skill keeps their map

`Plans/subsystems.md` maps paths to subsystems, first match wins, each with what its reviewer checks:

```markdown
# Subsystems

| Letter | Path prefix | Subsystem | Check |
|---|---|---|---|
| A | `src/server.ts`, `src/lib/access.ts` | server ⚠️ | the write-route order, guards, error contract (CLAUDE.md "Server invariants") |
| B | `src/lib/render.ts`, `src/lib/qa.ts` | render & Q&A ⚠️ | the source model, hashes, what a write touches |
| C | `src/ui/` | ui | links, localStorage, live reload, the editors |
| D | `src/cli.ts`, `src/lib/service.ts`, `bin/` | cli & service ⚠️ | systemd, the control socket, hand-over |
| E | `test/` | tests | they test what they claim; no live config |
| F | `package.json`, `CHANGELOG.md` | packaging | what ships, the Deploy checklist |
| G | `CLAUDE.md`, `.claude/`, `doc/`, `*.md` | docs & skills | commands that do what they say |
```

- **Missing** → build it before the first review: from the tree (top-level folders, the second level
  under `src/`), the README and CLAUDE.md; a handful of rows, not one per file.
- **Every run**: list the scope's files — `git log --no-merges --name-only --pretty=format: <scope>`
  (`--author="$(git config user.name)"` with `mine`) — and map each. A file that matches no row →
  add a row (a new subsystem, or a wider prefix for an existing one) and say so in the report. A
  subsystem whose paths are all gone → drop its row.
- Every subsystem has its own letter; a letter is never changed or reused.
- ⚠️ marks a **scary** subsystem: auth, writes to the user's files, migrations, parsers, the service.
- Commit `Plans/subsystems.md` with the run's issues file.

## Reviewers

Agents, in parallel, read-only:

- **one per touched subsystem**;
- **two for a ⚠️ one**, the checklist split: correctness, security, architecture · compatibility,
  operations, tests, docs, efficiency;
- a subsystem with under ~50 changed lines goes to a neighbour's agent instead of its own;
- **at most 10** — past that, more agents mostly find the same. Typical: 3–5 between releases, 8–10
  for a release.

Each gets its
subsystem's row (the paths, what to check), its files, `git log -p --no-merges <scope> -- <its paths>`
(`--author="$(git config user.name)"` with `mine` — without it the reviewer reads the merge traffic too),
**[review-checklist.md](review-checklist.md)** (shipped: `../review-checklist.md`) — every section of it,
the meta-signals deciding where to look hardest — the format below and these rules:

- **Never trust a suspicion — verify before reporting**: the problem must exist and matter. Read the
  line, run the test, grep the symbol, a scratch instance, never :7777. `file:line` as at HEAD; a bug
  added and fixed inside the range is not an issue.
- **Never raise again** what the last 5 days' files in `Plans/issues/` and `Plans/done/issues/` already
  hold, open or closed.
  A `🚫` / `⏸️` / `🎫` one comes back only when its **premise** changed — not merely its file — and the
  new item starts with what changed and links the old one (`issues/2026-10-07.md#B.44`).
- **One cause, one item**: issues that share a root cause (one stale doc, one missing helper) are one
  item listing every `file:line`.
- `Plans/done/` and `Plans/brainstorm/` drafts raise nothing — unless a live doc describes them wrongly.
- At most 10, worst first. Return Markdown, plus one line: what was checked and found sound.

## Format

**One file per day: `Plans/issues/YYYY-MM-DD.md`** (today's date), `# Issues — YYYY-MM-DD` at the top —
create it on the day's first run; a later run the same day appends to it:

```markdown
## <scope> — 📅YYYY-MM-DD · <HEAD short sha>

- 🔴 D.1 `src/lib/prefs.ts:212` an unreadable prefs.json is overwritten on the next save — data loss
  Evidence: corrupted the file, `mdhouse <dir> -p` → the saved folders gone
  Impact: any start after a crash mid-write — every saved folder lost
  > 💡👾 Move the broken file aside and refuse the write.

### <Subsystem>

- 🟠 D.2 `src/cli.ts:536` `--fg` hands its folders over on a busy port and exits 0 — systemd never retries
  Evidence: :7777 taken → exit 0
  Impact: every boot where a hand-started copy holds the port — the service stays down
  > 💡👾 Exit 1 under `MDHOUSE_SERVICE=1`.
- ❓ 🟠 A.1 `src/server.ts:631` `limit=abc` becomes `NaN` — no cap on hits
  Evidence: `/api/search?q=x&limit=abc` → 600 hits
  Impact: any client that sends a bad limit — one slow response
  - ( ) clamp every `limit` through one helper 🌟
  - ( ) reject a non-numeric `limit` with 400

Checked and sound: <one line per subsystem — what was checked>.
```

- **Every issue has a unique id** `<letter>.<n>` — the subsystem's letter; ids reset for every file
  (file-per-day). Writing externally — `date#id`: `issues/2026-10-07.md#B.44`.
- **Serious first**: an issue that loses the user's text, writes to :7777 or escapes a root goes right
  under the section heading, above the subsystems.
- **An item is four lines, each on its own:**
  1. the severity glyph first (🔴 wrong / unsafe now · 🟠 matters, not now · ⚪ low · 🔵 information),
     the id, `file:line` (each one, for a shared cause), **the claim and its consequence — one line**;
  2. `Evidence:` — what was run or read, and what it gave;
  3. `Impact:` — who hits it, how often, what it costs (qa-states.md); the severity follows it — no
     one hits it → ⚪ or not raised;
  4. the fix: a `> 💡👾` line (✓ yes / ✗ no on the page) — or, for two real ways, `( )` options and the
     line starts `❓` before the severity.
- **Each line one short sentence, ~120 characters at most.** `Evidence:` — the strongest proof only,
  not the whole session. Several cases of one issue → short sub-items after the `Impact:` line and
  before the fix (`- setext: …`, `- HTML comment: …`), one per line.
- No "as its doc says", no restating the code — the reader opens the line.
- `Checked and sound:` — one line per subsystem, names only (functions, edge cases), no prose.
- No `✅`, no `💬` in a new item — triage is the user's.

## Steps

1. `git status -s` not empty → list it and ask to commit first; going on anyway, add
   `- 🔵 not reviewed — uncommitted: <files>` to the section.
2. Resolve the scope. **Re-check the open issues — untriaged, ❓, ⏳, ⚠️, 🎫 — whose files changed since the
   last review** (`git diff --name-only <sha>..HEAD`): gone, and a commit names it → `✅` +
   `` 💬👾 `<sha>` — gone `` (qa-states.md "Already done?"). An issue whose files did not change is not
   re-checked. An empty scope does only this, then stops.
3. Map the scope's files to subsystems (keep `Plans/subsystems.md`); launch one reviewer per touched one.
4. Append the section; drop duplicates across reviewers, keeping the better-evidenced one.
5. Commit the day's issues file (and `Plans/subsystems.md` if it changed) — nothing else.
6. Report: the serious ones first, each in one line; counts per severity; tail:
   `🟥🟥🟥 issues in Plans/issues/YYYY-MM-DD.md — triage on the page`.
