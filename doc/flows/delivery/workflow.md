# Update, review and prepare delivery

Authoring template only — not runnable. The manifest declares routing and approval requirements;
it neither executes work nor grants filesystem, project, administrator or external-action permission.

## Inputs

- Task/owner: `<task ID, plan link and owner>`
- Scope: selected-project (choose the actual project/path before a run)
- Range: explicit-baseline (choose the actual base and target; do not guess a first-run baseline)
- Audience: operations
- Output: delivery-readiness
- Local destination declaration: `Plans/flows/delivery.md`
- Base/target: `<full-base-sha>` / `<full-target-sha>`, populated from actual run evidence
- `last-commit-id`: `<full-processed-sha>`, unset until a complete successful run

Destination declarations grant no path access. A future runner must use `Registry.resolve()` and
check effective permissions, stale state and the actual selected root before writing anything.

## Plan

### update

Read the approved task and owner. Preview the scoped update; require explicit approval for the edit. A question affecting the update blocks dependent work. Record the actual edit result.

### checks

Record acceptance checks and exact checked content. A failing required check blocks delivery; retain the output and the next safe step.

### commit

Preview the exact owned diff and require separate explicit commit approval. Record the resulting full target SHA. Never stage unrelated files.

### review

Require independent review and checks bound to the exact target. If the target changes, stop for fresh checks/review. Unresolved required findings block readiness.

### readiness

Record migrations, release notes, unresolved findings, rollout, observability and rollback with evidence. Identify a configured delivery target. Missing evidence blocks the deploy proposal; a green report grants no approval.

### deploy

Preview the exact target, destination, intended action and rollback. Require a separate explicit deploy approval. Record provider success, failure or partial result and actor; approval or a successful review is not delivery. This package contains no deploy executor.

### result

Record the actual delivered revision/environment and provider response only after succeeded. Preserve denied, failed or partial actions as recoverable states with the exact step/result and next action. Do not silently retry. Ticket and merge actions, if proposed later, need their own previews and approvals.

## Evidence

Required sources: approved update task and owner, exact base and target revisions, test and independent review results, migration release notes and rollback, configured delivery destination and provider result.

Record source paths/IDs, exact revisions, periods and observed results. Label assumptions and
inference separately. Missing mandatory evidence blocks dependent work; do not substitute a source
or fabricate proof. Keep output readable without a tracker. Uncommitted files are listed separately.

## Questions

- ❓ `<required unanswered question; dependent work remains blocked>`
  > 💬👾 `<context and the evidence needed to answer>`

Preserve every human answer and quoted history. Replace template placeholders only with real evidence.

## Findings

Record severity, verified evidence, impact, unresolved findings and proposed next action. A suggestion
or completed report is not authorization to edit code, file a ticket, commit, merge or deploy.

## Checks

Record each actual command/check, exit code/result, source revision and limitations. Bind tests and
independent review to the exact target SHA. A changed target invalidates earlier readiness. Do not
mark a placeholder or a synthetic example as a verified check.

## Decisions

Preserve applicable decisions, rejected alternatives, task IDs and unfinished work with source links.

## Approvals

Every proposed edit, commit, ticket, merge or deploy has a separate preview and explicit approval.
Record the initiating/approving actor and the exact preview/revision. Validation, a schedule, prior
approval, agent availability or a successful review does not grant action permission. Actual execution
must recheck Workspace, root RW, project grant RW and actor Editor, plus action-specific policy.

## Transitions

Use only the named manifest outcomes. Record step, outcome, destination, actor and observed result.
Denied, blocked, failed and partial outcomes terminate visibly with recoverable state; no automatic
retry or implied success. Missing targets and cross-package loops require runtime checks later.

Manual and optional scheduled runs will use this same entry/package through a future shared runner.
Schedules belong to run configuration; no package-level schedule is accepted by schema v1. Neither
manual nor scheduled execution is implemented here. Schedules can start work, never approve actions.

## Outcome

Record the actual result, gaps, unfinished work and next safe step. Advance a generated document's
full `last-commit-id` only after every write and routed output of a run succeeds, even on a no-content
change success. Failed/partial runs advance none; missing or rewritten-away markers require an
explicit baseline choice. Marker storage/transactions and run history are future runtime work.
