import { useEffect, useRef, useState } from 'preact/hooks';
import { EditLink, OpenedNotice, isEditKey } from './ExternalEdit';

/** What a block can be added as, with the glyph its button shows — in the order shown. */
export const ADD_AS: readonly { kind: string; glyph: string; label: string; title: string }[] = [
  { kind: 'text', glyph: '¶', label: 'text', title: 'A plain paragraph — any Markdown' },
  { kind: 'quote', glyph: '❝', label: 'quote', title: 'A quote: > …' },
  { kind: 'my-quote', glyph: '✍️', label: 'my quote', title: 'A quote signed with your git name: > **name:** …' },
  { kind: 'tip', glyph: '💡', label: 'tip', title: 'A tip: > [!TIP]' },
  { kind: 'question', glyph: '❓', label: 'question', title: 'An open question: > ❓ …' },
  { kind: 'disagreement', glyph: '⁉️', label: 'disagreement', title: 'Two sources that disagree: > ⁉️ …' },
  { kind: 'answer', glyph: '💬', label: 'answer', title: 'An answer: > 💬 …' },
];

const LS_ADD_AS = 'mdhouse.addAs';
/** The kind last added as, kept in this browser; a quote signed with your name until there is one. */
function lastKind(): string {
  try {
    const k = localStorage.getItem(LS_ADD_AS);
    if (k && ADD_AS.some((a) => a.kind === k)) return k;
  } catch {
    /* storage off: the default */
  }
  return 'my-quote';
}

interface Props {
  /** The draft to start from — a form reopened with what was typed before. */
  initial?: string;
  onText: (text: string) => void;
  /** Add the text as this kind of block. */
  onAdd: (kind: string) => void;
  onCancel: () => void;
  saving: boolean;
  note: string | null;
  /** `edit:/path:line` at the heading, or null when the edit link is off. */
  editHref: string | null;
}

/**
 * A block being added under a heading: a textarea that grows with the text, and one button per
 * kind of block below it. Ctrl/⌘+Enter adds it as the kind last used — kept in this browser, "my
 * quote" until there is one; Esc cancels; Alt+E opens the file at the heading instead. The editor
 * keeps its own text — see QaEditor.
 */
export function AddEditor({ initial = '', onText, onAdd, onCancel, saving, note, editHref }: Props) {
  const area = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(initial);
  const [last, setLast] = useState(lastKind);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [text]);

  const empty = !text.trim();
  const add = (kind: string) => {
    if (empty || saving) return;
    setLast(kind);
    try {
      localStorage.setItem(LS_ADD_AS, kind);
    } catch {
      /* storage off: remembered for this form only */
    }
    onAdd(kind);
  };
  if (opened) return <OpenedNotice onBack={() => setOpened(false)} onClose={onCancel} />;
  return (
    <div class="add-editor" role="group" aria-label="Add a block">
      <textarea
        ref={area}
        value={text}
        rows={3}
        placeholder="Write it in Markdown, then pick what to add it as — Ctrl+Enter adds it as the last one used"
        onInput={(e) => {
          const value = (e.target as HTMLTextAreaElement).value;
          setText(value);
          onText(value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          } else if (editHref && isEditKey(e)) {
            e.preventDefault();
            location.href = editHref;
            setOpened(true);
          } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            add(last);
          }
        }}
      />
      {editHref && <EditLink href={editHref} onOpen={() => setOpened(true)} />}
      {note && <p class="answer-note">{note}</p>}
      <div class="add-buttons">
        <span class="add-as">Add as:</span>
        {ADD_AS.map((a) => (
          <button
            key={a.kind}
            class={`add-kind${a.kind === last ? ' add-last' : ''}`}
            data-kind={a.kind}
            disabled={empty || saving}
            onClick={() => add(a.kind)}
            title={a.title}
          >
            <span aria-hidden="true">{a.glyph}</span> {a.label}
          </button>
        ))}
        <button class="answer-cancel" disabled={saving} onClick={onCancel} title="Cancel (Esc)">
          Cancel
        </button>
      </div>
    </div>
  );
}
