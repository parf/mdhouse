# mdhouse for agents

This folder is the installed, read-only reference for agents, served as `_mdhouse`. Never write here.

- A file's page: `/_mdhouse/<file>`; its raw text: `/api/raw?p=_mdhouse/<file>`
- Docs for people: [github.com/parf/mdhouse/doc](https://github.com/parf/mdhouse/tree/main/doc)

## Install

- [Install — runbook for an AI](install.md)

## Write for the user

Read before writing plans, questions, issues or decisions.

- [Writing for mdhouse — read this first](for-agents.md) — plans, glyphs and markup in one page, for an AI
- [Plans](plans.md)
- [Markup for questions, issues and decisions](agent-markup.md)
- [Glyphs](skills/glyphs.md)
- [Q&A states — shared by /ask-questions, /resolve-questions, /find-issues, /fix-issues](skills/qa-states.md)
- [Suggested markup](skills/markup.md)

## Skills

Claude Code: copy `skills/` to `.claude/skills/`. Any other AI: read a `SKILL.md` and follow it.

- [ask-questions](skills/ask-questions/SKILL.md)
- [resolve-questions](skills/resolve-questions/SKILL.md)
- [find-issues](skills/find-issues/SKILL.md)
- [fix-issues](skills/fix-issues/SKILL.md)
- [What we check](skills/review-checklist.md)

## Tools

- [mdhouse-rag-sync](rag-sync.md)

## Flows

- [Flow authoring packages — schema v1](flows/README.md) · [catalog.json](flows/catalog.json)
