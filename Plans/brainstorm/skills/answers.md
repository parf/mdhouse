---
name: answers
description: Processes the user's answers to questions in the Q&A markup — carries each decided one into Plans/DECISIONS.md and Plans/TODO.md and marks it ✅, replies where the user asked for more. Use after the user answered questions written by /questions.
argument-hint: "[file]"
---

# /answers [file]

Reads a questions file and acts on what the user answered on the page. **Read
[qa-states.md](qa-states.md) first** — states, who is who, how to write a stage, committing, the report.

- `file` — default: the file of the newest `docs: questions —` commit, else `Plans/questions.md`

Chat in Russian; files in English; the user's words carried over verbatim.

## Per item (state as in qa-states.md)

| State | Do |
|---|---|
| **answered** | carry it over (below), then `✅` + `> 💬 👾claude → DECISIONS.md: … · TODO.md: …` |
| **needs a reply** | reply, keep `❓` (below) |
| `⏳` with a task | do it; it is also an answer — carry it over; `✅` + the done record |
| `⏳` asking you to find out | reply with what you found, set `❓` |
| `🎫` | nothing; name the ticket in the report |
| anything else | nothing |

## Carry over

- **DECISIONS.md** — under the section that matches the topic, else a new `## <topic> — 📅date` at the
  end: `- **<the answer, the user's words>.** <the why, if the user gave one> — from <file>`.
  A choice from options: the picked option's text. A `no`: `- **Not <the suggestion>.** <the user's
  why>`; if the no leaves the question itself open, also write a new question with `/questions`.
- **TODO.md** — each action the answer implies, at the end: `- [ ] <action>`.
- Check every answered item landed before you mark it `✅`; nothing is carried twice — a `✅` item is done.

## Reply

`> 💬 👾claude <the answer, with the evidence you verified — read the code, run it>` in the thread (a
blank `>` before it). Where a choice is the honest next step, a `💡` or options instead. The item keeps
`❓`: it waits on the user again.

## Rules

- Never decide for the user: never write `✅ 💡` / `🚫 💡`, never tick options, never `✅` an item that is
  not answered.
- Commit the questions file with DECISIONS.md / TODO.md (`docs: answers carried — <topic>`) — unless
  they hold the user's uncommitted edits (see qa-states.md).
