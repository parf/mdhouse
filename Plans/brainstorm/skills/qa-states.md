# Q&A states — shared by /questions, /answers, /findings, /fixes

One reference, so the four skills never drift: every rule below is stated here only. It is how mdhouse
renders the file — the skills read it the way the page does. Markup: `Plans/brainstorm/markup.md`;
glyphs: `Plans/brainstorm/README.md`. Shipped, this file sits at `.claude/skills/qa-states.md`.

## Who is who

- **The user** — a `💬` signed with a person or team badge (`👤parf`, `👥design`), or not signed at all.
  The page signs with the user's name (prefs `"me"`, else git); signing is optional — except a `✅`,
  `yes` or `no`, which the page always signs.
- **The agent** — always signs `👾claude`.
- **A source** — `📡slack`, `📡mail`: relayed, not a decision. If you relay one, add your own
  `💬 👾claude …` after it.

## A thread

One `💬` per turn, indented into its item, a blank `>` between turns:

```markdown
- ❓ Do we keep the old URLs?
  > 💬 👾claude Redirect for a year?
  >
  > 💬 👤parf elaborate — which links are out there?
```

Append; never edit or delete a turn, never touch the user's words.

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
| `⏳` | the user's last `💬` says what | the agent: do it → `✅`, or reply → `❓` |
| | no `💬` — a question | find out, reply, `❓` |
| | no `💬` — a finding with one `💡` / with options | do the `💡` → `✅` / reply "which one?", `❓` |
| `⚠️` | the user's `💬` (else the item text) says what is missing | finish → `✅`; unclear → reply "what is missing?", `❓` |
| `🎫` | a ticket requested; the user's `💬` names who takes it (`👤name` / `👥team`) | the agent: file the ticket (the user's 🎫 is the go-ahead), then `✅` + `💬 👾claude 🎫<ID> → 👤name` |
| `⛔` `❌` | blocked / failed | nobody — list them in the report |
| `✅` `🚫` `⏸️` | closed | nobody |

**Answered** — in every case only when no `💡` under the item is still undecided; then any of:

- a `💡` the user decided — `✅ 💡` + `💬 … yes …`, or `🚫 💡` + `💬 … no — <their alternative>`;
- a one-of option picked `(x)`;
- any-of: the item's own `💬 … done` (zero ticks = "none of these"; a `💬` under an option is a
  comment on that option);
- otherwise a last `💬` that is the user's and whole (not `💬 ⚠️`, not `elaborate`).

A last `💬` from `👾` / `📡` always means not answered — it asks the user again, even after a pick.

**Asks for more** — the last entry (a `💬`, a `💡`, an added option) is the user's and is `💬 ⚠️ …`,
`💬 … elaborate — …`, a bare `no` (no alternative), or a plain reply under an undecided `💡`.

A user's plain answer that names a stage in words — "leave it", "drop it" → `🚫`; "later" → `⏸️` — is
that stage: set it with `> 💬 👾claude 🚫 — per your "leave it"`. Ask once, never twice.

## Writing a stage

Replace the first glyph; a severity stays after it: `- ❓ …` → `- ✅ …`, `- 🔴 …` → `- ✅ 🔴 …`,
`> ❓ …` → `> ✅ …`. Never two stage glyphs (`✅ ❓`); never write `✅ 💡` / `🚫 💡` (the user's yes / no);
never tick `(x)` / `[x]`. A record is optional — add one when it helps the user find the result:

```markdown
  > 💬 👾claude → DECISIONS.md: <the decision, short> · TODO.md: <the action>
  > 💬 👾claude `<sha>` — <what, and the proof>
```

## Committing

- **One commit per item**: the fix (if any), its `✅` / reply in the file, the docs it touched
  (DECISIONS, TODO, CHANGELOG) — `git commit <those paths>`. A crash between items leaves nothing half.
- A file with the user's uncommitted or staged edits (`git diff --quiet HEAD -- <file>` fails, or it
  is untracked): add your lines, do not commit it, say so in the report. Leftovers that are clearly
  yours (your record lines, `— from <file>` entries) — commit them.
- Never push, never publish, never touch the live instance (:7777).

## Report

Chat in Russian; the files in English. Counts: done (with commits), carried, replied, untouched;
`⛔` / `❌` items listed. Every item that waits on the user on its own line starting with ❓. The last
line: `🟥🟥🟥 <n> wait on you in <file>` — or the skill's own tail.
