# Review project health

Authoring package only — not runnable. The [Shared execution contract](../README.md#runtime-boundary)
contains permissions, commit markers, failure recovery and future manual/scheduled requirements;
validation or a report never authorizes an action.

## Inputs and evidence

- Task/owner and actual selected project: `<owning task link and owner>`.
- Defaults: selected-project, explicit-baseline, development, project-health.
- Local destination declaration: `Plans/flows/engineering-project-health.md`.
- Actual base/target and source versions: `<full-base-sha>` / `<full-target-sha>` with evidence.
- Required sources: dependency and configuration inventory, security and license evidence or explicit unavailable, test CI and deprecation records.

For missing mandatory evidence, stop its dependent claim via blocked and retain independent findings.
Explicit unknown/unavailable records stay unknown, not safe, verified or approved. Separate observed
facts from inference, source freshness and proposed work; list uncommitted files separately.

## Domain steps

### inventory

Inventory dependencies, lock/configuration inputs, licenses/notices, test results, CI configuration and deprecated APIs. Record source versions and verification dates where actually available; an unavailable source is not a clean result.

### assess

Assess dependency freshness, vulnerabilities, licenses, flaky tests, CI drift and deprecated APIs using the supplied evidence. Mark absent/stale scan or license records unknown or not verified; never infer safe or compliant status from a successful install or missing finding.

### prioritize

Build a maintenance backlog with evidence, uncertainty, impact, owners and independently reviewable next checks. Distinguish a confirmed defect from a missing verification record; do not assign a numeric risk/confidence score without an inspectable basis.

### report

Return the health inventory, verified findings, explicit unknowns, stale evidence and proposed follow-ups. Unknown security/license status may be reported honestly; missing mandatory inventory evidence blocks the dependent claim, not a fabricated safe verdict.

## Approval boundaries and outcome

Dependency upgrades, license changes, CI edits, source removal and ticket filing need a separate preview and explicit approval. The report issues no security certification or license verdict and executes no scanner, updater or maintenance action.

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
