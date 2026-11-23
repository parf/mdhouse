# Synthesize a market and customer brief

Authoring package only — not runnable. See the
[Shared execution contract](../README.md#runtime-boundary) for permissions, markers, failure
recovery and future manual/scheduled execution. No live research, provider calls or actions occur.

## Inputs and evidence

- Decision/report task and owner: `<owning task link and authority>`.
- Defaults: selected-document, explicit-baseline, product, market-customer-brief.
- Local destination declaration: `Plans/flows/business-market-customer.md`.
- Actual supplied period/source selection: `<source dates, definitions, paths and coverage>`.
- Required sources: market segment customer and competitor sources, source dates population and method, contradictions assumptions and unanswered questions.

Record source references, dates/freshness, population/method, scope and limitations. Keep evidence,
assumptions, decisions and follow-up separate. For missing mandatory evidence, block its dependent
claim; explicit unknown/pending states never become verified facts or approved actions.

## Domain steps

### scope

Name the decision question, market/segment, customer groups, competitor set and period. Identify supplied sources and allowed scope; this package performs no live research or provider call.

### source-review

Cite each source, date, population, method, coverage and limitations. Prefer primary evidence when available; missing mandatory provenance blocks a dependent market-size or customer claim. Do not replace an unavailable source with an unrelated one.

### synthesize

Separate observations, assumptions and unanswered questions. Preserve contradictions between market, segment, customer and competitor evidence; incompatible populations/methods cannot be averaged into a convenient estimate.

### report

Return the source-backed brief, alternatives/objections, confidence limits, unresolved questions and proposed next research. Do not present small or biased samples as representative demand or confirmed market potential.

## Approval boundary and outcome

Source retrieval must stay within its authorized scope; this authoring flow makes no queries. Paid research purchases, customer/competitor contact, CRM writes and external publication need a separate preview and explicit approval.

The default graph is analysis only; its local report is complete without a tracker. An unresolved
question or blocked comparison stays visible with the independent evidence already collected.

## Open questions

- ❓ Q1 `<required unanswered question>`
  Hold dependent claims/actions; preserve independent source evidence.
  > 💬👾 `<context, source limitations and the answer needed>`

Reference local question №Q1; link cross-file IDs to owning items. Keep important current rules short
in owning `DECISIONS.md`; preserve solved questions/options/threads verbatim in owning `RESOLVED.md`,
with stable IDs and anchored old-location pointers. Pending questions stay open.
