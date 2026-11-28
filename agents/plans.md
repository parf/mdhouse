# Plans

Keep plans under `Plans/` in the project's repository. Read the project's specification, active tasks
and current decisions before working. Push or merge only on explicit instruction. Keep raw exports
and personal data out of committed reports and archives.

## Plan size

- **Small.** `Plans/ProjectName.md` with `## README`, `## TODO` and `## DONE`. Use `[ ]` for open
  tasks and `[x]` for finished tasks.
- **Medium.** `Plans/project-name/` with `README.md`, `TODO.md` and `DONE.md`. Add other standard
  files when the work needs them.
- **Large.** Same layout. Link from `README.md` to PascalCase feature specs such as `PublicAccess.md`.
  Each spec defines one feature's behavior and constraints. Link implementation tasks to its spec.
  A [constitution](#constitution-md) is strongly recommended.

## Lifecycle

### Start and execute

1. Discuss unsettled features in `brainstorm/`. Add work to TODO after it is ready to plan.
2. Give each task a stable ID and acceptance criteria before work. Keep the objective, next step,
   dependencies, blockers and evidence links in TODO. Aim for about 200 lines in `TODO.md`. Put
   supporting detail in `<details>` and keep decisions, gates, blockers and results visible.
3. For a task needing its own plan, put scope, steps and acceptance in one file such as
   `A.1-search-filters.md`. Keep one checkbox with the same ID and a link in the owning TODO.
4. Use a wave for one user-visible deliverable. Use `sprint/<name>.md` for a large coordinated
   sub-plan. Include objective, task IDs, acceptance, status and links to evidence and scripts.
   Keep one status line and link per active sprint in `TODO.md`.
5. Update the plan in the same change. Record partial results or blockers with a glyph and short note.
   Update functional docs when behavior changes. Review and commit each completed wave and commit
   complex subtasks when complete. Keep waves reversible. Change stable contracts only as required.

### Close a task or wave

- Keep a task in TODO until its acceptance criteria pass. Mark it `[x]` and move it to DONE with
  the same ID, a short result and the commit or evidence link. Verify any pointer at the old anchor.
- Archive task files, reports, scripts and snapshots in [`done/`](#archives). Move finished sprints
  to `sprint/done/` and update links. Put post-project follow-up in `FUTURE.md`.

### Close a project

- Check delivery against the specification and decisions. Keep unresolved work in TODO until it
  passes or the owner approves a scope change.
- Move the plan file or directory into `Plans/done/`. Verify incoming and outgoing links and anchors.

## Files

| Path | Contents |
| --- | --- |
| `README.md` | High-level project spec |
| `TODO.md` | Active tasks and acceptance |
| `DONE.md` | Results and evidence links |
| `DECISIONS.md` | Current approved rules |
| `QUESTIONS.md` | Open questions |
| `RESOLVED.md` | Resolved questions and decision history |
| `TESTING.md` | Test accounts, flows, pipelines, commands and manual or automated checks |
| `FUTURE.md` | Post-project follow-up and work needing its own decision or ticket |
| `CONSTITUTION.md` | Project-wide rules for building and reviewing work |
| `done/` | Finished tasks |
| `tmp/` | Gitignored scratch |
| `scripts/` | Plan scripts |
| `sources/` | Primary sources |
| `research/` | Research notes |
| `resolved/` | Resolved threads by topic or session |
| `brainstorm/` | Feature discussions before TODO |
| `sprint/` | Large sub-plans |
| `reports/` | Execution, review and test evidence |
| `Plans/done/ProjectName.md` or `Plans/done/project-name/` | Completed projects |

### `README.md`

Describe the goal, scope, expected behavior, main components and key contracts. Link to details.
Update the affected lines when the approved target changes. A large area may have a brief
**Current state** note for orientation.

### `CONSTITUTION.md`

Link the constitution from `README.md` and the agent entry instructions. Reread it before writing
the feature spec, planning, implementing and reviewing. Check applicable rules in review.

- **Identity.** Purpose, domain and scope.
- **Principles.** Stable IDs. `MUST` requires. `MUST NOT` forbids. `SHOULD` permits a justified
  exception. `MAY` is optional.
- **Technology.** Adopted languages, frameworks and tools.
- **Quality gates.** Required tests, test-first policy, coverage and review.
- **Hard constraints.** Requirements that apply across features.
- **Governance.** Version, amendment date, approver and versioning rules. Archive each approved
  amendment and its **Sync Impact Report** in `RESOLVED.md` or `resolved/`. List affected spec,
  plan and task templates, agent instructions and checks to update.

## Decisions and resolved questions

- Use the owning plan's `QUESTIONS.md` by default, including for subtasks. Use `- ❓ <ID> <question>`
  and `> 💡👾 <proposal>`. Follow [agent markup](agent-markup.md) for choices, recommendations and
  IDs. Leave choices blank for the user. Continue work that can proceed without the answer.
  Use [ask-questions](skills/ask-questions/SKILL.md) and [resolve-questions](skills/resolve-questions/SKILL.md).
- Keep current rules in `DECISIONS.md`, grouped by topic. Use 📌, a stable rule ID, its conditions
  and a link to the archived thread.
- Archive resolved questions, options, exact answers and full threads in `RESOLVED.md`,
  `resolved/<topic>.md` or `resolved/owner-answers-YYYYMMDD.md`. Record the date and where the
  answer applies. Archive prior wording before replacing or withdrawing a rule. Keep the rule's ID
  and the resolving question's separate ID.
- Apply approved changes to the affected specification, decisions and TODO in one update.
  Verify the archive target before leaving an anchored `№ID` pointer. Keep `QUESTIONS.md`, retain
  unresolved items and update links to withdrawn rules.

## Supporting files

- Preserve primary sources as recorded and link them from the plan. Keep analysis in `research/`.
- Link plan scripts to their task. Name them `<task-ID>-<slug>.<ext>`, for example
  `A.1-backfill.sql`. The project directory supplies the tracker ID. Use a short slug for scripts
  without a task. Keep product and unrelated scripts in the repository's normal script directory.
- Name reports `<slug>-YYYYMMDD.md` or use a same-named directory for multi-file evidence.

## Archives

- Use `done/history-<slug>.md` for obsolete models or checkpoints. Link the archive index when used.
- Exclude `tmp/` from the archive. Keep row-level dumps, query exports and personal data such as
  user IDs, cookies, emails and phone numbers in ignored `tmp/` or outside the repository.
  Record totals in DONE and record where raw output is held when follow-up depends on it.

## Naming

| Item | Name |
| --- | --- |
| Tracker-backed plan | `TrackerID-human-name`. Keep the ID's case. Use a lowercase hyphenated suffix. Example `APP-123-search-filters.md` or `APP-123-search-filters/`. |
| Single-file plan without a tracker | PascalCase, e.g. `ProjectName.md` |
| Plan directory without a tracker | Lowercase hyphenated, e.g. `project-name/` |
| Feature spec | PascalCase, e.g. `PublicAccess.md` |
| Standard planning file | UPPERCASE, e.g. `TODO.md` |
| Task ID | `A`, `A.1`, `A.1.2`. Keep the ID across plans, evidence and commits. |

Keep task IDs and anchors stable. Link cross-file references as `№ID`.
