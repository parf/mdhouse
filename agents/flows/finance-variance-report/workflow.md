# Explain plan versus actual variance

Authoring package only — not runnable. See the
[Shared execution contract](../README.md#runtime-boundary) for permissions, marker/failure handling
and future manual/scheduled execution. No financial provider call or account access occurs.

## Inputs and evidence

- Supplied source documents and review owner: `<authorized source references and owner>`.
- Defaults: selected-document, explicit-baseline, finance, variance-report.
- Local destination declaration: `Plans/flows/finance-variance-report.md`.
- Declared basis: `<entity, currency, period, units, source dates and scope>`.
- Required sources: plan and actual records for selected period or business unit, currency units definitions and comparison basis, material driver evidence and explicit uncertainty.

Label source facts, assumptions, estimates, scenarios and uncertainty separately. Show formulas and
source references for derived values; record currency/period/units, signs, rounding and exclusions.
For missing mandatory evidence, block dependent claims rather than inventing facts, FX rates or
zero-valued inputs. Estimates are not verified actuals or a human decision.

## Domain steps

### scope

Select the entity/business unit, period, currency, units and financial basis for plan and actuals. Cite source references and freshness; incompatible source definitions remain explicit.

### align

Check periods, currencies, units, classification and gross/net basis before comparison. Missing mandatory comparability or an unsupported FX assumption blocks dependent variance claims; this package fetches no rates.

### calculate

Declare expense delta = actual - plan and its sign convention. Percentage = delta / plan * 100 only for a defined nonzero comparable baseline; zero baseline gives undefined percentage. Preserve negative/credit signs and explain their basis, not an automatic favorable/unfavorable score.

### interpret

Explain material movement using supplied driver evidence, uncertainty and scope. Separate demonstrated arithmetic from proposed drivers; a variance alone proves neither a cause nor a required financial action.

### report

Return matched comparisons, blocked/mismatched rows, driver limits and management-review proposals. Do not silently convert currency, change a budget or treat a zero baseline as a finite percentage.

## Approval boundary and outcome

Changing budgets, targets, classifications, source entries, owner actions or distributing the report needs a separate preview and explicit approval. The report neither makes financial decisions nor instructs payments.

The local report/checklist is complete without a tracker. Outputs are analytical drafts, not financial
advice; these flows never initiate payments or move funds, make actual financial decisions or access
providers. Human approval is required for consequential follow-up; validation grants no authority.

## Open questions

- ❓ Q1 `<required evidence or assumption question>`
  Preserve missing data and hold dependent calculations/conclusions/actions.
  > 💬👾 `<source, formula or scope limit and the evidence needed>`

Reference local question №Q1; cross-file IDs link to their owning items. Keep current important rules
short in owning `DECISIONS.md`; preserve solved questions/options/threads verbatim in owning
`RESOLVED.md`, with stable IDs and anchored old-location pointers. Leave unanswered questions open.
