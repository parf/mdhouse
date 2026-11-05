# Synthetic example — Implement a feature

This is illustrative authoring data, not an executed or verified run. No SHA, test result, approval
or provider response here is evidence from this repository. Placeholders such as `<full-target-sha>`
must be replaced with actual run evidence before they can support readiness.

## Input

A synthetic task asks for a CSV export, but the required delimiter/encoding acceptance is unanswered.

## Expected output

A feature plan identifies the owner and open acceptance question; no implementation or commit is claimed.

Record inputs, owner, plan, source evidence, questions, findings, checks, decisions, approvals,
transitions and outcome in project Markdown. Leave `last-commit-id` unadvanced on blocked,
cancelled, failed or partial work. No ticketing connection is needed to read the complete result.

## Expected route

clarify.blocked → end(blocked). After a human answer, a future runner may start an explicit new run; it must not auto-retry or approve implementation.

## Approval boundary

Each consequential action requires its own preview and explicit human approval, then an observed
execution result. Optional schedules cannot grant approval. These templates/schema do not run
manually or on a schedule yet; runnable acceptance remains open until the shared runner and
permission checks exist.
