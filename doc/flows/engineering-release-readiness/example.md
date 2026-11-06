# Synthetic example — Release readiness

This is illustrative authoring data, not an executed or verified run. Version labels, checks and
release evidence below are supplied synthetic inputs, not facts from this repository.

## Input

A candidate export release has a supplied change inventory and passing test excerpt. Its rollout
mentions a migration and dashboard, but contains no rollback procedure, trigger or owner.

## Expected output

| Readiness area | Supplied synthetic evidence | Result |
| --- | --- | --- |
| Candidate and changes | Explicit candidate/version and change inventory | Scope recorded; actual SHA still requires real evidence |
| Checks and migration | Passing check excerpt and migration note | Retain their limitations; do not infer rollback coverage |
| Rollback | rollback: missing | Readiness blocked, with owner/evidence request |
| Stakeholder brief | Draft states rollout/migration and unresolved blocker | Draft only; not sent |

- 🟠 A1 Required rollback evidence is missing
  Evidence: the supplied plan has no recovery procedure, trigger or owner.
  Impact: readiness cannot show how this release would be recovered after failure.
  > 💬👾 Request the missing recovery evidence before proposing a deployment approval.

## Open questions

- ❓ Q1 Who supplies the rollback procedure and verification?
  Finding №A1 remains a readiness blocker despite the supplied green test excerpt.
  > 💡👾 Name the owner and obtain a source-backed recovery plan.
  >
  > 💬👾 No human approval or successful recovery is invented by this example.

Question №Q1 and finding №A1 remain open.

## Expected route and approval stop

readiness.blocked → end(blocked). No deployment, migration, publish or rollback action occurs.
The local readiness report remains readable without a tracker; no successful run marker is claimed.
See the [Shared execution contract](../README.md#runtime-boundary) for future runtime obligations.
