import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { Registry } from './roots';
import type { Citation } from './rag-sync-runtime';

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

/** Local files larger than this are not read for a citation. */
const CITE_MAX_BYTES = 1_048_576;

/**
 * Fills in `lines` and `heading_path` for the records the RAG returned without them. The record's
 * `source` is looked up only through the root's jailed path resolution; a file that is not there, not
 * Markdown or not a plain file leaves its record as it was. A file whose sha256 differs from the
 * record's `content_hash` marks the record `stale: true` — no citation; an excerpt not found in the
 * file leaves the record as it was.
 */
export async function citeRecords(records: readonly Citation[], rootPath: string): Promise<Array<Citation & { stale?: true }>> {
  const registry = await Registry.create([rootPath], false);
  const id = registry.list()[0]!.id;
  const files = new Map<string, Promise<{ hash: string; text: string } | null>>();
  const load = (source: string) => {
    let f = files.get(source);
    if (!f) {
      f = (async () => {
        if (!source.endsWith('.md')) return null;
        const loc = await registry.resolve(`${id}/${source}`);
        if (!loc) return null;
        try {
          const st = await stat(loc.abs);
          if (!st.isFile() || st.size > CITE_MAX_BYTES) return null;
          const bytes = await readFile(loc.abs);
          return { hash: createHash('sha256').update(bytes).digest('hex'), text: bytes.toString('utf8') };
        } catch {
          return null;
        }
      })();
      files.set(source, f);
    }
    return f;
  };
  return Promise.all(
    records.map(async (r) => {
      if (r.lines) return r;
      const file = await load(r.source);
      if (!file) return r;
      if (file.hash !== r.content_hash.toLowerCase()) {
        const { heading_path: _h, lines: _l, ...rest } = r;
        return { ...rest, stale: true as const };
      }
      const found = cite(file.text, r.excerpt);
      return found ? { ...r, ...found } : r;
    }),
  );
}
