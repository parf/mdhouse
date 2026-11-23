# Review a pull request or incoming change

Authoring package only — not runnable. [Shared execution contract](../README.md#runtime-boundary)
covers permissions, stale writes, full commit markers, failure recovery and future manual/scheduled
execution. No action executes merely because the manifest validates.

## Inputs and evidence

- Task/owner and selected project or document: `<owning task link and owner>`.
- Defaults: selected-document, explicit-baseline, development, merge-readiness.
- Local report destination declaration: `Plans/flows/incoming-change-review.md`.
- Exact actual range/revisions and filters: `<full-base-sha>` / `<full-target-sha>` plus selection.
- Mandatory sources: PR or incoming patch with exact base and target, checks reviews conflicts and threads, ownership plans migration release and rollback evidence.

For missing mandatory evidence, stop dependent work via blocked; retain independent evidence and
report unavailable sources rather than silently substituting them. Keep verified facts separate from
inference; list uncommitted files separately. Dates/author/branch selections are authoring inputs,
not an implemented filter UI or permission grant.

## Domain steps

### intake

Identify intent, changed subsystems, owners, linked plans/issues and user-visible impact for the exact base/target. Accept a supplied PR snapshot or vendor/upstream patch as evidence; source intake is not acceptance of its code.

### review

Review correctness, tests, security, dependencies, compatibility, documentation and operational risk. Verify suspected findings against the selected target and route proposed responses to their named owners without sending messages implicitly.

### feedback

Record each finding, response and resolution evidence with stable IDs and preserved threads. Actual code fixes are separately previewed/approved edits outside this analysis step. Unresolved required feedback blocks readiness; claiming resolution requires an observed result.

### re-review

Require independent checks/review for the exact resulting target. A changed target invalidates earlier readiness; stop for fresh evidence in an explicit subsequent run rather than retrying a graph loop. Keep accepted and unresolved feedback distinguishable.

### readiness

Show conflicts, checks, required reviews, unresolved threads, migrations, release notes and rollback. Missing mandatory evidence blocks merge. A green automated review alone never approves or triggers merging; identify the actual provider/destination and exact target for a separate preview.

### merge

Declare a separate explicitly confirmed merge action: preview exact target/destination, require fresh explicit approval, recheck readiness/permissions at execution and record the provider response. Approval is not success. denied/failed/partial outcomes terminate with the exact recoverable state and no automatic retry. This authoring package contains no merge executor.

### post-merge

Only after observed merge success, draft the documentation, changelog and linked-task updates against the resulting revision. Their application requires separate approved edits or ticket actions; do not silently write documents, close shared checkpoints or file tickets.

### report

Return the intake, findings, owner-routing proposals, feedback/re-review evidence, readiness and any actual provider result plus post-merge drafts. Keep the report complete without a tracker. A blocked, denied or partial action preserves the last known state and next safe step without claiming delivery.

## Approval stops

Owner routing is a declared proposal, not a sent message. Feedback edits, merge, documentation
updates, commits and ticket filing are distinct actions with separate previews and approvals. The
merge node alone declares a consequential effect in this graph; its succeeded outcome requires an
observed provider result before post-merge drafting. An exported patch can support a useful review
without a live provider, but unavailable merge evidence stops at readiness.blocked before merge.

## Open questions

- ❓ Q1 `<required unanswered question>`
  Record missing evidence and hold dependent work.
  > 💬👾 `<context, source and the evidence needed to answer>`

Reference local question №Q1; cross-file IDs always link to the owning item. Preserve human answers
and original IDs. Short current decisions belong in owning `DECISIONS.md`; verbatim solved questions,
options and threads belong in owning `RESOLVED.md`, with anchored pointers left at old locations.
