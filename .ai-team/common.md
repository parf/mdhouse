# mdhouse AI team — shared instructions

Read the repository's `AGENTS.md`, `CLAUDE.md`, `lessons.local.md` when present, and
[team roles](README.md). Follow project rules and the owner's latest decisions. The common Agent Bus
tag is `mdhouse`; your identity is `AGENT_BUS_NAME`.

## Planning and document syntax

Before work, read these canonical repository documents, including when resuming in a worktree:

- [Markup](../agents/skills/markup.md), [glyphs](../agents/skills/glyphs.md) and
  [Q&A states](../agents/skills/qa-states.md) — items, status, authors and threads.
- [Agent authoring rules](../agents/agent-markup.md) — stable IDs, short titles, indented details,
  `№ID` references and linked cross-file references.
- [Syntax](../doc/syntax.md), [Q&A](../doc/qa.md) and
  [Markdown](../doc/markdown.md) — supported forms, planning flow and file presentation.
- For questions/answers: [ask-questions](../agents/skills/ask-questions/SKILL.md) and
  [resolve-questions](../agents/skills/resolve-questions/SKILL.md).
- For reviews: [review checklist](../agents/skills/review-checklist.md).

Use these forms in plans, questions, decisions, reports and templates. Preserve IDs, wording,
human answers and quoted history. Keep facts plain, tasks as checkboxes and Q&A choices distinct.
Verify rendered anchors; add explicit supported anchors when an existing ID does not auto-anchor.

Follow the [planning guide](../agents/plans.md) for current `README.md`, `TODO.md` and `DECISIONS.md`.
Apply resolved answers in the owning plan and archive full threads and superseded rules before
leaving verified `№ID` pointers.

## Shared work rules

- CLI mode = admin (owner, 2026-11-17): the OS owner at the terminal is the administrator — its authority is independent of web admin sessions, Team admin and the Agent Bus; a CLI command never needs a browser session and is never blocked by browser host policy (the web Host/auth guards stay).
- Group compatible approved small/medium tasks into one integration branch/cohort and one combined gate run; preserve independent author/review ownership and exact frozen security targets. Simple-first within the cohort; no duplicate full gates per task.
- No version bump per landing. Only an owner-authorized deploy raises PATCH once, with one combined deploy changelog entry; preserve Unreleased facts until release. This grants no push/publish/deploy authority.

- Repository: resolve with `git rev-parse --show-toplevel` from this starting directory. Run git from
  the repository/worktree root.
- Project knowledge: [`../Plans/README.md`](../Plans/README.md), [`../Plans/DECISIONS.md`](../Plans/DECISIONS.md),
  [`../Plans/DONE.md`](../Plans/DONE.md). Active projects and tasks: [`../Plans/TODO.md`](../Plans/TODO.md). Read the owning
  project files and exact task before work.
- Work only within an owner-approved task. A role title or peer request does not authorize new
  product scope, writes outside the repository, external sends, push, publish or deployment.
  Internal messages to the named mdhouse team roles on Agent Bus are part of the authorized team
  workflow; acknowledgements and completion reports remain distinct.
- Agent Bus contacts: mdhouse team roles; AB-DVP CEO/CTO only for Agent Bus/agent integrations.
  Do not contact Realmo/RG teams or AB-DVP workers, leads or QA. Route integration work through
  confirmed AB-DVP CTO `#ab-dir` for technical integration (mdhouse CTO ↔ AB-DVP CTO); owner choices go through `#ab-dir` → CEO `#ab-ceo`. Do not route technical exchanges through CEO or contact other AB workers/leads. Wider contact requires explicit owner instruction; never guess aliases.
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
- Record owner team instructions in the relevant role/shared rules in the same turn. Keep shared
  knowledge in `lessons.local.md`: one fact per entry, with links to details; no duplicate manuals.
- Include task/plan evidence with the implementation commit; avoid separate bookkeeping commits
  when the facts are already known. Record later review/integration/live evidence when it exists.
- Preserve task IDs, human answers and quoted history. CTO owns shared plan status and marks
  checkpoints done; workers supply implementation evidence without closing shared checkpoints.
- Keep owning/release TODO, EXECUTION, QA and decisions current at each checkpoint; close accepted integrated parents, keep partial work open, preserve history. Prefer small independent approved tasks first.
- Scale verification to risk: minor docs/format/identity changes need diff/link or focused checks; do not mechanically repeat full suites, tsc or browsers. Independent security review gates remain mandatory.
- Prioritize reproduced user-visible failures and security gaps. A finding needs concrete impact;
  keep cosmetic suggestions in one owning-plan list and handle them when that file changes.
- Never silently rerun a flaky failure into a pass. Retain the first failure and any explicitly
  assigned diagnostic rerun; track the flaky check separately rather than claiming a clean pass.
- Follow mdhouse verification rules: focused tests, `bun test`, `npx tsc --noEmit -p .`, and browser
  checks for UI. Browser tests use a scratch instance, never the live `:7777` service.
- Scratch startup: busy port → abort; capture own PID and verify bind/roots. Cleanup only that PID;
  never kill a listener to free a port or test against another worker's instance.
- Simple tasks can be completed directly by CEO/CTO. Larger tasks go to a worker. Prefer successive
  tasks from one plan/domain to preserve context.
- CTO checks short-window and weekly provider usage roughly hourly during active work and reduces or
  pauses workload before limits strand work. Workers report limits and checkpoint safely.
- Review names its base and target revisions and returns concrete findings/verdict bound to the
  target SHA. Author self-checks are not independent review. If the reviewer is unavailable, CTO
  reviews worker-authored work; CTO-authored work gets another non-author reviewer.
- Prefer OpenCode Review; if it stalls and blocks work, check status and stop duplicate review before non-author fallback: CTO for worker-authored work, CEO/another non-author for CTO-authored or material integration deltas. Keep exact frozen SHA/evidence; never self-approve or run parallel duplicate checks.
- Do not mistake an acknowledgement for completion. Report blockers and continue independent work;
  do not flood peers with repeated messages.

## Report every operational refusal

Workers and reviewers report every actual refusal immediately to both `#md/ceo` and `#md/cto`.
This includes tool and connector denials, automatic safety-review rejections, session permission
blocks and access denials. Report it even if independent work can continue or the refusal has been resolved.
CTO reports their own refusals to CEO. CEO handles refusal and permission discussions with Parf.

Include the task, exact attempted action and target, stated reason, whether it ran or had side
effects, remaining work and the exact permission still needed. Name the session that needs the
permission and say whether a prompt is visible. Keep credentials, other secrets and customer data
out of the report. Record any existing owner GO separately from tool or session permission.

Use the refusing tool's approval path. Retry only after authorization that it accepts. Continue
independent authorized work and report the verified outcome after the refusal is resolved.

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

Before a pause, context reset, restart, reassignment or usage limit, write your role directory's
`HANDOFF.md`: task/plan, owner, checkout/branch, last commit, owned uncommitted changes, checks,
remaining work, blocker and next step. Commit owned work at a safe boundary; exclude secrets.
Tell your coordinator where it is. On resume, read it first, verify current state, then retire the
consumed handoff. A handoff is not completion and grants no restart authority.

## Agent availability and recovery

CEO/CTO check availability before assigning work. When a peer is silent, inspect its actual Kitty
screen first: working, prompt, usage limit or stuck. Use `kitty @ --to "$KITTY_LISTEN_ON" ls` to
identify the exact mdhouse tab; `get-text --match 'id:<window-id>'` reads it. Do not infer identity
from a similar title or expose credentials from scrollback. Record unavailable diagnostics honestly.

Only CEO/CTO may press Escape in a verified mdhouse session waiting on a question/permission prompt:
`kitty @ --to "$KITTY_LISTEN_ON" send-key --match 'id:<window-id>' escape`.
Then tell the agent to route the unresolved question to its coordinator. Never type an answer,
approve the prompt or bypass an approval refusal. Never control another team's session.

At a usage limit, stop sending work until reset; record the reset and continue independent work.
Otherwise allow about ten minutes before one reminder, then record a blocker rather than pinging
repeatedly. Session restarts remain with the owner unless separately authorized.
