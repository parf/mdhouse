# Synthetic example — Project health

This is illustrative authoring data, not an executed or verified run. The dependency/test records
are supplied synthetic inputs; no real vulnerability scan or license analysis has occurred.

## Input

A supplied lock/configuration inventory lists two dependencies. Its vulnerability report is
unavailable and its license review record is absent. A supplied test log shows one repeated
intermittent failure; the CI configuration differs from the documented command.

## Expected output

| Area | Evidence | Recorded state / next check |
| --- | --- | --- |
| Vulnerabilities | Scan unavailable | security: unknown; obtain a current source-backed report |
| Licenses | Review record absent | license: unknown; inspect actual notices and review requirements |
| Test stability | Supplied intermittent failure log | Preserve occurrences/context; do not infer a root cause |
| CI | Supplied config/documented command differ | Proposed CI drift investigation, not an automatic edit |
| Dependency freshness and deprecated APIs | Inventory alone | not verified until appropriate version/API evidence is supplied |

No safe verdict is emitted from missing data. Unknown security/license rows are not confirmed
vulnerabilities, compliance decisions or successful checks. The maintenance backlog prioritizes
obtaining those records, then reproducing the test/CI observations with an accountable owner.

## Open questions

- ❓ Q1 Who supplies current vulnerability and license evidence?
  Both fields remain unknown; an absent report cannot clear a release gate.
  > 💡👾 Obtain the actual reports/notices and record their scope and freshness.
  >
  > 💬👾 The example invents no clean scan, approved license or dependency upgrade.

Question №Q1 records the evidence gap.

## Expected route and approval stop

inventory.complete → assess.complete → prioritize.complete → report.complete → end(complete).
This completes a report of knowns and unknowns, not a security/license verification. No dependency,
CI, license or tracker change occurs. Missing mandatory inventory instead uses inventory.blocked.
See the [Shared execution contract](../README.md#runtime-boundary).
