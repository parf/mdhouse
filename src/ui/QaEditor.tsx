import { useEffect, useRef, useState } from 'preact/hooks';
import { EditLink, OpenedNotice, isEditKey } from './ExternalEdit';

/** What is being written: a question's answer, an issue's reply, a comment on an option, a verdict on a 💡, an edit. */
export type QaKind = 'question' | 'finding' | 'option' | 'proposal' | 'comment' | 'edit';

/** An action button: what it does, its label, its tooltip. */
type Action = [string, string, string?];

/**
 * The actions each form offers besides 💬 (save) and ESC. A stage saves the reply and moves the
 * item to that stage; `partial` saves it as 💬 ⚠️ (need more); `pick` saves and picks the option.
 */
const ACTIONS: Record<QaKind, Action[]> = {
  question: [
    ['✅', '✅ settled', 'Close it, nothing to carry over'],
    ['🚫', '🚫 drop'],
    ['⏸️', '⏸️ defer'],
    ['⏳', '⏳ agent', 'Waiting on the agent'],
    ['partial', '⚠️ need more', 'A partial answer: it stays open'],
    ['🎫', '🎫 ticket', 'File a ticket — name who takes it: 👤name or 👥team'],
    ['🎯', '🎯 target', 'Select it for the next run — the agent then acts on the 🎯 ones only'],
  ],
  finding: [
    ['✅', '✅ done', 'Fixed / done'],
    ['🚫', '🚫 reject', 'Rejected — say why'],
    ['⏸️', '⏸️ defer', 'Deferred — later'],
    ['⏳', '⏳ agent', 'Waiting on the agent'],
    ['⚠️', '⚠️ partial', 'Partly done — follow-up needed'],
    ['🎫', '🎫 ticket', 'File a ticket — name who takes it: 👤name or 👥team'],
    ['🎯', '🎯 target', 'Select it for the next run — the agent then acts on the 🎯 ones only'],
  ],
  option: [['pick', 'pick it', 'Save and pick this option']],
  proposal: [
    ['yes', '✓ agree', 'It is the answer: 💡 becomes ✅ 💡'],
    ['no', '✗ cancel', 'Cancel — the question is closed 🚫'],
  ],
  comment: [],
  edit: [],
};
/** An issue's 💡: accepted — the agent does it — or ignored, which closes the issue. */
const ISSUE_PROPOSAL: Action[] = [
  ['yes', '✓ accept', 'Accept the solution — the agent does it'],
  ['no', '✗ ignore', 'Ignore — the issue is closed 🚫'],
];
const ELABORATE: Action = ['elaborate', '🔍 more', "Ask for more: a reply 'elaborate — …'; the item stays open"];
/** One number per action, the same in every form — Alt+number presses it. */
const NUM: Record<string, number> = { '✅': 1, yes: 1, '🚫': 2, no: 2, '⏸️': 3, '⏳': 4, partial: 5, '⚠️': 5, '🎫': 6, elaborate: 7, pick: 8, '🎯': 9 };

/** "Sign as me": remembered per browser. */
const SIGN_KEY = 'mdhouse.qa.sign';
const loadSign = () => {
  try {
    return localStorage.getItem(SIGN_KEY) === '1';
  } catch {
    return false;
  }
};
const saveSign = (on: boolean) => {
  try {
    localStorage.setItem(SIGN_KEY, on ? '1' : '0');
  } catch {
    /* storage unavailable: kept for this page only */
  }
};

interface Props {
  kind: QaKind;
  /** A 💡's form: the button it was opened from — what Ctrl+Enter does. */
  first?: 'yes' | 'no' | 'reply';
  /** A 💡 on an issue: ✓ accept / ✗ ignore (closes it) rather than yes / no. */
  issue?: boolean;
  /** The draft to start from; from then on the editor keeps the text itself. */
  initial: string;
  /** Who a signed reply is from. */
  me: string;
  /** Every change, so the draft outlives this editor (the page re-renders after a reload). */
  onText: (text: string) => void;
  /** Save, with the action pressed (null: a plain 💬); `next` then opens the next open question. */
  onAct: (action: string | null, sign: boolean, next: boolean) => void;
  onCancel: () => void;
  saving: boolean;
  /** Why the last save did not go through, or anything else worth saying. */
  note: string | null;
  /** `edit:/path:line` at the item, or null when the edit link is off. */
  editHref: string | null;
}

/**
 * The form under a Q&A item: a textarea that grows with the text, then 💬 (save), the actions
 * that fit, ESC and `[ ] 👤` (sign as me). Ctrl/⌘+Enter saves, with Shift it also opens the next
 * open question; Alt+1…9 press an action; Alt+E opens the file at the item instead; Esc cancels.
 */
export function QaEditor({ kind, first, issue, initial, me, onText, onAct, onCancel, saving, note, editHref }: Props) {
  const area = useRef<HTMLTextAreaElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [text, setText] = useState(initial);
  const [sign, setSign] = useState(loadSign);
  const [need, setNeed] = useState(false);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    const el = area.current;
    el?.focus();
    if (el) el.selectionStart = el.selectionEnd = el.value.length;
  }, []);
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [text]);

  const actions = (kind === 'edit' ? [] : [...(kind === 'proposal' && issue ? ISSUE_PROPOSAL : ACTIONS[kind]), ELABORATE]).sort((a, b) => NUM[a[0]]! - NUM[b[0]]!);
  const act = (action: string | null, next = false) => {
    if (saving) return;
    // 🎫 asks the agent to file a ticket: it needs at least who takes it
    if (action === '🎫' && !/(👤|👥)[^\s👤👥]+/u.test(text)) {
      setNeed(true);
      if (!text) {
        setText('👤');
        onText('👤');
      }
      area.current?.focus();
      return;
    }
    const plain = action === null || action === 'reply';
    if (plain && !text.trim()) return;
    onAct(plain ? null : action, sign, next);
  };
  const save = first && first !== 'reply' ? first : null;

  if (opened) return <OpenedNotice onBack={() => setOpened(false)} onClose={onCancel} />;
  return (
    <div class={`qa-edit${need ? ' need' : ''}`} role="group" aria-label="Reply">
      <textarea
        ref={area}
        value={text}
        rows={2}
        placeholder={
          need
            ? '🎫 needs who takes it: 👤name or 👥team (and what, if not obvious)'
            : first === 'yes'
              ? 'Yes — anything to add? (optional)'
              : first === 'no'
                ? 'No — why? (optional)'
                : 'Reply — Markdown; a line starting with - is a bullet'
        }
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
            act(save, e.shiftKey);
          } else {
            // Alt+1…9: the action with that number, if this form has it (the key's code, so any layout works)
            const n = e.altKey && !e.ctrlKey && !e.metaKey && /^Digit([1-9])$/.exec(e.code);
            if (n) {
              e.preventDefault();
              bar.current?.querySelector<HTMLButtonElement>(`[data-n="${n[1]}"]`)?.click();
            }
          }
        }}
      />
      {note && <p class="answer-note">{note}</p>}
      <div class="bar" ref={bar}>
        <button
          type="button"
          class={`save${save ? '' : ' default'}`}
          disabled={saving || !text.trim()}
          onClick={() => act(null)}
          data-tip="Save — Ctrl+Enter · Ctrl+Shift+Enter: save and open the next open question"
        >
          {saving ? '…' : kind === 'proposal' ? '💬 reply' : '💬'}
        </button>
        {actions.map(([a, label, tip]) => (
          <button
            type="button"
            key={a}
            class={a === save ? 'default' : ''}
            disabled={saving}
            data-n={NUM[a]}
            data-tip={`${tip ? `${tip} — ` : ''}Alt+${NUM[a]}`}
            onClick={() => act(a)}
          >
            <span class="n">{NUM[a]}</span> {label}
          </button>
        ))}
        <button type="button" class="cancel" disabled={saving} onClick={onCancel} data-tip="Cancel — Esc">
          ESC
        </button>
        {editHref && <EditLink href={editHref} onOpen={() => setOpened(true)} />}
        {kind !== 'edit' && (
          <label class="sign" data-tip={`Sign the reply: it starts with 👤${me}`}>
            <input
              type="checkbox"
              checked={sign}
              onChange={(e) => {
                const on = (e.target as HTMLInputElement).checked;
                setSign(on);
                saveSign(on);
              }}
            />{' '}
            👤
          </label>
        )}
      </div>
    </div>
  );
}
