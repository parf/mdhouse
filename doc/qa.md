# Questions and answers in mdhouse

Plan folders collect question-and-answer logs — `QUESTIONS.md`, review threads, FAQs. mdhouse
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

Four ways to write them — pick whichever reads best in the file; they render alike:

| Form | Question | Disagreement | Answer | From |
| --- | --- | --- | --- | --- |
| [Alerts](#question-and-answer-alerts) | `> [!QUESTION]` | | `> [!ANSWER]` | mdhouse |
| [Containers](#container-blocks) | `::: q` / `::: question` | | `::: a` / `::: answer` | VuePress / VitePress |
| [Bold lines](#bold-lines) | `**Q:**` | | `**A:**` | mdhouse |
| [Glyphs in a quote](#glyphs-in-a-quote) | `> ?` `> ❓` `> Q:` `> Q` | `> ?!` `> !?` `> ⁉️` | `> 💬` `> A:` | mdhouse |

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
above it. Inside a list item the marker becomes a small ❓ / 💬 instead, and a bold `Q:` in the
middle of a sentence is left as written.

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
