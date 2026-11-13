# Synthetic example — Recent commits review

This is illustrative authoring data, not an executed or verified run. Commit labels, counts and
reproductions below are supplied synthetic facts, not measurements from this repository.

## Input

An explicitly selected synthetic range contains 2 commits by one selected author on a supplied
branch: 3 files, 12 added lines and 4 removed lines. One change adds an export flag; another changes
empty-row handling. A supplied reproduction produces an extra row. The linked plan still lacks a
required encoding check. No tracker is connected. Actual full revisions would replace
`<full-base-sha>` / `<full-target-sha>` before a real run.

## Expected output

| Requested view | Synthetic result |
| --- | --- |
| Project/user/developer/operations summaries | Export flag added; empty-row risk explained; relevant operational handling flagged |
| Changelog and docs | Draft release note and export-reference update proposed |
| Author facts | 2 commits, 3 files, 12 added and 4 removed lines; factual summary, no productivity score |
| Risks | Finding №A1 records the supplied reproduction and impact |
| Tasks and ticket proposal | Request an encoding check and propose an owner; no external filing |
| Plan vs delivery | Export work is partially delivered until its required encoding check exists |

- 🟠 A1 Empty-row handling changes the exported row count
  Evidence: the supplied synthetic reproduction returns one extra row after the selected change.
  Impact: affected exports may include a spurious row; validate the intended contract before fixing it.
  > 💬👾 Propose a focused check and remedy; this example executes neither.

## Open questions

- ❓ Q1 Which encoding check completes the export acceptance?
  The supplied plan names the requirement but provides no result.
  > 💡👾 Ask the plan owner for the check and retain the partially delivered state.
  >
  > 💬👾 The example invents no human answer, completed task or ticket approval.

Question №Q1 and finding №A1 remain local anchored records.

## Expected route

scope.complete → summaries.complete → risks.complete → delivery-sync.complete → report.complete
→ end(complete). This is a complete report, not completion of the unfinished feature. No ticket was
filed. If mandatory range or reproduction evidence is missing, its dependent step instead takes
blocked → end(blocked), preserving the independent findings and no advanced marker.

## Approval boundary

Optional ticket filing requires a separate preview and explicit approval for an actual configured
destination; the report remains useful offline. Manual/scheduled execution is future work under the
[Shared execution contract](../README.md#runtime-boundary).
