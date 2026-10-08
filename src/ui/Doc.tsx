import { render as mount } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { loadWide, saveWide } from './wide';
import { api, type DocPayload, type DocAuthors, type HistoryPayload } from './api';
import type { Mark } from '../lib/prefs';
import { IconStar, IconMute, IconLink, IconClock, IconGit, IconGitMark, IconWide, IconDiff, IconDiffDoc, IconEdit, IconEye, IconEyeOff } from './icons';
import { timeAgo } from './format';
import { Ago } from './Ago';
import { Diff, DiffHead } from './Diff';
import { markChanges } from './mark-changes';
import { QaEditor } from './QaEditor';
import { formFor, markFolded, openTarget, wireQa, type QaTarget } from './qa-page';
import type { QaAction, QaChange } from '../lib/qa';
import { AddEditor } from './AddEditor';
import type { FileDiff } from '../lib/git';
import { QaStrip } from './QaStrip';
import { MD_EXT } from '../lib/filetypes';

/** The two diff views; either can be the one a toggle turns on. */
type DiffView = 'patch' | 'marked';
/** What the page is showing: the document, the patch, or the document with the change on it. */
type DocView = 'doc' | DiffView;

/** The tooltip for a diff button, which depends on what there is to compare. */
/** Drafts of documents left with a form open, by document url: back on it, the form opens again with the text. */
const keptDrafts = new Map<string, { qa?: { editing: object; text: string }; add?: { editing: object; text: string } }>();

const whatDiff = (dirty: boolean, how: string) =>
  `${dirty ? 'Show your uncommitted changes' : 'Compare with the previous revision'} — ${how}`;

interface Props {
  doc: DocPayload | null;
  loading: boolean;
  error: string | null;
  /** Line to scroll to and flash, from a search hit. */
  jumpLine: number | null;
  /** `line`: a body line to scroll to and flash. */
  onNavigate: (url: string, line?: number) => void;
  onMark: (path: string, mark: Mark, on: boolean) => void;
  /** A breadcrumb folder: open its page, and reveal it in the sidebar tree. */
  onOpenDir: (dir: string) => void;
  onAbout?: () => void;
  /** The settings button, placed on the title's line. */
  gear?: preact.ComponentChildren;
  /** The root, first in the breadcrumb, linking to its folder page. */
  rootName?: string;
  rootDirUrl?: string;
  /** The root's git view; the button shows only when the root is inside a repo. */
  rootGitUrl?: string;
  onOpenRootGit?: () => void;
  onOpenRootDir?: () => void;
  /** `edit:/full/path` for this document, or null when the edit link is turned off. */
  editHref?: string | null;
  /** Fetch this document again — after a checkbox write, so the page matches the file. */
  onReload?: () => void;
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

export function Doc({
  doc,
  loading,
  error,
  jumpLine,
  onNavigate,
  onMark,
  onOpenDir,
  onAbout,
  gear,
  rootName,
  rootDirUrl,
  rootGitUrl,
  onOpenRootGit,
  onOpenRootDir,
  editHref,
  onReload,
}: Props) {
  const body = useRef<HTMLDivElement>(null);
  const [tocOpen, setTocOpen] = useState(true);
  /** Deepest heading level the contents list shows. H1–H2 by default; the H3 chip widens it. */
  const [tocDepth, setTocDepth] = useState(2);
  /**
   * Full-bleed reading. The measure is capped at 900px because prose is easier to read that
   * way, but a document that is mostly wide tables or long code lines wants the window. Kept
   * across navigation and reloads, one setting for all documents — it is a way of reading, not
   * a property of one file.
   */
  const [fullWidth, setFullWidth] = useState(loadWide);
  useEffect(() => saveWide(fullWidth), [fullWidth]);

  /**
   * Git history, fetched on its own once the document is up.
   *
   * It carries the authorship line in the header as well as the panel beside the text.
   * Finding the commit that created a file costs a `--follow --diff-filter=A --reverse` log,
   * which git cannot answer without walking the whole history — most of a second on a large
   * repository. That used to be inside `/api/doc`, so every document waited on it before a
   * word was rendered. Now the page paints first and the two names arrive a moment later.
   */
  const [log, setLog] = useState<HistoryPayload | null>(null);
  const docRootId = doc?.root;
  const [rootInRepo, setRootInRepo] = useState(false);
  useEffect(() => {
    let live = true;
    setRootInRepo(false);
    if (docRootId)
      api
        .git(`${docRootId}/`)
        .then(() => live && setRootInRepo(true))
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [docRootId]);
  const [logFailed, setLogFailed] = useState(false);
  const docPath = doc ? `${doc.root}/${doc.rel}` : null;

  useEffect(() => {
    setLog(null);
    setLogFailed(false);
  }, [docPath]);
  // Asked again when the file's git status changes — a commit adds to its history — without
  // clearing the panel first.
  useEffect(() => {
    if (!docPath) return;
    let live = true;
    api
      .history(docPath)
      .then((h) => live && setLog(h))
      .catch(() => live && setLogFailed(true));
    return () => {
      live = false;
    };
  }, [docPath, doc?.status]);

  /**
   * Diff mode: the same document shown as what changed rather than as text.
   *
   * A file with uncommitted work opens on its diff — if you have edited it and come to look at
   * it, the edit is the thing you came for. A file with nothing outstanding opens as a
   * document and shows the last commit's change only when asked, which is what the button and
   * the history rows are for.
   */
  const [view, setView] = useState<DocView>('doc');
  /** Which of the two diff views to open on: whichever was last asked for. */
  const [diffView, setDiffView] = useState<DiffView>('patch');
  const [diffRev, setDiffRev] = useState<string | null>(null);
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const dirty = doc?.status === 'modified' || doc?.status === 'staged' || doc?.status === 'untracked';
  const diffOn = view !== 'doc';

  // Decided once per document, when it arrives — not again when its status changes while it is
  // open. Ticking a checkbox makes the file "modified", and that must not throw the reader out
  // of the document and into its diff.
  const viewDecidedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!doc || viewDecidedFor.current === doc.url) return;
    viewDecidedFor.current = doc.url;
    setDiffRev(null);
    setView(dirty ? diffView : 'doc');
    // diffView is deliberately not a dependency: changing the preferred view is already a
    // change of view, and re-running here would fight the toggle that set it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.url, dirty]);

  useEffect(() => {
    setDiff(null);
    if (!docPath || !diffOn) return;

    let live = true;
    api
      .diff(docPath, diffRev ?? undefined)
      .then((d) => live && setDiff(d))
      .catch(() => live && setDiff({ kind: 'none', added: 0, removed: 0, hunks: [], truncated: false }));
    return () => {
      live = false;
    };
  }, [docPath, diffOn, diffRev, doc?.status]);

  /** The file's uncommitted changes, counted for the History panel's top row. */
  const [local, setLocal] = useState<{ added: number; removed: number } | null>(null);
  useEffect(() => {
    setLocal(null);
    if (!docPath || !dirty) return;
    let live = true;
    api
      .diff(docPath)
      .then((d) => live && setLocal({ added: d.added, removed: d.removed }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [docPath, dirty, doc?.mtime]);

  /**
   * The marked-up document: the change marks laid over the rendered text, and taken off again
   * when the view or the diff changes. Only possible when the diff describes the file on disk
   * — an older revision is a text this page is not showing.
   */
  const overlaid = view === 'marked' && diff?.current === true && diff.hunks.length > 0;

  /** Turn a diff view on, switch to it, or — clicking the one already on — go back to the text. */
  const pick = (next: DiffView) => {
    setDiffView(next);
    if (view === next) {
      setView('doc');
      setDiffRev(null);
    } else {
      setView(next);
    }
  };

  useEffect(() => {
    if (!overlaid || !diff || !body.current) return;
    return markChanges(body.current, diff, doc?.lineOffset ?? 0);
  }, [overlaid, diff, doc?.url, doc?.html]);

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
        // `#L557`: a line of the file — the body's line once front matter is counted out
        const at = /#L(\d+)$/.exec(href);
        onNavigate(href, at ? Number(at[1]) - (doc?.lineOffset ?? 0) : undefined);
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

  /**
   * Checkboxes you can tick, on a writable folder and in the plain document view (a diff view
   * is about what changed, not a place to change it). A click asks the server to flip that one
   * line — refused if the file moved on since this page was rendered — and the document is then
   * fetched again, so every box carries the fingerprint of the file as it now is.
   */
  const [taskNote, setTaskNote] = useState<string | null>(null);
  useEffect(() => setTaskNote(null), [doc?.url]);
  useEffect(() => {
    const el = body.current;
    if (!el || !doc) return;
    const editable = doc.writable && view === 'doc';
    for (const box of el.querySelectorAll<HTMLInputElement>('.task-checkbox')) box.disabled = !editable;
    if (!editable) return;

    const onChange = async (e: Event) => {
      const box = e.target as HTMLInputElement;
      if (!box.classList?.contains('task-checkbox')) return;
      box.disabled = true;
      try {
        const d = docNow.current ?? doc;
        await api.toggleTask(`${d.root}/${d.rel}`, Number(box.dataset.line), box.dataset.hash ?? '');
        setTaskNote(null);
      } catch (err) {
        // Put the box back as it was. The reload below may bring identical HTML (nothing was
        // written), and then nothing else would re-enable it.
        box.checked = !box.checked;
        box.disabled = false;
        setTaskNote(
          (err as { status?: number }).status === 409
            ? 'The file changed since this page was loaded — it has been reloaded; tick again.'
            : (err as Error).message,
        );
      } finally {
        onReload?.();
      }
    };
    el.addEventListener('change', onChange);
    return () => el.removeEventListener('change', onChange);
  }, [doc?.url, doc?.html, doc?.writable, view]);

  /**
   * Q&A in place (qa-page.ts, QaEditor). In a writable folder and the plain document view, an
   * item's first glyph, its 💬 / 💡 buttons and its replies open a form under it; 🎯, a pick, a
   * tick and ✓ done write at once. The draft lives here, not in the DOM: the HTML is replaced
   * whenever the file changes, and the form is mounted again under the same item with the text
   * the reader typed. Leaving the document keeps the draft for when the reader comes back.
   */
  type Editing = QaTarget & { id: number; note: string | null; saving: boolean };
  const [editing, setEditing] = useState<Editing | null>(null);
  // For the handlers, which read the page as it is at the click.
  const editingNow = useRef(editing);
  editingNow.current = editing;
  const docNow = useRef(doc);
  docNow.current = doc;
  // The text being written, as the editor reports it: what Save sends.
  const draft = useRef('');
  const opened = useRef(0);
  const answerable = !!doc?.writable && view === 'doc';

  // Who a signed reply is from, for the 👤 tooltip.
  const [me, setMe] = useState('');
  useEffect(() => {
    if (!doc || !answerable) return;
    let live = true;
    api.qaMe(`${doc.root}/${doc.rel}`).then((r) => live && setMe(r.me), () => {});
    return () => {
      live = false;
    };
  }, [doc?.url, answerable]);

  const openForm = async (t: QaTarget) => {
    const d = docNow.current;
    if (!d) return;
    // The same button again, while its form is open: closes it, as Cancel does.
    const cur = editingNow.current;
    if (cur && cur.line === t.line && cur.kind === t.kind && cur.at === t.at && cur.first === t.first) {
      setEditing(null);
      return;
    }
    let text = '';
    if (t.kind === 'edit') {
      try {
        text = (await api.qaReply(`${d.root}/${d.rel}`, t.line, t.hash, t.at ?? 0)).text;
      } catch (err) {
        setTaskNote(`Could not open the reply: ${(err as Error).message}`);
        onReload?.();
        return;
      }
      if (docNow.current?.url !== d.url) return; // the reader has moved on to another document
    }
    draft.current = text;
    setEditing({ ...t, id: ++opened.current, note: null, saving: false });
  };

  /** One change at once — 🎯, a pick, a tick, ✓ done — then the page as the file now is. */
  const acting = useRef(false);
  const act = async (line: number, hash: string, change: QaChange) => {
    const d = docNow.current;
    if (!d || acting.current) return;
    acting.current = true;
    try {
      await api.qa({ p: `${d.root}/${d.rel}`, line, hash, ...change });
      setTaskNote(null);
    } catch (err) {
      setTaskNote(
        (err as { status?: number }).status === 409
          ? 'The file changed since this page was loaded — it has been reloaded; try again.'
          : (err as Error).message,
      );
    } finally {
      acting.current = false;
      onReload?.();
    }
  };

  useEffect(() => {
    const el = body.current;
    if (!el || !doc) return;
    const unfold = markFolded(el);
    openTarget(el, decodeURIComponent(location.hash.slice(1)));
    if (!answerable) return unfold;
    const unwire = wireQa(el, {
      open: (t) => void openForm(t),
      act: (line, hash, change) => void act(line, hash, change),
      close: () => setEditing(null),
    });
    return () => {
      unfold();
      unwire();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.url, doc?.html, answerable]);

  /** `e` opens the file in the editor, as the ✎ beside the title does — not while typing. */
  useEffect(() => {
    if (!editHref) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'e' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      e.preventDefault();
      location.href = editHref;
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editHref]);

  // The editor's element: made once per opened form, and moved — never rebuilt — when the page
  // is re-rendered from a changed file, so the text, the cursor and undo survive another
  // program writing to the file. Focus is given back if the move took it away.
  const host = useRef<HTMLElement | null>(null);
  const [hostTick, setHostTick] = useState(0);
  const hadFocus = useRef(false);
  const placedFor = useRef(0);
  useEffect(() => {
    if (!editing) return;
    const spot = document.createElement('div');
    spot.className = 'answer-host';
    spot.addEventListener('focusin', () => (hadFocus.current = true));
    // Taken out of the page with the old HTML is not the reader leaving it.
    spot.addEventListener('focusout', () => queueMicrotask(() => spot.isConnected && (hadFocus.current = false)));
    host.current = spot;
    setHostTick((n) => n + 1);
    return () => {
      mount(null, spot);
      spot.remove();
      if (host.current === spot) host.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  // Where the form stands: in its item, placed again whenever the HTML changes.
  useEffect(() => {
    const el = body.current;
    const spot = host.current;
    if (!el || !spot || !editing || !doc || !answerable) return;
    // The item by its fingerprint and line; else the same fingerprint nearest its old line —
    // lines added above move it, and two items may read alike; else whatever is on its line.
    const all = [...el.querySelectorAll<HTMLElement>('[data-qa][data-hash]')];
    const alike = all.filter((b) => b.dataset.hash === editing.hash);
    const item =
      alike.find((b) => Number(b.dataset.line) === editing.line) ??
      alike.sort((a, b) => Math.abs(Number(a.dataset.line) - editing.line) - Math.abs(Number(b.dataset.line) - editing.line))[0] ??
      all.find((b) => Number(b.dataset.line) === editing.line);
    const refocus = () => {
      const area = spot.querySelector('textarea');
      if (!area) return;
      if (placedFor.current !== editing.id) {
        // Just opened: the editor was rendered before it stood in the page, so focus it now.
        placedFor.current = editing.id;
        area.focus();
        area.selectionStart = area.selectionEnd = area.value.length;
        area.scrollIntoView({ block: 'nearest' });
      } else if (hadFocus.current && !spot.contains(document.activeElement)) area.focus();
    };
    if (!item) {
      // Gone from the file: the form stays — at the top of the page — with the text and a note.
      el.prepend(spot);
      refocus();
      setEditing((e) => (e && !e.note ? { ...e, note: 'That item is no longer in the file — your text is kept.' } : e));
      return;
    }
    // Follow the item to its new line; if it changed, take it as it now is but say so.
    const line = Number(item.dataset.line);
    const hash = item.dataset.hash ?? '';
    if (line !== editing.line || hash !== editing.hash) {
      const id = editing.id;
      setEditing((e) =>
        e && e.id === id
          ? {
              ...e,
              line,
              hash,
              at: e.at === undefined ? undefined : e.at + line - e.line,
              note: hash !== e.hash ? 'The item was changed in the file meanwhile — have a look; your text is kept.' : e.note,
            }
          : e,
      );
    }
    const box = item.querySelector<HTMLElement>(':scope > details') ?? item;
    if (box instanceof HTMLDetailsElement) box.open = true;
    const sub = editing.at ? item.querySelector<HTMLElement>(`.c-wrap[data-line="${editing.at}"], .reply[data-line="${editing.at}"]`) : null;
    let hidden: HTMLElement | null = null;
    if (editing.kind === 'option' && sub) sub.append(spot);
    else if (editing.kind === 'edit' && sub) {
      hidden = sub;
      sub.hidden = true;
      sub.after(spot);
    } else if (editing.kind === 'proposal' && sub) sub.after(spot);
    else {
      const nested = box.querySelector(':scope > ul.items');
      nested ? nested.before(spot) : box.append(spot);
    }
    refocus();
    return () => {
      if (hidden) hidden.hidden = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id, editing?.line, editing?.hash, doc?.html, answerable, hostTick]);

  // The form, rendered into its place on every change; Preact updates it in place.
  const saving = useRef(false);
  /** Saved with Ctrl+Shift+Enter: once the page is back, open the next open question. */
  const nextAfter = useRef<{ url: string; line: number } | null>(null);
  useEffect(() => {
    const el = body.current;
    const after = nextAfter.current;
    if (!el || !after || !doc || !answerable || after.url !== doc.url) return;
    nextAfter.current = null;
    const item = [...el.querySelectorAll<HTMLElement>('li.item:is(.wait-me, .finding)')].find((b) => Number(b.dataset.line) > after.line);
    if (item) {
      item.scrollIntoView({ block: 'center' });
      void openForm(formFor(item));
    } else setTaskNote('No open question below.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.html, answerable]);
  useEffect(() => {
    const spot = host.current;
    if (!spot || !editing || !doc) return;
    const save = async (action: string | null, sign: boolean, next: boolean) => {
      if (saving.current) return; // a repeated Ctrl+Enter before the first save is back
      saving.current = true;
      setEditing((e) => (e ? { ...e, saving: true, note: null } : e));
      const text = draft.current;
      const change: QaChange =
        editing.kind === 'edit'
          ? { op: 'edit', reply: editing.at ?? 0, text }
          : editing.kind === 'proposal' && (action === 'yes' || action === 'no')
            ? { op: 'verdict', sug: editing.at ?? 0, yes: action === 'yes', text }
            : editing.kind === 'option' && action !== 'elaborate'
              ? { op: 'say', text, sign, under: editing.at ?? 0, ...(action === 'pick' ? { action: 'pick' as const } : {}) }
              : { op: 'say', text, sign, ...(action ? { action: action as QaAction } : {}) };
      try {
        await api.qa({ p: `${doc.root}/${doc.rel}`, line: editing.line, hash: editing.hash, ...change });
        if (next) nextAfter.current = { url: doc.url, line: editing.line };
        draft.current = '';
        setEditing(null);
      } catch (err) {
        setEditing((e) =>
          e
            ? {
                ...e,
                saving: false,
                note:
                  (err as { status?: number }).status === 409
                    ? 'The file changed since this page was loaded — it has been reloaded, and your text is kept. Save again.'
                    : (err as Error).message,
              }
            : e,
        );
      } finally {
        saving.current = false;
        onReload?.();
      }
    };
    mount(
      <QaEditor
        key={editing.id}
        kind={editing.kind}
        first={editing.first}
        issue={editing.issue}
        initial={draft.current}
        me={me}
        onText={(text) => (draft.current = text)}
        onAct={(action, sign, next) => void save(action, sign, next)}
        onCancel={() => setEditing(null)}
        saving={editing.saving}
        note={editing.note}
        editHref={editHref ? `${editHref}:${(editing.at ?? editing.line) + (doc.lineOffset ?? 0)}` : null}
      />,
      spot,
    );
  }, [editing, hostTick, me]);

  /**
   * Adding under a heading. In a writable folder and the plain document view, hovering a heading
   * shows, after its # link: ✎ to open the file at that line (the `edit:` link, when it is on),
   * ↓ to add a block right under the heading, and ⇊ to add one at the end of its section. Adding
   * works like answering: an editor in place, the draft kept across reloads, one write.
   */
  type Adding = { id: number; line: number; hash: string; where: 'below' | 'end'; note: string | null; saving: boolean };
  const [adding, setAdding] = useState<Adding | null>(null);
  const addingNow = useRef(adding);
  addingNow.current = adding;
  const addDraft = useRef('');

  // Leaving a document with a form open keeps its draft; coming back opens the form again with it.
  useEffect(() => {
    const url = doc?.url;
    const kept = url ? keptDrafts.get(url) : undefined;
    if (url) keptDrafts.delete(url);
    if (kept?.qa) {
      draft.current = kept.qa.text;
      setEditing({ ...(kept.qa.editing as Editing), id: ++opened.current, saving: false, note: 'Your draft from before you left this page.' });
    } else setEditing(null);
    if (kept?.add) {
      addDraft.current = kept.add.text;
      setAdding({ ...(kept.add.editing as Adding), id: ++opened.current, saving: false, note: 'Your draft from before you left this page.' });
    } else setAdding(null);
    return () => {
      if (!url) return;
      const qa = editingNow.current && draft.current.trim() ? { editing: editingNow.current, text: draft.current } : undefined;
      const add = addingNow.current && addDraft.current.trim() ? { editing: addingNow.current, text: addDraft.current } : undefined;
      if (qa || add) keptDrafts.set(url, { qa, add });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.url]);

  // Closing the tab or reloading with a draft open asks first.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if ((editingNow.current && draft.current.trim()) || (addingNow.current && addDraft.current.trim())) e.preventDefault();
    };
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, []);

  useEffect(() => {
    const el = body.current;
    if (!el) return;
    for (const old of el.querySelectorAll('.heading-actions')) old.remove();
    if (!answerable || !doc) return;
    for (const h of el.querySelectorAll<HTMLElement>(':is(h1, h2, h3, h4, h5, h6)[data-hash]')) {
      const actions = document.createElement('span');
      actions.className = 'heading-actions';
      if (editHref) {
        const line = Number(h.dataset.line) + (doc.lineOffset ?? 0);
        const edit = document.createElement('a');
        edit.className = 'heading-act heading-edit';
        edit.href = `${editHref}:${line}`;
        edit.textContent = '✎';
        edit.title = `Edit at line ${line}`;
        actions.append(edit);
      }
      for (const [where, glyph, title] of [
        ['below', '↓', 'Add a block right under this heading'],
        ['end', '⇊', 'Add a block at the end of this section'],
      ] as const) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'heading-act heading-add';
        b.dataset.where = where;
        b.textContent = glyph;
        b.title = title;
        actions.append(b);
      }
      (h.querySelector('.header-anchor') ?? h.lastChild)?.after(actions);
    }
    const click = (e: Event) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('.heading-add');
      const h = b?.closest<HTMLElement>('[data-hash]');
      if (!b || !h) return;
      e.preventDefault();
      const line = Number(h.dataset.line);
      const where = b.dataset.where === 'end' ? 'end' : 'below';
      // The same button again, while its editor is open: closes it, as Cancel does.
      const open = addingNow.current;
      if (open && open.line === line && open.where === where) {
        setAdding(null);
        return;
      }
      addDraft.current = '';
      setAdding({ id: ++opened.current, line, hash: h.dataset.hash ?? '', where, note: null, saving: false });
    };
    el.addEventListener('click', click);
    return () => el.removeEventListener('click', click);
  }, [doc?.html, answerable, editHref, doc?.lineOffset]);

  // The add editor's element: made once per opened editor and moved on re-render, like the
  // answer editor's.
  const addHost = useRef<HTMLElement | null>(null);
  const [addTick, setAddTick] = useState(0);
  const addFocused = useRef(false);
  const addPlacedFor = useRef(0);
  useEffect(() => {
    if (!adding) return;
    const spot = document.createElement('div');
    spot.className = 'add-host';
    spot.addEventListener('focusin', () => (addFocused.current = true));
    spot.addEventListener('focusout', () => queueMicrotask(() => spot.isConnected && (addFocused.current = false)));
    addHost.current = spot;
    setAddTick((n) => n + 1);
    return () => {
      mount(null, spot);
      spot.remove();
      if (addHost.current === spot) addHost.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adding?.id]);

  useEffect(() => {
    const el = body.current;
    const spot = addHost.current;
    if (!el || !spot || !adding || !answerable) return;
    const all = [...el.querySelectorAll<HTMLElement>(':is(h1, h2, h3, h4, h5, h6)[data-hash]')];
    const alike = all.filter((h) => h.dataset.hash === adding.hash);
    const h =
      alike.find((x) => Number(x.dataset.line) === adding.line) ??
      alike.sort((a, b) => Math.abs(Number(a.dataset.line) - adding.line) - Math.abs(Number(b.dataset.line) - adding.line))[0] ??
      all.find((x) => Number(x.dataset.line) === adding.line);
    if (h && h.dataset.hash !== adding.hash) {
      // Edited in place: take it as it now is, and say so before anything is added under it.
      const hash = h.dataset.hash ?? '';
      setAdding((a) => (a && a.id === adding.id ? { ...a, hash, note: 'The heading was changed in the file meanwhile — have a look; your text is kept.' } : a));
    }
    if (!h) {
      el.prepend(spot);
      setAdding((a) => (a && !a.note ? { ...a, note: 'That heading is no longer in the file — your text is kept.' } : a));
    } else {
      const line = Number(h.dataset.line);
      if (line !== adding.line) setAdding((a) => (a && a.id === adding.id ? { ...a, line } : a));
      if (adding.where === 'below') h.after(spot);
      else {
        // Before the next heading of this level or higher, or at the end of the document.
        const level = Number(h.tagName[1]);
        let next = h.nextElementSibling;
        while (next && !(/^H[1-6]$/.test(next.tagName) && Number(next.tagName[1]) <= level)) next = next.nextElementSibling;
        next ? next.before(spot) : h.parentElement?.append(spot);
      }
    }
    const area = spot.querySelector('textarea');
    if (area && addPlacedFor.current !== adding.id) {
      addPlacedFor.current = adding.id;
      area.focus();
      area.scrollIntoView({ block: 'nearest' });
    } else if (area && addFocused.current && !spot.contains(document.activeElement)) area.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adding?.id, adding?.line, adding?.hash, doc?.html, answerable, addTick]);

  const addSaving = useRef(false);
  useEffect(() => {
    const spot = addHost.current;
    if (!spot || !adding || !doc) return;
    const add = async (kind: string) => {
      if (addSaving.current) return;
      addSaving.current = true;
      setAdding((a) => (a ? { ...a, saving: true, note: null } : a));
      try {
        await api.insertBlock({
          p: `${doc.root}/${doc.rel}`,
          line: adding.line,
          hash: adding.hash,
          where: adding.where,
          kind,
          text: addDraft.current,
        });
        addDraft.current = '';
        setAdding(null);
      } catch (err) {
        setAdding((a) =>
          a
            ? {
                ...a,
                saving: false,
                note:
                  (err as { status?: number }).status === 409
                    ? 'The heading changed since this page was loaded — it has been reloaded, and your text is kept.'
                    : (err as Error).message,
              }
            : a,
        );
      } finally {
        addSaving.current = false;
        onReload?.();
      }
    };
    mount(
      <AddEditor
        key={adding.id}
        initial={addDraft.current}
        onText={(text) => (addDraft.current = text)}
        onAdd={(kind) => void add(kind)}
        onCancel={() => setAdding(null)}
        saving={adding.saving}
        note={adding.note}
        editHref={editHref ? `${editHref}:${adding.line + (doc.lineOffset ?? 0)}` : null}
      />,
      spot,
    );
  }, [adding, addTick]);

  // Each document starts at the default depth; H3 is a per-document choice, not a mode.
  useEffect(() => setTocDepth(2), [doc?.url]);

  // Land on the right place: an explicit line from a search hit wins over the URL hash.
  useEffect(() => {
    const el = body.current;
    if (!el || !doc) return;

    const fileLine = /^#L(\d+)$/.exec(location.hash);
    const target =
      jumpLine !== null
        ? nearestByLine(el, jumpLine)
        : fileLine
          ? nearestByLine(el, Number(fileLine[1]) - (doc.lineOffset ?? 0))
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
        {gear && <div class="notice-gear">{gear}</div>}
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
  const title = doc.rel.split('/').pop()!.replace(MD_EXT, '');
  const listed = doc.headings.filter((h) => h.level <= tocDepth);
  const hasSubs = doc.headings.some((h) => h.level === 3);

  /** Uncommitted changes in a writable folder: back to the last commit, after a confirm. */
  const resetButton = diff?.kind === 'working' && diff.hunks.length > 0 && doc.writable && (
    <button
      class="diff-reset"
      title="Throw away the uncommitted changes in this file: git checkout HEAD -- file"
      onClick={async () => {
        if (!confirm(`Reset ${doc.rel} to the last commit? Its uncommitted changes are lost.`)) return;
        try {
          await api.gitReset(`${doc.root}/${doc.rel}`, diff.hash ?? '');
          setView('doc');
          onReload?.();
        } catch (err) {
          setTaskNote(`Could not reset the file: ${(err as Error).message}`);
          onReload?.();
        }
      }}
    >
      Reset file
    </button>
  );

  return (
    <article class={`doc-wrap${fullWidth ? ' full' : ''}`}>
      <header class="doc-head">
        <div class="crumbs">
          {/* The root leads, and opens its own folder page — every file in it, as a list. */}
          {rootName && rootDirUrl && (
            <span>
              <a
                class="crumb root"
                href={rootDirUrl}
                title={`${rootName}/ — every file, as a list`}
                onClick={(e) => {
                  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
                  e.preventDefault();
                  onOpenRootDir?.();
                }}
              >
                {rootName}
              </a>
              {dirs.length > 0 && <span class="sep"> / </span>}
            </span>
          )}
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
                  title={`Open ${path}/ — every file in it`}
                >
                  {d}
                </button>
                {!last && <span class="sep"> / </span>}
              </span>
            );
          })}
        </div>

        {/* The ⚙ shares the title's line: the top of a document is the breadcrumb, and a gear
            pinned to the corner floated beside that instead. */}
        <div class="doc-title-row">
          <h1 class="doc-title">
            <button class="mark" onClick={onAbout} title="About mdhouse" aria-label="About mdhouse" />
            {title}
          </h1>
          {/* Hands the file to whatever handles `edit:` URLs — an editor, set up outside mdhouse.
              Settings turns it off where nothing does. */}
          {rootInRepo && rootGitUrl && (
            <a
              class="icon-btn git-link"
              href={rootGitUrl}
              title="The git view — what changed, by commit"
              aria-label="Git view"
              onClick={(e) => {
                if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
                e.preventDefault();
                onOpenRootGit?.();
              }}
            >
              <IconGitMark />
            </a>
          )}
          {editHref && (
            <a class="icon-btn edit-link" href={editHref} title={`Edit ${editHref.slice(5)} (e)`} aria-label="Edit">
              <IconEdit />
            </a>
          )}
          {gear}
        </div>

        <div class="doc-meta">
          <span>
            <IconClock size={12} /> <Ago at={doc.mtime} />
          </span>
          <Authors authors={log?.authors ?? null} />
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
              aria-pressed={fullWidth}
              title={fullWidth ? 'Back to a reading column' : 'Use the full window width'}
              onClick={() => setFullWidth((w) => !w)}
            >
              <IconWide size={15} inward={fullWidth} />
            </button>
            {/* Two ways to look at the same change: the patch, and the document with the
                change marked on it. Either one toggles back to the plain document. */}
            <button
              class="icon-btn"
              aria-pressed={view === 'patch'}
              title={view === 'patch' ? 'Show the document' : whatDiff(dirty, 'as a patch')}
              onClick={() => pick('patch')}
            >
              <IconDiff size={15} />
            </button>
            <button
              class="icon-btn"
              aria-pressed={view === 'marked'}
              title={view === 'marked' ? 'Show the document' : whatDiff(dirty, 'marked on the whole document')}
              onClick={() => pick('marked')}
            >
              <IconDiffDoc size={15} />
            </button>
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
        {doc.headings.filter((h) => h.level <= 3).length > 1 && (
          <details class="toc" open={tocOpen} onToggle={(e) => setTocOpen((e.target as HTMLDetailsElement).open)}>
            <summary>
              Table of contents
              {hasSubs && (
                <button
                  class="depth"
                  aria-pressed={tocDepth === 3}
                  title={tocDepth === 3 ? 'Show H1–H2 only' : 'Include H3 headings'}
                  // Inside a <summary>, a click would otherwise fold the whole section away.
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setTocDepth((d) => (d === 3 ? 2 : 3));
                  }}
                >
                  H3
                </button>
              )}
            </summary>
            <ul>
              {listed.map((h) => (
                <li data-level={h.level} key={h.slug}>
                  <a href={`#${h.slug}`}>{h.text}</a>
                </li>
              ))}
            </ul>
          </details>
        )}
        <History
          log={log}
          failed={logFailed}
          activeRev={diffOn ? diffRev : null}
          local={dirty ? { ...(local ?? { added: 0, removed: 0 }), loading: !local, at: doc.mtime, isNew: doc.status === 'untracked' } : null}
          localOn={diffOn && diffRev === null}
          onPickLocal={() => {
            const showing = diffOn && diffRev === null;
            setDiffRev(null);
            setView(showing ? 'doc' : diffView);
          }}
          onPickRev={(hash) => {
            // Clicking the revision already on screen puts the document back.
            const showing = diffOn && diffRev === hash;
            setDiffRev(showing ? null : hash);
            setView(showing ? 'doc' : diffView);
          }}
        />
      </div>

      {view === 'marked' && diff && diff.kind !== 'none' && (
        <DiffHead diff={diff}>
          {resetButton}
          {!diff.current && <span class="warn-note">this revision is not the file on disk</span>}
          {diff.current && !diff.hunks.length && <span class="sep">· nothing to mark</span>}
        </DiffHead>
      )}
      {view === 'marked' && !diff && <div class="spinner" />}
      {/* The marked view falls back to the patch when the marks cannot be trusted: a diff of an
          older revision describes a text this page is not showing. */}
      {(view === 'patch' || (view === 'marked' && diff?.current === false)) && (
        <Diff diff={diff} loading={!diff} actions={resetButton} />
      )}
      {/* Hidden rather than unmounted: the rendered body carries the link handler, the mermaid
          diagrams and the scroll target, and none of that should be rebuilt by a toggle. */}
      {taskNote && <p class="task-note">{taskNote}</p>}
      {view === 'doc' && <QaStrip body={body} html={doc.html} url={doc.url} />}
      <div
        ref={body}
        class={`md${overlaid ? ' marked' : ''}${answerable ? ' qa-rw' : ''}`}
        hidden={view === 'patch' || (view === 'marked' && diff?.current === false)}
        dangerouslySetInnerHTML={{ __html: doc.html }}
      />
    </article>
  );
}

/**
 * Who wrote the file and who last touched it, as `first … last` — collapsed to one name when
 * they are the same person, which in a plan folder they usually are — with the age of the
 * file beside the name that created it. The line above already says when it last changed, so
 * together they read as "touched six days ago, started a month ago by Andrei".
 */
function Authors({ authors }: { authors: DocAuthors | null }) {
  if (!authors) return null;
  const { created, last } = authors;

  // Either half is enough to call it one person. The same human commits under two addresses
  // often enough (a job change, a second machine), and whatever the emails say, rendering
  // "Serg Parf … Serg Parf" is noise.
  const same = !created || created.email === last.email || created.name === last.name;

  return (
    <span class="who" title={`Last commit ${last.hash}, ${timeAgo(last.at)}`}>
      {created ? created.name : last.name}
      {created && (
        <span class="born" title={`Created ${new Date(created.at).toLocaleString()}`}>
          (<Ago at={created.at} flame={false} />)
        </span>
      )}
      {!same && (
        <>
          <span class="sep"> … </span>
          {last.name}
        </>
      )}
    </span>
  );
}

/** The History panel shown or hidden: one setting for every document, kept in localStorage like wide mode. */
const LS_HISTORY = 'mdhouse.history';
const loadHistoryOpen = (): boolean => {
  try {
    return localStorage.getItem(LS_HISTORY) !== '0';
  } catch {
    return true;
  }
};
const saveHistoryOpen = (open: boolean) => {
  try {
    localStorage.setItem(LS_HISTORY, open ? '1' : '0');
  } catch {
    /* a per-viewer convenience; fine without it */
  }
};

/**
 * Per-file git history: the last commits to this file, with their line counts. Who created it
 * is in the header, from the same response.
 *
 * The request is `Doc`'s — the header wants the authorship out of the same response — so this
 * only renders what arrived. The panel is open by default: waiting for a click bought nothing
 * but a click, since the document was already on screen by then. Hidden, it stays hidden for every
 * document until shown again.
 */
function History({
  log,
  failed,
  activeRev,
  onPickRev,
  local,
  localOn,
  onPickLocal,
}: {
  /** Uncommitted changes to the file: always shown, even with the panel hidden. */
  local: { added: number; removed: number; loading: boolean; at: number; isNew: boolean } | null;
  localOn: boolean;
  onPickLocal: () => void;
  log: HistoryPayload | null;
  failed: boolean;
  /** The revision the page is diffing, so the row that produced it can say so. */
  activeRev: string | null;
  onPickRev: (hash: string) => void;
}) {
  const [open, setOpen] = useState(loadHistoryOpen);
  useEffect(() => saveHistoryOpen(open), [open]);

  return (
    <section class="gitlog">
      <div class="summary" role="button" tabIndex={0} aria-expanded={open} onClick={() => setOpen(!open)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOpen(!open))}>
        <IconGit size={12} /> History
        {/* Its state, at a glance: a closed panel otherwise reads as an empty one. */}
        <span class="gitlog-state" title={open ? 'Shown — click to hide' : 'Hidden — click to show'}>
          {open ? <IconEye size={13} /> : <IconEyeOff size={13} />}
        </span>
      </div>
      {/* Outside the folding part: the panel's hide never hides work not yet committed. */}
      {local && (
        <button class="commit local" aria-pressed={localOn} title="Your uncommitted changes to this file" onClick={onPickLocal}>
          <div class="commit-subject">
            <span class="local-dot">🟠</span> {local.isNew ? 'Not committed yet' : 'Uncommitted changes'}
          </div>
          <div class="commit-meta">
            <Ago at={local.at} flame={false} />
            {!local.loading && (
              <span class="churn">
                <span class="plus">+{local.added}</span>
                <span class="minus">−{local.removed}</span>
              </span>
            )}
          </div>
        </button>
      )}

      {open && (
        <>
      {!log && !failed && <div class="spinner" />}
      {failed && <p class="empty">git is unavailable here.</p>}
      {log && !log.commits.length && <p class="empty">Not committed yet.</p>}

      {log?.commits.map((c) => (
        // A row is a question — what did this commit do to this file? — so it is a button.
        <button
          class="commit"
          key={c.hash}
          aria-pressed={activeRev === c.hash}
          title={`What ${c.hash.slice(0, 8)} changed here`}
          onClick={() => onPickRev(c.hash)}
        >
          <div class="commit-subject">{c.subject}</div>
          <div class="commit-meta">
            <span class="who">{c.author}</span>
            <Ago at={c.date} flame={false} />
            <code>{c.hash.slice(0, 8)}</code>
            {c.added !== undefined && (
              <span class="churn">
                <span class="plus">+{c.added}</span>
                <span class="minus">−{c.deleted}</span>
              </span>
            )}
          </div>
        </button>
      ))}
        </>
      )}
    </section>
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
