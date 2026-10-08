# Questions and answers in mdhouse

Plain GFM that reads well on GitHub and in an editor; mdhouse adds the behaviour (buttons,
muting, folding) on render — never markup that only mdhouse understands. Glyph first in the line
(status, then severity).

To try every form, open the [Q&A playground](qa-playground.md). Everything else mdhouse renders
beyond CommonMark is in [Markdown in mdhouse](markdown.md).

---

## Questions → answers, with a thread

```markdown
> ❓ Do we keep the old URLs?
> 💬 Yes, redirect for a year.
```

A thread — one 💬 per turn, the author as a badge (`👤parf`, `👾`, `📡slack`), a blank `>` between
turns so GitHub keeps them apart:

```markdown
- ❓ Do we keep the old URLs?
  > 💬👾 Redirect `/d/<root>/x.md` → `/d/x.md` for a year?
  >
  > 💬 ⚠️ 👤parf need more — which links are out there?
  >
  > 💬👾 14 in README files, 2 in issues.
```

- the item glyph is the state: `❓` waiting on me · `⏳` waiting on the agent · `✅` settled
- a `❓` / `⁉️` item is answered when its last 💬 is whole (not ⚠️) and from a person — a reply
  from 👾 / 📡 asks me again
- "need more" = my `💬 ⚠️` while the glyph stays `❓`
- GitHub: a list item with a quote under it — readable as a chat

## A question with a suggested answer

```markdown
> ❓ Should the summary strip stay visible while scrolling a long findings file?
> 💡👾 Keep it sticky: the counts are what you come back to.
```

- 💡 is a proposed answer — the question still waits on me
- **✓ yes** — at once: `💡` → `✅ 💡`, and an answer `💬 👤parf yes` — signed, always
- **✗ no** — at once: `💡` → `🚫 💡`, and an answer `💬 👤parf no`
- **💬 reply** — the form: a reply, the question stays open; or ✓ yes / ✗ no with a note

## Findings — stages

An issue's 💡: **✓ accept** (accept solution) → `✅ 💡` + `💬 👤parf accept`; **✗ ignore** — it
auto-ignores the issue: `🚫 💡` + `💬 👤parf ignore`, the issue `🚫`.

```markdown
- 🔴 `src/cli.ts:536` --fg hands over on a busy port — the unit "succeeds", nothing retries. Fix: exit 1
- ❓ 🟠 `package.json:46` dev script feeds `.` to the live instance
  > 💬👾 pin `:7790` + own config, or drop it?
- ⏸️ ⚪ `src/lib/search.ts:174` ReDoS without rg
  > 💬👾 needs a design — later
- ✅ 🟠 `test/control.test.ts:8` sockets in the real config dir
  > 💬👾 `112b307` — temp config via preload
```

| Line starts with | Stage | Looks |
|---|---|---|
| `🔴` `🟠` `⚪` | open, not processed | loud by severity |
| `❓` + severity | waiting on **me** | loudest |
| `⏳` + severity | waiting on the agent | normal |
| `⏸️` + severity | deferred | muted |
| `🎫` + severity | a ticket requested (who: `👤name` / `👥team`, required) — the agent files it, then `✅` + `🎫<ID>` | open, "ticket pending" |
| `✅` `🚫` + severity | settled | muted, folded |
| `🔵` | informational — treated as done or not relevant | muted, folded |

An issue id first in the claim (`- 🔴 D1 …`) is the item's anchor: `issues/2026-10-07.md#D1`.

## Pick one, or several

The markup decides: `( )` / `(x)` — one of (radio), `[ ]` / `[x]` — any of (checkboxes, GFM).

```markdown
- ❓ Dev server port:
  - ( ) `7790`, own config 🌟
  - ( ) `port: 0`, printed at start
  - ( ) keep `7777`
```

- 🌟 = the suggested one (the agent's pick); ⭐ = runner-up, optional
- a click on `( )` writes `(x)` and clears the others — my answer: the question shows answered
  (green ?); `✅` is set by the agent once it carried the pick over
- a click on that answered mark undoes the pick: `(x)` → `( )` — unanswered again
- a click on `[ ]` writes `[x]`; **✓ done** (on its line) answers `💬 👤parf done`
- a comment on one option goes indented under it, as under any item

## 🎯 Selecting what to process

A click on the **🎯** at the right of a line (it shows on hover) selects it at once — no form; a
double-click or **9 🎯** in the form do the same. Written first in the line:

```markdown
- 🎯 🔴 `src/cli.ts:536` --fg hands its folders over …
- 🎯 ❓ 🟠 `package.json:46` the dev script …
```

- when any item carries `🎯`, `/fix-issues` and `/resolve-questions` act on those only
- the agent removes the `🎯` from each item it acted on

## Summary strip — filters by level

At the top of a page with items: `6` │ `🔴 2` `🟠 3` `⚪ 4` `✅ 2` │ `🎯 1`. The first button is just
the total (a click shows all); after the `│`, the filters on it — thresholds, not glyphs: each
level includes the ones before it.

| Button | Shows |
|---|---|
| **N** (the total) | everything; resets the filter |
| **🔴** | high only |
| **🟠** | medium and up, plus ❓ ⁉️ with no severity of their own |
| **⚪** | every open line, any severity |
| **✅** | every closed line: ✅ 🚫 ⏸️ 🔵, an answered ❓ |
| **🎯** | selected for the next run |

A level with 0 is not shown.

## Glyphs

| Glyph | Meaning |
|---|---|
| 🔴 | high — wrong, unsafe, breaks something now |
| 🟠 | medium — attention, not now |
| ⚪ | low |
| 🔵 | informational — treated as done or not relevant |
| ❓ | open question — needs an answer and has none; **waiting on me** |
| ⁉️ | disagreement — two sources contradict |
| ⏳ | in progress: the agent is on it, waiting on the agent |
| ✅ | done / fixed / decided |
| 🚫 | cancelled / rejected — by decision, nothing failed |
| ⏸️ | deferred / on hold |
| 🎫 | a ticket requested — the agent files it |
| ⛔ | cannot be done — blocked, nothing ran |
| ❌ | failed — it ran and did not pass. Nothing else |
| ⚠️ | partial — follow-up required |
| 💬 | answer / reply — and nothing else |
| 💡 | a suggested answer — proposed, not yet the answer |
| 🎯 | selected for the next run |

A badge glyph with the name right after it, **no space**, becomes a chip: `👤parf` person,
`👥platform` team, `👾` AI agent (bare), `📡slack` source, `🎫RLM-412` ticket, `🏷️ui` tag,
`📅2026-10-06` date. First in a 💬 it is the author.

## Answering in the browser

In a folder served with `--rw`, in the plain document view (not a diff): a click on an item's
first glyph — or anywhere on an unanswered question or an open finding — opens its form; 💬 at
the right of a line comments on it; a click on a reply edits it.

Every form: 💬 (save — Ctrl+Enter; Ctrl+Shift+Enter saves and opens the next open question), the
actions that fit, ESC, and `[ ] 👤` at the far right (sign as me — the name in its tooltip). The
name: `"me"` in prefs.json settings overrides; default from git — the local part of `user.email`,
else `user.name` without spaces. The form's ✎ (or Alt+E) opens the file at the item in your editor.

Each action has one number, the same in every form; **Alt+number** presses it.

| # | Action | Question | Finding | 💡 suggestion | Option comment |
|---|---|---|---|---|---|
| 1 | ✅ | settled | done | ✓ yes | |
| 2 | 🚫 | drop | reject | ✗ no | |
| 3 | ⏸️ | defer | defer | | |
| 4 | ⏳ | agent | agent | | |
| 5 | ⚠️ | need more | partial | | |
| 6 | 🎫 | ticket | ticket | | |
| 7 | 🔍 | more | more | more | more |
| 8 | | | | | pick it |
| 9 | 🎯 | target | target | | |

Each change touches only its item's lines. If the file changed since the page was loaded, the
save is refused or the form says so, and the text you typed is kept; leaving the page keeps it
too. A file with uncommitted changes opens on its diff; switch back to the document to answer.

A plain `- [ ]` checkbox (not under a ❓) is ticked with a click, not answered.

## The old forms

mdhouse used to read these too. They are now read as the markup above — the page shows them
converted, and the next write to the file writes them converted:

| Written as | Read as |
| --- | --- |
| `> ? q` · `> Q: q` · `> Q q` | `> ❓ q` |
| `> ?! …` · `> !? …` | `> ⁉️ …` |
| `> A: a` | `> 💬 a` |
| `> [!QUESTION]` + `> q` · `> [!ANSWER]` + `> a` | `> ❓ q` · `> 💬 a` |
| `**Q:** q` · `**A:** a` | `> ❓ q` · `> 💬 a` |
| `- **Q:** q` · `- **A:** a` | `- ❓ q` · `  > 💬 a` under it |
| `::: q` … `:::` · `::: a` … `:::` | `> ❓ …` · `> 💬 …` |
| `- ☐` · `- ☑` `- ✔️` · `- ☒` | `- ❓` · `- ✅` · `- 🚫` |

An answer block after its question (blank lines between) joins the question's quote.

## A typical Q&A session

How a plan gets worked through with an agent (Claude Code or alike), in a folder served `--rw`:

1. **Ask** — the agent writes its open questions into a plan file, one `- ❓` item each, with a
   `💡` or `( )` options for what it proposes
2. **Answer** — you open the file in mdhouse, click each ❓ and answer; Ctrl+Shift+Enter saves
   and opens the next open one
3. **Decide** — the agent reads the answers and writes them up as decisions; the questions and
   answers stay, as the record
4. **Track** — the work goes into `TODO.md` as checkboxes, one per decision, ticked as each lands
