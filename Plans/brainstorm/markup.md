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

A thread — one 💬 per turn, the author in bold (as ✍️ signed quotes are), a blank `>` between
turns so GitHub keeps them apart:

```markdown
- ❓ Do we keep the old URLs?
  > 💬 **agent:** Redirect `/d/<root>/x.md` → `/d/x.md` for a year?
  >
  > 💬 **parf:** need more — which links are out there?
  >
  > 💬 **agent:** 14 in README files, 2 in issues.
```

- the item glyph is the state: `❓` waiting on me · `⏳` waiting on the agent · `✅` settled
- "need more" = my 💬 while the glyph stays `❓` (the agent flips it to `⏳` when it starts)
- GitHub: a list item with a quote under it — readable as a chat

## 2. Findings — stages

```markdown
- 🔴 `src/cli.ts:536` --fg hands over on a busy port — the unit "succeeds", nothing retries. Fix: exit 1
- ❓ 🟠 `package.json:46` dev script feeds `.` to the live instance
  > 💬 **agent:** pin `:7790` + own config, or drop it?
- ⏳ ⚪ `src/lib/search.ts:174` ReDoS without rg
  > 💬 **agent:** needs a design — later
- ✅ 🟠 `test/control.test.ts:8` sockets in the real config dir
  > 💬 **agent:** `112b307` — temp config via preload
- 🚫 ⚪ `CLAUDE.md:119` socket wait
  > 💬 **agent:** moot — the reload polls HTTP now
```

| Line starts with | Stage | Looks |
|---|---|---|
| `🔴` `🟠` `⚪` | open, not processed | loud by severity |
| `❓` + severity | waiting on **me** | loudest |
| `⏳` + severity | waiting on the agent / deferred | normal |
| `✅` `🚫` + severity | settled | muted, folded |

## 3. Suggestions — pick one, or several

Options are GFM task items under the question — they render as checkboxes on GitHub too:

```markdown
- ❓ Dev server port — **one of**:
  - [ ] `7790`, own config ⭐
  - [ ] `port: 0`, printed at start
  - [ ] keep `7777`
```

```markdown
- ❓ What ships in the package — **any of**:
  - [x] `doc/*.md`
  - [ ] `doc/*.png`
  - [ ] `Plans/done/CHANGELOG-beta.md`
```

- `one of` / `any of` in the question decides radio vs checkboxes; none → checkboxes
- ⭐ = the suggested one (the agent's pick)
- a click writes `[x]`; with **one of**, it also clears the others
- once something is picked, the unpicked options are muted; the question turns `✅` when I say so
  (or on the pick, for **one of**)
- a 💬 under the options still works: "none — do X instead"

Considered and dropped: `- ( )` / `- (x)` radios — plain text on GitHub, no checkbox.

## 4. Point at something and say …

A request is a quote **right after** the block it is about, opening with 👉 and a verb:

```markdown
The parser walks the token stream twice: once for headings, once for tasks.

> 👉 **rewrite:** one pass — shorter, keep the numbers
```

```markdown
## Install

> 👉 **add at the top:** a one-line `bunx mdhouse` quick start
```

```markdown
Search falls back to a JS regex when rg is missing.

> 👉 **why:** "falls back" — is the fallback ever hit in practice?
```

- verbs: `ask` · `why` · `elaborate` · `rewrite` · `add at the top` / `add at the bottom` · `remove`
- a sentence inside a block: quote it in the request (`"falls back"`)
- the agent answers under it (`> 💬 **agent:** done — …`) or just does it and turns 👉 into ✅:
  `> ✅ 👉 **rewrite:** one pass …`
- in mdhouse: select text → a 👉 button writes the request after its block, the quote prefilled

## Visual rules, from the markup alone

- [ ] severity 🔴 🟠 and `❓` (waiting on me) — strong colour, never folded
- [ ] `⏳` — normal
- [ ] `✅` `🚫` items and their threads — muted, folded to one line; a click opens them
- [ ] unpicked options after a pick — muted
- [ ] a header strip per page: `❓ 3 · 🔴 1 · 🟠 4 · ✅ 12` — a click filters
- no extra markup for any of this: `<details>` stays available, but mdhouse folds by glyph
