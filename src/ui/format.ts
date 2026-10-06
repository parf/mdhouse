/** Compact "time ago" labels, same vocabulary the r-doc git panel uses. */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function timeAgo(at: number): string {
  if (!at) return '';
  const delta = Date.now() - at;
  if (delta < MINUTE) return 'just now';
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m ago`;
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h ago`;

  const days = Math.floor(delta / DAY);
  if (days < 30) return days === 1 ? 'yesterday' : `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/**
 * `timeAgo` without the "ago", for a column where every entry is an age: `now`, `5m`, `22h`,
 * `3d`, `2mo`, `1y`. Yesterday is `1d` here — the word does not fit the column.
 */
export function shortAgo(at: number): string {
  if (!at) return '';
  if (Date.now() - at < MINUTE) return 'now';
  const label = timeAgo(at);
  return label === 'yesterday' ? '1d' : label.replace(/ ago$/, '');
}

/**
 * Elapsed time in two units for the first week — `29m ago`, `7h 12m ago`, `1d 7h ago` — then the
 * usual `timeAgo` words. For "when did this checkout last pull", where "yesterday" could mean
 * two hours ago or forty.
 */
export function preciseAgo(at: number): string {
  if (!at) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - at) / MINUTE));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days >= 7) return timeAgo(at);
  if (days) return `${days}d ${hours % 24}h ago`;
  if (hours) return `${hours}h ${minutes % 60}m ago`;
  return `${minutes}m ago`;
}

/**
 * A file name as it is worth reading in a list where everything is Markdown: `TODO.md` is
 * `TODO`. `.mdx` keeps its extension — there the distinction still says something.
 */
export function docName(name: string): string {
  return name.replace(/\.md$/i, '');
}

/**
 * A file size in at most three digits: `87`, `1.1K`, `100K`, `1.2M`. Bytes carry no unit —
 * next to K and M a bare number reads as bytes without the extra letter.
 */
export function fileSize(bytes: number): string {
  if (bytes < 1000) return String(bytes);
  let v = bytes / 1024;
  for (const unit of ['K', 'M', 'G', 'T']) {
    if (v < 9.95) return `${v.toFixed(1).replace(/\.0$/, '')}${unit}`;
    if (Math.round(v) < 1000) return `${Math.round(v)}${unit}`;
    v /= 1024;
  }
  return `${Math.round(v * 1024)}T`;
}

/**
 * A root as the switcher names it: its folder and `above` folders over it — `Plans/Removal`
 * rather than a bare `Removal`, since several roots are often siblings or namesakes and the
 * parents are what tell them apart. A path that has fewer segments keeps its leading slash
 * (`/rd`). `above: 'all'` is the whole path, with the home directory written `~`.
 *
 * Past `max` characters the left end goes, behind an ellipsis: the last segment is the one
 * that must stay readable, and a `<select>` can only cut text off on the right.
 */
export function rootLabel(path: string, opts: { above?: number | 'all'; max?: number; home?: string } = {}): string {
  const { above = 1, max = 28, home } = opts;
  let label: string;
  if (above === 'all') {
    label = home && (path === home || path.startsWith(`${home}/`)) ? `~${path.slice(home.length)}` || '~' : path;
  } else {
    const parts = path.split('/').filter(Boolean);
    label = parts.length <= above + 1 ? `/${parts.join('/')}` : parts.slice(-(above + 1)).join('/');
  }
  return label.length > max ? `…${label.slice(label.length - max + 1)}` : label;
}

/**
 * A filter box's text as a matcher, the way MySQL reads `LIKE '%text%'`: it matches anywhere,
 * ignoring case, and `%` / `_` inside it stand for any run of characters / exactly one. A
 * leading `^` pins it to the start and a trailing `$` to the end, as in a regex. Empty text
 * matches everything.
 */
export function likeMatcher(text: string): (value: string) => boolean {
  let t = text.trim();
  const start = t.startsWith('^');
  const end = t.length > (start ? 1 : 0) && t.endsWith('$');
  if (start) t = t.slice(1);
  if (end) t = t.slice(0, -1);
  if (!t && !start && !end) return () => true;
  const body = [...t]
    .map((ch) => (ch === '%' ? '.*' : ch === '_' ? '.' : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('');
  const re = new RegExp(`${start ? '^' : ''}${body}${end ? '$' : ''}`, 'i');
  return (value) => re.test(value);
}

/** Split a line into plain and highlighted runs for a search hit. */
export function highlightRanges(text: string, ranges: Array<[number, number]>): Array<{ text: string; hit: boolean }> {
  if (!ranges.length) return [{ text, hit: false }];

  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: Array<{ text: string; hit: boolean }> = [];
  let at = 0;

  for (const [start, end] of sorted) {
    const from = Math.max(start, at);
    const to = Math.max(end, from);
    if (from > at) out.push({ text: text.slice(at, from), hit: false });
    if (to > from) out.push({ text: text.slice(from, to), hit: true });
    at = Math.max(at, to);
  }
  if (at < text.length) out.push({ text: text.slice(at), hit: false });
  return out;
}
