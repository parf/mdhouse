/**
 * What the page does with the Q&A items qa-html.ts renders: every button is delegated from the
 * document body. Nothing here changes the page itself — an action asks the server for one change
 * to one item (`act`), or opens a form (`open`); the document is then fetched again.
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

const lineOf = (el: Element | null | undefined) => Number((el as HTMLElement | null)?.dataset.line ?? 0);
const itemOf = (el: Element) => el.closest<HTMLElement>('[data-qa]');
/** The item's own part of the page — not an item nested in it. */
const own = (item: HTMLElement, sel: string) => [...item.querySelectorAll<HTMLElement>(sel)].filter((x) => itemOf(x) === item);

/** A question's form or an issue's: an issue is an item with a severity that does not ask. */
export function formFor(item: HTMLElement): QaTarget {
  const k = (item.dataset.k ?? '').split(' ');
  const ask = k[0] === '❓' || k[0] === '⁉️';
  return { line: lineOf(item), hash: item.dataset.hash ?? '', kind: !ask && item.dataset.sev ? 'finding' : 'question' };
}

/** Enable the options of a writable page, and wire every Q&A button. Returns the cleanup. */
export function wireQa(el: HTMLElement, h: QaHandlers): () => void {
  for (const input of el.querySelectorAll<HTMLInputElement>('.opt input')) input.disabled = false;

  const onClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('.qa-edit, .iid')) return;
    const item = itemOf(t);
    if (!item) return;
    const line = lineOf(item);
    const hash = item.dataset.hash ?? '';

    // 🎯 on a line: selected / unselected at once
    if (t.closest('.tgt')) {
      e.preventDefault();
      e.stopPropagation();
      return h.act(line, hash, { op: 'target' });
    }
    // ✓ done on an any-of question
    if (t.closest('.c-done')) {
      e.preventDefault();
      return h.act(line, hash, { op: 'done' });
    }
    // 💡: ✓ agree / accept and ✗ cancel / ignore answer at once; 💬 reply opens the form
    const sAct = t.closest<HTMLElement>('.s-act button');
    if (sAct) {
      e.preventDefault();
      const sug = lineOf(sAct.closest('.reply'));
      if (sAct.matches('.accept, .reject')) return h.act(line, hash, { op: 'verdict', sug, yes: sAct.matches('.accept') });
      return h.open({ line, hash, kind: 'proposal', at: sug, first: 'reply', issue: formFor(item).kind === 'finding' });
    }
    // 💬 at the end of a line: a comment on an option, or on the question
    const cBtn = t.closest('.c-btn');
    if (cBtn) {
      e.preventDefault();
      const wrap = cBtn.closest('.c-wrap');
      return h.open(wrap ? { line, hash, kind: 'option', at: lineOf(wrap) } : { line, hash, kind: 'comment' });
    }
    // the green ?: a question answered by a pick is unpicked; else its answer is edited
    if (t.closest('.g-answered')) {
      e.preventDefault();
      const picked = own(item, '.opts.radio .c-wrap').find((w) => w.querySelector('.opt.picked'));
      if (picked) return h.act(line, hash, { op: 'pick', opt: lineOf(picked), on: false });
      const last = own(item, ':scope > details > .thread > .reply:not(.proposal):not(.record), :scope > .thread > .reply:not(.proposal):not(.record)').at(-1);
      return h.open(last ? { line, hash, kind: 'edit', at: lineOf(last) } : formFor(item));
    }
    // the first glyph of a line is its button: answer, reply, set the stage
    if (t.closest('.g-btn')) {
      e.preventDefault();
      return h.open(formFor(item));
    }
    // a click on a reply edits it
    const reply = t.closest<HTMLElement>('.reply');
    if (reply && !reply.matches('.proposal, .record') && !t.closest('a')) {
      return h.open({ line, hash, kind: 'edit', at: lineOf(reply) });
    }
    // anywhere else on an open question or issue: its form, as its glyph does
    if (item.matches('.wait-me, .finding') && !t.closest('a, input, label, button, .reply, .opts, summary')) h.open(formFor(item));
  };

  // options: a radio pick answers a one-of question; a checkbox ticks
  const onChange = (e: Event) => {
    const input = (e.target as HTMLElement).closest<HTMLInputElement>('.opt input');
    const item = input && itemOf(input);
    if (!input || !item) return;
    input.disabled = true;
    const opt = lineOf(input.closest('.c-wrap'));
    h.act(lineOf(item), item.dataset.hash ?? '', input.type === 'radio' ? { op: 'pick', opt, on: true } : { op: 'tick', opt });
  };

  // a double-click selects for the next run — the first click of the two opened the form
  const onDblClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('textarea, input, button, a, .qa-edit')) return;
    const item = itemOf(t);
    if (!item) return;
    e.preventDefault();
    getSelection()?.removeAllRanges();
    h.close();
    h.act(lineOf(item), item.dataset.hash ?? '', { op: 'target' });
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
  const item = id ? el.querySelector<HTMLElement>(`[data-qa][id="${CSS.escape(id)}"]`) : null;
  const d = item?.querySelector<HTMLDetailsElement>(':scope > details');
  if (d) d.open = true;
}
