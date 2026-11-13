# Synthetic example — Report documentation trust and drift

This is illustrative authoring data, not an executed or verified run. Supplied source excerpts,
checks and dates below are synthetic; no test, approval, full SHA or provider result is claimed as
actual repository evidence. The example does not apply edits, send messages or install schedules.

## Input

A supplied synthetic inventory has `guide.md` with an owner and a recorded verification, and `reference.md` with no owner or verification record. A supplied API change contradicts one reference claim. No real SHA, job or verification is supplied by this example.

## Expected output

| Document | Sources | last-verified-change | owner | confidence | drift / proposed follow-up |
| --- | --- | --- | --- | --- | --- |
| `guide.md` | Supplied code and verification note | `<actual-verified-source-sha>` placeholder, not evidence | Supplied maintainer label | Conditional on the supplied record being verified in a real run | Recheck only if its cited dependency changed |
| `reference.md` | Supplied changed API excerpt | unknown | unknown | Unverified: missing record and conflicting claim | Prioritize a source-backed refresh; preserve uncertainty |

The register exposes the reason for confidence and the owner gap. It does not claim a timestamp, placeholder or synthetic statement is a successful verification. No refresh schedule is installed.

## Open questions

- ❓ Q1 Who can verify the unowned reference claim?
  The synthetic owner and verification fields stay unknown until actual evidence is supplied.
  > 💡👾 Request the missing evidence before treating its dependent claim as verified.
  >
  > 💬👾 This synthetic example preserves the question; it invents no human answer or approval.

Question №Q1 remains explicit. It does not prevent the independent evidence already collected from
remaining readable in the report. References to items in other documents must use linked № IDs.

## Expected route

inventory.complete → verify.complete → register.complete → report.complete → end(complete), retaining unknown fields. If the mandatory source revision is absent, verify.blocked → end(blocked); no marker advances and no verification is fabricated.

## Approval boundary

This is a proposed local Markdown result, complete without a tracker. Applying a proposed patch,
reorganizing documents, committing or filing a ticket needs a separate preview and explicit approval.
No such action occurs in this example. Manual and optional scheduled execution remain future runner
work; schedules never approve actions. Preserve source references and unknowns on any blocked run.
