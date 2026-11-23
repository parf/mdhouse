# Review maintenance and technical debt

Authoring package only — not runnable. See the
[Shared execution contract](../README.md#runtime-boundary) for permissions, failure recovery,
full commit markers and future manual/scheduled execution; no validation grants action authority.

## Inputs and evidence

- Task/owner and actual selected sources: `<owning task link and owner>`.
- Defaults: selected-project, explicit-baseline, development, maintenance-backlog.
- Local destination declaration: `Plans/flows/engineering-maintenance-debt.md`.
- Actual source revisions/period: `<full-base-sha>` / `<full-target-sha>` with supplied records.
- Required sources: code configuration and usage checks, flag deprecation ownership and decision history, documentation and source-linked TODO or FIXME records.

For missing mandatory evidence, block the dependent claim and preserve independent observations.
Keep verified facts separate from inference/unknowns; never turn unavailable data into a safe or
successful result. Record source scope, freshness, owner and exclusions; keep uncommitted files separate.

## Domain steps

### inventory

Collect dead code candidates, expired flags, source-linked TODO/FIXME clusters, duplication and abandoned docs from the selected project. Record source/decision history and owners; a missing reference is not proof of nonuse.

### verify-candidates

Verify candidates against imports, dynamic registries, configuration and supplied usage/check records. Reproduce a claimed defect before calling it confirmed. Missing mandatory usage evidence blocks a deletion recommendation; unknown does not become dead code.

### prioritize

Separate confirmed findings from uncertain candidates. Propose small independently reviewable tasks by root cause, impact, owner, verification and rollback needs; preserve relevant decisions and rejected alternatives.

### report

Return the maintenance backlog with evidence, uncertainty, scope and next checks. A proposed cleanup is not source deletion, dependency removal, flag retirement or document reorganization; keep actionable tasks readable without a tracker.

## Approval boundaries and outcome

Deleting code/files, retiring flags, changing dependencies/configuration, reorganizing docs, committing or filing tasks requires a separate preview and explicit approval. An analysis label never authorizes cleanup or discarding another agent's work.

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
