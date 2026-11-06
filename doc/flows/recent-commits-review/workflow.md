# Review recent commits

Authoring package only — not runnable. [Shared execution contract](../README.md#runtime-boundary)
covers permissions, stale writes, full commit markers, failure recovery and future manual/scheduled
execution. No action executes merely because the manifest validates.

## Inputs and evidence

- Task/owner and selected project or document: `<owning task link and owner>`.
- Defaults: selected-project, explicit-baseline, development, commit-review.
- Local report destination declaration: `Plans/flows/recent-commits-review.md`.
- Exact actual range/revisions and filters: `<full-base-sha>` / `<full-target-sha>` plus selection.
- Mandatory sources: explicit commit range and selected filters, diffs and reproduction evidence, linked plans documentation and task state.

For missing mandatory evidence, stop dependent work via blocked; retain independent evidence and
report unavailable sources rather than silently substituting them. Keep verified facts separate from
inference; list uncommitted files separately. Dates/author/branch selections are authoring inputs,
not an implemented filter UI or permission grant.

## Domain steps

### scope

Choose the actual base/target and record range, author, branch, subsystem and date/week/month filters. Report uncommitted files separately. A missing or rewritten baseline blocks dependent comparison; do not silently review everything or skip changes.

### summaries

Produce the selected project-change, user-facing, developer-facing and operations-facing summaries, changelog/release-note drafts and documentation drift notes. Include author commits/files/LoC with a factual work summary; LoC is context, never a productivity score.

### risks

Inspect diffs for errors, regressions, risky hotspots, missing tests and incompatible API/config changes. Reproduce suspicions before treating them as findings; record severity, source revision/location, evidence, impact and uncertainty.

### delivery-sync

Compare the period with linked plans/issues: completed, unplanned, partially delivered and stale. Generate owned task/ticket proposals from confirmed findings, preserving original task IDs and human answers rather than closing checkpoints from a summary.

### report

Return the selected summaries, draft release notes, documentation drift, author facts, findings and plan-vs-delivery tasks as a complete local report. Optional ticket filing is a separate deliberate continuation after report review, never an automatic route or a requirement for report completion.

## Output coverage

| Output group | Required evidence and result |
| --- | --- |
| Project/user/developer/operations | Changed intent, behavior and operational impact from the selected range |
| Release notes and docs | Changelog/release-note draft plus named stale/missing documentation |
| Author review | Actual commits/files/LoC and factual work; no productivity score |
| Errors and risks | Reproduction, severity and API/config/test implications |
| Tasks and optional tickets | Evidence-backed task/ticket proposals with owner and source links |
| Plan vs delivery | completed, unplanned, partially delivered and stale work with acceptance gaps |

## Approval stops

The default graph is analysis only and ends with a report complete without a tracker. Filing a ticket
needs a configured provider-neutral adapter, preview of destination/title/body/assignee, explicit
approval and recorded provider response in a separately chosen continuation. Missing tracker access
never blocks the local report. Applying edits, committing or publishing release notes likewise needs
its own approved action; no ticket filing or external send occurs from this package.

## Open questions

- ❓ Q1 `<required unanswered question>`
  Record missing evidence and hold dependent work.
  > 💬👾 `<context, source and the evidence needed to answer>`

Reference local question №Q1; cross-file IDs always link to the owning item. Preserve human answers
and original IDs. Short current decisions belong in owning `DECISIONS.md`; verbatim solved questions,
options and threads belong in owning `resolved.md`, with anchored pointers left at old locations.
