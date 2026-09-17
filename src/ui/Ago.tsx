import { useEffect, useState } from 'preact/hooks';
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

/** Expire recent indicators at their time boundaries without polling. */
function useHeat(at: number): Heat {
  const [, refresh] = useState(0);
  const heat = at ? heatOf(at) : 'old';

  useEffect(() => {
    const duration = heat === 'now' ? 10 * MINUTE : heat === 'hour' ? HOUR : null;
    if (duration === null) return;
    const timer = setTimeout(() => refresh((n) => n + 1), Math.max(0, at + duration - Date.now()));
    return () => clearTimeout(timer);
  }, [at, heat]);

  return heat;
}

/** A file's recent-update badge beside its git status. */
export function RecentHeat({ at }: { at: number }) {
  const heat = useHeat(at);
  if (heat !== 'now' && heat !== 'hour') return null;
  const label = heat === 'now' ? 'Hot — updated less than 10 minutes ago' : 'Warm — updated less than an hour ago';

  return (
    <span class="badge recent-heat" role="img" aria-label={label} title={label}>
      {heat === 'now' ? '🔥' : '♨️'}
    </span>
  );
}

/**
 * A "3 h ago" label, coloured by how recent it is, with hot and warm indicators for the
 * first ten minutes and the rest of the first hour.
 */
export function Ago({ at, flame = true }: { at: number; flame?: boolean }) {
  const heat = useHeat(at);
  if (!at) return null;

  return (
    <span class={`ago ${heat}`} title={new Date(at).toLocaleString()}>
      {(heat === 'now' || heat === 'hour') && flame && (
        <span class="flame" aria-hidden="true">
          {heat === 'now' ? '🔥' : '♨️'}
        </span>
      )}
      {timeAgo(at)}
    </span>
  );
}
