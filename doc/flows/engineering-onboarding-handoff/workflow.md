# Verify onboarding and prepare a handoff

Authoring package only — not runnable. The [Shared execution contract](../README.md#runtime-boundary)
contains permissions, commit markers, failure recovery and future manual/scheduled requirements;
validation or a report never authorizes an action.

## Inputs and evidence

- Task/owner and actual selected project: `<owning task link and owner>`.
- Defaults: selected-project, explicit-baseline, development, onboarding-guide.
- Local destination declaration: `Plans/flows/engineering-onboarding-handoff.md`.
- Actual base/target and source versions: `<full-base-sha>` / `<full-target-sha>` with evidence.
- Required sources: setup prerequisites and documentation, clean-account commands results and environment, role ownership and contact map or explicit unknown.

For missing mandatory evidence, stop its dependent claim via blocked and retain independent findings.
Explicit unknown/unavailable records stay unknown, not safe, verified or approved. Separate observed
facts from inference, source freshness and proposed work; list uncommitted files separately.

## Domain steps

### prerequisites

Inventory documented setup steps, tools, versions, configuration and access prerequisites for a clean account. Do not copy credentials into the guide. Record which requirements are observed, absent or unknown.

### clean-setup

Compare the supplied clean-account commands, environment and observed results with the runbook. A missing prerequisite or failed required setup step blocks a successful setup claim; capture the exact gap and next safe verification step. This authoring package executes no setup commands.

### role-handoff

Draft role-specific tours, glossary, first-task guide and ownership/contact map from actual source/owner evidence. Mark role/access gaps unknown and do not fabricate a working environment, contact or permission grant.

### report

Return the setup verification record, prerequisite gaps and proposed onboarding/handoff materials. Keep independent drafts inspectable after a blocked setup, but label them drafts rather than a verified first-task journey.

## Approval boundaries and outcome

Installing tools, creating accounts, modifying configuration, granting access, assigning work and sending handoffs need a separate preview and explicit approval. Setup instructions and a contact map grant no filesystem, user or administrator permission.

The default graph is analysis only; its local output is complete without a tracker. Preserve denied,
blocked, failed or partial work accurately in future run records; do not auto-retry or advance a
successful marker from incomplete evidence. No manual or scheduled execution is implemented.

## Open questions

- ❓ Q1 `<required unanswered question>`
  Record the exact evidence gap and hold dependent work.
  > 💬👾 `<source, impact and the evidence needed to answer>`

Reference local question №Q1; link cross-file IDs to their owning item. Keep current important rules
short in owning `DECISIONS.md`; preserve solved questions/options/threads verbatim in owning
`resolved.md`, with stable IDs and anchored links from old locations. Unresolved questions stay open.
