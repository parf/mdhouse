import { follow } from './PageHead';

type SettingsView = 'personal' | 'projects' | 'access' | 'instance';

export function settingsUrl(view: Exclude<SettingsView, 'access'>, project?: string): string {
  if (view !== 'projects') return `/settings?tab=${view}`;
  return project ? `/settings?project=${encodeURIComponent(project)}` : '/settings';
}

const destinations = [
  { id: 'personal', label: 'Personal', href: settingsUrl('personal') },
  { id: 'projects', label: 'Projects', href: settingsUrl('projects') },
  { id: 'access', label: 'Access', href: '/settings/users' },
  { id: 'instance', label: 'Instance', href: settingsUrl('instance') },
] as const;

export function SettingsNav({ current, go, showAccess = true }: {
  current: SettingsView;
  go: (url: string) => void;
  showAccess?: boolean;
}) {
  return (
    <nav class="settings-nav" aria-label="Settings">
      {destinations.filter(({ id }) => id !== 'access' || showAccess).map(({ id, label, href }) => (
        <a key={id} href={href} aria-current={id === current ? 'page' : undefined} onClick={(event) => follow(event, () => go(href))}>
          {label}
        </a>
      ))}
    </nav>
  );
}
