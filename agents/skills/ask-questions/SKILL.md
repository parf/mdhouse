---
name: ask-questions
description: Writes clarifying questions in the mdhouse Q&A markup so the user can answer on the page. Use plain questions, 💡 suggested answers or pickable options. Pair with /resolve-questions.
argument-hint: "[file] [topic]"
disable-model-invocation: true
---

# /ask-questions [file] [topic]

Writes questions into a Markdown file; the user answers on the page; `/resolve-questions` reads them back.
States, identities, threads, committing: [qa-states.md](../qa-states.md) (shipped: `../qa-states.md`).

- `file` — an explicit Markdown path. Otherwise use `QUESTIONS.md` in the owning plan directory,
  including for a subtask TODO. For repo-wide work use `Plans/QUESTIONS.md`. Create the file with
  `# Questions` if needed. Resolve the owning plan from the active task before writing.
- `topic` — the rest; else the decisions still open in the current task

## Where

Always append at the end of the file — never rewrite an existing section:

```markdown
## <topic> — 📅YYYY-MM-DD
```

## Pick a form per question

**Plain** — no obvious answer:

```markdown
- ❓ Q1 Which port should the dev server use when the live instance holds 7777 and a second developer
  runs their own copy on the same machine?
```

**Disagreement** — two sources contradict; name both:

```markdown
- ⁉️ Q2 The README says the service listens on 7777; the unit from `service install --port 8080` pins
  8080 — which one is the documented default?
```

**With a suggested answer** — you have a likely answer; the user says yes / no / reply:

```markdown
- ❓ Q3 Should the summary strip stay visible while scrolling a long issues file?
  > 💡👾 Keep it sticky: the counts are what you come back to; one 30-pixel bar costs little.
```

**One of** — radios:

```markdown
- ❓ Q4 Which port should `bun run dev` use by default?
  - ( ) `7790`, with its own config in `.scratch/` 🌟
  - ( ) `port: 0` — whatever is free, printed at start
  - ( ) `7778`, next to the live one ⭐
```

**Any of** — checkboxes (GFM); the user ticks, then **✓ done**:

```markdown
- ❓ Q5 What should ship in the npm package besides the code?
  - [ ] `doc/*.md` 🌟
  - [ ] `CHANGELOG.md` 🌟
  - [ ] `doc/*.png`
```

## Rules

- One question per item. Start with `- ❓` or `- ⁉️`, followed by a stable ID unique in the file.
  Add your proposed answer as a `> 💡👾` reply below the question.
- Self-contained: the context goes into the question — long is fine; the reader has no chat.
- Plain text only in the question: no `💬`, no `done` / `no` at the start — they are answers.
- Say what would settle it when that is not obvious (the measurement, the person, the file).
- Use `( )` for pick-one and `[ ]` for pick-many. Choose one format per question and leave the
  choices blank for the user. For pick-one, put 🌟 and ⭐ at the end of the recommended option
  and runner-up, at most one of each.
  For pick-many, use 🌟 on each recommended option.
- A question that blocks work may carry a severity before the ID, as in `- ❓ 🔴 Q6 …`.
- References as badges, glued: `🎫APP-123`, `👥platform`, `📡slack`, `📅2026-10-07`.
- Blocking questions first. Plain GFM — it must read well on GitHub.
- Commit the file alone: `docs: questions — <topic>`.

Report per [qa-states.md](../qa-states.md#report); tail: `🟥🟥🟥 <n> questions in <file> — answer on the page`.
