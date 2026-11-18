/**
 * Full-text search across a root.
 *
 * ripgrep does the work when it is installed — it is faster than anything we would write, it
 * already understands `.gitignore`, and it streams JSON we can parse incrementally. When it is
 * missing we scan the file list the scanner already cached, which is slower but never wrong.
 *
 * Filename and heading search is deliberately *not* here: the client already holds the whole
 * tree, so it matches names locally with no round-trip at all.
 */

import type { MdFile } from './scan';

export interface SearchHit {
  rel: string;
  line: number;
  /** The matching line, trimmed and capped. */
  text: string;
  /** Character ranges to highlight within `text`. */
  ranges: Array<[number, number]>;
}

export interface SearchResult {
  hits: SearchHit[];
  /** More matches existed than the cap allowed. */
  truncated: boolean;
  /** ripgrep was unavailable; results came from the in-process scan. */
  degraded: boolean;
}

export interface SearchOptions {
  regex?: boolean;
  maxHits?: number;
  /** Per-file cap, so one enormous file cannot fill the whole result. */
  maxPerFile?: number;
  includeIgnored?: boolean;
  /** Team supplies its path jail, so search opens only files it can still resolve in the selected project. */
  resolve?: (rel: string) => Promise<string | null>;
}

const MAX_LINE = 400;

/**
 * ripgrep reports match offsets in **bytes**; JavaScript strings are indexed in UTF-16 code
 * units. On an ASCII line the two agree, which is exactly why this is easy to miss — the
 * highlight only slides off once a line contains non-ASCII text, and half these docs are in
 * Russian. Build the mapping once per line rather than encoding per offset.
 */
function byteOffsetMapper(line: string): (byteOffset: number) => number {
  const map = new Map<number, number>([[0, 0]]);
  let bytes = 0;

  for (let i = 0; i < line.length; ) {
    const cp = line.codePointAt(i)!;
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    i += cp > 0xffff ? 2 : 1;
    map.set(bytes, i);
  }
  return (byteOffset) => map.get(byteOffset) ?? line.length;
}

function clipLine(line: string): { text: string; shift: number } {
  const trimmed = line.replace(/\s+$/, '');
  const lead = trimmed.length - trimmed.trimStart().length;
  const text = trimmed.slice(lead, lead + MAX_LINE);
  return { text, shift: lead };
}

async function hasRipgrep(): Promise<boolean> {
  try {
    const proc = Bun.spawn(['rg', '--version'], { stdout: 'ignore', stderr: 'ignore' });
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}

let ripgrepAvailable: Promise<boolean> | null = null;

/**
 * Keeps only hits in `listed` — the scanned tree. ripgrep's file filter is not the scan's (the deny
 * list, dot-folders), so it searches wider — `--hidden`, any case of `.md` — and the tree decides.
 */
async function searchWithRipgrep(rootPath: string, listed: Set<string>, query: string, opts: SearchOptions): Promise<SearchResult | null> {
  const { regex = false, maxHits = 500, maxPerFile = 20, includeIgnored = false } = opts;

  const args = [
    '--json',
    '--hidden',
    '--iglob', '*.md',
    '--iglob', '*.mdx',
    '--ignore-case',
    '--max-count', String(maxPerFile),
    '--max-filesize', '8M',
    '--no-messages',
  ];
  if (!regex) args.push('--fixed-strings');
  if (includeIgnored) args.push('--no-ignore-vcs');
  if (opts.resolve) args.push('--no-follow');
  args.push('--regexp', query, rootPath);

  let proc;
  try {
    proc = Bun.spawn(['rg', ...args], { cwd: rootPath, stdout: 'pipe', stderr: 'ignore' });
  } catch {
    return null;
  }

  const hits: SearchHit[] = [];
  let truncated = false;
  const prefix = rootPath.endsWith('/') ? rootPath : rootPath + '/';

  const decoder = new TextDecoder();
  const reader = proc.stdout.getReader();
  let buffer = '';
  const checked = new Map<string, boolean>();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (!line) continue;

      let event: any;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (event.type !== 'match') continue;
      const path: string = event.data.path?.text ?? '';
      const rel = path.startsWith(prefix) ? path.slice(prefix.length) : path;
      if (!listed.has(rel)) continue;
      if (opts.resolve) {
        if (!checked.has(rel)) checked.set(rel, !!(await opts.resolve(rel)));
        if (!checked.get(rel)) continue;
      }
      if (hits.length >= maxHits) {
        truncated = true;
        proc.kill();
        break;
      }

      const raw: string = (event.data.lines?.text ?? '').replace(/\n$/, '');
      const { text, shift } = clipLine(raw);
      const toChar = byteOffsetMapper(raw);

      hits.push({
        rel,
        line: event.data.line_number ?? 0,
        text,
        ranges: (event.data.submatches ?? [])
          .map((s: any) => [toChar(s.start) - shift, toChar(s.end) - shift] as [number, number])
          .filter(([a, b]: [number, number]) => b > 0 && a < MAX_LINE),
      });
    }
    if (truncated) break;
  }

  await proc.exited;
  return { hits, truncated, degraded: false };
}

/** Exported so the fallback can be tested directly; `searchContent` picks it automatically. */
export async function searchInProcess(
  rootPath: string,
  files: MdFile[],
  query: string,
  opts: SearchOptions,
): Promise<SearchResult> {
  // An empty query should also return nothing when the fallback is called directly.
  if (!query) return { hits: [], truncated: false, degraded: true };

  const { regex = false, maxHits = 500, maxPerFile = 20 } = opts;
  let re: RegExp;
  try {
    // Match the original string so Unicode case folding cannot shift the highlight offsets.
    re = new RegExp(regex ? query : RegExp.escape(query), 'giu');
  } catch {
    return { hits: [], truncated: false, degraded: true };
  }

  const hits: SearchHit[] = [];
  let truncated = false;

  for (const file of files) {
    if (hits.length >= maxHits) {
      truncated = true;
      break;
    }
    const path = opts.resolve ? await opts.resolve(file.rel) : `${rootPath}/${file.rel}`;
    if (!path) continue;
    const content = await Bun.file(path)
      .text()
      .catch(() => null);
    if (content === null) continue;
    // Cheap reject before splitting into lines: a plain query that is nowhere in the file
    // cannot match any of its lines.
    if (!regex) {
      const found = re.test(content);
      re.lastIndex = 0;
      if (!found) continue;
    }

    let inFile = 0;
    const lines = content.split('\n');
    for (let i = 0; i < lines.length && inFile < maxPerFile && hits.length < maxHits; i++) {
      const ranges = [...lines[i]!.matchAll(re)].map((match) => [match.index, match.index + match[0].length] as const);
      if (!ranges.length) continue;
      const { text, shift } = clipLine(lines[i]!);
      hits.push({
        rel: file.rel,
        line: i + 1,
        text,
        ranges: ranges.map(([a, b]) => [a - shift, b - shift] as [number, number]),
      });
      inFile++;
    }
  }

  return { hits, truncated, degraded: true };
}

export async function searchContent(
  rootPath: string,
  files: MdFile[],
  query: string,
  opts: SearchOptions = {},
): Promise<SearchResult> {
  if (!query.trim()) return { hits: [], truncated: false, degraded: false };

  ripgrepAvailable ??= hasRipgrep();
  if (await ripgrepAvailable) {
    const result = await searchWithRipgrep(rootPath, new Set(files.map((f) => f.rel)), query, opts);
    if (result) return result;
  }
  return searchInProcess(rootPath, files, query, opts);
}
