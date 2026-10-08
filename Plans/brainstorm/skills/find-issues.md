---
name: find-issues
description: Reviews code and docs with three parallel read-only reviewers and writes verified issues to Plans/issues.md in the Q&A markup — severity first, file:line, a 💡 fix the user can accept or decline on the page. Never edits code. Pair: /fix-issues acts on the user's triage.
argument-hint: "[scope] [focus]"
disable-model-invocation: true
---

# /find-issues [scope] [focus]

Writes issues for the user to triage on the page; `/fix-issues` acts on the triage. States, identities,
committing: [qa-states.md](qa-states.md) (shipped: `../qa-states.md`). Never edits code or docs.

- `scope` — default: `<sha>..` from the newest `## … · <sha>` heading in `Plans/issues.md` (only what is
  new since the last run), else since the last tag; or `release`, `all`, a `<rev>..` range, a path
- `focus` — the rest: dimensions to run; default all three

## Reviewers

Three subagents in parallel, read-only, one dimension each:

1. **Workflow & verification** — CLAUDE.md and skills against reality: commands that do not do what
   they say, missing recipes, ways to hit the live instance or skip a proof.
2. **Deploy & service** — CLI, service, packaging, the Deploy checklist, the reload.
3. **Code & security** — server, lib, ui, tests: CLAUDE.md's invariants against the code, bugs,
   input handling, stale comments.

Each gets the scope, its dimension, `git log -p <scope> -- <its paths>`, the format below and these rules:

- **Never trust a suspicion — verify before reporting**: the problem must exist and matter. Read the
  line, run the test, grep the symbol, a scratch instance, never
  :7777. `file:line` as at HEAD; a bug added and fixed inside the range is not an issue.
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

### <Dimension>

- 🔴 `src/cli.ts:536` --fg hands its folders over when the port is busy and exits 0 — under systemd
  the unit "succeeds" and nothing retries. Measured: exit 0 with :7777 taken. Impact: every reboot
  where a hand-started copy holds the port — the service stays down.
  > 💡👾 Exit 1 under `MDHOUSE_SERVICE=1`, so systemd retries.
- ❓ 🟠 `src/server.ts:631` `limit=abc` becomes `NaN` — no cap on hits. Two ways:
  - ( ) clamp every `limit` through one helper 🌟
  - ( ) reject a non-numeric `limit` with 400
- ⚪ `README.md:12` "browsable" — "browse" reads better.

Checked and sound: <one line per dimension>.
```

- **Serious first**: an issue that loses the user's text, writes to :7777 or escapes a root goes right
  under the section heading, above the dimensions.
- First symbol: the severity — 🔴 wrong / unsafe now · 🟠 matters, not now · ⚪ low · 🔵 information.
- Then `file:line` (each one, for a shared cause), the claim, the consequence; the evidence in a few
  words when not obvious; **`Impact:`** — who hits it, how often, what it costs (qa-states.md). The
  severity follows the impact, not the feeling: no one hits it → ⚪ or not raised at all.
- One fix → a `💡👾` line under it (✓ yes / ✗ no on the page). Two real ways → options, and the line
  starts `❓` before the severity (a choice is a question).
- No `✅`, no `💬` — triage is the user's.

## Steps

1. `git status -s` not empty → list it and ask to commit first; going on anyway, add
   `- 🔵 not reviewed — uncommitted: <files>` to the section.
2. Resolve the scope. **Re-check every untriaged issue already in the file against HEAD** — gone, and a
   commit names it → `✅` + `` 💬👾 `<sha>` — gone `` (qa-states.md "Already done?"). An empty scope still
   does this, then stops.
3. Launch the reviewers.
4. Append the section; drop duplicates across reviewers, keeping the better-evidenced one.
5. Commit `Plans/issues.md` alone.
6. Report: the serious ones first, each in one line; counts per severity; tail:
   `🟥🟥🟥 issues in Plans/issues.md — triage on the page`.
