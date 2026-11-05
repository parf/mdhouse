# Synthetic example — Carry delivery context into the next feature

This is illustrative authoring data, not an executed or verified run. No SHA, test result, approval
or provider response here is evidence from this repository. Placeholders such as `<full-target-sha>`
must be replaced with actual run evidence before they can support readiness.

## Input

A synthetic delivery report contains settled decision D1 (preserve UTF-8), unfinished task T2 (document import limits), and a new idea for filtered export.

## Expected output

The next-feature brief links D1, carries T2 without closing or renumbering it, preserves a rejected encoding alternative and asks the owner to confirm the new scope.

Record inputs, owner, plan, source evidence, questions, findings, checks, decisions, approvals,
transitions and outcome in project Markdown. Leave `last-commit-id` unadvanced on blocked,
cancelled, failed or partial work. No ticketing connection is needed to read the complete result.

## Expected route

collect.complete → brief.complete → handoff.complete → person(project-owner). The handoff is data only in this authoring slice; no message is sent.

## Approval boundary

Each consequential action requires its own preview and explicit human approval, then an observed
execution result. Optional schedules cannot grant approval. These templates/schema do not run
manually or on a schedule yet; runnable acceptance remains open until the shared runner and
permission checks exist.
