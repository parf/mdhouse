# Markup for questions, issues and decisions

Write questions, issues and decisions in this markup — exactly these forms, nothing else. It is
plain GFM: every item is a list item, every reply a quote under it.

## Rules

- One item = one list item: `- <glyphs> <ID> <title>`. Glyphs first, a space after each.
- The first line is a short title — one line. Details go on the lines below it, indented 2 spaces.
  `Evidence:` / `Impact:` — each on its own line.
- Replies: a quote under the item, indented 2 spaces, one `💬` / `💡` per turn, a blank `>` between
  every two turns — your own `💬👾` and `💡👾` too.
- You sign every turn `👾`, glued: `💬👾 …`, `💡👾 …`. A person signs `👤name`: `💬 👤parf …`.
- Append only: never edit or delete a turn, never touch a person's words.
- Use only the glyphs below. No others, no substitutes.
- Items go under headings that say what they are (`## Decisions`, `## Open questions`) — not under
  `## Summary`: a summary is a few lines of prose.
- Every item has an ID, right after the glyphs: `- 🔴 A1 …`. It is the item's anchor: `file.md#A1`.
  Unique in its file; never reuse or renumber one.
- Every mention of an ID has `№` — in every file you write, not only the one you convert; never a
  bare ID:
  - same file: `№A1` — not `A1`, not `(A1)`;
  - another file: always a link, `[№A1](ISSUES.md#A1)` — a bare `№A1` points to this file.

## Glyphs

| Glyph | Meaning |
|---|---|
| 🔴 🟠 ⚪ | severity: high · medium · low |
| 🔵 | info — nothing to do |
| ❓ | open question — waits on a person |
| ⁉️ | disagreement — two sources contradict; name both |
| ⏳ | in progress — waits on the agent |
| ⚠️ | partial — follow-up needed |
| ⏸️ | deferred |
| 🎫 | passed to an external ticket system |
| ⛔ | cannot be done — blocked, nothing ran |
| ❌ | failed — it ran and did not pass |
| ✅ | done |
| 🚫 | cancelled / rejected — by decision |
| 📌 | a decision that matters — a rule much other work follows |
| 💬 | a reply |
| 💡 | a suggested answer — not the answer yet |
| 🎯 | selected for the next run — set by a person only |
| 🌟 ⭐ | on an option: suggested · runner-up |

## Questions

### ID and reference

- `Q1`, `Q2` … — numbered in the order you ask.
- Reference: `№Q2`; in another file `[№Q2](QUESTIONS.md#Q2)`.

### Question → answer

```markdown
- ❓ Q1 Do we keep the old URLs?
  > 💡👾 Redirect them for a year.
- ❓ Q2 Which port for the dev server?
  > 💬👾 7790 or 7791?
  >
  > 💬 👤parf 7790
- ⁉️ Q3 Timeout: README says 30 s, `src/net.ts:12` uses 10 s — which one?
```

- `💡👾` — your suggested answer; the person agrees (`✅ 💡`) or cancels (`🚫 💡`).
- Answered (the person's `💬` is last, or a `💡` agreed) → do it, then `✅` with a record:
  `- ✅ Q2 …` + `> 💬👾 → dev script on 7790`.
- `💬 ⚠️ 👤parf …` or `elaborate` — they need more: reply, the item stays `❓`.

### Options — pick one `( )`, pick several `[ ]`

```markdown
- ❓ Q4 Where do logs go?
  - ( ) journald 🌟
  - ( ) a file ⭐
  - ( ) stdout
- ❓ Q5 Which checks run in CI?
  - [ ] tests
  - [ ] tsc
  - [ ] lint
```

- Always mark what you suggest, at the end of the option: `🌟` — your pick, `⭐` — the runner-up.
- A picked one: `(x)` / `[x]` — set by the person.

## Issues

### ID and reference

- An area letter + a number: `A1`, `B12` — one letter per area (subsystem, section); no areas → `I1`.
- Reference: `№A1`; in another file `[№A1](ISSUES.md#A1)`.
- Under the claim: `Evidence:` — how you proved it; `Impact:` — who hits it, how often, what it costs.

### Issue → stages

```markdown
- 🔴 A1 `src/cli.ts:536` a busy port exits 0 — systemd never retries
  Evidence: `mdhouse --fg` with :7777 taken → exit 0
  Impact: the service stays down after every restart
  > 💡👾 Exit 1 on a busy port.
```

The first glyph is the stage; the severity stays after it:

| Line | Stage | Who acts |
|---|---|---|
| `- 🔴 A1 …` | open, not triaged | the person triages |
| `- ❓ 🔴 A1 …` | waits on the person | the person |
| `- ⏳ 🔴 A1 …` | the person decided | you: do it → `✅` |
| `- ⚠️ 🔴 A1 …` | partly done | you: finish → `✅` |
| `- 🎫 🔴 A1 …` | to a ticket; the person's `💬` names who | you: file it → `✅` + `> 💬👾 🎫RLM-412 → 👤name` |
| `- ⏸️ 🔴 A1 …` | deferred | nobody |
| `- ⛔ 🔴 A1 …` · `- ❌ 🔴 A1 …` | blocked · failed | nobody — report it |
| `- ✅ 🔴 A1 …` · `- 🚫 🔴 A1 …` | done · rejected | nobody |
| `- 🔵 A2 …` | info | nobody |

- Done: `✅` + the commit: `` > 💬👾 `1a2b3c4` — exit 1 on a busy port ``.
- Your question about it: reply, set `❓` first.

## Decisions

### ✅ or 📌

- A decision is the usual `✅` — `- ✅ Q2 …`, in `DECISIONS.md` too.
- `📌` — only a decision that matters: a rule much other work keeps following (scope, a contract,
  a hard constraint). Few per file.
- Facts, inventories, findings are not decisions — plain text, or research notes.

### ID and reference

- The ID of the question it settles: `⁉️ Q3` → `✅ Q3`. A decision with no question — the next free
  ID of the same question series (`Q14`; `Q-R14` where questions are `Q-R…`): one series, no clashes.
- Reference: `№Q3`; in another file `[№Q3](DECISIONS.md#Q3)`.

### Where

- Important decision → `DECISIONS.md`: same ID, shortest possible rule; necessary conditions only.
- Resolved question/thread → `resolved.md`: preserve wording, answers, options and history verbatim.
- Old location → anchored `[№Q3](DECISIONS.md#Q3)` or `[№Q3](resolved.md#Q3)` pointer.
- Unresolved questions stay; never delete the questions file.
- `DECISIONS.md`: minimal terms/forms; no discussion, repetition, obsolete investigation or useless prose.
  Link to `resolved.md` for history.

### Decision

```markdown
- ✅ Q3 Timeout is 30 s
  `src/net.ts:12` follows the README.
  - 🚫 10 s — too short on a cold start
- 📌 Q6 Personal data never leaves the EU
  Every service, log and backup.
```

- Every rejected alternative is a `- 🚫 <alternative> — <why>` line under it — never in the prose
  ("Alternative X was rejected" → `- 🚫 X — <why>`).
- Follow decisions; proposals/questions go in `QUESTIONS.md`, linked to the decision.

## 🎯 Selected

When any item in the file has `🎯` (`- 🎯 🔴 A1 …`), act on the `🎯` items only. Acting on one removes
its `🎯`. Never add `🎯` yourself.

## Agent Bus

On an agent bus, put your bus name in the file you work on: `<!-- AB: #claude/x@host -->`. mdhouse
asks you from the page; reply on the bus.

## Converting an existing file

Apply every rule above to every item — the file must end up exactly in this markup:

- [ ] every item: glyphs, ID, a one-line title; the details under it
- [ ] line breaks redone: no line starts with `,` or `.`, no title cut mid-phrase
- [ ] every ID in the text: `№` — `(Q3)` → `(№Q3)`; from another file → a link
- [ ] every rejected alternative in the prose → a `- 🚫 … — why` line
- [ ] decisions `✅`; `📌` only on the few that matter
- [ ] the wording kept — only the markup changes; nothing removed or moved unless a person said so
- [ ] every ID mentioned in the other files of the project: `№` and a link

## Suggested markup — for `patterns.md`

Rules: plain GFM that reads well on GitHub and in an editor; mdhouse adds the behaviour
(buttons, muting, folding) on render — never markup that only mdhouse understands.
Glyph first in the line (status, then severity).

**✅ is the agent's.** On the page I answer (💬, a pick, yes / no) — the item shows answered (green ?),
the file keeps `❓`. The agent, once it carried the answer over or did the fix, sets `✅` and says where it
went. The ✅ action in the form stays for the rare "close it, nothing to carry" — and a ✅ set by a
person always goes with their badge: the page writes `💬 👤parf settled — …`.

### 1. Questions → answers, with a thread

Today:

```markdown
> ❓ Do we keep the old URLs?
> 💬 Yes, redirect for a year.
```

A thread — one 💬 per turn, the author as a badge (`👤parf`, `👾`, `📡slack` — [glyphs](skills/glyphs.md#badges--a-glyph-glued-to-a-name)), a blank `>` between
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
- a `❓` / `⁉️` item is answered, as a quote one is, when its last 💬 is whole (not ⚠️) and from a
  person — a reply from 👾 / 📡 asks me again
- every editor: 💬 (save — the glyph alone), the actions that fit (below), ESC, and `[ ] 👤` at the far right (sign as me — the name in its tooltip) —
  set, the reply starts with my badge
  (`💬 👤parf …`); remembered per browser. The name: this browser's own (Settings → Your name; a cookie, attribution only — it gives no
  access), else `"me"` in prefs.json settings; default from git — the local part of `user.email` (a badge name is one word), else `user.name`
  without spaces
- "need more" = my `💬 ⚠️` while the glyph stays `❓`

  Each action has one number, the same in every form; **Alt+number** presses it. A form without the
  action skips its number — the others never move.

  | # | Action | Question | Finding | 💡 suggestion | 👉 request | Option comment |
  |---|---|---|---|---|---|---|
  | 1 | ✅ | settled | done | ✓ agree / accept | done | |
  | 2 | 🚫 | drop | reject | ✗ cancel / ignore | drop | |
  | 3 | ⏸️ | defer | defer | | defer | |
  | 4 | ⏳ | agent | agent | | | |
  | 5 | ⚠️ | need more | partial | | | |
  | 6 | 🎫 | ticket — the answer will be there | ticket | | | |
  | 7 | 🔍 | more | more | more | more | more |
  | 8 | | | | | | pick it |

  A question and a finding carry the same glyphs; only the words differ.

  Every form also has **🔍 more** (elaborate): a signed reply `💬 👤parf elaborate — …` (text optional). It is
  never an answer and never closes the item — like `💬 ⚠️`, it asks for more. (the agent flips it to `⏳` when it starts)
- GitHub: a list item with a quote under it — readable as a chat

### 1c. A question with a suggested answer

```markdown
> ❓ Should the summary strip stay visible while scrolling a long findings file?
> 💡👾 Keep it sticky: the counts are what you come back to.
```

- 💡 is a proposed answer — the question still waits on me
- **✓ agree** (+ optional text): `💡` → `✅ 💡`, and an answer `💬 👤parf agree — …` — signed, always
- **✗ cancel** (+ optional text): `💡` → `🚫 💡`, an answer `💬 👤parf cancel — …`, and the question `🚫`
- **💬 reply**: neither — a reply; the question stays open
- click on yes — auto-answer yes; same for no; show form only when reply chosen
- after yes / no the question is answered; the answer is editable later, like any other

```markdown
- ❓ Should a folded answer show the author's badge?
  > ✅ 💡👾 Show it — who answered matters as much as what.
  > 💬 👤parf yes — and keep it first, before the text.
```

### 2. Findings — stages

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
- 🚫 ⚪ `CLAUDE.md:119` socket wait
  > 💬👾 moot — the reload polls HTTP now
```

| Line starts with | Stage | Looks |
|---|---|---|
| `🔴` `🟠` `⚪` | open, not processed | loud by severity |
| `❓` + severity | waiting on **me** | loudest |
| `⏳` + severity | waiting on the agent | normal |
| `⏸️` + severity | deferred | muted |
| `🎫` + severity | a ticket requested (who: `👤name` / `👥team`, required) — the agent files it, then `✅` + `🎫<ID>` | open, "ticket pending" |
| `✅` `🚫` + severity | settled | muted, folded |

### 2b. Decisions — 📌

A decision that matters — a rule much other work keeps following. A usual decision is `✅`.

```markdown
- 📌 Q-R1 `/p/F/L/NJ/` — keep the 301 to `/p/F/L/`
  The name page filters NJ people itself.
  - 🚫 410 — the 301 carries the NJ page's weight
- 📌 Q-R9 ClickHouse down → 503 + `Retry-After`
```

- `- 🚫 …` under it — a rejected alternative, muted
- an id first (`Q-R1`) — its anchor; `№Q-R1` links to it
- important resolved rule → `DECISIONS.md`, same ID, shortest form; full question/options/thread → `resolved.md`
- old location keeps an anchored `№ID` link; decisions contain no discussion or useless prose
- never folded, never waiting on anyone; 💬 under it — a reply

### 3. Suggestions — pick one, or several

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
- a click on `( )` writes `(x)` and clears the others — my answer: the question shows answered
  (green ?); `✅` is set by the agent once it carried the pick over
- a click on that answered mark undoes the pick: `(x)` → `( )` — unanswered again
- a click on `[ ]` writes `[x]`; **✓ done** (on its line) answers `💬 👤parf done` — answered, `✅` by the agent
- once something is picked, the unpicked options are muted
- a 💬 under the options still works: "none — do X instead"
- to comment: hover a line (the question or an option) → 💬 at its right end → editor under that line; a click on a comment edits it

A comment — on the whole question, or on one option (an option is a list item, so its 💬 goes
indented under it, as under any item):

```markdown
- ✅ Dev server port:
  - (x) `7790`, own config 🌟
    > 💬 👤parf and print the URL at start
  - ( ) `port: 0`, printed at start
  - ( ) keep `7777`
    > 💬 👤parf no — the live one is there
  > 💬 👤parf revisit when we have a second dev
```

### 4. Point at something and say …

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
- the agent answers under it (`> 💬👾 done — …`) or just does it and turns 👉 into ✅:
  `> ✅ 👉 **rewrite:** one pass …`
- in mdhouse: select text → a 👉 button writes the request after its block, the quote prefilled

### 🎯 Selecting what to process

After `/find-issues` I pick the few that matter: a click on the **🎯** at the right of a line (it shows on hover)
selects it at once — no form; a double-click or **9 🎯** in the form do the same. Written first in the line:

```markdown
- 🎯 🔴 `src/cli.ts:536` --fg hands its folders over …
- 🎯 ❓ 🟠 `package.json:46` the dev script …
- 🟠 `src/server.ts:631` limit=abc …          ← not selected: left for later
```

- when any item carries `🎯`, `/fix-issues` and `/resolve-questions` act on those only
- the agent removes the `🎯` from each item it acted on
- a selected item: bold blue bars (6px) left and right, 1px dashed blue top and
  bottom, a big blue ➤ in the left margin, its 🎯 lit; the strip has a `🎯 N` filter

### Summary strip — filters by level

At the top of a page with items: `6` │ `🔴 2` `🟠 3` `⚪ 4` `✅ 2`. The first button is just the total
(a click shows all); after the `│`, the filters on it — thresholds, not glyphs: each level
includes the ones before it.

| Button | Shows | Example |
|---|---|---|
| **N** (the total) | everything; resets the filter | all 6 |
| **🔴** | high only | 🔴 |
| **🟠** | medium and up, plus ❓ ⁉️ with no severity of their own | 🔴 + 🟠 + ❓ + ⁉️ |
| **⚪** | every open line, any severity | 🔴 🟠 ⚪ ⏳ ❓ ⁉️ |
| **✅** | solved as ✅ | ✅, an answered ❓ |
| **🚫** | all solved NOT as ✅ | 🚫 ⏸️ 🔵 |
| **📌** | decisions | 📌 |

- counts are cumulative: 🔴 ⊂ 🟠 ⊂ ⚪, so the numbers grow left to right
- do not show elements with 0
- ⚪ + ✅ + 🚫 + 📌 = the total: a line is open, solved as ✅, solved NOT as ✅, or a decision
- ⏸️ counts as closed — under 🚫
- one button at a time; a second click, or the total, brings everything back
- every button has an instant tooltip (no browser delay): `Show all 9`, `High — 1`, `All open — 6`, …

Edge cases:

- a ❓ / ⁉️ with a severity goes by it: `❓ 🔴` = high, `❓ ⚪` = low (⚪ only); a bare ❓ / ⁉️ is 🟠
- ⏳ = unsolved (the agent is on it) — a state, not a priority: a bare ⏳ is not ⚪ low, it is just
  open (in the ⚪ "all open" filter only); with a priority it goes by it — `⏳ 🟠` is 🟠
- 🔵 informational note — treated as done or not relevant → ✅ (closed)
- ⛔ ❌ ⚠️ are open, by their own severity

### Visual rules, from the markup alone

- [ ] severity 🔴 🟠 and `❓` (waiting on me) — strong colour, never folded
- [ ] questions are not bold — they can be long; the tinted background is the highlight
- [ ] a click anywhere on an unanswered question opens its form (links, options and replies keep their own clicks)
- [ ] an unanswered question's ❓ / ⁉️ always shows a light button frame (full on hover)
- [ ] an open finding works the same: its first glyph always framed (in its severity's colour), a click
  anywhere on it opens its form
- [ ] the first glyph of a line is its button (framed on hover) — ❓ / ⁉️ answer, 🔴 🟠 ⚪ 🔵 ⏳ ⏸️ ✅ 🚫 reply + set the stage; no separate chips
- [ ] an answered `❓` (a 💬 under it) shows as a green **?** — HTML only, no such glyph: the file keeps `❓`; on hover it is a button [?] — a click edits the answer
- [ ] `⏳` — normal; `⏸️` — muted
- [ ] `✅` `🚫` items and their threads — muted, folded: the question, and under it the answer on
  its own line (never merged into one line) — the question a quiet grey, the answer green; a click opens them
- [ ] folded = up to 3 lines of the question + 3 lines of the answer; anything cut or left out
  (more replies, options) shows a clear **▾ show all** — never hidden silently
- [ ] unpicked options after a pick — muted
- [ ] the glyph hangs: a column of its own, wrapped lines line up with the text, not under the glyph
- [ ] every block aligned left alike — glyphs at one x, text at one x; an unanswered question: a light red
  background and a 1px reddish line on the left (it moves nothing); an open 🔴 / 🟠 finding the same, in red / orange
- [ ] only the first glyph hangs; a second one (the severity after a status: `✅ 🟠`) is part of the text, as 💬 is
- [ ] a summary strip per page: `6` │ `🔴 2` `🟠 3` `⚪ 4` `✅ 2` — the total, then threshold filters (above)
- no extra markup for any of this: `<details>` stays available, but mdhouse folds by glyph
