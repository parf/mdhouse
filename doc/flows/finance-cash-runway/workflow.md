# Review cash and runway scenarios

Authoring package only — not runnable. See the
[Shared execution contract](../README.md#runtime-boundary) for permissions, marker/failure handling
and future manual/scheduled execution. No financial provider call or account access occurs.

## Inputs and evidence

- Supplied source documents and review owner: `<authorized source references and owner>`.
- Defaults: selected-document, explicit-baseline, finance, cash-runway.
- Local destination declaration: `Plans/flows/finance-cash-runway.md`.
- Declared basis: `<entity, currency, period, units, source dates and scope>`.
- Required sources: supplied balances restrictions and commitments, cash inflows outflows and same-period burn, scenario assumptions freshness and unknowns.

Label source facts, assumptions, estimates, scenarios and uncertainty separately. Show formulas and
source references for derived values; record currency/period/units, signs, rounding and exclusions.
For missing mandatory evidence, block dependent claims rather than inventing facts, FX rates or
zero-valued inputs. Estimates are not verified actuals or a human decision.

## Domain steps

### scope

Identify supplied balances, as-of date, entity, currency, period and freshness. Record restricted cash and commitments with source references; the package accesses no bank/provider and invents no account balance.

### reconcile

Separate unrestricted/available cash from restricted amounts and reconcile commitments without double-counting items already in forecast outflows. Missing mandatory balances/restrictions block a usable liquidity claim.

### scenarios

For the declared constant-burn model, runway = available cash / positive net burn using the same period. Net burn is outflows - inflows. With zero or negative net burn, show no finite depletion estimate under that scenario, not unlimited funding. Negative available cash is a reported gap, not negative usable runway.

### report

Return balances, restrictions, commitments, burn, scenario formulas, uncertainty and upcoming human-review questions. Label estimates and sensitivity; never imply a guaranteed funding horizon or choose a funding/payment action.

## Approval boundary and outcome

Balance/source changes, funding commitments, external distribution and any other consequential follow-up need a separate preview and explicit approval under their real authority. This package does not access accounts or initiate a financial action.

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
