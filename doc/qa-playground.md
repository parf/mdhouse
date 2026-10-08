# Q&A playground

A page to try answering in the browser. Serve it writable and open it:

```bash
mdhouse doc -p --rw        # from the repository root — or any folder holding a copy of this file
```

In a `--rw` folder an item's first glyph is a button: click it, write, **💬** (or Ctrl+Enter) — or
one of the actions after it (Alt+1…9). The reply is written into this file, quoted under the item.

This page is meant to be written to. `git checkout doc/qa-playground.md` puts it back.
What each form means is in [Questions and answers in mdhouse](qa.md).

---

## Questions → answers, with a thread

- ❓ Who keeps eating the yoghurt labelled "DO NOT TOUCH"?
- ❓ Is it a bug or a feature if nobody filed a ticket?
  > 💬 A feature, until a customer finds it.
- ⁉️ The README says the build takes two minutes; the build disagrees by forty.
- ❓ What is the plan for Friday deploys?
  > 💬👾 There is a plan:
  > - don't
  > - if you must, bring snacks for the on-call
  >
  > 💬 ⚠️ 👤parf need more — and who brings the snacks?
- ❓ Can the rubber duck be promoted to senior engineer?
  > 💬👾 It reviews every line and never interrupts.

> ❓ Does "works on my machine" count as a test environment?
> 💬 Only if your machine is shipped to the customer.

## A question with a suggested answer

- ❓ Should the meeting about fewer meetings be a meeting?
  > 💡👾 An email. A short one.

## Findings — stages

- 🔴 `printer.c:1987` the printer only jams before a deadline
  Evidence: three deadlines, three jams
  Impact: everyone, every Friday
  > 💡👾 Print the night before.
- 🟠 `coffee.yml:3` the coffee machine makes only decaf
- ⚪ `fridge.md` the shelves have no team labels
- ⏸️ ⚪ rewrite everything in a language invented last Tuesday
  > 💬👾 later — we still have scars from the last one
- 🔵 the office plant was watered

## Pick one, or several

- ❓ Who gets the coffee machine's on-call rotation?
  - ( ) the coffee machine itself 🌟
  - ( ) whoever drinks the most
  - ( ) the intern
- ❓ What goes into the release party?
  - [ ] cake
  - [ ] a demo that works
  - [ ] a demo that almost works

## Old forms — read as the ones above

Written as mdhouse used to read them; the page shows them in the new markup, and the first answer
on this page writes them converted.

> ? Is a semicolon a lifestyle choice?
> A: In JavaScript, yes. In Python, a cry for help.

> [!QUESTION]
> Why does the printer only jam before a deadline?

**Q:** How many standups can one person attend before they sit down?

- **Q:** Who named the server `prod-final-v2-really-final`?
- **A:** The same person who named `prod-final-v3`.

::: q Will the legacy code ever be rewritten?
:::

- ☐ Should we label the fridge shelves by team?

## Checkboxes — ticked, not answered

- [ ] Is it a meeting if everyone is on mute?
- [x] Did turning it off and on again work?

## Not questions — these must stay as they are

> A quick note: a quote starting with "A" is English, not an answer.

> Quite so — and "Q" counts only as a word of its own.

Text with a **Q:** in the middle of a sentence stays bold.

- 🎉 A list item opening with any other emoji is just a list item.
