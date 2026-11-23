# Review release readiness

Authoring package only — not runnable. The [Shared execution contract](../README.md#runtime-boundary)
contains permissions, commit markers, failure recovery and future manual/scheduled requirements;
validation or a report never authorizes an action.

## Inputs and evidence

- Task/owner and actual selected project: `<owning task link and owner>`.
- Defaults: selected-project, explicit-baseline, operations, release-readiness.
- Local destination declaration: `Plans/flows/engineering-release-readiness.md`.
- Actual base/target and source versions: `<full-base-sha>` / `<full-target-sha>` with evidence.
- Required sources: version and change inventory, checks breaking changes and migrations, rollout observability and rollback evidence.

For missing mandatory evidence, stop its dependent claim via blocked and retain independent findings.
Explicit unknown/unavailable records stay unknown, not safe, verified or approved. Separate observed
facts from inference, source freshness and proposed work; list uncommitted files separately.

## Domain steps

### inventory

Identify the candidate version, exact change range, user-visible changes, owners and release target. List uncommitted changes separately; an unknown baseline blocks claims about what is shipping.

### assess

Inventory breaking changes, migrations, required checks, compatibility and release notes. Separate actual check results from planned checks; record unknowns, unresolved findings and responsible owners.

### readiness

Review rollout steps, observability, rollback trigger/procedure/owner and stakeholder release brief. Missing mandatory rollback or migration evidence blocks readiness even if tests are green; no deployment authority follows from this report.

### report

Produce the release checklist, evidence links, blockers, stakeholder summary and next safe action. A ready result requires actual evidence for the selected revision; report completion never means deployment or owner approval.

## Approval boundaries and outcome

Deployment, version changes, migrations, publishing, stakeholder sends and rollback execution each need a separate preview and explicit approval. This package only reports readiness and proposes the rollout/rollback plan; it performs none of those actions.

The default graph is analysis only; its local output is complete without a tracker. Preserve denied,
blocked, failed or partial work accurately in future run records; do not auto-retry or advance a
successful marker from incomplete evidence. No manual or scheduled execution is implemented.

## Open questions

- ❓ Q1 `<required unanswered question>`
  Record the exact evidence gap and hold dependent work.
  > 💬👾 `<source, impact and the evidence needed to answer>`

Reference local question №Q1; link cross-file IDs to their owning item. Keep current important rules
short in owning `DECISIONS.md`; preserve solved questions/options/threads verbatim in owning
`RESOLVED.md`, with stable IDs and anchored links from old locations. Unresolved questions stay open.
