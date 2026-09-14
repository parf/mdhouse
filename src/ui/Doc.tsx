import { useEffect, useRef, useState } from 'preact/hooks';
import type { DocPayload } from './api';
import type { Mark } from '../lib/prefs';
import { IconStar, IconMute, IconLink, IconClock } from './icons';
import { timeAgo } from './format';

interface Props {
  doc: DocPayload | null;
  loading: boolean;
  error: string | null;
  /** Line to scroll to and flash, from a search hit. */
  jumpLine: number | null;
  onNavigate: (url: string) => void;
  onMark: (path: string, mark: Mark, on: boolean) => void;
}

/**
 * Mermaid is ~5 MB bundled, so it is deliberately kept out of the app bundle: the server
 * publishes mermaid's own ESM build under /vendor/mermaid/, and this import goes through a
 * variable so the bundler cannot resolve it statically and inline it. A document with no
 * diagram never pays for any of it.
 */
const MERMAID_URL = '/vendor/mermaid/mermaid.esm.min.mjs';
let mermaidModule: Promise<typeof import('mermaid')> | null = null;

async function renderMermaid(container: HTMLElement): Promise<void> {
  const blocks = container.querySelectorAll<HTMLElement>('pre.mermaid:not([data-rendered])');
  if (!blocks.length) return;

  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  mermaidModule ??= import(/* @vite-ignore */ MERMAID_URL) as Promise<typeof import('mermaid')>;
  const { default: mermaid } = await mermaidModule;
  mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'default', securityLevel: 'strict' });

  for (const [i, block] of blocks.entries()) {
    block.dataset.rendered = '1';
    try {
      const { svg } = await mermaid.render(`mmd-${Date.now()}-${i}`, block.textContent ?? '');
      block.innerHTML = svg;
    } catch (err) {
      block.dataset.rendered = 'error';
      block.title = String(err);
    }
  }
}

export function Doc({ doc, loading, error, jumpLine, onNavigate, onMark }: Props) {
  const body = useRef<HTMLDivElement>(null);
  const [tocOpen, setTocOpen] = useState(true);

  // In-app navigation: a local .md link should not reload the page.
  useEffect(() => {
    const el = body.current;
    if (!el) return;

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const link = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
      if (!link) return;

      const href = link.getAttribute('href') ?? '';
      if (href.startsWith('/d/')) {
        e.preventDefault();
        onNavigate(href);
      } else if (href.startsWith('#')) {
        e.preventDefault();
        const target = el.querySelector(`[id="${CSS.escape(href.slice(1))}"]`);
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', href);
      }
    };

    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, [onNavigate]);

  useEffect(() => {
    if (doc?.hasMermaid && body.current) void renderMermaid(body.current);
  }, [doc?.url, doc?.hasMermaid]);

  // Land on the right place: an explicit line from a search hit wins over the URL hash.
  useEffect(() => {
    const el = body.current;
    if (!el || !doc) return;

    const target =
      jumpLine !== null
        ? nearestByLine(el, jumpLine)
        : location.hash
          ? el.querySelector<HTMLElement>(`[id="${CSS.escape(decodeURIComponent(location.hash.slice(1)))}"]`)
          : null;

    if (target) {
      target.scrollIntoView({ block: 'start' });
      target.classList.add('flash');
      setTimeout(() => target.classList.remove('flash'), 1500);
    } else {
      el.closest('main')?.scrollTo({ top: 0 });
    }
  }, [doc?.url, jumpLine]);

  if (error) {
    return (
      <div class="notice">
        <h2>Can’t open that</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (!doc) {
    return (
      <div class="notice">
        {loading ? (
          <div class="spinner" />
        ) : (
          <>
            <h2>mdhouse</h2>
            <p>Pick a file on the left, or press <code>/</code> to search.</p>
          </>
        )}
      </div>
    );
  }

  const isFav = doc.marks.includes('favorite');
  const isMuted = doc.marks.includes('muted');
  const dirs = doc.rel.split('/').slice(0, -1);
  const title = doc.rel.split('/').pop()!.replace(/\.mdx?$/i, '');
  const major = doc.headings.filter((h) => h.level <= 2);

  return (
    <article class="doc-wrap">
      <header class="doc-head">
        <div class="crumbs">
          {dirs.map((d, i) => (
            <span key={i}>
              {d}
              <span class="sep"> / </span>
            </span>
          ))}
        </div>

        <h1 class="doc-title">{title}</h1>

        <div class="doc-meta">
          <span title={new Date(doc.mtime).toLocaleString()}>
            <IconClock size={12} /> {timeAgo(doc.mtime)}
          </span>
          {doc.tasks.total > 0 && (
            <span>
              {doc.tasks.done}/{doc.tasks.total} done
            </span>
          )}
          {!doc.writable && <span title="mdhouse will not write to this tree">read-only</span>}

          <span class="doc-actions">
            <button
              class="icon-btn"
              title={isFav ? 'Unfavorite' : 'Favorite'}
              aria-pressed={isFav}
              onClick={() => onMark(doc.rel, 'favorite', !isFav)}
            >
              <IconStar size={15} filled={isFav} />
            </button>
            <button
              class="icon-btn"
              title={isMuted ? 'Unmute' : 'Mute'}
              aria-pressed={isMuted}
              onClick={() => onMark(doc.rel, 'muted', !isMuted)}
            >
              <IconMute size={15} />
            </button>
            <button
              class="icon-btn"
              title="Copy link"
              onClick={() => void navigator.clipboard?.writeText(location.origin + doc.url)}
            >
              <IconLink size={15} />
            </button>
          </span>
        </div>
      </header>

      {major.length > 2 && (
        <details class="toc" open={tocOpen} onToggle={(e) => setTocOpen((e.target as HTMLDetailsElement).open)}>
          <summary>Table of contents</summary>
          <ul>
            {major.map((h) => (
              <li data-level={h.level} key={h.slug}>
                <a href={`#${h.slug}`}>{h.text}</a>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div ref={body} class="md" dangerouslySetInnerHTML={{ __html: doc.html }} />
    </article>
  );
}

/** The rendered element whose source line is closest to (but not past) `line`. */
function nearestByLine(root: HTMLElement, line: number): HTMLElement | null {
  let best: HTMLElement | null = null;
  let bestLine = -1;
  for (const el of root.querySelectorAll<HTMLElement>('[data-line]')) {
    const at = Number(el.dataset.line);
    if (at <= line && at > bestLine) {
      bestLine = at;
      best = el;
    }
  }
  return best;
}
