# Brainstorm

Что я хочу сделать: разработать suggested markups + rendering of this markups + AI-SKILLs to
generate/process this markups

- мы уже (или на 80%) поддерживаем нужные markups
- также результатом работы - work ideology

- [patterns.md](patterns.md) — patterns
- [markup.md](markup.md) — suggested markups
- [rendering.html](rendering.html) — markup → suggested rendering, every case
- [qa-sample.md](qa-sample.md) — every case, long questions / answers → [qa-sample.html](qa-sample.html), rendered by [proto/qa-render.ts](proto/qa-render.ts)

## Glyphs

Meanings follow `/rd/.claude/Glyphs.md`; rows marked **new** are additions our processes need.
The glyph is the **first symbol of the line** — status first, then severity
(`- ✅ 🔴 …`). Default is no glyph: an ordinary line takes none.

### Severity — how much it matters

| Glyph | Meaning | Use | Renders |
|---|---|---|---|
| 🔴 | high — wrong, unsafe, breaks something now | a finding; the first line of an item | loud, never folded |
| 🟠 | medium — attention, not now | a finding | strong |
| ⚪ | low | a finding | normal |
| 🔵 | info / not applicable — skipping it costs nothing | a note in a review | quiet |

### Open — someone must act

| Glyph | Meaning | Use | Renders |
|---|---|---|---|
| ❓ | open question — needs an answer and has none; **waiting on me** | a question; a finding that needs my call (`- ❓ 🟠 …`) | loudest, an answer button; with a 💬 under it — a green **?** (HTML only, no such glyph), muted |
| ⁉️ | disagreement — two sources contradict | name both sources | loudest, an answer button |
| ⏳ | **new** — in progress: the agent is on it, waiting on the agent | after my answer, until the agent replies | normal |

### Status — what happened (settled)

| Glyph | Meaning | Use | Renders |
|---|---|---|---|
| ✅ | done / fixed / decided | proof or the commit in the 💬 under it | muted, folded |
| 🚫 | cancelled / rejected — by decision, nothing failed | the deciding evidence in the 💬 | muted, folded |
| ⏸️ | deferred / on hold | why it waits | muted |
| 🎫 | handed off — ticketed | the ticket | muted |
| ⛔ | cannot be done — blocked, nothing ran | name the obstacle | strong |
| ❌ | failed — it ran and did not pass. Nothing else | the output | loud |
| ⚠️ | partial — follow-up required | what is missing | strong |

### Answers and threads

| Glyph | Meaning | Use | Renders |
|---|---|---|---|
| 💬 | answer / reply — and nothing else | one 💬 per turn, under the ❓ / ⁉️ / item | green block |
| 💬 ⚠️ | partial answer — "need more" | the line after it says what is missing; the item stays ❓ | amber block |
| 👤 | who is speaking | `💬 👤parf …` — the name right after 👤, up to the space | name chip |

### Options — choosing

| Glyph / markup | Meaning | Use | Renders |
|---|---|---|---|
| `- ( )` / `- (x)` under a ❓ | one of — an option / the picked one | radio; a pick settles the ❓ | radio |
| `- [ ]` / `- [x]` under a ❓ | any of — an option / a picked one | GFM task items | checkbox |
| 🌟 | the suggested option (rank 1) | the agent's pick, one per question | highlighted |
| ⭐ | runner-up (rank 2) | optional | slightly highlighted |

### Requests on existing text (not this iteration)

| Glyph | Meaning | Use | Renders |
|---|---|---|---|
| 👉 | **new** — a request about the block above: ask, why, elaborate, rewrite, remove | `> 👉 **rewrite:** …` right after the block | request block |
| ✅ 👉 | the request is done | the agent flips it | muted |

### Callouts (already rendered)

| Glyph | Meaning |
|---|---|
| ‼️ | important — must not be missed |
| 💡 | tip, suggestion |
| ℹ️ | note, FYI |
| 🟢 | OK — nothing to worry about, always |

Never: yellow anything, a bare `?`, ❌ for anything but a failure, green on something that needs action.
