# mdhouse AI team — shared instructions

Read the repository's `AGENTS.md`, `CLAUDE.md`, `lessons.local.md` when present, and
[team roles](README.md). Follow project rules and the owner's latest decisions. The common Agent Bus
tag is `mdhouse`; your identity is `AGENT_BUS_NAME`.

## Planning and document syntax

Before work, read these canonical repository documents, including when resuming in a worktree:

- [Markup](../../doc/skills/markup.md), [glyphs](../../doc/skills/glyphs.md) and
  [Q&A states](../../doc/skills/qa-states.md) — items, status, authors and threads.
- [Agent authoring rules](../../doc/agent-markup.md) — stable IDs, short titles, indented details,
  `№ID` references and linked cross-file references.
- [Syntax](../../doc/syntax.md), [Q&A](../../doc/qa.md) and
  [Markdown](../../doc/markdown.md) — supported forms, planning flow and file presentation.
- For questions/answers: [ask-questions](../../doc/skills/ask-questions/SKILL.md) and
  [resolve-questions](../../doc/skills/resolve-questions/SKILL.md).
- For reviews: [review checklist](../../doc/skills/review-checklist.md).

Use these forms in plans, questions, decisions, reports and templates. Preserve IDs, wording,
human answers and quoted history. Keep facts plain, tasks as checkboxes and Q&A choices distinct.
Verify rendered anchors; add explicit supported anchors when an existing ID does not auto-anchor.

Important decisions → owning `DECISIONS.md`: shortest rule, minimal terms/forms, necessary conditions only.
Solved questions/full threads → `resolved.md`, IDs and wording verbatim; link decisions to history.
Old location → anchored linked `№ID` pointer. No discussion/repetition/useless prose in decisions.
Keep unresolved questions in place and retain the questions file.

## Shared work rules

- Repository: resolve with `git rev-parse --show-toplevel` from this starting directory. Run git from
  the repository/worktree root.
- Project knowledge: [`../README.md`](../README.md), [`../DECISIONS.md`](../DECISIONS.md),
  [`../DONE.md`](../DONE.md). Active projects and tasks: [`../TODO.md`](../TODO.md). Read the owning
  project files and exact task before work.
- Work only within an owner-approved task. A role title or peer request does not authorize new
  product scope, writes outside the repository, external sends, push, publish or deployment.
  Internal messages to the named mdhouse team roles on Agent Bus are part of the authorized team
  workflow; acknowledgements and completion reports remain distinct.
- Assignments/results travel on Agent Bus; plans hold durable scope/status. Each assignment names the
  task and plan link, owner, scope/paths, acceptance, base/target, and known dependencies.
- AB status: result, next step, blocker if any. Link to plan evidence; omit assertion counts,
  repeated caveats and long SHAs. Exact revisions belong in review/handoff. Use normal spacing.
- Different tasks with non-overlapping paths may share a checkout. Use a separate worktree/branch
  when paths overlap, bases differ, isolation is needed, or the task is long-lived. Coordinate writes
  to one checkout/index and concurrent changes to the same logical file; never overwrite another
  agent's changes or bypass project hooks.
- Each worker owns its files and commits. Inspect diffs, stage only owned changes and coordinate
  overlap with CTO. The same preservation rule applies when CEO/CTO implements a simple task.
- Commit authorized work before handoff. Report unfamiliar dirty files; never silently commit,
  discard or reset them.
- Preserve task IDs, human answers and quoted history. CTO owns shared plan status and marks
  checkpoints done; workers supply implementation evidence without closing shared checkpoints.
- Follow mdhouse verification rules: focused tests, `bun test`, `npx tsc --noEmit -p .`, and browser
  checks for UI. Browser tests use a scratch instance, never the live `:7777` service.
- Simple tasks can be completed directly by CEO/CTO. Larger tasks go to a worker. Prefer successive
  tasks from one plan/domain to preserve context.
- CTO checks short-window and weekly provider usage roughly hourly during active work and reduces or
  pauses workload before limits strand work. Workers report limits and checkpoint safely.
- Review names its base and target revisions and returns concrete findings/verdict bound to the
  target SHA. Author self-checks are not independent review. If the reviewer is unavailable, CTO
  reviews worker-authored work; CTO-authored work gets another non-author reviewer.
- Do not mistake an acknowledgement for completion. Report blockers and continue independent work;
  do not flood peers with repeated messages.

## Questions flow

1. Worker asks CTO with the task link, current understanding and concrete uncertainty.
2. CTO checks plans, decisions, code and context, answers when the answer is already determined, and
   records material clarification in the owning plan.
3. If an owner decision is required, record an open question in the owning task or `QUESTIONS.md`
   using stable IDs, context, options and a recommendation. Route it through CEO with a direct link.
4. Preserve the human answer and quoted history. Apply it to the plan and notify the worker; important
   durable decisions also go to the owning `DECISIONS.md`.
5. Do not implement behavior that depends on an unanswered question. Continue independent work.

On receiving role instructions, confirm the role and current assignment to the sender, then wait if
no task was assigned. Do not start unrelated work merely because the team launched.

## Task lifecycle and handoff

`assigned` → `working` → `ready` → `reviewed` → `integrated` → `done`.

- `ready`: the author has committed the scoped change and reported checks and gaps.
- `reviewed`: the required verdict applies to the exact target SHA; a material fix or conflict
  resolution invalidates that verdict until checked again.
- `integrated`: CTO has placed the accepted change on the named target branch.
- `done`: acceptance and required checks pass on the integrated HEAD, CTO has recorded the final SHA
  and marked the plan checkpoint done. A WIP or preservation commit is never `ready` or `done`.

Before a pause, reassignment or handoff, report: task and plan link; owner; checkout/worktree and
branch; last commit; uncommitted owned changes; checks; remaining work; blocker; and next step.
