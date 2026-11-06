import { useEffect, useState } from 'preact/hooks';
import { api, type AbInfo, type AuthorInfo, type RootInfo, type Settings as Options } from './api';
import { IconTrash } from './icons';
import { groupProjects, removable, selectedProject, writableVia } from './project-groups';

/** Where to start when nothing handles the edit link's URLs yet. */
const EDIT_HELP = `https://www.google.com/search?q=${encodeURIComponent(
  'linux xdg configure edit protocol to open files in my editor',
)}`;

/** Where a name comes from, for the hint under the name field. */
const AUTHOR_FROM: Record<AuthorInfo['source'], string> = { github: 'your GitHub login', cookie: 'this browser', prefs: 'settings', git: 'git', login: 'your login' };

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
 * Settings. The Projects mdhouse serves — chosen and shown here, with what the server lets be
 * changed — then this browser's own setting, then the instance-wide ones.
 *
 * Removing is the only action here. Adding needs a path typed into a browser that cannot
 * check it exists or offer completion; `mdhouse <dir> -p` in a terminal does both.
 */
export function Settings({ roots, onChanged, gear, options, onOptions, rootUrl, go }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  // The edit scheme as typed; saved on Enter or leaving the field, put back when the server refuses it.
  const [scheme, setScheme] = useState(options.editScheme);
  const [schemeError, setSchemeError] = useState<string | null>(null);
  useEffect(() => setScheme(options.editScheme), [options.editScheme]);
  // This browser's author name: saved on Enter or leaving the field; empty clears it.
  const [author, setAuthor] = useState<AuthorInfo | null>(null);
  const [authorDraft, setAuthorDraft] = useState('');
  const [authorError, setAuthorError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    api.author().then(
      (a) => {
        if (!live) return;
        setAuthor(a);
        setAuthorDraft(a.cookie ?? '');
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);
  const saveAuthor = async () => {
    setAuthorError(null);
    if (!author || authorDraft.trim() === (author.cookie ?? '')) return setAuthorDraft(author?.cookie ?? '');
    try {
      const a = await api.setAuthor(authorDraft);
      setAuthor(a);
      setAuthorDraft(a.cookie ?? '');
    } catch (err) {
      setAuthorDraft(author.cookie ?? '');
      setAuthorError((err as Error).message);
    }
  };
  const saveScheme = async () => {
    setSchemeError(null);
    if (scheme.trim().replace(/:+$/, '').toLowerCase() === options.editScheme) return setScheme(options.editScheme);
    try {
      onOptions(await api.setSettings({ editScheme: scheme }));
    } catch (err) {
      setScheme(options.editScheme);
      setSchemeError((err as Error).message);
    }
  };
  const [error, setError] = useState('');
  const last = removable(roots).length === 1;
  // The project whose details show; kept by id, the first one when it is gone.
  const [picked, setPicked] = useState<string | null>(null);
  const project = selectedProject(roots, picked);

  const remove = async (root: RootInfo) => {
    const how = root.saved ? 'forget it and stop serving it' : 'stop serving it';
    if (!confirm(`Remove project ${root.name} (${root.path})?\n\nmdhouse will ${how}. Nothing on disk is touched.`)) return;
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

  const authorCard = (
    <>
        {author && (
          <div class="settings-option">
            <label class="settings-scheme-field">
              <b>Your name</b>
              <input
                class="settings-scheme"
                type="text"
                value={authorDraft}
                placeholder={author.cookie ? '' : author.name}
                maxLength={64}
                spellcheck={false}
                autocomplete="off"
                aria-label="Your author name in this browser"
                onInput={(e) => setAuthorDraft((e.target as HTMLInputElement).value)}
                onBlur={saveAuthor}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            </label>
            <span class="settings-hint">
              Signs your replies and quotes as <code>👤{author.name}</code> in this browser only
              {author.cookie ? ' (set here)' : ` — now from ${AUTHOR_FROM[author.source]}`}. It is a name, not a login: it gives no access. Empty
              clears it.
            </span>
            {authorError && <span class="settings-error">{authorError}</span>}
          </div>
        )}
    </>
  );

  return (
    <div class="settings">
      <header class="home-head">
        <h1>Settings</h1>
        <span class="head-gear">{gear}</span>
      </header>

      <section class="settings-projects">
        <h2>Projects</h2>
        <div class="projects-pane">
          <nav class="project-list" aria-label="Projects">
            {groupProjects(roots).map((group) => (
              <div class="project-group" key={group.key}>
                <h3>{group.title}</h3>
                {group.roots.map((root) => (
                  <button
                    key={root.id}
                    class="project-pick"
                    aria-current={project?.id === root.id ? 'true' : undefined}
                    onClick={() => setPicked(root.id)}
                    title={root.path}
                  >
                    <span class="name">{root.name}</span>
                    {root.writable && root.kind !== 'reference' && <span class="tag rw">RW</span>}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          {project && (
            <div class="project-detail" role="region" aria-label={`Project ${project.name}`}>
              <h3>
                <a
                  class="name"
                  href={rootUrl(project.id)}
                  title={`${project.name}/ — every file, as a list`}
                  onClick={(e) => {
                    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
                    e.preventDefault();
                    go(rootUrl(project.id));
                  }}
                >
                  {project.name}
                </a>
              </h3>
              <dl class="project-facts">
                <dt>Folder</dt>
                <dd class="path" title={project.path}>
                  {project.path}
                </dd>
                <dt>Access</dt>
                <dd>
                  {project.kind === 'reference' ? (
                    <span class="tag saved">read-only</span>
                  ) : project.writable ? (
                    <span class="tag rw" title="mdhouse may write to this tree">
                      read and write
                      {writableVia(project) === 'rw' && ' — started with --rw'}
                      {writableVia(project) === 'auto' && ' — auto-RW'}
                    </span>
                  ) : (
                    <span class="tag session">read-only</span>
                  )}
                </dd>
                <dt>Kept</dt>
                <dd>
                  {project.kind === 'reference' ? (
                    <span class="tag saved" title="mdhouse's own documentation — served on every start, read-only">
                      reference — always served, cannot be changed
                    </span>
                  ) : (
                    <span
                      class={`tag ${project.saved ? 'saved' : 'session'}`}
                      title={project.saved ? 'Served on every start' : 'Served until mdhouse stops'}
                    >
                      {project.saved ? 'saved — served on every start' : 'this session — served until mdhouse stops'}
                    </span>
                  )}
                </dd>
              </dl>
              {project.kind !== 'reference' && (
                <button
                  class="project-remove danger"
                  disabled={last || busy !== null}
                  onClick={() => void remove(project)}
                  title={last ? 'The last project cannot be removed — mdhouse would have nothing to serve' : 'Stop serving this project'}
                >
                  <IconTrash size={15} /> Remove project
                </button>
              )}
              <p class="settings-note">
                Name, access and whether it is kept are set when it is added: <code>mdhouse &lt;dir&gt; -p</code> serves it now and on every start
                (<code>--rw</code> for write access); without <code>-p</code> it lasts until mdhouse stops.
              </p>
            </div>
          )}
        </div>
        {error && <p class="settings-error">{error}</p>}
      </section>

      {author && (
        <section>
          <h2>
            This browser <span class="scope">only here</span>
          </h2>
          {authorCard}
        </section>
      )}

      <section>
        <h2>
          Documents <span class="scope">all projects</span>
        </h2>
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
              <b>Edit link</b> — ✎ beside each title, opening <code>{options.editScheme}:/full/path</code>.
            </span>
          </label>
          {options.editLink && (
            <label class="settings-scheme-field">
              <b>Scheme</b>
              <input
                class="settings-scheme"
                type="text"
                value={scheme}
                spellcheck={false}
                autocapitalize="off"
                autocomplete="off"
                aria-label="Edit link URL scheme"
                onInput={(e) => setScheme((e.target as HTMLInputElement).value)}
                onBlur={saveScheme}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            </label>
          )}
          <span class="settings-hint">
            Needs a <code>{options.editScheme}:</code> URL handler.{' '}
            <a href={EDIT_HELP} target="_blank" rel="noopener noreferrer">
              How to set one up
            </a>
            .
            {options.editLink && (
              <>
                {' '}
                Example <code>mdedit:/path:line</code>: <code>mdedit</code> can be registered for Typora separately from your common{' '}
                <code>edit</code> handler.
              </>
            )}
          </span>
          {options.editLink && schemeError && <span class="settings-error">{schemeError}</span>}
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

      <AgentBusSettings />
    </div>
  );
}

/** The Agent Bus section: off — how to turn it on; on — the connection, and the default agents. */
function AgentBusSettings() {
  const [info, setInfo] = useState<AbInfo | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);

  const load = () =>
    api
      .abInfo()
      .then((got) => {
        setInfo(got);
        if (got.enabled) setFilter(got.filter.join('\n'));
      })
      .catch((err: Error) => setError(err.message));
  useEffect(() => void load(), []);

  const saveFilter = async () => {
    if (saving || filter === null) return;
    setSaving(true);
    setError('');
    try {
      await api.abFilter(filter.split('\n'));
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const setDefault = async (names: string[]) => {
    if (saving || !info?.enabled) return;
    setSaving(true);
    setError('');
    try {
      const got = await api.abDefault(names);
      setInfo({ ...info, default: got.default });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // the default agents stay listed when they are not running
  const listed = info?.enabled
    ? [...info.agents.filter((a) => a.alive || info.default.includes(a.name)), ...info.default.filter((n) => !info.agents.some((a) => a.name === n)).map((name) => ({ name, descr: '', alive: false }))]
    : [];

  return (
    <section class="settings-ab">
      <h2>
        Agent Bus <span class="scope">all projects</span>
      </h2>
      {error && <p class="settings-error">{error}</p>}
      {info && !info.enabled && (
        <p class="settings-hint">
          Enable the Agent Bus integration: <code>mdhouse --agent-bus</code>
        </p>
      )}
      {info?.enabled && (
        <>
          <p class="settings-hint">
            {info.connected ? '✅ connected' : `❌ not connected: ${info.error}`} · as <code>{info.me}</code> · <code>{info.socket}</code>
          </p>
          <p>
            <b>Default agent</b> — asked by a page that names none with <code>&lt;!-- AB: name --&gt;</code>
          </p>
          <ul class="ab-defaults">
            {listed.map((a) => (
              <li key={a.name}>
                <label class={a.alive ? '' : 'dead'}>
                  <input
                    type="checkbox"
                    disabled={saving}
                    checked={info.default.includes(a.name)}
                    onChange={(e) =>
                      void setDefault(
                        (e.target as HTMLInputElement).checked ? [...info.default, a.name] : info.default.filter((n) => n !== a.name),
                      )
                    }
                  />
                  <span>
                    <code>{a.name}</code>
                    {!a.alive && <span class="ab-dead">dead — not running</span>}
                    {a.descr && <span class="ab-descr">{a.descr}</span>}
                  </span>
                </label>
              </li>
            ))}
            {info.connected && !listed.length && <li class="settings-hint">No agent is running</li>}
          </ul>
          <p>
            <b>Names filter</b> — which agents the lists show: a regex per line, against the name without its <code>#</code>; empty — all
          </p>
          <textarea
            class="ab-filter"
            rows={4}
            spellcheck={false}
            value={filter ?? ''}
            onInput={(e) => setFilter((e.target as HTMLTextAreaElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void saveFilter();
              }
            }}
          />
          <div>
            <button
              type="button"
              class="ab-filter-save"
              disabled={saving || filter === info.filter.join('\n')}
              onClick={() => void saveFilter()}
              title="Save — Ctrl+Enter"
            >
              Save filter
            </button>
          </div>
        </>
      )}
    </section>
  );
}
