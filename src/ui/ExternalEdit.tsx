import { IconEdit } from './icons';

/** Alt+E in a form: by the key, not the character — on a Mac Option+E types an accent. */
export const isEditKey = (e: KeyboardEvent) => e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyE';

/** The form's ✎: opens the file at the form's line, as Alt+E does. */
export function EditLink({ href, onOpen }: { href: string; onOpen: () => void }) {
  return (
    <a class="form-edit" href={href} onClick={onOpen} title={`Edit ${href.slice(5)} (Alt+E)`} aria-label="Edit in external editor">
      <IconEdit size={14} />
    </a>
  );
}

/** What a form shows once the file was handed to the external editor: the form is set aside. */
export function OpenedNotice({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  return (
    <div class="form-opened" role="status">
      <span>Opened in external editor</span>
      <button class="answer-cancel" onClick={onBack} title="Back to the form, with your text">
        Back
      </button>
      <button
        class="answer-cancel"
        ref={(b) => b?.focus()}
        onClick={onClose}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        title="Close (Esc)"
      >
        Close
      </button>
    </div>
  );
}
