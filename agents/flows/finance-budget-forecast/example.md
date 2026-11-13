# Synthetic example — Budget and forecast

This is illustrative authoring data, not an executed or verified run. CU denotes a fictional
currency unit; all monthly amounts and scenario assumptions are synthetic, not actual finances.

## Input

Supplied `budget.csv` estimates one-month total inflows of 300 CU and outflows of 250 CU for one entity.
The opening-balance record is absent. Scenario notes propose different inflow/outflow assumptions,
but no actual owner budget decision or currency conversion is supplied.

## Expected output

| Quantity | Declared basis / result |
| --- | --- |
| Net monthly movement | 300 - 250 = 50 CU for the supplied month, from synthetic estimates |
| Opening balance | opening cash: unknown, not zero |
| Ending balance | ending cash: unknown until opening cash is supplied |
| Scenario variants | Label base/upside/downside assumptions explicitly; no scenario is an approved forecast |

The draft exposes the equation ending cash = opening cash + inflows - outflows. It is not an
approved budget and does not turn a positive movement into evidence of a sufficient cash balance.

## Open questions

- ❓ Q1 Which opening balance and date support the monthly cash plan?
  The missing balance blocks an ending-cash figure; scenario assumptions remain inspectable.
  > 💡👾 Obtain the same-entity/currency opening record rather than inserting zero.
  >
  > 💬👾 No balance, budget approval, financial advice or transaction is invented.

Question №Q1 stays open.

## Expected route and approval stop

cash-plan.blocked → end(blocked). No budget approval, spending, payment, funds movement or source
edit occurs. Estimates remain labelled drafts. See the
[Shared execution contract](../README.md#runtime-boundary).
