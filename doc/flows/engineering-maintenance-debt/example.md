# Synthetic example — Maintenance and debt

This is illustrative authoring data, not an executed or verified run. Usage, registry and flag
records below are supplied synthetic inputs; no source scan or cleanup is actually executed.

## Input

A helper has no direct call sites in a supplied search excerpt, but a supplied dynamic registry
loads it by name. Separately, an expired flag has a recorded retirement decision and focused check
suggesting its disabled path is obsolete. A TODO/FIXME cluster and duplicate doc are only candidates.

## Expected output

| Candidate | Evidence | Proposed result |
| --- | --- | --- |
| Helper | dynamic registry references it | not dead code; do not propose deletion from direct-search absence |
| expired flag | Supplied decision and focused usage/check record | Small owned reviewable retirement proposal, pending actual approval |
| TODO/FIXME and duplicate/abandoned docs | Incomplete usage/owner records | Preserve as uncertain candidates with next checks |

- ❓ Q1 Who owns review of the expired flag retirement proposal?
  The helper remains used; flag retirement still needs an approved scope and verification plan.
  > 💡👾 Route a proposed small task to the recorded owner after confirming current evidence.
  >
  > 💬👾 The example does not retire the flag or send an assignment.

Question №Q1 preserves the action boundary.

## Expected route and approval stop

inventory.complete → verify-candidates.complete → prioritize.complete → report.complete → end(complete).
This completes an evidence-backed candidate backlog. No deletion, cleanup, flag retirement, commit,
file move or ticket filing occurs. If usage evidence is missing, verify-candidates.blocked holds the
related removal claim. See the [Shared execution contract](../README.md#runtime-boundary).
