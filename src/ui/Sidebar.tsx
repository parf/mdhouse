import { useEffect, useMemo, useState } from 'preact/hooks';
import { api } from './api';
import type { AnyFile } from '../lib/scan';
import { allEntries, loadTreeKind, saveTreeKind, type TreeKind } from './sidebar-kind';
import { tabFiles, VIEW_IDS, type RootViews, type ViewId } from './views';
import type { RootInfo, TeamMe } from './api';
import type { RecentEntry } from '../lib/store';
import type { UiTree } from './api';
import { accessBadge } from './project-groups';
import { StoredRwTag, useViewer, ViewerBadge } from './viewer';
import { useTeam } from './team';
import { gitStateClass, shownStatus } from './git-state';
import { GitStateBadge } from './GitStateBadge';
import type { SearchResult } from '../lib/search';
import { SearchScope } from './SearchScope';
import { placeholder, type SearchTarget } from './search-scope';
import type { Mark } from '../lib/prefs';
import { SizeMark, sizeClass } from './Tree';
import { buildTree, fuzzyScore, type Node } from './tree-model';
import { Tree } from './Tree';
import { highlightRanges, docName } from './format';
import { Ago } from './Ago';
import { RootSelect } from './RootSelect';
import { follow } from './PageHead';
import {
  IconSearch, IconX, IconPanel, IconPanelWide, IconPanelOff,
  IconClock, IconDoc, IconStar, IconEyeOff, IconFolder, IconUser, IconView,
} from './icons';

export type SidebarState = 'off' | 'compact' | 'open';
export type Tab = 'files' | 'favorites' | 'recent' | 'mine' | ViewId;

/**
 * The tab strip is present in compact as well as open — switching to recents or favorites
 * must not require widening the sidebar first. Compact drops the labels and keeps the icons.
 */
const TABS: Array<{ id: Tab; label: string; title: string; Icon: (p: { size?: number }) => preact.JSX.Element }> = [
  { id: 'files', label: 'Files', title: 'All files', Icon: IconDoc },
  { id: 'recent', label: 'Recent', title: 'Uncommitted, then recently committed', Icon: IconClock },
  { id: 'mine', label: 'My', title: 'My uncommitted work and my recent commits', Icon: IconUser },
  // Favs sits beside the views 1 and 2 after it: all three are the reader's own picks.
  { id: 'favorites', label: 'Favs', title: 'Favorites', Icon: (p) => <IconStar {...p} filled /> },
];

/** Which halves of a search are shown: matching file names, matching file contents, or both. */
export interface SearchIn {
  names: boolean;
  text: boolean;
}

/** Narrows search results to the files in the recents list, or to the user's own. */
export type SearchScope = 'all' | 'recent' | 'mine';

/** The tabs that read the recents list. 'mine' is a filter over the same payload. */
export const WANTS_RECENTS = new Set<Tab>(['recent', 'mine']);

export interface SidebarProps {
  state: SidebarState;
  roots: RootInfo[];
  rootId: string;
  tree: UiTree | null;
  tab: Tab;
  query: string;
  search: SearchResult | null;
  searching: boolean;
  recents: RecentEntry[] | null;
  authorFilter: string;
  showIgnored: boolean;
  current: string | null;
  expanded: Set<string>;
  live: boolean;

  onCycleState: () => void;
  onPickRoot: (id: string) => void;
  onTab: (tab: Tab) => void;
  onQuery: (q: string) => void;
  searchIn: SearchIn;
  searchScope: SearchScope;
  onSearchIn: (key: keyof SearchIn) => void;
  onSearchScope: (scope: SearchScope) => void;
  /** Where the search looks: this project's files, or its RAG index (Enter opens `/rag`). */
  searchTarget: SearchTarget;
  onSearchTarget: (target: SearchTarget) => void;
  /** An Index search: the `/rag` page for this query. */
  onIndexSearch: (query: string) => void;
  onAuthor: (author: string) => void;
  /** Why the ignored folders listed are incomplete; null when they are complete. */
  revealNote: string | null;
  onToggleIgnored: () => void;
  onToggleDir: (path: string) => void;
  onOpenDirPage: (path: string) => void;
  onOpen: (path: string, line?: number) => void;
  /** A document's URL, for the links in the lists. */
  fileUrl: (path: string) => string;
  onMark: (path: string, mark: Mark, on: boolean) => void;
  /** Leave the open document and show the root's front page. */
  onHome: () => void;
  onAbout?: () => void;
  /** Active Team access: who this browser is signed in as (`api.teamMe`), or the sign-in address; and how to log out. */
  teamMe?: TeamMe | null;
  onLogout?: () => void;
  /** A project action from the chooser: add an existing folder, or create a new project. */
  onProjectAction: (action: 'add' | 'create') => void;
  /** Changes when only other files than Markdown change: an ALL tree lists them again. */
  filesRev: number;
  /** The root's views: their tabs show the tree narrowed to them. */
  views: RootViews;
}

const STATE_ICON = { off: IconPanelOff, compact: IconPanel, open: IconPanelWide };
/** What the toggle will do next, following the off -> compact -> open -> off cycle. */
const NEXT_LABEL: Record<SidebarState, string> = {
  off: 'Show sidebar',
  compact: 'Widen sidebar',
  open: 'Hide sidebar',
};

const PROJECT_ACTIONS = [
  { id: 'add', label: '＋ Add new Project…' },
  { id: 'create', label: '✦ Create new Project…' },
];

export function Sidebar(props: SidebarProps) {
  const { state, tree, query } = props;
  const wide = state === 'open';
  const StateIcon = STATE_ICON[state];
  const viewer = useViewer();
  const team = useTeam();
  // Active Team access: RAG is refused, so a remembered RAG Search scope searches Files.
  const searchTarget = team ? 'files' : props.searchTarget;

  // a view's tab: the tree narrowed to its folders and files, muted ones left out
  const entries = props.tab === 'V1' || props.tab === 'V2' ? props.views[props.tab] : null;
  // MD or ALL: the Files tab's tree lists the Markdown, or every file of the project (a view's tab stays Markdown).
  const [kind, setKind] = useState<TreeKind>(loadTreeKind);
  const flipKind = () => {
    const next = kind === 'md' ? 'all' : 'md';
    setKind(next);
    saveTreeKind(next);
  };
  const allTree = kind === 'all' && props.tab === 'files';
  const [listed, setListed] = useState<{ root: string; files: AnyFile[]; capped: boolean } | { root: string; error: string } | null>(null);
  useEffect(() => {
    if (!allTree || !tree) return;
    let live = true;
    const root = tree.root.id;
    api.files(root).then(
      (r) => live && setListed({ root, files: r.files, capped: r.capped }),
      (e: unknown) => live && setListed({ root, error: e instanceof Error ? e.message : 'could not list the files' }),
    );
    return () => {
      live = false;
    };
    // `tree` changes with every rescan, `filesRev` when only other files change: the listing follows both.
  }, [allTree, tree, props.filesRev]);
  const listing = allTree && listed && listed.root === tree?.root.id ? listed : null;
  const shown = useMemo(
    () =>
      tabFiles(listing && 'files' in listing ? allEntries(listing.files, tree?.files ?? []) : (tree?.files ?? []), entries, props.showIgnored),
    [tree, entries, props.showIgnored, listing],
  );
  const nodes = useMemo<Node[]>(() => buildTree(shown), [shown]);

  const sizes = useMemo(() => new Map((tree?.files ?? []).map((f) => [f.rel, f.size])), [tree]);

  const favorites = useMemo<FavEntry[]>(() => {
    if (!tree) return [];
    const byPath = new Map(tree.files.map((f) => [f.rel, f]));

    return tree.marks.favorite.map((entry) => {
      const isDir = entry.endsWith('/');
      const rel = isDir ? entry.slice(0, -1) : entry;
      const slash = rel.lastIndexOf('/');
      return {
        rel,
        isDir,
        name: slash === -1 ? rel : rel.slice(slash + 1),
        dir: slash === -1 ? '' : rel.slice(0, slash),
        missing: !isDir && !byPath.has(rel),
      };
    });
  }, [tree]);

  // Name matching runs here, on data the client already holds — no request, no debounce.
  const nameHits = useMemo(() => {
    if (!query.trim() || !tree) return [];
    return tree.files
      .map((f) => ({ file: f, score: fuzzyScore(query.trim(), f.rel, f.name) }))
      .filter((r): r is { file: (typeof tree.files)[number]; score: number } => r.score !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40);
  }, [query, tree]);

  const authors = useMemo(() => {
    const seen = new Map<string, number>();
    for (const e of props.recents ?? []) if (e.author) seen.set(e.author, (seen.get(e.author) ?? 0) + 1);
    return [...seen].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [props.recents]);

  return (
    <aside class={`sidebar ${state}`}>
      <div class="side-head">
        <button class="icon-btn" onClick={props.onCycleState} title={NEXT_LABEL[state]} aria-label={NEXT_LABEL[state]}>
          <StateIcon />
        </button>
        <span class="brand">
          <button class="mark brand-mark" onClick={props.onAbout} title="About mdhouse" aria-label="About mdhouse" />
          <button class="home-link" onClick={props.onHome} title="What changed here lately">
            {(tree && (props.roots.find((r) => r.id === tree.root.id)?.name ?? tree.root.name)) || 'mdhouse'}
          </button>
          {/* Read and write is the default and says nothing; read-only does. */}
          {/* A Viewer's badge has its own line below: beside the name there is no room for its words. */}
          {!viewer && tree && accessBadge(props.roots.find((r) => r.id === tree.root.id)) && (
            <span class="ro" title="Read-only: mdhouse does not write to this project">
              RO
            </span>
          )}
          {viewer && tree && <StoredRwTag root={props.roots.find((r) => r.id === tree.root.id)} />}
        </span>
        {props.tab === 'files' && (
          <button
            class="icon-btn kind-btn"
            onClick={flipKind}
            title={kind === 'md' ? 'Markdown files — show all files' : 'All files — show Markdown only'}
            aria-label={kind === 'md' ? 'Showing Markdown files; show all files' : 'Showing all files; show Markdown only'}
          >
            {kind === 'md' ? 'MD' : 'ALL'}
          </button>
        )}
        {!wide && (
          <button class="icon-btn" title="Search (/)" onClick={props.onCycleState}>
            <IconSearch />
          </button>
        )}
      </div>

      {viewer && (
        <div class="viewer-strip">
          <ViewerBadge />
        </div>
      )}

      {props.roots.length > 0 && (
        <div class="root-switch">
          {/* A select in both widths: a row of chips wraps into a wall once there are a few
              roots, and the select shows more of each path as the sidebar grows. */}
          <RootSelect
            roots={props.roots}
            rootId={props.rootId}
            onPick={props.onPickRoot}
            above={wide ? 2 : 1}
            max={wide ? 44 : 28}
            actions={PROJECT_ACTIONS}
            onAction={(id) => props.onProjectAction(id as 'add' | 'create')}
          />
        </div>
      )}

      <div class="side-tools">
        {/* Active Team access refuses RAG: Files only. */}
        {wide && !team && <SearchScope value={searchTarget} onPick={props.onSearchTarget} />}
        {wide && (
          <div class="search-box">
            <span class="mag">
              <IconSearch size={14} />
            </span>
            <input
              type="search"
              placeholder={placeholder(searchTarget)}
              value={query}
              data-search-input
              onInput={(e) => props.onQuery((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') props.onQuery('');
                else if (e.key === 'Enter' && searchTarget === 'index') {
                  e.preventDefault();
                  props.onIndexSearch(query);
                }
              }}
            />
            {query && (
              <button class="clear" title="Clear" onClick={() => props.onQuery('')}>
                <IconX size={13} />
              </button>
            )}
          </div>
        )}

        <div class={`tabs${wide ? '' : ' icons'}`} role="tablist">
          {TABS.map(({ id, label, title, Icon }) => (
            <button
              key={id}
              role="tab"
              title={title}
              aria-label={title}
              aria-selected={!query && props.tab === id}
              onClick={() => props.onTab(id)}
            >
              <Icon size={wide ? 12 : 14} />
              {wide && <span>{label}</span>}
            </button>
          ))}
          {VIEW_IDS.map((id) => {
            const n = props.views[id].length;
            // V1 is always there to start with; V2 shows once it holds something
            if (id === 'V2' && !n && props.tab !== id) return null;
            return (
              <button
                key={id}
                role="tab"
                class="view-tab"
                title={n ? `View ${id}: ${n} folder${n === 1 ? '' : 's'} / file${n === 1 ? '' : 's'} — the tree narrowed to them` : `View ${id} — empty: add folders and files with +${id} on a page's title or its breadcrumbs`}
                aria-selected={!query && props.tab === id}
                onClick={() => props.onTab(id)}
              >
                <IconView n={id.slice(1)} size={wide ? 13 : 15} />
                {n > 0 && <span class="n">{n}</span>}
              </button>
            );
          })}
        </div>

        {query && wide && searchTarget === 'files' && (
          <div class="filters">
            <button class="chip" aria-pressed={props.searchIn.names} onClick={() => props.onSearchIn('names')}>
              names
            </button>
            <button class="chip" aria-pressed={props.searchIn.text} onClick={() => props.onSearchIn('text')}>
              contents
            </button>
            <span class="filler" />
            <button
              class="chip"
              aria-pressed={props.searchScope === 'recent'}
              onClick={() => props.onSearchScope('recent')}
              title="Only files that are uncommitted or recently committed"
            >
              <IconClock size={11} /> recent
            </button>
            <button
              class="chip"
              aria-pressed={props.searchScope === 'mine'}
              onClick={() => props.onSearchScope('mine')}
              title="Only my uncommitted work and my recent commits"
            >
              <IconUser size={11} /> mine
            </button>
          </div>
        )}

        {!query && wide && (
          <div class="filters">
            {props.tab === 'recent' && authors.length > 1 && (
              <select value={props.authorFilter} onChange={(e) => props.onAuthor((e.target as HTMLSelectElement).value)}>
                <option value="">everyone</option>
                {tree?.user?.name && <option value={tree.user.name}>mine</option>}
                {authors
                  .filter((a) => a !== tree?.user?.name)
                  .map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
              </select>
            )}
            {(tree?.hasIgnored || props.showIgnored) && (
              <button class="chip" aria-pressed={props.showIgnored} onClick={props.onToggleIgnored} title="Show Markdown files git ignores, in every folder">
                <IconEyeOff size={11} /> {props.showIgnored ? 'Hide ignored' : 'Show ignored'}
              </button>
            )}
          </div>
        )}
      </div>

      <div class="side-body">
        {query && searchTarget === 'index' ? (
          <p class="empty">Press Enter to search the project's index for “{query}”.</p>
        ) : query ? (
          <SearchResults {...props} sizes={sizes} nameHits={nameHits} />
        ) : props.tab === 'files' || entries ? (
          <>
          {props.revealNote && <p class="empty reveal-note" role="status">⚠️ {props.revealNote}</p>}
          {allTree && !listing && tree && <p class="empty">Listing every file…</p>}
          {listing && 'error' in listing && <p class="empty" role="status">⚠️ Could not list every file ({listing.error}) — showing Markdown.</p>}
          {listing && 'capped' in listing && listing.capped && <p class="empty" role="status">⚠️ Too many files: only the first 5000 are listed.</p>}
          {entries && !nodes.length ? (
            <p class="empty">View {props.tab} is empty — add folders and files with +{props.tab} on a page's title or its breadcrumbs.</p>
          ) : tree ? (
            <Tree
              nodes={nodes}
              expanded={props.expanded}
              current={props.current}
              compact={!wide}
              onToggleDir={props.onToggleDir}
              onOpenDirPage={props.onOpenDirPage}
              onOpen={props.onOpen}
              fileUrl={props.fileUrl}
              onMark={props.onMark}
            />
          ) : (
            <p class="empty">Scanning…</p>
          )}
          </>
        ) : props.tab === 'favorites' ? (
          <Favorites {...props} sizes={sizes} favorites={favorites} />
        ) : (
          <Recents {...props} sizes={sizes} />
        )}
      </div>

      <div class="side-foot">
        <span class={`dot ${props.live ? 'live' : 'lost'}`} title={props.live ? 'Live — watching for changes' : 'Reconnecting…'} />
        {tree && (
          <span>
            {entries || listing ? shown.length : tree.files.length} files{tree.repos > 1 ? ` · ${tree.repos} repos` : ''}
          </span>
        )}
        {tree?.degraded && <span title="git was unavailable; the list came from a filesystem walk">no git</span>}
        {team && props.teamMe?.kind === 'user' && (
          <span class="team-me">
            <span aria-hidden="true">👤</span> <b title={props.teamMe.user.name ?? undefined}>{props.teamMe.user.login}</b>{' '}
            <button type="button" class="linklike" onClick={props.onLogout}>
              Log out
            </button>
          </span>
        )}
        {team && props.teamMe?.kind === 'login' && (
          <a class="team-me" href={props.teamMe.login}>
            Sign in
          </a>
        )}
      </div>
    </aside>
  );
}

/** File sizes by root-relative path, for the small-file marks in the lists. */
type Sizes = Map<string, number>;

/** ` tiny` / ` small` for a list row, so its name can be struck through like the tree's. */
const sizeCls = (sizes: Sizes, rel: string) => {
  const c = sizeClass(sizes.get(rel) ?? 1000);
  return c ? ` ${c}` : '';
};

interface FavEntry {
  rel: string;
  name: string;
  dir: string;
  isDir: boolean;
  /** Favorited but no longer in the tree — deleted, or hidden by the ignored filter. */
  missing: boolean;
}

function Favorites(props: SidebarProps & { sizes: Sizes; favorites: FavEntry[] }) {
  if (!props.tree) return <p class="empty">Loading…</p>;
  if (!props.favorites.length) {
    return <p class="empty">No favorites yet. Hover a file in the tree and press the star.</p>;
  }

  return (
    <div>
      {props.favorites.map((f) => {
        const cls = `hit${f.missing ? ' muted' : ''}${sizeCls(props.sizes, f.rel)}`;
        const title = f.missing ? `${f.rel} — not in the current tree` : f.rel;
        const body = (
          <>
            <HitPath
              name={f.isDir ? `${f.name}/` : f.name}
              dir={f.dir} lead={f.isDir && <IconFolder size={12} />}
              tail={<SizeMark size={props.sizes.get(f.rel)} end />}
            />
            {f.missing && <span class="meta">missing</span>}
          </>
        );
        return f.isDir ? (
          <button key={f.rel} class={cls} onClick={() => props.onTab('files')} title={title}>
            {body}
          </button>
        ) : (
          <FileHit key={f.rel} fileUrl={props.fileUrl} onOpen={props.onOpen} rel={f.rel} class={cls} title={title}>
            {body}
          </FileHit>
        );
      })}
    </div>
  );
}

/** A list row that opens a document — a real link, so a middle click opens a tab. */
function FileHit(p: {
  fileUrl: (rel: string) => string;
  onOpen: (rel: string, line?: number) => void;
  rel: string;
  line?: number;
  class: string;
  title: string;
  children: preact.ComponentChildren;
}) {
  return (
    <a class={p.class} href={p.fileUrl(p.rel)} title={p.title} onClick={(e) => follow(e, () => p.onOpen(p.rel, p.line))}>
      {p.children}
    </a>
  );
}

/** Uncommitted work is yours by definition — nobody else's edits are in your working tree. */
function isMine(e: RecentEntry, me: { name: string; email: string } | null): boolean {
  if (e.uncommitted) return true;
  if (!me) return false;
  return me.email ? e.email === me.email : e.author === me.name;
}

/**
 * The file name plus its location. A compact sidebar has no room for the full directory, but
 * a list of DONE.md / TODO.md rows is useless without it — so compact shows the parent folder
 * alone (CSS picks which of the two is visible).
 */
function HitPath({
  name,
  dir,
  lead,
  tail,
}: {
  name: string;
  dir: string;
  lead?: preact.JSX.Element | false;
  tail?: preact.JSX.Element;
}) {
  const parent = dir ? dir.slice(dir.lastIndexOf('/') + 1) : '';
  return (
    <span class="hit-path">
      {lead}
      <span class="hit-name">{docName(name)}</span>
      {parent && (
        <span class="hit-parent" title={dir}>
          {parent}
        </span>
      )}
      <span class="hit-dir">{dir}</span>
      {tail}
    </span>
  );
}

/**
 * The containing directory, on its own line, with the folder the file actually sits in picked
 * out — in a list of `README.md` rows from a dozen plan folders, that last segment is the
 * only part carrying information.
 */
function DirLine({ dir }: { dir: string }) {
  const cut = dir.lastIndexOf('/');
  return (
    <div class="recent-dir" title={dir}>
      {cut !== -1 && <span class="lead">{dir.slice(0, cut + 1)}</span>}
      <b>{cut === -1 ? dir : dir.slice(cut + 1)}</b>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  modified: 'modified',
  untracked: 'new',
  staged: 'staged',
};

function Recents(props: SidebarProps & { sizes: Sizes }) {
  const all = props.recents;
  if (!all) return <p class="empty">Loading…</p>;

  const me = props.tree?.user ?? null;
  const entries =
    props.tab === 'mine'
      ? all.filter((e) => isMine(e, me))
      : props.authorFilter
        ? all.filter((e) => e.author === props.authorFilter)
        : all;

  if (!entries.length) {
    return (
      <p class="empty">
        {props.tab === 'mine'
          ? me
            ? `Nothing uncommitted, and nothing from ${me.name} in the last commits.`
            : 'No git identity here — set user.email to see your own work.'
          : 'Nothing here yet.'}
      </p>
    );
  }

  return (
    <div>
      {entries.map((e) => (
        <FileHit
          fileUrl={props.fileUrl}
          onOpen={props.onOpen}
          class={`hit recent${gitStateClass(e)}${e.uncommitted ? ` uncommitted ${shownStatus(e.status) ?? ''}` : ''}${sizeCls(props.sizes, e.rel)}`}
          key={`${e.rel}-${e.hash ?? e.at}`}
          rel={e.rel}
          title={e.uncommitted ? `${e.rel} — ${shownStatus(e.status) ?? 'changed'}, not committed` : e.rel}
        >
          <span class="recent-head">
            {/* Everything in Mine is mine — the marker only carries information on Recent. */}
            {props.tab !== 'mine' && isMine(e, me) && (
              <span class="mine" title="yours" aria-label="yours">
                ❖
              </span>
            )}
            <span class="hit-name">{docName(e.name)}</span>
            <span class="meta">
              <GitStateBadge item={e} />
              {e.uncommitted && shownStatus(e.status) && <span class="tag">{STATUS_LABEL[e.status ?? ''] ?? e.status}</span>}
              <Ago at={e.at} />
              {e.author && props.tab !== 'mine' && <span class="who">{e.author}</span>}
              <SizeMark size={props.sizes.get(e.rel)} end />
            </span>
          </span>

          {e.dir && <DirLine dir={e.dir} />}
          {e.subject && (
            <div class="hit-line" title={e.subject}>
              {e.subject}
            </div>
          )}
        </FileHit>
      ))}
    </div>
  );
}

function SearchResults(props: SidebarProps & { sizes: Sizes; nameHits: Array<{ file: { rel: string; name: string; dir: string } }> }) {
  const { search, searching, searchIn, searchScope } = props;

  /**
   * The scope filters reuse the recents payload rather than asking the server for a second
   * opinion: it already says what is uncommitted and who committed what, and it is the same
   * set the Recent and Mine tabs show, so "search within recent" means exactly what the
   * neighbouring tab means.
   */
  const inScope = useMemo<((rel: string) => boolean) | null>(() => {
    if (searchScope === 'all') return null;
    const me = props.tree?.user ?? null;
    const entries = props.recents ?? [];
    const allowed = new Set(
      (searchScope === 'mine' ? entries.filter((e) => isMine(e, me)) : entries).map((e) => e.rel),
    );
    return (rel) => allowed.has(rel);
  }, [searchScope, props.recents, props.tree]);

  const nameHits = inScope ? props.nameHits.filter((h) => inScope(h.file.rel)) : props.nameHits;
  const textHits = search ? (inScope ? search.hits.filter((h) => inScope(h.rel)) : search.hits) : [];
  const pending = props.recents === null && searchScope !== 'all';

  if (pending) return <p class="empty">Loading…</p>;

  return (
    <div>
      {searchIn.names && (
        <>
          <div class="group-title">Files</div>
          {!nameHits.length && <p class="empty">No file names match.</p>}
          {nameHits.map(({ file }) => (
            <FileHit fileUrl={props.fileUrl} onOpen={props.onOpen} class={`hit${sizeCls(props.sizes, file.rel)}`} key={file.rel} rel={file.rel} title={file.rel}>
              <HitPath
                name={file.name}
                dir={file.dir}
                tail={<SizeMark size={props.sizes.get(file.rel)} end />}
              />
            </FileHit>
          ))}
        </>
      )}

      {searchIn.text && (
        <div class="group-title">
          In contents {searching && <span class="spinner" style={{ display: 'inline-block', verticalAlign: -2 }} />}
          {search?.degraded && (
            <span class="search-degraded" title="ripgrep (rg) was not found: the built-in search ran instead — slower on a large tree">
              no ripgrep
            </span>
          )}
        </div>
      )}

      {searchIn.text && search && !textHits.length && !searching && <p class="empty">No matches.</p>}

      {searchIn.text &&
        textHits.map((hit, i) => (
        <FileHit
          fileUrl={props.fileUrl}
          onOpen={props.onOpen}
          class={`hit${sizeCls(props.sizes, hit.rel)}`}
          key={`${hit.rel}:${hit.line}:${i}`} rel={hit.rel} line={hit.line} title={hit.rel}>
          <HitPath
            name={hit.rel.split('/').pop()!}
            dir={hit.rel.split('/').slice(0, -1).join('/')}
            tail={<SizeMark size={props.sizes.get(hit.rel)} end />}
          />
          <div class="hit-line">
            {highlightRanges(hit.text, hit.ranges).map((part, n) =>
              part.hit ? <mark key={n}>{part.text}</mark> : <span key={n}>{part.text}</span>,
            )}
          </div>
        </FileHit>
      ))}

      {searchIn.text && search?.truncated && <p class="empty">More matches exist — narrow the search.</p>}
    </div>
  );
}
