/**
 * Adding a block to a document under one of its headings — the third edit mdhouse makes, after
 * ticking a checkbox and answering a question. Pure, like `qa.ts`: the server re-reads the file,
 * checks the heading is still the one the page showed, and inserts.
 */
import { blockMd, insertLines, lineHash, QUOTE_START, quoteLines } from './qa';

/** What a block is added as — the buttons under the textarea. */
export type AddKind = 'text' | 'quote' | 'my-quote' | 'tip' | 'question' | 'disagreement' | 'answer';
export const ADD_KINDS: readonly AddKind[] = ['text', 'quote', 'my-quote', 'tip', 'question', 'disagreement', 'answer'];

/** ↓ right under the heading, or ⇊ at the end of its section. */
export type AddWhere = 'below' | 'end';

export interface AddRequest {
  /** 1-based body line of the heading (what its `data-line` says). */
  line: number;
  /** Fingerprint of the heading's line, as the page rendered it. */
  hash: string;
  where: AddWhere;
  kind: AddKind;
  text: string;
}

const blank = (line: string) => line.trim() === '';

/**
 * The heading on body line `at` and where its section ends, from the parse the page renders: a
 * heading of the document itself (`data-hash`), the lines it takes, and the next such heading of
 * its level or higher — or the end of the body.
 */
export function sectionOf(lines: string[], at: number): { span: number; end: number } | null {
  const heads = blockMd.parse(lines.join('\n'), {}).filter((t) => t.type === 'heading_open' && t.level === 0 && t.map);
  const i = heads.findIndex((t) => t.map![0] === at);
  if (i === -1) return null;
  const level = (t: (typeof heads)[number]) => Number(t.tag.slice(1));
  const next = heads.slice(i + 1).find((t) => level(t) <= level(heads[i]!));
  return { span: heads[i]!.map![1] - at, end: next ? next.map![0] : lines.length };
}

/** The block as Markdown. A signed quote carries `who`; quote lines that would read as Q&A are escaped. */
export function formatBlock(text: string, kind: AddKind, who: string): string[] {
  const [first = '', ...rest] = text.replace(/\r/g, '').replace(/\s+$/, '').replace(/^\s*\n/, '').split('\n');
  const quoted = (mark: string) => [`> ${mark}${first}`, ...quoteLines(rest, '> ')];
  switch (kind) {
    case 'text':
      return [first, ...rest];
    case 'quote':
      // Every line — the first too — must stay a plain quote line.
      return [...quoteLines([first], '> ', QUOTE_START), ...quoteLines(rest, '> ')];
    case 'my-quote':
      return quoted(`**${who}:** `);
    case 'tip':
      return ['> [!TIP]', ...quoteLines([first, ...rest], '> ')];
    case 'question':
      return quoted('❓ ');
    case 'disagreement':
      return quoted('⁉️ ');
    case 'answer':
      return quoted('\u{1F4AC} ');
  }
}

/**
 * Add a block under a heading: right under it, or at the end of its section (after the
 * section's last line, before the blank lines that lead to the next heading). Separated by
 * blank lines; refused if the heading is not the one the page showed. New lines end as their
 * neighbour does.
 */
export function insertBlock(
  src: string,
  offset: number,
  req: AddRequest,
  who: string,
): { src: string; line: number } | { error: 'stale' | 'not-a-heading' | 'empty' } {
  if (!req.text.trim()) return { error: 'empty' };
  const raw = src.split('\n');
  const lines = raw.map((l) => l.replace(/\r$/, ''));
  const at = offset + req.line - 1;
  if (req.line < 1 || at >= lines.length) return { error: 'stale' };
  if (lineHash(lines[at]!) !== req.hash) return { error: 'stale' };
  const section = sectionOf(lines.slice(offset), req.line - 1);
  if (!section) return { error: 'not-a-heading' };

  let pos = at + section.span;
  if (req.where === 'end') {
    pos = offset + section.end;
    while (pos > at + section.span && blank(lines[pos - 1]!)) pos--;
  }
  const block = formatBlock(req.text, req.kind, who);
  const after = lines[pos] !== undefined && !blank(lines[pos]!) ? [''] : [];
  insertLines(raw, pos, ['', ...block, ...after]);
  return { src: raw.join('\n'), line: pos + 2 - offset };
}
