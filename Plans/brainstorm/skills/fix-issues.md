---
name: fix-issues
description: Acts on the user's triage of findings in the Q&A markup — does what the user approved, answers requests for more, verifies every premise by execution, and records each outcome in place with ✅ and the commit. Use after the user triaged Plans/findings.md written by /findings.
argument-hint: "[file]"
disable-model-invocation: true
---

# /fix-issues [file]

**Read [qa-states.md](qa-states.md) first** (shipped: `../qa-states.md`) — who is who, the states,
replying, doing a task (premise and side-effect gates), writing a stage, committing, the report. This
file says only what `/fix-issues` does with each state. A finding is a hypothesis: verify it by execution.

- `file` — default `Plans/findings.md`

| State | Do |
|---|---|
| answered | **do it** as qa-states.md "Doing a task" says — what the answer names (a `no — <another way>`: that way) → `✅` |
| asks for more (incl. a bare `no`) | reply: the next `💡` or options; nothing left → "🚫 reject or ⏸️ defer?"; set `❓` |
| `⏳` `⚠️` `🎫` | as qa-states.md says |
| untriaged | **AUTO** only (below) |
| anything else | nothing |

**AUTO** — untriaged, 🟠 or ⚪, confirmed by execution, mechanical, local: a stale comment, a doc that
contradicts the code, a missing clamp. Never 🔴 or 🔵, never wording or taste, never a change of exit
codes, ports, service or CLI behaviour. Say `AUTO` in the record.

A disproved untriaged 🟠 / ⚪: reply with the evidence and set `🚫` — the one stage you set unasked,
because nobody decided anything. A disproved 🔴: reply and set `❓` — the user decides.
