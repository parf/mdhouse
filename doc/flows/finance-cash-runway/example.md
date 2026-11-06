# Synthetic example — Cash and runway

This is illustrative authoring data, not an executed or verified run. CU is fictional; balances,
restrictions and burn scenarios are supplied hypothetical inputs, not actual account data.

## Input and available-cash model

| Input / result | Value | Unit |
| --- | --- | --- |
| Total cash | 1200 | CU at supplied as-of date |
| Restricted cash | 400 | CU, unavailable in this model |
| Available cash | 800 | CU |
| Positive-burn scenario | 100 | CU/month |
| Positive-burn scenario months | 8 | months under constant-burn assumption |

## Expected output

Available cash = total cash - restricted cash = 800 CU. The positive-burn scenario gives
800 / 100 = 8 months as a conditional estimate, not a guaranteed funding horizon. Commitments must
be reconciled against included outflows before interpreting the scenario.

A zero burn scenario has no finite cash-depletion estimate; a negative burn scenario increases cash
under the stated constant model. Both mean not unlimited funding or an approved spending decision.
Negative available cash would remain a liquidity gap, not a usable negative-month forecast.

## Open questions

- ❓ Q1 Which actual restrictions, commitments and period support the available-cash model?
  Missing mandatory restriction evidence blocks a usable balance/runway claim.
  > 💡👾 Reconcile same-period records and scenario assumptions without inserting unknown balances.
  >
  > 💬👾 No bank verification, financial advice or funding decision is invented.

Question №Q1 stays explicit.

## Expected route and approval stop

reconcile.blocked → end(blocked) if mandatory restrictions/commitments are unknown. The supplied
arithmetic remains a scenario only. No payment, transfer, account access or funds movement occurs.
See the [Shared execution contract](../README.md#runtime-boundary).
