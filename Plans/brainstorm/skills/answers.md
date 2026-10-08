---
name: answers
description: Processes the user's answers to questions in the Q&A markup — carries each decided one into Plans/DECISIONS.md and Plans/TODO.md and marks it ✅, replies where the user asked for more. Use after the user answered questions written by /questions.
argument-hint: "[file]"
---

# /answers [file]

**Read [qa-states.md](qa-states.md) first** (shipped: `../qa-states.md`) — who is who, the states,
writing a stage, committing, the report. This file only says what `/answers` does with each state.

- `file` — default: the file of the newest `docs: questions —` commit, else `Plans/questions.md`

## Per question

| State | Do |
|---|---|
| answered | **carry it over** (below) → `✅` |
| asks for more | **reply** (below), keep `❓` |
| `⏳` with a task | do it as `/fixes` "Do it" steps 1–4 say; it is also the answer → carry it over → `✅` |
| `⏳` asking to find out, or bare | find out, reply, `❓` |
| a `no` with no alternative | not carried yet — reply with the next `💡` or options, keep `❓`; carry once settled (`Not X — Y instead`) |
| closed, `⛔`, `❌`, or waiting on the user | nothing |

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
- Check each one landed, then `✅`. Report tail: `🟥🟥🟥 <n> questions wait on you in <file>`.

## Reply

`> 💬 👾claude <the answer, with evidence you verified — read the code, run it>` (a blank `>` first);
where a choice is the honest next step, a `💡` or options instead. Keep `❓`.
