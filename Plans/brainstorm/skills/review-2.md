# Skills review — round 2 (📅2026-10-07)

Three new reviewers: 👾fable states vs the renderer (test files), 👾fable the loop again (re-runs, a
changed mind, a crash), 👾opus a cold run of /answers and /fixes on qa-sample.md. ~22 findings, merged.
Two rules from the user came in during the round: a person's ✅ always carries their 👤; for the agent
✅ alone is enough.

- ✅ 🔴 a finding the user approved through its 💡 or a reply had no state — "untriaged" in qa-states,
  "open, unframed" on the page
  > 💬 👾claude "answered" covers findings; the renderer shows it as over to the agent (open, chip,
  > no finding frame); the page's answered() keeps a finding open
- ✅ 🔴 "something new under a closed item → ⏳" reopened every stage the user set with a note (🚫 with
  its reason, ✅ settled) — the agent redid what the user rejected
  > 💬 👾claude closed is closed: the agent never acts on ✅ 🚫 ⏸️ 🎫; the user reopens with ⏳ / ❓
- ✅ 🔴 DECISIONS entries were fragments without the question ("yes — and keep it first")
  > 💬 👾claude `**<subject from the question>: <decision>.** — from <file>`, the user's words quoted under it
- ✅ 🟠 a changed mind added a second, contradicting DECISIONS entry
  > 💬 👾claude look for the question's entry first; rewrite it in place; TODO line reworded / removed
- ✅ 🟠 a crash between fix, ✅ and commit left a half-state the re-run misread
  > 💬 👾claude one commit per item (fix + ✅ + docs); "already done?" step checks the log first
- ✅ 🟠 ⏳ / ⚠️ with no text, ✓ done with no ticks, a bare `no` — no row
  > 💬 👾claude rows for each; a bare no is not carried — the next 💡 or options, ❓ kept
- ✅ 🟠 a pick won over the agent's later question; any-of was "answered" by an option comment
  > 💬 👾claude a 👾 / 📡 last turn reopens even after a pick; any-of only by the item's `done` — in
  > qa-states.md and isAnswered()
- ✅ 🟠 `> ✅ …` showed the green ? (= not yet processed); `> ⏳ / 🚫 / ⏸️ / 🎫 …` fell out of the rendering
  > 💬 👾claude a closed quote shows its glyph; every stage glyph opens a quote; ⏳ gets its chip
- ✅ 🟠 the record template broke on backticks inside a code span
  > 💬 👾claude a fenced block
- ✅ 🟠 ⛔ ❌ had no owner; AUTO's boundary decided nothing on three real findings
  > 💬 👾claude ⛔ ❌ → listed in the report; AUTO: 🟠 / ⚪ only — never 🔴 🔵, wording, exit codes,
  > ports, service or CLI behaviour
- ✅ ⚪ "leave it" after "reject or defer?" looped
  > 💬 👾claude a stage named in words is that stage; ask once
- ✅ ⚪ `git diff --quiet` missed the user's staged edits
  > 💬 👾claude `git diff --quiet HEAD --`; untracked counts as the user's
- ✅ ⚪ relative links break once shipped to `.claude/skills/<name>/`; rules repeated across skills;
  `👤me` left in markup.md / README.md
  > 💬 👾claude "shipped: ../qa-states.md"; each rule only in qa-states; 👤me → 👤parf
