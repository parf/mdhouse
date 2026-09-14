/** Compact "time ago" labels, same vocabulary the r-doc git panel uses. */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function timeAgo(at: number): string {
  if (!at) return '';
  const delta = Date.now() - at;
  if (delta < MINUTE) return 'just now';
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)} min ago`;
  if (delta < DAY) return `${Math.floor(delta / HOUR)} h ago`;

  const days = Math.floor(delta / DAY);
  if (days < 30) return days === 1 ? 'yesterday' : `${days} d ago`;
  if (days < 365) return `${Math.floor(days / 30)} mo ago`;
  return `${Math.floor(days / 365)} y ago`;
}

/**
 * A file name as it is worth reading in a list where everything is Markdown: `TODO.md` is
 * `TODO`. `.mdx` keeps its extension — there the distinction still says something.
 */
export function docName(name: string): string {
  return name.replace(/\.md$/i, '');
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
