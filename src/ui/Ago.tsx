import { timeAgo } from './format';

/**
 * How hot a timestamp is. The buckets are the ones people actually think in — "just now",
 * "this hour", "today", "this week", "a while ago" — and each gets its own colour, so a list
 * of twenty rows shows where the activity is before a single label has been read.
 */
export type Heat = 'now' | 'hour' | 'day' | 'week' | 'old';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function heatOf(at: number): Heat {
  const delta = Date.now() - at;
  if (delta < 10 * MINUTE) return 'now';
  if (delta < HOUR) return 'hour';
  if (delta < DAY) return 'day';
  if (delta < 7 * DAY) return 'week';
  return 'old';
}

/**
 * A "3 h ago" label, coloured by how recent it is. The freshest bucket also gets a flame —
 * something changed in the last ten minutes is usually the thing you came here for.
 */
export function Ago({ at, flame = true }: { at: number; flame?: boolean }) {
  if (!at) return null;
  const heat = heatOf(at);

  return (
    <span class={`ago ${heat}`} title={new Date(at).toLocaleString()}>
      {heat === 'now' && flame && (
        <span class="flame" aria-hidden="true">
          🔥
        </span>
      )}
      {timeAgo(at)}
    </span>
  );
}
