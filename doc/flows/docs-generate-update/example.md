# Synthetic example — Generate and update project documentation

This is illustrative authoring data, not an executed or verified run. Supplied source excerpts,
checks and dates below are synthetic; no test, approval, full SHA or provider result is claimed as
actual repository evidence. The example does not apply edits, send messages or install schedules.

## Input

The supplied synthetic project has a parser in `src/parser.ts` and a storage layer in `src/storage.ts`. The parser rejects empty input; storage promises atomic replacement and depends on parser output. Supplied configuration and checks describe those contracts. None of these files or checks is evidence from this repository.

## Expected output

| Proposed output | Required deep content | Synthetic evidence |
| --- | --- | --- |
| `docs/subsystems/parser.md` | Input/output contract, empty input error, parser invariants, configuration and failure checks | Supplied `src/parser.ts` and parser check |
| `docs/subsystems/storage.md` | Parser dependency, atomic replacement, write-failure behavior, permissions and recovery checks | Supplied `src/storage.ts` and storage check |
| `docs/subsystem-summary.md` | Parser → storage data flow, owners and boundaries linked to both deep pages | Supplied subsystem inventory |
| `docs/project-summary.md` | Project purpose, configuration, operations, coverage/exclusions and links to subsystem summaries | Supplied project inventory |

The source map attaches an actual run revision only after inspection; this example uses `<full-source-sha>` as a non-evidentiary placeholder. Drafts remain proposals; no source document is changed.

## Open questions

- ❓ Q1 Which storage recovery behavior still needs a source?
  The synthetic inventory lacks a crash-recovery check; keep that claim unresolved in the draft.
  > 💡👾 Request the missing evidence before treating its dependent claim as verified.
  >
  > 💬👾 This synthetic example preserves the question; it invents no human answer or approval.

Question №Q1 remains explicit. It does not prevent the independent evidence already collected from
remaining readable in the report. References to items in other documents must use linked № IDs.

## Expected route

inventory.complete → decompose.complete → deep-docs.complete → summarize.complete → report.complete → end(complete). Completion means a proposed documentation set. If a mandatory subsystem source is missing, deep-docs.blocked → end(blocked), with no marker advancement.

## Approval boundary

This is a proposed local Markdown result, complete without a tracker. Applying a proposed patch,
reorganizing documents, committing or filing a ticket needs a separate preview and explicit approval.
No such action occurs in this example. Manual and optional scheduled execution remain future runner
work; schedules never approve actions. Preserve source references and unknowns on any blocked run.
