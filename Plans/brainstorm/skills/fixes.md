---
name: fixes
description: Acts on the user's triage of findings in the Q&A markup — does what the user approved, answers requests for more, verifies every premise by execution, and records each outcome in place with ✅ and the commit. Use after the user triaged Plans/findings.md written by /findings.
argument-hint: "[file]"
---

# /fixes [file]

**Read [qa-states.md](qa-states.md) first** (shipped: `../qa-states.md`) — who is who, the states,
writing a stage, committing, the report. A finding is a hypothesis: verify it by execution first.

- `file` — default `Plans/findings.md`

## Per finding

| State | Do |
|---|---|
| answered — `✅ 💡` + yes, a `(x)` picked, the user's whole `💬` | **do it** — the fix the answer names |
| answered with `🚫 💡` + `no — <another way>` | **do** that way |
| `⏳` / `⚠️` | as qa-states.md says: **do it** / **finish it**, or reply |
| asks for more — incl. a bare `no` | **reply**: the next `💡` or options; a no with nothing left: "🚫 reject or ⏸️ defer?"; set `❓` |
| untriaged | **AUTO** only (below) |
| closed, `⛔`, `❌`, waiting on the user | nothing |

**AUTO** — untriaged, 🟠 or ⚪, confirmed by execution, mechanical, local: a stale comment, a doc that
contradicts the code, a missing clamp. Never 🔴, never 🔵, never wording or taste, never a change of exit
codes, ports, service or CLI behaviour. Record `AUTO` in the reply. Disproved untriaged: reply with the
evidence and set `🚫` — the one stage you set unasked, because nobody decided anything.

## Do it

1. **Already done?** A commit since the finding's 📅 that names its `file:line` → record it, `✅`.
2. **Premise gate** — reproduce it: run the test, read the line, a scratch instance. Disproved after the
   user approved → reply with the evidence, set `❓` (the user decides).
3. **Side-effect gate** — the fix removes a deliberate design (a comment says why) → reply, set `❓`.
4. Fix minimally, one fix per shared root cause; prove it (`bun test`, `npx tsc --noEmit -p .`, the
   browser on a scratch instance for UI); update the docs it touches.
5. `✅` first (the severity stays: `- ✅ 🔴 …`), optionally the record, one commit per item.

Report tail: `🟥🟥🟥 <n> findings wait on you in <file>`.
