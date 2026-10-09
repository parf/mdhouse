/**
 * Q&A items as HTML — the markup of doc/qa.md, as qa.ts parses it. Every item carries its first
 * line (`data-line`), the fingerprint of its lines (`data-hash`) and what the strip filters on
 * (`data-k`); every reply, option and 💡 its own line, so a change on the page names exactly what it
 * is about. Buttons are always written; the client enables them in a writable folder.
 */

import { ASK, CLOSED, DECISION, ITEM_ID, isIssue, isRecord, lastTurn, stateOf, type QaItem, type QaNode, type Reply } from './qa';

/** How the document renders a span of Markdown (inline) and a block — with its own links and code. */
export interface QaRender {
  inline(src: string): string;
  block(src: string): string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Badges: a badge glyph glued to a name — `👤parf`, `👥backend`, `👾`, `📡slack`, `🏷️ui`,
 * `📅2026-10-07`, `🎫RLM-412`. With a space after it the glyph is just a glyph (`🎫 …` is a stage).
 */
const BADGES: Record<string, string> = { '👤': 'person', '👥': 'team', '👾': 'agent', '📡': 'source', '🏷️': 'tag', '🏷': 'tag', '📅': 'date', '🎫': 'ticket' };
// the name may hold inner dots and dashes (`v1.4.0`, `2026-10-06`), never a trailing `.` `,` `!` …
const BADGE = /(👤|👥|👾|📡|🏷️?|📅|🎫)([^\s<>:,;.!?)&"]+(?:[.\-/][^\s<>:,;.!?)&"]+)*)/gu;
const badge = (g: string, name: string) => `<span class="who" data-kind="${BADGES[g]}">${g.replace(/^🏷$/, '🏷️')}${name}</span>`;
/** Badges in rendered HTML: in text only — not in code, not inside a tag. */
export const badges = (html: string) =>
  html
    .split(/(<code[\s\S]*?<\/code>|<[^>]+>)/)
    .map((part, i) => (i % 2 ? part : part.replace(BADGE, (_, g: string, n: string) => badge(g, n))))
    .join('');
/** The author chip: a named badge, or a bare one (`👾` — the agent). */
const whoChip = (who: string) => (/^(👤|👥|👾|📡)$/u.test(who) ? `<span class="who" data-kind="${BADGES[who]}">${who}</span>` : badges(esc(who)));

/** 🌟 / ⭐ in an option's text become labels. */
const labels = (html: string) =>
  html.replace(/\s*🌟/gu, ' <span class="suggest">🌟 suggested</span>').replace(/\s*⭐/gu, ' <span class="suggest">⭐ runner-up</span>');
/** A body with paragraphs or a list is rendered as blocks; a run of lines is one inline paragraph. */
const blocky = (body: string) => /\n\s*\n|\n\s*[-*+]\s|\n\s*\d+[.)]\s|\n\s*(```|~~~)/.test(body);

const TGT = '<button class="tgt" type="button" data-tip="Select for the next run (double-click works too)">🎯</button>';

function glyphButton(g: string, tip: string): string {
  const cls = ASK.includes(g) ? (g === '⁉️' ? ' dis' : '') : ' sev';
  return `<span class="g-btn${cls}" role="button" data-tip="${esc(tip)}">${g}</span>`;
}

export function qaHtml(r: QaRender) {
  /** One run of text; a `\` that ends it is a line break at a line that ends anyway — dropped. */
  const inline = (s: string) => badges(r.inline(s.replace(/\s*\n\s*/g, ' ').replace(/[ \t]*\\$/, '')));
  /** The whole reply as one run of text — a folded item shows its first lines. */
  const firstLine = (rep: Reply) => `${rep.who ? whoChip(rep.who) : ''}${inline(rep.body.replace(/^\s*[-*+]\s+/gm, '• '))}`;

  /** `issue`: the 💡 of an issue is accepted or ignored; a question's is answered yes or no. */
  function replyHtml(rep: Reply, quiet: boolean, issue = false): string {
    const line = ` data-line="${rep.start + 1}"`;
    const who = rep.who ? whoChip(rep.who) : '';
    if (rep.suggest && rep.verdict) {
      return `<div class="reply proposal decided ${rep.verdict === '✅' ? 'taken' : 'declined'}"${line}>${rep.verdict} 💡 ${who}<span class="txt">${inline(rep.body)}</span></div>`;
    }
    if (rep.suggest && quiet) return `<div class="reply proposal decided"${line}>💡 ${who}<span class="txt">${inline(rep.body)}</span></div>`;
    if (rep.suggest) {
      const acts =
        (issue
          ? '<span class="s-act"><button class="accept" type="button" data-tip="Accept the solution — the agent does it">✓ accept</button>' +
            '<button class="reject" type="button" data-tip="Ignore — the issue is closed 🚫">✗ ignore</button>'
          : '<span class="s-act"><button class="accept" type="button" data-tip="Agree — it is the answer">✓ agree</button>' +
            '<button class="reject" type="button" data-tip="Cancel — the question is closed 🚫">✗ cancel</button>') +
        `<button class="s-reply" type="button" data-tip="Reply — a form: a reply, or ${issue ? 'accept / ignore' : 'agree / cancel'} with a note">💬 reply</button></span>`;
      return `<div class="reply proposal"${line}>💡 ${who}<span class="txt">${inline(rep.body)}</span>${acts}</div>`;
    }
    const cls = `reply${rep.partial ? ' partial' : ''}${isRecord(rep) ? ' record' : ''}`;
    const lead = `${rep.partial && !/^elaborate\b/i.test(rep.body) ? '⚠️ ' : ''}${who}`;
    // a long reply: the author opens its first paragraph rather than standing on a line of its own
    if (blocky(rep.body)) return `<div class="${cls}"${line}>${badges(r.block(rep.body)).replace(/^<p([^>]*)>/, `<p$1>${lead}`)}</div>`;
    return `<div class="${cls}"${line}>${lead}<span class="txt">${inline(rep.body)}</span></div>`;
  }

  /** `quiet`: a closed item — no 💡 buttons; an older 💡, superseded by a newer one, is always quiet. */
  function threadHtml(rs: Reply[], cls: string, quiet = false, issue = false): string {
    if (!rs.length) return '';
    const newest = rs.filter((x) => x.suggest).at(-1);
    return `<div class="${cls}">${rs.map((x) => replyHtml(x, quiet || (x.suggest && x !== newest), issue)).join('')}</div>`;
  }

  function optionHtml(o: QaNode, name: string): string {
    const input = `<input type="${o.option === 'radio' ? 'radio' : 'checkbox'}" name="${name}"${o.picked ? ' checked' : ''} disabled>`;
    return (
      `<div class="c-wrap" data-line="${o.start + 1}"><div class="c-row"><label class="opt${o.picked ? ' picked' : ''}">${input} <span>${labels(inline(o.head))}</span></label>` +
      `<button class="c-btn" type="button" data-tip="Comment on this option">💬</button></div>` +
      `${threadHtml(o.replies, 'thread opt-thread')}</div>`
    );
  }

  /** The claim: an issue id first (`B44`) is the item's anchor, a link to itself; Evidence / Impact on lines of their own. */
  function text(node: QaNode, more: string[]): { html: string; id: string | null } {
    const [claim = '', ...meta] = node.head.split(/\n(?=\s*(?:Evidence|Impact):)/);
    const id = ITEM_ID.exec(claim)?.[1] ?? null;
    const claimHtml = id ? `<a class="iid" href="#${id}">${id}</a>${inline(claim.slice(id.length))}` : inline(claim);
    const metaHtml = meta.map((m) => `<span class="meta">${inline(m.trim())}</span>`).join('');
    const cases = node.children.filter((c) => c.kind === 'case');
    const casesHtml = cases.length ? `<ul class="cases">${cases.map((c) => `<li data-line="${c.start + 1}">${inline(c.head)}</li>`).join('')}</ul>` : '';
    const context = node.context.map((c) => `<blockquote class="context">${r.block(c)}</blockquote>`).join('');
    return { html: `${more.length ? `${more.join(' ')} ` : ''}${claimHtml}${metaHtml}${casesHtml}${context}`, id };
  }

  /**
   * A 📌 decision: its first line the title (an id first is its anchor), the lines after it the body.
   * A `🚫` item under it is a rejected alternative — a muted line, not an item of its own.
   */
  function decisionHtml(item: QaItem, attrs: string, nested: QaItem[], opts: string): string {
    const [title = '', ...rest] = item.head.split('\n');
    const id = ITEM_ID.exec(title)?.[1] ?? null;
    const titleHtml = id ? `<a class="iid" href="#${id}">${id}</a>${inline(title.slice(id.length))}` : inline(title);
    const body = rest.join('\n').trim();
    const bodyHtml = body ? `<div class="d-body">${blocky(body) ? badges(r.block(body)) : inline(body)}</div>` : '';
    const cases = item.children.filter((c) => c.kind === 'case');
    const casesHtml = cases.length ? `<ul class="cases">${cases.map((c) => `<li data-line="${c.start + 1}">${inline(c.head)}</li>`).join('')}</ul>` : '';
    const context = item.context.map((c) => `<blockquote class="context">${r.block(c)}</blockquote>`).join('');
    const kids = nested.map((n) =>
      n.glyphs[0] === '🚫'
        ? `<li class="rejected" data-line="${n.start + 1}"><span class="g">🚫</span><span class="t">${inline(n.head)}</span>${threadHtml(n.replies, 'thread', true)}</li>`
        : itemHtml(n),
    );
    return (
      `<li class="item decision"${attrs}><div class="head c-row"><span class="g">${glyphButton(DECISION, 'Reply')}</span>` +
      `<span class="h-t"><span class="d-title">${titleHtml}</span>${bodyHtml}${casesHtml}${context}</span>${TGT}</div>` +
      `${opts}${threadHtml(item.replies, 'thread q-thread')}${kids.length ? `<ul class="items alts">${kids.join('')}</ul>` : ''}</li>`
    );
  }

  let uid = 0;

  /** One item, as a list item of its own list: `<li class="item …">`. */
  function itemHtml(item: QaItem): string {
    const st = stateOf(item);
    const [status = '', ...more] = item.glyphs;
    const ask = ASK.includes(status);
    const { html, id } = text(item, more);
    const options = item.children.filter((c) => c.option);
    const radio = options.some((o) => o.option === 'radio');
    const name = `qa-o${++uid}`;
    const opts = options.length
      ? `<div class="opts${st.closed || st.decision || (radio && options.some((o) => o.picked)) ? ' done' : ''}${radio ? ' radio' : ''}">${options.map((o) => optionHtml(o, name)).join('')}</div>`
      : '';
    const nested = item.children.filter((c) => c.kind === 'item') as QaItem[];
    const nestedHtml = nested.length ? `<ul class="items">${nested.map(itemHtml).join('')}</ul>` : '';
    const tip = ask ? 'Answer' : 'Reply, or set its stage';
    const attrs =
      ` data-qa="${item.kind}" data-line="${item.start + 1}" data-hash="${item.hash}" data-k="${esc(st.key)}"` +
      `${st.severity ? ` data-sev="${st.severity}"` : ''}${id ? ` id="${id}"` : ''}`;

    if (st.decision) return decisionHtml(item, attrs, nested, opts);
    if (st.closed) {
      const last = lastTurn(item.replies) ?? item.replies.at(-1);
      // folded: the answer line is the pick when there are options, else the last reply
      const pick = options
        .filter((o) => o.picked)
        .map((o) => `${o.option === 'radio' ? '◉' : '☑'} ${labels(inline(o.head))}`)
        .join(' · ');
      const answer = options.length ? (pick ? `<span class="t-a">${pick}</span>` : '') : last ? `<span class="t-a">💬 ${firstLine(last)}</span>` : '';
      const mark = st.answered
        ? `<span class="g g-answered" role="button" data-tip="Answered — click to edit the answer">${status === '⁉️' ? '!?' : '?'}</span>`
        : `<span class="g">${glyphButton(st.ignored ? '🚫' : status, tip)}</span>`;
      return (
        `<li class="item settled${status === '🔵' ? ' info' : ''}"${attrs}><details class="settled"><summary>${mark}` +
        `<span class="t"><span class="t-q">${html}</span>${answer}</span>${TGT}</summary>` +
        `${opts}${threadHtml(item.replies, 'thread', CLOSED.includes(status) || status === '🔵')}${nestedHtml}</details></li>`
      );
    }
    const cls = [
      'item',
      st.waitMe ? 'wait-me' : '',
      st.finding ? 'finding' : '',
      status === '⁉️' ? 'dis' : '',
      st.severity === '🔴' ? 'sev-h' : '',
    ]
      .filter(Boolean)
      .join(' ');
    // checkboxes (any of): ticking does not settle the question — ✓ done does
    const doneBtn = options.some((o) => o.option === 'check')
      ? '<button class="c-done" type="button" data-tip="Done picking: answers the question">✓ done</button>'
      : '';
    const chip = status === '🎫' ? '<span class="btn">ticket pending</span>' : status === '⏳' || st.triaged ? '<span class="btn">waiting on agent</span>' : doneBtn;
    return (
      `<li class="${cls}"${attrs}><div class="head c-row"><span class="g">${glyphButton(status || '🎯', tip)}</span><span class="h-t">${html}</span>${chip}` +
      `${options.length ? '<button class="c-btn" type="button" data-tip="Comment on the question">💬</button>' : ''}${TGT}</div>` +
      `${opts}${threadHtml(item.replies, 'thread q-thread', false, isIssue(item))}${nestedHtml}</li>`
    );
  }

  /** A standalone thread — `> 💬 …` with no question over it: shown as replies, nothing to answer. */
  function looseThread(replies: Reply[], line: number): string {
    return `<div class="thread loose" data-line="${line}">${replies.map((x) => replyHtml(x, true)).join('')}</div>`;
  }

  return { itemHtml, looseThread };
}
