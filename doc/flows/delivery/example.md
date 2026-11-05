# Synthetic example — Update, review and prepare delivery

This is illustrative authoring data, not an executed or verified run. No SHA, test result, approval
or provider response here is evidence from this repository. Placeholders such as `<full-target-sha>`
must be replaced with actual run evidence before they can support readiness.

## Input

Synthetic tests and an independent review are supplied for an example update. Readiness includes rollback, but the human declines the proposed deploy.

## Expected output

A delivery readiness document retains checks/review references, rollout and rollback, then records the declined approval. It does not claim deployment.

Record inputs, owner, plan, source evidence, questions, findings, checks, decisions, approvals,
transitions and outcome in project Markdown. Leave `last-commit-id` unadvanced on blocked,
cancelled, failed or partial work. No ticketing connection is needed to read the complete result.

## Expected route

deploy.denied → end(cancelled). A partially completed provider action would instead use deploy.partial → end(partial), preserving the provider result.

## Approval boundary

Each consequential action requires its own preview and explicit human approval, then an observed
execution result. Optional schedules cannot grant approval. These templates/schema do not run
manually or on a schedule yet; runnable acceptance remains open until the shared runner and
permission checks exist.
