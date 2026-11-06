# Synthetic example — Requirements and delivery sync

This is illustrative authoring data, not an executed or verified run. The plan, source/check and
ticket snapshots below are synthetic; no real checkpoint or tracker is modified.

## Input

The supplied plan says done for a migration-backed export change. Source excerpts implement export,
but migration check: missing. The documented export contract is stale, and a ticket still reflects
an older target. One extra UI change has no corresponding plan item.

## Expected output

| Work | Evidence-based classification | Proposed follow-up |
| --- | --- | --- |
| Planned export | partially delivered: required migration evidence absent | Obtain actual acceptance check and update proposed docs |
| Extra UI change | unplanned | Ask the owner to reconcile scope |
| Old-target ticket | stale | Propose a source-linked status update |
| Completed category | no supported entry for this export yet | Do not copy done from the plan |

- 🟠 A1 The supplied done claim lacks required acceptance evidence
  Evidence: migration check is absent and the supplied contract documentation is stale.
  Impact: the record cannot substantiate completed delivery at the selected target.
  > 💬👾 Preserve the original claim and propose owner-led reconciliation with actual evidence.

## Open questions

- ❓ Q1 Which actual result satisfies the missing migration acceptance?
  Finding №A1 holds a verified completion claim, not the independent comparison report.
  > 💡👾 Ask the acceptance owner for the result and the matching target revision.
  >
  > 💬👾 No completed check, human decision or changed ticket is invented.

Question №Q1 preserves the unresolved requirement.

## Expected route and approval stop

inventory.complete → compare.complete → acceptance-gaps.complete → report.complete → end(complete).
This completes a mismatch report. No checkpoint is closed/reopened and no ticket or document is
changed. Missing mandatory source inventory instead blocks the dependent comparison.
See the [Shared execution contract](../README.md#runtime-boundary).
