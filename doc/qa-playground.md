# Q&A playground

A page to try answering in the browser. Serve it writable and open it:

```bash
mdhouse doc -P --rw        # from the repository root — or any folder holding a copy of this file
```

In a `--rw` folder the ❓ and ⁉️ icons are buttons: click one, write the answer, **Save** (or
Ctrl+Enter). An unanswered question gets a 💬 under it; an answered one opens its answer for
editing. The answer is written into this file, in the same syntax as the question.

This page is meant to be written to. `git checkout doc/qa-playground.md` puts it back.
What each form means is in [Questions and answers in mdhouse](qa.md).

---

## Glyphs in a quote

> ? Who keeps eating the yoghurt labelled "DO NOT TOUCH"?

> ? Is it a bug or a feature if nobody filed a ticket?
> 💬 A feature, until a customer finds it.

> ?! The README says the build takes two minutes; the build disagrees by forty.

> !? The style guide says tabs; the cat walked over the keyboard and chose spaces.
> 💬 The cat outranks the style guide.

> ⁉️ Two clocks on the office wall disagree, and both claim to be on NTP.

> ❓ What is the plan for Friday deploys?
> 💬 There is a plan:
> - don't
> - if you must, bring snacks for the on-call

> Q: Can the rubber duck be promoted to senior engineer?

> Q Does "works on my machine" count as a test environment?
> A: Only if your machine is shipped to the customer.

## Alerts

> [!QUESTION]
> Should the meeting about fewer meetings be a meeting?

> [!QUESTION]
> Why does the printer only jam before a deadline?

> [!ANSWER]
> It can sense fear. Printers have done so since 1987.
>
> Printing the night before has not been tried yet.

## Bold lines

**Q:** How many standups can one person attend before they sit down?

**Q:** Is a semicolon a lifestyle choice?
**A:** In JavaScript, yes. In Python, a cry for help.

As list items too:

- **Q:** Who named the server `prod-final-v2-really-final`?
- **Q:** Can we schedule the outage for when nobody is looking?
- **A:** Yes — 3 a.m. on a Sunday, as tradition demands.

## Containers

::: q Should the coffee machine get its own on-call rotation?
:::

::: question
Will the legacy code ever be rewritten?

It was "temporary" in 2009.
:::

::: answer
Eventually, once three things are true:

- someone understands it
- that person is still here
- the person who wrote it has forgiven us
:::

---

## Checkbox questions

The `QUESTIONS.md` convention: every task item is a question. In a writable folder a ❓ after the
checkbox opens the editor; the answer is written as an indented `> 💬` inside the item, and
**Check & Save** also ticks the box.

- [ ] Is it a meeting if everyone is on mute?
- [ ] Who approved the requirement that the logo be bigger and also smaller,
      and has anyone told the designer?
- [x] Did turning it off and on again work?
  > 💬 Yes. Nobody knows why. Nobody will ever know why.

## Status glyph items

A list item that opens with a status glyph is a question with a status. The ❓ after the glyph
opens the editor; on a ❓ or ⁉️ item the glyph itself is the button. **Check & Save** turns the
glyph into ✅.

- ❓ Where do the missing socks go — same place as the missing semicolons?
- ⁉️ Marketing says the feature ships Monday; engineering says "which feature?"
- ⚠️ Is the coffee machine fixed? It makes coffee, but only decaf.
- ⏳ Has the build finished yet?
- ☐ Should we label the fridge shelves by team?
- 🚫 Rewrite everything in a language invented last Tuesday?
  > 💬 No. We still have scars from the last one.
- ✅ Is lunch at noon?
  > 💬 Yes, and it is not up for discussion.

## Not questions — these must stay as they are

> A quick note: a quote starting with "A" is English, not an answer.

> Quite so — and "Q" counts only as a word of its own.

Text with a **Q:** in the middle of a sentence stays bold.

- 🎉 A list item opening with any other emoji is just a list item.
