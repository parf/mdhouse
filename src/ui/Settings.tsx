import { useState } from 'preact/hooks';
import { api, type RootInfo } from './api';
import { IconTrash } from './icons';

interface Props {
  roots: RootInfo[];
  /** The live channel refreshes `roots`; this is only for an immediate re-read. */
  onChanged: () => void;
}

/**
 * Settings. One section for now — the directories mdhouse serves — laid out so the next
 * options become sections beneath it rather than a rework.
 *
 * Removing is the only action here. Adding needs a path typed into a browser that cannot
 * check it exists or offer completion; `mdhouse <dir> -P` in a terminal does both.
 */
export function Settings({ roots, onChanged }: Props) {
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
      </header>

      <section>
        <h2>Directories</h2>
        <ul class="settings-roots">
          {roots.map((root) => (
            <li key={root.id}>
              <div class="what">
                <span class="name">{root.name}</span>
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
          Add one from a terminal: <code>mdhouse &lt;dir&gt; -P</code> serves it now and on every start.
          Without <code>-P</code> it lasts until mdhouse stops.
        </p>
      </section>
    </div>
  );
}
