import { render } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api, connectLive, type DocPayload, type LiveMessage, type RootInfo, type Settings as Options } from './ui/api';
import type { TreePayload, RecentEntry } from './lib/store';
import type { SearchResult } from './lib/search';
import type { Mark } from './lib/prefs';
import { Sidebar, WANTS_RECENTS, type SidebarState, type Tab, type SearchIn, type SearchScope } from './ui/Sidebar';
import { Doc } from './ui/Doc';
import { RootSelect } from './ui/RootSelect';
import { Home } from './ui/Home';
import { viewOf } from './ui/PageHead';
import { AboutModal } from './ui/AboutModal';
import { Settings } from './ui/Settings';
import { DirPage } from './ui/DirPage';
import { ancestors } from './ui/tree-model';
import { IconGear, IconPanel, IconSearch } from './ui/icons';

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
  const [home, setHome] = useState<string | undefined>(undefined);
  const [options, setOptions] = useState<Options>({ editLink: true, autoRw: true, me: '' });
  // Until the saved settings arrive, nothing that depends on them is drawn — otherwise a ✎
  // turned off in Settings flashed on every load.
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  useEffect(
    () =>
      void api
        .settings()
        .then(setOptions)
        .catch(() => {})
        .finally(() => setOptionsLoaded(true)),
    [],
  );
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
  const [aboutOpen, setAboutOpen] = useState(false);

  /** Path and query: `?git` on a folder's url is its git view. */
  const [full, setPath] = useState(() => location.pathname + location.search);
  const path = full.split('?')[0] ?? '';
  const gitView = /[?&]git(?:[=&]|$)/.test(full);
  const docPath = path.startsWith('/d/') ? path.slice(3) : '';
  const onSettings = path === '/settings';
  // `/d/<root>/<dir>/` — a trailing slash is a folder's page, not a document. With a single
  // root its own page is plain `/d/`.
  const dirPage = path.startsWith('/d/') && (docPath === '' || docPath.endsWith('/')) ? docPath : null;

  /** Navigate without a page load. */
  const go = useCallback((url: string, line?: number) => {
    setJumpLine(line ?? null);
    if (url !== location.pathname + location.search + location.hash) history.pushState(null, '', url);
    setPath(location.pathname + location.search);
  }, []);

  useEffect(() => {
    const onPop = () => {
      setJumpLine(null);
      setPath(location.pathname + location.search);
    };
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => save(LS_STATE, sidebar), [sidebar]);

  // `/` is the root's git view: `/d/<root>/?git`.
  useEffect(() => {
    if (path !== '/' || !rootId || !roots.length) return;
    const root = roots.find((r) => r.id === rootId);
    const url = `/d/${roots.length > 1 && root ? `${encodeURIComponent(root.id)}/` : ''}?git`;
    history.replaceState(null, '', url);
    setPath(url);
  }, [path, rootId, roots]);
  useEffect(() => save(LS_IGNORED, showIgnored), [showIgnored]);

  // ── data ────────────────────────────────────────────────────────────────

  useEffect(() => {
    void api.roots().then(({ roots, home }) => {
      setRoots(roots);
      setHome(home);
      // `?root=<id>` picks which tree to land on — what a second `mdhouse <dir>` prints when
      // the daemon it handed the directory to was already serving something else.
      const asked = new URLSearchParams(location.search).get('root');
      const wanted = roots.find((r) => r.id === asked)?.id;
      setRootId((current) => current || wanted || (roots[0]?.id ?? ''));
    });
  }, []);

  /**
   * Re-read the served directories. If the one on screen was removed — from the settings page,
   * or by `mdhouse --rm` in a terminal — move to the first that is left.
   */
  const reloadRoots = useCallback(async () => {
    const { roots } = await api.roots();
    setRoots(roots);
    setRootId((current) => (roots.some((r) => r.id === current) ? current : (roots[0]?.id ?? '')));
  }, []);

  // Only the newest tree request may land: switching root while an older answer is in flight
  // would otherwise put the wrong root's tree under the page.
  const treeSeq = useRef(0);
  const reloadTree = useCallback(async () => {
    if (!rootId) return;
    const seq = ++treeSeq.current;
    const next = await api.tree(rootId, showIgnored).catch(() => null);
    if (seq === treeSeq.current) setTree(next);
  }, [rootId, showIgnored]);

  useEffect(() => {
    void reloadTree();
  }, [reloadTree]);

  const recentsSeq = useRef(0);
  const reloadRecents = useCallback(async () => {
    if (!rootId) return;
    const seq = ++recentsSeq.current;
    const { entries } = await api.recents(rootId, showIgnored).catch(() => ({ entries: [] }));
    if (seq === recentsSeq.current) setRecents(entries);
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
    if (!docPath || docPath.endsWith('/')) {
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

  /** Re-reads the open document in place. Skipped while a load is in flight; a newer load wins. */
  const refreshDoc = () => {
    if (!doc || loadingDoc) return;
    const seq = ++loadSeq.current;
    void api
      .doc(docPath)
      .then((payload) => seq === loadSeq.current && setDoc(payload))
      .catch(() => {});
  };

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
    let live = true;
    const timer = setTimeout(() => {
      void api
        .search(rootId, q, showIgnored)
        .then((result) => live && setSearch(result))
        .catch(() => live && setSearch(null))
        .finally(() => live && setSearching(false));
    }, 160);
    return () => {
      live = false;
      clearTimeout(timer);
    };
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
      void reloadRoots();
      return;
    }

    void reloadTree();
    setRevision((n) => n + 1);
    if (WANTS_RECENTS.has(tab)) void reloadRecents();

    // Refresh the open document when it is one of the files that changed, or on any git change
    // in its root — a commit changes its status and history, not its text.
    if ((msg.t === 'fs' && doc?.rel && msg.paths.includes(doc.rel)) || (msg.t === 'git' && msg.root === doc?.root)) {
      refreshDoc();
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

      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setAboutOpen((open) => !open);
        return;
      }

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

  /** A folder page's URL, built the way document URLs are; `''` is the root's own page. */
  const dirPageUrl = useCallback(
    (dir: string, inRoot = rootId) => {
      const root = roots.find((r) => r.id === inRoot);
      const segs = [...(roots.length > 1 && root ? [root.id] : []), ...dir.split('/')].filter(Boolean);
      return `/d/${segs.map((s) => `${encodeURIComponent(s)}/`).join('')}`;
    },
    [roots, rootId],
  );
  const openDirPage = useCallback((dir: string, inRoot?: string) => go(dirPageUrl(dir, inRoot)), [go, dirPageUrl]);

  /**
   * Picking a root in the dropdown. On a folder page the URL names the root, so the page has to
   * move with the pick — changing only the tree left the page waiting for a root it no longer
   * had. Elsewhere the reader stays where they are.
   */
  const pickRoot = useCallback(
    (id: string) => {
      setRootId(id);
      if (dirPage !== null) go(dirPageUrl('', id));
    },
    [dirPage, go, dirPageUrl],
  );

  /**
   * Which root and folder a folder URL names. The first segment is a root id only when more
   * than one root is served — the same rule document URLs follow.
   */
  const dirTarget = useMemo(() => {
    if (dirPage === null) return null;
    const segs = dirPage
      .split('/')
      .filter(Boolean)
      .map((s) => {
        try {
          return decodeURIComponent(s);
        } catch {
          return s;
        }
      });
    const named = roots.length > 1 ? roots.find((r) => r.id === segs[0]) : undefined;
    return { rootId: named?.id ?? rootId, dir: (named ? segs.slice(1) : segs).join('/') };
  }, [dirPage, roots, rootId]);

  // Opening a folder page switches to its root, and opens the folder in the tree.
  useEffect(() => {
    if (!dirTarget) return;
    if (dirTarget.rootId && dirTarget.rootId !== rootId) setRootId(dirTarget.rootId);
    if (dirTarget.dir) setExpanded((prev) => new Set([...prev, dirTarget.dir, ...ancestors(dirTarget.dir)]));
    document.title = `${dirTarget.dir || (roots.find((r) => r.id === dirTarget.rootId)?.name ?? 'root')}/ · mdhouse`;
  }, [dirTarget?.rootId, dirTarget?.dir]);

  // The front page and Settings name themselves; documents and folder pages set their own titles
  // when they load, so a title never outlives the page that set it.
  useEffect(() => {
    if (onSettings) document.title = 'Settings · mdhouse';
    else if (!docPath) document.title = `${tree?.root.name ?? 'mdhouse'} · mdhouse`;
  }, [onSettings, docPath, tree?.root.name]);

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

  const gear = (extra = '') => (
    <button
      class={`icon-btn${extra ? ` ${extra}` : ''}`}
      aria-pressed={onSettings}
      onClick={() => go(onSettings ? '/' : '/settings')}
      title={onSettings ? 'Close settings' : 'Settings'}
      aria-label="Settings"
    >
      <IconGear />
    </button>
  );

  const pageGear = sidebar !== 'off' ? gear() : null;

  // `edit:` plus the file's full path: the root's path is on disk, the document's is under it.
  const docRoot = doc ? roots.find((r) => r.id === doc.root) : undefined;
  // Each segment encoded on its own: `encodeURI` leaves `#` and `?` alone, which cut the path.
  const editHref =
    optionsLoaded && options.editLink && doc && docRoot
      ? `edit:${`${docRoot.path}/${doc.rel}`.split('/').map(encodeURIComponent).join('/')}`
      : null;

  return (
    <div class="app" data-sidebar={sidebar}>
      {sidebar === 'off' && (
        <div class="topstrip">
          <button class="icon-btn" onClick={cycle} title="Show sidebar (Ctrl+B)" aria-label="Show sidebar">
            <IconPanel />
          </button>
          <span class="brand">
            <button class="mark brand-mark" onClick={() => setAboutOpen(true)} title="About mdhouse" aria-label="About mdhouse" />
            {crumb || tree?.root.name || 'mdhouse'}
          </span>
          <RootSelect roots={roots} rootId={rootId} onPick={pickRoot} above="all" max={80} home={home} />
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
          {gear()}
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
          // On a folder page the folder is where the reader is: `dir/` marks it, and every folder
          // above it, just as an open document marks its own.
          current={doc?.rel ?? (dirTarget?.dir ? `${dirTarget.dir}/` : null)}
          expanded={expanded}
          live={live}
          onCycleState={cycle}
          onPickRoot={pickRoot}
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
          onOpenDirPage={openDirPage}
          onOpen={openFile}
          onMark={setMark}
          onHome={() => go('/')}
          onAbout={() => setAboutOpen(true)}
        />
      )}

      <main>
        {/* The ⚙ sits in each page's own header row; with the sidebar off the top bar has it. */}
        {onSettings ? (
          <Settings
            roots={roots}
            onChanged={() => void reloadRoots()}
            gear={pageGear}
            options={options}
            onOptions={setOptions}
            rootUrl={(id) => dirPageUrl('', id)}
            go={go}
          />
        ) : dirTarget && gitView ? (
          <Home
            rootId={dirTarget.rootId}
            roots={roots}
            tree={tree?.root.id === dirTarget.rootId ? tree : null}
            showIgnored={showIgnored}
            revision={revision}
            onOpen={openFile}
            onAbout={() => setAboutOpen(true)}
            gear={pageGear}
            dir={dirTarget.dir}
            dirUrl={dirPageUrl(dirTarget.dir, dirTarget.rootId)}
            crumbUrl={(d) => `${dirPageUrl(d, dirTarget.rootId)}?git`}
            view={viewOf(full.slice(path.length))}
            go={go}
          />
        ) : dirTarget ? (
          <DirPage
            tree={tree?.root.id === dirTarget.rootId ? tree : null}
            dir={dirTarget.dir}
            onOpen={openFile}
            dirUrl={(d) => dirPageUrl(d, dirTarget.rootId)}
            go={go}
            onAbout={() => setAboutOpen(true)}
            gear={pageGear}
            rootId={dirTarget.rootId}
          />
        ) : !docPath ? (
          <Home
            rootId={rootId}
            roots={roots}
            tree={tree}
            showIgnored={showIgnored}
            revision={revision}
            onOpen={openFile}
            onAbout={() => setAboutOpen(true)}
            gear={pageGear}
            dir=""
            dirUrl={dirPageUrl('')}
            crumbUrl={(d) => `${dirPageUrl(d)}?git`}
            view="recent"
            go={go}
          />
        ) : (
        <Doc
          doc={doc}
          loading={loadingDoc}
          error={docError}
          jumpLine={jumpLine}
          onNavigate={go}
          onMark={setMark}
          // A breadcrumb folder opens its own page, and shows itself in the tree.
          // The breadcrumb belongs to the document's root, whatever the dropdown says.
          onOpenDir={(dir) => {
            revealDir(dir);
            openDirPage(dir, doc?.root);
          }}
          onAbout={() => setAboutOpen(true)}
          gear={pageGear}
          rootName={docRoot?.name}
          editHref={editHref}
          onReload={refreshDoc}
          rootDirUrl={dirPageUrl('', doc?.root)}
          onOpenRootDir={() => openDirPage('', doc?.root)}
          rootGitUrl={`${dirPageUrl('', doc?.root)}?git`}
          onOpenRootGit={() => go(`${dirPageUrl('', doc?.root)}?git`)}
        />
        )}
      </main>

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
}

render(<App />, document.getElementById('app')!);
