/**
 * Adding a block to a document under one of its headings — the third edit mdhouse makes, after
 * ticking a checkbox and answering a question. Pure and line-based, like `qa.ts`: the server
 * re-reads the file, checks the heading is still the one the page showed, and inserts.
 */
import { lineHash, QUOTE_START, quoteLines } from './qa';

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

const ATX = /^ {0,3}(#{1,6})(?:[ \t]|$)/;
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const blank = (line: string) => line.trim() === '';

/** The heading on line `at`: its level and how many lines it takes (two for a setext one). */
function headingAt(lines: string[], at: number): { level: number; span: number } | null {
  const line = lines[at];
  if (line === undefined || blank(line)) return null;
  const atx = ATX.exec(line);
  if (atx) return { level: atx[1]!.length, span: 1 };
  const under = lines[at + 1];
  const setext = under !== undefined ? SETEXT.exec(under) : null;
  return setext ? { level: setext[1]!.startsWith('=') ? 1 : 2, span: 2 } : null;
}

/** Where the section under the heading on line `at` ends: the next heading of its level or higher, outside code. */
export function sectionEnd(lines: string[], at: number, level: number, span: number): number {
  let fence: string | null = null;
  for (let i = at + span; i < lines.length; i++) {
    const line = lines[i]!;
    const f = FENCE.exec(line);
    if (fence) {
      if (f && f[1]![0] === fence[0] && f[1]!.length >= fence.length) fence = null;
      continue;
    }
    if (f) {
      fence = f[1]!;
      continue;
    }
    const atx = ATX.exec(line);
    if (atx && atx[1]!.length <= level) return i;
  }
  return lines.length;
}

/** The block as Markdown. A signed quote carries `who`; quote lines that would read as Q&A are escaped. */
export function formatBlock(text: string, kind: AddKind, who: string): string[] {
  const [first = '', ...rest] = text.replace(/\r/g, '').replace(/\s+$/, '').split('\n');
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
 * blank lines; refused if the heading is not the one the page showed. CRLF is kept.
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
  const heading = headingAt(lines, at);
  if (!heading) return { error: 'not-a-heading' };

  let pos = at + heading.span;
  if (req.where === 'end') {
    pos = sectionEnd(lines, at, heading.level, heading.span);
    while (pos > at + heading.span && blank(lines[pos - 1]!)) pos--;
  }
  const block = formatBlock(req.text, req.kind, who);
  const after = lines[pos] !== undefined && !blank(lines[pos]!) ? [''] : [];
  const crlf = src.includes('\r\n');
  const eol = (l: string) => l + (crlf ? '\r' : '');
  raw.splice(pos, 0, ...['', ...block, ...after].map(eol));
  // Inserted at the very end of a file without a final newline: the last line keeps having none.
  if (crlf && !src.endsWith('\n')) {
    for (let i = at; i < raw.length - 1; i++) if (!raw[i]!.endsWith('\r')) raw[i] += '\r';
    raw[raw.length - 1] = raw[raw.length - 1]!.replace(/\r$/, '');
  }
  return { src: raw.join('\n'), line: pos + 2 - offset };
}
