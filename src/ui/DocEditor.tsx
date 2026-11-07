/**
 * The whole source of a Markdown document in CodeMirror 6: the text as it is on disk, saved back
 * exactly (its line endings, BOM and final newline). Close keeps the draft; Discard drops it after a
 * confirmation. A save is refused when the file changed since the draft's base — the draft stays.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { LanguageSupport, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
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
  const loadedNow = useRef(loaded);
  loadedNow.current = loaded;
  const dirtyNow = useRef(dirty);
  dirtyNow.current = dirty;
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
    setLoaded({ src, base, disk });
    setDirty(isDraft);
    view.current?.setState(stateFor(src));
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
        syntaxHighlighting(defaultHighlightStyle),
        keymap.of([{ key: 'Mod-s', preventDefault: true, run: () => (void save(), true) }, ...defaultKeymap, ...historyKeymap]),
        editable.current.of([EditorState.readOnly.of(!writable)]),
        EditorView.contentAttributes.of({ 'aria-label': 'Document source', spellcheck: 'true', autocapitalize: 'off' }),
        EditorView.updateListener.of((u) => {
          if (!u.docChanged) return;
          const l = loadedNow.current;
          if (!l) return;
          setDirty(true);
          saveDraft(p, { text: fromEditor(l.src, u.state.doc.toJSON().join(l.src.separator)), base: l.base });
        }),
      ],
    });

  // The source: a draft kept for this document, else the file. Read once per document.
  useEffect(() => {
    let live = true;
    view.current = new EditorView({ parent: host.current! });
    api.source(p).then(
      (s) => {
        if (!live) return;
        const d = loadDraft(p);
        if (d && d.text !== s.text) {
          show(d.text, d.base, s.hash, true);
          if (d.base !== s.hash) setNote(STALE);
        } else {
          if (d) dropDraft(p);
          show(s.text, s.hash, s.hash, false);
        }
      },
      (err: Error & { status?: number }) => live && setProblem(err.status === 413 ? 'This file is too large to edit here.' : err.status === 422 ? 'This file is not valid UTF-8 — it cannot be edited here.' : err.message),
    );
    return () => {
      live = false;
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
    let live = true;
    api.source(p).then(
      (s) => {
        if (!live || s.hash === l.disk) return;
        if (!dirtyNow.current) show(s.text, s.hash, s.hash, false);
        else {
          setLoaded({ ...l, disk: s.hash });
          setNote(STALE);
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

  const save = async () => {
    const l = loadedNow.current;
    if (!l || savingNow.current || !writableNow.current) return;
    savingNow.current = true;
    setSaving(true);
    setNote('');
    const text = current(l.src);
    try {
      const got = await api.saveSource(p, l.base, text);
      dropDraft(p);
      setLoaded({ ...l, base: got.hash, disk: got.hash });
      setDirty(false);
      onSaved();
    } catch (err) {
      saveDraft(p, { text, base: l.base });
      setNote(err instanceof ApiError && err.status === 409 ? STALE : `Not saved — your text is kept: ${(err as Error).message}`);
    } finally {
      savingNow.current = false;
      setSaving(false);
    }
  };

  const discard = async () => {
    if (dirty && !confirm('Discard your unsaved changes to this document and load the file as it is now?')) return;
    dropDraft(p);
    setNote('');
    try {
      const s = await api.source(p);
      show(s.text, s.hash, s.hash, false);
    } catch (err) {
      setProblem((err as Error).message);
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
