# Questions and answers in mdhouse

Plan folders collect question-and-answer logs — open-question lists, review threads, FAQs. mdhouse
renders every common way of writing one as the same one-line blocks: an icon in front of the
text, and a bright fill that says what the line is.

| | Means | Edge / fill |
| --- | --- | --- |
| ❓ question | open — it needs an answer and has none yet | red |
| ⁉️ disagreement | open — two sources contradict, and the conflict is not settled | orange |
| 💬 answer | settles the question or disagreement above it; indented under it | green |

The meanings follow the glyph conventions in `/rd/.claude/Glyphs.md`: a ❓ or ⁉️ with a 💬 under it
is settled; with nothing under it, it is still open. The colours are the `--qa-*` tokens, the
same in every form below.

Four ways to write blocks — pick whichever reads best in the file; they render alike — and list
items, which are questions with a status:

| Form | Question | Disagreement | Answer | From |
| --- | --- | --- | --- | --- |
| [Alerts](#question-and-answer-alerts) | `> [!QUESTION]` | | `> [!ANSWER]` | mdhouse |
| [Containers](#container-blocks) | `::: q` / `::: question` | | `::: a` / `::: answer` | VuePress / VitePress |
| [Bold lines](#bold-lines) | `**Q:**` | | `**A:**` | mdhouse |
| [Glyphs in a quote](#glyphs-in-a-quote) | `> ?` `> ❓` `> Q:` `> Q` | `> ?!` `> !?` `> ⁉️` | `> 💬` `> A:` | mdhouse |
| [Checkbox and status items](#checkbox-and-status-items) | `- [ ]` `- [x]` `- ✅` `- ⚠️` … | `- ⁉️` | indented `> 💬` | mdhouse |

In a folder served with `--rw` they can be [answered in the browser](#answering-in-the-browser).
To try every form, open the [Q&A playground](qa-playground.md).

Everything else mdhouse renders beyond CommonMark is in [Markdown in mdhouse](markdown.md).

---

## Question and answer alerts

mdhouse's own two, for the question-and-answer logs plan folders collect. Unlike GitHub's five
they have no title row: each is one line, the icon in front of the text. The text may also follow
the marker on the same line — `> [!ANSWER] Yes.`

```markdown
> [!QUESTION]
> Do we keep the 5y signal?

> [!ANSWER]
> Yes — it carries most of the lift.
```

> [!QUESTION]
> Do we keep the 5y signal?

> [!ANSWER]
> Yes — it carries most of the lift.

GitHub does not know these two, and shows them there as plain quotes with the marker visible.

## Container blocks

The container syntax VuePress and VitePress use. A block holds any Markdown — lists, code,
several paragraphs — and text on the opening line becomes its first line (bold, for a question):

```markdown
::: q Who owns the import?
The ATTOM feed lands monthly.
:::

::: answer
The data team, from October.

- schedule: first Monday
- alerts: #data-import
:::
```

::: q Who owns the import?
The ATTOM feed lands monthly.
:::

::: answer
The data team, from October.

- schedule: first Monday
- alerts: #data-import
:::

`q` and `question`, `a` and `answer` are the same thing. Close each block with `:::`.

## Bold lines

The shortest form. Lines starting with a bold `Q:` or `A:` render exactly like `[!QUESTION]` /
`[!ANSWER]` — one block per line, the icon in front; a line without a marker stays with the block
above it. As list items — `- **Q:**` and `- **A:**` — they are the same blocks; a bold `Q:` in
the middle of a sentence is left as written.

```markdown
**Q:** Is the cache warm?
**A:** After the first request.
```

**Q:** Is the cache warm?
**A:** After the first request.

## Glyphs in a quote

The glyphs of a Q&A log, opening a line of a quote, make the same one-line blocks:

| Line opens with | Block |
| --- | --- |
| `?` `❓` `Q:` `Q` | ❓ question — open, nobody has the answer yet |
| `?!` `!?` `⁉️` | ⁉️ disagreement — two sources contradict, still open |
| `💬` `A:` | 💬 answer — settles the question or disagreement above it |

```markdown
> ?! The spec says 5 years; the code uses 7.
> 💬 The code is right — the spec was never updated.
```

> ?! The spec says 5 years; the code uses 7.
> 💬 The code is right — the spec was never updated.

> ? Who owns the import?
> 💬 The data team.

The quote must open with one of them; then the whole quote becomes blocks. A bare `A` is never a
marker — `> A quick note` is English — so an answer needs `A:` or 💬.

## Checkbox and status items

Every list item that opens with a checkbox or a status glyph is a question, and the checkbox or
glyph is its status. Its answer is an indented quote inside the item:

```markdown
- [ ] Which hosts take the new adapter?
- [x] Does the provider accept duplicates?
  > 💬 No — those calls carry a request key.
- ⚠️ Is the migration done?
  > 💬 For two tables of three.
```

- [ ] Which hosts take the new adapter?
- [x] Does the provider accept duplicates?
  > 💬 No — those calls carry a request key.
- ⚠️ Is the migration done?
  > 💬 For two tables of three.

The status glyphs, with the meanings `/rd/.claude/Glyphs.md` gives them; the variation selector
(`✅` vs `✔`, `⚠️` vs `⚠`) is optional:

| Opens with | Status |
| --- | --- |
| `[ ]` `☐` | open |
| `[x]` `✅` `✔️` `☑️` | done |
| `⚠️` | partial — follow-up needed |
| `⏳` | in progress |
| `🎫` | handed off — ticketed |
| `❌` | failed — it ran and did not pass |
| `🚫` | dropped — rejected by decision |
| `⛔` | blocked — cannot be done |
| `☒` | crossed out |
| `❓` | open question |
| `⁉️` | disagreement — two sources contradict |

The glyph must be followed by a space; any other emoji (`- 🎉 …`) leaves the item a plain list
item. Only `[ ]` / `[x]` are checkboxes — counted in the page header and tickable in a `--rw`
folder; a glyph stays the text it is. An existing `> A:` answer is read too, but an answer saved
from the browser is always written as `> 💬`.

## Answering in the browser

In a folder served with `--rw`, in the plain document view (not a diff), each ❓ and ⁉️ is a
button; checkbox and status items get a small grey 💬 after the box or glyph — green once they have an answer —
and an item marked ❓ or ⁉️ uses its own glyph. Click it (or Enter on it) and an editor opens
under the question, loaded with the existing answer if there is one.

Write the answer — plain Markdown; lines starting with `-` are bullets — and **Save** or
Ctrl+Enter; Esc or **Cancel** closes it without saving. On a checkbox or status item **Check &
Save** also ticks `[ ]` to `[x]`, or turns the glyph into ✅.

The answer is written in the question's own syntax:

| Question | Answer written as |
| --- | --- |
| `> ?` `> ❓` `> ?!` … in a quote | `> 💬 …` lines in the same quote |
| `> [!QUESTION]` | a `> [!ANSWER]` block after a blank line |
| `**Q:**` (or `- **Q:**`) | an `**A:**` line under it (or the next list item) |
| `::: q` | a `::: a` … `:::` block after a blank line |
| `- [ ]` / `- ⚠️` … item | an indented `> 💬` quote inside the item |

An existing answer is replaced in place; nothing else in the file changes. Only answers are
written, never the question. If the file changed since the page was loaded — the question was
edited, or someone answered it meanwhile — the save is refused or the editor says so, and the
text you typed is kept. A file with uncommitted changes opens on its diff; switch back to the
document to answer.
