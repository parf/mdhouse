# Writing for mdhouse — read this first

mdhouse reads plain Markdown. This page says how to write plans, which glyphs to use and which markup. Read the three parts below, then the skill you need.

The other files of this reference sit next to this one: take the URL you fetched and replace `for-agents.md` with the path of a link (`skills/glyphs.md`, `agent-markup.md`). Raw text: `/api/raw?p=_mdhouse/<file>`.

## 1. Plans — how to write them

- [Plans](plans.md) — the files (`Plans/README.md`, `TODO.md`, `DECISIONS.md`, `resolved.md`) and where each kind of text goes

## 2. Glyphs — which ones

- [Glyphs](skills/glyphs.md)
- [Q&A states](skills/qa-states.md) — what each glyph means and who acts

## 3. Markup — which forms

- [Markup for questions, issues and decisions](agent-markup.md) — exactly these forms, nothing else
- [Syntax — everything mdhouse reads](https://github.com/parf/mdhouse/blob/main/doc/syntax.md)

## 4. Skills

- [ask-questions](skills/ask-questions/SKILL.md) — put a question to the user, to answer on the page
- [resolve-questions](skills/resolve-questions/SKILL.md) — carry the user's answers into the plans
- [find-issues](skills/find-issues/SKILL.md) — review what changed, write the issues
- [fix-issues](skills/fix-issues/SKILL.md) — act on the user's triage of the issues
