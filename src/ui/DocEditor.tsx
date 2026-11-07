/**
 * The whole source of a Markdown document in CodeMirror 6: the text as it is on disk, saved back
 * exactly (its line endings, BOM and final newline). Close keeps the draft; Discard drops it after a
 * confirmation. A save is refused when the file changed since the draft's base — the draft stays.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { HighlightStyle, LanguageSupport, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { markdownLanguage } from '@codemirror/lang-markdown';
import { ApiError, api } from './api';
import { dropDraft, forEditor, fromEditor, loadDraft, saveDraft, type EditorSource } from './edit-source';

interface Props {
  /** The document, as a wire path `root/rel`. */
  p: string;
  /** May it be written now: the project's live access. Off keeps the text, read-only. */
  writable: boolean;
  /** Bumped whenever the file may have changed on disk. */
  revision: string;
  /** Saved: the page shows the file as it now is. */
  onSaved: () => void;
  onClose: () => void;
}

/** Markdown marks in the page's own colours, so light and dark both read. */
const highlight = HighlightStyle.define([
  { tag: t.heading, fontWeight: '700', color: 'var(--doc-title)' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.link, t.url], color: 'var(--accent)' },
  { tag: t.monospace, color: 'var(--fg-muted)' },
  { tag: t.quote, color: 'var(--fg-muted)' },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], color: 'var(--fg-faint)' },
]);

type Loaded = { src: EditorSource; base: string; disk: string };

const STALE = 'The file changed since you started — your text is kept. Copy it, or discard it and load the file as it is now.';

export default function DocEditor({ p, writable, revision, onSaved, onClose }: Props) {
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
  // This editor's life for this document: an answer that arrives after it ended (closed, another document) is dropped.
  const epoch = useRef(0);
  // The keymap's Save runs from the editor's own state: it reads the access as it is now.
  const writableNow = useRef(writable);
  writableNow.current = writable;

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
        lineNumbers(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        EditorView.lineWrapping,
        // Markdown highlighting only: no languages nested in code blocks or HTML, which would weigh far more.
        new LanguageSupport(markdownLanguage),
        syntaxHighlighting(highlight),
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
      },
      (err: Error & { status?: number }) => my === epoch.current && setProblem(err.status === 413 ? 'This file is too large to edit here.' : err.status === 422 ? 'This file is not valid UTF-8 — it cannot be edited here.' : err.message),
    );
    return () => {
      epoch.current++;
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

  const discard = async () => {
    if (dirty && !confirm('Discard your unsaved changes to this document and load the file as it is now?')) return;
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

  return (
    <section class="doc-editor" aria-label="Edit the document">
      <div class="doc-editor-bar">
        <button type="button" class="doc-editor-save" disabled={!loaded || saving || !dirty || !writable} onClick={() => void save()} title="Save — Ctrl+S">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" class="doc-editor-close" onClick={onClose} title={dirty ? 'Close — your unsaved text is kept for this document' : 'Close'}>
          Close
        </button>
        <button type="button" class="doc-editor-discard" disabled={!loaded || (!dirty && !note)} onClick={() => void discard()} title="Throw away your changes and load the file as it is now">
          Discard
        </button>
        {note === STALE && (
          <button type="button" class="doc-editor-copy" onClick={copy}>
            Copy text
          </button>
        )}
        <span class="doc-editor-state">{!writable ? 'read-only — this project is not writable now' : dirty ? 'unsaved changes' : loaded ? 'saved' : ''}</span>
      </div>
      {problem && <p class="settings-error">{problem}</p>}
      {note && <p class={note === STALE || note.startsWith('Not saved') ? 'settings-error' : 'settings-hint'}>{note}</p>}
      <div class="doc-editor-cm" ref={host} hidden={!!problem} />
    </section>
  );
}
