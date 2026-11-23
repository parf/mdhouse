# mdhouse for agents

Read the writing rules below before writing plans, questions, issues or decisions. mdhouse reads
plain Markdown. Then choose the skill for your task.

## Writing rules

- [Plans](plans.md) — plan files, task IDs, decisions, sprints, reviews and archiving
- [Glyphs](skills/glyphs.md) and [Q&A states](skills/qa-states.md) — meanings and who acts
- [Agent markup](agent-markup.md) — forms for questions, issues and decisions
- [Suggested markup](skills/markup.md)
- [Markdown syntax mdhouse reads](https://github.com/parf/mdhouse/blob/main/doc/syntax.md)

## Skills

Claude Code: copy `skills/` to `.claude/skills/`. Any other AI: read a `SKILL.md` and follow it.

- [ask-questions](skills/ask-questions/SKILL.md) — ask a question for the user to answer on the page
- [resolve-questions](skills/resolve-questions/SKILL.md) — carry answers into plans
- [find-issues](skills/find-issues/SKILL.md) — review changes and write findings
- [fix-issues](skills/fix-issues/SKILL.md) — act on triaged findings
- [What we check](skills/review-checklist.md)

## Reference

- [Install — runbook for an AI](install.md)
- [mdhouse-rag-sync](rag-sync.md)
- [Flow authoring packages](flows/README.md) · [catalog.json](flows/catalog.json)
- [Docs for people](https://github.com/parf/mdhouse/tree/main/doc)

This folder is the installed, read-only reference served as `_mdhouse`. Never write here.

Open `/_mdhouse/<file>` for the page or `/api/raw?p=_mdhouse/<file>` for its text. From a raw URL,
replace `README.md` with a linked path such as `plans.md` or `skills/glyphs.md`.
