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
  /** Case-sensitive only when the query contains an uppercase letter. */
  smartCase?: boolean;
  maxHits?: number;
  /** Per-file cap, so one enormous file cannot fill the whole result. */
  maxPerFile?: number;
  includeIgnored?: boolean;
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

async function searchWithRipgrep(rootPath: string, query: string, opts: SearchOptions): Promise<SearchResult | null> {
  const { regex = false, maxHits = 500, maxPerFile = 20, includeIgnored = false } = opts;

  const args = [
    '--json',
    '--glob', '*.md',
    '--glob', '*.mdx',
    '--glob', '*.MD',
    '--smart-case',
    '--max-count', String(maxPerFile),
    '--max-filesize', '8M',
    '--no-messages',
  ];
  if (!regex) args.push('--fixed-strings');
  if (includeIgnored) args.push('--no-ignore-vcs');
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
      if (hits.length >= maxHits) {
        truncated = true;
        proc.kill();
        break;
      }

      const path: string = event.data.path?.text ?? '';
      const raw: string = (event.data.lines?.text ?? '').replace(/\n$/, '');
      const { text, shift } = clipLine(raw);
      const toChar = byteOffsetMapper(raw);

      hits.push({
        rel: path.startsWith(prefix) ? path.slice(prefix.length) : path,
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
  const { regex = false, maxHits = 500, maxPerFile = 20 } = opts;
  const hasUpper = /[A-Z]/.test(query);

  let matcher: (line: string) => Array<[number, number]>;
  if (regex) {
    let re: RegExp;
    try {
      re = new RegExp(query, hasUpper ? 'g' : 'gi');
    } catch {
      return { hits: [], truncated: false, degraded: true };
    }
    matcher = (line) => [...line.matchAll(re)].map((m) => [m.index!, m.index! + m[0].length]);
  } else {
    const needle = hasUpper ? query : query.toLowerCase();
    matcher = (line) => {
      const hay = hasUpper ? line : line.toLowerCase();
      const out: Array<[number, number]> = [];
      let at = hay.indexOf(needle);
      while (at !== -1) {
        out.push([at, at + needle.length]);
        at = hay.indexOf(needle, at + needle.length);
      }
      return out;
    };
  }

  const hits: SearchHit[] = [];
  let truncated = false;

  for (const file of files) {
    if (hits.length >= maxHits) {
      truncated = true;
      break;
    }
    const content = await Bun.file(`${rootPath}/${file.rel}`)
      .text()
      .catch(() => null);
    if (content === null) continue;
    // Cheap reject before splitting into lines: a plain query that is nowhere in the file
    // cannot match any of its lines.
    if (!regex && !(hasUpper ? content : content.toLowerCase()).includes(hasUpper ? query : query.toLowerCase())) {
      continue;
    }

    let inFile = 0;
    const lines = content.split('\n');
    for (let i = 0; i < lines.length && inFile < maxPerFile && hits.length < maxHits; i++) {
      const ranges = matcher(lines[i]!);
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
    const result = await searchWithRipgrep(rootPath, query, opts);
    if (result) return result;
  }
  return searchInProcess(rootPath, files, query, opts);
}
