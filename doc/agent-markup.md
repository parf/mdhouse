# Markup for questions, issues and decisions

Write questions, issues and decisions in this markup — exactly these forms, nothing else. It is
plain GFM: every item is a list item, every reply a quote under it.

## Rules

- One item = one list item: `- <glyphs> <ID> <text>`. Glyphs first, a space after each.
- More lines of the item: indented 2 spaces. `Evidence:` / `Impact:` — each on its own line.
- Replies: a quote under the item, indented 2 spaces, one `💬` per turn, a blank `>` between turns.
- You sign every turn `👾`, glued: `💬👾 …`, `💡👾 …`. A person signs `👤name`: `💬 👤parf …`.
- Append only: never edit or delete a turn, never touch a person's words.
- Use only the glyphs below. No others, no substitutes.

## IDs and references

- Question: `Q1`, `Q2` …
- Issue: an area letter + a number — `A1`, `B12`; no areas → `I1`.
- Decision: the ID of the question it settles (`❓ Q3` → `📌 Q3`); a decision with no question — `R1`.
- An ID is unique in its file; never reuse or renumber one.
- The ID goes right after the glyphs: `- 🔴 A1 …`. It is the item's anchor: `file.md#A1`.
- Refer to an item always with `№`: `№A1` in the same file, `[№Q3](DECISIONS.md#Q3)` in another one.

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
| 📌 | decision — settled, applies |
| 💬 | a reply |
| 💡 | a suggested answer — not the answer yet |
| 🎯 | selected for the next run — set by a person only |

## Question → answer

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
  - ( ) journald
  - ( ) a file 🌟
- ❓ Q5 Which checks run in CI?
  - [ ] tests
  - [ ] tsc
  - [ ] lint
```

- A picked one: `(x)` / `[x]`. `🌟` after an option — the one you suggest.

## Issue → stages

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

```markdown
- 📌 Q3 Timeout is 30 s
  `src/net.ts:12` follows the README.
  - 🚫 10 s — too short on a cold start
- 📌 R1 Logs go to journald
```

- No `✅` on a decision — a decision is accepted.
- `- 🚫 …` under it — a rejected alternative, with why.
- Follow a decision in all work; never change it — reply under it.

## 🎯

When any item in the file has `🎯` (`- 🎯 🔴 A1 …`), act on the `🎯` items only. Acting on one removes
its `🎯`. Never add `🎯` yourself.
