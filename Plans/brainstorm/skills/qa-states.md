# Q&A states — shared by /questions, /answers, /findings, /fixes

One reference so the four skills never drift. Markup: [../markup.md](../markup.md); glyphs:
[../README.md](../README.md). Everything here is how mdhouse renders it — the skills read a file the
way the page does.

## Who is who

- **The user** — a `💬` signed with any person or team badge (`👤parf`, `👥design`), or not signed at
  all. The page signs with the user's name (prefs `"me"`, else git); signing is optional.
- **The agent** — always signs `👾claude`. Never sign as a person.
- **A source** — `📡slack`, `📡mail`: something relayed, not a decision. If you relay one, add your own
  `💬 👾claude …` after it.
- A last `💬` from `👾` or `📡` means the item **waits on the user** again.

## A thread

Replies go indented into their item, one `💬` per turn, a blank `>` between turns (GitHub keeps
them apart):

```markdown
- ❓ Do we keep the old URLs?
  > 💬 👾claude Redirect for a year?
  >
  > 💬 👤parf elaborate — which links are out there?
  >
  > 💬 👾claude 14 in README files, 2 in issues.
```

Append — never edit or delete a turn, never touch the user's words.

## The state of an item

**✅ is the agent's**: the user answers on the page (the item shows answered, the file keeps `❓`);
the agent sets `✅` once it carried the answer over or did the fix. Who set a `✅` is in the turn that
closed it:

- `✅` + a last `💬 👾claude → …` / `` `sha` `` record — **processed by the agent**
- `✅` + a `💬 👤<name> settled …` — **closed by the user** on the page (the page always signs it):
  nothing to carry

| First glyph | State | Who acts |
|---|---|---|
| `❓` `⁉️`, not answered (below) | waiting on the user | nobody |
| `❓` `⁉️`, **answered** | the user decided | the agent: carry it over / do it, then `✅` |
| `❓` `⁉️`, **needs a reply** (below) | the user asked for more | the agent: reply, keep `❓` |
| `⏳` | to the agent; the user's last `💬` says what | the agent: do it → `✅`, or reply → `❓` |
| `⚠️` | partly done; the user's last `💬` says what is missing | the agent: finish → `✅` |
| `🔴` `🟠` `⚪` `🔵` first | a finding nobody triaged | `/fixes` AUTO only |
| `✅` `🚫` `⏸️` `🎫` | closed | nobody — unless the user wrote a `💬` after the agent's last one: then treat it as `⏳` |

- **Answered** — a `💡` decided by the user (`✅ 💡` + `💬 … yes`, `🚫 💡` + `💬 … no`); a one-of option
  picked `(x)`; or a last `💬` that is the user's, whole (not `💬 ⚠️`, not `elaborate`) — and no `💡`
  under the item still undecided (a plain reply under a `💡` is a reply, not an answer).
- **Needs a reply** — the **last entry** of the thread (`💬`, `💡` or an added option) is the user's and
  asks for more: `💬 ⚠️ …`, `💬 … elaborate — …`, or a plain reply under an undecided `💡`.
- **New** — whatever the user wrote after the agent's last `💬 👾claude`.

## Writing a stage

Replace the first glyph; a severity stays after it: `- ❓ …` → `- ✅ …`, `- 🔴 …` → `- ✅ 🔴 …`,
`> ❓ …` → `> ✅ …`. Never two stage glyphs (`✅ ❓`); never write `✅ 💡` / `🚫 💡` (the user's yes / no);
never tick `(x)` / `[x]`. With every `✅` add the record:

- carried over: `> 💬 👾claude → DECISIONS.md: <the decision, short>` (and `· TODO.md: <the action>`)
- done: `> 💬 👾claude \`<sha>\` — <what, and the proof>`

## Committing

Commit only the paths you changed. If `Plans/TODO.md` or `Plans/DECISIONS.md` already has the user's
uncommitted edits (`git diff --quiet -- <file>` fails), add your lines but do not commit that file —
say so in the report. Never push, never publish, never touch the live instance (:7777).

## Report

Chat in Russian; every item that waits on the user on its own line starting with ❓; end with
`🟥🟥🟥 <n> items wait on you in <file>`.
