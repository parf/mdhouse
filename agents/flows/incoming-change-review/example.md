# Synthetic example — Incoming change review

This is illustrative authoring data, not an executed or verified run. No actual PR, full SHA,
check result, approval, provider response or merge is evidence from this repository.

## Input

A supplied synthetic PR snapshot changes export defaults in two subsystems. Its owner and plan link
are supplied; a required compatibility check is failing and a required review thread is unresolved.
A later supplied patch is labelled a vendor/upstream alternative, not trusted automatically.
Revision slots `<full-base-sha>` / `<full-target-sha>` require actual evidence in a real run.

## Expected output

- 🟠 A1 Compatibility evidence does not support merge readiness
  Evidence: the synthetic snapshot has a failing required check and an unresolved required thread.
  Impact: the selected target cannot pass the stated readiness gate.
  > 💬👾 Route the proposed response to the named owner; do not send or merge from this example.

The report identifies affected subsystems, intent/owners/plan, correctness/tests/security/dependency
and compatibility risks, docs/operational implications, and a feedback-resolution record. It names
missing evidence, migrations/release notes/rollback and exact-target re-review needs. A changed target
would invalidate the prior verdict. Proposed post-merge updates remain drafts until actual success.

## Open questions

- ❓ Q1 Which actual result clears the required compatibility check?
  Finding №A1 and its unresolved thread block the synthetic merge gate.
  > 💡👾 Obtain the required check and exact-target independent review before proposing merge.
  >
  > 💬👾 No human approval, resolved feedback or successful delivery is invented.

Question №Q1 remains open.

## Expected route

Primary case: readiness.blocked → end(blocked). No merge was performed.

Separate synthetic approval/provider cases, only after all readiness evidence is supplied:

| Observed outcome | Declared route | Preserved result |
| --- | --- | --- |
| Human declines the exact merge preview | merge.denied → end(cancelled) | Approval decision, target and next safe step; no success claim |
| Provider reports an incomplete merge attempt | merge.partial → end(partial) | Exact provider response/known state; no retry and no post-merge success draft |
| Provider reports success at the approved target | merge.succeeded → post-merge | Draft docs/changelog/task updates; separate approval before applying them |

## Approval boundary

Automated review never authorizes merging. Each consequential action needs a separate preview,
explicit approval and observed provider result. The vendor/upstream alternative gets the same review
before acceptance. Manual/scheduled execution is future work under the
[Shared execution contract](../README.md#runtime-boundary).
