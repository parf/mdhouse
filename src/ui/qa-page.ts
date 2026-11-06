/**
 * What the page does with the Q&A items qa-html.ts renders: every button is delegated from the
 * document body. Nothing here changes the page itself — an action asks the server for one change
 * to one item (`act`), or opens a form (`open`); the document is then fetched again.
 *
 * A document's own markup can use every class and most attributes, so none of them says what a
 * click means. A node counts only if it carries the render's token (`data-act`), and everything it
 * acts on — item line and hash, option, reply — is read from that node's own `data-act-*`, never
 * from its ancestors or neighbours. What it does follows from the node itself.
 *
 * A control acts only when the click landed on the control itself (`event.target`): nothing the
 * document puts inside or beside it borrows its token. Two containers open their own form when the
 * click lands anywhere in them — an open question's body, a reply — and write nothing.
 */

import type { QaChange } from '../lib/qa';
import type { QaKind } from './QaEditor';

/** The form to open: its item (line and fingerprint as rendered), what it is for, and the line it is about. */
export interface QaTarget {
  line: number;
  hash: string;
  kind: QaKind;
  /** The option, 💡 or reply the form is about (1-based body line). */
  at?: number;
  /** A 💡's form: the button it was opened from. */
  first?: 'yes' | 'no' | 'reply';
  /** A 💡 on an issue: accept / ignore rather than yes / no. */
  issue?: boolean;
}

export interface QaHandlers {
  open(t: QaTarget): void;
  act(line: number, hash: string, change: QaChange): void;
  close(): void;
}

/** What a marked node acts on, as the renderer wrote it on the node. */
export interface Act {
  line: number;
  hash: string;
  /** The item's state glyphs. */
  k: string[];
  sev: string;
  /** The option or reply the node is about (1-based body line). */
  opt?: number;
  reply?: number;
}

const posInt = (v: string | undefined) => (v !== undefined && /^[1-9]\d{0,8}$/.test(v) ? Number(v) : undefined);

/** `node`'s own action data, when it carries `token`; null for any other node. */
export function actOf(node: Element | null | undefined, token: string): Act | null {
  if (!(node instanceof HTMLElement) || !token || node.dataset.act !== token) return null;
  const line = posInt(node.dataset.actLine);
  const hash = node.dataset.actHash ?? '';
  if (line === undefined || !/^[0-9a-f]{4,16}$/.test(hash)) return null;
  return { line, hash, k: (node.dataset.actK ?? '').split(' '), sev: node.dataset.actSev ?? '', opt: posInt(node.dataset.actOpt), reply: posInt(node.dataset.actReply) };
}

/** The marked node a click landed in — the nearest one — with its action data. A click in the document's own markup is inert. */
function markedAt(t: EventTarget | null, token: string): { node: HTMLElement; act: Act } | null {
  const node = (t as Element | null)?.closest?.<HTMLElement>('[data-act]');
  const act = actOf(node, token);
  return node && act ? { node, act } : null;
}

/** The marked nodes of the same item — same line and fingerprint — read through their own data. */
const ofItem = (root: HTMLElement, token: string, a: Act, sel: string) =>
  [...root.querySelectorAll<HTMLElement>(sel)].filter((n) => {
    const x = actOf(n, token);
    return x !== null && x.line === a.line && x.hash === a.hash;
  });

/**
 * The Q&A items on the page, each with the identity of one of its own marked controls: the list item
 * is only where the control stands, what the item is comes from the control.
 */
export function itemsOf(root: HTMLElement, token: string): Array<{ li: HTMLElement; act: Act }> {
  const out = new Map<HTMLElement, Act>();
  for (const n of root.querySelectorAll<HTMLElement>('[data-act]')) {
    const act = actOf(n, token);
    const li = n.closest<HTMLElement>('li.item');
    if (act && li && Number(li.dataset.line) === act.line && !out.has(li)) out.set(li, act);
  }
  return [...out].map(([li, act]) => ({ li, act }));
}

/** A question's form or an issue's: an issue is an item with a severity that does not ask; a 📌 decision takes a reply. */
export function formFor(a: Act): QaTarget {
  const ask = a.k[0] === '❓' || a.k[0] === '⁉️';
  const kind = a.k[0] === '📌' ? 'comment' : !ask && a.sev ? 'finding' : 'question';
  return { line: a.line, hash: a.hash, kind };
}

/** Enable the options of a writable page, and wire every Q&A button. `token` is the render's; returns the cleanup. */
export function wireQa(el: HTMLElement, h: QaHandlers, token: string): () => void {
  for (const input of el.querySelectorAll<HTMLInputElement>('.opt input')) input.disabled = !actOf(input, token);

  const onClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('.qa-edit, .iid')) return;
    const hit = markedAt(t, token);
    if (!hit) return;
    const { node, act: a } = hit;
    const { line, hash } = a;
    // The control itself was clicked, not something inside it.
    const exact = node === t;

    // 🎯 on a line: selected / unselected at once
    if (exact && node.matches('button.tgt')) {
      e.preventDefault();
      e.stopPropagation();
      return h.act(line, hash, { op: 'target' });
    }
    // ✓ done on an any-of question
    if (exact && node.matches('button.c-done')) {
      e.preventDefault();
      return h.act(line, hash, { op: 'done' });
    }
    // 💡: ✓ agree / accept and ✗ cancel / ignore answer at once; 💬 reply opens the form
    if (exact && node.matches('button.accept, button.reject, button.s-reply') && a.reply !== undefined) {
      e.preventDefault();
      if (node.matches('.accept, .reject')) return h.act(line, hash, { op: 'verdict', sug: a.reply, yes: node.matches('.accept') });
      return h.open({ line, hash, kind: 'proposal', at: a.reply, first: 'reply', issue: formFor(a).kind === 'finding' });
    }
    // 💬 at the end of a line: a comment on an option, or on the question
    if (exact && node.matches('button.c-btn')) {
      e.preventDefault();
      return h.open(a.opt !== undefined ? { line, hash, kind: 'option', at: a.opt } : { line, hash, kind: 'comment' });
    }
    // the green ?: a question answered by a pick is unpicked; else its answer is edited
    if (exact && node.matches('span.g-answered')) {
      e.preventDefault();
      const picked = ofItem(el, token, a, 'input[data-act-opt]').find((i) => (i as HTMLInputElement).type === 'radio' && (i as HTMLInputElement).checked);
      const pickedOpt = actOf(picked, token)?.opt;
      if (pickedOpt !== undefined) return h.act(line, hash, { op: 'pick', opt: pickedOpt, on: false });
      const last = ofItem(el, token, a, 'div.reply[data-act-reply]').filter((r) => !r.closest('.opts')).at(-1);
      const at = actOf(last, token)?.reply;
      return h.open(at !== undefined ? { line, hash, kind: 'edit', at } : formFor(a));
    }
    // the first glyph of a line is its button: answer, reply, set the stage
    if (exact && node.matches('span.g-btn')) {
      e.preventDefault();
      return h.open(formFor(a));
    }
    // a click on a reply edits it
    if (node.matches('div.reply') && a.reply !== undefined) {
      if (!t.closest('a')) h.open({ line, hash, kind: 'edit', at: a.reply });
      return;
    }
    // anywhere else on an open question or issue: its form, as its glyph does
    if (node.matches('li.item.wait-me, li.item.finding') && !t.closest('a, input, label, button, .reply, .opts, summary')) h.open(formFor(a));
  };

  // options: a radio pick answers a one-of question; a checkbox ticks
  const onChange = (e: Event) => {
    const input = (e.target as HTMLElement).closest<HTMLInputElement>('.opt input');
    const hit = input && markedAt(input, token);
    if (!input || !hit || hit.node !== input || hit.act.opt === undefined) return;
    input.disabled = true;
    const { line, hash, opt } = { ...hit.act, opt: hit.act.opt };
    h.act(line, hash, input.type === 'radio' ? { op: 'pick', opt, on: true } : { op: 'tick', opt });
  };

  // a double-click on a glyph or on the item's own row selects for the next run — the first click of the two
  // opened the form; a double-click on text inside the item does not (the text may be the document's own)
  const onDblClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('textarea, input, button, a, .qa-edit')) return;
    const hit = markedAt(t, token);
    if (!hit || hit.node !== t || !hit.node.matches('li.item, span.g-btn, span.g-answered')) return;
    e.preventDefault();
    getSelection()?.removeAllRanges();
    h.close();
    h.act(hit.act.line, hit.act.hash, { op: 'target' });
  };

  el.addEventListener('click', onClick);
  el.addEventListener('change', onChange);
  el.addEventListener('dblclick', onDblClick);
  return () => {
    el.removeEventListener('click', onClick);
    el.removeEventListener('change', onChange);
    el.removeEventListener('dblclick', onDblClick);
  };
}

/** A folded item says so when anything is cut or left out: "▾ show all". */
export function markFolded(el: HTMLElement): () => void {
  const mark = () => {
    for (const d of el.querySelectorAll<HTMLDetailsElement>('details.settled')) {
      d.querySelector(':scope > summary > .more')?.remove();
      if (d.open) continue;
      const cut = [...d.querySelectorAll<HTMLElement>(':scope > summary :is(.t-q, .t-a)')].some((x) => x.scrollHeight > x.clientHeight + 1);
      const replies = d.querySelectorAll(':scope > .thread > .reply').length;
      if (!cut && replies < 2 && !d.querySelector(':scope > :is(.opts, ul.items)')) continue;
      const more = document.createElement('span');
      more.className = 'more';
      more.textContent = `▾ show all${replies > 1 ? ` · ${replies} replies` : ''}`;
      d.querySelector(':scope > summary')?.append(more);
    }
  };
  mark();
  el.addEventListener('toggle', mark, true);
  addEventListener('resize', mark);
  return () => {
    el.removeEventListener('toggle', mark, true);
    removeEventListener('resize', mark);
  };
}

/** An issue id in the address (`#B44`): its folded item opened. */
export function openTarget(el: HTMLElement, id: string): void {
  const item = id ? el.querySelector<HTMLElement>(`li.item[data-qa][id="${CSS.escape(id)}"]`) : null;
  const d = item?.querySelector<HTMLDetailsElement>(':scope > details');
  if (d) d.open = true;
}
