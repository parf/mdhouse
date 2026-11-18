// First: removes an `#admin=` sign-in fragment before any other module, request or render.
import { adminEntry, onAdminEntry, type AdminEntry } from './ui/admin-entry';
import { render } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { hasUnsaved, openTarget } from './ui/tab-presence';
import { api, connectLive, liveListeners, type DocPayload, type LiveMessage, type RootInfo, type Settings as Options, type UiTree } from './ui/api';
import { pageTitle, rootLabel } from './ui/format';
import { accessBadge, customName } from './ui/project-groups';
import { StoredRwTag, ViewerBadge, ViewerContext } from './ui/viewer';
import { isViewer, VIEWER_DENIED } from './ui/viewer-text';
import { parentScope } from './ui/git-state';
import { docMetadataRevision, docRefreshTicket, liveWritable, mergeDocRefresh } from './ui/doc-refresh';
import { loadTab, loadViews, saveTab, usableTab, noViews, revealNote, revealScopes, saveViews, toggle, type ViewId } from './ui/views';
import { ViewChips } from './ui/ViewChips';
import type { RecentEntry } from './lib/store';
import type { SearchResult } from './lib/search';
import type { Mark } from './lib/prefs';
import { Sidebar, WANTS_RECENTS, type SidebarState, type Tab, type SearchIn, type SearchScope } from './ui/Sidebar';
import { Doc } from './ui/Doc';
import { Home } from './ui/Home';
import { viewOf } from './ui/PageHead';
import { AboutModal } from './ui/AboutModal';
import { Settings } from './ui/Settings';
import { RagPage } from './ui/RagPage';
import { indexUrl, loadTarget, saveTarget, type SearchTarget } from './ui/search-scope';
import { PhoneNav } from './ui/PhoneNav';
import { AutomationPage } from './ui/AutomationPage';
import { onAutomation as wantsAutomation } from './ui/automation-model';
import { FlowPage } from './ui/FlowRun';
import { NewProjectPage } from './ui/NewProjectPage';
import { ChoosePage } from './ui/ChoosePage';
import { UsersPage } from './ui/UsersPage';
import { flowFrom } from './ui/flow-model';
import { MD_EXT } from './lib/filetypes';
import { changeSummary } from './ui/git-state';
import { usePhone } from './ui/phone';
import { ASK_EVENT, ASK_STATE, onChanges } from './ui/nav';
import { DirPage } from './ui/DirPage';
import { ancestors } from './ui/tree-model';
import { dirUrl, editUrl, fileUrl as pageUrl, routeOf } from './lib/urls';
import { IconGear, IconPanel, IconSearch } from './ui/icons';

const STATES: SidebarState[] = ['off', 'compact', 'open'];
/** The width at which the sidebar becomes a drawer (see `max-width: 720px` in app.css). */
const narrowScreen = (): boolean => matchMedia('(max-width: 720px)').matches;
const LS_STATE = 'mdhouse.sidebar';
const LS_IGNORED = 'mdhouse.ignored';
/** Per root, the page last shown in it — a root switch goes back there. */
const LS_LAST = 'mdhouse.lastByRoot';

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

function App({ entry: first }: { entry: AdminEntry }) {
  // The latest sign-in link's outcome; a new object for each, so the same outcome twice still counts.
  const [entry, setEntry] = useState<{ outcome: AdminEntry }>({ outcome: first });
  useEffect(() => onAdminEntry((outcome) => setEntry({ outcome })), []);
  const [roots, setRoots] = useState<RootInfo[]>([]);
  const [options, setOptions] = useState<Options>({ editLink: true, editScheme: 'edit', autoRw: true, me: '' });
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
  // A Viewer drops every control that changes anything; a mode switch elsewhere reaches this tab as a
  // `roots` event, a refused write as VIEWER_DENIED — both re-read the settings.
  const viewer = isViewer(options);
  const rereadSettings = useCallback(() => void api.settings().then(setOptions).catch(() => {}), []);
  useEffect(() => {
    addEventListener(VIEWER_DENIED, rereadSettings);
    return () => removeEventListener(VIEWER_DENIED, rereadSettings);
  }, [rereadSettings]);
  const [rootId, setRootId] = useState('');
  const [tree, setTree] = useState<UiTree | null>(null);
  // The folders the tree request reveals (see `revealScopes`), kept in a ref so a reload always sends the latest.
  const reveal = useRef<string[]>([]);
  const [doc, setDoc] = useState<DocPayload | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [jumpLine, setJumpLine] = useState<number | null>(null);

  // On a phone the sidebar is a drawer over the page: it starts closed, whatever a wider screen saved, and its state is not saved there.
  const [sidebar, setSidebar] = useState<SidebarState>(() => (narrowScreen() ? 'off' : load<SidebarState>(LS_STATE, 'compact')));
  const [showIgnored, setShowIgnored] = useState(() => load(LS_IGNORED, false));
  const [tab, setTab] = useState<Tab>(loadTab);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  /** Bumped by every live event, so the front page can refetch without a prop for each field. */
  const [revision, setRevision] = useState(0);
  /** Bumped when only other files than Markdown change: the sidebar's ALL listing follows it. */
  const [filesRev, setFilesRev] = useState(0);

  const [query, setQuery] = useState('');
  const [searchTarget, setSearchTargetState] = useState<SearchTarget>(loadTarget);
  const setSearchTarget = useCallback((t: SearchTarget) => {
    saveTarget(t);
    setSearchTargetState(t);
  }, []);
  const phone = usePhone();
  // How many files are changed, for the bar's Changes: asked of the project's git view, again whenever the tree moves. No git, no badge.
  const [changeCount, setChangeCount] = useState(0);
  useEffect(() => {
    if (!phone || !rootId) return;
    let live = true;
    api.git(rootId).then(
      (g) => live && setChangeCount(changeSummary(g.dirty ?? []).total),
      () => live && setChangeCount(0),
    );
    return () => {
      live = false;
    };
  }, [phone, rootId, revision]);
  // The page's Agent Bus panel, as its document reports it: the bar's Ask shows when it is open.
  const [askOpen, setAskOpen] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setAskOpen(!!(e as CustomEvent<boolean>).detail);
    addEventListener(ASK_STATE, on);
    return () => removeEventListener(ASK_STATE, on);
  }, []);
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
  const route = useMemo(() => routeOf(path), [path]);
  const docPath = route.kind === 'file' ? route.path : '';
  const currentDocPath = useRef(docPath);
  currentDocPath.current = docPath;
  const onSettings = route.kind === 'settings';
  const onUsers = route.kind === 'users';
  const onRag = route.kind === 'rag';
  const onAutomation = route.kind === 'dir' && !route.dir && wantsAutomation(full.includes('?') ? full.slice(full.indexOf('?')) : '');
  /** Create new Project (TBD): `?new-project` on a project's address. */
  const onNewProject = route.kind === 'dir' && !route.dir && new URLSearchParams(full.includes('?') ? full.slice(full.indexOf('?')) : '').has('new-project');
  /** The choosing page: `?choose=<target>&from=<doc>` on a project's address. */
  const chooseAt = route.kind === 'dir' && !route.dir ? new URLSearchParams(full.includes('?') ? full.slice(full.indexOf('?')) : '') : null;
  const choose = chooseAt?.get('choose') ?? null;
  /** The Run Flow page: `?flow=<from>` on a project's address. */
  const flowAt = route.kind === 'dir' && !route.dir ? flowFrom(full.includes('?') ? full.slice(full.indexOf('?')) : '') : null;

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

  useEffect(() => {
    if (!narrowScreen()) save(LS_STATE, sidebar);
  }, [sidebar]);
  // On a phone, choosing a page from the drawer shows the page: the drawer closes when the address changes.
  const firstPath = useRef(true);
  /** Set by an action that goes to a page and then wants the search box open: the drawer is not closed for that navigation. */
  const wantSearch = useRef(false);
  useEffect(() => {
    if (firstPath.current) firstPath.current = false;
    else if (wantSearch.current) wantSearch.current = false;
    else if (narrowScreen()) setSidebar('off');
  }, [path]);

  // `/` is the root's git view: `/<root>/?git`.
  useEffect(() => {
    if (path !== '/' || !rootId || !roots.length) return;
    const url = `${dirUrl(rootId, '')}?git`;
    history.replaceState(null, '', url);
    setPath(url);
  }, [path, rootId, roots]);
  useEffect(() => save(LS_IGNORED, showIgnored), [showIgnored]);

  // ── data ────────────────────────────────────────────────────────────────

  useEffect(() => {
    void api.roots().then(({ roots }) => {
      setRoots(roots);
      // `?root=<id>` picks which tree to land on — what a second `mdhouse <dir>` prints when
      // the daemon it handed the directory to was already serving something else.
      const asked = new URLSearchParams(location.search).get('root');
      // The root the address names comes first: the remembered tab is checked against the root shown.
      const named = route.kind === 'file' ? missing?.root : dirTarget?.rootId;
      const wanted = (roots.find((r) => r.id === named) ?? roots.find((r) => r.id === asked))?.id;
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
    const next = await api.tree(rootId, showIgnored, reveal.current).catch(() => null);
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
  const metadataSeq = useRef(0);
  const contentCommit = useRef(0);
  useEffect(() => {
    if (!docPath) {
      ++loadSeq.current;
      setDoc(null);
      setDocError(null);
      return;
    }
    const seq = ++loadSeq.current;
    setLoadingDoc(true);

    void api
      .doc(docPath)
      .then((payload) => {
        if (seq !== loadSeq.current || currentDocPath.current !== docPath) return;
        if ('folder' in payload) {
          // `/root/sub` names a folder: its page, in place of this address
          history.replaceState(null, '', payload.folder + location.search);
          setPath(location.pathname + location.search);
          return;
        }
        ++contentCommit.current;
        setDoc(payload);
        setDocError(null);
        setRootId(payload.root);
        setExpanded((prev) => new Set([...prev, ...ancestors(payload.rel)]));
      })
      .catch((err: Error) => {
        if (seq !== loadSeq.current || currentDocPath.current !== docPath) return;
        setDoc(null);
        setDocError(err.message);
        // The tree of the root the address names — its marks may hold the file that is gone.
        if (missing) setRootId(missing.root);
      })
      .finally(() => seq === loadSeq.current && setLoadingDoc(false));
  }, [docPath]);

  /** Explicit reloads refresh semantic context; exact-file notifications can skip unchanged rendering. */
  const refreshDoc = (conditional = false) => {
    if (!doc || !docPath || loadingDoc) return;
    const seq = ++loadSeq.current;
    const path = docPath;
    const ticket = docRefreshTicket(doc, seq);
    const response = conditional && doc.contentHash && /^[a-f0-9]{64}$/.test(doc.contentHash)
      ? api.docConditional(path, doc.contentHash) : api.doc(path);
    void response.then((payload) => {
      if (seq !== loadSeq.current || currentDocPath.current !== path) return;
      if ('folder' in payload) {
        history.replaceState(null, '', payload.folder + location.search);
        setPath(location.pathname + location.search);
        return;
      }
      if ('unchanged' in payload && (payload.kind !== doc.kind || payload.contentHash !== ticket.contentHash)) {
        refreshDoc();
        return;
      }
      ++contentCommit.current;
      setDoc(current => {
        const merged = mergeDocRefresh(current, payload, ticket, loadSeq.current);
        return merged.kind === 'update' ? merged.doc : current;
      });
    }).catch(() => {});
  };

  /** Git notifications update metadata/history only, never the document's body or action token. */
  const refreshDocMetadata = () => {
    if (!doc || !docPath || loadingDoc) return;
    const path = docPath;
    const seq = ++metadataSeq.current;
    const generation = loadSeq.current;
    const commit = contentCommit.current;
    const ticket = docRefreshTicket(doc, generation);
    void api.docMeta(path).then(payload => {
      if (seq !== metadataSeq.current || generation !== loadSeq.current || commit !== contentCommit.current || currentDocPath.current !== path) return;
      if ('folder' in payload || payload.kind !== doc.kind) {
        refreshDoc();
        return;
      }
      setDoc(current => {
        const merged = mergeDocRefresh(current, payload, ticket, loadSeq.current);
        return merged.kind === 'update' ? merged.doc : current;
      });
    }).catch(() => {});
  };

  // Content search is debounced; name matching in the sidebar is instant and local.
  useEffect(() => {
    const q = query.trim();
    // With the contents filter off there is nothing to ask the server for: name matching
    // runs on the tree the client already holds.
    if (!q || !rootId || !searchIn.text || searchTarget !== 'files') {
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
  }, [query, rootId, showIgnored, searchIn.text, searchTarget]);

  /** The root and file a file address names — what a dead mark points at when it fails to open. */
  const missing = useMemo(() => {
    if (route.kind !== 'file') return null;
    const [root = '', ...rel] = route.path
      .slice(1)
      .split('/')
      .map((s) => {
        try {
          return decodeURIComponent(s);
        } catch {
          return s;
        }
      });
    return { root, rel: rel.join('/') };
  }, [route]);
  /** A file that failed to open but is still favorited or muted: the marks to take off. */
  const deadMarks: Mark[] =
    docError && missing && tree?.root.id === missing.root
      ? (['favorite', 'muted'] as const).filter((m) => tree.marks[m].includes(missing.rel))
      : [];

  // ── live updates ────────────────────────────────────────────────────────

  // The socket is opened once and kept. The handler changes on nearly every render, so it
  // lives in a ref — putting it in the effect's dependencies would tear the connection down
  // and rebuild it each time a document loaded.
  const onLive = useRef<(msg: LiveMessage) => void>(() => {});
  onLive.current = (msg) => {
    for (const l of liveListeners) l(msg);
    if (msg.t === 'pong' || msg.t === 'ab') return;
    // Agent Bus control: an in-app document path, and never over unsaved editor text.
    if (msg.t === 'open') {
      const url = openTarget(msg.url);
      if (url && !hasUnsaved()) go(url);
      return;
    }

    // Another `mdhouse` handed this one a directory, or a project was renamed: pick up the new
    // root list, but stay where the reader is — the tree they are looking at has not changed.
    // `hello` opens every connection, including the reconnect that follows each `roots` event;
    // a change made while the socket was down reached no one here, so it re-reads too.
    if (msg.t === 'roots' || msg.t === 'hello') {
      void reloadRoots();
      rereadSettings();
      return;
    }

    // Only other files: the sidebar's ALL listing re-reads; the Markdown tree and the page stand.
    if (msg.t === 'files') {
      if (msg.root === rootId) setFilesRev((n) => n + 1);
      return;
    }

    void reloadTree();
    setRevision((n) => n + 1);
    if (WANTS_RECENTS.has(tab)) void reloadRecents();

    // File notifications may change content; root Git notifications change metadata/history.
    if (doc && msg.root === doc.root) {
      if (msg.t === 'fs' && doc.rel && msg.paths.includes(doc.rel)) refreshDoc(true);
      // Its wikilinks may name another page now: render again, not "unchanged" — the text is the same.
      else if (msg.t === 'fs' && doc.wikilinks && msg.paths.some((p) => p !== doc.rel && MD_EXT.test(p))) refreshDoc();
      else if (msg.t === 'git') refreshDocMetadata();
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
  /** The search box, in the remembered scope: the sidebar wide and its field focused. */
  const openSearch = useCallback(() => {
    setSidebar('open');
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[data-search-input]')?.focus());
  }, []);

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
        openSearch();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [cycle, openSearch]);

  // ── actions ─────────────────────────────────────────────────────────────

  /** A file's page, in the dropdown's root unless named. */
  const fileUrl = useCallback((rel: string, inRoot = rootId) => pageUrl(inRoot, rel), [rootId]);
  const openFile = useCallback((rel: string, line?: number) => go(fileUrl(rel), line), [go, fileUrl]);
  // The page a search of the index came from, for the switch's way back to Files.
  const lastPage = useRef('/');
  useEffect(() => {
    if (!onRag) lastPage.current = full;
  }, [onRag, full]);
  const leaveRag = useCallback(
    (q: string) => {
      setSearchTarget('files');
      setQuery(q);
      wantSearch.current = true;
      go(lastPage.current);
      openSearch();
    },
    [go, openSearch, setSearchTarget],
  );

  /** A folder's page; `''` is the root's own. */
  const dirPageUrl = useCallback((dir: string, inRoot = rootId) => dirUrl(inRoot, dir), [rootId]);
  const openDirPage = useCallback((dir: string, inRoot?: string) => go(dirPageUrl(dir, inRoot)), [go, dirPageUrl]);

  /**
   * Picking a root in the dropdown. On a folder page the URL names the root, so the page has to
   * move with the pick — changing only the tree left the page waiting for a root it no longer
   * had. Elsewhere the reader stays where they are.
   */
  /** A newer pick supersedes an older one still checking its saved page. */
  const pickSeq = useRef(0);
  const pickRoot = useCallback(
    (id: string) => {
      setRootId(id);
      const seq = ++pickSeq.current;
      // back to the root's last page — when there is one and it is still there; else as before
      const asBefore = () => route.kind === 'dir' && go(dirPageUrl('', id));
      const saved = load<Record<string, string>>(LS_LAST, {})[id];
      if (!saved || saved === full) return void asBefore();
      void api.pageExists(saved).then((ok) => {
        if (seq !== pickSeq.current) return;
        if (ok) go(saved);
        else asBefore();
      });
    },
    [route.kind, go, dirPageUrl, full],
  );

  /** Which root and folder a folder page names. */
  const dirTarget = route.kind === 'dir' ? route : null;

  // Opening a folder page switches to its root, and opens the folder in the tree.
  useEffect(() => {
    if (!dirTarget) return;
    if (dirTarget.rootId && dirTarget.rootId !== rootId) setRootId(dirTarget.rootId);
    if (dirTarget.dir) setExpanded((prev) => new Set([...prev, dirTarget.dir, ...ancestors(dirTarget.dir)]));
  }, [dirTarget?.rootId, dirTarget?.dir]);

  // Views V1 / V2, per root: what each holds; their sidebar tabs show the tree narrowed to it.
  const [views, setViews] = useState(loadViews);
  useEffect(() => saveViews(views), [views]);
  // Ignored folders selected in V1 or V2 are listed in the default tree — a view's tab asks for its own only —
  // and so is the folder page shown, or the open document's folder (a deliberate request: it does not depend on what the root holds). The global
  // Show ignored switch is not touched. A changed set reloads the tree (a root switch already does).
  const openDir = dirTarget
    ? !dirTarget.rootId || dirTarget.rootId === rootId
      ? dirTarget.dir
      : null
    : docPath && doc && doc.root === rootId
      ? parentScope(doc.rel)
      : null;
  const revealPlan = revealScopes(views[rootId] ?? noViews(), openDir, tab === 'V1' || tab === 'V2' ? tab : null);
  reveal.current = revealPlan.scopes;
  const revealKey = JSON.stringify([rootId, revealPlan.scopes]);
  const revealFirst = useRef(true);
  useEffect(() => {
    if (revealFirst.current) revealFirst.current = false;
    else void reloadTree();
  }, [revealKey]);
  // the remembered tab is kept when its view still holds something here, else All files
  const tabChecked = useRef(false);
  useEffect(() => {
    if (!rootId || tabChecked.current) return;
    tabChecked.current = true;
    setTab((t) => usableTab(t, views[rootId] ?? noViews()));
  }, [rootId]);
  useEffect(() => {
    if (tabChecked.current) saveTab(tab);
  }, [tab]);
  const toggleView = (root: string, id: ViewId, item: string) =>
    setViews((all) => {
      const mine = all[root] ?? noViews();
      return { ...all, [root]: { ...mine, [id]: toggle(mine[id], item) } };
    });
  /** The view chips for a page's title: a file `rel`, or a folder `dir/`; none for a root's own page. */
  const chipsFor = (root: string, item: string) =>
    root && item && item !== '/' ? <ViewChips item={item} views={views[root] ?? noViews()} onToggle={(id, it) => toggleView(root, id, it)} /> : null;

  // the page shown, remembered for its root
  // — a document by its own address: while the next page loads, the address bar is already its
  useEffect(() => {
    const [id, url] = dirTarget ? [dirTarget.rootId, full] : docPath && doc ? [doc.root, doc.url] : ['', ''];
    if (id) save(LS_LAST, { ...load<Record<string, string>>(LS_LAST, {}), [id]: url });
  }, [doc?.root, doc?.url, dirTarget?.rootId, full]);

  // The tab's title follows the page shown — `pageTitle()`; set again when the roots arrive.
  useEffect(() => {
    // the root's own name, else its path as the switcher shows it
    const rootName = (id: string) => {
      const r = roots.find((x) => x.id === id);
      return r ? (customName(r) ?? rootLabel(r.path)) : '';
    };
    if (onUsers) document.title = 'Users - MDHOUSE';
    else if (onSettings) document.title = pageTitle({ settings: true });
    else if (onRag) document.title = pageTitle({ rag: true });
    else if (dirTarget) document.title = pageTitle({ rel: dirTarget.dir, folder: true, root: rootName(dirTarget.rootId) });
    else if (docPath && doc) document.title = pageTitle({ rel: doc.rel, root: rootName(doc.root) });
    // a document that did not load: named from its address
    else if (docPath) {
      const [id = '', ...rel] = docPath.slice(1).split('/').map((x) => {
        try {
          return decodeURIComponent(x);
        } catch {
          return x;
        }
      });
      document.title = pageTitle({ rel: rel.join('/'), root: rootName(id) });
    }
    else if (!docPath) document.title = pageTitle({ root: rootName(tree?.root.id ?? '') });
  }, [onUsers, onSettings, onRag, docPath, doc?.rel, doc?.root, dirTarget?.rootId, dirTarget?.dir, tree?.root.id, roots]);

  const toggleDir = useCallback((dirPath: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(dirPath) ? next.delete(dirPath) : next.add(dirPath);
      return next;
    });
  }, []);

  /** Marks `rel` in `root` — the dropdown's root unless named. */
  const setMark = useCallback(
    async (rel: string, mark: Mark, on: boolean, root = rootId) => {
      await api.setMark(root, rel, mark, on);
      await reloadTree();
      if (doc?.root === root && doc.rel === rel) {
        setDoc((d) =>
          d ? { ...d, marks: on ? [...new Set([...d.marks, mark])] : d.marks.filter((m) => m !== mark) } : d,
        );
      }
    },
    [rootId, reloadTree, doc?.root, doc?.rel],
  );

  const crumb = useMemo(() => doc?.rel ?? '', [doc?.rel]);

  const gear = (extra = '') => (
    <button
      class={`icon-btn${extra ? ` ${extra}` : ''}`}
      aria-pressed={onSettings || onUsers}
      onClick={() => go(onSettings || onUsers ? '/' : '/settings')}
      title={onSettings ? 'Close settings' : 'Settings'}
      aria-label="Settings"
    >
      <IconGear />
    </button>
  );

  const pageGear = sidebar !== 'off' ? gear() : null;

  // The edit scheme plus the file's full path: the root's path is on disk, the document's is under it.
  // None for reference material: an editor would write it past every check.
  const docRoot = doc ? roots.find((r) => r.id === doc.root) : undefined;
  // A root's name from the live root list, which a rename refreshes; the tree's copy is only a fallback.
  const nameOf = (id: string, fallback: string) => roots.find((r) => r.id === id)?.name ?? fallback;
  // Each segment encoded on its own: `encodeURI` leaves `#` and `?` alone, which cut the path.
  const editHref =
    optionsLoaded && !viewer && options.editLink && doc && docRoot && !doc.reference
      ? editUrl(options.editScheme, `${docRoot.path}/${doc.rel}`)
      : null;

  return (
    <ViewerContext.Provider value={viewer}>
    <div class="app" data-sidebar={sidebar}>
      {sidebar === 'off' && (
        <div class="topstrip">
          <button class="icon-btn" onClick={cycle} title="Show sidebar (Ctrl+B)" aria-label="Show sidebar">
            <IconPanel />
          </button>
          <span class="brand">
            <button class="mark brand-mark" onClick={() => setAboutOpen(true)} title="About mdhouse" aria-label="About mdhouse" />
            {crumb || (tree && nameOf(tree.root.id, tree.root.name)) || 'mdhouse'}
            {/* The sidebar header's access badge, while the sidebar is off. */}
            {!viewer && tree && accessBadge(roots.find((r) => r.id === tree.root.id)) && (
              <span class="ro" title="Read-only: mdhouse does not write to this project">
                RO
              </span>
            )}
            {viewer && tree && <StoredRwTag root={roots.find((r) => r.id === tree.root.id)} />}
          </span>
          {/* Outside the brand, whose name gives way when the line is short: the badge keeps its words. */}
          {viewer && <ViewerBadge />}
          <button
            class="icon-btn"
            title="Search (/)"
            onClick={openSearch}
          >
            <IconSearch />
          </button>
          {gear()}
        </div>
      )}

      {sidebar !== 'off' && (
        <Sidebar
          views={views[rootId] ?? noViews()}
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
          onProjectAction={(a) => go(a === 'add' ? '/settings#add-project' : `${dirUrl(rootId, '')}?new-project`)}
          onTab={(tab) => {
            setQuery('');
            setTab(tab);
          }}
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
          searchTarget={searchTarget}
          onSearchTarget={setSearchTarget}
          onIndexSearch={(q) => {
            setSearchTarget('index');
            go(indexUrl(q, rootId));
          }}
          onAuthor={setAuthorFilter}
          revealNote={revealNote(revealPlan.omitted, tree?.capped)}
          onToggleIgnored={() => setShowIgnored((v) => !v)}
          onToggleDir={toggleDir}
          onOpenDirPage={openDirPage}
          onOpen={openFile}
          fileUrl={fileUrl}
          onMark={setMark}
          onHome={() => go('/')}
          onAbout={() => setAboutOpen(true)}
          filesRev={filesRev}
        />
      )}

      {sidebar !== 'off' && <div class="scrim" onClick={() => setSidebar('off')} />}

      <main>
        {/* The ⚙ sits in each page's own header row; with the sidebar off the top bar has it. */}
        {onRag ? (
          <RagPage search={full.slice(path.length)} rootId={rootId} roots={roots} go={go} gear={pageGear} onFiles={leaveRag} />
        ) : onUsers ? (
          <UsersPage search={full.slice(path.length)} go={go} gear={pageGear} />
        ) : onSettings ? (
          <Settings
            roots={roots}
            onChanged={() => void reloadRoots()}
            gear={pageGear}
            options={options}
            onOptions={setOptions}
            rootUrl={(id) => dirPageUrl('', id)}
            go={go}
            entry={entry}
          />
        ) : choose !== null && dirTarget ? (
          <ChoosePage
            rootId={dirTarget.rootId}
            rootName={nameOf(dirTarget.rootId, tree?.root.name ?? '')}
            target={choose}
            from={chooseAt?.get('from') ?? ''}
            go={go}
            backUrl={chooseAt?.get('from') ? pageUrl(dirTarget.rootId, chooseAt.get('from')!) : dirUrl(dirTarget.rootId, '')}
            rootUrl={dirUrl(dirTarget.rootId, '')}
            gear={pageGear}
          />
        ) : onNewProject && dirTarget ? (
          <NewProjectPage go={go} backUrl={dirUrl(dirTarget.rootId, '')} gear={pageGear} />
        ) : flowAt !== null && dirTarget ? (
          <FlowPage
            rootId={dirTarget.rootId}
            rootName={nameOf(dirTarget.rootId, tree?.root.name ?? '')}
            from={flowAt}
            writable={roots.find((r) => r.id === dirTarget.rootId)?.writable ?? false}
            go={go}
            backUrl={!flowAt ? dirUrl(dirTarget.rootId, '') : flowAt.endsWith('/') ? dirUrl(dirTarget.rootId, flowAt) : pageUrl(dirTarget.rootId, flowAt)}
            gear={pageGear}
          />
        ) : onAutomation && dirTarget ? (
          <AutomationPage rootId={dirTarget.rootId} rootName={nameOf(dirTarget.rootId, tree?.root.name ?? '')} gear={pageGear} />
        ) : dirTarget && gitView ? (
          <Home
            rootId={dirTarget.rootId}
            roots={roots}
            tree={tree?.root.id === dirTarget.rootId ? tree : null}
            showIgnored={showIgnored}
            revision={revision}
            onOpen={openFile}
            fileUrl={fileUrl}
            onAbout={() => setAboutOpen(true)}
            gear={pageGear}
            dir={dirTarget.dir}
            dirUrl={dirPageUrl(dirTarget.dir, dirTarget.rootId)}
            crumbUrl={(d) => `${dirPageUrl(d, dirTarget.rootId)}?git`}
            view={viewOf(full.slice(path.length))}
            go={go}
            chips={chipsFor(dirTarget.rootId, `${dirTarget.dir}/`)}
          />
        ) : dirTarget ? (
          <DirPage
            chips={chipsFor(dirTarget.rootId, `${dirTarget.dir}/`)}
            tree={tree?.root.id === dirTarget.rootId ? tree : null}
            dir={dirTarget.dir}
            onOpen={openFile}
            fileUrl={fileUrl}
            dirUrl={(d) => dirPageUrl(d, dirTarget.rootId)}
            go={go}
            onAbout={() => setAboutOpen(true)}
            gear={pageGear}
            rootId={dirTarget.rootId}
            rootName={nameOf(dirTarget.rootId, tree?.root.name ?? '')}
          />
        ) : !docPath ? (
          <Home
            rootId={rootId}
            roots={roots}
            tree={tree}
            showIgnored={showIgnored}
            revision={revision}
            onOpen={openFile}
            fileUrl={fileUrl}
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
          chips={doc ? chipsFor(doc.root, doc.rel) : null}
          crumbChips={doc && doc.rel.includes('/') ? chipsFor(doc.root, `${doc.rel.slice(0, doc.rel.lastIndexOf('/'))}/`) : null}
          doc={doc}
          metadataRevision={docMetadataRevision(doc)}
          loading={loadingDoc}
          error={docError}
          jumpLine={jumpLine}
          onNavigate={go}
          // The document's root, whatever the dropdown says.
          onMark={(rel, mark, on) => void setMark(rel, mark, on, doc?.root)}
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
          deadMarks={deadMarks}
          onUnmark={(mark) => missing && void setMark(missing.rel, mark, false, missing.root)}
          dirUrl={(dir) => dirPageUrl(dir, doc?.root)}
          rootDirUrl={dirPageUrl('', doc?.root)}
          onOpenRootDir={() => openDirPage('', doc?.root)}
          rootGitUrl={`${dirPageUrl('', doc?.root)}?git`}
          onOpenRootGit={() => go(`${dirPageUrl('', doc?.root)}?git`)}
          onAgentPanel={() => setSidebar('off')}
          writable={liveWritable(doc, docRoot)}
        />
        )}
      </main>

      {phone && (
        <PhoneNav
          rootId={rootId}
          go={go}
          askAvailable={!viewer && route.kind === 'file' && doc?.kind === 'md' && !!doc.ab && !doc.reference}
          askOpen={askOpen}
          changeCount={changeCount}
          changes={onChanges(full.includes('?') ? full.slice(full.indexOf('?')) : '')}
          rag={onRag}
          drawerOpen={sidebar !== 'off'}
          // The drawer keeps the tab it was left on: a V1/V2 selection must not turn into every file because the bar was tapped.
          onFiles={() => setSidebar((s) => (s === 'off' ? 'compact' : 'off'))}
          onSearch={openSearch}
          onAsk={() => dispatchEvent(new Event(ASK_EVENT))}
        />
      )}

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
    </ViewerContext.Provider>
  );
}

void adminEntry.then((entry) => render(<App entry={entry} />, document.getElementById('app')!));
