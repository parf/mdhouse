# Compare requirements and delivery

Authoring package only — not runnable. See the
[Shared execution contract](../README.md#runtime-boundary) for permissions, failure recovery,
full commit markers and future manual/scheduled execution; no validation grants action authority.

## Inputs and evidence

- Task/owner and actual selected sources: `<owning task link and owner>`.
- Defaults: selected-project, explicit-baseline, product, delivery-sync.
- Local destination declaration: `Plans/flows/engineering-delivery-sync.md`.
- Actual source revisions/period: `<full-base-sha>` / `<full-target-sha>` with supplied records.
- Required sources: same-range plans tickets code tests and documentation, acceptance requirements and observed results, ownership and current task state.

For missing mandatory evidence, block the dependent claim and preserve independent observations.
Keep verified facts separate from inference/unknowns; never turn unavailable data into a safe or
successful result. Record source scope, freshness, owner and exclusions; keep uncommitted files separate.

## Domain steps

### inventory

Select the same change range and collect linked plans, tickets, code, tests and documentation with owners and actual task state. Preserve the original acceptance and human wording; unavailable evidence stays explicitly absent.

### compare

Compare promised work with actual change/check evidence. Classify completed, unplanned, partially delivered and stale work; no category is inferred solely from a ticket status or commit title.

### acceptance-gaps

Identify missing acceptance checks, stale tickets, features without documentation and contradictory done claims. Cite each source and observed gap; unresolved requirements block dependent completion claims without rewriting the original record.

### report

Return the plan-vs-delivery matrix, evidence, owners and proposed follow-ups. A report can explain unsupported done status but cannot close, reopen or integrate a shared checkpoint or change an external ticket by itself.

## Approval boundaries and outcome

Plan/status edits, ticket creation or updates, source/document changes and external handoffs need a separate preview and explicit approval under the owning workflow. Keep status reconciliation a proposal until the responsible owner applies it.

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
