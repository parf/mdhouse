import { useEffect, useRef, useState } from 'preact/hooks';
import { api, type DocPayload } from './api';
import type { FileHistory } from '../lib/git';
import type { Mark } from '../lib/prefs';
import { IconStar, IconMute, IconLink, IconClock, IconGit } from './icons';
import { timeAgo } from './format';

interface Props {
  doc: DocPayload | null;
  loading: boolean;
  error: string | null;
  /** Line to scroll to and flash, from a search hit. */
  jumpLine: number | null;
  onNavigate: (url: string) => void;
  onMark: (path: string, mark: Mark, on: boolean) => void;
  /** Reveal a directory in the sidebar tree. */
  onOpenDir: (dir: string) => void;
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

export function Doc({ doc, loading, error, jumpLine, onNavigate, onMark, onOpenDir }: Props) {
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
          {dirs.map((d, i) => {
            // Each crumb addresses the path up to and including itself. The last one is the
            // folder the document actually lives in — the part worth reading at a glance, so
            // it is set larger and bold, as in the recents list.
            const path = dirs.slice(0, i + 1).join('/');
            const last = i === dirs.length - 1;
            return (
              <span key={path}>
                <button
                  class={`crumb${last ? ' here' : ''}`}
                  onClick={() => onOpenDir(path)}
                  title={`Show ${path} in the tree`}
                >
                  {d}
                </button>
                {!last && <span class="sep"> / </span>}
              </span>
            );
          })}
        </div>

        <h1 class="doc-title">{title}</h1>

        <div class="doc-meta">
          <span title={new Date(doc.mtime).toLocaleString()}>
            <IconClock size={12} /> {timeAgo(doc.mtime)}
          </span>
          <Authors authors={doc.authors} />
          {doc.tasks.total > 0 && (
            <span>
              {doc.tasks.done}/{doc.tasks.total} done
            </span>
          )}
          {doc.writable && (
            <span class="rw" title="mdhouse may write to this tree">
              RW
            </span>
          )}

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

      <div class="doc-aside">
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
        <History p={`${doc.root}/${doc.rel}`} />
      </div>

      <div ref={body} class="md" dangerouslySetInnerHTML={{ __html: doc.html }} />
    </article>
  );
}

/**
 * Who wrote the file and who last touched it, as `first … last` — collapsed to one name when
 * they are the same person, which in a plan folder they usually are.
 */
function Authors({ authors }: { authors: DocPayload['authors'] }) {
  if (!authors) return null;
  const { created, last } = authors;

  // Either half is enough to call it one person. The same human commits under two addresses
  // often enough (a job change, a second machine), and whatever the emails say, rendering
  // "Serg Parf … Serg Parf" is noise.
  const same = !created || created.email === last.email || created.name === last.name;

  return (
    <span class="who" title={`Last commit ${last.hash}, ${timeAgo(last.at)}`}>
      {!same && (
        <>
          <span title={`Created ${timeAgo(created.at)}`}>{created.name}</span>
          <span class="sep"> … </span>
        </>
      )}
      {last.name}
    </span>
  );
}

/**
 * Per-file git history, the one genuinely good idea in the r-doc viewer's document page:
 * who created the file, and the last commits with their line counts.
 *
 * It costs a `git log` per file, so it is fetched when the panel is first opened and not
 * before — a reader who never asks never pays. `--follow` means a renamed plan folder keeps
 * its history, which is exactly the case this docs tree hits.
 */
function History({ p }: { p: string }) {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<FileHistory | null>(null);
  const [failed, setFailed] = useState(false);

  // A different file invalidates whatever was loaded; the panel keeps its open state.
  useEffect(() => {
    setLog(null);
    setFailed(false);
  }, [p]);

  useEffect(() => {
    if (!open || log || failed) return;
    let live = true;
    api
      .history(p)
      .then((h) => live && setLog(h))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [open, p, log, failed]);

  return (
    <details class="gitlog" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>
        <IconGit size={12} /> History
      </summary>

      {!log && !failed && <div class="spinner" />}
      {failed && <p class="empty">git is unavailable here.</p>}
      {log && !log.commits.length && <p class="empty">Not committed yet.</p>}

      {log?.commits.map((c) => (
        <div class="commit" key={c.hash}>
          <div class="commit-subject">{c.subject}</div>
          <div class="commit-meta">
            <span class="who">{c.author}</span>
            <span title={new Date(c.date).toLocaleString()}>{timeAgo(c.date)}</span>
            <code>{c.hash.slice(0, 8)}</code>
            {c.added !== undefined && (
              <span class="churn">
                <span class="plus">+{c.added}</span>
                <span class="minus">−{c.deleted}</span>
              </span>
            )}
          </div>
        </div>
      ))}

      {log?.created && (
        <div class="commit created">
          <div class="commit-meta">
            <span>created by</span>
            <span class="who">{log.created.author}</span>
            <span title={new Date(log.created.date).toLocaleString()}>{timeAgo(log.created.date)}</span>
          </div>
        </div>
      )}
      {log?.truncated && <p class="empty">Older commits exist.</p>}
    </details>
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
