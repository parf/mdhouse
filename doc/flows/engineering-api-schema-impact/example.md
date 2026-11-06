# Synthetic example — API and schema impact

This is illustrative authoring data, not an executed or verified run. Contract/consumer records
are supplied synthetic snapshots; no database, service or deployment was queried or changed.

## Input

A supplied base/target contract diff has a removed field named legacyCode. A documented report
consumer reads that field. Another downstream consumer has no owner or compatibility-check record.
The supplied configuration schema changes a related default, but no migration check is present.

## Expected output

| Area | Observed synthetic evidence | Assessment |
| --- | --- | --- |
| Known consumer | Reads the removed field | Source-backed incompatibility candidate with exact contract reference |
| Unknown consumer | No owner/check supplied | compatibility: unknown, not proven safe |
| Configuration default | Supplied schema differs | Record effect/verification gap rather than infer rollout success |
| migration proposal | Consumer transition + checks + rollback needed | Draft guidance only, no execution |

- ❓ Q1 Who supplies the unknown consumer's compatibility evidence?
  Missing coverage blocks a universal compatibility claim and executable migration recommendation.
  > 💡👾 Obtain the consumer owner/checks and verify the proposed transition at actual revisions.
  >
  > 💬👾 The example invents no compatible consumer, successful migration or admin grant.

Question №Q1 remains open; the known contract observations stay readable.

## Expected route and approval stop

consumer-impact.blocked → end(blocked) for the missing mandatory consumer evidence. The report
retains the known break and conditional migration proposal. No database query/migration, API edit,
consumer update or deployment occurs. See the
[Shared execution contract](../README.md#runtime-boundary).
