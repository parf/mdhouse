# Synthetic example — Market and customer brief

This is illustrative authoring data, not an executed or verified run. Interviews, survey figures
and competitor notes are synthetic excerpts; no real market research was conducted.

## Input

Supplied `interviews.md` contains 20 SMB interviews from one recruitment channel. Supplied
`survey.md` describes an enterprise survey from a different period and method. The two excerpts
appear to disagree about urgency. A supplied competitor note has no freshness date.

## Expected output

| Source reference | Scope/method | Observed limit |
| --- | --- | --- |
| `interviews.md` | SMB interviews, one recruitment channel | Selection bias; not an enterprise sample |
| `survey.md` | enterprise survey, different period | Cannot directly compare with the interview set |
| `competitor-note.md` | Supplied competitor claim, date unavailable | Freshness unknown; not a current verified claim |

The brief retains the disagreement and labels any broader demand interpretation as assumption.
It is not a representative market estimate and does not average incompatible evidence into a score.

## Open questions

- ❓ Q1 Which comparable population and period can resolve the apparent demand conflict?
  Missing provenance/freshness blocks a universal market conclusion.
  > 💡👾 Request comparable primary evidence and a dated competitor source.
  >
  > 💬👾 No survey, verified market size or fresh competitor fact is invented.

Question №Q1 remains open.

## Expected route and approval stop

source-review.blocked → end(blocked) for missing mandatory provenance. Independent source
observations remain in the partial brief. No live research, provider call, contact or publication
occurs. See the [Shared execution contract](../README.md#runtime-boundary).
