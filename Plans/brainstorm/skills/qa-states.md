# Q&A states — shared by /questions, /answers, /findings, /fixes

One reference, so the four skills never drift: every rule below is stated here only. It is how mdhouse
renders the file — the skills read it the way the page does. Every glyph and badge:
`Plans/brainstorm/glyphs.md`. Shipped, this file sits at
`.claude/skills/qa-states.md`.

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

## The state of an item

`✅` `🚫` `⏸️` are **closed** — the agent never acts on them. To reopen, the user sets `⏳` or `❓`.
A closed item's closing turn says who closed it: `✅` + `💬 👤<name> settled …` — the user, nothing to
carry; `✅` without it — the agent, and for the agent the `✅` alone is enough.

| First glyph | Condition | Who acts — what |
|---|---|---|
| `❓` `⁉️` (question) | not answered, not asking for more | nobody — waits on the user |
| | **answered** (below) | the agent: carry it over / do it → `✅` |
| | **asks for more** (below) | the agent: reply, keep `❓` |
| `🔴` `🟠` `⚪` `🔵` (finding) | untriaged — nothing from the user | `/fixes` AUTO only |
| | **answered** | the agent: do it → `✅` |
| | **asks for more** | the agent: reply, set `❓` first |
| `⏳` | the user's last `💬` says what | do it → `✅`, or reply → `❓` |
| | the agent's own `💬` is last (it proposed something) | the user said yes: do what you proposed → `✅` |
| | no `💬` — a question / a finding with one `💡` / with options | find out, reply, `❓` / do the `💡` → `✅` / reply "which one?", `❓` |
| `⚠️` | the user's `💬` (else the item text) says what is missing | finish → `✅`; unclear → reply "what is missing?", `❓` |
| `🎫` | a ticket requested; the user's `💬` names who (`👤name` / `👥team`) | file the ticket (the 🎫 is the go-ahead) → `✅` + `💬👾 🎫<ID> → 👤name` |
| `⛔` `❌` | blocked / failed | nobody — list them in the report |
| `✅` `🚫` `⏸️` | closed | nobody |

**Answered** — only the newest `💡` counts (an older one is superseded); when it is still undecided,
nothing is answered. Otherwise any of:

- that `💡` decided — `✅ 💡` + `💬 … yes …`, or `🚫 💡` + `💬 … no — <their alternative>`;
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

1. **Premise gate** — reproduce it: run the test, read the line, a scratch instance. Disproved after the
   user approved → reply with the evidence, set `❓` (the user decides).
2. **Already done?** — the premise no longer reproduces and a commit names the claim (not only the line)
   → record the commit, `✅`.
3. **Side-effect gate** — the change removes a deliberate design (a comment says why) → reply, set `❓`.
4. Change minimally, one change per shared root cause; prove it (`bun test`, `npx tsc --noEmit -p .`,
   the browser on a scratch instance for UI); update the docs it touches.

## Writing a stage

Replace the first glyph; a severity stays after it: `- ❓ …` → `- ✅ …`, `- 🔴 …` → `- ✅ 🔴 …`,
`> ❓ …` → `> ✅ …`. Never two stage glyphs (`✅ ❓`); never write `✅ 💡` / `🚫 💡` (the user's yes / no);
never tick `(x)` / `[x]`. A record is optional — add one when it helps the user find the result:

```markdown
  > 💬👾 → `DECISIONS.md`: <the decision, short> · `TODO.md`: <the action>
  > 💬👾 `<sha>` — <what, and the proof>
```

## Committing

- **One commit per item**: the change (if any), its `✅` / reply in the file, the docs it touched —
  `git commit <those paths>`. A crash between items leaves nothing half.
- A file with the user's uncommitted or staged edits (`git diff --quiet HEAD -- <file>` fails, or it is
  untracked): add your lines, do not commit it, say so in the report. Leftovers that are clearly yours
  (your records, `— from <file>` entries) — commit them.
- Never push, never publish, never touch the live instance (:7777).

## Report

Counts: done (with commits), carried, replied, untouched. Listed by line: `⛔` / `❌` items and every `🚫`
the agent set. Every item that waits on the user on its own line starting with ❓. Last line:
`🟥🟥🟥 <n> wait on you in <file>` — `/questions` and `/findings` have their own.
