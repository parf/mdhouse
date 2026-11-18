import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api, ApiError, isAdminDenial, type TeamAccess, type TeamAction, type TeamGroup, type TeamPreview, type TeamProject, type TeamSnapshot, type TeamUser } from './api';
import { follow } from './PageHead';
import { ALL_USERS, groupField, groupFilters, groupName, membersOf, nextGrant, parseGroupField, projectSources, sourcesText, userSources, usersIn } from './team-model';

const NEEDS_ADMIN = 'Needs the administrator: run mdhouse admin --workspace from cli';
const ACCESS_WORD: Record<TeamAccess, string> = { ro: 'RO', rw: 'RW' };

/** The page's own address for a selection: a user, a group, a project, the groups index, or the users list. */
export const usersUrl = (sel: { user?: string; group?: string; project?: string; view?: 'groups' } = {}): string =>
  sel.user
    ? `/settings/users?user=${encodeURIComponent(sel.user)}`
    : sel.group
      ? `/settings/users?group=${encodeURIComponent(sel.group)}`
      : sel.project
        ? `/settings/users?project=${encodeURIComponent(sel.project)}`
        : sel.view === 'groups'
          ? '/settings/users?view=groups'
          : '/settings/users';

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
  const groupsView = params.get('view') === 'groups' || !!groupSel;
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
  const title = groupsView ? 'Groups' : 'Users';

  if (error) {
    return (
      <div class="settings users-page">
        <header class="home-head">
          <h1>{title}</h1>
          <span class="head-gear">{props.gear}</span>
        </header>
        <p class="settings-error">{error}</p>
      </div>
    );
  }
  if (!snap) return <div class="spinner" />;

  const user = userSel ? snap.users.find((u) => u.id === userSel) ?? null : null;
  const group = groupSel ? snap.groups.find((g) => g.id === groupSel) ?? null : null;
  const project = projectSel ? snap.projects.find((p) => p.id === projectSel) ?? null : null;
  const filters = groupFilters(snap);
  const shown = usersIn(snap, filter);
  const groupOf = new Map(snap.groups.map((g) => [g.id, g]));

  return (
    <div class="settings users-page">
      <header class="home-head">
        <h1>{title}</h1>
        <span class="head-gear">{props.gear}</span>
      </header>
      <p class="settings-hint">{link('/settings', '← Settings')}</p>
      {!snap.active && (
        <p class="users-staged" role="status">
          Staged: Team access is not active, so none of this is enforced yet — users, groups and grants are kept for when it is.
        </p>
      )}
      <Activation snap={snap} working={working} reload={load} setNote={setNote} />
      {note && (
        <p class="settings-hint users-note" role="status">
          {note}
        </p>
      )}

      <div class="users-panes">
        <nav class="users-lists" aria-label="Users, groups and projects">
          <div class="users-views">
            {link(usersUrl(), <Who>Users ({snap.users.length})</Who>, 'chip', !groupsView)}
            {link(usersUrl({ view: 'groups' }), <Who group>Groups ({snap.groups.length})</Who>, 'chip', groupsView)}
          </div>
          {groupsView ? (
            <ul class="users-list">
              {filters.map((f) => (
                <li key={f.id}>{link(usersUrl({ group: f.id }), <Who group>{f.label} ({f.count})</Who>, 'users-row', f.id === groupSel)}</li>
              ))}
            </ul>
          ) : (
            <>
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
            </>
          )}
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
          ) : group ? (
            <GroupDetail key={group.id} snap={snap} group={group} working={working} act={act} link={link} />
          ) : project ? (
            <ProjectDetail key={project.id} snap={snap} project={project} working={working} act={act} link={link} />
          ) : (
            <p class="settings-hint">{groupsView ? 'Pick a group to see its members and projects.' : 'Pick a user to see every project, or a project to see its groups and users.'}</p>
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

/** RO / RW as two ticks: one choice; both empty — a user uses their groups, a group has no grant. */
function GrantTicks(props: { label: string; value: TeamAccess | 'none' | null | undefined; disabled: boolean; set: (next: TeamAccess | null) => void }) {
  const tick = (what: TeamAccess, text: string) => (
    <label class="users-tick">
      <input
        type="checkbox"
        checked={props.value === what}
        disabled={props.disabled}
        aria-label={`${props.label}: ${text}`}
        onChange={(e) => {
          const next = nextGrant(props.value === 'none' ? null : props.value, what, (e.target as HTMLInputElement).checked);
          props.set(next === 'none' ? null : next);
        }}
      />{' '}
      {text}
    </label>
  );
  return (
    <span class="users-ticks">
      {tick('ro', 'RO')}
      {tick('rw', 'RW')}
    </span>
  );
}

/**
 * Where a user's access to a project comes from (`RW: 👤 direct · RO: 👥 All Users`), left out when there is none. An old
 * explicit block (`none`) is shown as such with a way back to the groups — never changed by showing it. While active, a
 * different enforced level (a read-only root caps RW) is said once.
 */
function UserSources({ snap, project, user, working, act }: { snap: TeamSnapshot; project: TeamProject; user: TeamUser; working: boolean; act: Act }) {
  const blocked = project.grants.users[user.id] === 'none';
  const src = userSources(project, user, snap.groups);
  const text = sourcesText(src);
  const eff = project.effective[user.id] ?? null;
  const own = project.grants.users[user.id];
  const configured = own === 'rw' || own === 'ro' ? own : src.rw.length ? 'rw' : src.ro.length ? 'ro' : null;
  return (
    <span class="users-how">
      {blocked ? (
        <>
          <span class="users-blocked">Direct access blocked</span>{' '}
          <button type="button" class="linklike" disabled={working} onClick={() => void act({ action: 'grant', projectId: project.id, subject: 'user', subjectId: user.id, access: null })}>
            Use group access
          </button>
          {text && <> · groups: {text}</>}
        </>
      ) : (
        text
      )}
      {snap.active && !blocked && eff !== configured && <> {eff ? `(enforced ${ACCESS_WORD[eff]})` : '(not enforced)'}</>}
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
      <p class="settings-hint">Tick RO or RW for {user.login}'s own grant; with both empty the groups decide.</p>
      <table class="users-table">
        <tbody>
          {snap.projects.map((p) => (
            <tr key={p.id}>
              <td>{link(usersUrl({ project: p.id }), p.name)}</td>
              <td>
                <GrantTicks label={`${user.login} on ${p.name}`} value={p.grants.users[user.id]} disabled={working} set={(access) => void act({ action: 'grant', projectId: p.id, subject: 'user', subjectId: user.id, access })} />
              </td>
              <td>
                <UserSources snap={snap} project={p} user={user} working={working} act={act} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A group: its members (links), and every project with the group's own RO / RW grant. */
function GroupDetail({ snap, group, working, act, link }: { snap: TeamSnapshot; group: TeamGroup; working: boolean; act: Act; link: Link }) {
  const members = membersOf(snap, group.id);
  return (
    <div class="users-group-detail">
      <h2>
        <Who group>{groupName(group)}</Who> <span class="users-name">{members.length} member{members.length === 1 ? '' : 's'}</span>
      </h2>
      {group.id === ALL_USERS && <p class="settings-hint">Every user is a member, automatically.</p>}
      {members.length > 0 && (
        <p class="users-members">
          {members.map((u, i) => (
            <span key={u.id}>
              {i > 0 && ', '}
              {link(usersUrl({ user: u.id }), <Who>{u.login}</Who>, u.banned ? 'users-row banned' : 'users-row')}
            </span>
          ))}
        </p>
      )}
      <h3 class="users-sub">Projects</h3>
      <p class="settings-hint">Tick RO or RW to give every member that access; with both empty the group gives none.</p>
      <table class="users-table">
        <tbody>
          {snap.projects.map((p) => (
            <tr key={p.id}>
              <td>{link(usersUrl({ project: p.id }), p.name)}</td>
              <td>
                <GrantTicks label={`${groupName(group)} on ${p.name}`} value={p.grants.groups[group.id]} disabled={working} set={(access) => void act({ action: 'grant', projectId: p.id, subject: 'group', subjectId: group.id, access })} />
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
  const summary = sourcesText(projectSources(project, snap));
  return (
    <div class="users-project">
      <h2>{project.name}</h2>
      <p class="settings-hint">
        <code>{project.path}</code> · {project.writable ? 'RW' : 'RO — a grant cannot make it writable'}
      </p>
      <p class="users-summary">{summary ? <>Access — {summary}</> : 'No one has access yet.'}</p>
      <h3 class="users-sub">Groups</h3>
      <table class="users-table">
        <tbody>
          {groups.map((g) => (
            <tr key={g.id}>
              <td>{link(usersUrl({ group: g.id }), <Who group>{groupName(g)}</Who>)}</td>
              <td>
                <GrantTicks label={`${groupName(g)} on ${project.name}`} value={project.grants.groups[g.id]} disabled={working} set={(access) => void act({ action: 'grant', projectId: project.id, subject: 'group', subjectId: g.id, access })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 class="users-sub">Users</h3>
      <p class="settings-hint">A user's own RO or RW; with both empty their groups decide.</p>
      <table class="users-table">
        <tbody>
          {snap.users.map((u) => (
            <tr key={u.id} class={u.banned ? 'banned' : undefined}>
              <td>{link(usersUrl({ user: u.id }), <UserLabel user={u} />)}</td>
              <td>
                <GrantTicks label={`${u.login} on ${project.name}`} value={project.grants.users[u.id]} disabled={working} set={(access) => void act({ action: 'grant', projectId: project.id, subject: 'user', subjectId: u.id, access })} />
              </td>
              <td>
                <UserSources snap={snap} project={project} user={u} working={working} act={act} />
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
    <section class="users-activation" aria-label="Team access">
      <p>
        Team access: <b>{snap.active ? 'active' : 'not active'}</b>
        {snap.forcedOff && <> — turned off by this server's configuration</>}
      </p>
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
    </section>
  );
}
