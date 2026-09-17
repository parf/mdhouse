import type { FileDiff } from '../lib/git';

/**
 * Lay a diff over the *rendered* document: the whole file, in its markdown styling, with the
 * parts that changed picked out.
 *
 * This is what `data-line` was built for. Every block the renderer emits carries the source
 * line it came from, so an added line number can be matched to the paragraph, heading or list
 * item that contains it, and a deleted run can be put back where it used to sit.
 *
 * Granularity is the deepest block that owns the line: a list item rather than the whole list,
 * a table row rather than the whole table. Each element's span runs from its own line to the
 * line of the next element in document order, which is why the nested one wins.
 *
 * Returns a function that puts the document back exactly as it was.
 */
/** A run of deleted lines, and the new-side line it sat in front of. */
export interface Removal {
  at: number;
  text: string;
}

/**
 * The diff, restated as positions in the new file: which lines are new, and where each run of
 * deleted lines used to be.
 *
 * Deletions pile up until something on the new side says where they sat — a hunk that ends in
 * deletions puts them just past the last line it showed.
 */
export function changesOf(diff: FileDiff): { added: number[]; removals: Removal[] } {
  const added: number[] = [];
  const removals: Removal[] = [];

  for (const hunk of diff.hunks) {
    let pending: string[] = [];
    let at = hunk.lines.find((l) => l.b !== undefined)?.b ?? 1;

    for (const line of hunk.lines) {
      if (line.t === '-') {
        pending.push(line.text);
        continue;
      }
      at = line.b!;
      if (pending.length) {
        removals.push({ at, text: pending.join('\n') });
        pending = [];
      }
      if (line.t === '+') added.push(at);
    }
    if (pending.length) removals.push({ at: at + 1, text: pending.join('\n') });
  }

  return { added, removals };
}

export function markChanges(body: HTMLElement, diff: FileDiff, lineOffset: number): () => void {
  const blocks = [...body.querySelectorAll<HTMLElement>('[data-line]')]
    // `data-line` counts from 1 within the body; the file may start with front matter.
    .map((el) => ({ el, line: Number(el.dataset.line) + lineOffset }))
    .filter((b) => Number.isFinite(b.line))
    .sort((a, b) => a.line - b.line);

  /** The last block that starts at or before `line` — the one the line belongs to. */
  const owner = (line: number): HTMLElement | null => {
    let lo = 0;
    let hi = blocks.length - 1;
    let found: HTMLElement | null = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (blocks[mid]!.line <= line) {
        found = blocks[mid]!.el;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return found;
  };

  const touched = new Set<HTMLElement>();
  const inserted: HTMLElement[] = [];
  const { added, removals } = changesOf(diff);

  for (const line of added) {
    const el = owner(line);
    if (el) {
      el.classList.add('chg-add');
      touched.add(el);
    }
  }

  for (const gone of removals) {
    const block = document.createElement('div');
    const count = gone.text.split('\n').length;
    block.className = 'chg-del';
    block.title = `${count} line${count > 1 ? 's' : ''} removed here`;
    block.textContent = gone.text;

    // It sat before whatever now starts there; failing that, at the very end of the document.
    const next = blocks.find((b) => b.line >= gone.at);
    if (next) next.el.before(block);
    else body.append(block);
    inserted.push(block);
  }

  return () => {
    for (const el of touched) el.classList.remove('chg-add');
    for (const el of inserted) el.remove();
  };
}
