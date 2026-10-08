---
name: find-issues
description: Reviews code and docs with three parallel read-only reviewers and writes verified findings to Plans/findings.md in the Q&A markup — severity first, file:line, a 💡 fix the user can accept or decline on the page. Never edits code. Pair: /fix-issues acts on the user's triage.
argument-hint: "[scope] [focus]"
disable-model-invocation: true
---

# /find-issues [scope] [focus]

Writes findings for the user to triage on the page; `/fix-issues` acts on the triage. States, identities,
committing: [qa-states.md](qa-states.md) (shipped: `../qa-states.md`). Never edits code or docs.

- `scope` — `release` (default: commits since `git describe --tags --abbrev=0`), `all`, a `<rev>..` range,
  or an existing path
- `focus` — the rest: dimensions to run; default all three

## Reviewers

Three subagents in parallel, read-only, one dimension each:

1. **Workflow & verification** — CLAUDE.md and skills against reality: commands that do not do what
   they say, missing recipes, ways to hit the live instance or skip a proof.
2. **Deploy & service** — CLI, service, packaging, the Deploy checklist, the reload.
3. **Code & security** — server, lib, ui, tests: CLAUDE.md's invariants against the code, bugs,
   input handling, stale comments.

Each gets the scope, its dimension, the format below and these rules: **verify before reporting** (read
the line, run the test, grep the symbol, a scratch instance — never :7777); read `Plans/findings.md`
first and do not raise again what is there, open or closed, unless the code changed; at most 10, worst
first; return Markdown — the main loop writes the file.

## Format

`Plans/findings.md` has one `# Findings` at the top (create it so if missing); each run appends:

```markdown
## <scope> — 📅YYYY-MM-DD

### <Dimension>

- 🔴 `src/cli.ts:536` --fg hands its folders over when the port is busy and exits 0 — under systemd
  the unit "succeeds" and nothing retries. Measured: exit 0 with :7777 taken.
  > 💡👾 Exit 1 under `MDHOUSE_SERVICE=1`, so systemd retries.
- ❓ 🟠 `src/server.ts:631` `limit=abc` becomes `NaN` — no cap on hits. Two ways:
  - ( ) clamp every `limit` through one helper 🌟
  - ( ) reject a non-numeric `limit` with 400
- ⚪ `README.md:12` "browsable" — "browse" reads better.
```

- First symbol: the severity — 🔴 wrong / unsafe now · 🟠 matters, not now · ⚪ low · 🔵 information.
- Then `file:line`, the claim, the consequence; the evidence in a few words when not obvious.
- One fix → a `💡👾` line under it (✓ yes / ✗ no on the page). Two real ways → options, and the
  line starts `❓` before the severity (a choice is a question).
- No `✅`, no `💬` — triage is the user's. No preamble or summary in the file.

## Steps

1. Resolve the scope. 2. Launch the reviewers. 3. Append the section; drop duplicates across reviewers,
keeping the better-evidenced one. 4. Commit `Plans/findings.md` alone. 5. Report counts per severity,
each 🔴 in one line; tail: `🟥🟥🟥 findings in Plans/findings.md — triage on the page`.
