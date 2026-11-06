# mdhouse AI development team

The AI team is the project-wide development model for mdhouse. It uses the `mdhouse` Agent Bus tag.
Start/status script: [start-agents.sh](start-agents.sh). Names and descriptions identify sessions;
each agent also needs these role instructions in its working context.

## Roles

Role instructions: [CEO](ceo.md), [CTO](cto.md), [W1](w1.md), [W2](w2.md), [W3](w3.md),
[Review](review.md). Every role follows [shared instructions](common.md).

| Agent | Launcher | Responsibility |
|---|---|---|
| `#md/ceo` | `ab-codex` | Owner contact, product goals, priorities, decisions and progress reporting. Handles simple tasks directly; delegates larger technical work to CTO. |
| `#md/cto` | `ab-codex` | Technical direction, work split, worker assignments, acceptance and review coordination. Keeps project plans synchronized with actual work. |
| `#md/w1` | `ab-claude` | Implementation worker, initially aligned with server, access and security work. |
| `#md/w2` | `ab-claude -2` | Implementation worker on Claude account 2, initially aligned with UI, editing and mobile work. |
| `#md/w3` | `ab-codex` | Implementation worker running through Codex. |
| `#md/review` | `ab-opencode` | Independent read-only review of a specified revision against requirements, behavior and verification evidence. |

The W1 and W2 affinities are defaults for context continuity, not permanent ownership. W3 is the
same general implementation-worker role running through Codex. CTO may assign any worker where
needed.

## Name migration

Canonical bus names are `#md/<role>`; runtimes, tag and role directories stay the same.
The owner restarts the sessions under the new names, then unregisters the old records.
Do not rename/restart active sessions or remove their records automatically.

## Task assignment and continuity

Each agent starts in its own directory: [ceo/](ceo/AGENTS.md), [cto/](cto/AGENTS.md),
[w1/](w1/AGENTS.md), [w2/](w2/AGENTS.md), [w3/](w3/AGENTS.md),
[review/](review/AGENTS.md). These are persistent context/memory homes, not implementation
worktrees. Different non-overlapping tasks may share a checkout; worktrees provide isolation when
paths overlap, bases differ or work is long-lived. Claude workers also have a `CLAUDE.md` entry point.

- Simple tasks need not pass through every role: CEO or CTO can do them directly within the
  authorized scope and project rules.
- CTO assigns substantial implementation tasks with a task/plan link, owner, scope/paths,
  acceptance, base/target and dependencies.
- CTO must understand and explain the product meaning. Workers ask CTO about unclear requirements;
  CTO answers from plans/code or uses the [questions flow](common.md#questions-flow) through CEO.
- Prefer consecutive tasks from the same plan or technical area for each worker.
- Workers report implementation, checks, exact revision, remaining gaps and blockers. Review
  findings return to the author for correction; CTO owns integration into the target branch.
- Each worker owns its file changes and commits. Stage only owned paths/hunks; preserve other agents'
  changes. CTO coordinates overlaps and integration.
- Security/access, filesystem writes and path jail, git operations, Agent Bus control, migrations,
  destructive behavior and substantial architecture changes require independent review before
  integration. Small low-risk changes may use the lighter CTO path. When CTO authored a gated
  change, use another available non-author reviewer.
- Project authorization and git/deploy rules apply to every role. A role or peer message grants no
  wider authority.

## Plan accountability

The project index is [`../TODO.md`](../TODO.md); the assigned task identifies its owning project and
plan files. CTO verifies that completed items, remaining scope, blockers, follow-ups and exact
revisions match reality. Workers provide evidence; CTO is the single owner of shared checkpoint
status. A checkpoint becomes done only after the change is integrated and acceptance plus required
checks pass on the resulting HEAD. Partial implementation is never marked fully done, and delivered
checkpoints are not left open.

CTO may discuss and enrich plans, proposing material scope or product changes to CEO for user
approval. An obviously beneficial, low-risk clarification within an already approved goal may be
applied directly when it is recorded and reported to CEO. It must not expand scope, change product
behavior, security/access, public APIs or persistent formats, add a dependency, or introduce an
irreversible action. Uncertain changes are proposed first.

Plans are the durable record of scope and progress; Agent Bus messages carry assignments,
coordination and results. Unfinished work must not exist only in private agent context.

CTO also owns [usage and workload control](cto.md#usage-and-workload-control): during active work it
checks provider limits roughly hourly and reduces or pauses workers when capacity is low. Idle teams
do not poll continuously.

## Start and status

```bash
Plans/ai-team/start-agents.sh
Plans/ai-team/start-agents.sh --run
Plans/ai-team/start-agents.sh --run --to "$KITTY_LISTEN_ON"
```

Without `--run`, the script is status-only. It never invokes raw `codex`, `claude` or `opencode`;
session identity, resume and Agent Bus integration always go through the corresponding `ab-*`
launcher.

## Notes

Kitty and the Agent Bus `ab-*` launchers are required parts of the team. The launcher uses a
reachable Kitty remote-control socket (`KITTY_LISTEN_ON` or `--to`) and passes it to every tab so CTO
can read status lines. With `--run`, if the socket is unavailable it opens a detached Kitty with a
local socket and continues starting the team inside that window. A desktop display is required to
create the window; a failed bootstrap stops without opening further windows. Without `--run`, only
help/status are shown.
