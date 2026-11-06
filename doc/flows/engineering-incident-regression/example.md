# Synthetic example — Incident and regression

This is illustrative authoring data, not an executed or verified run. Timestamps, symptoms and
change records are supplied synthetic inputs, not production observations from this repository.

## Input

A supplied error log shows a spike after a candidate cache change. The selected change/configuration
snapshot is available, but no matching-environment reproduction or recovery check is supplied.
An unrelated network change is another possible explanation.

## Expected output

| Observation | Evidence limit | Proposed next step |
| --- | --- | --- |
| Errors follow the candidate change | correlation, not proven root cause | Preserve both change and network hypotheses |
| Matching reproduction | unavailable | Ask for conditions and actual check result |
| Rollback effectiveness | unverified | Keep recovery option conditional, not executable |

- ❓ Q1 What matching reproduction distinguishes the two hypotheses?
  The missing result blocks a verified cause and dependent rollback recommendation.
  > 💡👾 Obtain the scoped reproduction and recovery evidence before choosing an action.
  >
  > 💬👾 This example records uncertainty; it invents no check or recovery success.

Question №Q1 remains open; independent timeline observations remain inspectable.

## Expected route and approval stop

reproduce.blocked → end(blocked). No rollback, containment, deploy, runbook edit or remediation task
is executed. The partial brief retains timestamps/source gaps and the conditional recovery options;
no success marker advances. See the [Shared execution contract](../README.md#runtime-boundary).
