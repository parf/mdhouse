import { useEffect, useRef, useState } from 'preact/hooks';
import { EditLink, OpenedNotice, isEditKey } from './ExternalEdit';

interface Props {
  /** The draft to start from; from then on the editor keeps the text itself. */
  initial: string;
  /** Every change, so the draft outlives this editor (the page re-renders after a reload). */
  onText: (text: string) => void;
  /** Save; `check` also ticks a checkbox question ("Check & Save"), `next` then opens the next
   *  unanswered question. */
  onSave: (check: boolean, next: boolean) => void;
  onCancel: () => void;
  saving: boolean;
  /** Why the last save did not go through, or anything else worth saying. */
  note: string | null;
  /** A checkbox question that is not ticked yet: offer "Check & Save". */
  canCheck: boolean;
  /** `edit:/path:line` at the question, or null when the edit link is off. */
  editHref: string | null;
}

/**
 * The answer being written, under its question: a textarea that grows with the text, and Save
 * below it. Ctrl/⌘+Enter saves, Ctrl/⌘+Shift+Enter saves and opens the next unanswered
 * question, Esc cancels, Alt+E opens the file at the question instead. Styled as the answer
 * block it will become.
 */
export function AnswerEditor({ initial, onText, onSave, onCancel, saving, note, canCheck, editHref }: Props) {
  const area = useRef<HTMLTextAreaElement>(null);
  // Held here, not in the page: a round trip through the page per keystroke loses keys typed
  // faster than it re-renders.
  const [text, setText] = useState(initial);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    area.current?.focus();
    const el = area.current;
    if (el) el.selectionStart = el.selectionEnd = el.value.length;
  }, []);

  // Grow with the text, so a long answer is never read through a slot.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [text]);

  const empty = !text.trim();
  if (opened) return <OpenedNotice onBack={() => setOpened(false)} onClose={onCancel} />;
  return (
    <div class="answer-editor" role="group" aria-label="Answer">
      <span class="qa-icon" aria-hidden="true">
        💬
      </span>
      <textarea
        ref={area}
        value={text}
        rows={2}
        placeholder="Write the answer — Markdown; a line starting with - is a bullet"
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
          } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !empty && !saving) {
            e.preventDefault();
            onSave(false, e.shiftKey);
          }
        }}
      />
      {note && <p class="answer-note">{note}</p>}
      <div class="answer-buttons">
        <button class="answer-save" disabled={empty || saving} onClick={() => onSave(false, false)} title="Save (Ctrl+Enter) — Ctrl+Shift+Enter: save and open the next unanswered question">
          {saving ? 'Saving…' : 'Save'}
        </button>
        {canCheck && (
          <button class="answer-save" disabled={empty || saving} onClick={() => onSave(true, false)} title="Save, and tick the checkbox">
            Check &amp; Save
          </button>
        )}
        <button class="answer-cancel" disabled={saving} onClick={onCancel} title="Cancel (Esc)">
          Cancel
        </button>
        {editHref && <EditLink href={editHref} onOpen={() => setOpened(true)} />}
      </div>
    </div>
  );
}
