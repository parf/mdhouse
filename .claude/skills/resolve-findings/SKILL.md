---
name: resolve-findings
description: Process a findings file (default Plans/findings.md) — verify each finding by execution, fix the confirmed mechanical ones, reject false premises with evidence, stop with ❓ on the judgment calls, and answer every item in place with 💬.
trigger: /resolve-findings
effort: high
---

# /resolve-findings [file]

A findings file — from a review, an audit, subagents — is a **hypothesis list**, not a work order.
This skill decides each item (fix / reject / defer / ask), applies the confirmed ones, and writes the
outcome back under the item, so the file reads as a closed loop in mdhouse.

Chat in Russian; the file, code and commits in English.

## Input format

Each finding is a list item that opens with its severity glyph (see CLAUDE.md, *Glyphs*):

```markdown
- 🔴 `src/cli.ts:536` --fg hands over on EADDRINUSE and exits 0 — …
- 🟠 …
- ⚪ …
```

## Principles — apply to every item

1. **Premise gate, by execution.** Reproduce it before touching anything: run the test, grep the
   "unused" symbol, hit the route, read the cited line. A false premise is **rejected** (🚫) with the
   evidence — implementing it removes a real check or breaks a deliberate design.
2. **Side-effect gate.** The suggested fix is a suggestion. Trace what it changes; a fix that removes
   a deliberate design (a comment says why it is so) is refused with evidence.
3. **Cluster by root cause.** N items with one root → one fix, one commit.
4. **🔴 / 🟠 first; simple ⚪ now.** A one-line, side-effect-clean ⚪ (typo, stale comment, missing
   clamp) is fixed in the same pass. The rest of ⚪ is deferred, not dropped.
5. **Effort ∝ irreversibility × blast radius.** The live instance, a release, `prefs.json` on disk
   and anything published get the most care; a test helper the least.
6. **My words win.** An item that contradicts something I wrote on purpose (a rule in CLAUDE.md, a
   decision in `DECISIONS.md`) is rejected with a pointer to it — or asked, never silently applied.

## Steps

1. **Read** the file; list every open item (`🔴 🟠 ⚪` first in the line).
2. **Triage on paper:** cluster, mark each AUTO / ASK / DEFER. Report it in 3 lines.
3. **Premise gate** for every AUTO and ASK item. Read-only subagents for wide clusters, one per
   cluster, in parallel; small ones in the main loop.
4. **Route** what survived:
   - **AUTO** — confirmed, mechanical, local, no behavior contract changed: a doc that contradicts
     the code, a stale comment, a missing clamp, a test touching the real config dir.
   - **ASK** — changes user-visible behavior, a CLI/HTTP contract, the release process, or is a
     judgment call. Not applied.
   - **🚫** — false premise, or exposure ≈ 0 with a low cost of being wrong.
5. **Fix** each AUTO cluster: minimal change → prove it (`bun test`, `npx tsc --noEmit -p .`, the
   browser on a scratch instance for UI — CLAUDE.md, *Testing*) → docs it affects (CHANGELOG, Plans
   README, TODO) → commit only the touched paths. Never push.
6. **Write back** — in the findings file, per item:
   - the status glyph goes first, the severity stays after it: `- ✅ 🔴 …`, `- 🚫 🟠 …`,
     `- ❓ 🟠 …`, `- ⏳ ⚪ …` (deferred)
   - the answer goes under it, indented into the item, as mdhouse writes one:
     ```markdown
     - ✅ 🟠 `src/server.ts:631` search limit NaN — …
       > 💬 `a1b2c3d` clamps it to 1–500; test `search limit is clamped`.
     ```
   - ✅ — commit + proof · 🚫 — the deciding evidence · ❓ — the premise you confirmed and the
     question · ⏳ — why it waits
   - nothing is deleted; I resolve ❓ by answering in the page.
7. **Report:** counts by outcome, commits, then every ❓ on its own line, one question each, and the
   stop marker.

## Rules

- Verify before fixing; never mark ✅ without proof.
- Never the live instance, never `npm publish`, never `git push` — those wait for "publish".
- Commit only the paths you touched; my uncommitted files stay as they are.
- A second run picks up only items without a status glyph, and ❓ items I have answered.
