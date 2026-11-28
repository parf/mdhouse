import { useEffect, useId, useMemo, useRef, useState } from 'preact/hooks';
import { api, ApiError, isAdminDenial, type TeamAccess, type TeamAction, type TeamGroup, type TeamPreview, type TeamProject, type TeamSnapshot, type TeamUser } from './api';
import { follow } from './PageHead';
import { accessDirectory, accessTitles, SettingsNav, usersUrl } from './SettingsNav';
import { ALL_USERS, configuredAccess, grantAction, grantChoices, grantShown, groupField, groupFilters, groupName, parseGroupField, projectSources, PUBLIC_NAME, publicAccess, sourcesText, userSources, usersIn, type GrantChoice, type GrantSubject } from './team-model';

const NEEDS_ADMIN = 'Needs the administrator: run mdhouse admin --workspace from cli';
const ACCESS_WORD: Record<TeamAccess, string> = { ro: 'Read-only', rw: 'Read and write' };

/** 👤 / 👥 before a name; hidden from screen readers where the row already says what it is. */
const Who = ({ group, children }: { group?: boolean; children: preact.ComponentChildren }) => (
  <>
    <span aria-hidden="true">{group ? '👥' : '👤'}</span> {children}
  </>
);

/**
 * Users and Groups (`/settings/users`, `?view=groups`): Team users with their groups and bans, the groups with their
 * members, and every project's grants — from a user, a group or a project — all editing the same grants. A selection is
 * in the address (`?user=` / `?group=` / `?project=`), so Back and a shared link work. Until Team access is active the
 * page says once that the configuration is staged. An administrator only.
 */
export function UsersPage(props: { search: string; go: (url: string) => void; gear?: preact.ComponentChildren }) {
  const params = new URLSearchParams(props.search);
  const userSel = params.get('user');
  const groupSel = params.get('group');
  const projectSel = params.get('project');
  const selection = userSel ?? groupSel ?? projectSel;
  const view = accessDirectory(params);
  const title = accessTitles[view];
  const settingsView = view === 'projects' ? 'access' : view;
  const [snap, setSnap] = useState<TeamSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [filter, setFilter] = useState(ALL_USERS);
  const busy = useRef(false);
  const [working, setWorking] = useState(false);
  const detail = useRef<HTMLElement>(null);
  const loaded = snap !== null;
  useEffect(() => {
    if (!loaded || selection === null) return;
    const heading = detail.current?.querySelector('h2');
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: 'nearest' });
  }, [loaded, selection, view]);

  const load = () =>
    api.team().then(
      (s) => {
        setSnap(s);
        setError(null);
      },
      (e: unknown) => setError(isAdminDenial(e) ? NEEDS_ADMIN : (e as Error).message),
    );
  useEffect(() => void load(), []);

  /** One change at the snapshot's revision; a stale one reloads and says so. */
  const act = async (action: TeamAction, done?: string): Promise<boolean> => {
    if (!snap || busy.current) return false;
    busy.current = true;
    setWorking(true);
    setNote(null);
    try {
      setSnap(await api.teamAct(snap.revision, action));
      if (done) setNote(done);
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        await load();
        setNote('Changed elsewhere — reloaded; check it and try again.');
      } else setNote(isAdminDenial(e) ? NEEDS_ADMIN : (e as Error).message);
      return false;
    } finally {
      busy.current = false;
      setWorking(false);
    }
  };

  const link = (url: string, text: preact.ComponentChildren, cls?: string, current?: boolean) => (
    <a class={cls} href={url} aria-current={current ? 'true' : undefined} onClick={(e) => follow(e, () => props.go(url))}>
      {text}
    </a>
  );

  if (error) {
    return (
      <div class="settings users-page">
        <header class="home-head">
          <h1>{title}</h1>
          <span class="head-gear">{props.gear}</span>
        </header>
        <SettingsNav current={settingsView} go={props.go} />
        <p class="settings-error">{error}</p>
      </div>
    );
  }
  if (!snap) return <div class="spinner" />;

  const user = userSel ? snap.users.find((u) => u.id === userSel) ?? null : null;
  const group = groupSel ? snap.groups.find((g) => g.id === groupSel) ?? null : null;
  const project = projectSel ? snap.projects.find((p) => p.id === projectSel) ?? null : null;
  const selected = !!(user || group || project);
  const filters = groupFilters(snap);
  const shown = usersIn(snap, filter);
  const groupOf = new Map(snap.groups.map((g) => [g.id, g]));

  return (
    <div class="settings users-page">
      <header class="home-head">
        <h1>{title}</h1>
        <span class="head-gear">{props.gear}</span>
      </header>
      <SettingsNav current={settingsView} go={props.go} />
      <Activation snap={snap} working={working} reload={load} setNote={setNote} />
      {note && (
        <p class="settings-hint users-note" role="status">
          {note}
        </p>
      )}

      <div class={`users-panes${selected ? ' has-selection' : ''}`}>
        <aside class="users-lists" aria-label={`${title} directory`}>
          {view === 'groups' ? (
            <ul class="users-list">
              {filters.map((f) => (
                <li key={f.id}>{link(usersUrl({ group: f.id }), <Who group>{f.label} ({f.count})</Who>, 'users-row', f.id === groupSel)}</li>
              ))}
            </ul>
          ) : view === 'projects' ? (
            <ul class="users-list">
              {snap.projects.map((p) => (
                <li key={p.id}>{link(usersUrl({ project: p.id }), p.name, 'users-row', p.id === projectSel)}</li>
              ))}
            </ul>
          ) : (
            <>
              {snap.groups.length > 1 && (
                <label class="users-filter">
                  <span>Filter by group</span>
                  <select class="ab-select" value={filter} onChange={(event) => setFilter(event.currentTarget.value)}>
                    {filters.map((f) => <option key={f.id} value={f.id}>{f.label} ({f.count})</option>)}
                  </select>
                </label>
              )}
              <ul class="users-list">
                {shown.map((u) => (
                  <li key={u.id} class={u.banned ? 'banned' : undefined}>
                    {link(usersUrl({ user: u.id }), <UserLabel user={u} />, 'users-row', u.id === userSel)}
                    <span class="users-badges">
                      {u.id === snap.adminId && <span class="badge users-admin">admin</span>}
                      {u.banned && <span class="badge users-banned">banned</span>}
                      {u.groups.filter((id) => id !== ALL_USERS).map((g) => (
                        <span key={g} class="badge users-group">
                          <Who group>{groupOf.get(g) ? groupName(groupOf.get(g)!) : g}</Who>
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
                {!shown.length && <li class="settings-hint">No users{filter !== ALL_USERS ? ' in this group' : ' yet'}.</li>}
              </ul>
              <details class="users-disclose">
                <summary>Add user</summary>
                <AddUser snap={snap} working={working} act={act} />
              </details>
            </>
          )}
        </aside>

        <section class="users-detail" ref={detail} aria-label="Access details">
          {selected && <p class="users-detail-back">{link(usersUrl({ view }), `← ${title}`)}</p>}
          {user ? (
            <UserDetail key={user.id} snap={snap} user={user} working={working} act={act} link={link} />
          ) : group ? (
            <GroupDetail key={group.id} snap={snap} group={group} working={working} act={act} link={link} />
          ) : project ? (
            <ProjectDetail key={project.id} snap={snap} project={project} working={working} act={act} link={link} />
          ) : (
            <p class="settings-hint">{selection ? 'This selection is no longer available. Choose another record from the directory.' : 'Choose a record to see its project access.'}</p>
          )}
        </section>
      </div>
    </div>
  );
}

const UserLabel = ({ user }: { user: TeamUser }) => (
  <Who>
    <b>{user.login}</b>
    {user.name && <span class="users-name"> {user.name}</span>}
  </Who>
);

type Act = (action: TeamAction, done?: string) => Promise<boolean>;
type Link = (url: string, text: preact.ComponentChildren, cls?: string, current?: boolean) => preact.JSX.Element;

/**
 * A row's grant as radios: one click (or one arrow key) saves at once with the snapshot's revision. While a save is in
 * flight every grant radio is disabled; a refused save shows the stored choice again. A legacy explicit block shows as
 * its own checked state and stays until another radio is picked — no radio writes it.
 */
function GrantRadios({ name, label, value, subject, disabled, save }: {
  name: string;
  label: string;
  value: TeamAccess | 'none' | null | undefined;
  subject: GrantSubject;
  disabled: boolean;
  save: (choice: GrantChoice) => Promise<boolean>;
}) {
  const stored = grantShown(value);
  const [picked, setPicked] = useState<GrantChoice | null>(null);
  const box = useRef<HTMLFieldSetElement>(null);
  useEffect(() => setPicked(null), [stored]);
  const shown = picked ?? stored;
  const choices: Array<[GrantChoice | 'none', string]> = [...grantChoices(subject), ...(stored === 'none' ? [['none', 'Blocked'] as [GrantChoice | 'none', string]] : [])];
  const pick = async (choice: GrantChoice) => {
    if (disabled || choice === stored) return;
    const focused = box.current?.contains(document.activeElement) ?? false;
    setPicked(choice);
    const ok = await save(choice);
    if (!ok) setPicked(null);
    if (focused) requestAnimationFrame(() => box.current?.querySelector<HTMLInputElement>('input:checked')?.focus());
  };
  return (
    <fieldset ref={box} class="grant-radios" aria-label={label} disabled={disabled}>
      {choices.map(([v, text]) => (
        <label key={v} class={`grant-choice${v ? ` ${v}` : ' none-grant'}`}>
          <input
            type="radio"
            name={name}
            value={v}
            checked={shown === v}
            onChange={() => {
              if (v !== 'none') void pick(v);
            }}
          />
          <span>{text}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** One line per table of user grants: No Grant is no record, so the user's groups decide. */
const USER_NO_GRANT = 'No Grant on a user uses their groups\' access.';

/** The access shown in the row stays separate from the direct grant being edited. */
function UserSources({ snap, project, user }: { snap: TeamSnapshot; project: TeamProject; user: TeamUser }) {
  const grant = configuredAccess(project, user);
  if (!grant) return null;
  const configured = grant === 'none' ? null : grant;
  const inherited = !project.grants.users[user.id];
  const effective = project.effective[user.id] ?? null;
  const text = sourcesText(userSources(project, user, snap.groups));
  return (
    <div class="users-how">
      {snap.active ? (
        <span>Effective: {effective ? ACCESS_WORD[effective] : 'No access'}</span>
      ) : configured ? (
        <span>{ACCESS_WORD[configured]}{inherited ? ' from groups' : ''}</span>
      ) : (
        <span class="users-blocked">Direct access blocked</span>
      )}
      {snap.active && configured && effective !== configured && <span> · configured {ACCESS_WORD[configured].toLowerCase()}</span>}
      {text && <details><summary>Grant sources</summary>{text}</details>}
    </div>
  );
}

function RevealGrants({ expanded, onClick, controls, show, hide }: {
  expanded: boolean;
  onClick: () => void;
  controls: string;
  show: string;
  hide: string;
}) {
  return (
    <button type="button" class="linklike users-reveal" aria-expanded={expanded} aria-controls={controls} onClick={onClick}>
      {expanded ? hide : show}
    </button>
  );
}

function UserDetail({ snap, user, working, act, link }: { snap: TeamSnapshot; user: TeamUser; working: boolean; act: Act; link: Link }) {
  const [groups, setGroups] = useState(() => groupField(snap, user));
  const [showAll, setShowAll] = useState(false);
  const grantsId = useId();
  const projects = snap.projects.filter((p) => showAll || configuredAccess(p, user));
  const memberships = snap.groups.filter((g) => user.groups.includes(g.id));
  useEffect(() => setGroups(groupField(snap, user)), [snap.revision, user.id]);
  const changed = parseGroupField(groups).join(' ') !== groupField(snap, user);
  const ban = async () => {
    const verb = user.banned ? 'Unban' : 'Ban';
    if (!confirm(user.banned ? `Unban ${user.login}? They can sign in again.` : `Ban ${user.login}? It ends their sessions and blocks sign-in.`)) return;
    await act({ action: 'ban', userId: user.id, banned: !user.banned }, `${verb}ned ${user.login}.`);
  };
  return (
    <div class="users-user">
      <h2 tabIndex={-1}>
        <UserLabel user={user} />
        {user.id === snap.adminId && <span class="badge users-admin">admin</span>}
        {user.banned && <span class="badge users-banned">banned</span>}
      </h2>
      <ul class="users-membership" aria-label="Group memberships">
        {memberships.map((g) => <li key={g.id}>{link(usersUrl({ group: g.id }), groupName(g))}</li>)}
      </ul>
      <h3 class="users-sub">Project access</h3>
      {projects.length === 0 && <p class="settings-hint">No project access configured.</p>}
      {projects.length < snap.projects.length || showAll ? (
        <RevealGrants expanded={showAll} onClick={() => setShowAll((value) => !value)} controls={grantsId} show="Grant project access" hide="Show configured access only" />
      ) : null}
      {projects.length > 0 && <p class="settings-hint users-nogrant">{USER_NO_GRANT}</p>}
      <table id={grantsId} class="users-table" aria-label={`Project access for ${user.login}`} hidden={projects.length === 0}>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id}>
              <td>
                {link(usersUrl({ project: p.id }), p.name)}
                <UserSources snap={snap} project={p} user={user} />
              </td>
              <td>
                <GrantRadios name={`grant-user-${user.id}-${p.id}`} label={`Direct access for ${user.login} on ${p.name}`} subject={{ kind: 'user', id: user.id }} value={p.grants.users[user.id]} disabled={working} save={(c) => act(grantAction(p.id, { kind: 'user', id: user.id }, c), 'Project access saved.')} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <details class="users-disclose">
        <summary>Edit groups</summary>
        <form
          class="users-groups"
          onSubmit={(e) => {
            e.preventDefault();
            void act({ action: 'groups', userId: user.id, groups: parseGroupField(groups).join(' ') }, 'Groups saved.');
          }}
        >
          <label>
            Groups <span class="settings-hint">(spaces or commas; a new name makes a group; All Users is automatic)</span>
            <input class="users-input" type="text" value={groups} disabled={working} spellcheck={false} autocomplete="off" onInput={(e) => setGroups((e.target as HTMLInputElement).value)} />
          </label>
          <button type="submit" class="git-btn" disabled={working || !changed}>Save groups</button>
        </form>
      </details>
      <details class="users-disclose">
        <summary>Account details</summary>
        <p class="settings-hint">GitHub user id {user.id}</p>
        {user.id !== snap.adminId && (
          <button type="button" class={user.banned ? 'git-btn' : 'git-btn danger'} disabled={working} onClick={() => void ban()}>
            {user.banned ? 'Unban' : 'Ban'} {user.login}
          </button>
        )}
      </details>
    </div>
  );
}

/** A group: its members (links), and every project with the group's own RO / RW grant. */
function GroupDetail({ snap, group, working, act, link }: { snap: TeamSnapshot; group: TeamGroup; working: boolean; act: Act; link: Link }) {
  const members = usersIn(snap, group.id);
  const [showAll, setShowAll] = useState(false);
  const grantsId = useId();
  const projects = snap.projects.filter((p) => showAll || p.grants.groups[group.id]);
  return (
    <div class="users-group-detail">
      <h2 tabIndex={-1}>
        <Who group>{groupName(group)}</Who> <span class="users-name">{members.length} member{members.length === 1 ? '' : 's'}</span>
      </h2>
      <h3 class="users-sub">Project access</h3>
      {projects.length === 0 && <p class="settings-hint">No project grants.</p>}
      {projects.length < snap.projects.length || showAll ? (
        <RevealGrants expanded={showAll} onClick={() => setShowAll((value) => !value)} controls={grantsId} show="Grant project access" hide="Show granted projects only" />
      ) : null}
      <table id={grantsId} class="users-table" aria-label={`Project grants for ${groupName(group)}`} hidden={projects.length === 0}>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id}>
              <td>
                {link(usersUrl({ project: p.id }), p.name)}
                {!p.writable && <div class="users-how">Project is read-only</div>}
              </td>
              <td>
                <GrantRadios name={`grant-group-${group.id}-${p.id}`} label={`Grant for ${groupName(group)} on ${p.name}`} subject={{ kind: 'group', id: group.id }} value={p.grants.groups[group.id]} disabled={working} save={(c) => act(grantAction(p.id, { kind: 'group', id: group.id }, c), 'Group grant saved.')} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <details class="users-disclose">
        <summary>Members ({members.length})</summary>
        {group.id === ALL_USERS && <p class="settings-hint">Every user is a member automatically.</p>}
        {members.length ? (
          <ul class="users-list">
            {members.map((u) => <li key={u.id} class={u.banned ? 'banned' : undefined}>{link(usersUrl({ user: u.id }), <Who>{u.login}</Who>, 'users-row')}</li>)}
          </ul>
        ) : <p class="settings-hint">No members.</p>}
      </details>
    </div>
  );
}

function ProjectDetail({ snap, project, working, act, link }: { snap: TeamSnapshot; project: TeamProject; working: boolean; act: Act; link: Link }) {
  const [showGroups, setShowGroups] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const groupsId = useId();
  const usersId = useId();
  const groups = snap.groups.filter((g) => showGroups || project.grants.groups[g.id])
    .sort((a, b) => (a.id === ALL_USERS ? -1 : b.id === ALL_USERS ? 1 : a.name.localeCompare(b.name)));
  const users = snap.users.filter((u) => showUsers || project.grants.users[u.id]);
  const summary = sourcesText(projectSources(project, snap));
  return (
    <div class="users-project">
      <h2 tabIndex={-1}>{project.name}</h2>
      {!project.writable && <p class="settings-hint">Read-only project. Write grants are limited to read access.</p>}
      <p class="users-summary">{summary ? <>Configured grants · {summary}</> : 'No grants configured.'}</p>
      <h3 class="users-sub">Groups</h3>
      {groups.length < snap.groups.length || showGroups ? (
        <RevealGrants expanded={showGroups} onClick={() => setShowGroups((value) => !value)} controls={groupsId} show="Grant access to a group" hide="Show granted groups only" />
      ) : null}
      <table id={groupsId} class="users-table" aria-label={`Group grants for ${project.name}`}>
        <tbody>
          <tr class="users-public">
            <td>
              <span aria-hidden="true">🌐</span> {PUBLIC_NAME}
              <div class="users-how">Visitors without GitHub sign-in</div>
            </td>
            <td>
              <GrantRadios name={`grant-public-${project.id}`} label={`Grant for ${PUBLIC_NAME} on ${project.name}`} subject={{ kind: 'public' }} value={publicAccess(project)} disabled={working} save={(c) => act(grantAction(project.id, { kind: 'public' }, c), 'Public access saved.')} />
            </td>
          </tr>
          {groups.map((g) => (
            <tr key={g.id}>
              <td>{link(usersUrl({ group: g.id }), <Who group>{groupName(g)}</Who>)}</td>
              <td>
                <GrantRadios name={`grant-group-${g.id}-${project.id}`} label={`Grant for ${groupName(g)} on ${project.name}`} subject={{ kind: 'group', id: g.id }} value={project.grants.groups[g.id]} disabled={working} save={(c) => act(grantAction(project.id, { kind: 'group', id: g.id }, c), 'Group grant saved.')} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 class="users-sub">Direct user access</h3>
      {users.length < snap.users.length || showUsers ? (
        <RevealGrants expanded={showUsers} onClick={() => setShowUsers((value) => !value)} controls={usersId} show="Show all users" hide="Show direct grants only" />
      ) : null}
      {users.length > 0 && <p class="settings-hint users-nogrant">{USER_NO_GRANT}</p>}
      <table id={usersId} class="users-table" aria-label={`User access for ${project.name}`} hidden={users.length === 0}>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} class={u.banned ? 'banned' : undefined}>
              <td>
                {link(usersUrl({ user: u.id }), <UserLabel user={u} />)}
                {u.banned && <span class="badge users-banned">banned</span>}
                <UserSources snap={snap} project={project} user={u} />
              </td>
              <td>
                <GrantRadios name={`grant-user-${u.id}-${project.id}`} label={`Direct access for ${u.login} on ${project.name}`} subject={{ kind: 'user', id: u.id }} value={project.grants.users[u.id]} disabled={working} save={(c) => act(grantAction(project.id, { kind: 'user', id: u.id }, c), 'Project access saved.')} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <details class="users-disclose">
        <summary>Folder details</summary>
        <p class="settings-hint"><code>{project.path}</code></p>
      </details>
    </div>
  );
}

/** Add user: a GitHub username → the server's preview of that account → Confirm. A changed name drops the preview. */
function AddUser({ snap, working, act }: { snap: TeamSnapshot; working: boolean; act: Act }) {
  const [login, setLogin] = useState('');
  const [preview, setPreview] = useState<TeamPreview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const going = useRef(false);
  const first = useMemo(() => snap.users.length === 0, [snap.users.length]);
  const look = async () => {
    if (!login.trim() || going.current) return;
    going.current = true;
    setLooking(true);
    setErr(null);
    setPreview(null);
    try {
      setPreview(await api.teamPreview(login.trim()));
    } catch (e) {
      setErr(isAdminDenial(e) ? NEEDS_ADMIN : (e as Error).message);
    } finally {
      going.current = false;
      setLooking(false);
    }
  };
  const confirmAdd = async () => {
    if (!preview) return;
    if (await act({ action: 'add', token: preview.token }, `Added ${preview.user.login}${first ? ' — the administrator' : ''}.`)) {
      setPreview(null);
      setLogin('');
    }
  };
  return (
    <form
      class="users-add"
      onSubmit={(e) => {
        e.preventDefault();
        void look();
      }}
    >
      <input
        class="users-input"
        type="text"
        value={login}
        placeholder="GitHub username"
        aria-label="GitHub username"
        spellcheck={false}
        autocomplete="off"
        disabled={working || looking}
        onInput={(e) => {
          setLogin((e.target as HTMLInputElement).value);
          setPreview(null);
        }}
      />{' '}
      <button type="submit" class="git-btn" disabled={working || looking || !login.trim()}>
        {looking ? 'Looking…' : 'Look up'}
      </button>
      {err && <p class="settings-error">{err}</p>}
      {preview && (
        <div class="users-preview" role="group" aria-label="GitHub account to add">
          <p>
            <Who>
              <b>{preview.user.login}</b>
              {preview.user.name && ` ${preview.user.name}`}
            </Who>{' '}
            <span class="settings-hint">GitHub user id {preview.user.id}</span>
          </p>
          {first && <p class="settings-hint">The first user becomes the administrator.</p>}
          <button type="button" class="git-btn primary" disabled={working} onClick={() => void confirmAdd()}>
            Confirm — add {preview.user.login}
          </button>{' '}
          <button type="button" class="git-btn" onClick={() => setPreview(null)}>
            Cancel
          </button>
        </div>
      )}
    </form>
  );
}

/**
 * Team access on or off — the owner only, with the typed words. Blockers say why it cannot be turned on; the server's
 * own configuration can force it off. A switch changes who may open what: the page reloads (a sign-in may follow).
 */
function Activation({ snap, working, reload, setNote }: { snap: TeamSnapshot; working: boolean; reload: () => Promise<void>; setNote: (n: string | null) => void }) {
  const turnOn = !snap.active;
  const words = turnOn ? 'activate team' : 'deactivate team';
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const going = useRef(false);
  const blockers = snap.blockers ?? [];
  // The server says what the owner may do now: turn it on (staged, ready) or off (active).
  const can = turnOn ? !!snap.canActivate : !!snap.canDeactivate;
  const blocked = !can;
  const submit = async () => {
    if (typed !== words || blocked || going.current) return;
    going.current = true;
    setBusy(true);
    setErr(null);
    try {
      await api.teamActivation(snap.revision, turnOn, words);
      location.reload();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        await reload();
        setNote('Changed elsewhere — reloaded; check it and try again.');
      } else setErr(isAdminDenial(e) ? NEEDS_ADMIN : (e as Error).message);
    } finally {
      going.current = false;
      setBusy(false);
    }
  };
  return (
    <details class="users-activation">
      <summary>
        Team access · <b>{snap.forcedOff ? 'Forced off by server configuration' : snap.active ? 'Active' : 'Staged · grants are not enforced'}</b>
      </summary>
      {blockers.length > 0 && (
        <div class="users-blockers">
          <p class="settings-hint">It cannot be turned on yet:</p>
          <ul>
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}
      {snap.owner && blocked && !blockers.length && <p class="settings-hint">{turnOn ? 'It cannot be turned on now.' : 'It cannot be turned off now.'}</p>}
      {snap.owner ? (
        !blocked && (
          <form
            class="users-activate"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label>
              {turnOn ? 'To turn it on' : 'To turn it off'}, type <code>{words}</code>
              <input class="users-input" type="text" value={typed} spellcheck={false} autocomplete="off" disabled={working || busy} onInput={(e) => setTyped((e.target as HTMLInputElement).value)} />
            </label>
            <button type="submit" class={turnOn ? 'git-btn primary' : 'git-btn danger'} disabled={working || busy || typed !== words}>
              {busy ? '…' : turnOn ? 'Activate Team access' : 'Deactivate Team access'}
            </button>
            {err && <p class="settings-error">{err}</p>}
          </form>
        )
      ) : (
        <p class="settings-hint">Only the owner turns Team access on or off.</p>
      )}
    </details>
  );
}
