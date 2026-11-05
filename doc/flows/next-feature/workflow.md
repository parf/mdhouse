# Carry delivery context into the next feature

Authoring template only — not runnable. The manifest declares routing and approval requirements;
it neither executes work nor grants filesystem, project, administrator or external-action permission.

## Inputs

- Task/owner: `<task ID, plan link and owner>`
- Scope: selected-document (choose the actual project/path before a run)
- Range: explicit-baseline (choose the actual base and target; do not guess a first-run baseline)
- Audience: development
- Output: feature-brief
- Local destination declaration: `Plans/flows/next-feature.md`
- Base/target: `<full-base-sha>` / `<full-target-sha>`, populated from actual run evidence
- `last-commit-id`: `<full-processed-sha>`, unset until a complete successful run

Destination declarations grant no path access. A future runner must use `Registry.resolve()` and
check effective permissions, stale state and the actual selected root before writing anything.

## Plan

### collect

Read the selected prior report, decisions, unresolved questions and unfinished work. Preserve quoted human answers, stable IDs and source links. Missing mandatory prior context blocks dependent planning.

### brief

Clarify the next problem, owner, desired outcome and scope. Carry forward applicable decisions and unfinished tasks with their original IDs. Preserve rejected alternatives; never reopen closed work implicitly.

### handoff

Produce a feature brief and hand it to the named project owner for a deliberate next plan. This is a declared routing intent, not a sent message, created project, accepted plan or started feature. A future runner must resolve the owner and record the handoff result.

## Evidence

Required sources: prior delivery report, settled decisions and rejected alternatives, unfinished tasks and open questions, next feature goal and owner.

Record source paths/IDs, exact revisions, periods and observed results. Label assumptions and
inference separately. Missing mandatory evidence blocks dependent work; do not substitute a source
or fabricate proof. Keep output readable without a tracker. Uncommitted files are listed separately.

## Questions

- ❓ Q1 `<required unanswered question>`
  Dependent work remains blocked.
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
