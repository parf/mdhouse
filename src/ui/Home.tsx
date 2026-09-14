import { useEffect, useMemo, useState } from 'preact/hooks';
import { api, type RootInfo } from './api';
import type { Digest, TreePayload } from '../lib/store';
import { IconClock, IconStar, IconUser } from './icons';
import { timeAgo, docName } from './format';

export type HomeView = 'favorites' | 'recent' | 'mine';

interface Props {
  rootId: string;
  roots: RootInfo[];
  tree: TreePayload | null;
  showIgnored: boolean;
  /** Bumped by the live channel so the page reloads when the tree changes underneath it. */
  revision: number;
  onOpen: (path: string) => void;
}

const VIEWS: Array<{ id: HomeView; label: string; Icon: (p: { size?: number }) => preact.JSX.Element }> = [
  { id: 'favorites', label: 'Favs', Icon: (p) => <IconStar {...p} filled /> },
  { id: 'recent', label: 'Recent', Icon: IconClock },
  { id: 'mine', label: 'Mine', Icon: IconUser },
];

/**
 * The front page: what changed here lately, grouped by commit rather than by file.
 *
 * The sidebar's Recent tab answers "which files changed"; this answers "what was done". They
 * read the same data and deliberately present it differently — a commit with its subject and
 * the four plan files it touched says more than those four files listed separately.
 */
export function Home(props: Props) {
  const [view, setView] = useState<HomeView>('recent');
  const [digest, setDigest] = useState<Digest | null>(null);

  useEffect(() => {
    let live = true;
    setDigest(null);
    api
      .digest(props.rootId, props.showIgnored)
      .then((d) => live && setDigest(d))
      .catch(() => live && setDigest({ uncommitted: [], commits: [], recent: [] }));
    return () => {
      live = false;
    };
  }, [props.rootId, props.showIgnored, props.revision]);

  const me = props.tree?.user ?? null;

  // Directory rules are already resolved into per-file marks by the tree payload, so a
  // favourited folder contributes all of its files here without re-implementing the matching.
  const favorites = useMemo(
    () => new Set((props.tree?.files ?? []).filter((f) => f.marks?.includes('favorite')).map((f) => f.rel)),
    [props.tree],
  );

  const keep = (rel: string) => view !== 'favorites' || favorites.has(rel);
  const mine = (email: string, author: string) =>
    view !== 'mine' || (me ? (me.email ? email === me.email : author === me.name) : false);

  // Uncommitted work is the user's own by definition, so Mine keeps all of it.
  const uncommitted = (digest?.uncommitted ?? []).filter((e) => keep(e.rel));
  const commits = (digest?.commits ?? [])
    .filter((c) => mine(c.email, c.author))
    .map((c) => ({ ...c, files: c.files.filter((f) => keep(f.rel)) }))
    .filter((c) => c.files.length > 0);

  // Only reached when git had nothing to offer, so there is no committer to filter on.
  const recent = (digest?.recent ?? []).filter((e) => keep(e.rel));
  const root = props.tree?.root;
  const nothing = !uncommitted.length && !commits.length && !recent.length;

  return (
    <div class="home">
      <header class="home-head">
        <h1>{root?.name ?? 'mdhouse'}</h1>
        <div class="tabs" role="tablist">
          {VIEWS.map(({ id, label, Icon }) => (
            <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)}>
              <Icon size={12} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </header>

      {!digest && <div class="spinner" />}

      {digest && nothing && (
        <p class="empty">
          {view === 'favorites'
            ? 'Nothing you have starred has changed lately. Star a file in the tree to watch it here.'
            : view === 'mine'
              ? 'Nothing of yours has changed lately.'
              : 'Nothing has changed here yet.'}
        </p>
      )}

      {digest && !nothing && (
        <>
          {uncommitted.length > 0 && (
            <section class="home-section">
              <h2>Uncommitted</h2>
              {uncommitted.map((e) => (
                <button class="home-file loud" key={e.rel} onClick={() => props.onOpen(e.rel)} title={e.rel}>
                  <span class="where">
                    {e.dir && <span class="dir">{e.dir}/</span>}
                    <b>{docName(e.name)}</b>
                  </span>
                  <span class="tag">{e.status === 'untracked' ? 'new' : e.status}</span>
                  <span class="when">{timeAgo(e.at)}</span>
                </button>
              ))}
            </section>
          )}

          {recent.length > 0 && (
            <section class="home-section">
              <h2>Recently changed</h2>
              {recent.map((e) => (
                <button class="home-file" key={e.rel} onClick={() => props.onOpen(e.rel)} title={e.rel}>
                  <span class="where">
                    {e.dir && <span class="dir">{e.dir}/</span>}
                    <b>{docName(e.name)}</b>
                  </span>
                  <span class="when">{timeAgo(e.at)}</span>
                </button>
              ))}
            </section>
          )}

          {commits.length > 0 && (
          <section class="home-section">
            <h2>Commits</h2>

            {commits.map((c) => (
              <article class="commit-card" key={c.hash}>
                <header>
                  <span class="subject" title={c.subject}>
                    {c.subject}
                  </span>
                  <span class="when" title={new Date(c.date).toLocaleString()}>
                    {timeAgo(c.date)}
                  </span>
                  <span class="who">{c.author}</span>
                </header>
                {c.files.map((f) => (
                  <button class="home-file" key={f.rel} onClick={() => props.onOpen(f.rel)} title={f.rel}>
                    <span class="where">
                      {f.dir && <span class="dir">{f.dir}/</span>}
                      <b>{docName(f.name)}</b>
                    </span>
                    {f.status === 'A' && <span class="tag">added</span>}
                  </button>
                ))}
              </article>
            ))}
          </section>
          )}
        </>
      )}
    </div>
  );
}
