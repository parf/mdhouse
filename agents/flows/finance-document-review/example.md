# Synthetic example — Financial document review

This is illustrative authoring data, not an executed or verified run. The invoice/date/amounts are
synthetic; CU is fictional and no actual supplier, source record or account is accessed.

## Input and observed arithmetic

A supplied invoice dated 2026-10-01 has two lines and a stated total; due date and tax/fee basis are
not supplied. Original source locations and their signs remain unchanged.

| Input / result | Value | Unit |
| --- | --- | --- |
| Line one | 100 | CU |
| Line two | 50 | CU |
| Stated total | 180 | CU |
| Unexplained difference | 30 | CU |

## Expected output

The unexplained difference = 180 - 100 - 50 = 30 CU. Record tax/fees: unknown and due date: unknown.
This is not a confirmed invoice error, an approved adjustment or an overdue-payment claim. The
checklist asks for tax/fee/rounding terms and date evidence, citing the original document lines.

## Open questions

- ❓ Q1 Which tax/fee and rounding evidence explains the supplied total?
  Missing basis blocks a definitive reconciliation; observed arithmetic and source terms remain visible.
  > 💡👾 Request the supporting terms before classifying the difference or proposing a correction.
  >
  > 💬👾 No supplier error, financial advice, source edit or payment approval is invented.

Question №Q1 stays open.

## Expected route and approval stop

compare.blocked → end(blocked). No invoice, statement, model, ledger, due date or funds are changed;
no payment or external filing occurs. See the
[Shared execution contract](../README.md#runtime-boundary).
