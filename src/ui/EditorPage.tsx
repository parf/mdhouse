/**
 * The editor page (`<doc>?edit`): the whole source of a Markdown document in CodeMirror 6, styled in
 * place, filling the page. The text is saved back exactly (its line endings, BOM and final newline).
 * Leaving keeps the draft; Discard drops it after a confirmation. A save is refused when the file
 * changed since the draft's base — the draft stays. Preview shows the unsaved text rendered, read-only;
 * back in the editor the caret, selection and scroll are where they were.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, drawSelection, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { HighlightStyle, LanguageSupport, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { markdownLanguage } from '@codemirror/lang-markdown';
import { ApiError, api } from './api';
import { dropDraft, forEditor, fromEditor, loadDraft, saveDraft, type EditorSource } from './edit-source';
import { markdownStyling } from './md-styling';
import { renderMermaid } from './mermaid-render';
import { follow } from './PageHead';
import { IconTrash } from './icons';
import { safeHtml } from './safe-html';
import { setUnsaved } from './tab-presence';

interface Props {
  /** The document, as a wire path `root/rel`. */
  p: string;
  /** The document's page: Back goes there. */
  docUrl: string;
  /** May it be written now: the project's live access. Off keeps the text, read-only. */
  writable: boolean;
  /** Bumped whenever the file may have changed on disk. */
  revision: string;
  /** Saved: the document page shows the file as it now is. */
  onSaved: () => void;
  go: (url: string) => void;
  gear?: preact.ComponentChildren;
}

/** Markdown marks in the page's own colours, so light and dark both read. */
const highlight = HighlightStyle.define([
  { tag: t.heading, fontWeight: '700', color: 'var(--doc-title)' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.link, t.url], color: 'var(--accent)' },
  { tag: t.monospace, fontFamily: 'var(--mono)', color: 'var(--fg-muted)' },
  { tag: t.quote, color: 'var(--fg-muted)' },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], color: 'var(--fg-faint)' },
]);

type Loaded = { src: EditorSource; base: string; disk: string };
/** What Preview shows: nothing yet, the rendered draft, or why it could not render. */
type Shown = { html: string; hasMermaid: boolean } | { error: string } | null;

const STALE = 'The file changed since you started — your text is kept. Copy it, or discard it and load the file as it is now.';

export default function EditorPage({ p, docUrl, writable, revision, onSaved, go, gear }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const editable = useRef(new Compartment());
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [problem, setProblem] = useState('');
  const [note, setNote] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingNow = useRef(false);
  // Set together with their state, so an answer arriving before the next render reads them as they are.
  const loadedNow = useRef(loaded);
  const put = (l: Loaded) => {
    loadedNow.current = l;
    setLoaded(l);
  };
  const dirtyNow = useRef(dirty);
  const markDirty = (d: boolean) => {
    dirtyNow.current = d;
    setDirty(d);
  };
  // This editor's life for this document: an answer that arrives after it ended (left, another document) is dropped.
  const epoch = useRef(0);
  // The keymap's Save runs from the editor's own state: it reads the access as it is now.
  const writableNow = useRef(writable);
  writableNow.current = writable;

  const [previewing, setPreviewingState] = useState(false);
  // Read by a toggle that comes before the next render: two quick clicks are on, then off.
  const previewingNow = useRef(false);
  const setPreviewing = (on: boolean) => {
    previewingNow.current = on;
    setPreviewingState(on);
  };
  const [shown, setShown] = useState<Shown>(null);
  // The newest Preview asked for: an older answer, or one for a Preview already left, is dropped.
  const previewSeq = useRef(0);
  const previewBody = useRef<HTMLDivElement>(null);
  /** The editor's scroll when Preview opened, put back when it closes. */
  const scrollAt = useRef(0);

  /** The editor's text, joined with the file's own separator. */
  const current = (src: EditorSource) => fromEditor(src, (view.current?.state.doc.toJSON() ?? src.lines).join(src.separator));

  /** Puts `text` (from disk or a draft) in the editor. */
  const show = (text: string, base: string, disk: string, isDraft: boolean): boolean => {
    const src = forEditor(text);
    if ('unsupported' in src) {
      setProblem(src.unsupported);
      return false;
    }
    setProblem('');
    put({ src, base, disk });
    markDirty(isDraft);
    // Made with the text, never before: nothing can be typed into an editor whose source is still on its way.
    if (view.current) view.current.setState(stateFor(src));
    else view.current = new EditorView({ parent: host.current!, state: stateFor(src) });
    return true;
  };

  const stateFor = (src: EditorSource) =>
    EditorState.create({
      doc: src.lines.join('\n'),
      extensions: [
        history(),
        drawSelection(),
        highlightActiveLine(),
        EditorView.lineWrapping,
        // Markdown highlighting only: no languages nested in code blocks or HTML, which would weigh far more.
        new LanguageSupport(markdownLanguage),
        syntaxHighlighting(highlight),
        markdownStyling,
        keymap.of([{ key: 'Mod-s', preventDefault: true, run: () => (void save(), true) }, ...defaultKeymap, ...historyKeymap]),
        editable.current.of([EditorState.readOnly.of(!writable)]),
        EditorView.contentAttributes.of({ 'aria-label': 'Document source', spellcheck: 'true', autocapitalize: 'off' }),
        EditorView.updateListener.of((u) => {
          if (!u.docChanged) return;
          const l = loadedNow.current;
          if (!l) return;
          markDirty(true);
          saveDraft(p, { text: fromEditor(l.src, u.state.doc.toJSON().join(l.src.separator)), base: l.base });
        }),
      ],
    });

  // The source: a draft kept for this document, else the file. Read once per document.
  useEffect(() => {
    const my = ++epoch.current;
    setPreviewing(false);
    api.source(p).then(
      (s) => {
        if (my !== epoch.current) return;
        const d = loadDraft(p);
        if (d && d.text !== s.text) {
          show(d.text, d.base, s.hash, true);
          if (d.base !== s.hash) setNote(STALE);
        } else {
          if (d) dropDraft(p);
          show(s.text, s.hash, s.hash, false);
        }
        view.current?.focus();
      },
      (err: Error & { status?: number }) => my === epoch.current && setProblem(err.status === 413 ? 'This file is too large to edit here.' : err.status === 422 ? 'This file is not valid UTF-8 — it cannot be edited here.' : err.message),
    );
    return () => {
      epoch.current++;
      previewSeq.current++;
      view.current?.destroy();
      view.current = null;
    };
  }, [p]);

  // Writing allowed or not, as the project's access changes; the text stays either way.
  useEffect(() => {
    view.current?.dispatch({ effects: editable.current.reconfigure([EditorState.readOnly.of(!writable)]) });
  }, [writable, loaded]);

  // The file changed on disk: a clean editor follows it; a draft stays, and says so.
  useEffect(() => {
    const l = loadedNow.current;
    if (!l) return;
    const my = epoch.current;
    // Followed only if nothing was typed while the file was read.
    const at = view.current?.state.doc;
    let live = true;
    api.source(p).then(
      (s) => {
        const now = loadedNow.current;
        if (!live || my !== epoch.current || !now || s.hash === now.disk) return;
        if (!dirtyNow.current && view.current?.state.doc === at) show(s.text, s.hash, s.hash, false);
        else {
          put({ ...now, disk: s.hash });
          if (now.base !== s.hash) setNote(STALE);
        }
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [revision]);

  // Agent Bus control does not move a tab away from unsaved text.
  useEffect(() => {
    setUnsaved(host, dirty);
    return () => setUnsaved(host, false);
  }, [dirty]);

  // Leaving the page with unsaved text asks first — only while there is some.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, [dirty]);

  // The editor stays editable while a save is on its way: what is typed meanwhile stays unsaved, kept on the new base.
  const save = async () => {
    const l = loadedNow.current;
    const sent = view.current?.state.doc;
    if (!l || !sent || savingNow.current || !writableNow.current) return;
    const my = epoch.current;
    savingNow.current = true;
    setSaving(true);
    setNote('');
    try {
      const got = await api.saveSource(p, l.base, current(l.src));
      if (my !== epoch.current) return;
      const now = loadedNow.current ?? l;
      put({ ...now, base: got.hash, disk: got.hash });
      if (view.current?.state.doc === sent) {
        dropDraft(p);
        markDirty(false);
      } else saveDraft(p, { text: current(now.src), base: got.hash });
      onSaved();
    } catch (err) {
      if (my !== epoch.current) return;
      // the text as it is now, which may be newer than what was sent
      const now = loadedNow.current ?? l;
      saveDraft(p, { text: current(now.src), base: now.base });
      setNote(err instanceof ApiError && err.status === 409 ? STALE : `Not saved — your text is kept: ${(err as Error).message}`);
    } finally {
      savingNow.current = false;
      setSaving(false);
    }
  };

  // Save works in Preview too, where the editor has no focus to take the key.
  useEffect(() => {
    if (!previewing) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [previewing]);

  const discard = async () => {
    if (dirty && !confirm('Discard your unsaved changes to this document and load the file as it is now?')) return;
    if (previewingNow.current) {
      previewSeq.current++;
      setPreviewing(false);
    }
    const my = epoch.current;
    const at = view.current?.state.doc;
    dropDraft(p);
    setNote('');
    try {
      const s = await api.source(p);
      if (my !== epoch.current) return;
      // typed while the file was read: that text is newer than the decision to discard
      if (view.current?.state.doc !== at) return setNote('You typed while the file was loading — nothing was discarded.');
      show(s.text, s.hash, s.hash, false);
    } catch (err) {
      if (my === epoch.current) setProblem((err as Error).message);
    }
  };

  const copy = () => {
    const l = loadedNow.current;
    if (l) void navigator.clipboard?.writeText(current(l.src)).then(() => setNote('Copied — your text is still here.'), () => setNote('Could not copy — select the text and copy it.'));
  };

  /** Preview on: the text as it is now, rendered. Off: back to the editor as it was left. */
  const togglePreview = () => {
    const l = loadedNow.current;
    const v = view.current;
    if (!l || !v) return;
    const my = ++previewSeq.current;
    if (previewingNow.current) {
      setPreviewing(false);
      return;
    }
    scrollAt.current = v.scrollDOM.scrollTop;
    setShown(null);
    setPreviewing(true);
    api.preview(p, current(l.src)).then(
      (r) => my === previewSeq.current && setShown({ html: r.html, hasMermaid: r.hasMermaid }),
      (err: Error) => my === previewSeq.current && setShown({ error: `Preview failed — your text is kept: ${err.message}` }),
    );
  };

  // Back in the editor: its scroll as it was, and the caret where it was.
  useEffect(() => {
    const v = view.current;
    if (previewing || !v) return;
    v.requestMeasure();
    requestAnimationFrame(() => {
      if (view.current !== v) return;
      v.scrollDOM.scrollTop = scrollAt.current;
      v.focus();
    });
  }, [previewing]);

  // Diagrams in the preview, drawn by the same constrained renderer as the document page.
  const previewHtml = shown && 'html' in shown ? safeHtml(shown.html) : '';
  useEffect(() => {
    const el = previewBody.current;
    if (!el || !previewHtml || !(shown && 'html' in shown && shown.hasMermaid)) return;
    let live = true;
    void renderMermaid(el, () => live && previewBody.current === el);
    return () => {
      live = false;
    };
  }, [previewHtml]);

  /** A link in the preview to another page of the app opens it here; the draft stays for this document. */
  const previewClick = (e: MouseEvent) => {
    const a = (e.target as Element | null)?.closest('a');
    const href = a?.getAttribute('href') ?? '';
    if (!a || !href.startsWith('/') || href.startsWith('//') || href.startsWith('/api/') || a.target) return;
    follow(e, () => go(href));
  };

  const name = p.slice(p.lastIndexOf('/') + 1);
  const state = !writable ? 'read-only — this project is not writable now' : saving ? 'saving…' : dirty ? 'unsaved changes' : loaded ? 'saved' : '';

  return (
    <section class="editor-page" aria-label={`Edit ${name}`}>
      <header class="editor-head">
        <a class="editor-back" href={docUrl} onClick={(e) => follow(e, () => go(docUrl))} title={dirty ? 'Back to the document — your unsaved text is kept' : 'Back to the document'}>
          ← <span class="lbl">Back to document</span>
        </a>
        <span class="editor-title">
          <h1 class="editor-name" title={p.slice(p.indexOf('/') + 1)}>
            {name}
          </h1>
          <span class="editor-state" role="status">
            {state}
          </span>
        </span>
        <span class="editor-actions">
          {(dirty || note) && (
            <button type="button" class="doc-editor-discard" disabled={!loaded} onClick={() => void discard()} title="Discard — throw away your changes and load the file as it is now" aria-label="Discard">
              <IconTrash size={15} />
              <span class="lbl">Discard</span>
            </button>
          )}
          <button type="button" class="editor-preview-btn" aria-pressed={previewing} disabled={!loaded || !!problem} onClick={togglePreview} title={previewing ? 'Back to editing' : 'See the unsaved text rendered'}>
            {previewing ? 'Edit' : 'Preview'}
          </button>
          <button type="button" class="doc-editor-save" disabled={!loaded || saving || !dirty || !writable} onClick={() => void save()} title="Save — Ctrl+S">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </span>
        {gear && <span class="head-gear">{gear}</span>}
      </header>
      {problem && <p class="settings-error">{problem}</p>}
      {note && (
        <p class={`editor-note ${note === STALE || note.startsWith('Not saved') ? 'settings-error' : 'settings-hint'}`}>
          {note}
          {note === STALE && (
            <button type="button" class="doc-editor-copy" onClick={copy}>
              Copy text
            </button>
          )}
        </p>
      )}
      <div class="editor-cm doc-editor-cm" ref={host} hidden={!!problem || previewing} />
      {previewing && (
        <div class="editor-preview" aria-label="Preview of the unsaved text">
          {!shown && <div class="spinner" />}
          {shown && 'error' in shown && <p class="settings-error">{shown.error}</p>}
          {shown && 'html' in shown && <div ref={previewBody} class="md" onClick={previewClick} dangerouslySetInnerHTML={{ __html: previewHtml }} />}
        </div>
      )}
    </section>
  );
}
