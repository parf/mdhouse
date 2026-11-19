import { follow } from './PageHead';

type SettingsTab = 'projects' | 'instance';
type SettingsView = SettingsTab | 'access' | 'users' | 'groups';
type AccessDirectory = 'users' | 'groups' | 'projects';

export const accessTitles = { users: 'Users', groups: 'Groups', projects: 'Access' } as const;

export function accessDirectory(params: URLSearchParams): AccessDirectory {
  if (params.get('user')) return 'users';
  if (params.get('group')) return 'groups';
  if (params.get('project')) return 'projects';
  const view = params.get('view');
  return view === 'groups' || view === 'projects' ? view : 'users';
}

export function usersUrl({ user, group, project, view }: {
  user?: string; group?: string; project?: string; view?: AccessDirectory;
} = {}): string {
  if (user) return `/settings/users?user=${encodeURIComponent(user)}`;
  if (group) return `/settings/users?group=${encodeURIComponent(group)}`;
  if (project) return `/settings/users?project=${encodeURIComponent(project)}`;
  return view && view !== 'users' ? `/settings/users?view=${view}` : '/settings/users';
}

export function settingsUrl(view: SettingsTab, project?: string): string {
  if (view !== 'projects') return `/settings?tab=${view}`;
  return project ? `/settings?project=${encodeURIComponent(project)}` : '/settings';
}

const destinations: ReadonlyArray<{ id: SettingsView; label: string; href: string; title?: string; glyph?: string }> = [
  { id: 'projects', label: 'Projects', href: settingsUrl('projects') },
  { id: 'access', label: accessTitles.projects, href: usersUrl({ view: 'projects' }), title: 'Project access' },
  { id: 'users', label: accessTitles.users, href: usersUrl(), glyph: '👤' },
  { id: 'groups', label: accessTitles.groups, href: usersUrl({ view: 'groups' }), glyph: '👥' },
  { id: 'instance', label: 'Instance', href: settingsUrl('instance') },
];

export function SettingsNav({ current, go }: {
  current: SettingsView;
  go: (url: string) => void;
}) {
  return (
    <nav class="settings-nav" aria-label="Settings">
      {destinations.map(({ id, label, href, title, glyph }) => (
        <a key={id} href={href} title={title} aria-current={id === current ? 'page' : undefined} onClick={(event) => follow(event, () => go(href))}>
          {glyph && <span aria-hidden="true">{glyph}</span>}
          {label}
        </a>
      ))}
    </nav>
  );
}
