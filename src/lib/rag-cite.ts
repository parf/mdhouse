/** Where a RAG excerpt sits in its file: 1-based inclusive `lines` and the ATX heading chain enclosing the first one. */
export interface Cite {
  lines: [number, number];
  heading_path: string[];
}

const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/**
 * Finds the first exact occurrence of `excerpt` in `text` and returns its lines and heading chain,
 * or null when the excerpt is empty or absent. Line endings are compared as `\n`. The chain holds
 * every ATX heading above the start line, a heading on that line included, outside fenced code;
 * each deeper heading replaces the earlier ones of its level or lower.
 */
export function cite(text: string, excerpt: string): Cite | null {
  const body = text.replace(/\r\n/g, '\n');
  const needle = excerpt.replace(/\r\n/g, '\n');
  if (!needle.trim()) return null;
  const at = body.indexOf(needle);
  if (at < 0) return null;

  const start = count(body.slice(0, at)) + 1;
  const end = start + count(needle.replace(/\n+$/, ''));

  const chain: { level: number; title: string }[] = [];
  let fence: { char: string; size: number } | null = null;
  const lines = body.split('\n');
  for (let i = 0; i < start; i++) {
    const line = lines[i]!;
    const f = FENCE.exec(line);
    if (fence) {
      if (f && f[1]![0] === fence.char && f[1]!.length >= fence.size && !f[2]!.trim()) fence = null;
      continue;
    }
    if (f && !(f[1]![0] === '`' && f[2]!.includes('`'))) {
      fence = { char: f[1]![0]!, size: f[1]!.length };
      continue;
    }
    const h = HEADING.exec(line);
    if (!h) continue;
    const level = h[1]!.length;
    while (chain.length && chain[chain.length - 1]!.level >= level) chain.pop();
    chain.push({ level, title: (h[2] ?? '').replace(/[ \t]+#+$/, '').replace(/^#+$/, '') });
  }
  return { lines: [start, end], heading_path: chain.map((c) => c.title) };
}

const count = (s: string): number => s.split('\n').length - 1;
