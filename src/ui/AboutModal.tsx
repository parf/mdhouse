import { useEffect } from 'preact/hooks';
import { IconX } from './icons';
import { version } from '../../package.json';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AboutModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div class="modal-backdrop" onClick={onClose} role="presentation">
      <div
        class="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button class="modal-close icon-btn" onClick={onClose} title="Close" aria-label="Close">
          <IconX size={15} />
        </button>

        <div class="about-header">
          <div class="about-mark-wrap">
            <span class="mark about-mark" aria-hidden="true" />
          </div>
          <h2 id="about-title" class="about-title">
            MDHOUSE version {version} - web viewer for Markdown trees
          </h2>
          <div class="about-links">
            <a href="https://github.com/parf/mdhouse" target="_blank" rel="noopener noreferrer">
              https://github.com/parf/mdhouse
            </a>
            {' - Author: Serg Parf - '}
            <a href="https://parf.dev" target="_blank" rel="noopener noreferrer">
              https://parf.dev
            </a>
          </div>
        </div>

        <hr class="about-divider" />

        <div class="about-shortcuts">
          <div class="about-section-title">Keyboard Shortcuts</div>
          <table class="shortcuts-table">
            <tbody>
              <tr>
                <td>
                  <kbd>Ctrl+B</kbd> / <kbd>⌘B</kbd>
                </td>
                <td>Cycle sidebar (bar → compact → open)</td>
              </tr>
              <tr>
                <td>
                  <kbd>/</kbd>, <kbd>Ctrl+K</kbd>, <kbd>Ctrl+P</kbd>
                </td>
                <td>Open sidebar and focus search</td>
              </tr>
              <tr>
                <td>
                  <kbd>Esc</kbd>
                </td>
                <td>Clear search query / close popup</td>
              </tr>
              <tr>
                <td>
                  <kbd>?</kbd>
                </td>
                <td>Show this shortcuts & about dialog</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
