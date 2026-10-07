import { useEffect, useRef, useState } from 'preact/hooks';

interface Props {
  /** The draft to start from; from then on the editor keeps the text itself. */
  initial: string;
  /** Every change, so the draft outlives this editor (the page re-renders after a reload). */
  onText: (text: string) => void;
  /** Save; `check` also ticks a checkbox question ("Check & Save"). */
  onSave: (check: boolean) => void;
  onCancel: () => void;
  saving: boolean;
  /** Why the last save did not go through, or anything else worth saying. */
  note: string | null;
  /** A checkbox question that is not ticked yet: offer "Check & Save". */
  canCheck: boolean;
}

/**
 * The answer being written, under its question: a textarea that grows with the text, and Save
 * below it. Ctrl/⌘+Enter saves, Esc cancels. Styled as the answer block it will become.
 */
export function AnswerEditor({ initial, onText, onSave, onCancel, saving, note, canCheck }: Props) {
  const area = useRef<HTMLTextAreaElement>(null);
  // Held here, not in the page: a round trip through the page per keystroke loses keys typed
  // faster than it re-renders.
  const [text, setText] = useState(initial);

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
          } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !empty && !saving) {
            e.preventDefault();
            onSave(false);
          }
        }}
      />
      {note && <p class="answer-note">{note}</p>}
      <div class="answer-buttons">
        <button class="answer-save" disabled={empty || saving} onClick={() => onSave(false)} title="Save (Ctrl+Enter)">
          {saving ? 'Saving…' : 'Save'}
        </button>
        {canCheck && (
          <button class="answer-save" disabled={empty || saving} onClick={() => onSave(true)} title="Save, and tick the checkbox">
            Check &amp; Save
          </button>
        )}
        <button class="answer-cancel" disabled={saving} onClick={onCancel} title="Cancel (Esc)">
          Cancel
        </button>
      </div>
    </div>
  );
}
