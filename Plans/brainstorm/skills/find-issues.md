---
name: find-issues
description: Reviews what changed, one read-only reviewer per touched subsystem (a map it keeps in Plans/subsystems.md), and writes verified issues to Plans/issues.md in the Q&A markup — severity first, file:line, a 💡 fix the user can accept or decline on the page. Never edits code. Pair: /fix-issues acts on the user's triage.
argument-hint: "[scope] [mine] [focus]"
disable-model-invocation: true
---

# /find-issues [scope] [mine] [focus]

Writes issues for the user to triage on the page; `/fix-issues` acts on the triage. States, identities,
committing: [qa-states.md](qa-states.md) (shipped: `../qa-states.md`). Never edits code or docs.

- `scope` — default: `<sha>..` from the newest `## … · <sha>` heading in `Plans/issues.md` (only what is
  new since the last run), else since the last tag; or `release`, `all`, a `<rev>..` range, a path
- `mine` — only the git user's own commits (a repo others commit to, or with merge traffic)
- `focus` — the rest: subsystems to review; default every touched one

## Subsystems — the skill keeps their map

`Plans/subsystems.md` maps paths to subsystems, first match wins, each with what its reviewer checks:

```markdown
# Subsystems

| Path prefix | Subsystem | Check |
|---|---|---|
| `src/server.ts`, `src/lib/access.ts` | server ⚠️ | the write-route order, guards, error contract (CLAUDE.md "Server invariants") |
| `src/lib/render.ts`, `src/lib/qa.ts` | render & Q&A ⚠️ | the source model, hashes, what a write touches |
| `src/ui/` | ui | links, localStorage, live reload, the editors |
| `src/cli.ts`, `src/lib/service.ts`, `bin/` | cli & service ⚠️ | systemd, the control socket, hand-over |
| `test/` | tests | they test what they claim; no live config |
| `package.json`, `CHANGELOG.md` | packaging | what ships, the Deploy checklist |
| `CLAUDE.md`, `.claude/`, `doc/`, `*.md` | docs & skills | commands that do what they say |
```

- **Missing** → build it before the first review: from the tree (top-level folders, the second level
  under `src/`), the README and CLAUDE.md; a handful of rows, not one per file.
- **Every run**: list the scope's files — `git log --no-merges --name-only --pretty=format: <scope>`
  (`--author="$(git config user.name)"` with `mine`) — and map each. A file that matches no row →
  add a row (a new subsystem, or a wider prefix for an existing one) and say so in the report. A
  subsystem whose paths are all gone → drop its row.
- ⚠️ marks a **scary** subsystem: auth, writes to the user's files, migrations, parsers, the service.
- Commit `Plans/subsystems.md` with the run's `Plans/issues.md`.

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
- **Never raise again** what `Plans/issues.md` or `Plans/done/issues*.md` already hold, open or closed.
  A `🚫` / `⏸️` / `🎫` one comes back only when its **premise** changed — not merely its file — and the
  new item starts with what changed and links the old one.
- **One cause, one item**: issues that share a root cause (one stale doc, one missing helper) are one
  item listing every `file:line`.
- `Plans/done/` and `Plans/brainstorm/` drafts raise nothing — unless a live doc describes them wrongly.
- At most 10, worst first. Return Markdown, plus one line: what was checked and found sound.

## Format

`Plans/issues.md` has one `# Issues` at the top (create it so if missing); each run appends:

```markdown
## <scope> — 📅YYYY-MM-DD · <HEAD short sha>

- 🔴 `src/prefs.ts:212` a save drops the user's folders when prefs.json is unreadable — data loss.
  Impact: any start after a crash mid-write — every saved folder gone.
  > 💡👾 Move the broken file aside and refuse the write.

### <Subsystem>

- 🔴 `src/cli.ts:536` --fg hands its folders over when the port is busy and exits 0 — under systemd
  the unit "succeeds" and nothing retries. Measured: exit 0 with :7777 taken. Impact: every reboot
  where a hand-started copy holds the port — the service stays down.
  > 💡👾 Exit 1 under `MDHOUSE_SERVICE=1`, so systemd retries.
- ❓ 🟠 `src/server.ts:631` `limit=abc` becomes `NaN` — no cap on hits. Two ways:
  - ( ) clamp every `limit` through one helper 🌟
  - ( ) reject a non-numeric `limit` with 400
- ⚪ `README.md:12` "browsable" — "browse" reads better.

Checked and sound: <one line per subsystem>.
```

- **Serious first**: an issue that loses the user's text, writes to :7777 or escapes a root goes right
  under the section heading, above the subsystems.
- First symbol: the severity — 🔴 wrong / unsafe now · 🟠 matters, not now · ⚪ low · 🔵 information.
- Then `file:line` (each one, for a shared cause), the claim, the consequence; the evidence in a few
  words when not obvious; **`Impact:`** — who hits it, how often, what it costs (qa-states.md). The
  severity follows the impact, not the feeling: no one hits it → ⚪ or not raised at all.
- One fix → a `💡👾` line under it (✓ yes / ✗ no on the page). Two real ways → options, and the line
  starts `❓` before the severity (a choice is a question).
- No `✅`, no `💬` in a new item — triage is the user's.

## Steps

1. `git status -s` not empty → list it and ask to commit first; going on anyway, add
   `- 🔵 not reviewed — uncommitted: <files>` to the section.
2. Resolve the scope. **Re-check every open issue already in the file — untriaged, ❓, ⏳, ⚠️, 🎫 — against HEAD** — gone, and a
   commit names it → `✅` + `` 💬👾 `<sha>` — gone `` (qa-states.md "Already done?"). An empty scope still
   does this, then stops.
3. Map the scope's files to subsystems (keep `Plans/subsystems.md`); launch one reviewer per touched one.
4. Append the section; drop duplicates across reviewers, keeping the better-evidenced one.
5. Commit `Plans/issues.md` (and `Plans/subsystems.md` if it changed) — nothing else.
6. Report: the serious ones first, each in one line; counts per severity; tail:
   `🟥🟥🟥 issues in Plans/issues.md — triage on the page`.
