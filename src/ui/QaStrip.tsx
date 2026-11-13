import type { RefObject } from 'preact';
import { useEffect, useState } from 'preact/hooks';

/** A phone's strip is one row: its chips sit behind a toggle. */
const COMPACT = '(pointer: coarse) and (max-width: 720px)';
const useCompact = (): boolean => {
  const [on, setOn] = useState(() => matchMedia(COMPACT).matches);
  useEffect(() => {
    const m = matchMedia(COMPACT);
    const change = () => setOn(m.matches);
    m.addEventListener('change', change);
    return () => m.removeEventListener('change', change);
  }, []);
  return on;
};

/** The toggle's words: the whole count when nothing is filtered, else the filtered count out of it. */
export const toggleLabel = (levelKey: string | null, shown: number, total: number): string =>
  levelKey === null || levelKey === 'all' ? `Filter · ${total}` : `${levelKey} ${shown} of ${total}`;

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

  const compact = useCompact();
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [url]);

  if (!counts[0]) return null;
  // A level with nothing in it is left out; a │ stands only between groups that both show.
  const shown = LEVELS.map((l, i) => ({ l, n: counts[i] ?? 0 })).filter(({ l, n }) => l.key === 'all' || n > 0);
  const group = (key: string) => (key === 'all' ? 0 : key === '🎯' ? 2 : 1);
  const pick = (key: string) => {
    setOn(on === key || key === 'all' ? null : key);
    setExpanded(false);
  };
  const chips = shown.map(({ l, n }, i) => (
    <>
      {i > 0 && group(l.key) !== group(shown[i - 1]!.l.key) && !compact && (
        <span class="sep" aria-hidden="true">
          │
        </span>
      )}
      <button type="button" class="chip" aria-pressed={on === l.key && l.key !== 'all'} data-tip={l.tip(n)} onClick={() => pick(l.key)}>
        {l.key === 'all' ? n : `${l.key} ${n}`}
      </button>
    </>
  ));
  if (!compact) {
    return (
      <div class="qa-strip" role="toolbar" aria-label="Filter questions and issues">
        {chips}
      </div>
    );
  }
  const level = LEVELS.findIndex((l) => l.key === on);
  return (
    <div class="qa-strip compact" role="toolbar" aria-label="Filter questions and issues">
      <button type="button" class="chip qa-toggle" aria-expanded={expanded} aria-pressed={on !== null} onClick={() => setExpanded((v) => !v)}>
        {toggleLabel(on, level < 0 ? 0 : (counts[level] ?? 0), counts[0] ?? 0)} <span aria-hidden="true">{expanded ? '▴' : '▾'}</span>
      </button>
      {expanded && <div class="qa-chips">{chips}</div>}
    </div>
  );
}
