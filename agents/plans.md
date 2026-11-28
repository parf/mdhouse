# Plans

Use `Plans/<project>/` for active project planning. Keep project knowledge, active work,
completed work and follow-up in their own files.

Read `README.md`, `TODO.md` and `DECISIONS.md` together. After an approved change, reconcile all
three before closing the work. Keep current specifications, tasks and rules in those files. Move
completed work and superseded text to their archives.

## Files

| Path | Contents |
| --- | --- |
| `README.md` | Stable, high-level project specification |
| `CONSTITUTION.md` | Project-wide rules for building and reviewing work, strongly recommended for large projects |
| `TODO.md` | Active execution plan |
| `DONE.md` | Concise completion log |
| `FUTURE.md` | Follow-up after the project closes, when needed |
| `QUESTIONS.md` | Open questions, when needed |
| `DECISIONS.md` | Current rules that extend the specification, when needed |
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

- Write an executive-level specification of what the project should be. Cover its purpose, scope,
  expected behavior, major components and important contracts and constraints. Link to the details.
- Keep it stable during development. Update only the parts affected by a lasting change to the
  specification. Apply an approved decision that changes the target to those lines in the same
  update. A large project area can have a brief **Current state** note for orientation.
- Keep tasks, progress, blockers and task-level acceptance criteria in `TODO.md`. Keep test logs,
  rejected attempts and decision history with their evidence or archive.

### `CONSTITUTION.md`

For large projects, create `Plans/<project>/CONSTITUTION.md` and link to it from the project
`README.md` and the instructions agents read when they start work. A constitution is especially
useful when multiple teams or agents need to apply the same rules across many features. For small
and medium projects, keep the rules in `README.md` and `DECISIONS.md` as needed.

The constitution defines how the project is built and reviewed across features. Each feature
specification defines what to build for that feature. Anyone working on a feature, including an
agent, rereads the constitution before writing its specification or plan, starting implementation,
and reviewing the result. During review, check the result against each applicable rule.

- **Identity.** State the project's purpose, domain and scope briefly.
- **Principles.** Use stable rule IDs. Use `MUST` and `MUST NOT` for requirements and prohibitions,
  `SHOULD` for defaults that need a reason to depart from them, and `MAY` for allowed options.
- **Technology.** Record the languages, frameworks and tools the project has committed to.
- **Quality gates.** Define required tests, when test-first development applies, coverage
  expectations, and the review and verification needed before work can be accepted.
- **Hard constraints.** State requirements that apply across features, such as static output first
  or preserving the compatibility of published interfaces.
- **Governance.** Record the current version and amendment date. Say who approves amendments and
  how the version is incremented. With each approved amendment, keep a **Sync Impact Report**
  listing the affected specification, plan and task templates, agent instructions and checks that
  need updating. Archive the amendment and its report in `RESOLVED.md` or `resolved/`.

### `TODO.md`

- Keep the current objective, next step, active task or wave IDs, dependencies, blockers,
  acceptance criteria and links to active task files, reports and scripts.
- Aim for about 200 lines. Split large work into `sprint/` files and move finished detail to
  `DONE.md` or `done/` as it closes.
- Link to project knowledge, evidence and future work from their relevant tasks.
- When one TODO item needs its own plan, move its scope, steps and acceptance criteria to a
  single file such as `A.1-search-filters.md`. Keep one checkbox with the same ID and a link to
  the file in `TODO.md`. Record project-level decisions in the owning `DECISIONS.md`.

### `DONE.md`

- Record the completed task or wave ID, a short result, useful commit or revision references and a
  link to archived details. Keep full logs and task files with their archived artifacts.

### `FUTURE.md`

- Record concrete out-of-scope follow-up, future product directions, or work that needs a new
  ticket, project or decision. Keep current-scope work and blockers in `TODO.md`.

## Decisions and resolved questions

### `QUESTIONS.md`

- When writing or working from a plan, use `- ❓ <ID> <question>` for each clarification. If you
  have a recommended answer, put `> 💡👾 <proposal>` below the question. Use pick-one or pick-many
  options when the user has specific choices.
- Use the owning plan's `QUESTIONS.md` by default, including when working on a subtask TODO. Keep
  questions that block or shape active work. Archive resolved threads and keep an anchored `№ID`
  link at their original location. Retain the questions file and unresolved items.
- Continue independent work while an answer is pending. Pause only work that depends on the answer.
- Run owner Q&A with [ask-questions](skills/ask-questions/SKILL.md) and
  [resolve-questions](skills/resolve-questions/SKILL.md).

### `DECISIONS.md`

- Use 📌 so decisions stand out on the page. Keep only the latest approved rules in
  `DECISIONS.md`, grouped by topic, feature or contract. Record important details and constraints
  that extend the high-level specification. Keep each rule short with its stable ID, necessary
  conditions and a link to the archived thread.
- When the owner approves a replacement, save the prior wording in the archive before updating
  the current rule in place under its existing ID. Keep the new question's ID in the archive and
  link it to the updated rule. For a withdrawn rule, archive it and update references to point
  to its history.
- Apply changes to the high-level specification in `README.md` and reconcile affected tasks in
  `TODO.md` in the same update.

### `RESOLVED.md` or `resolved/`

- Archive solved questions, routine decisions and prior versions of rules in `RESOLVED.md`. If the
  archive grows, use `resolved/<topic>.md` or `resolved/owner-answers-YYYYMMDD.md` for topics or sessions.
- Preserve IDs, original questions, options, answers and full threads verbatim. Record the date
  and where each answer was applied. Give prior versions distinct archive anchors and link
  important decisions back to their history.

### Markup and links

- Follow [agent markup](agent-markup.md). Use ❓ for open questions, 📌 for current decisions and
  ✅ for resolved questions. For pick-one `( )`, put 🌟 at the end of the recommended option and
  ⭐ at the end of the runner-up when offered, at most one of each. For pick-many `[ ]`, put 🌟 on
  each recommended option and use 🌟 as the only recommendation marker. Leave all choices blank
  for the person to pick.
- Give items stable anchors. Write and verify the archive target before replacing an item with a
  pointer, for example `- <a id="Q3"></a>[№Q3](RESOLVED.md#Q3)`. Check the rendered anchors and
  incoming and outgoing links when moving files or splitting an archive.

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
4. Update functional docs when a task changes behavior. Update `README.md` when the specification
   changes.

### Close a task or wave

- Add a short result to `DONE.md`. Move completed detail out of `TODO.md` and leave a concise
  link at the old anchor where references need it.
- Archive a completed section or wave under `done/`. Move post-project follow-up to `FUTURE.md`.
- Apply resolved answers to the plan and archive their threads. Keep active tasks in `TODO.md`
  until their acceptance criteria are met.

### Close a project

- Check delivery against `README.md` and `DECISIONS.md`. Keep any unresolved gap active in
  `TODO.md` until it is addressed or the owner approves a change in scope. Keep the concise
  `DONE.md`, any needed `FUTURE.md`, and useful snapshots under `done/`.
- Move the project directory to `Plans/done/<project>/` and verify incoming and outgoing links,
  including anchors.

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
