# Generate and update project documentation

Authoring template only — not runnable. This package describes a source-backed draft/report;
validation grants no filesystem, project, administrator or external-action permissions.

## Inputs

- Task and owner: `<task link and owner>`
- Default scope: selected-project; select the actual project/subsystem/documents before a run.
- Default range: explicit-baseline; select actual base/target revisions before the first run.
- Default audience: development.
- Default output: documentation-set.
- Local destination declaration: `Plans/flows/docs-generate-update.md`.
- Optional scope details: whole project, subsystem, aspect, selected path(s), change timeframe.
- Reader choices: executive, marketing/product, development, QA, operations, security or custom.
- Sources, exclusions and actual revision/period: `<source paths and IDs with actual evidence>`.
- `last-commit-id`: `<full-processed-sha>` placeholder; never a verified marker by itself.

The manifest carries shared defaults. Audience/aspect/path/timeframe details are authoring inputs in
Markdown, not extra schema fields or implemented UI/filter controls. A date/period must be tied to
an explicit source selection; never silently guess its Git baseline. Keep uncommitted files separate.
Destinations are declarations only; a future runner must use `Registry.resolve()`, effective grants
and stale-write checks. A package cannot broaden source access by describing a wider scope.

## Plan

### inventory

Inventory the selected code, configuration, APIs, tests and existing documents. Record excluded paths and missing sources. Do not substitute a repository summary for source inspection.

### decompose

Split the project into meaningful subsystems by responsibility, dependencies and data flow. Name owners or explicitly record unknown ownership. Explain why each boundary is useful to a reader.

### deep-docs

Produce deep subsystem documentation for EACH selected subsystem: purpose, interfaces, dependencies, data flow, configuration, invariants, failure modes, security boundaries, operational concerns and checks. Cite the supplied source paths and exact actual revisions; mark gaps rather than inventing behavior.

### summarize

Produce project and subsystem summaries that link the deep documents and explain their relationships. Keep tutorial, how-to, reference and explanation content distinguishable. A shallow project overview alone does not satisfy this flow.

### report

Return the complete proposed documentation set, inventory, source map, gaps and proposed patch in project Markdown. Generating a draft does not apply edits to source documents. Any application needs a separate preview and explicit approval.

## Evidence

Required sources: code and configuration inventory, subsystem boundaries and dependencies, API contracts and checks.

For missing mandatory evidence, use the named blocked outcome and record exactly what is absent.
Keep verified facts, inference, assumptions, unresolved contradictions and independent work distinct.
Cite supplied source locations, exact actual revisions and verification limits. Never replace a
missing source with an unrelated one or present a plausible statement as verified behavior.

The output must include a proposed tree, a deep page for every selected subsystem, a subsystem summary and a project summary. Record coverage and exclusions; retain useful existing structure instead of overwriting unrelated content.

## Questions

- ❓ Q1 `<required unanswered question>`
  Dependent work remains blocked; preserve independent evidence in the report.
  > 💬👾 `<context and the evidence needed to answer>`

Use №Q1 to reference this local question; link every cross-file item reference to its owning file.
Preserve stable IDs, all human wording/answers and quoted history. Append one signed quoted turn
with a blank `>` between turns. Facts and source inventories remain plain prose; durable decisions
alone may use the decision glyph. Ordinary task checkboxes are distinct from Q&A options.

## Findings

Record stale claims, missing coverage, verified evidence, impact and proposed remedies with stable
IDs and short one-line titles; indent details two spaces. Label uncertainty and unresolved conflicts.
Do not close an open issue merely because a synthetic example describes a possible result.

## Checks

Record actual source inspections/checks, result, exact checked revisions, coverage and limitations.
Use examples as illustrations only; placeholder SHAs and synthetic checks never prove readiness.

## Decisions

Keep owning `DECISIONS.md` to the shortest current rule and necessary conditions. Preserve full
solved questions, answers and rejected alternatives verbatim in owning `RESOLVED.md`, with the same
IDs and anchored links from decisions/old locations. Unresolved questions stay open; this report
does not silently settle them or rewrite decisions.

## Approvals

The default graph is analysis/report only and its result is complete without a tracker. Applying
proposed edits, moving/deleting documents, committing, filing tickets, merging or deploying requires
a separate preview and explicit approval for each action. A generated report is not approval or an
observed execution result. This package performs none of those actions and contains no executor.

## Transitions

Follow the named manifest routes and record the step, outcome and observed result in future run
Markdown. Missing evidence blocks dependent work; failures retain their exact state. No automatic
retry, silent handoff, hidden edits or implied success. No tracker is required to read the result.
Neither manual nor scheduled execution is implemented. Optional schedules later belong to run
configuration and will use this same entry/package; package-level schedule metadata is unsupported.
Schedules can start work, never approve actions.

## Outcome

Keep the proposed output, source index, unresolved questions, checks, decisions and next safe action
inspectable in project Markdown. A future runner advances a generated document's full actual
`last-commit-id` only after every write and routed output succeeds, including no-content-change
success. Failed/partial runs advance none. Missing/unreachable markers require an explicit new
baseline. Marker transactions, runtime permissions and run history are not implemented here.
