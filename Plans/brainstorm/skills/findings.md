---
name: findings
description: Review code and docs with parallel reviewers and write findings in the Q&A markup — severity first, file:line, verified, a 💡 fix I can say yes or no to. Review only; never edits code. Pair: /fixes.
trigger: /findings
---

# /findings [scope] [focus]

Writes findings into `Plans/findings.md` for me to triage on the page; `/fixes` acts on my calls.
Syntax: [../markup.md](../markup.md), glyphs: [../README.md](../README.md). Never edits code or docs.

- `scope` — `release` (default: commits since the last `vX.Y.Z` tag), `<rev>..`, a path, or `all`
- `focus` — dimensions to run; default all three

Chat in Russian; the findings in English.

## Reviewers

Three subagents in parallel, read-only, one dimension each:

1. **Workflow & verification** — CLAUDE.md and skills against reality: commands that do not do what
   they say, missing recipes, ways to hit the live instance or skip a proof.
2. **Deploy & service** — CLI, service, packaging, the Deploy checklist and the reload.
3. **Code & security** — server, lib, ui, tests: the invariants in CLAUDE.md against the code, bugs,
   input handling, stale comments.

Each gets the scope, its dimension, the format below and these rules: **verify before reporting**
(read the line, run the test, grep the symbol, use a scratch instance — never :7777); read
`Plans/findings.md` first and do not raise again what is there, open or settled, unless the code
changed; at most 10 per dimension, worst first; return Markdown, the main loop writes the file.

## Format

```markdown
# Findings — <scope> (📅YYYY-MM-DD)

## <Dimension>

- 🔴 `src/cli.ts:536` --fg hands its folders over when the port is busy and exits 0 — under systemd
  the unit "succeeds" and nothing retries. Measured: exit 0 with :7777 taken.
  > 💡 👾claude Exit 1 under `MDHOUSE_SERVICE=1`, so systemd retries.
- 🟠 `src/server.ts:631` `limit=abc` becomes `NaN`; `hits.length >= NaN` is never true — no cap.
  > 💡 👾claude Clamp every `limit` to 1..max through one helper.
- ⚪ `README.md:12` "browsable" — "browse" reads better.
```

- The severity glyph is the first symbol of the line: 🔴 wrong / unsafe now · 🟠 matters, not now ·
  ⚪ low · 🔵 information only.
- Then `file:line`, the claim, the consequence; the evidence in a few words when not obvious.
- The fix goes in a `💡 👾claude` line under it — I accept it with ✓ yes, turn it down with ✗ no.
  Two real alternatives: options instead (`( )` under the finding, 🌟 on the one you recommend).
- No status glyph, no 💬, no ✅ — triage is mine. No preamble or summary in the file.

## Steps

1. Resolve the scope (`git describe --tags --abbrev=0`).
2. Launch the reviewers.
3. Write the file: append the new `# Findings — …` section; drop duplicates across reviewers, keeping
   the better-evidenced one.
4. Commit `Plans/findings.md` alone; never push.
5. Report counts per severity, each 🔴 in one line, then `🟥🟥🟥 findings in Plans/findings.md — triage on the page`.
