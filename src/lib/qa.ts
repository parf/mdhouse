/**
 * Questions and issues, as lines of a Markdown file — the markup of doc/qa.md.
 *
 * A question or an issue is a list item that opens with a glyph — `- ❓ …`, `- 🔴 D1 …`,
 * `- ✅ 🟠 …` — or a quote that does (`> ❓ …`). Its thread is quoted under it, one `💬` per turn;
 * its options are sub-items `( )` / `[ ]`. Items are found on markdown-it's block tokens — the
 * renderer and the server read the same parse, so they always agree on which lines an item is.
 *
 * Lines are the body split on `\n` with any `\r` removed; indices are 0-based.
 */

import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import footnote from 'markdown-it-footnote';

/** FNV-1a, 32 bits, as hex: a fingerprint of some source lines, cheap to compute on both ends. */
export function lineHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** The severities: high, medium, low, information. */
export const SEVERITY = ['🔴', '🟠', '⚪', '🔵'];
/** Settled: the agent never acts on them. */
export const CLOSED = ['✅', '🚫', '⏸️'];
/** Waiting on a person. */
export const ASK = ['❓', '⁉️'];
const STAGES = ['❓', '⁉️', '⏳', '✅', '🚫', '⏸️', '🎫', '⛔', '❌', '⚠️'];
const GLYPHS = [...STAGES, '🎯', ...SEVERITY];
const norm = (g: string) => g.replace(/️/g, '');
const KNOWN = new Map(GLYPHS.map((g) => [norm(g), g]));

/** The glyphs a line opens with — 🎯 apart — and the column where its text starts. */
export function leadGlyphs(text: string): { glyphs: string[]; target: boolean; len: number } {
  const glyphs: string[] = [];
  let target = false;
  let len = 0;
  for (let n = 0; n < 4; n++) {
    const m = /^(\p{Extended_Pictographic}|[⁉⚠⏸])️?(?:[ \t]+|$)/u.exec(text.slice(len));
    const g = m && KNOWN.get(norm(m[0].trim()));
    if (!g) break;
    if (g === '🎯') target = true;
    else glyphs.push(g);
    len += m![0].length;
  }
  return { glyphs, target, len };
}

/** One turn of a thread: `💬 ⚠️ 👤name text`, or a proposal `💡👾 text` (`✅ 💡` / `🚫 💡` once decided). */
export interface Reply {
  /** Body lines `[start, end)`. */
  start: number;
  end: number;
  /** Where the 💬 / 💡 stands in its first line — a verdict goes in front of it. */
  markCol: number;
  /** Where the text starts in its first line, after the mark, ⚠️ and the author. */
  textCol: number;
  partial: boolean;
  suggest: boolean;
  verdict: '✅' | '🚫' | null;
  /** The author badge as written: `👤parf`, `👾`; null when unsigned. */
  who: string | null;
  body: string;
}

export type NodeKind = 'item' | 'quote' | 'option' | 'case';

export interface QaNode {
  kind: NodeKind;
  /** Body lines `[start, end)`, trailing blank lines off. */
  start: number;
  end: number;
  /** What a thread line under it starts with: `  > ` under a list item, the quote's own `> `. */
  prefix: string;
  /** Column of the glyphs in the first line (after the list marker and any box). */
  glyphCol: number;
  /** Column of the text after the glyphs. */
  textCol: number;
  glyphs: string[];
  target: boolean;
  option: 'radio' | 'check' | null;
  /** Column of the box character (` ` / `x`) for an option. */
  boxCol: number;
  picked: boolean;
  /** The text after the glyphs, with the lines that continue it, dedented. */
  head: string;
  replies: Reply[];
  /** The last block is a thread: a new turn joins it after a blank `>`. */
  threadLast: boolean;
  /** Quotes under it that are not a thread — rendered as written. */
  context: string[];
  children: QaNode[];
}

export interface QaItem extends QaNode {
  kind: 'item' | 'quote';
  hash: string;
}

const LIST_LEAD = /^([ \t]*(?:[-*+]|\d{1,9}[.)])(?:[ \t]+|$))/;
const BOX = /^([([])([ xX])[)\]](?:[ \t]+|$)/;
const QUOTE_LEAD = /^([ \t]*>[ \t]?)/;
const REPLY = /^(?:(✅|🚫)[ \t]*)?(💬|💡)️?/u;
const isBlank = (l: string) => l.trim() === '';
const quoteBodyOf = (l: string) => (QUOTE_LEAD.test(l) ? l.replace(QUOTE_LEAD, '') : l.trim());

/** Turns from quote lines: a line opening with 💬 / 💡 starts one; the lines after it continue it. */
function parseReplies(lines: string[], from: number, to: number): { replies: Reply[]; context: number } {
  const replies: Reply[] = [];
  let context = to;
  for (let i = from; i < to; i++) {
    const raw = lines[i]!;
    const lead = QUOTE_LEAD.exec(raw)?.[0] ?? raw.match(/^\s*/)![0];
    const body = raw.slice(lead.length);
    const m = REPLY.exec(body);
    if (m && (!m[1] || m[2] === '💡')) {
      if (context === to) context = i;
      let col = lead.length + m[0].length;
      let rest = raw.slice(col);
      const skip = (re: RegExp) => {
        const s = re.exec(rest);
        if (s) {
          col += s[0].length;
          rest = rest.slice(s[0].length);
        }
        return !!s;
      };
      skip(/^[ \t]*/);
      let partial = skip(/^⚠️?[ \t]*/u);
      // the author: a badge first — `👤parf`, `👾`, `📡slack`; the older `👤 **name:**` is read too
      const w = /^(👤|👥|👾|📡)(?:[ \t]*\*\*([^*]+?):\*\*|([^\s:*]+):?)?[ \t]*/u.exec(rest);
      const who = w ? `${w[1]}${w[2] ?? w[3] ?? ''}` : null;
      if (w) skip(new RegExp(`^${w[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u'));
      if (skip(/^⚠️?[ \t]*/u)) partial = true;
      // "elaborate" asks for more: never an answer, like 💬 ⚠️
      if (/^elaborate\b/i.test(rest)) partial = true;
      // a 💡 signed by a person or a team is their answer, not a proposal
      const personal = !!who && /^(👤|👥)/u.test(who);
      replies.push({
        start: i,
        end: i + 1,
        markCol: lead.length + (m[1] ? m[0].indexOf(m[2]!) : 0),
        textCol: col,
        partial,
        suggest: m[2] === '💡' && !personal,
        verdict: (m[1] as Reply['verdict']) ?? null,
        who,
        body: rest,
      });
    } else if (replies.length) {
      const r = replies.at(-1)!;
      r.end = i + 1;
      r.body += `\n${body}`;
    }
  }
  for (const r of replies) {
    r.body = r.body.replace(/\n[\s>]*$/, '');
    // trailing blank `>` lines belong to no turn
    while (r.end > r.start + 1 && isBlank(quoteBodyOf(lines[r.end - 1]!))) r.end--;
  }
  return { replies, context };
}

/** The agent's record after acting — `→ DECISIONS.md …`, `` `sha` — … ``, `🎫ID → …` — is not a turn. */
export const isRecord = (r: Reply) => /^👾/u.test(r.who ?? '') && /^(→|`[0-9a-f]{7,}`|🎫\S+\s*→)/u.test(r.body.trim());
/** The last turn that counts: not a 💡, not a record. */
export const lastTurn = (replies: Reply[]) => replies.filter((r) => !r.suggest && !isRecord(r)).at(-1);

/**
 * A ❓ / ⁉️ is answered when its last turn is whole (not ⚠️ / elaborate, not a bare `no`) and from a
 * person, and the newest 💡 under it is decided. A picked `(x)` answers a one-of question; checkboxes
 * are answered by the item's own `done`.
 */
export function isAnswered(node: Pick<QaNode, 'replies' | 'children'>): boolean {
  const sug = node.replies.filter((r) => r.suggest).at(-1);
  if (sug && !sug.verdict) return false;
  const last = lastTurn(node.replies);
  if (last && /^no\s*$/i.test(last.body.trim())) return false;
  if (last && /^(👾|📡)/u.test(last.who ?? '')) return false;
  const options = node.children.filter((c) => c.option);
  if (options.some((o) => o.option === 'radio' && o.picked)) return true;
  if (options.some((o) => o.option === 'check')) return !!last && !last.partial && /^done\b/i.test(last.body);
  return !!last && !last.partial;
}

export interface QaState {
  /** ✅ 🚫 ⏸️, an answered ❓ / ⁉️, or a 🔵 note — folded. */
  closed: boolean;
  /** An answered ❓ / ⁉️: the file keeps the glyph, the page shows a green ?. */
  answered: boolean;
  /** Waits on me: an unanswered ❓ / ⁉️. */
  waitMe: boolean;
  /** An open issue nobody has triaged — works as an unanswered question does. */
  finding: boolean;
  /** An issue I triaged (a decided 💡, a pick, my own reply): over to the agent. */
  triaged: boolean;
  severity: string | null;
  /** What the strip and its filters read: the glyphs, `open` while not settled, 🎯. */
  key: string;
}

export function stateOf(node: QaNode): QaState {
  const status = node.glyphs[0] ?? '';
  const ask = ASK.includes(status);
  const answered = ask && isAnswered(node);
  // 🔵 an informational note: treated as done or not relevant
  const closed = CLOSED.includes(status) || answered || status === '🔵';
  const severity = node.glyphs.find((g) => SEVERITY.includes(g)) ?? null;
  const touched =
    ['⏳', '⚠️', '🎫'].includes(status) ||
    node.children.some((o) => o.option && o.picked) ||
    node.replies.some((r) => r.verdict || (!r.suggest && !/^(👾|📡)/u.test(r.who ?? '')));
  const triaged = !!severity && !ask && !closed && touched;
  const key = [...node.glyphs, ...(closed ? [] : ['open']), ...(node.target ? ['🎯'] : [])].join(' ');
  return { closed, answered, waitMe: ask && !answered, finding: !!severity && !ask && !closed && !triaged, triaged, severity, key };
}

/* ── finding items in the parse ── */

/** The index of the token that closes the block `tokens[i]` opens. */
function closeOf(tokens: Token[], i: number): number {
  const open = tokens[i]!;
  const type = open.type.replace(/_open$/, '_close');
  for (let k = i + 1; k < tokens.length; k++) if (tokens[k]!.type === type && tokens[k]!.level === open.level) return k;
  return tokens.length - 1;
}

const trimEnd = (lines: string[], start: number, end: number) => {
  while (end > start + 1 && (isBlank(lines[end - 1]!) || /^\s*>\s*$/.test(lines[end - 1]!))) end--;
  return end;
};

/** A list item, or null when it is not one this markup reads (inside a quote). */
function listNode(tokens: Token[], i: number, lines: string[]): QaNode | null {
  const open = tokens[i]!;
  const [start, mapEnd] = open.map!;
  const end = trimEnd(lines, start, mapEnd);
  const first = lines[start]!;
  const m = LIST_LEAD.exec(first);
  if (!m) return null;
  let col = m[1]!.length;
  const pad = ' '.repeat(first.slice(0, col).replace(/\t/g, '    ').length);
  const box = BOX.exec(first.slice(col));
  const boxCol = box ? col + 1 : -1;
  if (box) col += box[0].length;
  const lead = leadGlyphs(first.slice(col));
  const node: QaNode = {
    kind: 'case',
    start,
    end,
    prefix: `${pad}> `,
    glyphCol: col,
    textCol: col + lead.len,
    glyphs: lead.glyphs,
    target: lead.target,
    option: box ? (box[1] === '(' ? 'radio' : 'check') : null,
    boxCol,
    picked: !!box && box[2] !== ' ',
    head: '',
    replies: [],
    threadLast: false,
    context: [],
    children: [],
  };
  node.kind = node.option ? 'option' : node.glyphs.length || node.target ? 'item' : 'case';

  // The head runs up to the first list or quote directly under the item.
  const close = closeOf(tokens, i);
  let headEnd = end;
  let lastBlock: 'thread' | 'other' = 'other';
  for (let k = i + 1; k < close; k++) {
    const t = tokens[k]!;
    if (t.level !== open.level + 1 || t.nesting !== 1 || !t.map) continue;
    if (t.type === 'blockquote_open' || t.type === 'bullet_list_open' || t.type === 'ordered_list_open') {
      headEnd = Math.min(headEnd, t.map[0]);
    }
    if (t.type === 'blockquote_open') {
      const qEnd = trimEnd(lines, t.map[0], t.map[1]);
      const { replies, context } = parseReplies(lines, t.map[0], qEnd);
      if (context > t.map[0]) node.context.push(lines.slice(t.map[0], context).map(quoteBodyOf).join('\n'));
      node.replies.push(...replies);
      lastBlock = replies.length ? 'thread' : 'other';
    } else if (t.type === 'bullet_list_open' || t.type === 'ordered_list_open') {
      const listClose = closeOf(tokens, k);
      for (let j = k + 1; j < listClose; j++) {
        if (tokens[j]!.type !== 'list_item_open' || tokens[j]!.level !== t.level + 1) continue;
        const child = listNode(tokens, j, lines);
        if (child) node.children.push(child);
        j = closeOf(tokens, j);
      }
      lastBlock = 'other';
    } else lastBlock = 'other';
    k = closeOf(tokens, k);
  }
  node.threadLast = lastBlock === 'thread' && node.replies.at(-1)!.end === end;
  node.head = [first.slice(node.textCol), ...lines.slice(start + 1, headEnd).map((l) => l.trim())].join('\n').replace(/\s+$/, '');
  return node;
}

/** A quote that opens with a stage glyph — `> ❓ …` — its head, then its turns. */
function quoteNode(open: Token, lines: string[]): QaNode | null {
  const [start, mapEnd] = open.map!;
  const first = lines[start]!;
  const q = QUOTE_LEAD.exec(first);
  if (!q) return null;
  const lead = leadGlyphs(first.slice(q[0].length));
  if (!lead.glyphs.length || !STAGES.includes(lead.glyphs[0]!)) return null;
  const end = trimEnd(lines, start, mapEnd);
  const { replies, context } = parseReplies(lines, start + 1, end);
  const glyphCol = q[0].length;
  return {
    kind: 'quote',
    start,
    end,
    prefix: q[0].replace(/>[ \t]?$/, '> '),
    glyphCol,
    textCol: glyphCol + lead.len,
    glyphs: lead.glyphs,
    target: lead.target,
    option: null,
    boxCol: -1,
    picked: false,
    head: [first.slice(glyphCol + lead.len), ...lines.slice(start + 1, context).map(quoteBodyOf)].join('\n').replace(/\s+$/, ''),
    replies,
    threadLast: replies.length > 0,
    context: [],
    children: [],
  };
}

const withHash = (node: QaNode, lines: string[]): QaItem =>
  Object.assign(node as QaItem, { hash: lineHash(lines.slice(node.start, node.end).join('\n')) });

/**
 * Every item of a document, outermost first, as `[token index, item]`: the token is where the item
 * starts (its `list_item_open` / `blockquote_open`). Nested items are in their parent's `children`
 * and in the flat list too — each can be answered.
 */
export function qaItems(tokens: Token[], lines: string[]): Array<{ at: number; close: number; item: QaItem }> {
  const found: Array<{ at: number; close: number; item: QaItem }> = [];
  const nested = (node: QaNode) => {
    for (const c of node.children) {
      if (c.kind === 'item') found.push({ at: -1, close: -1, item: withHash(c, lines) });
      nested(c);
    }
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (!t.map) continue;
    if (t.type === 'list_item_open') {
      const node = listNode(tokens, i, lines);
      if (node?.kind === 'item') {
        const close = closeOf(tokens, i);
        found.push({ at: i, close, item: withHash(node, lines) });
        nested(node);
        i = close;
      }
    } else if (t.type === 'blockquote_open') {
      // nothing inside a quote is an item: the quote is one, or it is skipped whole
      const node = quoteNode(t, lines);
      const close = closeOf(tokens, i);
      if (node) found.push({ at: i, close, item: withHash(node, lines) });
      i = close;
    }
  }
  return found;
}

/** A quote that is only a thread — `> 💬 …` with no question over it — as its replies; else null. */
export function looseThread(open: Token, lines: string[]): Reply[] | null {
  const [start, mapEnd] = open.map!;
  const body = quoteBodyOf(lines[start] ?? '');
  const m = REPLY.exec(body);
  if (!m || (m[1] && m[2] !== '💡')) return null;
  return parseReplies(lines, start, trimEnd(lines, start, mapEnd)).replies;
}

/** The parse the renderer runs, with the same block rules: what the server finds items in. */
export const blockMd = new MarkdownIt({ html: true }).use(footnote);

/** The document's items, in body lines (`\r` off); `offset` is where the body starts in the file. */
export function parseQa(src: string, offset: number): { lines: string[]; items: QaItem[] } {
  const body = src.split('\n').slice(offset).join('\n');
  const lines = body.split('\n').map((l) => l.replace(/\r$/, ''));
  const tokens = blockMd.parse(body, {});
  return { lines, items: qaItems(tokens, lines).map((f) => f.item) };
}

/** A badge name from prefs `me`, else git — the local part of `user.email`, else `user.name` — else the login. */
export function badgeName(me: string | undefined, git: { name?: string; email?: string } | null, login: string): string {
  const clean = (s: string | undefined) => (s ?? '').replace(/[\s<>:,;.!?)&*]+/g, '');
  return clean(me) || clean(git?.email?.split('@')[0]) || clean(git?.name) || clean(login) || 'me';
}

/* ── writing ── */

export type QaAction = '✅' | '🚫' | '⏸️' | '⏳' | '⚠️' | '🎫' | '❓' | 'partial' | 'elaborate' | '🎯' | 'pick';
export const QA_ACTIONS: readonly QaAction[] = ['✅', '🚫', '⏸️', '⏳', '⚠️', '🎫', '❓', 'partial', 'elaborate', '🎯', 'pick'];

/**
 * One change to one item, addressed by its first line (1-based, in the body — what `data-line`
 * says) and the fingerprint the page rendered it with. `under`, `sug`, `opt`, `reply` are 1-based
 * body lines of an option, a 💡, a reply — each must belong to that item.
 */
export type QaChange =
  | { op: 'say'; text: string; sign?: boolean; action?: QaAction; under?: number }
  | { op: 'verdict'; sug: number; yes: boolean; text?: string }
  | { op: 'pick'; opt: number; on: boolean }
  | { op: 'tick'; opt: number }
  | { op: 'done'; text?: string }
  | { op: 'target' }
  | { op: 'edit'; reply: number; text: string };
export type QaRequest = { line: number; hash: string } & QaChange;
export type QaOp = QaChange['op'];
export const QA_OPS: readonly QaOp[] = ['say', 'verdict', 'pick', 'tick', 'done', 'target', 'edit'];
export type QaError = 'stale' | 'not-an-item' | 'no-target' | 'empty' | 'needs-who';

/**
 * Insert `texts` into a file's lines (`src.split('\n')`) before index `at`. New lines end as the
 * line before them does; past the last line of a file without a final newline, that line gains the
 * ending of the one above it and the new last line has none. No other line changes.
 */
export function insertLines(raw: string[], at: number, texts: string[]): void {
  const past = at >= raw.length;
  const cr = (raw[past ? raw.length - 2 : at - 1] ?? raw[at] ?? '').endsWith('\r') ? '\r' : '';
  if (past) {
    raw[raw.length - 1] += cr;
    raw.push(...texts.map((t, n) => (n === texts.length - 1 ? t : t + cr)));
  } else raw.splice(at, 0, ...texts.map((t) => t + cr));
}

/** Lines of a file, edited in place: each keeps its own line ending; new ones take their neighbour's. */
class Edit {
  raw: string[];
  constructor(
    src: string,
    readonly offset: number,
  ) {
    this.raw = src.split('\n');
  }
  get(i: number): string {
    return this.raw[this.offset + i]!.replace(/\r$/, '');
  }
  set(i: number, text: string): void {
    const at = this.offset + i;
    this.raw[at] = text + (this.raw[at]!.endsWith('\r') ? '\r' : '');
  }
  /** Insert before body line `i`. */
  insert(i: number, texts: string[]): void {
    insertLines(this.raw, this.offset + i, texts);
  }
  get src(): string {
    return this.raw.join('\n');
  }
}

/** Text as typed → lines; trailing space and leading blank lines off. */
const textLines = (text: string) => text.replace(/\r/g, '').replace(/\s+$/, '').replace(/^\s*\n/, '').split('\n');

/**
 * A line a quote must not start with: a new turn (💬, 💡, ✅ 💡), a question, or a mark the old
 * Q&A forms read (`?`, `?!`, `Q:`, `A:`, `[!QUESTION]` — convertLegacy would turn them into one).
 */
const TURN_START = /^(?:(?:(?:✅|🚫)[ \t]*)?(?:💬|💡)|❓|⁉|\?|!\?|Q:|A:|Q(?=\s)|\[!(?:QUESTION|ANSWER)\])/iu;
/** …and the first line of a plain quote: any glyph that opens a quote item too. */
export const QUOTE_START = (rest: string) => TURN_START.test(rest) || leadGlyphs(rest).glyphs.length > 0;

/**
 * Lines quoted under `prefix`. One that would read as a turn, a question or an old Q&A mark has
 * its first character escaped — a backslash before ASCII punctuation, else a character reference;
 * lines inside a fence stay exactly as typed.
 */
export function quoteLines(lines: string[], prefix: string, escape: (rest: string) => boolean = (r) => TURN_START.test(r)): string[] {
  let fence: string | null = null;
  return lines.map((line) => {
    const f = /^\s*(`{3,}|~{3,})/.exec(line);
    let out = line;
    if (fence) {
      if (f && f[1]![0] === fence[0] && f[1]!.length >= fence.length) fence = null;
    } else if (f) fence = f[1]!;
    else {
      const lead = line.match(/^\s*/)![0];
      const rest = line.slice(lead.length);
      if (rest && escape(rest)) {
        const ch = String.fromCodePoint(rest.codePointAt(0)!);
        out = `${lead}${/[!-/:-@[-`{-~]/.test(ch) ? `\\${ch}` : `&#${ch.codePointAt(0)};`}${rest.slice(ch.length)}`;
      }
    }
    return out ? `${prefix}${out}` : prefix.trimEnd();
  });
}

/** A turn: `💬 [⚠️ ][👤me ]text`, quoted under `prefix`. */
function turn(prefix: string, text: string, me: string | null, partial = false): string[] {
  const [first = '', ...rest] = textLines(text);
  const head = `💬 ${partial ? '⚠️ ' : ''}${me ? `👤${me} ` : ''}${first}`.trimEnd();
  return [`${prefix}${head}`, ...quoteLines(rest, prefix)];
}

/** Append a turn under a node: into its thread after a blank `>`, or as a new quote. */
function append(e: Edit, node: QaNode, lines: string[]): void {
  e.insert(node.end, node.threadLast ? [node.prefix.trimEnd(), ...lines] : lines);
}

/** Rewrite the glyphs of a node's first line. */
function setGlyphs(e: Edit, node: QaNode, glyphs: string[], target: boolean): void {
  const line = e.get(node.start);
  const run = [...(target ? ['🎯'] : []), ...glyphs].join(' ');
  e.set(node.start, `${line.slice(0, node.glyphCol)}${run}${run ? ' ' : ''}${line.slice(node.textCol)}`.trimEnd());
}

/** A stage replaces the first glyph unless that is a severity, which it then goes in front of. */
function withStage(glyphs: string[], stage: string): string[] {
  const g = [...glyphs];
  if (g.length && !SEVERITY.includes(g[0]!)) g[0] = stage;
  else g.unshift(stage);
  return g;
}

/**
 * Apply one change to one item. Refused when the page was rendered from an older file — the
 * item's lines no longer match the fingerprint the page sent. Every other line is kept byte for
 * byte, its own line ending included.
 */
export function applyQa(src: string, offset: number, req: QaRequest, me: string): { src: string } | { error: QaError } {
  const { items } = parseQa(src, offset);
  const item = items.find((it) => it.start === req.line - 1);
  if (!item) return { error: req.line >= 1 ? 'not-an-item' : 'stale' };
  if (item.hash !== req.hash) return { error: 'stale' };
  const e = new Edit(src, offset);
  const option = (line: number | undefined) => item.children.find((c) => c.option && c.start === (line ?? 0) - 1);
  const signed = (word: string, text?: string) => {
    const [first = '', ...rest] = text?.trim() ? textLines(text) : [];
    return turn(item.prefix, first ? `${word} — ${first}${rest.length ? `\n${rest.join('\n')}` : ''}` : word, me);
  };

  switch (req.op) {
    case 'say': {
      const text = req.text ?? '';
      const who = req.sign ? me : null;
      const a = req.action;
      if (!a && !text.trim()) return { error: 'empty' };
      if (a === '🎫' && !/(👤|👥)[^\s👤👥]+/u.test(text)) return { error: 'needs-who' };
      if (a === 'pick' || req.under !== undefined) {
        const opt = option(req.under);
        if (!opt) return { error: 'no-target' };
        if (a === 'pick' && opt.option === 'radio') pick(e, item, opt, true);
        if (text.trim()) append(e, opt, turn(opt.prefix, text, who));
        return { src: e.src };
      }
      if (a === '🎯') setGlyphs(e, item, item.glyphs, !item.target);
      else if (a === 'elaborate') {
        if (CLOSED.includes(item.glyphs[0] ?? '')) setGlyphs(e, item, withStage(item.glyphs, '❓'), item.target);
      } else if (a === 'partial') setGlyphs(e, item, withStage(item.glyphs, '❓'), item.target);
      else if (a) setGlyphs(e, item, withStage(item.glyphs, a), item.target);
      if (a === '✅') append(e, item, signed('settled', text));
      else if (a === 'elaborate') append(e, item, signed('elaborate', text));
      else if (text.trim()) append(e, item, turn(item.prefix, text, who, a === 'partial'));
      return { src: e.src };
    }
    case 'verdict': {
      const newest = item.replies.filter((r) => r.suggest).at(-1);
      if (!newest || newest.verdict || newest.start !== req.sug - 1) return { error: 'no-target' };
      const line = e.get(newest.start);
      e.set(newest.start, `${line.slice(0, newest.markCol)}${req.yes ? '✅' : '🚫'} ${line.slice(newest.markCol)}`);
      append(e, item, signed(req.yes ? 'yes' : 'no', req.text));
      return { src: e.src };
    }
    case 'pick':
    case 'tick': {
      const opt = option(req.opt);
      if (!opt || (req.op === 'pick') !== (opt.option === 'radio')) return { error: 'no-target' };
      pick(e, item, opt, req.op === 'pick' ? req.on : !opt.picked);
      return { src: e.src };
    }
    case 'done':
      append(e, item, signed('done', req.text));
      return { src: e.src };
    case 'target':
      setGlyphs(e, item, item.glyphs, !item.target);
      return { src: e.src };
    case 'edit': {
      const r = [...item.replies, ...item.children.flatMap((c) => (c.option ? c.replies : []))].find((x) => x.start === req.reply - 1);
      if (!r) return { error: 'no-target' };
      if (!req.text.trim()) return { error: 'empty' };
      const [first = '', ...rest] = textLines(req.text);
      const prefix = QUOTE_LEAD.exec(e.get(r.start))?.[0].replace(/>[ \t]?$/, '> ') ?? item.prefix;
      const lines = [`${e.get(r.start).slice(0, r.textCol)}${first}`, ...quoteLines(rest, prefix)];
      // every new line ends as the reply's first did; the last as its last did (a file's last line may have none)
      const end = (i: number) => (e.raw[e.offset + i]!.endsWith('\r') ? '\r' : '');
      e.raw.splice(e.offset + r.start, r.end - r.start, ...lines.map((l, n) => l + (n === lines.length - 1 ? end(r.end - 1) : end(r.start))));
      return { src: e.src };
    }
  }
}

/** Set an option's box; picking a radio clears its siblings. */
function pick(e: Edit, item: QaNode, opt: QaNode, on: boolean): void {
  const mark = (o: QaNode, v: boolean) => {
    const line = e.get(o.start);
    e.set(o.start, `${line.slice(0, o.boxCol)}${v ? 'x' : ' '}${line.slice(o.boxCol + 1)}`);
  };
  if (on && opt.option === 'radio') for (const o of item.children) if (o !== opt && o.option === 'radio' && o.picked) mark(o, false);
  mark(opt, on);
}

/** A request body as `applyQa` takes it, or null when it is not one: each op with its own fields. */
export function qaRequestOf(body: unknown): (QaRequest & { p: string }) | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const int = (v: unknown) => Number.isInteger(v);
  const str = (v: unknown) => typeof v === 'string';
  const opt = (v: unknown, t: (x: unknown) => boolean) => v === undefined || t(v);
  if (!str(b.p) || !int(b.line) || !str(b.hash) || !QA_OPS.includes(b.op as QaOp)) return null;
  const ok = {
    say: () => str(b.text) && opt(b.sign, (v) => typeof v === 'boolean') && opt(b.action, (v) => QA_ACTIONS.includes(v as QaAction)) && opt(b.under, int),
    verdict: () => int(b.sug) && typeof b.yes === 'boolean' && opt(b.text, str),
    pick: () => int(b.opt) && typeof b.on === 'boolean',
    tick: () => int(b.opt),
    done: () => opt(b.text, str),
    target: () => true,
    edit: () => int(b.reply) && str(b.text),
  }[b.op as QaOp]();
  return ok ? (b as unknown as QaRequest & { p: string }) : null;
}

/** A reply as the text a person edits: quote prefixes off, escaped first characters back. */
export function replyText(src: string, offset: number, line: number, hash: string, reply: number): string | null {
  const { lines, items } = parseQa(src, offset);
  const item = items.find((it) => it.start === line - 1);
  if (!item || item.hash !== hash) return null;
  const r = [...item.replies, ...item.children.flatMap((c) => (c.option ? c.replies : []))].find((x) => x.start === reply - 1);
  if (!r) return null;
  let fence: string | null = null;
  const rest = lines.slice(r.start + 1, r.end).map((l) => {
    const body = quoteBodyOf(l);
    const f = /^\s*(`{3,}|~{3,})/.exec(body);
    if (fence) {
      if (f && f[1]![0] === fence[0] && f[1]!.length >= fence.length) fence = null;
      return body;
    }
    if (f) fence = f[1]!;
    return body.replace(/^(\s*)(?:\\([!-/:-@[-`{-~])|&#(\d+);)/, (_, lead: string, p: string | undefined, n: string | undefined) => lead + (p ?? String.fromCodePoint(Number(n))));
  });
  return [lines[r.start]!.slice(r.textCol), ...rest].join('\n').trim();
}
