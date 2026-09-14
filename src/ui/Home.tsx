import { useEffect, useMemo, useState } from 'preact/hooks';
import { api, type RootInfo } from './api';
import type { Digest, RecentEntry, TreePayload } from '../lib/store';
import { IconClock, IconStar, IconUser } from './icons';
import { docName } from './format';
import { Ago } from './Ago';

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
              <FileTable rows={uncommitted} onOpen={props.onOpen} loud />
            </section>
          )}

          {recent.length > 0 && (
            <section class="home-section">
              <h2>Recently changed</h2>
              <FileTable rows={recent} onOpen={props.onOpen} />
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
                    <span class="when">
                      <Ago at={c.date} />
                    </span>
                    <span class="who">{c.author}</span>
                  </header>
                  {/* The commit's own age heads the card, so the rows below carry none. */}
                  <FileTable rows={c.files} onOpen={props.onOpen} when={false} />
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Files as a table: directory, name, age — three columns that line up, instead of three
 * ragged runs of text.
 *
 * The directory is **right**-aligned against the names, so the eye follows one straight edge
 * down the page, and a run of files from the same folder states it once via `rowspan` rather
 * than repeating it eight times. That repetition is exactly what made the list hard to scan:
 * in a plans tree most rows share a parent, and the folder is only interesting where it
 * changes.
 */
function FileTable(props: {
  rows: Array<Pick<RecentEntry, 'rel' | 'dir' | 'name' | 'status'> & { at?: number }>;
  onOpen: (rel: string) => void;
  /** Uncommitted rows are the loud ones — a green tag rather than an amber one. */
  loud?: boolean;
  when?: boolean;
}) {
  const showWhen = props.when !== false;

  // How many rows each directory cell spans. 0 means "a cell above already covers this row".
  const spans = props.rows.map((r, i) => {
    if (i > 0 && props.rows[i - 1]!.dir === r.dir) return 0;
    let n = 1;
    while (i + n < props.rows.length && props.rows[i + n]!.dir === r.dir) n++;
    return n;
  });

  return (
    <table class={`home-table${props.loud ? ' loud' : ''}`}>
      <tbody>
        {props.rows.map((r, i) => (
          <tr key={r.rel} onClick={() => props.onOpen(r.rel)} title={r.rel}>
            {spans[i]! > 0 && (
              <td class="dir" rowSpan={spans[i]}>
                <Dir dir={r.dir} />
              </td>
            )}
            <td class="name">
              <span class="link">{docName(r.name)}</span>
              {tagOf(r.status, props.loud) && <span class="tag">{tagOf(r.status, props.loud)}</span>}
            </td>
            {showWhen && (
              <td class="when">
                <Ago at={r.at ?? 0} />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Uncommitted rows label every state; a committed row is only worth marking when the commit
 * *added* the file, which is the one thing its subject may not say.
 */
function tagOf(status: string | undefined, loud?: boolean): string | null {
  if (!status) return null;
  if (loud) return status === 'untracked' ? 'new' : status;
  return status === 'A' ? 'added' : null;
}

/** `Plans/PRF-55` — the last segment bold, since that is the one that names the folder. */
function Dir({ dir }: { dir: string }) {
  if (!dir) return <span class="dir-path root">/</span>;
  const cut = dir.lastIndexOf('/');
  return (
    <span class="dir-path">
      {cut >= 0 && <span class="up">{dir.slice(0, cut + 1)}</span>}
      <b>{dir.slice(cut + 1)}</b>
    </span>
  );
}
