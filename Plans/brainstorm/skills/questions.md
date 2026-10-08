---
name: questions
description: Ask me questions in the Q&A markup — plain, with a 💡 suggested answer, or with options to pick — so I can answer them on the page. Pair: /answers processes the answers.
trigger: /questions
---

# /questions [file] [topic]

Writes questions into a Markdown file for me to answer in mdhouse. Syntax: [../markup.md](../markup.md),
glyphs: [../README.md](../README.md). `/answers` reads the answers back.

- `file` — where the questions go: the document they are about, or `Plans/questions.md` (default)
- `topic` — what to ask about; else the decisions still open in the current task

Chat in Russian; the questions in English.

## Where

Append a section — never rewrite an existing one:

```markdown
## Questions — <topic> (📅YYYY-MM-DD)
```

Under the document's last heading when the questions are about that document; otherwise at the end
of the file.

## Pick a form per question

**Plain** — I have to think, there is no obvious answer:

```markdown
- ❓ Which port should the dev server use when the live instance holds 7777 and a second
  developer runs their own copy on the same machine?
```

**Disagreement** — two sources contradict; name both:

```markdown
- ⁉️ The README says the service listens on 7777; the unit file from `service install --port 8080`
  pins 8080 — which one is the documented default?
```

**With a suggested answer (suggest)** — you have a likely answer; I say yes / no / reply:

```markdown
- ❓ Should the summary strip stay visible while scrolling a long findings file?
  > 💡 👾claude Keep it sticky: the counts are what you come back to; one 30-pixel bar costs little.
```

**One of** — the answer is a choice; radios:

```markdown
- ❓ Which port should `bun run dev` use by default?
  - ( ) `7790`, with its own config in `.scratch/` 🌟
  - ( ) `port: 0` — whatever is free, printed at start
  - ( ) `7778`, next to the live one ⭐
```

**Any of** — several may apply; checkboxes (GFM):

```markdown
- ❓ What should ship in the npm package besides the code?
  - [ ] `doc/*.md` 🌟
  - [ ] `CHANGELOG.md` 🌟
  - [ ] `doc/*.png`
```

## Rules

- One question per item, `- ❓` or `- ⁉️` first in the line. Never answer it yourself with 💬 — a
  proposed answer is 💡, signed `👾claude`.
- Self-contained: the context goes into the question — long is fine, a reader must not need the chat.
- Say what would settle it when it is not obvious (the measurement, the person, the file).
- Options: `( )` for one of, `[ ]` for any of — never both under one question; at most one 🌟
  (the recommended one) and one ⭐ (runner-up); never pre-tick `(x)` / `[x]`.
- A question that blocks work may carry a severity after the glyph: `- ❓ 🔴 …`; most carry none.
- Badges for references: `🎫RLM-412`, `👥platform`, `📡slack`, `📅2026-10-07` — glued, no space.
- Blocking questions first; group by theme with a blank line between groups, not sub-headings.
- Plain GFM only: it must read well on GitHub. No HTML, no yellow, no bare `?`.
- Commit the file alone (`docs: questions — <topic>`); never push.

## Report

How many questions, in which forms, the file and the heading; then the stop marker
`🟥🟥🟥 questions in <file> — answer on the page`.
