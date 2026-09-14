import { useMemo } from 'preact/hooks';
import type { RootInfo } from './api';
import type { TreePayload, RecentEntry } from '../lib/store';
import type { SearchResult } from '../lib/search';
import type { Mark } from '../lib/prefs';
import { buildTree, fuzzyScore, type Node } from './tree-model';
import { Tree } from './Tree';
import { timeAgo, highlightRanges } from './format';
import {
  IconSearch, IconX, IconPanel, IconPanelWide, IconPanelOff,
  IconClock, IconDoc, IconStar, IconEyeOff, IconFolder, IconUser,
} from './icons';

export type SidebarState = 'off' | 'compact' | 'open';
export type Tab = 'files' | 'favorites' | 'recent' | 'mine';

/**
 * The tab strip is present in compact as well as open — switching to recents or favorites
 * must not require widening the sidebar first. Compact drops the labels and keeps the icons.
 */
const TABS: Array<{ id: Tab; label: string; title: string; Icon: (p: { size?: number }) => preact.JSX.Element }> = [
  { id: 'files', label: 'Files', title: 'All files', Icon: IconDoc },
  { id: 'favorites', label: 'Favs', title: 'Favorites', Icon: (p) => <IconStar {...p} filled /> },
  { id: 'recent', label: 'Recent', title: 'Uncommitted, then recently committed', Icon: IconClock },
  { id: 'mine', label: 'Mine', title: 'My uncommitted work and my recent commits', Icon: IconUser },
];

/** The tabs that read the recents list. 'mine' is a filter over the same payload. */
export const WANTS_RECENTS = new Set<Tab>(['recent', 'mine']);

export interface SidebarProps {
  state: SidebarState;
  roots: RootInfo[];
  rootId: string;
  tree: TreePayload | null;
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
  onAuthor: (author: string) => void;
  onToggleIgnored: () => void;
  onToggleDir: (path: string) => void;
  onOpen: (path: string, line?: number) => void;
  onMark: (path: string, mark: Mark, on: boolean) => void;
}

const STATE_ICON = { off: IconPanelOff, compact: IconPanel, open: IconPanelWide };
/** What the toggle will do next, following the off -> compact -> open -> off cycle. */
const NEXT_LABEL: Record<SidebarState, string> = {
  off: 'Show sidebar',
  compact: 'Widen sidebar',
  open: 'Hide sidebar',
};

export function Sidebar(props: SidebarProps) {
  const { state, tree, query } = props;
  const wide = state === 'open';
  const StateIcon = STATE_ICON[state];

  const nodes = useMemo<Node[]>(() => (tree ? buildTree(tree.files) : []), [tree]);

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
          {tree?.root.name ?? 'mdhouse'}
          {tree && !tree.root.writable && <span class="ro">read-only</span>}
        </span>
        {!wide && (
          <button class="icon-btn" title="Search (/)" onClick={props.onCycleState}>
            <IconSearch />
          </button>
        )}
      </div>

      {wide && props.roots.length > 1 && (
        <div class="root-switch">
          {props.roots.map((r) => (
            <button key={r.id} aria-pressed={r.id === props.rootId} onClick={() => props.onPickRoot(r.id)} title={r.path}>
              {r.name}
            </button>
          ))}
        </div>
      )}

      <div class="side-tools">
        {wide && (
          <div class="search-box">
            <span class="mag">
              <IconSearch size={14} />
            </span>
            <input
              type="search"
              placeholder="Search files and contents"
              value={query}
              data-search-input
              onInput={(e) => props.onQuery((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => e.key === 'Escape' && props.onQuery('')}
            />
            {query && (
              <button class="clear" title="Clear" onClick={() => props.onQuery('')}>
                <IconX size={13} />
              </button>
            )}
          </div>
        )}

        {!query && (
          <>
            <div class={`tabs${wide ? '' : ' icons'}`} role="tablist">
              {TABS.map(({ id, label, title, Icon }) => (
                <button
                  key={id}
                  role="tab"
                  title={title}
                  aria-label={title}
                  aria-selected={props.tab === id}
                  onClick={() => props.onTab(id)}
                >
                  <Icon size={wide ? 12 : 14} />
                  {wide && <span>{label}</span>}
                </button>
              ))}
            </div>

            {wide && (
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
                <button class="chip" aria-pressed={props.showIgnored} onClick={props.onToggleIgnored} title="Show files git ignores">
                  <IconEyeOff size={11} /> ignored
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div class="side-body">
        {query ? (
          <SearchResults {...props} nameHits={nameHits} />
        ) : props.tab === 'files' ? (
          tree ? (
            <Tree
              nodes={nodes}
              expanded={props.expanded}
              current={props.current}
              compact={!wide}
              onToggleDir={props.onToggleDir}
              onOpen={props.onOpen}
              onMark={props.onMark}
            />
          ) : (
            <p class="empty">Scanning…</p>
          )
        ) : props.tab === 'favorites' ? (
          <Favorites {...props} favorites={favorites} />
        ) : (
          <Recents {...props} />
        )}
      </div>

      <div class="side-foot">
        <span class={`dot ${props.live ? 'live' : 'lost'}`} title={props.live ? 'Live — watching for changes' : 'Reconnecting…'} />
        {tree && (
          <span>
            {tree.files.length} files{tree.repos > 1 ? ` · ${tree.repos} repos` : ''}
          </span>
        )}
        {tree?.degraded && <span title="git was unavailable; the list came from a filesystem walk">no git</span>}
      </div>
    </aside>
  );
}

interface FavEntry {
  rel: string;
  name: string;
  dir: string;
  isDir: boolean;
  /** Favorited but no longer in the tree — deleted, or hidden by the ignored filter. */
  missing: boolean;
}

function Favorites(props: SidebarProps & { favorites: FavEntry[] }) {
  if (!props.tree) return <p class="empty">Loading…</p>;
  if (!props.favorites.length) {
    return <p class="empty">No favorites yet. Hover a file in the tree and press the star.</p>;
  }

  return (
    <div>
      {props.favorites.map((f) => (
        <button
          key={f.rel}
          class={`hit${f.missing ? ' muted' : ''}`}
          onClick={() => (f.isDir ? props.onTab('files') : props.onOpen(f.rel))}
          title={f.missing ? `${f.rel} — not in the current tree` : f.rel}
        >
          <HitPath name={f.isDir ? `${f.name}/` : f.name} dir={f.dir} lead={f.isDir && <IconFolder size={12} />} />
          {f.missing && <span class="meta">missing</span>}
        </button>
      ))}
    </div>
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
function HitPath({ name, dir, lead }: { name: string; dir: string; lead?: preact.JSX.Element | false }) {
  const parent = dir ? dir.slice(dir.lastIndexOf('/') + 1) : '';
  return (
    <span class="hit-path">
      {lead}
      <span class="hit-name">{name}</span>
      {parent && (
        <span class="hit-parent" title={dir}>
          {parent}
        </span>
      )}
      <span class="hit-dir">{dir}</span>
    </span>
  );
}

const STATUS_LABEL: Record<string, string> = {
  modified: 'modified',
  untracked: 'new',
  staged: 'staged',
};

function Recents(props: SidebarProps) {
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
        <button
          class={`hit${e.uncommitted ? ` uncommitted ${e.status}` : ''}`}
          key={`${e.rel}-${e.hash ?? e.at}`}
          onClick={() => props.onOpen(e.rel)}
          title={e.uncommitted ? `${e.rel} — ${e.status}, not committed` : e.rel}
        >
          <HitPath
            name={e.name}
            dir={e.dir}
            /* Everything in Mine is mine — the marker only carries information on Recent. */
            lead={
              props.tab !== 'mine' &&
              isMine(e, me) && (
                <span class="mine" title="yours" aria-label="yours">
                  ❖
                </span>
              )
            }
          />
          <span class="meta">
            {e.uncommitted && <span class="tag">{STATUS_LABEL[e.status ?? ''] ?? e.status}</span>}
            <span>{timeAgo(e.at)}</span>
            {e.author && props.tab !== 'mine' && <span class="who">{e.author}</span>}
          </span>
          {e.subject && <div class="hit-line">{e.subject}</div>}
        </button>
      ))}
    </div>
  );
}

function SearchResults(props: SidebarProps & { nameHits: Array<{ file: { rel: string; name: string; dir: string } }> }) {
  const { search, searching, nameHits } = props;

  return (
    <div>
      {nameHits.length > 0 && (
        <>
          <div class="group-title">Files</div>
          {nameHits.map(({ file }) => (
            <button class="hit" key={file.rel} onClick={() => props.onOpen(file.rel)} title={file.rel}>
              <span class="hit-path">
                <span class="hit-name">{file.name}</span>
                <span class="hit-dir">{file.dir}</span>
              </span>
            </button>
          ))}
        </>
      )}

      <div class="group-title">
        In contents {searching && <span class="spinner" style={{ display: 'inline-block', verticalAlign: -2 }} />}
      </div>

      {search && !search.hits.length && !searching && <p class="empty">No matches.</p>}

      {search?.hits.map((hit, i) => (
        <button class="hit" key={`${hit.rel}:${hit.line}:${i}`} onClick={() => props.onOpen(hit.rel, hit.line)} title={hit.rel}>
          <span class="hit-path">
            <span class="hit-name">{hit.rel.split('/').pop()}</span>
            <span class="hit-dir">{hit.rel.split('/').slice(0, -1).join('/')}</span>
          </span>
          <div class="hit-line">
            {highlightRanges(hit.text, hit.ranges).map((part, n) =>
              part.hit ? <mark key={n}>{part.text}</mark> : <span key={n}>{part.text}</span>,
            )}
          </div>
        </button>
      ))}

      {search?.truncated && <p class="empty">More matches exist — narrow the search.</p>}
    </div>
  );
}
