# Synthetic example — Review a project or subsystem

This is illustrative authoring data, not an executed or verified run. No SHA, test result, approval
or provider response here is evidence from this repository. Placeholders such as `<full-target-sha>`
must be replaced with actual run evidence before they can support readiness.

## Input

A synthetic parser subsystem change mishandles an empty CSV record. The supplied reproduction returns one extra row.

## Expected output

A findings document names the selected range and source location, records the supplied reproduction, severity and impact, and proposes a fix without changing code.

Record inputs, owner, plan, source evidence, questions, findings, checks, decisions, approvals,
transitions and outcome in project Markdown. Leave `last-commit-id` unadvanced on blocked,
cancelled, failed or partial work. No ticketing connection is needed to read the complete result.

## Expected route

scope.complete → review.complete → report.complete → end(complete). This is completion of a review report, not proof that its finding was fixed.

## Approval boundary

Each consequential action requires its own preview and explicit human approval, then an observed
execution result. Optional schedules cannot grant approval. These templates/schema do not run
manually or on a schedule yet; runnable acceptance remains open until the shared runner and
permission checks exist.
