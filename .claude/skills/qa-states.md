# Q&A states — shared by /ask-questions, /resolve-questions, /find-issues, /fix-issues

One reference, so the four skills never drift: every rule below is stated here only. It is how mdhouse
renders the file — the skills read it the way the page does. Every glyph and badge:
[glyphs.md](glyphs.md); the markup with examples: [markup.md](markup.md) — both beside this file.

## Never trust the task

**Before doing anything, check that there is a problem and that it needs doing** — by execution: run
it, reproduce it, read the line, grep the symbol. Every task is a claim: a reviewer's issue, the user's
✓ yes, a ⏳, "do it", your own earlier reply. No problem, or nothing to gain → do not do it; reply with
the evidence. Doing a task whose premise is false breaks what works.

**Then weigh how real it is — the impact**: who hits it (the user every day, a fresh npm install, nobody
but a crafted request), how often, and what it costs when it does (lost text, a broken release, a wrong
colour). Say it in a few words: `Impact: every save on a read-only root — the answer is lost`. Little
impact and a costly or risky change → propose not doing it.

## Who is who

- **The user** — a `💬` signed with a person or team badge (`👤parf`, `👥design`), or not signed at all.
  The page signs with the user's name (prefs `"me"`, else git); it always signs `settled`, `yes`, `no`,
  `done` and `elaborate`. A `💡` signed by a person or team is their answer, not a proposal.
- **The agent** — always signs a bare `👾`, glued: `💬👾 …`, `💡👾 …` — no name, whichever agent it is.
- **A source** — `📡slack`, `📡mail`: relayed, not a decision. If you relay one, add your own
  `💬👾 …` after it.

## A thread

One `💬` per turn, indented into its item, a blank `>` between turns. A partial answer: `💬 ⚠️ 👤name …`
(the ⚠️ may also follow the badge).

```markdown
- ❓ Do we keep the old URLs?
  > 💬👾 Redirect for a year?
  >
  > 💬 👤parf elaborate — which links are out there?
```

Append; never edit or delete a turn, never touch the user's words. The agent's **records** —
`💬👾 → …`, `` 💬👾 `<sha>` — … ``, `💬👾 🎫<ID> → …` — are not turns: they never
reopen an item and never count as its last word.

## 🎯 Selected

`🎯` first in an item (before its stage and severity: `- 🎯 🔴 …`) selects it for the next run. **When
any item in the file carries `🎯`, `/resolve-questions` and `/fix-issues` act on the `🎯` items only** — the rest wait.
Acting on one removes its `🎯` (`- 🎯 🔴 …` → `- ✅ 🔴 …`, or `- ❓ 🔴 …` after a reply). Never add `🎯`
yourself.

A `🎯` on an **untriaged** issue is the user's yes: do it — the newest `💡`, else the fix the item states
→ `✅`, any severity; with options and no pick → reply "which one?", `❓`. A `🎯` on an unanswered `❓`
→ as a bare `⏳`: find out, reply.

## The state of an item

`✅` `🚫` `⏸️` are **closed** — the agent never acts on them. To reopen, the user sets `⏳` or `❓`.
A closed item's closing turn says who closed it: `✅` + `💬 👤<name> settled …` — the user, nothing to
carry; `✅` without it — the agent, and for the agent the `✅` alone is enough.

| First glyph | Condition | Who acts — what |
|---|---|---|
| `❓` `⁉️` (question) | not answered, not asking for more | nobody — waits on the user |
| | **answered** (below) | the agent: carry it over / do it → `✅` |
| | **asks for more** (below) | the agent: reply, keep `❓` |
| `🔵` (issue) | informational — treated as done or not relevant | nobody |
| `🔴` `🟠` `⚪` (issue) | untriaged — nothing from the user | `/fix-issues` AUTO only |
| | **answered** | the agent: do it → `✅` |
| | **asks for more** | the agent: reply, set `❓` first |
| `⏳` | the user's last `💬` says what | do it → `✅`, or reply → `❓` |
| | the agent's own `💬` is last (it proposed something) | the user said yes: do what you proposed → `✅` |
| | no `💬` — a question / an issue with one `💡` / with options | find out, reply, `❓` / do the `💡` → `✅` / reply "which one?", `❓` |
| `⚠️` | the user's `💬` (else the item text) says what is missing | finish → `✅`; unclear → reply "what is missing?", `❓` |
| `🎫` | a ticket requested; the user's `💬` names who (`👤name` / `👥team`) | file it where the repo tracks work (the 🎫 is the go-ahead): `gh issue create` on its GitHub — title in English, body the item and its thread, `--assignee` when the name is a login; no tracker → `- [ ] <item> 👤name` in `TODO.md` (the ID: `TODO.md`) → `✅` + `💬👾 🎫<ID> → 👤name` |
| `⛔` `❌` | blocked / failed | nobody — list them in the report |
| `✅` `🚫` `⏸️` | closed | nobody |

**Answered** — only the newest `💡` counts (an older one is superseded); when it is still undecided,
nothing is answered. Otherwise any of:

- that `💡` decided — `✅ 💡` + `💬 … yes …` / `accept`, or `🚫 💡` + `💬 … no — <their alternative>`
  (an issue's `ignore` closes it: `🚫`);
- a one-of option picked `(x)`;
- any-of: the item's own `💬 … done` (zero ticks = "none of these"; a `💬` under an option is a comment
  on that option);
- otherwise the last turn is the user's and whole — not `💬 ⚠️`, not `elaborate`, not a bare `no`.

A last turn from `👾` / `📡` (a record is not a turn) means not answered — it asks the user again, even
after a pick.

**Asks for more** — the last entry is the user's: `💬 ⚠️ …`, `💬 … elaborate — …`, a bare `no`, or a
plain reply under an undecided `💡`.

A user's answer that is **only** a stage word — "leave it", "drop it" → `🚫`; "later" → `⏸️` — is that
stage: set it with `> 💬👾 🚫 — per your "leave it"`. A sentence that contains the word is an
answer, not a stage. Ask once, never twice.

## Replying

`> 💬👾 <the answer, with evidence you verified — read the code, run it>`, a blank `>` before it.
Where a choice is the next step, the `💡` or the options go **under** that reply, never instead of it.

## Doing a task

1. **Premise gate — never skipped** (see *Never trust the task*): is there a problem, does it need doing?
   Reproduce it: run the test, read the line, a scratch instance. Disproved after the user approved →
   reply with the evidence, set `❓` (the user decides).
2. **Already done?** — the premise no longer reproduces and a commit names the claim (not only the line)
   → record the commit, `✅`.
3. **Side-effect gate** — the change removes a deliberate design (a comment says why), breaks a CLAUDE.md
   invariant (the write-route order, the error contract), changes what another caller or a test expects,
   or changes more than the item names and the user sees (an exit code, a URL, a prefs key) → reply with
   what it touches, set `❓`. The user's yes covers the item, not its side effects.
4. **Worth it?** — confirmed, but nobody can hit it and a mistake would cost little → reply with the
   evidence and a `💡👾 🚫 — <why>`, set `❓`: the user decides.
5. Change minimally. **Proof grows with what a mistake would cost and how often it hits**: a write to the
   user's files, a config / prefs.json migration, the service, publishing → a scratch instance and a
   test that fails first; a preview-only nit → a quick check. Update the docs it touches.
6. **The proof fails** → revert the change (`git checkout -- <paths>`), set `❌` + `💬👾` with the output —
   never `✅`, never a second try that widens the change. **Cannot start** (needs :7777, a secret, a
   missing tool) → `⛔` + the obstacle.

## Writing a stage

Replace the first glyph; a severity stays after it: `- ❓ …` → `- ✅ …`, `- 🔴 …` → `- ✅ 🔴 …`,
`> ❓ …` → `> ✅ …`. Never two stage glyphs (`✅ ❓`); never write `✅ 💡` / `🚫 💡` (the user's yes / no, accept / ignore);
never tick `(x)` / `[x]`. A record is optional — add one when it helps the user find the result:

```markdown
  > 💬👾 → `DECISIONS.md`: <the decision, short> · `TODO.md`: <the action>
  > 💬👾 `<sha>` — <what, and the proof>
```

## Committing

- **The Q&A file after a page triage is dirty by design** — the user's answers; the page saves, it does
  not commit. Running the skill is the ask: commit that file alone first (`docs: issues — triage` /
  `docs: questions — answers`), before the first change. The dirty-file rule below covers every other file.
- **Group by root cause first**: items with one cause get one change and **one commit per group** —
  the change and the docs it touched — `git commit <those paths>`. A crash between groups leaves nothing half.
- **Update the Q&A file every time you deal with a task** — done, replied, refused, failed: its stage
  and record (`` 💬👾 `<sha>` — … ``, 🎯 off) written right after it, and that file committed alone
  (`docs: issues — <ids>`) before the next task.
- The commit body names every issue it closes: `Fixes issues/2026-10/2026-10-07.md#B2, #B3`.
- A file with the user's uncommitted or staged edits (`git diff --quiet HEAD -- <file>` fails, or it is
  untracked): add your lines, do not commit it, say so in the report. Leftovers that are clearly yours
  (your records, `— from <file>` entries) — commit them.
- Never push, never publish, never touch the live instance (:7777).

## Report

**Serious first**: every confirmed issue that loses the user's text, writes to :7777 or escapes a
root — done or not. Then counts: done (with commits), carried, replied, untouched. Listed by line:
`⛔` / `❌` items, every `🚫` the agent set, and every AUTO with its commit — code nobody asked for. Every item that waits on the user on its own line starting with ❓. Last line:
`🟥🟥🟥 <n> wait on you in <file>` — `/ask-questions` and `/find-issues` have their own.
