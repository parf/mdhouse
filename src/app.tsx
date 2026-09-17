import { render } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api, connectLive, type DocPayload, type LiveMessage, type RootInfo } from './ui/api';
import type { TreePayload, RecentEntry } from './lib/store';
import type { SearchResult } from './lib/search';
import type { Mark } from './lib/prefs';
import { Sidebar, WANTS_RECENTS, type SidebarState, type Tab, type SearchIn, type SearchScope } from './ui/Sidebar';
import { Doc } from './ui/Doc';
import { RootSelect } from './ui/RootSelect';
import { Home } from './ui/Home';
import { ancestors } from './ui/tree-model';
import { IconPanel, IconSearch } from './ui/icons';

const STATES: SidebarState[] = ['off', 'compact', 'open'];
const LS_STATE = 'mdhouse.sidebar';
const LS_IGNORED = 'mdhouse.ignored';

const load = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
};
const save = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private window, blocked storage — the app still works */
  }
};

function App() {
  const [roots, setRoots] = useState<RootInfo[]>([]);
  const [rootId, setRootId] = useState('');
  const [tree, setTree] = useState<TreePayload | null>(null);
  const [doc, setDoc] = useState<DocPayload | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [jumpLine, setJumpLine] = useState<number | null>(null);

  const [sidebar, setSidebar] = useState<SidebarState>(() => load<SidebarState>(LS_STATE, 'compact'));
  const [showIgnored, setShowIgnored] = useState(() => load(LS_IGNORED, false));
  const [tab, setTab] = useState<Tab>('files');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  /** Bumped by every live event, so the front page can refetch without a prop for each field. */
  const [revision, setRevision] = useState(0);

  const [query, setQuery] = useState('');
  const [searchIn, setSearchIn] = useState<SearchIn>({ names: true, text: true });
  const [searchScope, setSearchScope] = useState<SearchScope>('all');
  const [search, setSearch] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [recents, setRecents] = useState<RecentEntry[] | null>(null);
  const [authorFilter, setAuthorFilter] = useState('');
  const [live, setLive] = useState(false);

  const [path, setPath] = useState(() => location.pathname);
  const docPath = path.startsWith('/d/') ? path.slice(3) : '';

  /** Navigate without a page load. */
  const go = useCallback((url: string, line?: number) => {
    setJumpLine(line ?? null);
    if (url !== location.pathname + location.hash) history.pushState(null, '', url);
    setPath(location.pathname);
  }, []);

  useEffect(() => {
    const onPop = () => {
      setJumpLine(null);
      setPath(location.pathname);
    };
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => save(LS_STATE, sidebar), [sidebar]);
  useEffect(() => save(LS_IGNORED, showIgnored), [showIgnored]);

  // ── data ────────────────────────────────────────────────────────────────

  useEffect(() => {
    void api.roots().then(({ roots }) => {
      setRoots(roots);
      // `?root=<id>` picks which tree to land on — what a second `mdhouse <dir>` prints when
      // the daemon it handed the directory to was already serving something else.
      const asked = new URLSearchParams(location.search).get('root');
      const wanted = roots.find((r) => r.id === asked)?.id;
      setRootId((current) => current || wanted || (roots[0]?.id ?? ''));
    });
  }, []);

  const reloadTree = useCallback(async () => {
    if (!rootId) return;
    setTree(await api.tree(rootId, showIgnored).catch(() => null));
  }, [rootId, showIgnored]);

  useEffect(() => {
    void reloadTree();
  }, [reloadTree]);

  const reloadRecents = useCallback(async () => {
    if (!rootId) return;
    const { entries } = await api.recents(rootId, showIgnored).catch(() => ({ entries: [] }));
    setRecents(entries);
  }, [rootId, showIgnored]);

  // Recents and Mine read the same list — the second is a filter over the first, so switching
  // between them costs no request.
  // The scope filters read the same list, so a search that narrows to recent or mine needs
  // it loaded even when the recents tab was never opened.
  useEffect(() => {
    if (WANTS_RECENTS.has(tab) || searchScope !== 'all') void reloadRecents();
  }, [tab, searchScope, reloadRecents]);

  // Document load, keyed on the URL.
  const loadSeq = useRef(0);
  useEffect(() => {
    if (!docPath) {
      setDoc(null);
      setDocError(null);
      return;
    }
    const seq = ++loadSeq.current;
    setLoadingDoc(true);

    void api
      .doc(docPath)
      .then((payload) => {
        if (seq !== loadSeq.current) return;
        setDoc(payload);
        setDocError(null);
        setRootId(payload.root);
        setExpanded((prev) => new Set([...prev, ...ancestors(payload.rel)]));
        document.title = `${payload.rel.split('/').pop()} · mdhouse`;
      })
      .catch((err: Error) => {
        if (seq !== loadSeq.current) return;
        setDoc(null);
        setDocError(err.message);
      })
      .finally(() => seq === loadSeq.current && setLoadingDoc(false));
  }, [docPath]);

  // Content search is debounced; name matching in the sidebar is instant and local.
  useEffect(() => {
    const q = query.trim();
    // With the contents filter off there is nothing to ask the server for: name matching
    // runs on the tree the client already holds.
    if (!q || !rootId || !searchIn.text) {
      setSearch(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      void api
        .search(rootId, q, showIgnored)
        .then(setSearch)
        .catch(() => setSearch(null))
        .finally(() => setSearching(false));
    }, 160);
    return () => clearTimeout(timer);
  }, [query, rootId, showIgnored, searchIn.text]);

  // ── live updates ────────────────────────────────────────────────────────

  // The socket is opened once and kept. The handler changes on nearly every render, so it
  // lives in a ref — putting it in the effect's dependencies would tear the connection down
  // and rebuild it each time a document loaded.
  const onLive = useRef<(msg: LiveMessage) => void>(() => {});
  onLive.current = (msg) => {
    if (msg.t === 'hello' || msg.t === 'pong') return;

    // Another `mdhouse` handed this one a directory: pick up the new root list, but stay
    // where the reader is — the tree they are looking at has not changed.
    if (msg.t === 'roots') {
      void api.roots().then(({ roots }) => setRoots(roots));
      return;
    }

    void reloadTree();
    setRevision((n) => n + 1);
    if (WANTS_RECENTS.has(tab)) void reloadRecents();

    // Refresh the open document only when it is one of the files that actually changed.
    if (msg.t === 'fs' && doc?.rel && msg.paths.includes(doc.rel)) {
      void api
        .doc(docPath)
        .then(setDoc)
        .catch(() => {});
    }
  };

  useEffect(() => connectLive((msg) => onLive.current(msg), setLive), []);

  /**
   * Show a directory in the sidebar tree — what a breadcrumb click means. There is no
   * directory page to navigate to; the tree is the directory view, so open it, expand the
   * path down to that folder and scroll it into sight.
   */
  const revealDir = useCallback((dir: string) => {
    setTab('files');
    setQuery('');
    setSidebar((s) => (s === 'off' ? 'compact' : s));
    setExpanded((prev) => new Set([...prev, dir, ...ancestors(dir)]));
    // After the tree has re-rendered with the newly expanded rows.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const row = document.querySelector<HTMLElement>(`.row.dir[data-dir="${CSS.escape(dir)}"]`);
        row?.scrollIntoView({ block: 'center' });
        row?.classList.add('flash');
        setTimeout(() => row?.classList.remove('flash'), 900);
      }),
    );
  }, []);

  // ── keyboard ────────────────────────────────────────────────────────────

  const cycle = useCallback(() => setSidebar((s) => STATES[(STATES.indexOf(s) + 1) % STATES.length]!), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.matches?.('input, textarea, select');

      if (e.key === 'b' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        cycle();
        return;
      }
      if (typing) return;

      if (e.key === '/' || ((e.key === 'k' || e.key === 'p') && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        setSidebar('open');
        requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[data-search-input]')?.focus());
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [cycle]);

  // ── actions ─────────────────────────────────────────────────────────────

  const openFile = useCallback(
    (rel: string, line?: number) => {
      const root = roots.find((r) => r.id === rootId);
      const prefix = roots.length > 1 && root ? `${root.id}/` : '';
      go(`/d/${(prefix + rel).split('/').map(encodeURIComponent).join('/')}`, line);
    },
    [go, roots, rootId],
  );

  const toggleDir = useCallback((dirPath: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(dirPath) ? next.delete(dirPath) : next.add(dirPath);
      return next;
    });
  }, []);

  const setMark = useCallback(
    async (rel: string, mark: Mark, on: boolean) => {
      await api.setMark(rootId, rel, mark, on);
      await reloadTree();
      if (doc?.rel === rel) {
        setDoc((d) =>
          d ? { ...d, marks: on ? [...new Set([...d.marks, mark])] : d.marks.filter((m) => m !== mark) } : d,
        );
      }
    },
    [rootId, reloadTree, doc?.rel],
  );

  const crumb = useMemo(() => doc?.rel ?? '', [doc?.rel]);

  return (
    <div class="app" data-sidebar={sidebar}>
      {sidebar === 'off' && (
        <div class="topstrip">
          <button class="icon-btn" onClick={cycle} title="Show sidebar (Ctrl+B)" aria-label="Show sidebar">
            <IconPanel />
          </button>
          <span class="brand">{crumb || tree?.root.name || 'mdhouse'}</span>
          <RootSelect roots={roots} rootId={rootId} onPick={setRootId} />
          <button
            class="icon-btn"
            title="Search (/)"
            onClick={() => {
              setSidebar('open');
              requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[data-search-input]')?.focus());
            }}
          >
            <IconSearch />
          </button>
        </div>
      )}

      {sidebar !== 'off' && (
        <Sidebar
          state={sidebar}
          roots={roots}
          rootId={rootId}
          tree={tree}
          tab={tab}
          query={query}
          search={search}
          searching={searching}
          recents={recents}
          authorFilter={authorFilter}
          showIgnored={showIgnored}
          current={doc?.rel ?? null}
          expanded={expanded}
          live={live}
          onCycleState={cycle}
          onPickRoot={setRootId}
          onTab={setTab}
          onQuery={setQuery}
          searchIn={searchIn}
          searchScope={searchScope}
          onSearchIn={(key) =>
            setSearchIn((prev) => {
              const next = { ...prev, [key]: !prev[key] };
              // Turning both off would show nothing at all; flip to the other one instead.
              return next.names || next.text ? next : { names: key !== 'names', text: key !== 'text' };
            })
          }
          onSearchScope={(scope) => setSearchScope((prev) => (prev === scope ? 'all' : scope))}
          onAuthor={setAuthorFilter}
          onToggleIgnored={() => setShowIgnored((v) => !v)}
          onToggleDir={toggleDir}
          onOpen={openFile}
          onMark={setMark}
          onHome={() => go('/')}
        />
      )}

      <main>
        {!docPath ? (
          <Home
            rootId={rootId}
            roots={roots}
            tree={tree}
            showIgnored={showIgnored}
            revision={revision}
            onOpen={openFile}
          />
        ) : (
        <Doc
          doc={doc}
          loading={loadingDoc}
          error={docError}
          jumpLine={jumpLine}
          onNavigate={go}
          onMark={setMark}
          onOpenDir={revealDir}
        />
        )}
      </main>
    </div>
  );
}

render(<App />, document.getElementById('app')!);
