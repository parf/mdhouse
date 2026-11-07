import { useEffect, useRef, useState } from 'preact/hooks';
import { ApiError, api, isAdminDenial, type AbConfig, type AbInfo, type AdminState, type AuthorInfo, type RootInfo, type Settings as Options } from './api';
import type { AdminEntry } from './admin-entry';
import { IconTrash } from './icons';
import { abConfirmLine, spaceSummary, splitNames, syncDraft } from './ab-targets';
import { ADD_PATH_MAX, accessBadge, accessMode, accessSource, addPathProblem, customName, groupProjects, modeTarget, removable, selectedProject } from './project-groups';

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
  /** What the latest `#admin=` sign-in link came to, if there was one. */
  entry: { outcome: AdminEntry };
}

const SAVE_STALE = 'This project changed since it was shown. Check it and save again.';
const MODE_STALE = 'This project changed since it was shown. Check its access and choose again.';
const AB_STALE = "This project's Agent Bus settings changed since they were shown. Check them and save again.";
const AB_OFF_HINT = 'Enable the Agent Bus integration: mdhouse --agent-bus';
const ADD_SERVED = 'That folder is already served — it is shown above. Nothing changed.';
const ADD_STALE = 'mdhouse settings changed meanwhile, so nothing was added. Check and add again.';

/** The access a save keeps: the mode set for it; auto-RW stays conditional and is never made explicit. */
function savedAccess(root: RootInfo): string {
  const mode = accessMode(root);
  if (mode === 'rw') return 'read and write — set for this project';
  if (mode === 'ro') return 'read-only — set for this project';
  if (root.writable) return 'read-only; writable only while an auto-RW path covers it';
  return 'read-only';
}

/** What a mode change does, for its confirmation. */
function modeChange(root: RootInfo, to: 'rw' | 'ro'): string {
  const now = `${root.writable ? 'read and write' : 'read-only'} — ${accessSource(root)}`;
  const after = to === 'ro' ? 'read-only, whatever auto-RW covers' : 'read and write';
  const lasts = root.saved ? 'Kept on every start.' : 'Lasts until mdhouse stops, unless the project is saved.';
  return `Make project ${root.name} ${to === 'ro' ? 'read-only' : 'read and write'}?\n\nFolder: ${root.path}\nNow: ${now}\nAfter: ${after}\n\n${lasts} Project files stay unchanged.`;
}

/** A folder's own name: the last part of its path. */
const folderName = (path: string) => path.split('/').filter(Boolean).pop() ?? path;

/** How to become the administrator — said wherever a control needs it. */
const NEEDS_ADMIN = 'Needs the administrator: run mdhouse admin in a terminal on this computer';
const SESSION_ENDED = 'Your administrator session has ended. Run mdhouse admin in a terminal for a new sign-in link.';

/** Only a failed sign-in needs a note: a successful one shows as the state itself. */
const ENTRY_NOTE: Partial<Record<AdminEntry, string>> = {
  invalid: '❌ That sign-in link is invalid, expired or already used. Run mdhouse admin for a new one.',
  failed: '❌ The sign-in did not reach mdhouse. Run mdhouse admin for a new link.',
};

/**
 * Settings. The Projects mdhouse serves — chosen and shown here, with what the server lets be
 * changed — then this browser's own setting, then the instance-wide ones.
 *
 * Adding takes a folder's full path and an access the administrator chooses; the server checks the
 * folder. Nothing completes or lists paths here — `mdhouse <dir>` in a terminal can.
 */
export function Settings({ roots, onChanged, gear, options, onOptions, rootUrl, go, entry }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  // Unknown until the server answers; protected controls stay off until it says `admin`.
  const [admin, setAdmin] = useState<AdminState | null>(null);
  const [adminError, setAdminError] = useState('');
  const isAdmin = admin?.admin === true;
  const loadAdmin = () =>
    api.admin().then(
      (a) => setAdmin(a),
      () => setAdmin({ admin: false }),
    );
  useEffect(() => void loadAdmin(), [entry]);
  /** The refusal's text; an administrator denial also turns the protected controls off. */
  const refused = (err: unknown): string => {
    if (!isAdminDenial(err)) return (err as Error).message;
    setAdmin({ admin: false });
    void loadAdmin();
    return SESSION_ENDED;
  };
  const signOut = async () => {
    setAdminError('');
    try {
      await api.adminLogout();
    } catch (err) {
      setAdminError((err as Error).message);
    }
    await loadAdmin();
  };
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
      if (!isAdminDenial(err)) setScheme(options.editScheme);
      setSchemeError(refused(err));
    }
  };
  const [error, setError] = useState('');
  const last = removable(roots).length === 1;
  // The project whose details show; kept by id, the first one when it is gone.
  const [picked, setPicked] = useState<string | null>(null);
  const project = selectedProject(roots, picked);

  // The project's own name as typed, saved on Enter or leaving the field; a refusal keeps it to fix or retry.
  const ownName = project ? (customName(project) ?? '') : '';
  const [nameDraft, setNameDraft] = useState(ownName);
  const [nameError, setNameError] = useState('');
  useEffect(() => {
    setNameDraft(ownName);
    setNameError('');
  }, [project?.id, ownName]);
  const saveName = async () => {
    if (!project || project.kind === 'reference' || nameDraft.trim() === ownName) return;
    setNameError('');
    try {
      await api.setRootName(project.id, nameDraft);
      onChanged();
    } catch (err) {
      setNameError(refused(err));
    }
  };

  // A save confirms the stored name; one still being typed would be saved by the blur the click causes, after the confirmation.
  const nameDirty = nameDraft.trim() !== ownName;
  // The revision is taken before the Agent Bus settings are read: anything that changes after it was shown,
  // before or after that read, makes the save stale.
  const preparingSave = useRef(false);
  const save = async (root: RootInfo) => {
    const rev = (root as { saveRev?: unknown }).saveRev;
    if (typeof rev !== 'string' || nameDirty || preparingSave.current || busy !== null) return;
    preparingSave.current = true;
    setBusy(root.id);
    setError('');
    try {
      // Read now, not the copy on screen: the confirmation names what the save carries. It reaches no bus.
      let ab: string;
      try {
        ab = abConfirmLine((await api.abConfig()).roots[root.id]);
      } catch (err) {
        setError(`The Agent Bus settings could not be read — nothing was saved: ${(err as Error).message}`);
        return;
      }
      const name = customName(root) ?? `the folder's — ${folderName(root.path)}`;
      if (!confirm(`Save project ${root.name}?\n\nFolder: ${root.path}\nName: ${name}\nAccess: ${savedAccess(root)}\nAgent Bus: ${ab}\n\nmdhouse will serve it on every start. Project files stay unchanged.`)) return;
      await api.saveRoot(root.id, rev);
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.reason === 'stale') {
        setError(SAVE_STALE);
        onChanged();
      } else setError(refused(err));
    } finally {
      preparingSave.current = false;
      setBusy(null);
    }
  };

  // The mode is apart from the name: a name still being typed is saved by its own blur.
  const setMode = async (root: RootInfo) => {
    const to = modeTarget(root);
    const rev = (root as { accessRev?: unknown }).accessRev;
    if (!to || typeof rev !== 'string' || !confirm(modeChange(root, to))) return;
    setBusy(root.id);
    setError('');
    try {
      await api.setRootMode(root.id, to, rev);
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.reason === 'stale') {
        setError(MODE_STALE);
        onChanged();
      } else setError(refused(err));
    } finally {
      setBusy(null);
    }
  };

  // The folder to add, as typed, and its access: neither chosen in advance. A refusal keeps both; while any
  // project action is pending the form is off, so a success clears only what was sent.
  const [addPath, setAddPath] = useState('');
  const [addMode, setAddMode] = useState<'rw' | 'ro' | null>(null);
  const [addError, setAddError] = useState('');
  const addProblem = addPathProblem(addPath);
  // Set on entry, before the re-render that turns the form off: a second Enter or click sends nothing.
  const adding = useRef(false);
  const add = async () => {
    if (adding.current || !isAdmin || busy !== null || !addMode || addProblem) return;
    adding.current = true;
    setBusy('add');
    setAddError('');
    try {
      const { id } = await api.addRoot(addPath, addMode);
      setPicked(id);
      setAddPath('');
      setAddMode(null);
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.reason === 'served' && err.id) {
        setPicked(err.id);
        setAddError(ADD_SERVED);
      } else if (err instanceof ApiError && err.status === 409 && err.reason === 'stale') {
        setAddError(ADD_STALE);
        onChanged();
      } else setAddError(refused(err));
    } finally {
      adding.current = false;
      setBusy(null);
    }
  };

  // The stored Agent Bus settings: read without reaching any bus, again whenever the roots change.
  const [abConfig, setAbConfig] = useState<AbConfig | null>(null);
  const [abLoadError, setAbLoadError] = useState('');
  // A newer read, or a save's answer, supersedes an older read still on its way.
  const abSeq = useRef(0);
  const loadAb = () => {
    const seq = ++abSeq.current;
    return api.abConfig().then(
      (c) => {
        if (seq !== abSeq.current) return;
        setAbConfig(c);
        setAbLoadError('');
      },
      (err: Error) => seq === abSeq.current && setAbLoadError(err.message),
    );
  };
  useEffect(() => void loadAb(), [roots]);
  const space = project ? abConfig?.roots[project.id] : undefined;
  // The project's own endpoint and default agents as typed; a refusal keeps them.
  const [abOpen, setAbOpen] = useState(false);
  const [endpointDraft, setEndpointDraft] = useState('');
  const [namesDraft, setNamesDraft] = useState('');
  const [abError, setAbError] = useState('');
  const storedEndpoint = space?.endpoint ?? '';
  const storedNames = (space?.default ?? []).join(' ');
  // New stored values move an untouched draft along and leave a typed one as it is; another project starts afresh.
  const abBase = useRef({ id: '', endpoint: '', names: '' });
  useEffect(() => {
    const base = abBase.current;
    const switched = base.id !== (project?.id ?? '');
    setEndpointDraft((d) => syncDraft(d, base.endpoint, storedEndpoint, switched));
    setNamesDraft((d) => syncDraft(d, base.names, storedNames, switched));
    abBase.current = { id: project?.id ?? '', endpoint: storedEndpoint, names: storedNames };
  }, [project?.id, storedEndpoint, storedNames]);
  useEffect(() => {
    setAbOpen(false);
    setAbError('');
  }, [project?.id]);
  const abDirty = endpointDraft.trim() !== storedEndpoint || splitNames(namesDraft).join(' ') !== storedNames;
  const abEditable = isAdmin && !!abConfig?.enabled && !!space && !space.error;
  const savingAb = useRef(false);
  // The project shown now: a save's answer touches the drafts and note only of the project it was for.
  const shownId = useRef(project?.id);
  shownId.current = project?.id;
  const saveAb = async (clear: boolean) => {
    if (!project || !space || !abEditable || savingAb.current || busy !== null) return;
    const endpoint = clear ? '' : endpointDraft.trim();
    const names = clear ? [] : splitNames(namesDraft);
    if (space.hasCredential && endpoint !== storedEndpoint && !confirm(`${clear ? 'Clear' : 'Change'} the Agent Bus endpoint of ${project.name}?\n\nThe credential set on the server for ${storedEndpoint} is discarded with it.`)) return;
    savingAb.current = true;
    setBusy(project.id);
    setAbError('');
    try {
      const got = await api.setRootAb(project.id, endpoint, names, space.rev);
      ++abSeq.current;
      setAbConfig(got);
      // Saved: the drafts are what is stored now — if the reader is still on that project.
      if (shownId.current === project.id) {
        setEndpointDraft(got.roots[project.id]?.endpoint ?? '');
        setNamesDraft((got.roots[project.id]?.default ?? []).join(' '));
      }
      onChanged();
    } catch (err) {
      const message = err instanceof ApiError && err.status === 409 && err.reason === 'stale' ? AB_STALE : refused(err);
      if (shownId.current === project.id) setAbError(message);
      if (message === AB_STALE) void loadAb();
    } finally {
      savingAb.current = false;
      setBusy(null);
    }
  };

  const remove = async (root: RootInfo) => {
    const how = root.saved ? 'forget it and stop serving it' : 'stop serving it';
    if (!confirm(`Remove project ${root.name} (${root.path})?\n\nmdhouse will ${how}. Nothing on disk is touched.`)) return;
    setBusy(root.id);
    setError('');
    try {
      await api.removeRoot(root.id);
      onChanged();
    } catch (err) {
      setError(refused(err));
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

      <section class="settings-admin">
        <h2>
          Administrator <span class="scope">this browser</span>
        </h2>
        {ENTRY_NOTE[entry.outcome] && !isAdmin && <p class="settings-error">{ENTRY_NOTE[entry.outcome]}</p>}
        {admin?.admin ? (
          <div class="settings-option admin-state">
            <span>
              <b>Signed in as the administrator</b>
              {admin.expiresAt !== undefined && <> until {new Date(admin.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>}
            </span>
            <button type="button" class="admin-logout" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        ) : (
          admin && (
            <p class="settings-hint">
              Not signed in. Instance settings and removing projects need the administrator: run <code>mdhouse admin</code> in a terminal on
              this computer and open the link it gives.
            </p>
          )
        )}
        {adminError && <p class="settings-error">{adminError}</p>}
      </section>

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
                    {accessBadge(root) && <span class="tag ro" title="Read-only">RO</span>}
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
                {project.kind !== 'reference' && (
                  <>
                    <dt>Name</dt>
                    <dd class="project-name-field">
                      <input
                        class="settings-scheme project-name"
                        type="text"
                        value={nameDraft}
                        placeholder={folderName(project.path)}
                        maxLength={80}
                        spellcheck={false}
                        autocomplete="off"
                        aria-label={`Name of project ${project.name}`}
                        disabled={!isAdmin}
                        title={isAdmin ? undefined : NEEDS_ADMIN}
                        onInput={(e) => setNameDraft((e.target as HTMLInputElement).value)}
                        onBlur={() => void saveName()}
                        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                      />
                      <span class="settings-hint">
                        Shown instead of the folder's name; empty uses the folder's.
                        {!project.saved && ' Lasts until mdhouse stops, like this project.'}
                      </span>
                      {nameError && <span class="settings-error">{nameError}</span>}
                    </dd>
                  </>
                )}
                <dt>Folder</dt>
                <dd class="path" title={project.path}>
                  {project.path}
                </dd>
                <dt>Access</dt>
                <dd>
                  {project.kind === 'reference' ? (
                    <span class="project-access">
                      <span class="tag">read-only</span>{' '}
                      <button type="button" class="tag project-ab" disabled title="mdhouse reference material is never sent to agents">
                        [AB]
                      </button>
                    </span>
                  ) : (
                    <span class="project-access">
                      <button
                        type="button"
                        class={`tag project-mode${project.writable ? '' : ' ro'}`}
                        disabled={!isAdmin || busy !== null || !modeTarget(project)}
                        onClick={() => void setMode(project)}
                        title={
                          !isAdmin
                            ? NEEDS_ADMIN
                            : !modeTarget(project)
                              ? 'Cannot be changed here'
                              : project.writable
                                ? 'Make it read-only'
                                : 'Make it read and write'
                        }
                      >
                        {project.writable ? '[RW]' : '[RO]'}
                      </button>{' '}
                      {project.writable ? 'read and write' : 'read-only'} — {accessSource(project)}{' '}
                      <button
                        type="button"
                        class="tag project-ab"
                        aria-expanded={abOpen}
                        disabled={!abConfig}
                        onClick={() => setAbOpen((v) => !v)}
                        title={abConfig ? "This project's Agent Bus: endpoint and default agents" : abLoadError || 'Loading the Agent Bus settings'}
                      >
                        [AB]
                      </button>
                      {spaceSummary(space) && <code class="project-ab-value">{spaceSummary(space)}</code>}
                      {!project.saved && accessMode(project) !== 'inherit' && accessMode(project) !== null && (
                        <span class="settings-hint">Lasts until mdhouse stops, unless the project is saved.</span>
                      )}
                    </span>
                  )}
                </dd>
                <dt>Kept</dt>
                <dd>
                  {project.kind === 'reference' ? (
                    <span class="tag" title="mdhouse's own documentation — served on every start, read-only">
                      reference — always served, cannot be changed
                    </span>
                  ) : project.saved ? (
                    <span class="project-kept-default">served on every start</span>
                  ) : (
                    <span class="project-kept">
                      <button
                        type="button"
                        class="tag unsaved project-save"
                        disabled={!isAdmin || nameDirty || busy !== null || typeof project.saveRev !== 'string'}
                        onClick={() => void save(project)}
                        title={!isAdmin ? NEEDS_ADMIN : nameDirty ? 'Finish editing the name first' : 'Save it: serve it on every start'}
                      >
                        [unsaved]
                      </button>{' '}
                      served until mdhouse stops
                    </span>
                  )}
                </dd>
              </dl>
              {abOpen && project.kind !== 'reference' && (
                <div class="project-ab-editor" role="group" aria-label={`Agent Bus for ${project.name}`}>
                  {abConfig && !abConfig.enabled && <p class="settings-hint">{AB_OFF_HINT}</p>}
                  {space?.error && <p class="settings-error">The stored Agent Bus settings of this project cannot be used: {space.error}</p>}
                  <label class="settings-scheme-field">
                    <b>Endpoint</b>
                    <input
                      class="settings-scheme project-ab-endpoint"
                      type="text"
                      value={endpointDraft}
                      placeholder={abConfig?.instance.endpoint ?? ''}
                      maxLength={1024}
                      spellcheck={false}
                      autocomplete="off"
                      aria-label={`Agent Bus endpoint of project ${project.name}`}
                      disabled={!abEditable || busy !== null}
                      title={isAdmin ? undefined : NEEDS_ADMIN}
                      onInput={(e) => setEndpointDraft((e.target as HTMLInputElement).value)}
                    />
                  </label>
                  <span class="settings-hint">
                    A socket path or <code>http(s)://host:port</code>; empty uses the instance's bus.
                    {space?.hasCredential && ' A credential for it is set on the server; changing or clearing the endpoint discards it.'}
                  </span>
                  <label class="settings-scheme-field">
                    <b>Default agents</b>
                    <input
                      class="settings-scheme project-ab-default"
                      type="text"
                      value={namesDraft}
                      placeholder={(abConfig?.instance.default ?? []).join(' ')}
                      spellcheck={false}
                      autocomplete="off"
                      aria-label={`Default agents of project ${project.name}`}
                      disabled={!abEditable || busy !== null}
                      title={isAdmin ? undefined : NEEDS_ADMIN}
                      onInput={(e) => setNamesDraft((e.target as HTMLInputElement).value)}
                    />
                  </label>
                  <span class="settings-hint">
                    Asked by a page here that names none with <code>&lt;!-- AB: name --&gt;</code>; empty uses the instance's default.
                    {!project.saved && ' Lasts until mdhouse stops, unless the project is saved.'}
                  </span>
                  <div class="project-ab-actions">
                    <button type="button" class="project-ab-save" disabled={!abEditable || busy !== null || !abDirty} onClick={() => void saveAb(false)}>
                      Save
                    </button>
                    <button
                      type="button"
                      class="project-ab-clear"
                      disabled={!abEditable || busy !== null || !spaceSummary(space)}
                      onClick={() => void saveAb(true)}
                      title="Use the instance's bus and default agents"
                    >
                      Clear
                    </button>
                  </div>
                  {abError && <span class="settings-error">{abError}</span>}
                </div>
              )}
              {project.kind !== 'reference' && (
                <button
                  class="project-remove danger"
                  disabled={!isAdmin || last || busy !== null}
                  onClick={() => void remove(project)}
                  title={
                    !isAdmin ? NEEDS_ADMIN : last ? 'The last project cannot be removed — mdhouse would have nothing to serve' : 'Stop serving this project'
                  }
                >
                  <IconTrash size={15} /> Remove project
                </button>
              )}
              <p class="settings-note">
                Access starts as set when it is added: <code>mdhouse &lt;dir&gt; -p</code> serves it now and on every start (<code>--rw</code> for
                write access); without <code>-p</code> it lasts until mdhouse stops, unless saved here. [RW] / [RO] changes it.
              </p>
            </div>
          )}
        </div>
        <p class="settings-hint project-legend">
          <code>[unsaved]</code> served until mdhouse stops — click to keep it · <code>[RW]</code> / <code>[RO]</code> its access — click to
          switch · <code>[AB]</code> its Agent Bus endpoint and default agents — shown beside it only when the project sets them
        </p>
        {error && <p class="settings-error">{error}</p>}
        <form
          class="project-add"
          aria-label="Add project"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <h3>Add project</h3>
          <input
            class="settings-scheme project-add-path"
            type="text"
            value={addPath}
            placeholder="/full/path/to/folder"
            maxLength={ADD_PATH_MAX}
            spellcheck={false}
            autocomplete="off"
            aria-label="Full path of the folder to add"
            disabled={!isAdmin || busy !== null}
            title={isAdmin ? undefined : NEEDS_ADMIN}
            onInput={(e) => setAddPath((e.target as HTMLInputElement).value)}
          />
          <fieldset class="project-add-mode" disabled={!isAdmin || busy !== null}>
            <legend>Access</legend>
            <label>
              <input type="radio" name="project-add-mode" value="rw" checked={addMode === 'rw'} onChange={() => setAddMode('rw')} /> RW — read and write
            </label>
            <label>
              <input type="radio" name="project-add-mode" value="ro" checked={addMode === 'ro'} onChange={() => setAddMode('ro')} /> RO — read-only
            </label>
          </fieldset>
          <button
            type="submit"
            class="project-add-btn"
            disabled={!isAdmin || busy !== null || !addMode || addProblem !== null}
            title={!isAdmin ? NEEDS_ADMIN : addProblem ?? (!addMode ? 'Choose RW or RO' : 'Serve this folder until mdhouse stops')}
          >
            Add project
          </button>
          <span class="settings-hint">
            An existing folder, by its full path; <code>~</code> and relative paths are not expanded. Served until mdhouse stops —
            [unsaved] then keeps it.
            {addPath && addProblem && <> {addProblem}</>}
          </span>
          {addError && <span class="settings-error">{addError}</span>}
        </form>
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
              disabled={!isAdmin}
              title={isAdmin ? undefined : NEEDS_ADMIN}
              checked={options.editLink}
              onChange={async (e) => {
                const editLink = (e.target as HTMLInputElement).checked;
                onOptions({ ...options, editLink });
                try {
                  onOptions(await api.setSettings({ editLink }));
                } catch (err) {
                  onOptions(options);
                  setError(refused(err));
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
                disabled={!isAdmin}
                title={isAdmin ? undefined : NEEDS_ADMIN}
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
                disabled={!isAdmin}
                title={isAdmin ? undefined : NEEDS_ADMIN}
                checked={options.autoRw}
                onChange={async (e) => {
                  const autoRw = (e.target as HTMLInputElement).checked;
                  onOptions({ ...options, autoRw });
                  try {
                    onOptions(await api.setSettings({ autoRw }));
                    onChanged();
                  } catch (err) {
                    onOptions(options);
                    setError(refused(err));
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

      <AgentBusSettings isAdmin={isAdmin} refused={refused} config={abConfig} onConfig={() => void loadAb()} />
    </div>
  );
}

/** The Agent Bus section: off — how to turn it on; on — the connection, and the default agents. */
/**
 * The instance's Agent Bus settings. Shown from the stored settings — opening Settings reaches no bus; the
 * connection and the running agents are checked only when the reader asks.
 */
function AgentBusSettings({ isAdmin, refused, config, onConfig }: { isAdmin: boolean; refused: (err: unknown) => string; config: AbConfig | null; onConfig: () => void }) {
  const [info, setInfo] = useState<AbInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const stored = config?.instance.filter ?? [];
  const [filter, setFilter] = useState<string | null>(null);
  useEffect(() => setFilter(stored.join('\n')), [stored.join('\n')]);
  const defaults = config?.instance.default ?? [];

  const check = async () => {
    if (checking) return;
    setChecking(true);
    setError('');
    try {
      setInfo(await api.abInfo());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setChecking(false);
    }
  };

  const saveFilter = async () => {
    if (saving || !isAdmin || filter === null) return;
    setSaving(true);
    setError('');
    try {
      await api.abFilter(filter.split('\n'));
      onConfig();
    } catch (err) {
      setError(refused(err));
    } finally {
      setSaving(false);
    }
  };

  const setDefault = async (names: string[]) => {
    if (saving || !isAdmin || !config?.enabled) return;
    setSaving(true);
    setError('');
    try {
      await api.abDefault(names);
      onConfig();
    } catch (err) {
      setError(refused(err));
    } finally {
      setSaving(false);
    }
  };

  // The default agents stay listed when they are not running; before a check only they are known.
  const running = info?.enabled ? info.agents : [];
  const listed = [
    ...running.filter((a) => a.alive || defaults.includes(a.name)),
    ...defaults.filter((n) => !running.some((a) => a.name === n)).map((name) => ({ name, descr: '', alive: false })),
  ];
  const checked = info?.enabled === true;

  return (
    <section class="settings-ab">
      <h2>
        Agent Bus <span class="scope">all projects</span>
      </h2>
      {error && <p class="settings-error">{error}</p>}
      {config && !config.enabled && (
        <p class="settings-hint">
          Enable the Agent Bus integration: <code>mdhouse --agent-bus</code>
        </p>
      )}
      {config?.enabled && (
        <>
          <p class="settings-hint">
            <code>{config.instance.endpoint}</code>
            {info?.enabled && <> · {info.connected ? '✅ connected' : `❌ not connected: ${info.error}`} · as <code>{info.me}</code></>}{' '}
            <button type="button" class="ab-check" disabled={checking} onClick={() => void check()}>
              {checking ? 'Checking…' : checked ? 'Check again' : 'Check connection, list agents'}
            </button>
          </p>
          <p>
            <b>Default agent</b> — asked by a page that names none with <code>&lt;!-- AB: name --&gt;</code>, in a project without its own
          </p>
          <ul class="ab-defaults">
            {listed.map((a) => (
              <li key={a.name}>
                <label class={a.alive || !checked ? '' : 'dead'}>
                  <input
                    type="checkbox"
                    disabled={saving || !isAdmin}
                    title={isAdmin ? undefined : NEEDS_ADMIN}
                    checked={defaults.includes(a.name)}
                    onChange={(e) =>
                      void setDefault((e.target as HTMLInputElement).checked ? [...defaults, a.name] : defaults.filter((n) => n !== a.name))
                    }
                  />
                  <span>
                    <code>{a.name}</code>
                    {checked && !a.alive && <span class="ab-dead">dead — not running</span>}
                    {a.descr && <span class="ab-descr">{a.descr}</span>}
                  </span>
                </label>
              </li>
            ))}
            {!checked && <li class="settings-hint">Check the connection to list the running agents.</li>}
            {info?.enabled && info.connected && !listed.length && <li class="settings-hint">No agent is running</li>}
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
              disabled={saving || !isAdmin || filter === stored.join('\n')}
              onClick={() => void saveFilter()}
              title={isAdmin ? 'Save — Ctrl+Enter' : NEEDS_ADMIN}
            >
              Save filter
            </button>
          </div>
        </>
      )}
    </section>
  );
}
