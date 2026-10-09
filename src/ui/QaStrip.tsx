import type { RefObject } from 'preact';
import { useEffect, useState } from 'preact/hooks';

/** One item's `data-k`: its glyphs, `open` while not settled, 🎯 when selected. */
const has = (k: string[], ...g: string[]) => k.some((x) => g.includes(x));
const open = (k: string[]) => has(k, 'open');

/** Settled, but not as ✅: rejected, deferred, a 🔵 note. */
const notDone = (k: string[]) => !open(k) && ['🚫', '⏸️', '🔵'].includes(k[0] ?? '');

/** The total, then thresholds — 🔴 ⊂ 🟠 ⊂ ⚪ (every open line) — then ✅ and 🚫 (the closed ones), 📌 decisions and 🎯. */
const LEVELS: Array<{ key: string; test: (k: string[]) => boolean; tip: (n: number) => string }> = [
  { key: 'all', test: () => true, tip: (n) => `Show all ${n}` },
  { key: '🔴', test: (k) => open(k) && has(k, '🔴'), tip: (n) => `High — ${n}` },
  {
    key: '🟠',
    test: (k) => open(k) && (has(k, '🔴', '🟠') || (has(k, '❓', '⁉️') && !has(k, '⚪', '🔵'))),
    tip: (n) => `Medium and up, and ❓ ⁉️ without a severity — ${n}`,
  },
  { key: '⚪', test: open, tip: (n) => `All open — ${n}` },
  { key: '✅', test: (k) => !open(k) && !notDone(k) && !has(k, '📌'), tip: (n) => `Done: ✅, an answered ❓ — ${n}` },
  { key: '🚫', test: notDone, tip: (n) => `Closed, not as ✅: 🚫 ⏸️ 🔵 — ${n}` },
  { key: '📌', test: (k) => k[0] === '📌', tip: (n) => `Decisions — ${n}` },
  { key: '🎯', test: (k) => has(k, '🎯'), tip: (n) => `Selected for the next run — ${n}` },
];

const rowsOf = (el: HTMLElement | null) => [...(el?.querySelectorAll<HTMLElement>('[data-k]') ?? [])];
const keyOf = (r: HTMLElement) => (r.dataset.k ?? '').split(' ');

/**
 * The summary strip over a page with Q&A items: counts by level, and a filter — one level at a
 * time, a second click or the total shows everything. View only: it works on a read-only folder.
 */
export function QaStrip({ body, html, url }: { body: RefObject<HTMLDivElement>; html: string; url: string }) {
  const [counts, setCounts] = useState<number[]>([]);
  const [on, setOn] = useState<string | null>(null);

  useEffect(() => setOn(null), [url]);
  useEffect(() => {
    const keys = rowsOf(body.current).map(keyOf);
    const next = LEVELS.map((l) => keys.filter(l.test).length);
    setCounts(next);
    setOn((cur) => (cur && !next[LEVELS.findIndex((l) => l.key === cur)] ? null : cur));
  }, [html]);
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const level = LEVELS.find((l) => l.key === on);
    el.classList.toggle('qa-filtered', !!level);
    for (const r of rowsOf(el)) r.classList.toggle('qa-hide', !!level && !level.test(keyOf(r)));
  }, [on, html]);

  if (!counts[0]) return null;
  // A level with nothing in it is left out; a │ stands only between groups that both show.
  const shown = LEVELS.map((l, i) => ({ l, n: counts[i] ?? 0 })).filter(({ l, n }) => l.key === 'all' || n > 0);
  const group = (key: string) => (key === 'all' ? 0 : key === '🎯' ? 2 : 1);
  return (
    <div class="qa-strip" role="toolbar" aria-label="Filter questions and issues">
      {shown.map(({ l, n }, i) => (
        <>
          {i > 0 && group(l.key) !== group(shown[i - 1]!.l.key) && (
            <span class="sep" aria-hidden="true">
              │
            </span>
          )}
          <button
            type="button"
            class="chip"
            aria-pressed={on === l.key && l.key !== 'all'}
            data-tip={l.tip(n)}
            onClick={() => setOn(on === l.key || l.key === 'all' ? null : l.key)}
          >
            {l.key === 'all' ? n : `${l.key} ${n}`}
          </button>
        </>
      ))}
    </div>
  );
}
