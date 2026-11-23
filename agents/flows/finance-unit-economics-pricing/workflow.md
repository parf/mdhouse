# Inspect unit economics and pricing assumptions

Authoring package only — not runnable. See the
[Shared execution contract](../README.md#runtime-boundary) for permissions, marker/failure handling
and future manual/scheduled execution. No financial provider call or account access occurs.

## Inputs and evidence

- Supplied source documents and review owner: `<authorized source references and owner>`.
- Defaults: selected-document, explicit-baseline, finance, unit-economics.
- Local destination declaration: `Plans/flows/finance-unit-economics-pricing.md`.
- Declared basis: `<entity, currency, period, units, source dates and scope>`.
- Required sources: revenue and variable or fixed cost assumptions, unit currency period and volume definitions, scenario evidence and unknown cost limits.

Label source facts, assumptions, estimates, scenarios and uncertainty separately. Show formulas and
source references for derived values; record currency/period/units, signs, rounding and exclusions.
For missing mandatory evidence, block dependent claims rather than inventing facts, FX rates or
zero-valued inputs. Estimates are not verified actuals or a human decision.

## Domain steps

### scope

Define the revenue unit, currency, period, volume and supplied assumptions. Separate variable from fixed costs and name exclusions; missing mandatory costs remain unknown rather than zero.

### model

Declare contribution per unit = price - variable cost. In a positive-fixed-cost model, break-even volume = fixed costs / contribution only when contribution is positive. With nonpositive contribution no meaningful finite positive break-even follows from this model; zero denominators are undefined.

### sensitivity

Expose price/cost/volume scenarios, contribution margin, fixed-cost basis and sensitivity without calling estimates facts. Preserve zero/negative cases and assumption changes; no inferred optimal price or market demand.

### report

Return inspectable calculations, units, assumptions, estimates, model limits and review questions. A model is not a pricing recommendation, forecast certainty or authorization to change an offer.

## Approval boundary and outcome

Changing prices, offers, budgets, contracts or source models and publishing a pricing proposal needs a separate preview and explicit approval outside this analytical draft. No financial decision or transaction is made.

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
