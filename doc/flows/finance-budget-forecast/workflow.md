# Draft a budget and forecast

Authoring package only — not runnable. See the
[Shared execution contract](../README.md#runtime-boundary) for permissions, marker/failure handling
and future manual/scheduled execution. No financial provider call or account access occurs.

## Inputs and evidence

- Supplied source documents and review owner: `<authorized source references and owner>`.
- Defaults: selected-document, explicit-baseline, finance, budget-forecast.
- Local destination declaration: `Plans/flows/finance-budget-forecast.md`.
- Declared basis: `<entity, currency, period, units, source dates and scope>`.
- Required sources: supplied budget and financial records, currency period units and opening cash or explicit missing, scenario assumptions estimates and owners.

Label source facts, assumptions, estimates, scenarios and uncertainty separately. Show formulas and
source references for derived values; record currency/period/units, signs, rounding and exclusions.
For missing mandatory evidence, block dependent claims rather than inventing facts, FX rates or
zero-valued inputs. Estimates are not verified actuals or a human decision.

## Domain steps

### scope

Name the entity/business unit, currency, period, cash/accrual basis and supplied source references. Record balances, assumptions and exclusions; a missing amount is unknown, not automatically zero.

### assumptions

Separate source facts from estimates and owner assumptions. Record units, timing, scenario changes and sensitivity; do not infer approved spending, booked revenue or currency conversions.

### scenarios

Draft labelled base/upside/downside scenarios using the declared input assumptions. Show arithmetic and period alignment, cash plan and variance notes; preserve uncertainty instead of presenting scenarios as predictions.

### cash-plan

Use ending cash = opening cash + inflows - outflows for the stated cash basis, currency and period. Use period-total flows, not unconverted flow rates. Missing mandatory opening cash blocks the ending-cash claim. Negative balances or zero flows retain their signs/meaning; do not invent a feasible funding decision.

### report

Return the assumption register, scenario/cash-plan drafts, variance notes, missing evidence and owner questions. Forecast estimates are not an approved budget or a financial decision.

## Approval boundary and outcome

Approving a budget, committing spending, changing source records or sending the forecast requires a separate preview and explicit approval outside this analytical package. It never authorizes a transaction.

The local report/checklist is complete without a tracker. Outputs are analytical drafts, not financial
advice; these flows never initiate payments or move funds, make actual financial decisions or access
providers. Human approval is required for consequential follow-up; validation grants no authority.

## Open questions

- ❓ Q1 `<required evidence or assumption question>`
  Preserve missing data and hold dependent calculations/conclusions/actions.
  > 💬👾 `<source, formula or scope limit and the evidence needed>`

Reference local question №Q1; cross-file IDs link to their owning items. Keep current important rules
short in owning `DECISIONS.md`; preserve solved questions/options/threads verbatim in owning
`resolved.md`, with stable IDs and anchored old-location pointers. Leave unanswered questions open.
