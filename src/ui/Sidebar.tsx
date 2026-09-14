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
  IconClock, IconGit, IconDoc, IconStar, IconEyeOff,
} from './icons';

export type SidebarState = 'off' | 'compact' | 'open';
export type Tab = 'files' | 'fs' | 'git';

export interface SidebarProps {
  state: SidebarState;
  roots: RootInfo[];
  rootId: string;
  tree: TreePayload | null;
  tab: Tab;
  query: string;
  search: SearchResult | null;
  searching: boolean;
  recents: Record<'fs' | 'git', RecentEntry[] | null>;
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

  const favorites = useMemo(
    () => (tree?.files ?? []).filter((f) => f.marks?.includes('favorite')),
    [tree],
  );

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
    for (const e of props.recents.git ?? []) if (e.author) seen.set(e.author, (seen.get(e.author) ?? 0) + 1);
    return [...seen].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [props.recents.git]);

  return (
    <aside class="sidebar">
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

      {wide && (
        <div class="side-tools">
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

          {!query && (
            <>
              <div class="tabs" role="tablist">
                <button role="tab" aria-selected={props.tab === 'files'} onClick={() => props.onTab('files')}>
                  <IconDoc size={12} /> Files
                </button>
                <button role="tab" aria-selected={props.tab === 'fs'} onClick={() => props.onTab('fs')}>
                  <IconClock size={12} /> Recent
                </button>
                <button role="tab" aria-selected={props.tab === 'git'} onClick={() => props.onTab('git')}>
                  <IconGit size={12} /> Git
                </button>
              </div>

              <div class="filters">
                {props.tab === 'git' && authors.length > 1 && (
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
            </>
          )}
        </div>
      )}

      <div class="side-body">
        {query ? (
          <SearchResults {...props} nameHits={nameHits} />
        ) : props.tab === 'files' ? (
          <>
            {wide && favorites.length > 0 && (
              <>
                <div class="group-title">Favorites</div>
                {favorites.map((f) => (
                  <button
                    key={f.rel}
                    class="row file fav"
                    style={{ '--indent': '8px' }}
                    aria-current={props.current === f.rel ? 'true' : undefined}
                    onClick={() => props.onOpen(f.rel)}
                    title={f.rel}
                  >
                    <span class="twist" />
                    <span class="ico">
                      <IconStar size={14} filled />
                    </span>
                    <span class="label">{f.name}</span>
                  </button>
                ))}
                <div class="group-title">All files</div>
              </>
            )}
            {tree ? (
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
            )}
          </>
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

function Recents(props: SidebarProps) {
  const kind = props.tab === 'git' ? 'git' : 'fs';
  const all = props.recents[kind];
  if (!all) return <p class="empty">Loading…</p>;

  const entries = kind === 'git' && props.authorFilter ? all.filter((e) => e.author === props.authorFilter) : all;
  if (!entries.length) return <p class="empty">Nothing here yet.</p>;

  return (
    <div>
      {entries.map((e) => (
        <button class="hit" key={`${e.rel}-${e.hash ?? e.at}`} onClick={() => props.onOpen(e.rel)} title={e.rel}>
          <span class="hit-path">
            <span class="hit-name">{e.name}</span>
            <span class="hit-dir">{e.dir}</span>
          </span>
          <span class="meta">
            <span>{timeAgo(e.at)}</span>
            {e.author && <span class="who">{e.author}</span>}
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
