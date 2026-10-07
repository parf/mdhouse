/**
 * Prototype: renders the Q&A markup of ../markup.md into a standalone page styled like
 * ../rendering.html. `bun Plans/brainstorm/proto/qa-render.ts <in.md> > <out.html>`.
 *
 * Line-based: a quote opening with ❓ ⁉️ 👉 (or ✅ 👉), and a list whose first item opens with a
 * glyph, are Q&A blocks; everything else goes to markdown-it as it is. The page's buttons work
 * in the browser only — nothing is written back.
 */

import MarkdownIt from 'markdown-it';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const md = new MarkdownIt({ html: false, linkify: true });

// ---------------------------------------------------------------- model

const SEVERITY = ['🔴', '🟠', '⚪', '🔵'];
const CLOSED = ['✅', '🚫', '⏸️', '🎫'];
const ASK = ['❓', '⁉️'];
const GLYPHS = ['❓', '⁉️', '⏳', '✅', '🚫', '⏸️', '🎫', '⛔', '❌', '⚠️', '👉', ...SEVERITY];
/** A glyph as written, with or without its variation selector. */
const norm = (g: string) => g.replace(/️/g, '');
const known = new Map(GLYPHS.map((g) => [norm(g), g]));

interface Reply { partial: boolean; who: string | null; body: string }
interface Item {
  glyphs: string[];
  head: string;
  option: 'radio' | 'check' | null;
  picked: boolean;
  replies: Reply[];
  items: Item[];
}

/** The glyphs a line opens with (at most three), and the rest of it. */
function leadGlyphs(text: string): { glyphs: string[]; rest: string } {
  const glyphs: string[] = [];
  let rest = text;
  for (let n = 0; n < 3; n++) {
    const m = /^(\p{Extended_Pictographic}|[⁉⚠⏸])️?(?:\s+|$)/u.exec(rest);
    const g = m && known.get(norm(m[0].trim()));
    if (!g) break;
    glyphs.push(g);
    rest = rest.slice(m![0].length);
  }
  return { glyphs, rest };
}

/** `> 💬 ⚠️ 👤name text` lines, the `>` already off: one reply per 💬. */
function parseReplies(lines: string[]): Reply[] {
  const replies: Reply[] = [];
  for (const line of lines) {
    const m = /^💬️?\s*(.*)$/u.exec(line);
    if (m) {
      let rest = m[1]!;
      const partial = /^⚠️?\s*/u.test(rest);
      rest = rest.replace(/^⚠️?\s*/u, '');
      // `👤name text`; the older `👤 **name:** text` is read too
      const who = /^👤\s*(?:\*\*([^*]+?):\*\*|([^\s:*]+):?)\s*/u.exec(rest);
      replies.push({ partial, who: who ? (who[1] ?? who[2]!) : null, body: who ? rest.slice(who[0].length) : rest });
    } else if (replies.length) replies.at(-1)!.body += `\n${line}`;
  }
  for (const r of replies) r.body = r.body.replace(/\n+$/, '');
  return replies;
}

const unquote = (lines: string[]) => lines.map((l) => l.replace(/^>\s?/, ''));
const indentOf = (l: string) => /^ */.exec(l)![0].length;

/** A list item and the lines indented under it (already dedented by its marker). */
function parseItem(first: string, children: string[]): Item {
  let text = first.replace(/^[-*+]\s+/, '');
  let option: Item['option'] = null;
  let picked = false;
  const box = /^([([])([ xX])[)\]]\s+/.exec(text);
  if (box) {
    option = box[1] === '(' ? 'radio' : 'check';
    picked = box[2] !== ' ';
    text = text.slice(box[0].length);
  }
  const { glyphs, rest } = leadGlyphs(text);
  const head = [rest];
  let i = 0;
  while (i < children.length && !/^(>|[-*+]\s)/.test(children[i]!)) head.push(children[i++]!);
  const item: Item = { glyphs, head: head.join('\n'), option, picked, replies: [], items: [] };
  while (i < children.length) {
    if (children[i]!.startsWith('>')) {
      const q: string[] = [];
      while (i < children.length && children[i]!.startsWith('>')) q.push(children[i++]!);
      item.replies.push(...parseReplies(unquote(q)));
    } else if (/^[-*+]\s/.test(children[i]!)) {
      const sub = children[i++]!;
      const under: string[] = [];
      while (i < children.length && indentOf(children[i]!) >= 2) under.push(children[i++]!.slice(2));
      item.items.push(parseItem(sub, under));
    } else item.head += `\n${children[i++]}`;
  }
  return item;
}

function parseList(lines: string[]): Item[] {
  const items: Item[] = [];
  for (let i = 0; i < lines.length; ) {
    const first = lines[i++]!;
    const under: string[] = [];
    while (i < lines.length && indentOf(lines[i]!) >= 2) under.push(lines[i++]!.slice(2));
    items.push(parseItem(first, under));
  }
  return items;
}

// ---------------------------------------------------------------- render

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const inline = (s: string) => md.renderInline(s.replace(/\s*\n\s*/g, ' '));
/** 🌟 / ⭐ in an option's text become labels. */
const labels = (html: string) =>
  html.replace(/\s*🌟/gu, ' <span class="suggest">🌟 suggested</span>').replace(/\s*⭐/gu, ' <span class="suggest">⭐ runner-up</span>');
/** The first paragraph of a reply, up to a list or a blank line — what a folded item shows. */
const firstLine = (r: Reply) => inline(r.body.split(/\n\s*\n|\n\s*[-*+]\s/)[0]!);
/** A body with paragraphs or a list is rendered as blocks; a run of lines is one inline paragraph. */
const blocky = (body: string) => /\n\s*\n|\n\s*[-*+]\s|\n\s*\d+[.)]\s/.test(body);

function replyHtml(r: Reply): string {
  const who = r.who ? `<span class="who">👤 ${esc(r.who)}</span>` : '';
  const body = blocky(r.body) ? md.render(r.body) : `<span class="txt">${inline(r.body)}</span>`;
  return `<div class="reply${r.partial ? ' partial' : ''}">${r.partial ? '⚠️ ' : ''}${who}${body}</div>`;
}
const threadHtml = (rs: Reply[], cls = 'thread') => `<div class="${cls}">${rs.map(replyHtml).join('')}</div>`;

/** What the strip and the filters read: the glyphs, plus `open` for a line not yet settled. */
const keyOf = (glyphs: string[], open: boolean) => [...glyphs, ...(open ? ['open'] : [])].join(' ');

function glyphButton(g: string, tip: string): string {
  return `<span class="g-btn${SEVERITY.includes(g) || !ASK.includes(g) ? ' sev' : g === '⁉️' ? ' dis' : ''}" data-tip="${esc(tip)}">${g}</span>`;
}

function optionHtml(o: Item, name: string, done: boolean): string {
  const input = `<input type="${o.option === 'radio' ? 'radio' : 'checkbox'}" name="${name}"${o.picked ? ' checked' : ''}>`;
  return `<div class="c-wrap"><div class="c-row"><label class="opt${o.picked ? ' picked' : ''}">${input} <span>${labels(inline(o.head))}</span></label>`
    + `<button class="c-btn" data-tip="Comment on this option">💬</button></div>`
    + `${threadHtml(o.replies, 'thread opt-thread')}</div>`
    + (o.items.length ? o.items.map((s) => optionHtml(s, name, done)).join('') : '')
    + (done ? '' : '');
}

let uid = 0;
function itemHtml(it: Item): string {
  const [status = '', ...more] = it.glyphs;
  const options = it.items.filter((s) => s.option);
  const closed = CLOSED.includes(status);
  const ask = ASK.includes(status);
  const sevText = more.length ? `${more.join(' ')} ` : '';
  const text = `${sevText}${inline(it.head)}`;
  const key = keyOf(it.glyphs, !closed);
  const radio = options.some((o) => o.option === 'radio');
  const name = `o${++uid}`;
  const opts = options.length
    ? `<div class="opts${closed ? ' done' : ''}${radio ? ' radio' : ''}" data-name="${name}">${options.map((o) => optionHtml(o, name, closed)).join('')}</div>`
    : '';
  const tip = ask ? 'Answer' : 'Reply, or set its stage';

  if (closed) {
    const last = it.replies.at(-1);
    // folded: the answer line is the pick when there are options, else the last reply
    const pick = options.filter((o) => o.picked).map((o) => `${o.option === 'radio' ? '◉' : '☑'} ${labels(inline(o.head))}`).join(' · ');
    const answer = options.length ? (pick ? `<span class="t-a">${pick}</span>` : '') : last ? `<span class="t-a">💬 ${firstLine(last)}</span>` : '';
    return `<details class="settled" data-k="${key}"><summary><span class="g">${glyphButton(status, tip)}</span>`
      + `<span class="t"><span class="t-q">${text}</span>${answer}</span></summary>`
      + `${opts}${threadHtml(it.replies)}</details>`;
  }
  const cls = ['item', ask ? 'wait-me' : '', status === '⁉️' ? 'dis' : '', status === '🔴' || more[0] === '🔴' ? 'sev-h' : '', status === '🔵' ? 'info' : '']
    .filter(Boolean).join(' ');
  const chip = status === '⏳' ? '<span class="btn">waiting on agent</span>' : '';
  return `<li class="${cls}" data-k="${key}"><div class="head c-row"><span class="g">${glyphButton(status, tip)}</span><span>${text}</span>${chip}`
    + `${options.length ? '<button class="c-btn" data-tip="Comment on the question">💬</button>' : ''}</div>`
    + `${opts}${threadHtml(it.replies, 'thread q-thread')}</li>`;
}

function listHtml(items: Item[]): string {
  return `<ul class="items">${items.map(itemHtml).join('')}</ul>`;
}

/** A quote opening with ❓ / ⁉️ / 👉 / ✅ 👉: the question, then its replies. */
function quoteHtml(lines: string[]): string {
  const body = unquote(lines);
  const split = body.findIndex((l, i) => i > 0 && /^💬/u.test(l));
  const q = split < 0 ? body : body.slice(0, split);
  const replies = split < 0 ? [] : parseReplies(body.slice(split));
  const { glyphs, rest } = leadGlyphs(q[0]!);
  const question = [rest, ...q.slice(1)].join('\n').trim();
  const status = glyphs[0]!;
  const request = glyphs.includes('👉');
  const last = replies.at(-1);
  const answered = status === '✅' || (!request && !!last && !last.partial);
  const key = keyOf(glyphs, !answered);

  if (answered) {
    const mark = request ? glyphButton('✅', 'Reply') : `<span class="g g-answered" data-tip="Answered — click to edit the answer">${status === '⁉️' ? '!?' : '?'}</span>`;
    const lead = request ? '👉 ' : '';
    return `<details class="settled" data-k="${key}"><summary>${request ? `<span class="g">${mark}</span>` : mark}`
      + `<span class="t"><span class="t-q">${lead}${inline(question)}</span>${last ? `<span class="t-a">💬 ${firstLine(last)}</span>` : ''}</span></summary>`
      + `${threadHtml(replies)}</details>`;
  }
  if (request) return `<div class="req" data-k="${key}">👉 ${inline(question)}</div>${replies.length ? threadHtml(replies) : ''}`;
  const kind = status === '⁉️' ? 'd' : 'q';
  return `<div class="qwrap" data-k="${key}"><div class="qblock ${kind} hang"><span class="g">${glyphButton(status, 'Answer')}</span><div>${inline(question)}</div></div>`
    + `${replies.length ? threadHtml(replies) : ''}</div>`;
}

// ---------------------------------------------------------------- document

export function renderDoc(src: string): string {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let plain: string[] = [];
  const flush = () => {
    if (plain.join('').trim()) out.push(md.render(plain.join('\n')));
    plain = [];
  };
  for (let i = 0; i < lines.length; ) {
    const line = lines[i]!;
    if (/^>\s?(❓|⁉|👉|✅️?\s+👉)/u.test(line)) {
      flush();
      const q: string[] = [];
      while (i < lines.length && lines[i]!.startsWith('>')) q.push(lines[i++]!);
      out.push(quoteHtml(q));
      continue;
    }
    if (/^[-*+]\s/.test(line)) {
      const block: string[] = [];
      let j = i;
      while (j < lines.length && lines[j]!.trim() && (/^[-*+]\s/.test(lines[j]!) || indentOf(lines[j]!) >= 2)) block.push(lines[j++]!);
      if (leadGlyphs(line.replace(/^[-*+]\s+/, '')).glyphs.length) {
        flush();
        out.push(listHtml(parseList(block)));
        i = j;
        continue;
      }
    }
    plain.push(line);
    i++;
  }
  flush();
  return out.join('\n');
}

if (import.meta.main) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: bun qa-render.ts <file.md>');
    process.exit(2);
  }
  const here = dirname(new URL(import.meta.url).pathname);
  const mock = readFileSync(join(here, '..', 'rendering.html'), 'utf8');
  const css = /<style>([\s\S]*?)<\/style>/.exec(mock)![1];
  const js = readFileSync(join(here, 'qa-page.js'), 'utf8');
  const body = renderDoc(readFileSync(file, 'utf8'));
  const title = /^#\s+(.+)$/m.exec(readFileSync(file, 'utf8'))?.[1] ?? 'Q&A';
  process.stdout.write(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${css}
/* page: a rendered document, not the two-column mock */
main { max-width: 900px; }
main > h1 { margin-bottom: 8px; }
.strip.top { position: sticky; top: 0; z-index: 5; background: var(--bg); padding: 6px 0; margin: 0 0 6px; border-bottom: 1px solid var(--line); }
ul.items { margin: 6px 0 14px; }
.qwrap { margin: 6px 0; }
.qwrap > .thread, .req + .thread { margin-left: 30px; }
.reply p { margin: 0 0 4px; } .reply p:last-child { margin: 0; } .reply ul { margin: 2px 0; padding-left: 20px; }
.item.info { color: var(--dim); }
.filtered [data-k].hide { display: none; }
</style>
</head>
<body>
<main id="doc">
<div class="strip top" id="strip"></div>
${body}
</main>
<script>${js}</script>
</body>
</html>
`);
}
