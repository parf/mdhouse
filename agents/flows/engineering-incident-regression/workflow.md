# Investigate an incident or regression

Authoring package only — not runnable. See the
[Shared execution contract](../README.md#runtime-boundary) for permissions, failure recovery,
full commit markers and future manual/scheduled execution; no validation grants action authority.

## Inputs and evidence

- Task/owner and actual selected sources: `<owning task link and owner>`.
- Defaults: selected-subsystem, explicit-baseline, operations, incident-brief.
- Local destination declaration: `Plans/flows/engineering-incident-regression.md`.
- Actual source revisions/period: `<full-base-sha>` / `<full-target-sha>` with supplied records.
- Required sources: symptoms logs and timestamps, selected code and configuration changes, reproduction and check records or explicit unavailable.

For missing mandatory evidence, block the dependent claim and preserve independent observations.
Keep verified facts separate from inference/unknowns; never turn unavailable data into a safe or
successful result. Record source scope, freshness, owner and exclusions; keep uncommitted files separate.

## Domain steps

### intake

Record symptoms, scope, severity/impact, owners and supplied logs/timestamps. Build an incident timeline with source/timezone and gaps; unavailable logs do not authorize broader access or an invented event.

### correlate

Compare the timeline with selected code/configuration changes at the actual revisions. Label temporal correlation as inference, not root cause; retain alternative explanations and contradictions.

### reproduce

Record actual reproduction conditions/check results or their explicit absence. Missing mandatory reproduction evidence blocks a dependent root-cause or rollback claim. Preserve independent observations without promoting a hypothesis to verified behavior.

### recovery-options

Propose containment, rollback and verification options with evidence, target, preconditions and recovery limits. Draft runbook changes and remediation tasks; uncertainty or an unverified recovery procedure prevents a safe execution recommendation.

### report

Return the timeline, facts/inference, reproduction evidence, options, unresolved questions and proposed runbook/remediation work. Report completion never means recovery, a deployed fix or a proven root cause.

## Approval boundaries and outcome

Rollback, containment, deployment, runbook edits, remediation changes and external notices each require a separate preview and explicit approval. A timeline or incident report is not a privileged recovery command.

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
