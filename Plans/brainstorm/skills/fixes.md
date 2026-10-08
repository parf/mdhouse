---
name: fixes
description: Acts on the user's triage of findings in the Q&A markup — does what the user approved, answers requests for more, verifies every premise by execution, and records each outcome in place with ✅ and the commit. Use after the user triaged Plans/findings.md written by /findings.
argument-hint: "[file]"
---

# /fixes [file]

Reads `Plans/findings.md` (or `file`) after the user triaged it on the page, and acts. **Read
[qa-states.md](qa-states.md) first** — states, who is who, writing a stage, committing, the report. A
finding is a hypothesis: verify it by execution before touching code.

Chat in Russian; the file, code and commits in English.

## Per finding

| State | Do |
|---|---|
| **answered** — `✅ 💡` (+ the user's note), a `( )` option picked, or the user's whole `💬` (also under `❓`) | **do it** — the fix the answer names |
| `⏳` — the user's `💬` says what | **do it** |
| `⚠️` — the user's `💬` says what is missing | **finish it** |
| `🚫 💡` + `no` | the user's no names another way → do that; else reply "no fix left — 🚫 reject or ⏸️ defer?", set `❓` |
| **needs a reply** — `💬 ⚠️`, `elaborate`, a plain reply under an undecided `💡` | **reply**, set `❓` |
| closed (`✅` `🚫` `⏸️` `🎫`) + something new from the user | treat it as `⏳` |
| severity first, untriaged | **AUTO** only (below) |
| anything else | nothing |

**AUTO** — untriaged but confirmed by execution, mechanical, local, side-effect-free (a stale comment, a
doc that contradicts the code, a missing clamp): fix it as if approved; say `AUTO` in the record. A
disproved untriaged one: reply with the evidence and set `🚫` — the one stage you may set without the
user, because nothing was decided.

## Do it

1. **Premise gate** — reproduce it: run the test, read the line, hit a scratch instance. Disproved after
   the user approved → do not fix; reply with the evidence and set `❓` (the user decides).
2. **Side-effect gate** — the fix would remove a deliberate design (a comment says why) → reply, set `❓`.
3. Fix minimally, one fix per shared root cause. Prove it: `bun test`, `npx tsc --noEmit -p .`, the
   browser on a scratch instance for UI. Update the docs it touches (CHANGELOG, Plans README, TODO).
4. Commit the touched paths only.
5. Record: `✅` first, the severity stays (`- ✅ 🔴 …`), and `> 💬 👾claude \`<sha>\` — <what, the proof>`.

## Reply

`> 💬 👾claude <the answer, with evidence you verified>` (a blank `>` before it); a choice → a `💡` or
options. Set `❓` first — it waits on the user. Never `✅` on a reply.

## Rules

- Never decide for the user: never write `✅ 💡` / `🚫 💡`, never tick options.
- Effort follows irreversibility × blast radius — the live instance, a release, `prefs.json` most.
