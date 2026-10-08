# Syntax — everything mdhouse reads

One page, every form. Details: [Markdown in mdhouse](markdown.md) · [Questions and answers](qa.md) ·
try them: [Q&A playground](qa-playground.md).

## Markdown

| Write | Get |
| --- | --- |
| `\| a \| b \|` + `\| --- \| --- \|` | table |
| `- [ ]` · `- [x]` | task — tickable with `--rw` |
| `~~text~~` | ~~text~~ |
| `https://bun.sh` | a link |
| `text[^1]` … `[^1]: note` | footnote |
| `` `code` `` · ` ```ts ` fence | code, highlighted |
| ` ```mermaid ` fence | diagram |
| `> [!NOTE]` `[!TIP]` `[!IMPORTANT]` `[!WARNING]` `[!CAUTION]` | alert |
| `## Heading` | `#heading` anchor |
| `{#id .class}` after a heading / paragraph | id, classes |
| `---` YAML block at the top | front matter, not shown |
| `<details>`, `<p align="center">`, `<br>` … | raw HTML |
| `\` at the end of a line · `\ ` | line break |
| `[x](other.md#section)` · `[x](src/cli.ts)` | the file's page |
| `![x](logo.png)` | image |
| `src/cli.ts:557` · `Plans/README.md` in the text | green link to the file (at that line) |

Not supported: `:smile:`, `==highlight==`, `H~2~O`, `x^2^`, `$math$`, `[[page]]`.

## Q&A

| Write | Get |
| --- | --- |
| `- ❓ q` · `> ❓ q` | question — waiting on me |
| `- ⁉️ …` · `> ⁉️ …` | disagreement — two sources contradict |
| `> 💬 a` | answer / reply |
| `> 💬 ⚠️ …` | need more — the question stays open |
| `> 💡 …` | suggested answer — ✓ agree / ✗ cancel |
| `> 💬👾 …` · `> 💬 👤parf …` | reply with its author |
| `>` (blank) between turns | thread |
| `- 🔴 …` `- 🟠 …` `- ⚪ …` · `> 🟠 …` | finding: high · medium · low |
| `- 🔵 …` | informational |
| `❓` `⏳` `⏸️` `🎫` `✅` `🚫` + severity | waiting on me · on the agent · deferred · ticket · done · cancelled |
| `- 🔴 D1 …` | issue id — anchor `#D1` |
| `№D1` · `№H` in the text | badge, a link to `#D1` |
| `- ( )` · `- (x)` under a question | pick one |
| `- [ ]` · `- [x]` under a question | pick several — ✓ done |
| `🌟` · `⭐` on an option | suggested · runner-up |
| `- 🎯 …` first in the line | selected for the next run |
| `> 👉 **rewrite:** …` after a block | request: `ask` `why` `elaborate` `rewrite` `remove` |
| `👤parf` `👥team` `👾` `📡slack` `🎫RLM-412` `🏷️ui` `📅2026-10-06` | badge chip |

## Short forms — read as the above

| Write | Read as |
| --- | --- |
| `> Q: q` · `> q: q` · `> Q q` · `> ? q` | `> ❓ q` |
| `> A: a` · `> a: a` | `> 💬 a` |
| `> T: t` · `> t: t` · `> [!TIP] t` | `> 💡 t` |
| `> ! x` · `> !! x` | `> 🟠 x` · `> 🔴 x` |
| `> ?! …` · `> !? …` | `> ⁉️ …` |
| `> [!QUESTION]` · `> [!ANSWER]` | `> ❓` · `> 💬` |
| `**Q:** q` · `**A:** a` | `> ❓ q` · `> 💬 a` |
| `- **Q:** q` · `- **A:** a` | `- ❓ q` · `  > 💬 a` under it |
| `::: q` … `:::` · `::: a` … `:::` | `> ❓ …` · `> 💬 …` |
| `- ☐` · `- ☑` `- ✔️` · `- ☒` | `- ❓` · `- ✅` · `- 🚫` |
