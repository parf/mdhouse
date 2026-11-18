import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api, ApiError, isAdminDenial, type TeamAccess, type TeamAction, type TeamPreview, type TeamProject, type TeamSnapshot, type TeamUser } from './api';
import { follow } from './PageHead';
import { ALL_USERS, grantState, groupField, groupFilters, groupName, nextGrant, parseGroupField, usersIn } from './team-model';

const NEEDS_ADMIN = 'Needs the administrator: run mdhouse admin --workspace from cli';
const ACCESS_WORD: Record<TeamAccess, string> = { ro: 'RO', rw: 'RW' };

/** The page's own address for a selection: a user, a project, or neither. */
export const usersUrl = (sel: { user?: string; project?: string } = {}): string =>
  sel.user ? `/settings/users?user=${encodeURIComponent(sel.user)}` : sel.project ? `/settings/users?project=${encodeURIComponent(sel.project)}` : '/settings/users';

/** 👤 / 👥 before a name; hidden from screen readers where the row already says what it is. */
const Who = ({ group, children }: { group?: boolean; children: preact.ComponentChildren }) => (
  <>
    <span aria-hidden="true">{group ? '👥' : '👤'}</span> {children}
  </>
);

/**
 * Users (`/settings/users`): Team users with their groups and bans, and every project's grants — from a user (every
 * project, RO / RW) or from a project (its groups and users) — both editing the same grants. A selection is in the
 * address (`?user=` / `?project=`), so Back and a shared link work. Until Team access is active the page says the
 * configuration is staged: nothing here is enforced yet. An administrator only.
 */
export function UsersPage(props: { search: string; go: (url: string) => void; gear?: preact.ComponentChildren }) {
  const params = new URLSearchParams(props.search);
  const userSel = params.get('user');
  const projectSel = params.get('project');
  const [snap, setSnap] = useState<TeamSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [filter, setFilter] = useState(ALL_USERS);
  const busy = useRef(false);
  const [working, setWorking] = useState(false);

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
          <h1>Users</h1>
          <span class="head-gear">{props.gear}</span>
        </header>
        <p class="settings-error">{error}</p>
      </div>
    );
  }
  if (!snap) return <div class="spinner" />;

  const user = userSel ? snap.users.find((u) => u.id === userSel) ?? null : null;
  const project = projectSel ? snap.projects.find((p) => p.id === projectSel) ?? null : null;
  const filters = groupFilters(snap);
  const shown = usersIn(snap, filter);
  const groupOf = new Map(snap.groups.map((g) => [g.id, g]));

  return (
    <div class="settings users-page">
      <header class="home-head">
        <h1>Users</h1>
        <span class="head-gear">{props.gear}</span>
      </header>
      <p class="settings-hint">{link('/settings', '← Settings')}</p>
      {!snap.active && (
        <p class="users-staged" role="status">
          Staged: Team access is not active, so none of this is enforced yet — users, groups and grants are kept for when it is.
        </p>
      )}
      {note && (
        <p class="settings-hint users-note" role="status">
          {note}
        </p>
      )}

      <div class="users-panes">
        <nav class="users-lists" aria-label="Users and projects">
          <div class="users-filters" role="group" aria-label="Show users in a group">
            {filters.map((f) => (
              <button key={f.id} type="button" class="chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                <Who group>
                  {f.label} ({f.count})
                </Who>
              </button>
            ))}
          </div>
          <ul class="users-list">
            {shown.map((u) => (
              <li key={u.id} class={u.banned ? 'banned' : undefined}>
                {link(usersUrl({ user: u.id }), <UserLabel user={u} />, 'users-row', u.id === userSel)}
                <span class="users-badges">
                  {u.id === snap.adminId && <span class="badge users-admin">admin</span>}
                  {u.banned && <span class="badge users-banned">banned</span>}
                  {u.groups.map((g) => (
                    <span key={g} class="badge users-group">
                      <Who group>{groupOf.get(g) ? groupName(groupOf.get(g)!) : g}</Who>
                    </span>
                  ))}
                </span>
              </li>
            ))}
            {!shown.length && <li class="settings-hint">No users{filter !== ALL_USERS ? ' in this group' : ' yet'}.</li>}
          </ul>
          <AddUser snap={snap} working={working} act={act} />
          <h3 class="users-sub">Projects</h3>
          <ul class="users-list">
            {snap.projects.map((p) => (
              <li key={p.id}>{link(usersUrl({ project: p.id }), p.name, 'users-row', p.id === projectSel)}</li>
            ))}
          </ul>
        </nav>

        <section class="users-detail" aria-live="polite">
          {user ? (
            <UserDetail key={user.id} snap={snap} user={user} working={working} act={act} link={link} />
          ) : project ? (
            <ProjectDetail key={project.id} snap={snap} project={project} working={working} act={act} link={link} />
          ) : (
            <p class="settings-hint">Pick a user to see every project, or a project to see its groups and users.</p>
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

/** RO / RW as two ticks (one choice; both empty: inherit) and, for a user, No access. */
function GrantTicks(props: { label: string; value: TeamAccess | 'none' | null | undefined; withNone: boolean; disabled: boolean; set: (next: TeamAccess | 'none' | null) => void }) {
  const tick = (what: TeamAccess | 'none', text: string) => (
    <label class="users-tick">
      <input
        type="checkbox"
        checked={props.value === what}
        disabled={props.disabled}
        aria-label={`${props.label}: ${text}`}
        onChange={(e) => props.set(nextGrant(props.value, what, (e.target as HTMLInputElement).checked))}
      />{' '}
      {text}
    </label>
  );
  return (
    <span class="users-ticks">
      {tick('ro', 'RO')}
      {tick('rw', 'RW')}
      {props.withNone && tick('none', 'No access')}
    </span>
  );
}

/** Effective access and where it comes from, in words. */
function AccessState({ snap, project, user }: { snap: TeamSnapshot; project: TeamProject; user: TeamUser }) {
  const eff = project.effective[user.id] ?? null;
  const st = grantState(project, user, snap.groups);
  const how = st.kind === 'direct' ? (st.access === 'none' ? 'direct: no access' : 'direct') : st.kind === 'inherited' ? `from 👥 ${st.from.join(', ')}` : 'no grant';
  // Staged (Team access not active): nothing is enforced — say so, and show what is configured; "no access" is kept for
  // a real denial or an explicit No access.
  if (!snap.active) {
    const set = st.kind === 'direct' && st.access !== 'none' ? `${ACCESS_WORD[st.access]} ` : st.kind === 'inherited' ? `${ACCESS_WORD[st.access]} ` : '';
    return (
      <span class="users-state">
        <span class="badge users-eff staged">Not enforced</span> <span class="users-how">{set}{how}</span>
      </span>
    );
  }
  return (
    <span class="users-state">
      <span class={`badge users-eff ${eff ?? 'none'}`}>{eff ? ACCESS_WORD[eff] : 'no access'}</span> <span class="users-how">{how}</span>
    </span>
  );
}

function UserDetail({ snap, user, working, act, link }: { snap: TeamSnapshot; user: TeamUser; working: boolean; act: Act; link: Link }) {
  const [groups, setGroups] = useState(() => groupField(snap, user));
  useEffect(() => setGroups(groupField(snap, user)), [snap.revision, user.id]);
  const changed = parseGroupField(groups).join(' ') !== groupField(snap, user);
  const ban = async () => {
    const verb = user.banned ? 'Unban' : 'Ban';
    if (!confirm(user.banned ? `Unban ${user.login}? They can sign in again.` : `Ban ${user.login}? It ends their sessions and blocks sign-in.`)) return;
    await act({ action: 'ban', userId: user.id, banned: !user.banned }, `${verb}ned ${user.login}.`);
  };
  return (
    <div class="users-user">
      <h2>
        <UserLabel user={user} />
        {user.id === snap.adminId && <span class="badge users-admin">admin</span>}
        {user.banned && <span class="badge users-banned">banned</span>}
      </h2>
      <p class="settings-hint">GitHub user id {user.id}</p>
      <form
        class="users-groups"
        onSubmit={(e) => {
          e.preventDefault();
          void act({ action: 'groups', userId: user.id, groups: parseGroupField(groups).join(' ') }, 'Groups saved.');
        }}
      >
        <label>
          Groups <span class="settings-hint">(spaces or commas; a new name makes a group; 👥 All Users is automatic)</span>
          <input class="users-input" type="text" value={groups} disabled={working} spellcheck={false} autocomplete="off" onInput={(e) => setGroups((e.target as HTMLInputElement).value)} />
        </label>
        <button type="submit" class="git-btn" disabled={working || !changed}>
          Save groups
        </button>
      </form>
      <p>
        <button type="button" class={user.banned ? 'git-btn' : 'git-btn danger'} disabled={working || user.id === snap.adminId} title={user.id === snap.adminId ? 'The administrator cannot be banned' : undefined} onClick={() => void ban()}>
          {user.banned ? 'Unban' : 'Ban'}
        </button>{' '}
        <span class="settings-hint">{user.banned ? 'Banned: cannot sign in.' : 'Ban ends their sessions and blocks sign-in.'}</span>
      </p>
      <h3 class="users-sub">Projects</h3>
      <table class="users-table">
        <tbody>
          {snap.projects.map((p) => (
            <tr key={p.id}>
              <td>{link(usersUrl({ project: p.id }), p.name)}</td>
              <td>
                <GrantTicks
                  label={`${user.login} on ${p.name}`}
                  value={p.grants.users[user.id]}
                  withNone
                  disabled={working}
                  set={(access) => void act({ action: 'grant', projectId: p.id, subject: 'user', subjectId: user.id, access })}
                />
              </td>
              <td>
                <AccessState snap={snap} project={p} user={user} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProjectDetail({ snap, project, working, act, link }: { snap: TeamSnapshot; project: TeamProject; working: boolean; act: Act; link: Link }) {
  const groups = [...snap.groups].sort((a, b) => (a.id === ALL_USERS ? -1 : b.id === ALL_USERS ? 1 : a.name.localeCompare(b.name)));
  return (
    <div class="users-project">
      <h2>{project.name}</h2>
      <p class="settings-hint">
        <code>{project.path}</code> · {project.writable ? 'RW' : 'RO — a grant cannot make it writable'}
      </p>
      <h3 class="users-sub">Groups</h3>
      <table class="users-table">
        <tbody>
          {groups.map((g) => (
            <tr key={g.id}>
              <td>
                <Who group>{groupName(g)}</Who>
              </td>
              <td>
                <GrantTicks
                  label={`${groupName(g)} on ${project.name}`}
                  value={project.grants.groups[g.id]}
                  withNone={false}
                  disabled={working}
                  set={(access) => void act({ action: 'grant', projectId: project.id, subject: 'group', subjectId: g.id, access: access === 'none' ? null : access })}
                />
              </td>
              <td />
            </tr>
          ))}
        </tbody>
      </table>
      <h3 class="users-sub">Users</h3>
      <table class="users-table">
        <tbody>
          {snap.users.map((u) => (
            <tr key={u.id} class={u.banned ? 'banned' : undefined}>
              <td>{link(usersUrl({ user: u.id }), <UserLabel user={u} />)}</td>
              <td>
                <GrantTicks
                  label={`${u.login} on ${project.name}`}
                  value={project.grants.users[u.id]}
                  withNone
                  disabled={working}
                  set={(access) => void act({ action: 'grant', projectId: project.id, subject: 'user', subjectId: u.id, access })}
                />
              </td>
              <td>
                <AccessState snap={snap} project={project} user={u} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
      <h3 class="users-sub">Add user</h3>
      {!snap.oauthReady && <p class="settings-hint">GitHub sign-in is not configured yet: a user can be added now, and signs in once it is.</p>}
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
