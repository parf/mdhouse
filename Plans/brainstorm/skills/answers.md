---
name: answers
description: Process my answers to questions written in the Q&A markup — carry the settled ones into decisions and actions, answer my "need more" / "elaborate" / "no", and mark each item's new state in place. Pair of /questions.
trigger: /answers
---

# /answers [file]

Reads a questions file (default `Plans/questions.md`, or the file `/questions` last wrote) and acts on
what I answered on the page. Syntax: [../markup.md](../markup.md).

Chat in Russian; the file in English. My words are carried over verbatim.

## Read each item's state

The first glyph and the thread under it decide — exactly as mdhouse renders it:

| What is there | State | What you do |
|---|---|---|
| `❓` / `⁉️` with no 💬, or `💡` not yet decided | waiting on me | nothing |
| last 💬 is mine and whole (not `⚠️`, not `elaborate`) | **answered** | carry it over (below) |
| `✅ 💡` + `💬 👤me yes — …` | **answered** — the suggestion stands, with my note | carry it over |
| `🚫 💡` + `💬 👤me no — …` | answered **no** | carry the no over; if the no leaves the question open, ask a new one |
| `(x)` picked under a `( )` question, or `✅` on a `[ ]` question | **answered** — the pick | carry it over |
| `💬 ⚠️ …` or `💬 👤me elaborate — …` | I need more | reply (below); keep `❓` |
| `⏳` first | waiting on you | do it, reply, set `❓` back |
| `🎫` first | the answer will come from a ticket | nothing; note the ticket |
| `⏸️` / `🚫` first | deferred / dropped by me | nothing |
| `✅` first | already settled | nothing |

A reply from `👾` / `📡` as the last 💬 means the question waits on me again.

## Carry over an answered one

1. Write the decision into `Plans/DECISIONS.md` and the work it implies into `Plans/TODO.md`, in my
   words; a choice from options is quoted as picked.
2. Then mark the item settled: put `✅` in front of its glyph (`- ✅ ❓ …`, `> ✅ ❓ …`) — it folds on the
   page. Never delete it, never edit my text or my answer.
3. Every answer must land somewhere: check each one before marking it.

## Answer "need more" / "elaborate" / ⏳

- Reply in its thread, signed: `  > 💬 👾claude <the answer, with the evidence>`. Verify what you
  claim (read the code, run it) — the reply is what I decide on.
- Where a choice is the honest next step, reply with a 💡 instead, or add options.
- Set the first glyph back to `❓` (it waits on me), and leave everything else as it is.

## Rules

- Never answer a question for me; never tick `(x)` / `[x]`; never turn 💡 into ✅ 💡 yourself.
- Edit only the items you act on; append, do not rewrite.
- Commit the questions file, DECISIONS.md and TODO.md together (`docs: questions answered — <topic>`);
  never push.

## Report

Counts: carried over (with where each went), replied, still waiting on me. Each question that needs me
again on its own line with ❓, then `🟥🟥🟥 <n> questions wait on you in <file>`.
