---
name: review
description: Review code and docs with parallel reviewers and write the findings to Plans/findings.md in the format /resolve-findings consumes — severity glyph first, file:line, verified, terse. Review only; never edits code.
trigger: /review
effort: high
---

# /review [scope] [focus]

Generates the findings file; `/resolve-findings` consumes it. This skill **never edits code or
docs** — the only file it writes is the findings file.

- `scope` — what to look at: `release` (default — every commit since the last `vX.Y.Z` tag),
  `<rev>..`, a path, or `all`
- `focus` — optional dimensions to run; default: all three below

Chat in Russian; the findings file in English.

## Reviewers

Three subagents in parallel, one message, model `fable`, read-only, each its own dimension:

1. **Workflow & verification** — CLAUDE.md / skills vs reality: commands that do not do what they
   say, recipes that are missing, ways an agent would hit the live instance or skip a proof.
2. **Deploy & service** — `bin/`, `src/cli.ts`, `src/lib/service.ts`, `control.ts`, `package.json`,
   the Deploy checklist and the reload: release safety, systemd behavior, what ships.
3. **Code conventions & security** — `src/server.ts`, `src/lib/*`, `src/ui/*`, `test/`: the
   invariants in CLAUDE.md (*Server invariants*, *Code idioms*) against the code, bugs, input
   handling, stale comments.

Each reviewer gets the scope, its dimension, the format below, and these rules:

- **Verify before reporting** — read the cited line, run the test, grep the symbol, hit a scratch
  instance (CLAUDE.md, *Testing*). An unverified suspicion is not a finding.
- Never touch the live instance (:7777), never publish, push or edit files.
- Read `Plans/findings.md` first: an item already there — open or resolved, including 🚫 with its
  evidence — is not raised again unless the code changed since.
- At most 10 items per dimension; the worst first.
- Return the section as Markdown text; the main loop writes the file.

## Format

```markdown
# Findings — <scope> (<YYYY-MM-DD>)

## <Dimension>

### Docs

- 🔴 `CLAUDE.md:85` <what is wrong> — <what happens because of it>. Fix: <the change, in one line>
- 🟠 …

### Code

- 🟠 `src/server.ts:631` <what is wrong> — <consequence>. Fix: …
- ⚪ …
```

- Severity glyph first in the line: 🔴 high — wrong, unsafe or breaks something now · 🟠 medium ·
  ⚪ low. Nothing else in front of it.
- `file:line` right after it, then the claim, the consequence, `Fix:` — one item, one line
  (a code block may follow, indented into the item).
- The evidence that verified it, in a few words when it is not obvious (`measured: 0.05 ms vs 80 ms`).
- No preamble, no summary inside the file, no praise.

## Steps

1. Resolve the scope to a commit range or path list (`git describe --tags --abbrev=0`).
2. Launch the reviewers.
3. Write the file: a findings file with no open items (no line starting with 🔴 🟠 ⚪) is replaced;
   otherwise the new sections are appended under a new `# Findings — …` heading. Drop duplicates
   across reviewers, keeping the better-evidenced one.
4. Commit `Plans/findings.md` alone.
5. Report: counts per severity, the 🔴 items in one line each, and that `/resolve-findings` is next.
