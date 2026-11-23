# Assess API and schema impact

Authoring package only — not runnable. See the
[Shared execution contract](../README.md#runtime-boundary) for permissions, failure recovery,
full commit markers and future manual/scheduled execution; no validation grants action authority.

## Inputs and evidence

- Task/owner and actual selected sources: `<owning task link and owner>`.
- Defaults: selected-subsystem, explicit-baseline, development, compatibility-impact.
- Local destination declaration: `Plans/flows/engineering-api-schema-impact.md`.
- Actual source revisions/period: `<full-base-sha>` / `<full-target-sha>` with supplied records.
- Required sources: exact base and target endpoint event database and config schemas, consumer and compatibility evidence, migration constraints and owners or explicit unknown.

For missing mandatory evidence, block the dependent claim and preserve independent observations.
Keep verified facts separate from inference/unknowns; never turn unavailable data into a safe or
successful result. Record source scope, freshness, owner and exclusions; keep uncommitted files separate.

## Domain steps

### scope

Identify the selected subsystem, exact base/target, changed contracts and authorized supplied sources. Inventory endpoints, events, database and configuration schemas; do not obtain uncontrolled database access from this flow.

### contract-diff

Record added/removed/renamed fields, types, defaults and behavior with source references. Separate observed contract changes from inferred runtime behavior and explicitly label incomplete snapshots.

### consumer-impact

Map downstream consumers, owners and compatibility checks. Cite known breaks; missing consumer coverage stays unknown, not safe or backward-compatible. Missing mandatory evidence blocks a dependent compatibility verdict.

### migration-proposal

Draft compatibility/migration guidance, rollout sequence, consumer coordination, verification and rollback needs. Preserve unresolved owner/consumer gaps; guidance is a proposal, not a migration or deployed schema change.

### report

Return the contract/change inventory, downstream impact map, known breaks, unknowns, migration proposal and next evidence needed. A complete report does not certify every consumer or authorize API/config/database writes.

## Approval boundaries and outcome

API/config changes, database queries/migrations, consumer updates, deployments and external coordination require their own actual authority plus a separate preview and explicit approval. Supplied schema snapshots grant no database credential or access.

AB control is read-only inventory/query plus authorized targeted opening; it does not grant filesystem,
admin or action authority. Team web admin authority remains separate from Editor/RW, and protected
local CLI/control uses the OS owner's authority. These declarations implement none of those controls.
The local report is complete without a tracker. No action, manual run or schedule executes here.

## Open questions

- ❓ Q1 `<required unanswered question>`
  Record the missing evidence and hold dependent work.
  > 💬👾 `<source, impact and evidence needed to answer>`

Reference local question №Q1; cross-file IDs link to owning items. Keep important current rules short
in owning `DECISIONS.md`; preserve solved questions/options/threads verbatim in owning `RESOLVED.md`,
with stable IDs and anchored old-location pointers. Keep unresolved questions open.
