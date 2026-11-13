# Refresh and verify documentation

Authoring template only — not runnable. This package describes a source-backed draft/report;
validation grants no filesystem, project, administrator or external-action permissions.

## Inputs

- Task and owner: `<task link and owner>`
- Default scope: selected-document; select the actual project/subsystem/documents before a run.
- Default range: explicit-baseline; select actual base/target revisions before the first run.
- Default audience: development.
- Default output: documentation-findings.
- Local destination declaration: `Plans/flows/docs-refresh-verify.md`.
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

### scope

Read the selected documents and choose whole project, subsystem, aspect, path or timeframe coverage. Record the explicit baseline and source inventory before proposing refresh work.

### compare

Compare claims against current code, configuration, APIs and changes. Distinguish verified claims from inference. Cite precise supplied locations/revisions and report unresolved contradictions; missing mandatory evidence blocks dependent correction.

### resolve

Prepare an evidence-backed proposed correction only when the authoritative source is known. Keep conflicts, unverified claims and their owners visible. Ask a stable-ID question for an unresolved authority choice; never silently pick a convenient source.

### report

Return the stale-claim inventory, verified facts, inference, unresolved contradictions and proposed patch. Do not apply it implicitly: applying document edits requires a separate preview and explicit approval. Keep the report useful even when no correction can be justified.

## Evidence

Required sources: selected documentation, current code configuration and API evidence, explicit change range.

For missing mandatory evidence, use the named blocked outcome and record exactly what is absent.
Keep verified facts, inference, assumptions, unresolved contradictions and independent work distinct.
Cite supplied source locations, exact actual revisions and verification limits. Never replace a
missing source with an unrelated one or present a plausible statement as verified behavior.

For every changed claim record the old wording, supporting source, proposed wording and verification limit. Unresolved authority choices hold only their dependent work; the report retains independent evidence.

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
solved questions, answers and rejected alternatives verbatim in owning `resolved.md`, with the same
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
