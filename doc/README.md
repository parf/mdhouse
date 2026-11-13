# mdhouse reference

This folder is the installed, read-only reference, served as `_mdhouse`. Never write here.

- A file's page: `/_mdhouse/<file>`; its raw text: `/api/raw?p=_mdhouse/<file>`

## Install and run

- [Install — runbook for an AI](install.md)
- [CLI reference](cli.md)
- [Access — users, allowed networks, ssh](access.md)
- [mdhouse on macOS](mac.md)

## Write for the user

Read before writing plans, questions, issues or decisions.

- [Markup for questions, issues and decisions](agent-markup.md)
- [Glyphs](skills/glyphs.md)
- [Q&A states — shared by /ask-questions, /resolve-questions, /find-issues, /fix-issues](skills/qa-states.md)
- [Syntax — everything mdhouse reads](syntax.md)
- [Suggested markup](skills/markup.md)

## Skills

Claude Code: copy `skills/` to `.claude/skills/`. Any other AI: read a `SKILL.md` and follow it.

- [ask-questions](skills/ask-questions/SKILL.md)
- [resolve-questions](skills/resolve-questions/SKILL.md)
- [find-issues](skills/find-issues/SKILL.md)
- [fix-issues](skills/fix-issues/SKILL.md)
- [What we check](skills/review-checklist.md)

## Plans

- [Plans](plans.md)

## Integrations

- [Agent Bus — AI agent chat panel](agent-bus.md)
- [mdhouse-rag-sync](rag-sync.md)

## Flows

- [Flow authoring packages — schema v1](flows/README.md) · [catalog.json](flows/catalog.json)

## For people

- [Markdown in mdhouse](markdown.md)
- [Questions and answers in mdhouse](qa.md)
- [Q&A playground](qa-playground.md)
- [prefs.json.dist](prefs.json.dist)
