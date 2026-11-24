---
name: resolve-questions
description: Processes the user's Q&A answers. Updates the owning plan, archives resolved threads and replies where the user asked for more. Use after the user answered questions written by /ask-questions.
argument-hint: "[file]"
disable-model-invocation: true
---

# /resolve-questions [file]

**Read [qa-states.md](../qa-states.md) first** (shipped: `../qa-states.md`) — who is who, the states,
replying, doing a task, writing a stage, committing, the report. This file says only what `/resolve-questions`
does with each state.
**Never trust the task** — a ⏳ or an answer that asks for work is a claim: first check by execution
that the problem exists and needs doing.

- `file` — an explicit Markdown path. Otherwise use `QUESTIONS.md` in the owning plan directory,
  including for a subtask TODO. For repo-wide work use `Plans/QUESTIONS.md`. Read the active task
  to identify the owning plan and apply answers there.

| State | Do |
|---|---|
| answered | **carry it over** (below) → `✅` |
| asks for more (incl. a bare `no`) | reply as qa-states.md says, keep `❓`; carry once settled (`Not X — Y`) |
| `⏳` `⚠️` `🎫` | as qa-states.md says; a task done is also the answer → carry it over → `✅` |
| anything else | nothing |

## Carry over

Read the owning `README.md`, `TODO.md` and any `DECISIONS.md`. Look for existing tasks, rules and
archive entries before writing. Keep their IDs on repeated runs.

1. **Archive the answer.** Save the full question, options, exact answers and thread under its ID
   in `RESOLVED.md` or the owning plan's topic file under `resolved/`. Record the date. If an
   approved answer supersedes a rule, save the prior wording verbatim at a distinct archive
   anchor before updating the active rule. Keep the resolving question's own ID.
2. **Update the specification and rules.** Apply approved target changes to the affected lines
   of `README.md`. In `DECISIONS.md`, keep only the current rules that extend the specification,
   under topic headings. Use `- 📌 <ID> <rule>` with any necessary conditions and link to the
   archived thread. Replace a superseded rule under its existing ID. If withdrawn, move it to
   history and update references. Keep routine answers in the archive.
3. **Reconcile the active work.** Update the owning task or add `- [ ] <ID> <action>` under the
   relevant section of `TODO.md`, with acceptance criteria and a link to the answered question.
   For a subtask TODO, update its task file and its status in the owning `TODO.md`. Move completed
   or cancelled detail to `DONE.md` or the task archive.
4. **Verify before closing.** Check `README.md`, `TODO.md` and `DECISIONS.md` agree and contain
   current material. Verify the archive target and its rendered anchor. Then leave an anchored
   link at the question's former location, such as `- <a id="Q3"></a>[№Q3](RESOLVED.md#Q3)`.
   Keep the questions file and unresolved items.
