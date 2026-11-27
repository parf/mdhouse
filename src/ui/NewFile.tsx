import { useEffect, useRef, useState } from 'preact/hooks';
import { api, ApiError } from './api';
import { IconNewDoc } from './icons';
import { newFileName } from './create-file';

interface Props {
  /** The destination folder in the `p` form (`<root>` or `<root>/<dir>`). */
  dir: string;
  /** The destination as shown: the project's name and the folder path. */
  where: string;
  /** Opens the created file's editor page in this tab. */
  go: (url: string) => void;
}

/** The refusal shown under the field; the typed name stays for correction. */
function refusalText(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Could not reach mdhouse — try again.';
  if (err.status === 409) return 'A file with this name already exists here.';
  if (err.status === 400) return err.reason === 'name' ? 'Not a valid file name.' : err.message;
  if (err.status === 404) return 'This folder no longer exists.';
  if (err.status === 403) return 'You cannot create files in this folder.';
  return err.message;
}

/** The breadcrumb's New Markdown file button and its dialog: a name, the folder shown read-only, Create / Cancel. */
export function NewFile({ dir, where, go }: Props) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyNow = useRef(false);
  const button = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLFormElement>(null);
  const name = newFileName(typed);

  /** Cleared on unmount: a late answer for a page already left opens nothing. */
  const live = useRef(true);
  useEffect(() => () => void (live.current = false), []);
  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);

  const close = () => {
    if (busyNow.current) return;
    setOpen(false);
    setTyped('');
    setError('');
    button.current?.focus();
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!name || busyNow.current) return;
    busyNow.current = true;
    setBusy(true);
    setError('');
    const from = location.pathname + location.search;
    try {
      const made = await api.newFile(dir, name);
      if (!live.current || location.pathname + location.search !== from) return;
      setOpen(false);
      setTyped('');
      go(made.url);
    } catch (err) {
      if (!live.current) return;
      setError(refusalText(err));
      field.current?.focus();
    } finally {
      busyNow.current = false;
      if (live.current) setBusy(false);
    }
  };

  // While open, every key belongs to the dialog — even with focus outside it (a click on its padding): the page's
  // shortcuts (e, x, a …) do not fire behind it, Escape closes it, and Tab cycles inside.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const box = dialog.current;
      if (!box) return;
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      const all = [...box.querySelectorAll<HTMLElement>('input, button:not([disabled])')];
      const first = all[0];
      const last = all[all.length - 1];
      const at = document.activeElement;
      if (!box.contains(at)) {
        e.preventDefault();
        first?.focus();
      } else if (e.shiftKey && at === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && at === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    addEventListener('keydown', onKey, true);
    return () => removeEventListener('keydown', onKey, true);
  }, [open]);

  return (
    <>
      <span class="view-add new-file-add">
        <button
          ref={button}
          type="button"
          class="view-chip add new-file-btn"
          title={`New Markdown file in ${where}`}
          aria-label="New Markdown file"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          <IconNewDoc size={15} />
        </button>
      </span>
      {open && (
        <div class="modal-backdrop" role="presentation" onClick={close}>
          <form
            ref={dialog}
            class="modal-dialog new-file"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-file-title"
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
          >
            <h2 id="new-file-title">New Markdown file</h2>
            <label class="new-file-field">
              <span>File name</span>
              <input
                ref={field}
                value={typed}
                onInput={(e) => {
                  setTyped(e.currentTarget.value);
                  setError('');
                }}
                autocomplete="off"
                spellcheck={false}
                aria-invalid={!!error}
                aria-describedby="new-file-final new-file-error"
              />
            </label>
            <p class="new-file-where">
              In <code>{where}</code>
            </p>
            <p id="new-file-final" class="new-file-final">
              {name ? (
                <>
                  Creates <code>{name}</code>
                </>
              ) : (
                'Type a name; .md is added when it has no Markdown suffix.'
              )}
            </p>
            <p id="new-file-error" class="new-file-error" role="alert">
              {error}
            </p>
            <div class="new-file-actions">
              <button type="button" class="git-btn" onClick={close} disabled={busy}>
                Cancel
              </button>
              <button type="submit" class="git-btn primary" disabled={!name || busy}>
                {busy ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
