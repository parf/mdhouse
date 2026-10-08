# Skills review — round 1 (📅2026-10-07)

Three reviewers: 👾fable syntax fidelity, 👾fable the workflow loop, 👾opus clarity for a cold agent.
~30 findings, merged by root cause; file names as they are now.

- ✅ 🔴 a `✅` set on the page (settled, a pick, ✓ done) and the agent's `✅` after carry-over looked the
  same — a re-run either skipped a decision or carried it twice
  > 💬 👾claude ✅ is the agent's now: a pick and ✓ done are answers (green ?, the file keeps ❓); the
  > agent sets ✅ with a `→ DECISIONS.md` / `` `sha` `` record — [qa-states.md](qa-states.md), qa-page.js, markup.md
- ✅ 🔴 the skills matched a literal `👤me`; the page signs with the real name or not at all; markup.md
  signed the agent `👤agent` (a person — its replies read as the user's answers)
  > 💬 👾claude "the user" = any 👤 / 👥 or unsigned; the agent always `👾claude`; 7 × `👤agent` → `👾claude`
- ✅ 🔴 a plain reply under an undecided 💡 was read as the answer (skill and renderer)
  > 💬 👾claude a reply, not an answer, in qa-states.md and in `isAnswered()` — checked on a test file
- ✅ 🔴 `/fixes` had no row for `❓` first — the stage it writes itself
  > 💬 👾claude rows for an answered `❓`, a bare ✗ no ("reject or defer?" → ❓), new 💬 under a closed one
- ✅ 🟠 `- ✅ ❓` / `> ✅ ❓` — two stage glyphs; the quote form fell out of the Q&A rendering
  > 💬 👾claude replace the glyph (`- ✅ …`, `> ✅ …`); the renderer reads `> ✅ …` as a settled question
- ✅ 🟠 ⏳ ended in ❓ in one skill and ✅ in the other
  > 💬 👾claude one rule: done → ✅ + record; needs the user → reply + ❓
- ✅ 🟠 a false premise after the user approved the fix was set 🚫 — reversing the user's call
  > 💬 👾claude → ❓ with the evidence; 🚫 only on an untriaged, disproved one (named as the exception)
- ✅ 🟠 four copies of the states had already drifted
  > 💬 👾claude one [qa-states.md](qa-states.md); the skills keep only their own "what you do"
- ✅ 🟠 where questions go, and the DECISIONS / TODO format, were left to guess
  > 💬 👾claude append `## <topic> — 📅date` at the end; templates for DECISIONS and TODO; default files
- ✅ 🟠 reply templates lacked the blank `>` between turns (one paragraph on GitHub)
  > 💬 👾claude in qa-states.md and every reply template
- ✅ 🟠 frontmatter would not load as Claude Code skills (`trigger:`, flat files, "me" in descriptions)
  > 💬 👾claude no `trigger`, `argument-hint`, third-person descriptions, `disable-model-invocation` on
  > the generators; ships as `.claude/skills/<name>/SKILL.md` when it leaves brainstorm
- ✅ ⚪ committing TODO.md could sweep the user's uncommitted ticks
  > 💬 👾claude the dirty check in qa-states.md
- ✅ ⚪ several `# Findings` titles per file; 📅 in headings was no chip
  > 💬 👾claude one `# Findings`, `## <scope> — 📅date` per run; headings get badges
- ⏸️ ⚪ a pick on a severity-first finding drops the severity from the page's glyph button
  > 💬 👾claude a finding with options now starts `❓ 🟠`; the button keeps the severity in the text — check in round 2
