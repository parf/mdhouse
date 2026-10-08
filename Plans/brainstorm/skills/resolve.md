---
name: resolve
description: Act on my triage of findings written in the Q&A markup — do what I approved (✅ 💡, ⏳), answer "need more" / "elaborate", verify every premise by execution, and record the outcome in place. Pair of /review.
trigger: /resolve
---

# /resolve [file]

Reads `Plans/findings.md` (or `file`) after I triaged it on the page, and acts. Syntax:
[../markup.md](../markup.md). A finding is a hypothesis: verify it by execution before touching code.

Chat in Russian; the file, code and commits in English.

## Read each finding's state

| What is there | Means | What you do |
|---|---|---|
| severity only (`- 🔴 …`), 💡 undecided | not triaged | AUTO only (below); else nothing |
| `✅ 💡` under it (+ `💬 👤me yes — …`) | fix approved, with my note | **do it** |
| `⏳` first | to you — my 💬 says what | **do it** |
| `🚫 💡` + `💬 👤me no — …` | that fix turned down | if my no names another way, do that; else leave it |
| `💬 ⚠️ …` / `💬 👤me elaborate — …` | I need more | **reply** |
| `⚠️` first | partly done | finish what my 💬 says is missing |
| `( )` / `[ ]` with my pick | the approach chosen | **do it** |
| `✅` `🚫` `⏸️` `🎫` first, no new 💬 | settled by me | nothing |

**AUTO** — untriaged, but confirmed by execution, mechanical, local and side-effect-free (a stale
comment, a doc that contradicts the code, a missing clamp): fix it as if approved.

## Do it

1. **Premise gate** — reproduce it: run the test, read the line, hit a scratch instance. False →
   don't fix; reply with the evidence and set `🚫` first.
2. **Side-effect gate** — a fix that removes a deliberate design (a comment says why it is so) → don't;
   reply and set `❓` first: it is my call.
3. Fix minimally; one fix per shared root cause. Prove it: `bun test`, `npx tsc --noEmit -p .`, the
   browser on a scratch instance for UI. Update the docs it touches (CHANGELOG, Plans README, TODO).
4. Commit the touched paths only. Never push, never publish, never touch :7777.
5. Record it: the status glyph `✅` first, the severity stays (`- ✅ 🔴 …`), and a reply
   `  > 💬 👾claude \`<sha>\` — <what, and the proof>`.

## Reply

`  > 💬 👾claude <the answer, with evidence you verified>`; a choice → a 💡 or options; then set
`❓` first — it waits on me. Never mark ✅ on a reply.

## Rules

- Never decide for me: never write ✅ 💡 / 🚫 💡, never tick options, never settle what I left open
  (except AUTO, which carries its proof).
- Never delete a finding or edit my words; append to threads.
- Effort follows irreversibility × blast radius: the live instance, a release, `prefs.json` most.

## Report

Counts: fixed (commits), replied, rejected with evidence, untouched. Each item that waits on me on its
own line with ❓, then `🟥🟥🟥 <n> findings wait on you in <file>`.
