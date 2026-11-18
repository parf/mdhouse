import { usersUrl } from './UsersPage';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { ApiError, api, isAdminDenial, type AbConfig, type AbInfo, type AdminState, type AuthorInfo, type RootInfo, type Settings as Options } from './api';
import type { AdminEntry } from './admin-entry';
import { IconTrash } from './icons';
import { abConfirmLine, spaceSummary, splitNames, syncDraft } from './ab-targets';
import { isViewer, switchConfirm, VIEWER_SIGN_IN, type InstanceMode } from './viewer-text';
import { ADD_PATH_MAX, accessBadge, accessMode, accessSource, addPathProblem, customName, groupProjects, modeTarget, removable, selectedProject, storedTitle } from './project-groups';
import { automationUrl } from './automation-model';
import { follow } from './PageHead';
import { StoredRwTag } from './viewer';

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
function modeChange(root: RootInfo, to: 'rw' | 'ro', viewer: boolean): string {
  if (viewer) {
    const stored = accessMode(root) === 'rw' ? 'read and write' : 'read-only';
    return `Store project ${root.name} as ${to === 'ro' ? 'read-only' : 'read and write'}?\n\nFolder: ${root.path}\nStored now: ${stored}\n\nThis mdhouse is a Viewer: the project stays read-only; the stored mode takes effect in Workspace.`;
  }
  const now = `${root.writable ? 'read and write' : 'read-only'} — ${accessSource(root)}`;
  const after = to === 'ro' ? 'read-only, whatever auto-RW covers' : 'read and write';
  const lasts = root.saved ? 'Kept on every start.' : 'Lasts until mdhouse stops, unless the project is saved.';
  return `Make project ${root.name} ${to === 'ro' ? 'read-only' : 'read and write'}?\n\nFolder: ${root.path}\nNow: ${now}\nAfter: ${after}\n\n${lasts} Project files stay unchanged.`;
}

/** A folder's own name: the last part of its path. */
const folderName = (path: string) => path.split('/').filter(Boolean).pop() ?? path;

/** How to become the administrator — said wherever a control needs it. */
const NEEDS_ADMIN = 'Needs the administrator: run mdhouse admin in a terminal on this computer';
const SESSION_ENDED = 'run  mdhouse admin --workspace from cli';

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
  const viewer = isViewer(options);
  const loadAdmin = () =>
    api.admin().then(
      (a) => setAdmin(a),
      () => setAdmin({ admin: false }),
    );
  useEffect(() => void loadAdmin(), [entry]);
  // `/settings#add-project` (the project chooser's Add new Project): the form in sight, its path field focused once it is usable.
  useEffect(() => {
    if (location.hash !== '#add-project' || admin === null) return;
    const form = document.getElementById('add-project');
    form?.scrollIntoView({ block: 'center' });
    form?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus();
  }, [admin, entry]);
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
    const to = modeTarget(root, viewer);
    const rev = (root as { accessRev?: unknown }).accessRev;
    if (!to || typeof rev !== 'string' || !confirm(modeChange(root, to, viewer))) return;
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

  // The folder to add, as typed, and its access: RW when ticked, else RO. A refusal keeps both; while any
  // project action is pending the form is off, so a success clears only what was sent.
  const [addPath, setAddPath] = useState('');
  const [addRw, setAddRw] = useState(false);
  const [addError, setAddError] = useState('');
  const addProblem = addPathProblem(addPath);
  // Set on entry, before the re-render that turns the form off: a second Enter or click sends nothing.
  const adding = useRef(false);
  const add = async () => {
    if (adding.current || !isAdmin || busy !== null || addProblem) return;
    adding.current = true;
    setBusy('add');
    setAddError('');
    try {
      const { id } = await api.addRoot(addPath, addRw ? 'rw' : 'ro');
      setPicked(id);
      setAddPath('');
      setAddRw(false);
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
  // The running agents, read from the bus when Settings opens with Agent Bus on, and again on request.
  const [abInfo, setAbInfo] = useState<AbInfo | null>(null);
  const [abChecking, setAbChecking] = useState(false);
  const [abCheckError, setAbCheckError] = useState('');
  const checkAb = async () => {
    if (abChecking) return;
    setAbChecking(true);
    setAbCheckError('');
    try {
      setAbInfo(await api.abInfo());
    } catch (err) {
      setAbCheckError((err as Error).message);
    } finally {
      setAbChecking(false);
    }
  };
  const abOn = !!abConfig?.enabled;
  useEffect(() => {
    if (abOn) void checkAb();
  }, [abOn]);
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
    const dropped = splitNames(storedNames).filter((n) => !names.includes(n));
    if (!clear && splitNames(storedNames).length > 1 && dropped.length && !confirm(`Keep only ${names[0] ?? "the instance's default"} as the default agent of ${project.name}?\n\nNo longer a default: ${dropped.join(' ')}`)) return;
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

  // The mode switch: the administrator only, after a confirmation that names what changes.
  const [modeBusy, setModeBusy] = useState(false);
  const [modeError, setModeError] = useState('');
  const mode: InstanceMode = viewer ? 'viewer' : 'workspace';
  const switchMode = async (to: InstanceMode) => {
    const question = switchConfirm(mode, to);
    if (!question || modeBusy || !isAdmin || !confirm(question)) return;
    setModeBusy(true);
    setModeError('');
    try {
      onOptions(await api.setSettings({ mode: to }));
      onChanged();
    } catch (err) {
      setModeError(refused(err));
    } finally {
      setModeBusy(false);
    }
  };

  const authorCard = (
    <>
        {author && viewer && (
          <p class="settings-hint">
            Your name: <b>{author.name}</b> <Info label="About your name">Signs your replies and quotes. A Viewer writes none, so it is shown, not edited.</Info>
          </p>
        )}
        {author && !viewer && (
          <div class="settings-option">
            <label class="settings-scheme-field">
              <b>Your name</b>
              <Info label="About your name">
                Signs your replies and quotes as <code>👤{author.name}</code>. Kept in this browser only. A label, not a login: it grants no
                access. {author.cookie ? 'Empty: back to the default.' : `Now taken from ${AUTHOR_FROM[author.source]}; type to override.`}
              </Info>
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

      <section class="settings-mode">
        <h2>
          Mode <span class="scope">all projects</span>
        </h2>
        <div class="mode-switch" role="group" aria-label="Mode">
          {(['workspace', 'viewer'] as const).map((m) => (
            <button
              type="button"
              class="mode-btn"
              aria-pressed={mode === m}
              disabled={mode === m || !isAdmin || modeBusy}
              title={mode === m ? 'The current mode' : !isAdmin ? NEEDS_ADMIN : undefined}
              onClick={() => void switchMode(m)}
            >
              {m === 'workspace' ? 'Workspace' : 'Viewer'}
            </button>
          ))}
          <Info label="About the mode">
            <b>Workspace</b>: each project is writable by its own RW/RO setting. <b>Viewer</b>: every project is read-only for everyone and the
            controls that change anything are gone. Each project keeps its setting; Workspace brings it back. From a terminal:{' '}
            <code>mdhouse --viewer</code> / <code>mdhouse --workspace</code>.
          </Info>
        </div>
        {viewer && !isAdmin && (
          <p class="settings-hint">
            {VIEWER_SIGN_IN[0]}
            <code>{VIEWER_SIGN_IN[1]}</code>
            {VIEWER_SIGN_IN[2]}
          </p>
        )}
        {modeError && <p class="settings-error">{modeError}</p>}
      </section>

      <section class="settings-admin">
        <h2>
          Administrator{' '}
          {admin?.admin && admin.local && (
            <Info label="Why you are the administrator">
              This request reaches mdhouse from this computer: no users are configured, and mdhouse sees it coming from loopback (this
              computer, or a proxy on it). Such a request is the administrator. Configure users to require a sign-in.
            </Info>
          )}
        </h2>
        {ENTRY_NOTE[entry.outcome] && !isAdmin && <p class="settings-error">{ENTRY_NOTE[entry.outcome]}</p>}
        {admin?.admin && admin.local ? null : admin?.admin ? (
          <div class="settings-option admin-state">
            <span>
              <b>Signed in</b>
              {admin.expiresAt !== undefined && <> until {new Date(admin.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>}
            </span>
            <button type="button" class="admin-logout" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        ) : (
          admin && (
            <p>
              Not signed in — settings are read-only here{' '}
              <Info label="How to sign in">
                Changing settings and adding or removing projects needs the administrator. Run <code>mdhouse admin</code> in a terminal on this
                computer and open the link it prints: it works once, within 60 s.
              </Info>
            </p>
          )
        )}
        {adminError && <p class="settings-error">{adminError}</p>}
      </section>

      <section class="settings-projects">
        <h2>
          Projects{' '}
          <a class="settings-users-link" href={usersUrl()} onClick={(e) => follow(e, () => go(usersUrl()))}>
            👤 Users
          </a>
          <a class="settings-users-link" href={usersUrl({ view: 'groups' })} onClick={(e) => follow(e, () => go(usersUrl({ view: 'groups' })))}>
            👥 Groups
          </a>
        </h2>
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
                    {!viewer && accessBadge(root) && <span class="tag ro" title="Read-only">RO</span>}
                    {viewer && <StoredRwTag root={root} tag />}
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
              {project.kind !== 'reference' && (
                <p class="project-users">
                  <a href={usersUrl({ project: project.id })} onClick={(e) => follow(e, () => go(usersUrl({ project: project.id })))}>
                    👥 Who can open {project.name}
                  </a>
                </p>
              )}
              <dl class="project-facts">
                {project.kind !== 'reference' && (
                  <>
                    <dt>
                      Name{' '}
                      <Info label="About the name">
                        Shown in the project list and headings instead of the folder name. Empty: the folder name.
                        {!project.saved && ' Unsaved project: kept until mdhouse stops.'}
                      </Info>
                    </dt>
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
                      {nameError && <span class="settings-error">{nameError}</span>}
                    </dd>
                  </>
                )}
                <dt>Folder</dt>
                <dd class="path" title={project.path}>
                  {project.path}
                </dd>
                {(!viewer || isAdmin || accessMode(project) === 'rw') && (
                  <>
                <dt>
                  Access{' '}
                  <Info label="About access">
                    <b>RW</b>: pages can be edited and saved. <b>RO</b>: view only. Click <code>[RW]</code> / <code>[RO]</code> to switch.
                    {!project.saved && ' Unsaved project: the choice lasts until mdhouse stops.'} From a terminal:{' '}
                    <code>mdhouse &lt;dir&gt; -p --rw</code> adds a project kept on every start, with write access.
                  </Info>
                </dt>
                <dd>
                  {project.kind === 'reference' ? (
                    <span class="project-access">
                      <span class="tag">read-only</span>
                    </span>
                  ) : viewer && !isAdmin ? (
                    <span class="project-access">
                      <StoredRwTag root={project} tag />
                    </span>
                  ) : viewer ? (
                    <span class="project-access">
                      <button
                        type="button"
                        class="tag project-mode stored"
                        disabled={busy !== null || !modeTarget(project, true)}
                        onClick={() => void setMode(project)}
                        title={storedTitle(project)}
                      >
                        {accessMode(project) === 'rw' ? '[RW]' : '[RO]'}
                      </button>{' '}
                      stored {accessMode(project) === 'rw' ? 'read and write' : 'read-only'} — takes effect in Workspace
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
                      {project.writable ? 'read and write' : 'read-only'} — {accessSource(project)}
                    </span>
                  )}
                </dd>
                  </>
                )}
                <dt>
                  Kept{' '}
                  <Info label="About kept">
                    Saved: served on every start. <code>[unsaved]</code>: served until mdhouse stops — click it to keep it.
                  </Info>
                </dt>
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
                <dt>
                  Agent Bus{' '}
                  <Info label="About the project's Agent Bus">
                    Which bus and default agent this project's pages use. Unset: the instance's, from the Agent Bus section below.
                  </Info>
                </dt>
                <dd>
                  {project.kind === 'reference' ? (
                    <span class="settings-hint">never sent to agents</span>
                  ) : (
                    <span class="project-ab-row">
                      {spaceSummary(space) ? <code class="project-ab-value">{spaceSummary(space)}</code> : <span>the instance's bus and default agent</span>}{' '}
                      <button
                        type="button"
                        class="project-ab"
                        aria-expanded={abOpen}
                        disabled={!abConfig}
                        onClick={() => setAbOpen((v) => !v)}
                        title={abConfig ? "This project's Agent Bus: endpoint and default agent" : abLoadError || 'Loading the Agent Bus settings'}
                      >
                        {abOpen ? 'Close' : 'Edit'}
                      </button>
                    </span>
                  )}
                </dd>
                {project.kind !== 'reference' && (
                  <>
                    <dt>Automation</dt>
                    <dd>
                      <a href={automationUrl(project.id)} onClick={(e) => follow(e, () => go(automationUrl(project.id)))}>
                        Scheduled runs
                      </a>
                    </dd>
                  </>
                )}
              </dl>
              {abOpen && project.kind !== 'reference' && (
                <div class="project-ab-editor" role="group" aria-label={`Agent Bus for ${project.name}`}>
                  {abConfig && !abConfig.enabled && <p class="settings-hint">{AB_OFF_HINT}</p>}
                  {space?.error && <p class="settings-error">The stored Agent Bus settings of this project cannot be used: {space.error}</p>}
                  <label class="settings-scheme-field">
                    <b>Endpoint</b>
                    <Info label="About the endpoint">
                      The Agent Bus this project talks to: a socket path or <code>http(s)://host:port</code>. Empty: the instance's bus.
                      {space?.hasCredential && ' A credential for it is set on the server; changing or clearing the endpoint discards it.'}
                    </Info>
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
                  <label class="settings-scheme-field">
                    <b>Default agent</b>
                    <Info label="About the default agent">
                      The agent a page in this project asks when the page names none with <code>&lt;!-- AB: name --&gt;</code>. Unset: the
                      instance's default agent. {!project.saved && 'Unsaved project: kept until mdhouse stops.'}
                    </Info>
                    <AgentSelect
                      class="project-ab-default"
                      value={splitNames(namesDraft)[0] ?? ''}
                      none={`instance default${abConfig?.instance.default.length ? `: ${abConfig.instance.default.join(' ')}` : ''}`}
                      agents={abAgents(abInfo, [...splitNames(namesDraft), ...splitNames(storedNames)])}
                      extra={splitNames(namesDraft).slice(1)}
                      checked={abInfo?.enabled === true}
                      label={`Default agent of project ${project.name}`}
                      disabled={!abEditable || busy !== null}
                      title={isAdmin ? undefined : NEEDS_ADMIN}
                      onChange={setNamesDraft}
                    />
                  </label>
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
            </div>
          )}
        </div>
        {error && <p class="settings-error">{error}</p>}
        <form
          id="add-project"
          class="project-add"
          aria-label="Add project"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <h3>
            Add project{' '}
            <Info label="About adding a project">
              An existing folder by its full path, like <code>/home/me/notes</code>; <code>~</code> and relative paths don't work. Tick{' '}
              <b>RW</b> to allow editing. It is served until mdhouse stops; click its <code>[unsaved]</code> to keep it.
            </Info>
          </h3>
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
          {!viewer && (
            <label class="project-add-mode" title="Ticked: read and write; else read-only">
              <input
                type="checkbox"
                checked={addRw}
                disabled={!isAdmin || busy !== null}
                onChange={(e) => setAddRw((e.target as HTMLInputElement).checked)}
              />{' '}
              RW
            </label>
          )}
          <button
            type="submit"
            class="project-add-btn"
            disabled={!isAdmin || busy !== null || addProblem !== null}
            title={!isAdmin ? NEEDS_ADMIN : addProblem ?? `Serve this folder ${addRw ? 'read and write' : 'read-only'} until mdhouse stops`}
          >
            Add project
          </button>
          {addPath && addProblem && <span class="settings-hint">{addProblem}</span>}
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
              <b>Edit link</b> — ✎ beside each title opens the file in your editor
            </span>
          </label>
          <Info label="About the edit link">
            The ✎ opens <code>{options.editScheme}:/full/path</code>, so your system needs a handler for <code>{options.editScheme}:</code> URLs —{' '}
            <a href={EDIT_HELP} target="_blank" rel="noopener noreferrer">
              how to set one up
            </a>
            . Another scheme, like <code>mdedit</code>, can open a different editor (e.g. Typora) than your usual <code>edit</code> one.
          </Info>
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
          {options.editLink && schemeError && <span class="settings-error">{schemeError}</span>}
        </div>
        {/* The paths are set from the CLI; here only the switch. */}
        {!viewer && !!options.autoRwPaths?.length && (
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
            <Info label="About Auto-RW">
              Projects under these folders open with write access unless set to RO. The folders are set from a terminal:{' '}
              <code>mdhouse --auto-rw &lt;path,…&gt;</code>
            </Info>
          </div>
        )}
      </section>

      <AgentBusSettings
        isAdmin={isAdmin}
        refused={refused}
        config={abConfig}
        onConfig={() => void loadAb()}
        info={abInfo}
        checking={abChecking}
        checkError={abCheckError}
        onCheck={() => void checkAb()}
      />
    </div>
  );
}

/**
 * An ⓘ whose help shows on mouseover or keyboard focus, and toggles on a click or tap, Enter or Space;
 * Escape hides it. The help is the control's accessible description. A click on it never reaches an
 * enclosing label, so it does not move focus to that label's field; a link inside the help still works.
 */
export function Info({ children, label = 'Help' }: { children: preact.ComponentChildren; label?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const toggle = () => {
    setDismissed(false);
    setOpen((v) => !v);
  };
  return (
    <span
      class={`info${open ? ' open' : ''}${dismissed ? ' dismissed' : ''}`}
      tabIndex={0}
      role="button"
      aria-label={label}
      aria-expanded={open}
      aria-describedby={id}
      onClick={(e) => {
        if ((e.target as Element).closest('a')) return;
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setOpen(false);
          setDismissed(true);
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      }}
      onMouseLeave={() => setDismissed(false)}
      onBlur={() => {
        setOpen(false);
        setDismissed(false);
      }}
    >
      <span class="info-tip" role="tooltip" id={id}>
        {children}
      </span>
    </span>
  );
}

/** The agents to choose from: the running ones, plus the chosen ones even when they are not running. */
function abAgents(info: AbInfo | null, chosen: readonly string[]) {
  const running = info?.enabled ? info.agents : [];
  return [
    ...running.filter((a) => a.alive || chosen.includes(a.name)),
    ...chosen.filter((n) => !running.some((a) => a.name === n)).map((name) => ({ name, descr: '', alive: false })),
  ];
}

/** One agent out of `agents`, or none (`''`); an agent not running is marked once the list is checked. */
function AgentSelect(props: {
  class: string;
  value: string;
  none: string;
  agents: readonly { name: string; descr: string; alive: boolean }[];
  checked: boolean;
  label: string;
  disabled: boolean;
  title?: string;
  /** Further stored names beyond the shown one: listed, since a pick keeps only one. */
  extra?: readonly string[];
  onChange: (name: string) => void;
}) {
  const select = (
    <select
      class={`ab-select ${props.class}`}
      value={props.value}
      aria-label={props.label}
      disabled={props.disabled}
      title={props.title}
      onChange={(e) => props.onChange((e.target as HTMLSelectElement).value)}
    >
      <option value="">— {props.none} —</option>
      {props.agents.map((a) => (
        <option key={a.name} value={a.name}>
          {a.name}
          {props.checked && !a.alive ? ' — not running' : ''}
          {a.descr ? ` · ${a.descr}` : ''}
        </option>
      ))}
    </select>
  );
  if (!props.extra?.length) return select;
  return (
    <>
      {select}
      <span class="settings-hint">
        also {props.extra.join(' ')} — a new pick keeps only one
      </span>
    </>
  );
}

/** The Agent Bus section: off — how to turn it on; on — the connection, and the default agent. */
/**
 * The instance's Agent Bus settings: the connection, the default agent (one, from the running agents) and the
 * names filter. The agent list comes from the parent, read when Settings opens and on "Check again".
 */
function AgentBusSettings({
  isAdmin,
  refused,
  config,
  onConfig,
  info,
  checking,
  checkError,
  onCheck,
}: {
  isAdmin: boolean;
  refused: (err: unknown) => string;
  config: AbConfig | null;
  onConfig: () => void;
  info: AbInfo | null;
  checking: boolean;
  checkError: string;
  onCheck: () => void;
}) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const stored = config?.instance.filter ?? [];
  const [filter, setFilter] = useState<string | null>(null);
  useEffect(() => setFilter(stored.join('\n')), [stored.join('\n')]);
  const defaults = config?.instance.default ?? [];
  // The pick shown until the stored settings catch up, so the select does not snap back while saving.
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => setPicked(null), [defaults.join(' ')]);

  const saveFilter = async () => {
    if (saving || !isAdmin || filter === null) return;
    setSaving(true);
    setError('');
    try {
      await api.abFilter(filter.split('\n'));
      onConfig();
      onCheck();
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
      setPicked(null);
      setError(refused(err));
    } finally {
      setSaving(false);
    }
  };

  const checked = info?.enabled === true;

  return (
    <section class="settings-ab">
      <h2>
        Agent Bus <span class="scope">all projects</span>
      </h2>
      {(error || checkError) && <p class="settings-error">{error || checkError}</p>}
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
            <button type="button" class="ab-check" disabled={checking} onClick={onCheck}>
              {checking ? 'Checking…' : checked ? 'Check again' : 'Check connection, list agents'}
            </button>
          </p>
          <p>
            <b>Default agent</b>{' '}
            <Info label="About the default agent">
              The agent a page asks when it names none with <code>&lt;!-- AB: name --&gt;</code> and its project sets no default agent of its
              own.
            </Info>
          </p>
          <AgentSelect
            class="ab-default"
            value={picked ?? defaults[0] ?? ''}
            none="none"
            agents={abAgents(info, defaults)}
            extra={picked === null ? defaults.slice(1) : []}
            checked={checked}
            label="Default agent of every project without its own"
            disabled={saving || !isAdmin}
            title={isAdmin ? undefined : NEEDS_ADMIN}
            onChange={(name) => {
              if (defaults.length > 1 && !confirm(`Keep only ${name || 'no agent'} as the default agent?\n\nNo longer a default: ${defaults.filter((n) => n !== name).join(' ')}`)) {
                setPicked(null);
                return;
              }
              setPicked(name);
              void setDefault(name ? [name] : []);
            }}
          />
          {info?.enabled && info.connected && !info.agents.some((a) => a.alive) && <p class="settings-hint">No agent is running</p>}
          <p>
            <b>Names filter</b>{' '}
            <Info label="About the names filter">
              Which agents the lists show: one regex per line, matched against the name without its <code>#</code> (<code>^claude</code> shows{' '}
              <code>#claude/…</code>). Empty: all agents. A default agent is always shown.
            </Info>
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
