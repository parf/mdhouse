# Synthetic example — KPI and operating review

This is illustrative authoring data, not an executed or verified run. Counts, definitions and
periods below are synthetic; they are not actual operating metrics from a connected source.

## Input

Supplied `weekly-trials.csv` contains 8 active trial accounts out of 10 eligible trials for one week.
Supplied `target.md` sets 70% monthly activity for paid accounts. A supplied campaign note coincides
with the trial observation but contains no causal evaluation. Source dates and definitions are
retained in the input, not replaced by the current date.

## Expected output

| Item | Source reference / calculation | Assessment |
| --- | --- | --- |
| Weekly trial activity | `weekly-trials.csv`: 8 / 10 = 80% | Descriptive supplied-cohort rate only |
| Monthly paid target | `target.md`: 70%, paid population/month | not comparable with weekly trials |
| Proposed campaign driver | supplied `campaign-note.md`, timing only | not a demonstrated driver |

The readout does not claim the paid target was beaten or compute a misleading variance. It exposes
period/population/denominator mismatch, driver uncertainty and a follow-up to obtain comparable
actuals, with an owner and verification scope.

## Open questions

- ❓ Q1 Which monthly paid-account actuals match the target definition?
  The missing comparable actual blocks the target conclusion; weekly trial arithmetic remains descriptive.
  > 💡👾 Obtain aligned definitions, period, population and fresh source inputs before comparison.
  >
  > 💬👾 No target achievement, causal driver or owner decision is invented.

Question №Q1 remains explicit.

## Expected route and approval stop

validate.blocked → end(blocked) for the target comparison. No target, metric definition, source
record or operating plan is changed. No readout is sent and no schedule is created.
See the [Shared execution contract](../README.md#runtime-boundary).
