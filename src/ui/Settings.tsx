import { useState } from 'preact/hooks';
import { api, type RootInfo, type Settings as Options } from './api';
import { IconTrash } from './icons';

/** Where to start when nothing handles `edit:` URLs yet. */
const EDIT_HELP = `https://www.google.com/search?q=${encodeURIComponent(
  'linux xdg configure edit protocol to open files in my editor',
)}`;

interface Props {
  roots: RootInfo[];
  /** The live channel refreshes `roots`; this is only for an immediate re-read. */
  onChanged: () => void;
  gear?: preact.ComponentChildren;
  options: Options;
  onOptions: (o: Options) => void;
  /** A root's folder page, and moving there in the app. */
  rootUrl: (id: string) => string;
  go: (url: string) => void;
}

/**
 * Settings. One section for now — the directories mdhouse serves — laid out so the next
 * options become sections beneath it rather than a rework.
 *
 * Removing is the only action here. Adding needs a path typed into a browser that cannot
 * check it exists or offer completion; `mdhouse <dir> -p` in a terminal does both.
 */
export function Settings({ roots, onChanged, gear, options, onOptions, rootUrl, go }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const last = roots.length === 1;

  const remove = async (root: RootInfo) => {
    const how = root.saved ? 'forget it and stop serving it' : 'stop serving it';
    if (!confirm(`Remove ${root.path}?\n\nmdhouse will ${how}. Nothing on disk is touched.`)) return;
    setBusy(root.id);
    setError('');
    try {
      await api.removeRoot(root.id);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div class="settings">
      <header class="home-head">
        <h1>Settings</h1>
        <span class="head-gear">{gear}</span>
      </header>

      <section>
        <h2>Directories</h2>
        <ul class="settings-roots">
          {roots.map((root) => (
            <li key={root.id}>
              <div class="what">
                <a
                  class="name"
                  href={rootUrl(root.id)}
                  title={`${root.name}/ — every file, as a list`}
                  onClick={(e) => {
                    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
                    e.preventDefault();
                    go(rootUrl(root.id));
                  }}
                >
                  {root.name}
                </a>
                <span class="path" title={root.path}>
                  {root.path}
                </span>
              </div>
              <span
                class={`tag ${root.saved ? 'saved' : 'session'}`}
                title={root.saved ? 'Served on every start' : 'Served until mdhouse stops'}
              >
                {root.saved ? 'saved' : 'this session'}
              </span>
              {root.writable && (
                <span class="tag rw" title="mdhouse may write to this tree">
                  RW
                </span>
              )}
              <button
                class="icon-btn danger"
                disabled={last || busy !== null}
                onClick={() => void remove(root)}
                title={last ? 'The last directory cannot be removed — mdhouse would have nothing to serve' : 'Remove'}
                aria-label={`Remove ${root.path}`}
              >
                <IconTrash size={15} />
              </button>
            </li>
          ))}
        </ul>
        {error && <p class="settings-error">{error}</p>}
        <p class="settings-note">
          Add one from a terminal: <code>mdhouse &lt;dir&gt; -p</code> serves it now and on every start.
          Without <code>-p</code> it lasts until mdhouse stops.
        </p>
      </section>

      <section>
        <h2>Documents</h2>
        {/* One line: the option, then how to make it work. The link stays outside the label —
            inside one, a click can toggle the checkbox instead of opening the page. */}
        <div class="settings-option">
          <label>
            <input
              type="checkbox"
              checked={options.editLink}
              onChange={async (e) => {
                const editLink = (e.target as HTMLInputElement).checked;
                onOptions({ ...options, editLink });
                try {
                  onOptions(await api.setSettings({ editLink }));
                } catch (err) {
                  onOptions(options);
                  setError((err as Error).message);
                }
              }}
            />
            <span>
              <b>Edit link</b> — ✎ beside each title, opening <code>edit:/full/path</code>.
            </span>
          </label>
          <span class="settings-hint">
            Needs an <code>edit:</code> URL handler.{' '}
            <a href={EDIT_HELP} target="_blank" rel="noopener noreferrer">
              How to set one up
            </a>
          </span>
        </div>
        {/* The paths are set from the CLI; here only the switch. */}
        {!!options.autoRwPaths?.length && (
          <div class="settings-option">
            <label>
              <input
                type="checkbox"
                checked={options.autoRw}
                onChange={async (e) => {
                  const autoRw = (e.target as HTMLInputElement).checked;
                  onOptions({ ...options, autoRw });
                  try {
                    onOptions(await api.setSettings({ autoRw }));
                    onChanged();
                  } catch (err) {
                    onOptions(options);
                    setError((err as Error).message);
                  }
                }}
              />
              <span>
                <b>Auto-RW</b> — folders under {options.autoRwPaths.map((p, i) => (
                  <>
                    {i > 0 && ', '}
                    <code>{p}</code>
                  </>
                ))}{' '}
                are writable.
              </span>
            </label>
            <span class="settings-hint">
              Set with <code>mdhouse --auto-rw &lt;path,…&gt;</code>
            </span>
          </div>
        )}
      </section>
    </div>
  );
}
