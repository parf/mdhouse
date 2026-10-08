---
name: ask-questions
description: Writes questions for the user in the Q&A markup — plain, with a 💡 suggested answer, or with options to pick — so the user answers them on the page in mdhouse. Use when a decision is the user's and several are open. Pair: /resolve-questions processes the answers.
argument-hint: "[file] [topic]"
disable-model-invocation: true
---

# /ask-questions [file] [topic]

Writes questions into a Markdown file; the user answers on the page; `/resolve-questions` reads them back.
States, identities, threads, committing: [qa-states.md](qa-states.md) (shipped: `../qa-states.md`).

- `file` — an argument ending in `.md`; default `Plans/questions.md`, created with `# Questions` if missing
- `topic` — the rest; else the decisions still open in the current task

## Where

Always append at the end of the file — never rewrite an existing section:

```markdown
## <topic> — 📅YYYY-MM-DD
```

## Pick a form per question

**Plain** — no obvious answer:

```markdown
- ❓ Which port should the dev server use when the live instance holds 7777 and a second developer
  runs their own copy on the same machine?
```

**Disagreement** — two sources contradict; name both:

```markdown
- ⁉️ The README says the service listens on 7777; the unit from `service install --port 8080` pins
  8080 — which one is the documented default?
```

**With a suggested answer** — you have a likely answer; the user says yes / no / reply:

```markdown
- ❓ Should the summary strip stay visible while scrolling a long issues file?
  > 💡👾 Keep it sticky: the counts are what you come back to; one 30-pixel bar costs little.
```

**One of** — radios:

```markdown
- ❓ Which port should `bun run dev` use by default?
  - ( ) `7790`, with its own config in `.scratch/` 🌟
  - ( ) `port: 0` — whatever is free, printed at start
  - ( ) `7778`, next to the live one ⭐
```

**Any of** — checkboxes (GFM); the user ticks, then **✓ done**:

```markdown
- ❓ What should ship in the npm package besides the code?
  - [ ] `doc/*.md` 🌟
  - [ ] `CHANGELOG.md` 🌟
  - [ ] `doc/*.png`
```

## Rules

- One question per item, `- ❓` / `- ⁉️` first. Never answer it with 💬 — a proposed answer is a `💡`.
- Self-contained: the context goes into the question — long is fine; the reader has no chat.
- Plain text only in the question: no `💬`, no `done` / `no` at the start — they are answers.
- Say what would settle it when that is not obvious (the measurement, the person, the file).
- Options: `( )` or `[ ]`, never both under one question; never pre-tick. One of: at most one 🌟
  (recommended) and one ⭐ (runner-up). Any of: 🌟 on each option you recommend, no ⭐.
- A question that blocks work may carry a severity after the glyph: `- ❓ 🔴 …`.
- References as badges, glued: `🎫RLM-412`, `👥platform`, `📡slack`, `📅2026-10-07`.
- Blocking questions first. Plain GFM — it must read well on GitHub.
- Commit the file alone: `docs: questions — <topic>`.

Report per [qa-states.md](qa-states.md#report); tail: `🟥🟥🟥 <n> questions in <file> — answer on the page`.
