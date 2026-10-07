import { useEffect, useMemo, useState } from 'preact/hooks';
import { api, type GitInfo, type RemoteState, type RootInfo } from './api';
import { CommitsView, FilesView, GitActions, RemoteBar, SyncLists } from './GitPanel';
import type { CommitGroup, Digest, RecentEntry, TreePayload } from '../lib/store';
import { PageHead, type HomeView } from './PageHead';
import { loadWide } from './wide';
import { IconGit } from './icons';
import { preciseAgo, docName } from './format';
import { Ago } from './Ago';

export type { HomeView } from './PageHead';

interface Props {
  rootId: string;
  roots: RootInfo[];
  tree: TreePayload | null;
  showIgnored: boolean;
  /** Bumped by the live channel so the page reloads when the tree changes underneath it. */
  revision: number;
  onOpen: (path: string) => void;
  onAbout?: () => void;
  /** The settings button, at the end of the header row. */
  gear?: preact.ComponentChildren;
  /** The folder this is the git view of, root-relative; '' for the root. */
  dir: string;
  /** The folder's own page — every file in it, as a list; the git view is it plus `?git`. */
  dirUrl: string;
  /** A parent folder's git view, for the breadcrumbs. */
  crumbUrl: (dir: string) => string;
  /** The tab, from the url. */
  view: HomeView;
  go: (url: string) => void;
}

/**
 * The front page: what changed here lately, grouped by commit rather than by file.
 *
 * The sidebar's Recent tab answers "which files changed"; this answers "what was done". They
 * read the same data and deliberately present it differently — a commit with its subject and
 * the four plan files it touched says more than those four files listed separately.
 */
export function Home(props: Props) {
  const [digest, setDigest] = useState<Digest | null>(null);

  useEffect(() => {
    let live = true;
    setDigest(null);
    api
      .digest(props.rootId, props.showIgnored)
      .then((d) => live && setDigest(d))
      .catch(() => live && setDigest({ uncommitted: [], commits: [], recent: [], head: null }));
    return () => {
      live = false;
    };
  }, [props.rootId, props.showIgnored, props.revision]);

  /** The folder's repo — branch, origin, uncommitted files — or null outside one. */
  const p = `${props.rootId}/${props.dir}`;
  const [git, setGit] = useState<GitInfo | null>(null);
  const [gitTick, setGitTick] = useState(0);
  const [remote, setRemote] = useState<RemoteState | null>(null);
  useEffect(() => {
    let live = true;
    if (!props.rootId) return;
    api
      .git(p)
      .then((g) => live && setGit(g))
      .catch(() => live && setGit(null));
    return () => {
      live = false;
    };
  }, [p, props.revision, gitTick]);
  // Commits and Files need a repo; outside one they read as Recent.
  const view: HomeView = !git && (props.view === 'commits' || props.view === 'files') ? 'recent' : props.view;

  const me = props.tree?.user ?? null;

  // Directory rules are already resolved into per-file marks by the tree payload, so a
  // favourited folder contributes all of its files here without re-implementing the matching.
  const favorites = useMemo(
    () => new Set((props.tree?.files ?? []).filter((f) => f.marks?.includes('favorite')).map((f) => f.rel)),
    [props.tree],
  );

  const under = props.dir ? `${props.dir}/` : '';
  const keep = (rel: string) => rel.startsWith(under) && (view !== 'favorites' || favorites.has(rel));
  const isMine = (email: string, author: string) =>
    me ? (me.email ? email === me.email : author === me.name) : false;
  const mine = (email: string, author: string) => view !== 'mine' || isMine(email, author);

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

  const rows: Row[] = [];
  if (uncommitted.length && !git) {
    rows.push({ kind: 'head', key: 'h:uncommitted', label: 'Uncommitted' });
    rows.push(...fileRows(uncommitted, 'u', true));
  }
  if (recent.length) {
    rows.push({ kind: 'head', key: 'h:recent', label: 'Recently changed' });
    rows.push(...fileRows(recent, 'r'));
  }
  if (commits.length) {
    rows.push({ kind: 'head', key: 'h:commits', label: 'Commits' });
    for (const c of commits) {
      // Your own commits get a green header, so a page of a team's work shows your part of
      // it without reaching for the Mine tab.
      const own = isMine(c.email, c.author);
      rows.push({ kind: 'commit', key: `c:${c.hash}`, c, own });
      rows.push(...fileRows(c.files, c.hash));
    }
  }

  return (
    <div class={`home${loadWide() ? ' full' : ''}`}>
      <PageHead
        rootName={root?.name ?? 'mdhouse'}
        dir={props.dir}
        dirUrl={props.dirUrl}
        crumbUrl={props.crumbUrl}
        view={view}
        repo={!!git}
        go={props.go}
        onAbout={props.onAbout}
        gear={props.gear}
      />

      {(() => {
        const head = git?.head ? { ...git.head, repo: git.repo } : digest?.head;
        return (
          head && (
            <RepoLine
              head={head}
              own={!!head.commit && isMine(head.commit.email, head.commit.author)}
              git={git}
              onUncommitted={() => document.querySelector('.git-changed')?.scrollIntoView({ block: 'center' })}
            />
          )
        );
      })()}
      {git && <RemoteBar p={p} info={git} onState={setRemote} />}
      {git?.writable && <GitActions p={p} info={git} remote={remote} onDone={() => setGitTick((n) => n + 1)} />}
      {git && <SyncLists info={git} onOpen={props.onOpen} />}

      {view === 'commits' && git && <CommitsView p={p} info={git} onOpen={props.onOpen} revision={props.revision + gitTick} />}
      {view === 'files' && git && <FilesView p={p} info={git} onOpen={props.onOpen} revision={props.revision + gitTick} />}

      {(view === 'commits' || view === 'files') ? null : <>
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
        <table class="home-table">
          <tbody>
            {rows.map((row) =>
              row.kind === 'head' ? (
                <tr class="head" key={row.key}>
                  <td colSpan={3}>
                    <h2>{row.label}</h2>
                  </td>
                </tr>
              ) : row.kind === 'commit' ? (
                <tr class={row.own ? 'commit mine' : 'commit'} key={row.key}>
                  <td colSpan={3}>
                    <div class="commit-head">
                      {/* The same ❖ the sidebar puts on your files, for the same reason. */}
                      {row.own && (
                        <span class="mine" title="yours" aria-label="yours">
                          ❖
                        </span>
                      )}
                      <span class="subject" title={row.c.subject}>
                        {row.c.subject}
                      </span>
                      <span class="when">
                        <Ago at={row.c.date} />
                      </span>
                      <span class="who">{row.c.author}</span>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr
                  class={row.loud ? 'file loud' : 'file'}
                  key={row.key}
                  onClick={() => props.onOpen(row.r.rel)}
                  title={row.r.rel}
                >
                  {row.span > 0 && (
                    <td class="dir" rowSpan={row.span}>
                      <Dir dir={row.r.dir} />
                    </td>
                  )}
                  <td class="name">
                    <span class="link">{docName(row.r.name)}</span>
                    {tagOf(row.r.status, row.loud) && <span class="tag">{tagOf(row.r.status, row.loud)}</span>}
                  </td>
                  {/* Empty under a commit — the commit's own age heads its block — but the cell
                      stays, so every file name sits in the same column all the way down. */}
                  <td class="when">{row.r.at !== undefined && <Ago at={row.r.at} />}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}
      </>}
    </div>
  );
}

/**
 * Where the checkout stands, above everything else: the branch, the commit HEAD is on, and how
 * long ago it last pulled. The commits below are only the ones that touched Markdown; this is
 * the newest commit of any kind, so it answers "is this checkout current" rather than "what
 * changed in the docs".
 */
function RepoLine({ head, own, git, onUncommitted }: { head: NonNullable<Digest['head']>; own: boolean; git?: GitInfo | null; onUncommitted?: () => void }) {
  const c = head.commit;
  const sync = git?.sync ?? null;
  const uncommitted = git?.dirty.length ?? 0;
  // Green: all committed and on origin. Yellow: something is not. Red: the branch is not on
  // origin at all.
  const state = !sync ? '' : !sync.upstream ? ' sync-none' : sync.ahead || uncommitted || sync.busy ? ' sync-some' : ' sync-ok';
  return (
    <div class={`repo-line${own && !sync ? ' mine' : ''}${state}`}>
      {/* Two rows: the checkout (branch, last pull), then its HEAD commit laid out exactly like
          the commit bands below — subject, age, author. Branch names run long, and so do
          subjects; on one line each would squeeze the other into an ellipsis. */}
      <div class="repo-top">
        <span class="branch" title={head.repo ? `${head.repo} · ${head.branch}` : head.branch}>
          <IconGit size={12} />
          {head.repo && <span class="repo">{head.repo}</span>}
          <span class="name">{head.branch}</span>
        </span>
        {sync ? (
          <span class="sync">
            {sync.busy && <span class="sync-busy">{sync.busy}</span>}
            {uncommitted > 0 && (
              <button class="sync-chip warn" onClick={onUncommitted} title="Changed and added files — below">
                ✎ {uncommitted} uncommitted
              </button>
            )}
            {!sync.upstream ? (
              <span class="sync-chip alert" title="This branch is not on origin">
                unpushed
              </span>
            ) : (
              <>
                {sync.ahead > 0 && (
                  <span class="sync-chip warn" title="Commits not on origin — below">
                    ↑{sync.ahead} unpushed
                  </span>
                )}
                {sync.behind > 0 && (
                  <span class="sync-chip" title="On origin and not here, as of the last fetch">
                    ↓{sync.behind} to pull
                  </span>
                )}
                {sync.last && (
                  <span class="pulled" title={`Last ${sync.last.way === 'pushed' ? 'push' : 'fetch or pull'}: ${new Date(sync.last.at).toLocaleString()}`}>
                    {sync.last.way} <Ago at={sync.last.at} flame={false} format={preciseAgo} />
                  </span>
                )}
              </>
            )}
          </span>
        ) : (
          head.pulledAt !== null && (
            <span class="pulled" title={`Last fetch or pull: ${new Date(head.pulledAt).toLocaleString()}`}>
              pulled <Ago at={head.pulledAt} flame={false} format={preciseAgo} />
            </span>
          )
        )}
      </div>
      {c && (
        <div class="repo-subject">
          {/* The same ❖ the commit bands below put before your subjects. */}
          {own && (
            <span class="mine" title="yours" aria-label="yours">
              ❖
            </span>
          )}
          <span class="subject" title={c.hash.slice(0, 10)}>
            {c.subject}
          </span>
          <span class="when">
            <Ago at={c.date} />
          </span>
          <span class="who">{c.author}</span>
        </div>
      )}
    </div>
  );
}

/**
 * One flat list of table rows for the whole page: section titles and commit headers span the
 * full width, file rows fill the three columns.
 *
 * It is a single `<table>` on purpose. A table per commit would let each size its own columns,
 * and the file names would step left and right down the page; sharing one table means the
 * directory, the name and the age each keep one position everywhere.
 */
type Row =
  | { kind: 'head'; key: string; label: string }
  | { kind: 'commit'; key: string; c: CommitGroup; own?: boolean }
  | { kind: 'file'; key: string; r: FileRow; loud?: boolean; span: number };

type FileRow = Pick<RecentEntry, 'rel' | 'dir' | 'name' | 'status'> & { at?: number };

/**
 * Directory cells span the rows beneath them, so a run of files from the same folder names it
 * once. Grouping restarts at every header — a folder repeated under the next commit is new
 * information there.
 */
function fileRows(files: FileRow[], prefix: string, loud?: boolean): Row[] {
  return files.map((r, i) => {
    let span = 0;
    if (i === 0 || files[i - 1]!.dir !== r.dir) {
      span = 1;
      while (i + span < files.length && files[i + span]!.dir === r.dir) span++;
    }
    return { kind: 'file', key: `${prefix}:${r.rel}`, r, loud, span };
  });
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
export function Dir({ dir }: { dir: string }) {
  if (!dir) return <span class="dir-path root">/</span>;
  const cut = dir.lastIndexOf('/');
  return (
    <span class="dir-path">
      {cut >= 0 && <span class="up">{dir.slice(0, cut + 1)}</span>}
      <b>{dir.slice(cut + 1)}</b>
    </span>
  );
}
