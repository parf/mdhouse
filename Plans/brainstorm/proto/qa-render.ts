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
// `DECISIONS.md`, `README.md:41` are file names, not hosts
md.linkify.set({ fuzzyLink: false });

// ---------------------------------------------------------------- model

const SEVERITY = ['🔴', '🟠', '⚪', '🔵'];
/** 🎫 is not closed: a ticket requested — the agent files it, then sets ✅ with the ticket's id. */
const CLOSED = ['✅', '🚫', '⏸️'];
const ASK = ['❓', '⁉️'];
const GLYPHS = ['❓', '⁉️', '⏳', '✅', '🚫', '⏸️', '🎫', '⛔', '❌', '⚠️', '👉', '🎯', ...SEVERITY];
/** A glyph as written, with or without its variation selector. */
const norm = (g: string) => g.replace(/️/g, '');
const known = new Map(GLYPHS.map((g) => [norm(g), g]));

/** `who` is the author badge as written: `👤parf`, `👾`. */
/** `suggest`: a 💡 line — a proposed answer; `verdict` ✅ / 🚫 once it is accepted or rejected. */
interface Reply { partial: boolean; suggest: boolean; verdict: '✅' | '🚫' | null; who: string | null; body: string }
interface Item {
  glyphs: string[];
  /** 🎯 — selected for the next run */
  target: boolean;
  head: string;
  option: 'radio' | 'check' | null;
  picked: boolean;
  replies: Reply[];
  items: Item[];
}

/** The glyphs a line opens with (at most three), and the rest of it. */
function leadGlyphs(text: string): { glyphs: string[]; rest: string; target: boolean } {
  const glyphs: string[] = [];
  let rest = text;
  let target = false;
  for (let n = 0; n < 4; n++) {
    const m = /^(\p{Extended_Pictographic}|[⁉⚠⏸])\uFE0F?(?:\s+|$)/u.exec(rest);
    const g = m && known.get(norm(m[0].trim()));
    if (!g) break;
    // 🎯 selects the item for the next run — a flag, not a stage
    if (g === '🎯') target = true;
    else glyphs.push(g);
    rest = rest.slice(m![0].length);
  }
  return { glyphs, rest, target };
}

/** `> 💬 ⚠️ 👤name text` lines, the `>` already off: one reply per 💬. */
function parseReplies(lines: string[]): Reply[] {
  const replies: Reply[] = [];
  for (const line of lines) {
    const m = /^(?:(✅|🚫)\s*)?(💬|💡)\uFE0F?\s*(.*)$/u.exec(line);
    if (m && (!m[1] || m[2] === '💡')) {
      let rest = m[3]!;
      let partial = /^⚠️?\s*/u.test(rest);
      rest = rest.replace(/^⚠️?\s*/u, '');
      // the author: a badge first — `👤parf`, `👾`, `📡slack`, …; the older `👤 **name:**` is read too
      // a name only when glued to the badge (`👤parf`); a bare `👾` is the agent — no name needed
      const who = /^(👤|👥|👾|📡)(?:\s*\*\*([^*]+?):\*\*|([^\s:*]+):?)?\s*/u.exec(rest);
      // "elaborate" asks for more: never an answer, like 💬 ⚠️
      if (/^(?:(?:👤|👥|👾|📡)\S*\s+)?elaborate\b/iu.test(rest)) partial = true;
      // a ⚠️ may follow the badge too: `💬 👤parf ⚠️ …`
      if (who && /^⚠\uFE0F?\s*/u.test(rest.slice(who[0].length))) { partial = true; rest = rest.slice(0, who[0].length) + rest.slice(who[0].length).replace(/^⚠\uFE0F?\s*/u, ''); }
      // a 💡 signed by a person or a team is their answer, not a proposal
      const personal = !!who && /^(👤|👥)/u.test(who[1]!);
      replies.push({ partial, suggest: m[2] === '💡' && !personal, verdict: (m[1] as Reply['verdict']) ?? null, who: who ? `${who[1]}${who[2] ?? who[3] ?? ''}` : null, body: who ? rest.slice(who[0].length) : rest });
    } else if (replies.length) replies.at(-1)!.body += `\n${line}`;
  }
  for (const r of replies) r.body = r.body.replace(/\n+$/, '');
  return replies;
}

/**
 * Badges: a badge glyph glued to a name — `👤parf`, `👥backend`, `👾`, `📡slack`, `🏷️ui`,
 * `📅2026-10-07`, `🎫RLM-412`. With a space after it the glyph is just a glyph (`🎫 …` is a status).
 */
const BADGES: Record<string, string> = { '👤': 'person', '👥': 'team', '👾': 'agent', '📡': 'source', '🏷️': 'tag', '🏷': 'tag', '📅': 'date', '🎫': 'ticket' };
// the name may hold inner dots and dashes (`v1.4.0`, `2026-10-06`), never a trailing `.` `,` `!` …
const BADGE = /(👤|👥|👾|📡|🏷️?|📅|🎫)([^\s<>:,;.!?)&]+(?:[.\-/][^\s<>:,;.!?)&]+)*)/gu;
const badge = (g: string, name: string) => `<span class="who" data-kind="${BADGES[g]}">${g.replace(/^🏷$/, '🏷️')}${name}</span>`;
/** The author chip: a named badge, or a bare one (`👾` — the agent). */
const whoChip = (who: string) => (/^(👤|👥|👾|📡)$/u.test(who) ? `<span class="who" data-kind="${BADGES[who]}">${who}</span>` : badges(esc(who)));
/** Badges in rendered HTML, outside code. */
const badges = (html: string) => html.split(/(<code>[\s\S]*?<\/code>)/).map((part, i) => (i % 2 ? part : part.replace(BADGE, (_, g, n) => badge(g, n)))).join('');

/**
 * A ❓ / ⁉️ is answered when its last 💬 is whole (not ⚠️ / elaborate), not from an agent or a source,
 * and no 💡 under it is still undecided (a plain reply under a 💡 keeps the question open). A picked
 * option `(x)` answers a one-of question; checkboxes are answered by a reply (`done`).
 */
/** The agent's record after acting — `→ DECISIONS.md …`, `` `sha` — … ``, `🎫ID → …` — is not a turn. */
const isRecord = (r: Reply) => /^👾/u.test(r.who ?? '') && /^(→|`[0-9a-f]{7,}`|🎫\S+\s*→)/u.test(r.body.trim());
/** The last turn that counts: not a 💡, not a record. */
const lastTurn = (replies: Reply[]) => replies.filter((r) => !r.suggest && !isRecord(r)).at(-1);

function isAnswered(replies: Reply[], options: Item[] = []): boolean {
  // only the newest 💡 can be undecided — an older one is superseded
  const sug = replies.filter((r) => r.suggest).at(-1);
  if (sug && !sug.verdict) return false;
  const last = lastTurn(replies);
  // a bare `no` decides nothing — it asks for something else
  if (last && /^no\s*$/i.test(last.body.trim())) return false;
  // an agent or a source speaking last asks again — even after a pick
  if (last && /^(👾|📡)/u.test(last.who ?? '')) return false;
  if (options.some((o) => o.option === 'radio' && o.picked)) return true;
  // checkboxes: answered by the item's own `done` (a 💬 under an option is a comment on it)
  if (options.some((o) => o.option === 'check')) return !!last && !last.partial && /^done\b/i.test(last.body);
  return !!last && !last.partial;
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
  const { glyphs, rest, target } = leadGlyphs(text);
  const head = [rest];
  let i = 0;
  while (i < children.length && !/^(>|[-*+]\s)/.test(children[i]!)) head.push(children[i++]!);
  const item: Item = { glyphs, target, head: head.join('\n'), option, picked, replies: [], items: [] };
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
const inline = (s: string) => badges(md.renderInline(s.replace(/\s*\n\s*/g, ' ')));
/** 🌟 / ⭐ in an option's text become labels. */
const labels = (html: string) =>
  html.replace(/\s*🌟/gu, ' <span class="suggest">🌟 suggested</span>').replace(/\s*⭐/gu, ' <span class="suggest">⭐ runner-up</span>');
/** The whole reply as one run of text — a folded item shows its first three lines. */
const firstLine = (r: Reply) => `${r.who ? `${whoChip(r.who)}` : ''}${inline(r.body.replace(/^\s*[-*+]\s+/gm, '• '))}`;
/** A body with paragraphs or a list is rendered as blocks; a run of lines is one inline paragraph. */
const blocky = (body: string) => /\n\s*\n|\n\s*[-*+]\s|\n\s*\d+[.)]\s/.test(body);

function replyHtml(r: Reply, quiet = false): string {
  if (r.suggest && r.verdict) {
    // decided: ✅ 💡 taken, 🚫 💡 turned down — kept, quiet, no buttons
    const who = r.who ? whoChip(r.who) : '';
    return `<div class="reply proposal decided ${r.verdict === '✅' ? 'taken' : 'declined'}">${r.verdict} 💡 ${who}<span class="txt">${inline(r.body)}</span></div>`;
  }
  if (r.suggest && quiet) {
    const who = r.who ? whoChip(r.who) : '';
    return `<div class="reply proposal decided">💡 ${who}<span class="txt">${inline(r.body)}</span></div>`;
  }
  if (r.suggest) {
    const acts = '<span class="s-act"><button class="accept" data-tip="Yes — it is the answer (💡 becomes 💬), with a note if you like">✓ yes</button>'
      + '<button class="reject" data-tip="No — say why; it goes back to the agent">✗ no</button>'
      + '<button class="s-reply" data-tip="Reply — neither yes nor no">💬 reply</button></span>';
    const who = r.who ? whoChip(r.who) : '';
    return `<div class="reply proposal">💡 ${who}<span class="txt">${inline(r.body)}</span>${acts}</div>`;
  }
  const lead = `${r.partial ? '⚠️ ' : ''}${r.who ? whoChip(r.who) : ''}`;
  // a long reply: the author opens its first paragraph rather than standing on a line of its own
  if (blocky(r.body)) return `<div class="reply${r.partial ? ' partial' : ''}">${badges(md.render(r.body)).replace(/^<p>/, `<p>${lead}`)}</div>`;
  return `<div class="reply${r.partial ? ' partial' : ''}">${lead}<span class="txt">${inline(r.body)}</span></div>`;
}
/** `quiet`: a closed item — no 💡 buttons; an older 💡, superseded by a newer one, is always quiet. */
function threadHtml(rs: Reply[], cls = 'thread', quiet = false): string {
  const newest = rs.filter((r) => r.suggest).at(-1);
  return `<div class="${cls}">${rs.map((r) => replyHtml(r, quiet || (r.suggest && r !== newest))).join('')}</div>`;
}

/** What the strip and the filters read: the glyphs, plus `open` for a line not yet settled. */
const keyOf = (glyphs: string[], open: boolean, target = false) => [...glyphs, ...(open ? ['open'] : []), ...(target ? ['🎯'] : [])].join(' ');

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
  const ask = ASK.includes(status);
  // a ❓ / ⁉️ item is answered as a quote one is: its last 💬 is whole (not ⚠️) and from a person —
  // an agent's or a source's reply asks me again
  const answeredAsk = ask && isAnswered(it.replies, options);
  const closed = CLOSED.includes(status) || answeredAsk;
  const sevText = more.length ? `${more.join(' ')} ` : '';
  const text = `${sevText}${inline(it.head)}`;
  const key = keyOf(it.glyphs, !closed, it.target);
  const mark = answeredAsk ? `<span class="g g-answered" data-tip="Answered — click to edit the answer">${status === '⁉️' ? '!?' : '?'}</span>` : null;
  const radio = options.some((o) => o.option === 'radio');
  const name = `o${++uid}`;
  const opts = options.length
    ? `<div class="opts${closed ? ' done' : ''}${radio ? ' radio' : ''}" data-name="${name}">${options.map((o) => optionHtml(o, name, closed)).join('')}</div>`
    : '';
  const tip = ask ? 'Answer' : 'Reply, or set its stage';

  if (closed) {
    const last = lastTurn(it.replies) ?? it.replies.at(-1);
    // folded: the answer line is the pick when there are options, else the last reply
    const pick = options.filter((o) => o.picked).map((o) => `${o.option === 'radio' ? '◉' : '☑'} ${labels(inline(o.head))}`).join(' · ');
    const answer = options.length ? (pick ? `<span class="t-a">${pick}</span>` : '') : last ? `<span class="t-a">💬 ${firstLine(last)}</span>` : '';
    return `<details class="settled" data-k="${key}"><summary>${mark ?? `<span class="g">${glyphButton(status, tip)}</span>`}`
      + `<span class="t"><span class="t-q">${text}</span>${answer}</span><button class="tgt" data-tip="Select for the next run (double-click works too)">🎯</button></summary>`
      + `${opts}${threadHtml(it.replies, 'thread', CLOSED.includes(status))}</details>`;
  }
  const sev = it.glyphs.find((g) => SEVERITY.includes(g));
  // an open finding — a line with a severity — works as an unanswered question does
  // a finding the user triaged (a decided 💡, a pick, their whole 💬): over to the agent, still open
  const touched = ['⏳', '⚠️', '🎫'].includes(status) || options.some((o) => o.picked)
    || it.replies.some((r) => r.verdict || (!r.suggest && !/^(👾|📡)/u.test(r.who ?? '')));
  const triaged = !!sev && !ask && !closed && touched;
  const finding = !!sev && !ask && !triaged;
  const cls = ['item', ask ? 'wait-me' : '', finding ? 'finding' : '', status === '⁉️' ? 'dis' : '', status === '🔴' || more[0] === '🔴' ? 'sev-h' : '', status === '🔵' ? 'info' : '']
    .filter(Boolean).join(' ');
  // checkboxes (any of): ticking does not settle the question — ✓ done does
  const doneBtn = !closed && options.some((o) => o.option === 'check') ? '<button class="c-done" data-tip="Done picking: the question turns ✅">✓ done</button>' : '';
  const chip = status === '🎫' ? '<span class="btn">ticket pending</span>' : status === '⏳' || triaged ? '<span class="btn">waiting on agent</span>' : doneBtn;
  return `<li class="${cls}" data-k="${key}"${sev ? ` data-sev="${sev}"` : ''}><div class="head c-row"><span class="g">${glyphButton(status, tip)}</span><span>${text}</span>${chip}`
    + `${options.length ? '<button class="c-btn" data-tip="Comment on the question">💬</button>' : ''}<button class="tgt" data-tip="Select for the next run (double-click works too)">🎯</button></div>`
    + `${opts}${threadHtml(it.replies, 'thread q-thread')}</li>`;
}

function listHtml(items: Item[]): string {
  return `<ul class="items">${items.map(itemHtml).join('')}</ul>`;
}

/** A quote opening with ❓ / ⁉️ / 👉 / ✅ 👉: the question, then its replies. */
function quoteHtml(lines: string[]): string {
  const body = unquote(lines);
  const split = body.findIndex((l, i) => i > 0 && /^(?:(?:✅|🚫)\s*)?(💬|💡)/u.test(l));
  const q = split < 0 ? body : body.slice(0, split);
  const replies = split < 0 ? [] : parseReplies(body.slice(split));
  const { glyphs, rest, target } = leadGlyphs(q[0]!);
  const question = [rest, ...q.slice(1)].join('\n').trim();
  const status = glyphs[0]!;
  const request = glyphs.includes('👉');
  const last = lastTurn(replies);
  const closed = CLOSED.includes(status);
  const answered = closed || (ASK.includes(status) && isAnswered(replies));
  const key = keyOf(glyphs, !answered, target);

  if (status === '⏳' || status === '🎫') {
    return `<ul class="items"><li class="item" data-k="${key}"><div class="head c-row"><span class="g">${glyphButton(status, 'Reply')}</span><span>${inline(question)}</span><span class="btn">${status === '🎫' ? 'ticket pending' : 'waiting on agent'}</span><button class="tgt" data-tip="Select for the next run (double-click works too)">🎯</button></div>`
      + `${replies.length ? threadHtml(replies, 'thread q-thread') : ''}</li></ul>`;
  }
  if (answered) {
    // a closed one shows its stage glyph; only an answered ❓ / ⁉️ shows the green ?
    const mark = closed ? `<span class="g">${glyphButton(status, 'Reply')}</span>` : `<span class="g g-answered" data-tip="Answered — click to edit the answer">${status === '⁉️' ? '!?' : '?'}</span>`;
    const lead = request ? '👉 ' : '';
    return `<details class="settled" data-k="${key}"><summary>${mark}`
      + `<span class="t"><span class="t-q">${lead}${inline(question)}</span>${last ? `<span class="t-a">💬 ${firstLine(last)}</span>` : ''}</span><button class="tgt" data-tip="Select for the next run (double-click works too)">🎯</button></summary>`
      + `${threadHtml(replies, 'thread', closed)}</details>`;
  }
  if (request) return `<div class="req" data-k="${key}">${glyphButton('👉', 'Reply, or close the request')} ${inline(question)}<button class="tgt" data-tip="Select for the next run (double-click works too)">🎯</button>${replies.length ? threadHtml(replies, 'thread q-thread') : ''}</div>`;
  // the same block a list question gets: one form for every unanswered question
  return `<ul class="items"><li class="item${ASK.includes(status) ? ' wait-me' : ''}${status === '⁉️' ? ' dis' : ''}" data-k="${key}"><div class="head c-row"><span class="g">${glyphButton(status, 'Answer')}</span><span>${inline(question)}</span><button class="tgt" data-tip="Select for the next run (double-click works too)">🎯</button></div>`
    + `${replies.length ? threadHtml(replies, 'thread q-thread') : ''}</li></ul>`;
}

// ---------------------------------------------------------------- document

export function renderDoc(src: string): string {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let plain: string[] = [];
  const flush = () => {
    if (plain.join('').trim()) out.push(badges(md.render(plain.join('\n'))));
    plain = [];
  };
  for (let i = 0; i < lines.length; ) {
    const line = lines[i]!;
    if (/^>\s?(🎯\s*)?(❓|⁉|👉|✅|🚫|⏸|🎫|⏳|⛔|❌|⚠)/u.test(line)) {
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

/**
 * Who "me" is, for the 👤me checkbox: `--me <name>` (in mdhouse: `"me"` in prefs.json settings)
 * overrides; else git — the local part of user.email, which is one word as a badge name must be,
 * else user.name without its spaces.
 */
function whoAmI(dir: string, override?: string): string {
  if (override) return override;
  const git = (key: string) => Bun.spawnSync(['git', '-C', dir, 'config', key]).stdout.toString().trim();
  const email = git('user.email');
  return email ? email.split('@')[0]! : git('user.name').replace(/\s+/g, '') || 'me';
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--me');
  const meArg = at >= 0 ? args.splice(at, 2)[1] : undefined;
  const file = args[0];
  if (!file) {
    console.error('usage: bun qa-render.ts <file.md> [--me <name>]');
    process.exit(2);
  }
  const me = whoAmI(dirname(file), meArg);
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
ul.items { margin: 0; }
/* the gap after a run of items, before ordinary text */
ul.items + :not(ul):not(details), details.settled + :not(ul):not(details) { margin-top: 14px; }
.qwrap { margin: 6px 0; }
.qwrap > .thread, .req + .thread { margin-left: 30px; }
.reply p { margin: 0 0 4px; } .reply p:last-child { margin: 0; } .reply ul { margin: 2px 0; padding-left: 20px; }
.item.info { color: var(--dim); }
/* 🎯 selected for the next run: bold red bars left and right, and its 🎯 lit */
[data-k~="🎯"] { box-shadow: inset 4px 0 0 #e5383b, inset -4px 0 0 #e5383b !important;
  background: color-mix(in srgb, #fd7e14 14%, var(--bg)) !important; }
/* the 🎯 button on every line: a click selects / unselects at once — no form */
.item, details.settled, .req { position: relative; }
.item > .head, details.settled > summary, .req { padding-right: 26px; }
.tgt { position: absolute; right: 6px; top: 3px; border: 0; background: none; padding: 0 2px; font-size: 14px;
  cursor: pointer; opacity: 0; filter: grayscale(1); }
.item:hover > .head .tgt, details.settled:hover > summary .tgt, .req:hover .tgt, .tgt:focus { opacity: .55; }
[data-k~="🎯"] .tgt { opacity: 1 !important; filter: none; }
/* 💡 a suggested answer: blue, with accept / edit */
.reply.proposal { background: var(--pick-bg); border-left-color: var(--pick); }
.s-act { display: flex; gap: 8px; margin: 0; padding: 8px 0 2px; }
.s-act button { font-size: 13px; padding: 2px 12px; border-radius: 10px; border: 1px solid var(--pick); background: var(--panel); color: var(--pick); cursor: pointer; position: relative; }
.s-act button.accept { background: var(--a); border-color: var(--a); color: #fff; }
.s-act button.reject { border-color: var(--q); color: var(--q); }
.reply.proposal.decided { opacity: .75; }
.reply.proposal.declined .txt { text-decoration: line-through; text-decoration-color: var(--muted); }
/* folded: three lines of the question, three of the answer; anything cut shows "▾ show all" */
details.settled:not([open]) .t-q, details.settled:not([open]) .t-a {
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
details.settled > summary::after { content: none; }
.more { grid-column: 2; justify-self: start; margin-top: 2px; font-size: 12px; color: var(--pick);
  border: 1px solid var(--line); border-radius: 10px; padding: 0 8px; background: var(--panel); }
details.settled[open] .more { display: none; }
/* every line: the glyph in a column of its own, the same as a folded one */
.item > .head { display: grid; grid-template-columns: 1.6em minmax(0, 1fr) auto auto; column-gap: 4px; align-items: start; }
.item > .head > .g { text-align: center; }
/* the editor bar: actions on the left, "👤me" at the far right */
.c-edit .bar, .f-edit .bar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.bar .sign { margin-left: auto; font-size: 12px; color: var(--dim); display: inline-flex; gap: 4px; align-items: center; cursor: pointer; position: relative; }
/* an unanswered question: a lighter red, and a 1px reddish line on the left (inset — nothing moves) */
.item.wait-me { background: color-mix(in srgb, var(--q-bg) 55%, var(--bg)); box-shadow: inset 1px 0 0 color-mix(in srgb, var(--q) 45%, transparent); }
.item.wait-me.dis { background: color-mix(in srgb, var(--dis-bg) 55%, var(--bg)); box-shadow: inset 1px 0 0 color-mix(in srgb, var(--dis) 45%, transparent); }
/* an unanswered question: its ❓ / ⁉️ always looks like a button — a light frame; hover makes it full */
.item.wait-me > .head .g-btn { border-color: color-mix(in srgb, var(--q) 35%, transparent); background: color-mix(in srgb, var(--panel) 60%, transparent); }
.item.wait-me.dis > .head .g-btn { border-color: color-mix(in srgb, var(--dis) 35%, transparent); }
.item.wait-me > .head .g-btn:hover { border-color: var(--q); background: var(--panel); }
.item.wait-me.dis > .head .g-btn:hover { border-color: var(--dis); }
/* an open finding: its first glyph always framed, in its severity's colour; a click anywhere opens the form */
.item.finding { cursor: pointer; }
.item.finding .reply, .item.finding .opts, .item.finding textarea { cursor: auto; }
.item.finding > .head .g-btn { border-color: color-mix(in srgb, var(--dim) 35%, transparent); background: color-mix(in srgb, var(--panel) 60%, transparent); }
.item.finding[data-sev="🔴"] > .head .g-btn { border-color: color-mix(in srgb, var(--q) 40%, transparent); }
.item.finding[data-sev="🟠"] > .head .g-btn { border-color: color-mix(in srgb, var(--dis) 40%, transparent); }
.item.finding > .head .g-btn:hover { border-color: var(--dim); background: var(--panel); }
.item.finding[data-sev="🔴"] > .head .g-btn:hover { border-color: var(--q); }
.item.finding[data-sev="🟠"] > .head .g-btn:hover { border-color: var(--dis); }
.item.finding:hover { background: color-mix(in srgb, var(--code-bg) 70%, transparent); }
/* an open 🔴 / 🟠 finding: the question's look — a light tint and a 1px line on the left, in its colour */
.item.finding[data-sev="🔴"] { background: color-mix(in srgb, var(--q-bg) 55%, var(--bg)); box-shadow: inset 1px 0 0 color-mix(in srgb, var(--q) 45%, transparent); }
.item.finding[data-sev="🟠"] { background: color-mix(in srgb, var(--dis-bg) 55%, var(--bg)); box-shadow: inset 1px 0 0 color-mix(in srgb, var(--dis) 45%, transparent); }
.item.finding[data-sev="🔴"]:hover { background: color-mix(in srgb, var(--q-bg) 85%, var(--bg)); }
.item.finding[data-sev="🟠"]:hover { background: color-mix(in srgb, var(--dis-bg) 85%, var(--bg)); }
/* an unanswered question opens its form on a click anywhere on it */
.item.wait-me { cursor: pointer; }
.item.wait-me .reply, .item.wait-me .opts, .item.wait-me textarea { cursor: auto; }
/* a tooltip sits under its own element — every element with one is its anchor */
[data-tip] { position: relative; }
/* near the right edge it opens leftwards */
.bar .sign[data-tip]:hover::after, .bar > :last-child[data-tip]:hover::after { left: auto; right: 0; }
/* a settled question reads quiet grey, not red; its answer keeps its green */
.t-q { color: var(--dim); }
.t-a { margin-top: 3px; }
/* ✓ done on an any-of question */
.c-done { flex: none; font-size: 12px; padding: 1px 10px; border-radius: 10px; border: 1px solid var(--a); background: var(--panel); color: var(--a); cursor: pointer; }
.c-done:hover { background: var(--a); color: #fff; }
/* blocks: tighter inside, a gap between them */
.item, details.settled { padding: 3px 8px; margin: 0 0 6px; }
.thread:empty { display: none; }
/* 🎫 without a name: the textarea says what is missing */
.c-edit.need textarea, .f-edit.need textarea { border-color: var(--q); box-shadow: 0 0 0 2px color-mix(in srgb, var(--q) 25%, transparent); }
/* an editor never inherits a bold line */
.c-edit, .f-edit { font-weight: 400; }
/* the action's number — Alt+number presses it */
.bar .n { font: 600 10px/1 ui-monospace, monospace; color: var(--dim); border: 1px solid var(--line); border-radius: 3px; padding: 1px 3px; margin-right: 1px; }
/* a compact bar: less side padding, smaller gaps */
.c-edit .bar, .f-edit .bar { gap: 4px; }
.c-edit button, .f-edit button { padding: 1px 5px; }
/* an editor starts where the text does */
.item > .c-edit, .item > .f-edit, details > .c-edit, details > .f-edit { margin: 6px 0 2px calc(1.6em + 4px); }
/* badges: one chip shape, a tint per kind */
.who[data-kind="agent"] { background: #f3e8ff; border-color: #c084fc; color: #6b21a8; }
.who[data-kind="team"] { background: #e0f2fe; border-color: #7dd3fc; color: #075985; }
.who[data-kind="source"] { background: #ecfeff; border-color: #67e8f9; color: #155e75; }
.who[data-kind="ticket"] { background: #fff7ed; border-color: #fdba74; color: #9a3412; }
.who[data-kind="tag"], .who[data-kind="date"] { font-weight: 400; color: var(--dim); }
@media (prefers-color-scheme: dark) {
  .who[data-kind="agent"] { background: #2e1065; border-color: #7e22ce; color: #e9d5ff; }
  .who[data-kind="team"] { background: #082f49; border-color: #0369a1; color: #bae6fd; }
  .who[data-kind="source"] { background: #083344; border-color: #0e7490; color: #a5f3fc; }
  .who[data-kind="ticket"] { background: #431407; border-color: #c2410c; color: #fed7aa; }
}
.who { margin-right: 6px; }
.filtered [data-k].hide { display: none; }
</style>
</head>
<body>
<main id="doc" data-me="${esc(me)}">
<div class="strip top" id="strip"></div>
${body}
</main>
<script>${js}</script>
</body>
</html>
`);
}
