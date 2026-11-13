# Synthetic example — Refresh and verify documentation

This is illustrative authoring data, not an executed or verified run. Supplied source excerpts,
checks and dates below are synthetic; no test, approval, full SHA or provider result is claimed as
actual repository evidence. The example does not apply edits, send messages or install schedules.

## Input

In a supplied synthetic reference, `reference/export.md` says encoding is UTF-16. A supplied API excerpt says UTF-8, but the supplied configuration override is missing. The example has not executed the API or inspected a real project.

## Expected output

- 🟠 A1 Export encoding has an unresolved contradiction
  Evidence: supplied `reference/export.md` says UTF-16; supplied `api/export.ts:18` says UTF-8.
  Impact: a reader could select an incompatible decoder; the missing override prevents a verified correction.
  > 💬👾 Keep the discrepancy visible; do not call UTF-8 the effective value without configuration evidence.

The proposed refresh report separates the two observations from the inference about effective encoding. It records source locations and leaves the dependent patch unapproved. Finding №A1 remains open.

## Open questions

- ❓ Q1 Which configuration establishes effective encoding?
  The missing override is mandatory evidence for the synthetic encoding correction.
  > 💡👾 Request the missing evidence before treating its dependent claim as verified.
  >
  > 💬👾 This synthetic example preserves the question; it invents no human answer or approval.

Question №Q1 remains explicit. It does not prevent the independent evidence already collected from
remaining readable in the report. References to items in other documents must use linked № IDs.

## Expected route

compare.blocked → end(blocked). The report preserves the unresolved contradiction and question; no patch, ticket, external send or marker advancement is claimed. A deliberate later run can continue after the missing evidence is supplied.

## Approval boundary

This is a proposed local Markdown result, complete without a tracker. Applying a proposed patch,
reorganizing documents, committing or filing a ticket needs a separate preview and explicit approval.
No such action occurs in this example. Manual and optional scheduled execution remain future runner
work; schedules never approve actions. Preserve source references and unknowns on any blocked run.
