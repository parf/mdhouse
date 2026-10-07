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

interface Props {
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
 * kind of block below it. Ctrl/⌘+Enter adds it as the kind last used (text at first); Esc
 * cancels; Alt+E opens the file at the heading instead. The editor keeps its own text — see
 * AnswerEditor.
 */
export function AddEditor({ onText, onAdd, onCancel, saving, note, editHref }: Props) {
  const area = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const [last, setLast] = useState('text');
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
