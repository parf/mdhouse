---
name: resolve-questions
description: Processes the user's answers to questions in the Q&A markup — carries each decided one into Plans/DECISIONS.md and Plans/TODO.md and marks it ✅, replies where the user asked for more. Use after the user answered questions written by /ask-questions.
argument-hint: "[file]"
disable-model-invocation: true
---

# /resolve-questions [file]

**Read [qa-states.md](qa-states.md) first** (shipped: `../qa-states.md`) — who is who, the states,
replying, doing a task, writing a stage, committing, the report. This file says only what `/resolve-questions`
does with each state.
**Never trust the task** — a ⏳ or an answer that asks for work is a claim: first check by execution
that the problem exists and needs doing.

- `file` — default: the file of the newest `docs: questions —` commit, else `Plans/questions.md`

| State | Do |
|---|---|
| answered | **carry it over** (below) → `✅` |
| asks for more (incl. a bare `no`) | reply as qa-states.md says, keep `❓`; carry once settled (`Not X — Y`) |
| `⏳` `⚠️` `🎫` | as qa-states.md says; a task done is also the answer → carry it over → `✅` |
| anything else | nothing |

## Carry over

**Look first**: an entry for this question already in DECISIONS.md (`— from <file>` and the question's
words) or TODO.md → rewrite it in place (the answer changed); never a second entry for one question.

- **DECISIONS.md** — under the section matching the topic, else a new `## <topic> — 📅date` at the end:

  ```markdown
  - **<subject, from the question>: <the decision>.** — from <file>
    > <the user's words, verbatim — a long or multi-paragraph answer quoted here>
  ```

  The decision: for a `✓ yes`, the `💡` text (+ the user's note); for a pick, the option's text; for a
  `no` with an alternative, `Not <X> — <Y>`; else the user's answer in brief.
- **TODO.md** — each action the answer implies, at the end: `- [ ] <action>`; an action the new answer
  cancels: rewrite or remove the line that came from this question.
- Check each one landed, then `✅`.
