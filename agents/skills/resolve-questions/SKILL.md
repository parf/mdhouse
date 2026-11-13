---
name: resolve-questions
description: Processes the user's answers to questions in the Q&A markup — carries each decided one into Plans/DECISIONS.md and Plans/TODO.md and marks it ✅, replies where the user asked for more. Use after the user answered questions written by /ask-questions.
argument-hint: "[file]"
disable-model-invocation: true
---

# /resolve-questions [file]

**Read [qa-states.md](../qa-states.md) first** (shipped: `../qa-states.md`) — who is who, the states,
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

**Look first**: reuse the existing ID/entry; never duplicate a question or decision.

- **DECISIONS.md** — important rules only: `- 📌 <ID> <shortest decision>`; necessary conditions below.
  Use minimal terms/forms. No discussion, repetition, obsolete investigation or useless prose.
  For agree: accepted proposal + note; for a pick: chosen option; otherwise the final answer in brief.
- **resolved.md** — full original solved question, answers, options and history, verbatim; same ID.
  Other solved questions need no DECISIONS entry. Link important decisions to their archived history.
- **Old location** — anchored linked `№ID` pointer to the decision or archive; keep the questions file.
- **TODO.md** — each action the answer implies, at the end: `- [ ] <action>`; an action the new answer
  cancels: rewrite or remove the line that came from this question.
- Check every answer/action landed, then close/archive; unresolved questions remain open.
