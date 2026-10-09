# Markup for questions, issues and decisions

Write questions, issues and decisions in this markup — exactly these forms, nothing else. It is
plain GFM: every item is a list item, every reply a quote under it.

## Rules

- One item = one list item: `- <glyphs> <ID> <title>`. Glyphs first, a space after each.
- The first line is a short title — one line. Details go on the lines below it, indented 2 spaces.
  `Evidence:` / `Impact:` — each on its own line.
- Replies: a quote under the item, indented 2 spaces, one `💬` per turn, a blank `>` between turns.
- You sign every turn `👾`, glued: `💬👾 …`, `💡👾 …`. A person signs `👤name`: `💬 👤parf …`.
- Append only: never edit or delete a turn, never touch a person's words.
- Use only the glyphs below. No others, no substitutes.
- Every item has an ID, right after the glyphs: `- 🔴 A1 …`. It is the item's anchor: `file.md#A1`.
  Unique in its file; never reuse or renumber one.
- Every mention of an ID in the text has `№` — never a bare ID:
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
| 📌 | decision — settled, applies |
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

### Answer or decision

- A simple question → answer: the usual `✅` — `- ✅ Q2 …`. The answer closes its question; nothing
  outside it changes.
- A decision is an answer with consequences: it sets a rule for other work (code, other questions,
  what is in or out). Only that is `📌`.
- Facts, inventories, findings are not decisions: no `📌` — plain text, or research notes.

### ID and reference

- The ID of the question it settles: `⁉️ Q3` → `📌 Q3`; a decision with no question — `R1`, `R2` …
- Reference: `№Q3`; in another file `[№Q3](DECISIONS.md#Q3)`.

### Where

- Settled where it was asked (`TODO.md`, `QUESTIONS.md`), with consequences: the question becomes
  the decision — `- ⁉️ Q3 …` → `- 📌 Q3 …`, the same item, its thread stays. May still change.
- Final: moved to `DECISIONS.md`, the same ID; the old place keeps `[№Q3](DECISIONS.md#Q3)`.

### Decision

```markdown
- 📌 Q3 Timeout is 30 s
  `src/net.ts:12` follows the README.
  - 🚫 10 s — too short on a cold start
- 📌 R1 Logs go to journald
```

- No `✅` on a decision — a decision is accepted.
- Every rejected alternative is a `- 🚫 <alternative> — <why>` line under it — never in the prose
  ("Alternative X was rejected" → `- 🚫 X — <why>`).
- Follow a decision in all work; never change it — reply under it.

## 🎯 Selected

When any item in the file has `🎯` (`- 🎯 🔴 A1 …`), act on the `🎯` items only. Acting on one removes
its `🎯`. Never add `🎯` yourself.

## Converting an existing file

Apply every rule above to every item — the file must end up exactly in this markup:

- [ ] every item: glyphs, ID, a one-line title; the details under it
- [ ] line breaks redone: no line starts with `,` or `.`, no title cut mid-phrase
- [ ] every ID in the text: `№` — `(Q3)` → `(№Q3)`; from another file → a link
- [ ] every rejected alternative in the prose → a `- 🚫 … — why` line
- [ ] `📌` only on decisions with consequences; an answered simple question — `✅`
- [ ] the wording kept — only the markup changes
