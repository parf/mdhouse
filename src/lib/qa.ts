/**
 * Questions and their answers, as lines of a Markdown file.
 *
 * The renderer turns four syntaxes into question / disagreement / answer blocks (see
 * doc/qa.md). To answer one from the browser, the server has to find, in the *source*, the
 * question's lines and the answer that follows it, and write the answer back in the same syntax.
 * Everything here is line-based and pure, and the renderer uses the same functions to fingerprint
 * a question — so the page and the server can never disagree about which lines a question is.
 *
 * Lines are the file split on `\n` with any `\r` removed; indices are 0-based.
 */

/** FNV-1a, 32 bits, as hex: a fingerprint of some source lines, cheap to compute on both ends. */
export function lineHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export type QaKind = 'question' | 'answer' | 'disagreement';
/**
 * How a question was written: a glyph in a quote, an alert, a bold line, a `:::` container, or a
 * task item (`- [ ] question`, the QUESTIONS.md convention) whose answer is an indented quote.
 */
export type QaForm = 'quote' | 'alert' | 'bold' | 'container' | 'task';
export const QA_FORMS: readonly QaForm[] = ['quote', 'alert', 'bold', 'container', 'task'];

/** A task item outside any quote; group 1 runs through the marker, so its length is the indent. */
const TASK = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/;
const indentOf = (line: string) => line.length - line.trimStart().length;
/** A line that starts its own list item, at any depth. */
const ITEM = /^\s*(?:[-*+]|\d+[.)])\s/;

/**
 * The glyphs of a Q&A log, opening a line inside a quote (see /rd/.claude/Glyphs.md): `?` or ❓ a
 * question, `?!` / `!?` or ⁉️ a disagreement — two sources that contradict — and 💬 the answer;
 * also `Q:` / `A:`, and `Q` alone. Never a bare `A`: `> A quick note` is English, not an answer.
 */
export const QUOTE_MARK = /^(\?!|!\?|⁉️?|\?|❓|\u{1F4AC}|Q:|A:|Q(?=\s))\s*/u;
export const quoteKind = (mark: string): QaKind =>
  mark === '?!' || mark === '!?' || mark.startsWith('⁉')
    ? 'disagreement'
    : mark === '\u{1F4AC}' || mark === 'A:'
      ? 'answer'
      : 'question';

/** `**Q:**` / `**A:**` opening a line of a paragraph (as markdown-it hands it over, no list marker). */
export const QA_LINE = /^\*\*([QA]):\*\*\s*/;
/** The same in the source, where it may follow a list marker: `- **Q:** …`. Group 2 is Q or A. */
const BOLD = /^(\s*(?:[-*+]|\d+[.)])\s+)?\*\*([QA]):\*\*\s*/;

const QUOTE = /^\s*>/;
const quoteBody = (line: string) => line.replace(/^\s*>\s?/, '');
const blank = (line: string) => line.trim() === '';
const ALERT_Q = /^\s*>\s*\[!QUESTION\]/i;
const ALERT_A = /^\s*>\s*\[!ANSWER\]\s*/i;
const OPEN_Q = /^:::\s*(?:q|question)(?:\s|$)/;
const OPEN_A = /^:::\s*(?:a|answer)(?:\s+|$)/;
const CLOSE = /^:::\s*$/;

/** The kind a quote line marks, if any. */
function quoteMark(line: string): QaKind | null {
  if (!QUOTE.test(line)) return null;
  const m = QUOTE_MARK.exec(quoteBody(line));
  return m ? quoteKind(m[1]!) : null;
}

/** `[start, end)` — `end` exclusive. */
export interface Range {
  start: number;
  end: number;
}

/** The end of a quote that runs from `from`: the first line that is not part of it. */
function quoteEnd(lines: string[], from: number): number {
  let i = from;
  while (i < lines.length && QUOTE.test(lines[i]!)) i++;
  return i;
}

/**
 * The lines of the question (or disagreement) that starts at `start`, or null if no question in
 * this form starts there.
 */
export function qaQuestionRange(lines: string[], start: number, form: QaForm): Range | null {
  const first = lines[start];
  if (first === undefined) return null;
  switch (form) {
    case 'quote': {
      const kind = quoteMark(first);
      if (kind !== 'question' && kind !== 'disagreement') return null;
      let end = start + 1;
      // Unmarked lines of the same paragraph continue it.
      while (end < lines.length && QUOTE.test(lines[end]!) && !blank(quoteBody(lines[end]!)) && !quoteMark(lines[end]!)) end++;
      return { start, end };
    }
    case 'alert':
      return ALERT_Q.test(first) ? { start, end: quoteEnd(lines, start) } : null;
    case 'bold': {
      const m = BOLD.exec(first);
      if (!m || m[2] !== 'Q') return null;
      return { start, end: boldEnd(lines, start) };
    }
    case 'container': {
      if (!OPEN_Q.test(first)) return null;
      let end = start + 1;
      while (end < lines.length && !CLOSE.test(lines[end]!)) end++;
      return end < lines.length ? { start, end: end + 1 } : null;
    }
    case 'task': {
      const m = TASK.exec(first);
      if (!m) return null;
      // Continuation lines are indented into the item; a quote (the answer) or a new item ends it.
      const indent = m[1]!.length;
      let end = start + 1;
      while (
        end < lines.length &&
        !blank(lines[end]!) &&
        indentOf(lines[end]!) >= indent &&
        !QUOTE.test(lines[end]!) &&
        !ITEM.test(lines[end]!)
      )
        end++;
      return { start, end };
    }
  }
}

/** The end of a bold-line question or answer: its continuation lines, up to a blank line, the next marked line, or the next list item. */
function boldEnd(lines: string[], start: number): number {
  let end = start + 1;
  while (end < lines.length && !blank(lines[end]!) && !BOLD.test(lines[end]!) && !ITEM.test(lines[end]!)) end++;
  return end;
}

/** How far a task item's content is indented: where an answer quote under it starts. */
export function taskIndent(line: string): number {
  return TASK.exec(line)?.[1]!.length ?? 0;
}

/** The answer that directly follows a question ending at `after`, or null if it has none. */
export function qaAnswerRange(lines: string[], after: number, form: QaForm): Range | null {
  // The forms that are separate blocks may have blank lines between question and answer.
  let at = after;
  if (form === 'alert' || form === 'bold' || form === 'container') {
    while (at < lines.length && blank(lines[at]!)) at++;
  }
  const first = lines[at];
  if (first === undefined) return null;
  switch (form) {
    case 'task': {
      // An indented `> 💬` (or `> A:`) quote inside the item, right under the question.
      if (quoteMark(first) !== 'answer' || indentOf(first) === 0) return null;
      const indent = indentOf(first);
      let end = at + 1;
      while (end < lines.length && QUOTE.test(lines[end]!) && indentOf(lines[end]!) >= indent && !quoteMark(lines[end]!)) end++;
      while (end > at + 1 && blank(quoteBody(lines[end - 1]!))) end--;
      return { start: at, end };
    }
    case 'quote': {
      if (quoteMark(first) !== 'answer') return null;
      // Everything after it in the quote is the answer's — bullets, more paragraphs — up to the
      // next marked line; trailing blank `>` lines belong to neither.
      let end = at + 1;
      while (end < lines.length && QUOTE.test(lines[end]!) && !quoteMark(lines[end]!)) end++;
      while (end > at + 1 && blank(quoteBody(lines[end - 1]!))) end--;
      return { start: at, end };
    }
    case 'alert':
      return ALERT_A.test(first) ? { start: at, end: quoteEnd(lines, at) } : null;
    case 'bold': {
      const m = BOLD.exec(first);
      if (!m || m[2] !== 'A') return null;
      return { start: at, end: boldEnd(lines, at) };
    }
    case 'container': {
      if (!OPEN_A.test(first)) return null;
      let end = at + 1;
      while (end < lines.length && !CLOSE.test(lines[end]!)) end++;
      return end < lines.length ? { start: at, end: end + 1 } : null;
    }
  }
}

/** An answer's lines as the text a person edits: markers, quote prefixes and fences removed. */
export function answerText(answer: string[], form: QaForm): string {
  const out: string[] = [];
  switch (form) {
    case 'task':
    case 'quote':
      answer.forEach((line, n) => {
        const body = quoteBody(line);
        out.push(n === 0 ? body.replace(QUOTE_MARK, '') : body);
      });
      break;
    case 'alert':
      answer.forEach((line, n) => {
        if (n === 0) {
          const rest = quoteBody(line).replace(/^\s*\[!ANSWER\]\s*/i, '');
          if (rest) out.push(rest);
        } else out.push(quoteBody(line));
      });
      break;
    case 'bold':
      answer.forEach((line, n) => out.push(n === 0 ? line.replace(BOLD, '') : line.trimStart()));
      break;
    case 'container': {
      const title = answer[0]!.replace(OPEN_A, '').trim();
      if (title) out.push(title);
      out.push(...answer.slice(1, -1));
      break;
    }
  }
  return out.join('\n').trim();
}

/**
 * The answer written out in the question's own syntax. Always 💬, never `A:` — the glyph is the
 * answer marker; `A:` is read, but not written. `indent` places a task item's answer inside it.
 */
export function formatAnswer(text: string, form: QaForm, indent = 0, listMarker = ''): string[] {
  let body = text.replace(/\r/g, '').replace(/\s+$/, '').split('\n');
  const pad = ' '.repeat(indent);
  switch (form) {
    case 'task':
      return body.map((line, n) => (n === 0 ? `${pad}> \u{1F4AC} ${line}` : line ? `${pad}> ${line}` : `${pad}>`));
    case 'quote':
      return body.map((line, n) => (n === 0 ? `> \u{1F4AC} ${line}` : line ? `> ${line}` : '>'));
    case 'alert':
      return ['> [!ANSWER]', ...body.map((line) => (line ? `> ${line}` : '>'))];
    case 'bold':
      // A blank line would end the paragraph and split the answer in two; a bold-line answer is
      // one paragraph (plus a list straight after it).
      body = body.filter((line) => line.trim() !== '');
      // A question that is a list item is answered by the next item of the same list.
      return body.map((line, n) => (n === 0 ? `${listMarker}**A:** ${line}` : `${' '.repeat(listMarker.length)}${line}`));
    case 'container':
      return ['::: a', ...body, ':::'];
  }
}

export interface AnswerRequest {
  /** 1-based line of the question within the document body (what `data-line` says). */
  line: number;
  form: QaForm;
  /** Fingerprint of the question's lines, as the page rendered them. */
  hash: string;
  /** Fingerprint of the answer's lines as the page saw them; `''` when it had none. */
  answerHash: string;
  text: string;
  /** Task items only: tick the question's checkbox too — "Check & Save". */
  check?: boolean;
}

/** Locate a question in a file and the answer under it, with their fingerprints. */
export function findQuestion(
  src: string,
  offset: number,
  line: number,
  form: QaForm,
): { lines: string[]; question: Range; answer: Range | null; hash: string; answerHash: string } | null {
  const lines = src.split('\n').map((l) => l.replace(/\r$/, ''));
  const question = qaQuestionRange(lines, offset + line - 1, form);
  if (!question || line < 1) return null;
  const answer = qaAnswerRange(lines, question.end, form);
  return {
    lines,
    question,
    answer,
    hash: lineHash(lines.slice(question.start, question.end).join('\n')),
    answerHash: answer ? lineHash(lines.slice(answer.start, answer.end).join('\n')) : '',
  };
}

/**
 * Write (or rewrite) the answer to one question — the second and last edit mdhouse makes to a
 * document, after ticking a checkbox. Refused when the page was rendered from an older file:
 * the question's lines, or the answer's, no longer match the fingerprints the page sent.
 * Everything else in the file is kept byte for byte, `\r\n` included.
 */
export function writeAnswer(
  src: string,
  offset: number,
  req: AnswerRequest,
): { src: string } | { error: 'stale' | 'not-a-question' | 'empty' } {
  if (!req.text.trim()) return { error: 'empty' };
  const found = findQuestion(src, offset, req.line, req.form);
  if (!found) return { error: 'not-a-question' };
  if (found.hash !== req.hash || found.answerHash !== req.answerHash) return { error: 'stale' };

  const crlf = src.includes('\r\n');
  const raw = src.split('\n');
  const qLine = found.lines[found.question.start]!;
  const written = formatAnswer(
    req.text,
    req.form,
    req.form === 'task' ? taskIndent(qLine) : 0,
    req.form === 'bold' ? (BOLD.exec(qLine)?.[1] ?? '') : '',
  );
  if (found.answer) {
    raw.splice(found.answer.start, found.answer.end - found.answer.start, ...written.map((l) => l + (crlf ? '\r' : '')));
  } else {
    // A separate block gets a blank line before it; a quote or bold line joins the question's.
    const lead = req.form === 'alert' || req.form === 'container' ? [''] : [];
    raw.splice(found.question.end, 0, ...[...lead, ...written].map((l) => l + (crlf ? '\r' : '')));
  }
  // The answer went in after the question, so the question's own line has not moved.
  if (req.check && req.form === 'task') {
    raw[found.question.start] = raw[found.question.start]!.replace(TASK, (_: string, lead: string) => `${lead}[x]`);
  }
  return { src: raw.join('\n') };
}
