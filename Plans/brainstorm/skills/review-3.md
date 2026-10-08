# Skills review — round 3 (📅2026-10-07)

Final round: 👾fable an end-to-end run on the renderer (re-runs changed nothing), 👾fable adversarial
edge cases, 👾opus "ready to ship?" — verdict 🟠 ready after the fixes. No structural finding; edges only.
User rules that came in: 🎫 needs who takes it, and the agent sets ✅ + 🎫<ID> once it filed the ticket.

- ✅ 🔴 options added after a bare `no` without a reply left the `no` as the last word — "answered"
  > 💬 👾claude a reply always comes first, the 💡 / options under it; a bare `no` is never an answer —
  > in qa-states.md and isAnswered()
- ✅ 🔴 the agent's record (`→ DECISIONS.md`) counted as its turn — a re-pick after it never answered
  > 💬 👾claude records are not turns (`→`, `` `sha` ``, `🎫ID →`) — qa-states.md, isRecord() / lastTurn()
- ✅ 🟠 a second 💡 left the first undecided forever
  > 💬 👾claude only the newest 💡 counts; older ones render quiet
- ✅ 🟠 "already done?" matched by line and day — ahead of the premise gate
  > 💬 👾claude after the premise gate, and only when a commit names the claim
- ✅ 🟠 a disproved 🔴 could be set 🚫 unasked and fold away
  > 💬 👾claude unasked 🚫 only on 🟠 / ⚪; a disproved 🔴 → ❓; every agent-set 🚫 listed in the report
- ✅ 🟠 `💬 👤parf ⚠️ …` (⚠️ after the badge) read as a whole answer
  > 💬 👾claude both orders read as partial
- ✅ 🟠 answers.md had no ⚠️ row and pointed into fixes.md for the task steps
  > 💬 👾claude "Doing a task" lives in qa-states.md; both skills point there; ⏳ ⚠️ 🎫 one row
- ✅ ⚪ a ⏳ after the agent's own proposal had no row; a 💡 signed by the user was "undecided"
  > 💬 👾claude ⏳ + the agent's last 💬 = yes, do it; a 💡 signed 👤 / 👥 is the user's answer
- ✅ ⚪ "later" inside a sentence closed the item
  > 💬 👾claude a stage word only when it is the whole answer
- ✅ ⚪ `DECISIONS.md` rendered as a link to http://DECISIONS.md
  > 💬 👾claude fuzzy links off; file names in code spans in the record template
- ✅ ⚪ a ⏳ / elaborate finding kept the "untriaged" frame; a closed item showed live 💡 buttons; the
  folded line showed the agent's record instead of the user's words; `> ⛔ / ❌ / ⚠️` quotes fell out
  > 💬 👾claude anything from the user = triaged; closed → quiet 💡; the folded line skips records;
  > every stage glyph opens a quote, only ❓ ⁉️ look like waiting on the user
- ✅ ⚪ two 🌟 in the any-of example against "one 🌟"; `[file]` vs `[topic]` undecidable; `/answers`
  and `/fixes` commit yet could run unasked; repeated rules
  > 💬 👾claude any-of may star each recommended option; `.md` = the file; all four on request only;
  > repeats cut
- ⏸️ ⚪ at ship time: links `qa-states.md` → `../qa-states.md`; delete `.claude/skills/review/` and
  `.claude/skills/resolve-findings/` (two skills for one job); CLAUDE.md mentions → `/findings`, `/fixes`
  > 💬 👾claude one commit when the skills leave brainstorm
