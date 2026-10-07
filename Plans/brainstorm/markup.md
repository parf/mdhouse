# Suggested markup — for [patterns.md](patterns.md)

Rules: plain GFM that reads well on GitHub and in an editor; mdhouse adds the behaviour
(buttons, muting, folding) on render — never markup that only mdhouse understands.
Glyph first in the line (status, then severity).

## 1. Questions → answers, with a thread

Today:

```markdown
> ❓ Do we keep the old URLs?
> 💬 Yes, redirect for a year.
```

A thread — one 💬 per turn, the author after 👤, a blank `>` between
turns so GitHub keeps them apart:

```markdown
- ❓ Do we keep the old URLs?
  > 💬 👤 **agent:** Redirect `/d/<root>/x.md` → `/d/x.md` for a year?
  >
  > 💬 ⚠️ 👤 **parf:** need more — which links are out there?
  >
  > 💬 👤 **agent:** 14 in README files, 2 in issues.
```

- the item glyph is the state: `❓` waiting on me · `⏳` waiting on the agent · `✅` settled
- "need more" = my `💬 ⚠️` while the glyph stays `❓` (the agent flips it to `⏳` when it starts)
- GitHub: a list item with a quote under it — readable as a chat

## 2. Findings — stages

```markdown
- 🔴 `src/cli.ts:536` --fg hands over on a busy port — the unit "succeeds", nothing retries. Fix: exit 1
- ❓ 🟠 `package.json:46` dev script feeds `.` to the live instance
  > 💬 👤 **agent:** pin `:7790` + own config, or drop it?
- ⏸️ ⚪ `src/lib/search.ts:174` ReDoS without rg
  > 💬 👤 **agent:** needs a design — later
- ✅ 🟠 `test/control.test.ts:8` sockets in the real config dir
  > 💬 👤 **agent:** `112b307` — temp config via preload
- 🚫 ⚪ `CLAUDE.md:119` socket wait
  > 💬 👤 **agent:** moot — the reload polls HTTP now
```

| Line starts with | Stage | Looks |
|---|---|---|
| `🔴` `🟠` `⚪` | open, not processed | loud by severity |
| `❓` + severity | waiting on **me** | loudest |
| `⏳` + severity | waiting on the agent | normal |
| `⏸️` + severity | deferred | muted |
| `✅` `🚫` + severity | settled | muted, folded |

## 3. Suggestions — pick one, or several

The markup decides: `( )` / `(x)` — one of (radio), `[ ]` / `[x]` — any of (checkboxes, GFM).
On GitHub `[ ]` is a checkbox and `(x)` reads as text — the pick is still plain to see.

```markdown
- ❓ Dev server port:
  - ( ) `7790`, own config 🌟
  - ( ) `port: 0`, printed at start
  - ( ) keep `7777`
```

```markdown
- ❓ What ships in the package:
  - [x] `doc/*.md`
  - [ ] `doc/*.png`
  - [ ] `Plans/done/CHANGELOG-beta.md`
```

- 🌟 = the suggested one (the agent's pick); ⭐ = runner-up, optional
- a click on `( )` writes `(x)` and clears the others; the question turns `✅`
- a click on that `✅` undoes the pick: `(x)` → `( )`, `✅` → `❓` — unanswered again
- a click on `[ ]` writes `[x]`; the question stays `❓` until I say done
- once something is picked, the unpicked options are muted
- a 💬 under the options still works: "none — do X instead"
- to comment: hover a line (the question or an option) → 💬 at its right end → editor under that line; a click on a comment edits it

A comment — on the whole question, or on one option (an option is a list item, so its 💬 goes
indented under it, as under any item):

```markdown
- ✅ Dev server port:
  - (x) `7790`, own config 🌟
    > 💬 👤 **parf:** and print the URL at start
  - ( ) `port: 0`, printed at start
  - ( ) keep `7777`
    > 💬 👤 **parf:** no — the live one is there
  > 💬 👤 **parf:** revisit when we have a second dev
```

## 4. Point at something and say …

⏸️ So far ok — we'll not improve it in this iteration.

A request is a quote **right after** the block it is about, opening with 👉 and a verb:

```markdown
The parser walks the token stream twice: once for headings, once for tasks.

> 👉 **rewrite:** one pass — shorter, keep the numbers
```

```markdown
Search falls back to a JS regex when rg is missing.

> 👉 **why:** "falls back" — is the fallback ever hit in practice?
```

- verbs: `ask` · `why` · `elaborate` · `rewrite` · `remove` — adding to a section is ↓ ⇊ on its heading already
- a sentence inside a block: quote it in the request (`"falls back"`)
- the agent answers under it (`> 💬 👤 **agent:** done — …`) or just does it and turns 👉 into ✅:
  `> ✅ 👉 **rewrite:** one pass …`
- in mdhouse: select text → a 👉 button writes the request after its block, the quote prefilled

## Summary strip — filters by level

At the top of a page with items: `6` │ `🔴 2` `🟠 3` `⚪ 4` `✅ 2`. The first button is just the total
(a click shows all); after the `│`, the filters on it — thresholds, not glyphs: each level
includes the ones before it.

| Button | Shows | Example |
|---|---|---|
| **N** (the total) | everything; resets the filter | all 6 |
| **🔴** | high only | 🔴 |
| **🟠** | medium and up, plus ❓ ⁉️ with no severity of their own | 🔴 + 🟠 + ❓ + ⁉️ |
| **⚪** | every open line, any severity | 🔴 🟠 ⚪ 🔵 ⏳ ❓ ⁉️ |
| **✅** | every closed line | ✅ 🚫 ⏸️ 🎫 |

- counts are cumulative: 🔴 ⊂ 🟠 ⊂ ⚪, so the numbers grow left to right
- ⚪ + ✅ = the total: a line is open or closed
- ⏸️ counts as closed — ✅ means "nothing to look at now"
- one button at a time; a second click, or the total, brings everything back

Edge cases:

- a ❓ / ⁉️ with a severity goes by it: `❓ 🔴` = high, `❓ ⚪` = low (⚪ only); a bare ❓ / ⁉️ is 🟠
- ⏳ (the agent is on it) is open → ⚪; in 🟠 only when its own severity is 🟠 / 🔴
- 🔵 is open → ⚪ only
- ⛔ ❌ ⚠️ are open, by their own severity

## Visual rules, from the markup alone

- [ ] severity 🔴 🟠 and `❓` (waiting on me) — strong colour, never folded
- [ ] questions are not bold — they can be long; the tinted background is the highlight
- [ ] the first glyph of a line is its button (framed on hover) — ❓ / ⁉️ answer, 🔴 🟠 ⚪ 🔵 ⏳ ⏸️ ✅ 🚫 reply + set the stage; no separate chips
- [ ] an answered `❓` (a 💬 under it) shows as a green **?** — HTML only, no such glyph: the file keeps `❓`; on hover it is a button [?] — a click edits the answer
- [ ] `⏳` — normal; `⏸️` — muted
- [ ] `✅` `🚫` items and their threads — muted, folded: the question, and under it the answer on
  its own line, each in its own colour (never merged into one line); a click opens them
- [ ] unpicked options after a pick — muted
- [ ] the glyph hangs: a column of its own, wrapped lines line up with the text, not under the glyph
- [ ] every block aligned left alike — glyphs at one x, text at one x; no left border, the background is enough
- [ ] a summary strip per page: `6` │ `🔴 2` `🟠 3` `⚪ 4` `✅ 2` — the total, then threshold filters (above)
- no extra markup for any of this: `<details>` stays available, but mdhouse folds by glyph
