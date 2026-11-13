# Map architecture and ownership

Authoring package only — not runnable. The [Shared execution contract](../README.md#runtime-boundary)
contains permissions, commit markers, failure recovery and future manual/scheduled requirements;
validation or a report never authorizes an action.

## Inputs and evidence

- Task/owner and actual selected project: `<owning task link and owner>`.
- Defaults: selected-project, explicit-baseline, development, architecture-map.
- Local destination declaration: `Plans/flows/engineering-architecture-ownership.md`.
- Actual base/target and source versions: `<full-base-sha>` / `<full-target-sha>` with evidence.
- Required sources: subsystem code configuration and interfaces, dependencies and data flow, owner registry or explicit unknown.

For missing mandatory evidence, stop its dependent claim via blocked and retain independent findings.
Explicit unknown/unavailable records stay unknown, not safe, verified or approved. Separate observed
facts from inference, source freshness and proposed work; list uncommitted files separately.

## Domain steps

### inventory

Inventory the selected subsystem code, configuration, interfaces and supplied owner registry. Record source boundaries and exclusions; do not infer an owner from a filename or commit count.

### map

Produce subsystem, dependencies and data-flow maps that show interfaces, trust boundaries and consumers. Cite the actual selected source revisions; distinguish observed edges from inferred relationships.

### ownership

Expose ownership gaps and conflicting owner records. Draft ADR alternatives with evidence and propose change routing to a named person/team only when supported. Unknown ownership stays unknown; a routing proposal sends no message and grants no responsibility.

### report

Return the architecture/ownership map, ADR proposals, unresolved questions and follow-up actions. Preserve existing decisions; no source refactor, ownership assignment or durable design decision is silently enacted.

## Approval boundaries and outcome

Refactoring, assigning owners, accepting an ADR, changing configuration and sending routing notices require a separate preview and explicit approval. An architecture map is evidence for a decision, not an administrator or action grant.

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
