# Plans

Use `Plans/<project>/` for active project planning. Keep project knowledge, active work,
completed work and follow-up in their own files.

## Files

| Path | Contents |
| --- | --- |
| `README.md` | Stable project knowledge and the current state |
| `TODO.md` | Active execution plan |
| `DONE.md` | Concise completion log |
| `FUTURE.md` | Follow-up after the project closes, when needed |
| `QUESTIONS.md` | Open questions, when needed |
| `DECISIONS.md` | Important decisions that extend the task statement, when needed |
| `RESOLVED.md` or `resolved/` | Resolved questions and decision history |
| `sprint/` | Sub-plans for large tasks, when needed |
| `reports/` | Receipts and proof of execution |
| `HOW-TO-TEST.md` | Test accounts, flows, pipelines and instructions |
| `sources/`, `research/` | Primary sources and research notes |
| `scripts/` | One-time and support scripts belonging to the plan |
| `tmp/` | Gitignored scratch files and scripts |
| `done/` | Archived project artifacts |
| `Plans/done/<project>/` | Completed project archive |

### `README.md`

- Open with one **Current state** block for the latest owner decisions and where work stands.
  Other files link to it so there is one current account.
- Record project purpose, current or target architecture, contracts and invariants, data sources,
  endpoints, jobs, services, settings, security rules, stable layout and canonical links. State
  where things live, what can change and what must stay stable.
- Keep tasks, blockers, acceptance criteria and backlog in the plan. Keep test logs, rejected
  attempts and decision history with their evidence or archive.

### `TODO.md`

- Keep the current objective, next step, active task or wave IDs, dependencies, blockers,
  acceptance criteria and links to active task files, reports and scripts.
- Aim for about 200 lines. Split large work into `sprint/` files and move finished detail to
  `DONE.md` or `done/` as it closes.
- Link to project knowledge, evidence and future work from their relevant tasks.

### `DONE.md`

- Record the completed task or wave ID, a short result, useful commit or revision references and a
  link to archived details. Keep full logs and task files with their archived artifacts.

### `FUTURE.md`

- Record concrete out-of-scope follow-up, future product directions, or work that needs a new
  ticket, project or decision. Keep current-scope work and blockers in `TODO.md`.

## Decisions and resolved questions

### `QUESTIONS.md`

- Keep questions that block or shape active work. Move a thread as soon as it is resolved and keep
  an anchored `№ID` link at its original location. Retain the questions file and unresolved items.
- Continue independent work while an answer is pending. Pause only work that depends on the answer.
- Run owner Q&A with [ask-questions](skills/ask-questions/SKILL.md) and
  [resolve-questions](skills/resolve-questions/SKILL.md).

### `DECISIONS.md`

- Read this file with the plan. Record dated, important decisions that extend the task statement.
  Keep the same ID, the shortest rule, necessary conditions and where it landed. Include a brief
  reason when it is needed to apply the rule. Link to the design and archived discussion.
- Quote the owner's exact words when recording an owner decision. Keep routine answers, discussion
  and history in the resolved archive. An archived answer that changes the task statement also
  gets an entry in `DECISIONS.md`.

### `RESOLVED.md` or `resolved/`

- Archive solved questions and routine decisions in `RESOLVED.md`. If the archive grows, use
  `resolved/<topic>.md` or `resolved/owner-answers-YYYYMMDD.md` for individual topics or sessions.
- Preserve IDs, original questions, options, answers and full threads verbatim. Record the date
  and where each answer was applied. Link important decisions back to their history.

### Markup and links

- Follow [agent markup](agent-markup.md). Start each question or decision with its glyph and ID.
  Use ❓ for open questions and ✅ or 📌 for decisions. Use `( )` to pick one option and `[ ]` to
  pick several. Use the established reply markup when quoting a person.
- Give items stable anchors. Verify links in the rendered document and use an explicit anchor like
  `<a id="A.1"></a>` where needed. Keep anchored links at moved items, for example
  `[№Q3](RESOLVED.md#Q3)`.

## Supporting files

### `sprint/`

- Give each large sub-plan its own `sprint/<name>.md` with an objective, task IDs, acceptance
  criteria, status and links to reports and scripts.
- Keep one line in the root `TODO.md` for each active sprint with its status and link. Move a
  finished sprint to `sprint/done/`, add a short entry to `DONE.md` and update links.

### `reports/`

- Keep receipts such as schema changes applied, run results, readbacks, reviews and QA summaries.
  Name each `<slug>-YYYYMMDD.md` or use a directory of that name for a multi-file receipt.
- Apply the same data rules as for archived artifacts under [`done/`](#archives).

### `HOW-TO-TEST.md`

- Keep test accounts, flows, pipelines, commands and step-by-step checks current for testers and
  agents. Cover both manual and automated checks where they exist.

### `sources/` and `research/`

- Put primary sources, such as owner documents and imported specs, in `sources/`, and research
  notes on competitors or data probes in `research/`. Link to them from the plan. Keep source
  material separate from conclusions and preserve it as recorded when a decision changes the plan.

### `scripts/`

- Put task-owned migrations, backfills, probes, schema changes, report generators and other support
  scripts in `scripts/`. Link to them from their task. They move with the project when it closes.
- Name a script `<task-ID>-<slug>.<ext>`, for example `A.1-backfill.sql` or `A.2-check-counts.sh`.
  The project directory supplies any ticket prefix. Use just a short slug for a script without a
  task. Drop a redundant ticket prefix when moving an existing script into the plan.
- Keep throwaway scripts in `tmp/`. Keep scheduled or request-time product code and unrelated
  one-time scripts in the repository's normal script directory.

### `tmp/`

- Use a gitignored `tmp/` for disposable scripts, dumps and one-off output. Names can be free-form.
  Promote reusable scripts to `scripts/` and useful snapshots to `done/`, with meaningful names.
- Leave `tmp/` out of the completed project archive.

## Archives

- Use `done/` for finished task files, reports, scripts, snapshots and useful frozen plan copies.
  Move obsolete models and past checkpoints to `done/history-<slug>.md` and link there as needed.
  Link the latest archive inventory from the planning index when the project maintains one.
- Keep row-level dumps, query exports and personal data such as user IDs, session cookies, emails
  and phone numbers out of committed reports and archives. Record useful totals in `DONE.md`, keep
  the generator in `scripts/`, and store raw output in ignored `tmp/` or outside the repository.
  Record where it is held and who holds it when that matters for follow-up.

## Lifecycle

### Start and execute

1. Create `README.md` and `TODO.md` for non-trivial work. Add optional files when needed.
2. Name tasks with stable IDs and write their acceptance criteria before execution.
3. Update the plan in the same turn as the work. Mark each completed item `[x]` with a commit or
   receipt, or use a status glyph and a short note for work in progress, partial results or blockers.
4. Update project knowledge and functional docs when a closed task changes them.

### Close a task or wave

- Add a short result to `DONE.md`. Move completed detail out of `TODO.md` and leave a concise
  link at the old anchor where references need it.
- Archive a completed section or wave under `done/`. Move post-project follow-up to `FUTURE.md`.
- Apply resolved answers to the plan and archive their threads. Keep active tasks in `TODO.md`
  until their acceptance criteria are met.

### Close a project

- Review and update `README.md`. Keep the concise `DONE.md`, any needed `FUTURE.md`, and useful
  snapshots under `done/`.
- Move the project directory to `Plans/done/<project>/` and verify links to its new location.

## Collapsible details

Keep decisions, next steps, gates, blockers and results visible. Put supporting material in
`<details>` with a clear summary and blank lines around its Markdown body.

```markdown
<details>
<summary>Supporting measurements</summary>

- A list with **bold text** and `code`.

</details>
```

## Naming

- Use uppercase for standard planning filenames such as `TODO.md` and `RESOLVED.md` so they stand
  out from project-specific files. Under `Plans/`, use lowercase for directory names and descriptive
  slugs. Keep the existing case of ticket codes and task IDs.
- Name ticket-backed project directories `<TICKET>-<short-slug>`, for example
  `APP-123-search-filters`. For work without a ticket, use a short slug such as `search-parser`.
- Use IDs such as `A`, `A.1` and `A.1.2`, and task filenames such as `A.1-parse-cities.md`.
  Keep IDs stable across the plan, `DONE.md`, reports, commits and relevant code comments.
- Prefix ID references in documents with `№`. Link cross-file references to their anchors.

## Waves

- Use waves for user-visible iterations. Small tasks can use IDs alone. Give each wave one
  deliverable and keep unrelated work out of it.
- Review and commit each completed wave. Commit complex subtasks when complete.
- Include docs work. Update the project's functional docs for user-visible changes and end with
  a docs review.
- Change stable contracts only as required, keep each wave reversible, and push or merge only on
  explicit instruction.

## See also

- [Decisions](agent-markup.md#decisions) · [Q&A](https://github.com/parf/mdhouse/blob/main/doc/qa.md)
- [Markup](skills/markup.md) · [Q&A states](skills/qa-states.md) · [Glyphs](skills/glyphs.md)
