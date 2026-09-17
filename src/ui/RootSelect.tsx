import type { RootInfo } from './api';

/**
 * The root switcher as a `<select>`, for the two places with no room for a row of chips: the
 * compact sidebar and the top bar left behind when the sidebar is off.
 *
 * With one root there is nothing to switch between and it renders nothing at all — the widget
 * appears exactly when it means something.
 */
export function RootSelect({
  roots,
  rootId,
  onPick,
  className,
}: {
  roots: RootInfo[];
  rootId: string;
  onPick: (id: string) => void;
  className?: string;
}) {
  if (roots.length < 2) return null;

  const current = roots.find((r) => r.id === rootId);
  return (
    <select
      class={`root-select${className ? ` ${className}` : ''}`}
      value={rootId}
      title={current ? `${current.path} — switch root` : 'Switch root'}
      aria-label="Switch root"
      onChange={(e) => onPick((e.target as HTMLSelectElement).value)}
    >
      {roots.map((r) => (
        <option key={r.id} value={r.id} title={r.path}>
          {r.name}
        </option>
      ))}
    </select>
  );
}
