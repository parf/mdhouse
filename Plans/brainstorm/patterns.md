# Interactive patterns — what mdhouse should support

The page is where I answer; the file is the conversation; an agent reads it back.
Markup: [markup.md](markup.md).
Four patterns, one visual rule: **what needs me stands out, what is settled gets out of the way.**

## 1. Questions → decisions / actions

A raw list (from a chat, a ticket) or questions about one `.md` file.

- [x] ❓ question · ⁉️ disagreement → 💬 answer under it, in the question's own syntax
- [x] task / status items answerable; **Check & Save** ticks
- [ ] answered questions fold into **decisions** (DECISIONS.md) and **actions** (TODO.md) — by the agent, every answer carried over
- [ ] an answered ❓ looks done; an unanswered one stands out
- [ ] a way to say "not an answer yet — need more" (stays open, marked)

## 2. Review → findings → iterations → actions / decisions

Findings have **stages**, not just open / answered:

```
issue → answer → solved ✅ | rejected 🚫 | deferred ⏳ | needs more details ❓ → (agent elaborates) → …
```

- [x] format: severity first (`- 🔴 file:line …`), status glyph in front once decided (`- ✅ 🔴 …`), 💬 under it
- [x] `/review` writes, `/resolve-findings` processes, answers in place
- [ ] several rounds on one item: answer → agent replies → I answer — a thread, not one 💬
- [ ] I set the stage from the page (✅ / 🚫 / ⏳ / ❓) without typing the glyph
- [ ] counts per stage and severity at the top; "open only" filter
- [ ] actions / decisions extracted — rarely, so manual is fine

## 3. Review with suggestions — choosing, not writing

An item comes with options; I pick.

- [ ] **one of many** (radio) and **several of many** (checkboxes) under a question
- [ ] a pick is one click; it is written back to the file (the chosen option marked, the rest left as written)
- [ ] a free-text 💬 still possible next to the options
- [ ] once picked, the other options are muted
- [ ] syntax: ❓ — what the options look like in Markdown, readable without mdhouse

## 4. Working with existing documents — point at something and say …

- [ ] select a block / a sentence → ask a question, ask to elaborate, ask for a rewrite
- [x] add at the top / bottom of a section — ↓ ⇊ on a heading
- [ ] the request is written next to what it points at (anchored), so an agent finds it
- [ ] an agent's reply / rewrite lands there too; the request then reads as done

## What I want to see

- [ ] **important (🔴 🟠) and pending items stand out**
- [ ] less relevant options are muted
- [ ] solved items don't attract attention — collapsed or muted, one click to see them
- [ ] the same rules on every pattern above: Q&A, findings, suggestions, requests

## Open

- ❓ How does an agent learn there is something new to process — and how do I?
- ❓ Who answered: my git name on every 💬, or only when several people answer?

<details>
<summary>Original notes</summary>

typical patterns i want to support

1. Questions (raw list based on something; or from specific md file review)
   usual ? / !?  => 💬 blocks

   flow questions => decisions/actions

2. Review => findings with severity/other-options => processing(several iterations) => actions and decisions (not so often)

3  Review with suggestions (multi option or one option of many) - different ways of answering

what i want to see

  Important(severity) & Pending items must stand out
  less relevant options should be kinda muted
  solved items must not attract attention; but i should be able to access them (maybe muted expand elemnents)

while our question flow is straitfoward; review => findings have stages; issue => answer => unsolved=>solved/need-more-details/elaboration

4. working with existing documents
  - ask questions / elaborations / requests-rewrites (add XXX top/bottom)
  ^^ point finger at something and say ...

</details>
