# Review a financial document for inconsistencies

Authoring package only — not runnable. See the
[Shared execution contract](../README.md#runtime-boundary) for permissions, marker/failure handling
and future manual/scheduled execution. No financial provider call or account access occurs.

## Inputs and evidence

- Supplied source documents and review owner: `<authorized source references and owner>`.
- Defaults: selected-document, explicit-baseline, finance, financial-review-checklist.
- Local destination declaration: `Plans/flows/finance-document-review.md`.
- Declared basis: `<entity, currency, period, units, source dates and scope>`.
- Required sources: supplied invoices statements or models, terms dates amounts currency and line evidence, tax fee and reconciliation basis or explicit missing.

Label source facts, assumptions, estimates, scenarios and uncertainty separately. Show formulas and
source references for derived values; record currency/period/units, signs, rounding and exclusions.
For missing mandatory evidence, block dependent claims rather than inventing facts, FX rates or
zero-valued inputs. Estimates are not verified actuals or a human decision.

## Domain steps

### intake

Record the supplied invoices/statements/models, scope, source references and confidentiality limits. Preserve source records; do not open provider accounts or request credentials.

### extract

Extract terms, dates, amounts, currency, units, tax/fee basis and source locations. Distinguish document issue date from an unprovided due date; preserve signed credit/negative lines and unknown fields.

### compare

Reconcile line sums, stated totals, dates and terms under the supplied rounding/tax rules. An unexplained difference is not a confirmed error if tax/fees or context are missing. Missing mandatory basis blocks a definitive reconciliation; zero/negative amounts keep their documented meaning.

### checklist

Create a source-linked review checklist of inconsistencies, uncertainties, required supporting records and human owner questions. Do not alter an invoice, statement or financial model to make it reconcile.

### report

Return extracted facts and the review checklist with formulas/basis, limits and proposed verification steps. No document finding authorizes acceptance, source correction, financial decision or payment.

## Approval boundary and outcome

Correcting source documents, accepting terms, filing/sending a review or changing financial records needs a separate preview and explicit approval outside this analytical checklist. The flow never pays an invoice or modifies funds.

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
